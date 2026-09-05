// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {RecourseEscrow} from "../src/RecourseEscrow.sol";

/// @notice Deploys the escrow to Hedera testnet and points it at the Sepolia relay.
///
/// @dev Usage:
///        forge script script/DeployEscrow.s.sol:DeployEscrow \
///          --rpc-url hedera_testnet --broadcast --slow
contract DeployEscrow is Script {
    /// @dev CCIP router on Hedera testnet. Self-reports as "Router 1.2.0".
    address constant CCIP_ROUTER = 0x802C5F84eAD128Ff36fD6a3f8a418e339f467Ce4;

    /// @dev Ethereum Sepolia — where the CRE forwarder verifies DON signatures and
    ///      the relay lives. Verdicts are accepted from that chain and no other.
    uint64 constant SEPOLIA_SELECTOR = 16015286601757825753;

    /// @dev Shortest and longest dispute window a buyer may bind to.
    uint64 constant MIN_WINDOW = 60;
    uint64 constant MAX_WINDOW = 7 days;

    /// @dev Seller's time to answer a receipt challenge, and the buyer's fresh window
    ///      after one is answered — the buyer has only just seen the receipt, so they
    ///      still need a chance to dispute the response on its merits.
    uint64 constant CHALLENGE_GRACE = 1 hours;
    uint64 constant POST_PROOF_WINDOW = 30 minutes;

    /// @dev How long a dispute waits for a verdict before anyone may refund the buyer.
    ///      Generous on purpose: it has to cover a CRE run plus CCIP finality from
    ///      Sepolia to Hedera, and a seller that might have won loses when it fires.
    ///      Tighten once the end-to-end path has been measured rather than guessed.
    uint64 constant DISPUTE_TIMEOUT = 6 hours;

    /// @dev Dispute bond, as a fraction of the payment. Enough to make frivolous
    ///      disputes cost something without pricing out a genuine one.
    uint16 constant BOND_BPS = 1_000; // 10%

    function run() external returns (RecourseEscrow escrow) {
        uint256 pk = vm.envUint("CRE_ETH_PRIVATE_KEY");
        address relay = vm.envAddress("RELAY_ADDRESS");

        vm.startBroadcast(pk);
        escrow = new RecourseEscrow(
            CCIP_ROUTER,
            SEPOLIA_SELECTOR,
            relay,
            MIN_WINDOW,
            MAX_WINDOW,
            CHALLENGE_GRACE,
            POST_PROOF_WINDOW,
            DISPUTE_TIMEOUT,
            BOND_BPS
        );
        vm.stopBroadcast();

        console2.log("RecourseEscrow deployed:", address(escrow));
        console2.log("  ccip router:   ", CCIP_ROUTER);
        console2.log("  verdict relay: ", relay);
        console2.log("  dispute timeout (s):", DISPUTE_TIMEOUT);
    }
}
