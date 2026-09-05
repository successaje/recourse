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

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/// @title CCIPReceiverBase
/// @notice Accepts messages from the local CCIP router only.
/// @dev Sender authentication (which contract on which chain) is deliberately
///      left to the subclass — the router proves the message crossed CCIP, not
///      that it came from someone we trust.
///
///      `supportsInterface` is not optional. Before delivering, the CCIP router
///      staticcalls it to decide whether the receiver is a CCIP receiver at all;
///      an address that reverts is treated as a plain account, the delivery is
///      skipped, and the message is still recorded as executed successfully. The
///      message is then gone, with nothing anywhere reporting a failure. An
///      earlier deployment omitted this and lost a verdict exactly that way.
abstract contract CCIPReceiverBase is IAny2EVMMessageReceiver, IERC165 {
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

    /// @inheritdoc IERC165
    /// @dev Must answer true for `IAny2EVMMessageReceiver` or the router will
    ///      never call this contract.
    function supportsInterface(bytes4 interfaceId) public pure virtual override returns (bool) {
        return interfaceId == type(IAny2EVMMessageReceiver).interfaceId
            || interfaceId == type(IERC165).interfaceId;
    }
}
