// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VerdictRelay} from "../src/VerdictRelay.sol";

/// @notice Deploys the verdict relay to Ethereum Sepolia.
///
/// @dev Sepolia rather than Hedera because CRE cannot write to Hedera — it is absent
///      from every chain a CRE tenant can target, so there is no forwarder there for
///      `writeReport` to reach.
///
///      The escrow address is left unset at construction: deployment is circular, since
///      the escrow needs this relay's address and this relay needs the escrow's. Wire it
///      up with `setDestination` once the Hedera side exists.
///
///      Usage:
///        forge script script/DeployRelay.s.sol:DeployRelay \
///          --rpc-url sepolia --broadcast
contract DeployRelay is Script {
    /// @dev CRE KeystoneForwarder (mock) on Sepolia. This is the address
    ///      `cre workflow simulate --broadcast` delivers reports through, so it is what
    ///      we can actually exercise without deployment access. Switch it with
    ///      `setForwarder` when moving to the production forwarder
    ///      (0xF8344CFd5c43616a4366C34E3EEE75af79a74482).
    address constant CRE_FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;

    /// @dev CCIP router on Sepolia, verified live: `isChainSupported` returns true for
    ///      the Hedera testnet selector below.
    address constant CCIP_ROUTER = 0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59;

    /// @dev Hedera testnet. Its router self-reports as "Router 1.2.0".
    uint64 constant HEDERA_TESTNET_SELECTOR = 222782988166878823;

    /// @dev Allowance for `_ccipReceive` on the destination: one storage-heavy state
    ///      transition plus a native transfer to the winner.
    uint256 constant DEST_GAS_LIMIT = 300_000;

    function run() external returns (VerdictRelay relay) {
        uint256 pk = vm.envUint("CRE_ETH_PRIVATE_KEY");
        address escrow = vm.envOr("ESCROW_ADDRESS", address(0));

        vm.startBroadcast(pk);
        relay = new VerdictRelay(
            CRE_FORWARDER, CCIP_ROUTER, HEDERA_TESTNET_SELECTOR, escrow, DEST_GAS_LIMIT
        );
        vm.stopBroadcast();

        console2.log("VerdictRelay deployed:", address(relay));
        console2.log("  forwarder:          ", CRE_FORWARDER);
        console2.log("  ccip router:        ", CCIP_ROUTER);
        console2.log("  destination escrow: ", escrow);
    }
}
