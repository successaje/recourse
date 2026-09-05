// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Client, IRouterClient} from "./vendor/CCIP.sol";
import {CREReceiver} from "./vendor/CREReceiver.sol";
import {Verdict} from "./lib/Verdict.sol";

/// @title VerdictRelay
/// @notice Receives an adjudication report from the CRE enclave on Ethereum Sepolia
///         and forwards it to the Recourse escrow on Hedera over CCIP.
///
/// @dev This contract exists because CRE cannot write to Hedera: Hedera appears in
///      none of the chains a CRE tenant can target, so there is no forwarder there for
///      `writeReport` to reach. Sepolia has one, and Sepolia has a live CCIP lane to
///      Hedera testnet (confirmed on-chain: the Sepolia router returns true for
///      `isChainSupported(222782988166878823)`).
///
///      Nothing here is trusted. The DON signatures were verified by the forwarder
///      before `onReport` was reached, and the escrow independently checks that the
///      CCIP message originated from this contract on this chain.
contract VerdictRelay is CREReceiver {
    /// @notice Hedera testnet chain selector.
    uint64 public destinationChainSelector;
    /// @notice RecourseEscrow on the destination chain.
    address public escrow;
    /// @notice Gas allowance for `ccipReceive` on the destination.
    uint256 public destinationGasLimit;

    IRouterClient public immutable router;

    error UnsupportedDestination(uint64 selector);
    error InsufficientFee(uint256 balance, uint256 required);
    error WithdrawFailed();

    event VerdictForwarded(
        bytes32 indexed paymentId,
        Verdict.Outcome outcome,
        uint16 reasonCode,
        bytes32 ccipMessageId,
        uint256 fee
    );
    event DestinationUpdated(uint64 selector, address escrow, uint256 gasLimit);
    event FeeFunded(address indexed from, uint256 amount);

    constructor(
        address forwarder,
        address _router,
        uint64 _destinationChainSelector,
        address _escrow,
        uint256 _destinationGasLimit
    ) CREReceiver(forwarder) {
        require(_router != address(0), "relay: zero router");
        router = IRouterClient(_router);
        destinationChainSelector = _destinationChainSelector;
        escrow = _escrow;
        destinationGasLimit = _destinationGasLimit;
        emit DestinationUpdated(_destinationChainSelector, _escrow, _destinationGasLimit);
    }

    /// @notice Point the relay at a destination escrow.
    /// @dev Separate from the constructor because deployment is circular: the escrow
    ///      needs this relay's address, and this relay needs the escrow's.
    function setDestination(uint64 selector, address _escrow, uint256 gasLimit) external onlyOwner {
        require(_escrow != address(0), "relay: zero escrow");
        destinationChainSelector = selector;
        escrow = _escrow;
        destinationGasLimit = gasLimit;
        emit DestinationUpdated(selector, _escrow, gasLimit);
    }

    /// @notice Quote the CCIP fee for a verdict, in the chain's native token.
    function quote(bytes32 paymentId, Verdict.Outcome outcome, uint16 reasonCode)
        public
        view
        returns (uint256)
    {
        return router.getFee(destinationChainSelector, _message(paymentId, outcome, reasonCode));
    }

    /// @inheritdoc CREReceiver
    /// @param report ABI-encoded (bytes32 paymentId, uint8 outcome, uint16 reasonCode)
    /// @dev Fees are paid from this contract's own balance, so it must be kept funded.
    ///      Reverting on an empty balance is deliberate: CRE retries a failed report,
    ///      so a verdict is delayed rather than lost.
    function _processReport(bytes calldata report) internal override {
        (bytes32 paymentId, Verdict.Outcome outcome, uint16 reasonCode) = Verdict.decode(report);

        if (!router.isChainSupported(destinationChainSelector)) {
            revert UnsupportedDestination(destinationChainSelector);
        }

        Client.EVM2AnyMessage memory message = _message(paymentId, outcome, reasonCode);
        uint256 fee = router.getFee(destinationChainSelector, message);
        if (address(this).balance < fee) revert InsufficientFee(address(this).balance, fee);

        bytes32 messageId = router.ccipSend{value: fee}(destinationChainSelector, message);
        emit VerdictForwarded(paymentId, outcome, reasonCode, messageId, fee);
    }

    function _message(bytes32 paymentId, Verdict.Outcome outcome, uint16 reasonCode)
        private
        view
        returns (Client.EVM2AnyMessage memory)
    {
        return Client.EVM2AnyMessage({
            receiver: abi.encode(escrow),
            data: Verdict.encode(paymentId, outcome, reasonCode),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            feeToken: address(0), // native ETH on Sepolia
            extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({gasLimit: destinationGasLimit}))
        });
    }

    /// @notice Top up the balance used to pay CCIP fees.
    function fund() external payable {
        emit FeeFunded(msg.sender, msg.value);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
    }

    receive() external payable {
        emit FeeFunded(msg.sender, msg.value);
    }
}
