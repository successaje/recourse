// SPDX-License-Identifier: MIT
// Minimal CCIP surface, matching the shapes the live routers already expose.
// Verified against Sepolia router 0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59 and
// Hedera testnet router 0x802C5F84eAD128Ff36fD6a3f8a418e339f467Ce4 ("Router 1.2.0").
// Declared locally rather than pulled in as a dependency: Recourse needs three
// calls, and the full CCIP package drags in a large tree we would not otherwise use.
pragma solidity 0.8.24;

library Client {
    struct EVMTokenAmount {
        address token;
        uint256 amount;
    }

    struct Any2EVMMessage {
        bytes32 messageId;
        uint64 sourceChainSelector;
        bytes sender; // abi-encoded sender address on the source chain
        bytes data;
        EVMTokenAmount[] destTokenAmounts;
    }

    struct EVM2AnyMessage {
        bytes receiver; // abi-encoded receiver address on the destination chain
        bytes data;
        EVMTokenAmount[] tokenAmounts;
        address feeToken; // address(0) pays the fee in the chain's native token
        bytes extraArgs;
    }

    // bytes4(keccak256("CCIP EVMExtraArgsV1"));
    bytes4 internal constant EVM_EXTRA_ARGS_V1_TAG = 0x97a657c9;

    struct EVMExtraArgsV1 {
        uint256 gasLimit;
    }

    function _argsToBytes(EVMExtraArgsV1 memory extraArgs) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(EVM_EXTRA_ARGS_V1_TAG, extraArgs);
    }
}

interface IRouterClient {
    error UnsupportedDestinationChain(uint64 destChainSelector);
    error InsufficientFeeTokenAmount();
    error InvalidMsgValue();

    function isChainSupported(uint64 destChainSelector) external view returns (bool supported);

    function getFee(uint64 destinationChainSelector, Client.EVM2AnyMessage memory message)
        external
        view
        returns (uint256 fee);

    function ccipSend(uint64 destinationChainSelector, Client.EVM2AnyMessage calldata message)
        external
        payable
        returns (bytes32);
}

interface IAny2EVMMessageReceiver {
    function ccipReceive(Client.Any2EVMMessage calldata message) external;
}

/// @title CCIPReceiverBase
/// @notice Accepts messages from the local CCIP router only.
/// @dev Sender authentication (which contract on which chain) is deliberately
///      left to the subclass — the router proves the message crossed CCIP, not
///      that it came from someone we trust.
abstract contract CCIPReceiverBase is IAny2EVMMessageReceiver {
    address internal immutable i_ccipRouter;

    error InvalidRouter(address caller, address expected);

    constructor(address router) {
        require(router != address(0), "CCIP: zero router");
        i_ccipRouter = router;
    }

    modifier onlyRouter() {
        if (msg.sender != i_ccipRouter) revert InvalidRouter(msg.sender, i_ccipRouter);
        _;
    }

    function getRouter() external view returns (address) {
        return i_ccipRouter;
    }

    /// @inheritdoc IAny2EVMMessageReceiver
    function ccipReceive(Client.Any2EVMMessage calldata message) external override onlyRouter {
        _ccipReceive(message);
    }

    function _ccipReceive(Client.Any2EVMMessage memory message) internal virtual;
}
