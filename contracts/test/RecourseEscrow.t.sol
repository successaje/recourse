// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {RecourseEscrow} from "../src/RecourseEscrow.sol";
import {Client, IAny2EVMMessageReceiver, IERC165} from "../src/vendor/CCIP.sol";
import {Verdict} from "../src/lib/Verdict.sol";

/// @dev Stands in for the CCIP router: the only address the escrow will take a
///      verdict from. Lets a test deliver an arbitrary message as the router.
contract MockRouter {
    function deliver(address escrow, Client.Any2EVMMessage memory message) external {
        IAny2EVMMessageReceiver(escrow).ccipReceive(message);
    }
}

/// @dev Refuses native transfers, to exercise the payout failure path.
contract RejectingPayee {
    receive() external payable {
        revert("no thanks");
    }
}

contract RecourseEscrowTest is Test {
    RecourseEscrow internal escrow;
    MockRouter internal router;

    uint64 internal constant SEPOLIA = 16015286601757825753;
    address internal constant RELAY = address(0xBEEF);

    uint64 internal constant MIN_WINDOW = 60;
    uint64 internal constant MAX_WINDOW = 7 days;
    uint64 internal constant CHALLENGE_GRACE = 1 hours;
    uint64 internal constant POST_PROOF = 30 minutes;
    uint64 internal constant DISPUTE_TIMEOUT = 2 hours;
    uint16 internal constant BOND_BPS = 1_000; // 10%

    uint256 internal sellerPk = 0xA11CE;
    address internal seller;
    address internal buyer = address(0xB0B);
    address internal stranger = address(0xDEAD);

    bytes32 internal constant PID = keccak256("payment-1");
    bytes32 internal constant SLA_HASH = keccak256("sla-v1");
    bytes32 internal constant RESP_HASH = keccak256('{"pair":"HBAR-USD"}');

    uint256 internal constant AMOUNT = 10 ether;

    function setUp() public {
        seller = vm.addr(sellerPk);
        router = new MockRouter();
        escrow = new RecourseEscrow(
            address(router),
            SEPOLIA,
            RELAY,
            MIN_WINDOW,
            MAX_WINDOW,
            CHALLENGE_GRACE,
            POST_PROOF,
            DISPUTE_TIMEOUT,
            BOND_BPS
        );

        vm.deal(buyer, 100 ether);
        vm.deal(stranger, 100 ether);
        vm.warp(1_788_600_000);
    }

    // ── helpers ──────────────────────────────────────────────────────

    /// @dev Mimics the x402 facilitator settling into the contract.
    function _settle(uint256 amount) internal {
        vm.deal(address(escrow), address(escrow).balance + amount);
    }

    function _sign(bytes32 paymentId, bytes32 responseHash, uint256 pk)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, escrow.receiptDigest(paymentId, responseHash));
        return abi.encodePacked(r, s, v);
    }

    function _bound(bytes32 paymentId, uint256 amount) internal {
        _settle(amount);
        vm.prank(buyer);
        escrow.bind(paymentId, seller, amount, SLA_HASH, MIN_WINDOW);
    }

    function _verdict(bytes32 paymentId, Verdict.Outcome outcome, uint16 reason)
        internal
        pure
        returns (Client.Any2EVMMessage memory)
    {
        return Client.Any2EVMMessage({
            messageId: keccak256("ccip-msg"),
            sourceChainSelector: SEPOLIA,
            sender: abi.encode(RELAY),
            data: Verdict.encode(paymentId, outcome, reason),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
    }

    // ── bind ─────────────────────────────────────────────────────────

    function test_bind_commitsSettledFunds() public {
        _settle(AMOUNT);

        vm.prank(buyer);
        escrow.bind(PID, seller, AMOUNT, SLA_HASH, MIN_WINDOW);

        RecourseEscrow.Payment memory p = escrow.getPayment(PID);
        assertEq(p.buyer, buyer);
        assertEq(p.seller, seller);
        assertEq(p.amount, AMOUNT);
        assertEq(uint8(p.state), uint8(RecourseEscrow.State.Funded));
        assertEq(escrow.totalCommitted(), AMOUNT);
        assertEq(escrow.unboundBalance(), 0);
    }

    /// The invariant the whole Hedera workaround rests on: you cannot bind
    /// money the contract does not actually hold.
    function test_bind_revertsWithoutSettlement() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(RecourseEscrow.InsufficientUnbound.selector, 0, AMOUNT));
        escrow.bind(PID, seller, AMOUNT, SLA_HASH, MIN_WINDOW);
    }

    /// One deposit must not back two payments.
    function test_bind_cannotDoubleSpendOneDeposit() public {
        _settle(AMOUNT);

        vm.prank(buyer);
        escrow.bind(PID, seller, AMOUNT, SLA_HASH, MIN_WINDOW);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(RecourseEscrow.InsufficientUnbound.selector, 0, AMOUNT));
        escrow.bind(keccak256("payment-2"), seller, AMOUNT, SLA_HASH, MIN_WINDOW);
    }

    function test_bind_rejectsReusedPaymentId() public {
        _bound(PID, AMOUNT);
        _settle(AMOUNT);

        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(
                RecourseEscrow.WrongState.selector,
                RecourseEscrow.State.Funded,
                RecourseEscrow.State.None
            )
        );
        escrow.bind(PID, seller, AMOUNT, SLA_HASH, MIN_WINDOW);
    }

    function test_bind_enforcesWindowBounds() public {
        _settle(AMOUNT);

        vm.prank(buyer);
        vm.expectRevert(RecourseEscrow.BadWindow.selector);
        escrow.bind(PID, seller, AMOUNT, SLA_HASH, MIN_WINDOW - 1);

        vm.prank(buyer);
        vm.expectRevert(RecourseEscrow.BadWindow.selector);
        escrow.bind(PID, seller, AMOUNT, SLA_HASH, MAX_WINDOW + 1);
    }

    function test_bind_partialDrawLeavesRemainderUnbound() public {
        _settle(AMOUNT);

        vm.prank(buyer);
        escrow.bind(PID, seller, AMOUNT / 4, SLA_HASH, MIN_WINDOW);

        assertEq(escrow.unboundBalance(), AMOUNT - AMOUNT / 4);
    }

    // ── release ──────────────────────────────────────────────────────

    function test_release_paysSellerAfterWindow() public {
        _bound(PID, AMOUNT);
        vm.warp(block.timestamp + MIN_WINDOW + 1);

        uint256 before = seller.balance;
        escrow.release(PID); // permissionless on purpose

        assertEq(seller.balance - before, AMOUNT);
        assertEq(escrow.totalCommitted(), 0);
        assertEq(uint8(escrow.getPayment(PID).state), uint8(RecourseEscrow.State.Settled));
    }

    function test_release_revertsWhileWindowOpen() public {
        _bound(PID, AMOUNT);

        vm.expectRevert(RecourseEscrow.WindowOpen.selector);
        escrow.release(PID);
    }

    function test_release_cannotRunTwice() public {
        _bound(PID, AMOUNT);
        vm.warp(block.timestamp + MIN_WINDOW + 1);
        escrow.release(PID);

        vm.expectRevert(
            abi.encodeWithSelector(
                RecourseEscrow.WrongState.selector,
                RecourseEscrow.State.Settled,
                RecourseEscrow.State.Funded
            )
        );
        escrow.release(PID);
    }

    // ── dispute ──────────────────────────────────────────────────────

    function test_dispute_acceptsSellerSignedReceipt() public {
        _bound(PID, AMOUNT);
        uint256 bond = escrow.requiredBond(AMOUNT);
        bytes memory sig = _sign(PID, RESP_HASH, sellerPk);

        vm.prank(buyer);
        escrow.dispute{value: bond}(PID, RESP_HASH, sig);

        RecourseEscrow.Payment memory p = escrow.getPayment(PID);
        assertEq(uint8(p.state), uint8(RecourseEscrow.State.Disputed));
        assertEq(p.responseHash, RESP_HASH);
        assertEq(p.bond, bond);
        assertEq(escrow.totalCommitted(), AMOUNT + bond);
    }

    /// A buyer cannot invent a receipt: the hash is fixed by the seller's key.
    function test_dispute_rejectsForgedSignature() public {
        _bound(PID, AMOUNT);
        uint256 bond = escrow.requiredBond(AMOUNT);
        bytes memory forged = _sign(PID, RESP_HASH, 0xBADBAD);

        vm.prank(buyer);
        vm.expectRevert(RecourseEscrow.BadSignature.selector);
        escrow.dispute{value: bond}(PID, RESP_HASH, forged);
    }

    /// A receipt for one response must not be replayable against another.
    function test_dispute_rejectsReceiptForDifferentResponse() public {
        _bound(PID, AMOUNT);
        bytes memory sig = _sign(PID, RESP_HASH, sellerPk);
        uint256 bond = escrow.requiredBond(AMOUNT);

        vm.prank(buyer);
        vm.expectRevert(RecourseEscrow.BadSignature.selector);
        escrow.dispute{value: bond}(PID, keccak256("other"), sig);
    }

    function test_dispute_requiresBond() public {
        _bound(PID, AMOUNT);
        uint256 bond = escrow.requiredBond(AMOUNT);
        bytes memory sig = _sign(PID, RESP_HASH, sellerPk);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(RecourseEscrow.BondTooSmall.selector, bond - 1, bond));
        escrow.dispute{value: bond - 1}(PID, RESP_HASH, sig);
    }

    function test_dispute_onlyBuyer() public {
        _bound(PID, AMOUNT);

        uint256 bond = escrow.requiredBond(AMOUNT);
        bytes memory sig = _sign(PID, RESP_HASH, sellerPk);

        vm.prank(stranger);
        vm.expectRevert(RecourseEscrow.NotBuyer.selector);
        escrow.dispute{value: bond}(PID, RESP_HASH, sig);
    }

    function test_dispute_revertsAfterWindow() public {
        _bound(PID, AMOUNT);
        uint256 bond = escrow.requiredBond(AMOUNT);
        bytes memory sig = _sign(PID, RESP_HASH, sellerPk);
        vm.warp(block.timestamp + MIN_WINDOW + 1);

        vm.prank(buyer);
        vm.expectRevert(RecourseEscrow.WindowClosed.selector);
        escrow.dispute{value: bond}(PID, RESP_HASH, sig);
    }

    // ── receipt challenge round ──────────────────────────────────────

    /// The withholding attack: seller delivers rubbish, never signs, waits for release.
    function test_challenge_refundsBuyerWhenSellerStaysSilent() public {
        _bound(PID, AMOUNT);

        vm.prank(buyer);
        escrow.challengeReceipt(PID);

        vm.warp(block.timestamp + CHALLENGE_GRACE + 1);

        uint256 before = buyer.balance;
        escrow.resolveChallenge(PID);

        assertEq(buyer.balance - before, AMOUNT);
        assertEq(escrow.totalCommitted(), 0);
    }

    function test_challenge_sellerCanProveDeliveryAndReopenWindow() public {
        _bound(PID, AMOUNT);

        bytes memory sig = _sign(PID, RESP_HASH, sellerPk);
        uint256 bond = escrow.requiredBond(AMOUNT);

        vm.prank(buyer);
        escrow.challengeReceipt(PID);

        vm.prank(seller);
        escrow.proveDelivery(PID, RESP_HASH, sig);

        RecourseEscrow.Payment memory p = escrow.getPayment(PID);
        assertEq(uint8(p.state), uint8(RecourseEscrow.State.Funded));
        assertEq(p.deadline, uint64(block.timestamp) + POST_PROOF);

        // The buyer only just saw the receipt, so they still get to dispute on merit.
        vm.prank(buyer);
        escrow.dispute{value: bond}(PID, RESP_HASH, sig);
        assertEq(uint8(escrow.getPayment(PID).state), uint8(RecourseEscrow.State.Disputed));
    }

    function test_challenge_cannotBeReopened() public {
        _bound(PID, AMOUNT);

        bytes memory sig = _sign(PID, RESP_HASH, sellerPk);

        vm.prank(buyer);
        escrow.challengeReceipt(PID);

        vm.prank(seller);
        escrow.proveDelivery(PID, RESP_HASH, sig);

        vm.prank(buyer);
        vm.expectRevert(RecourseEscrow.AlreadyChallenged.selector);
        escrow.challengeReceipt(PID);
    }

    function test_proveDelivery_revertsAfterGrace() public {
        _bound(PID, AMOUNT);

        bytes memory sig = _sign(PID, RESP_HASH, sellerPk);

        vm.prank(buyer);
        escrow.challengeReceipt(PID);
        vm.warp(block.timestamp + CHALLENGE_GRACE + 1);

        vm.prank(seller);
        vm.expectRevert(RecourseEscrow.WindowClosed.selector);
        escrow.proveDelivery(PID, RESP_HASH, sig);
    }

    function test_resolveChallenge_revertsDuringGrace() public {
        _bound(PID, AMOUNT);

        vm.prank(buyer);
        escrow.challengeReceipt(PID);

        vm.expectRevert(RecourseEscrow.WindowOpen.selector);
        escrow.resolveChallenge(PID);
    }

    function test_challenge_onlyBuyer() public {
        _bound(PID, AMOUNT);

        vm.prank(stranger);
        vm.expectRevert(RecourseEscrow.NotBuyer.selector);
        escrow.challengeReceipt(PID);
    }

    // ── verdict arrival ──────────────────────────────────────────────

    function _openDispute() internal returns (uint256 bond) {
        _bound(PID, AMOUNT);
        bond = escrow.requiredBond(AMOUNT);
        bytes memory sig = _sign(PID, RESP_HASH, sellerPk);
        vm.prank(buyer);
        escrow.dispute{value: bond}(PID, RESP_HASH, sig);
    }

    function test_verdict_approvePaysSellerAndSlashesBond() public {
        uint256 bond = _openDispute();
        uint256 before = seller.balance;

        router.deliver(address(escrow), _verdict(PID, Verdict.Outcome.Approve, Verdict.REASON_OK));

        assertEq(seller.balance - before, AMOUNT + bond);
        assertEq(escrow.totalCommitted(), 0);
    }

    function test_verdict_rejectRefundsBuyerWithBond() public {
        uint256 bond = _openDispute();
        uint256 before = buyer.balance;

        router.deliver(
            address(escrow), _verdict(PID, Verdict.Outcome.Reject, Verdict.ASSERTION_OFFSET + 2)
        );

        assertEq(buyer.balance - before, AMOUNT + bond);
        assertEq(escrow.totalCommitted(), 0);
    }

    function test_verdict_rejectsNonRouterCaller() public {
        _openDispute();

        vm.prank(stranger);
        vm.expectRevert();
        escrow.ccipReceive(_verdict(PID, Verdict.Outcome.Approve, Verdict.REASON_OK));
    }

    function test_verdict_rejectsWrongSourceChain() public {
        _openDispute();
        Client.Any2EVMMessage memory m = _verdict(PID, Verdict.Outcome.Approve, Verdict.REASON_OK);
        m.sourceChainSelector = 1;

        vm.expectRevert(
            abi.encodeWithSelector(RecourseEscrow.UnknownSourceChain.selector, uint64(1), SEPOLIA)
        );
        router.deliver(address(escrow), m);
    }

    function test_verdict_rejectsUnknownSender() public {
        _openDispute();
        Client.Any2EVMMessage memory m = _verdict(PID, Verdict.Outcome.Approve, Verdict.REASON_OK);
        m.sender = abi.encode(stranger);

        vm.expectRevert(
            abi.encodeWithSelector(RecourseEscrow.UnknownSender.selector, stranger, RELAY)
        );
        router.deliver(address(escrow), m);
    }

    /// A zero-filled payload must not decode as a valid outcome.
    function test_verdict_rejectsNoneOutcome() public {
        _openDispute();
        Client.Any2EVMMessage memory m = _verdict(PID, Verdict.Outcome.Approve, Verdict.REASON_OK);
        m.data = abi.encode(PID, uint8(0), uint16(0));

        vm.expectRevert(bytes("Verdict: bad outcome"));
        router.deliver(address(escrow), m);
    }

    function test_verdict_rejectsUndisputedPayment() public {
        _bound(PID, AMOUNT);

        vm.expectRevert(
            abi.encodeWithSelector(
                RecourseEscrow.WrongState.selector,
                RecourseEscrow.State.Funded,
                RecourseEscrow.State.Disputed
            )
        );
        router.deliver(address(escrow), _verdict(PID, Verdict.Outcome.Approve, Verdict.REASON_OK));
    }

    // ── payout failure ───────────────────────────────────────────────

    function test_release_revertsIfSellerRejectsPayment() public {
        RejectingPayee payee = new RejectingPayee();
        _settle(AMOUNT);

        vm.prank(buyer);
        escrow.bind(PID, address(payee), AMOUNT, SLA_HASH, MIN_WINDOW);
        vm.warp(block.timestamp + MIN_WINDOW + 1);

        vm.expectRevert(RecourseEscrow.TransferFailed.selector);
        escrow.release(PID);
    }

    // ── solvency ─────────────────────────────────────────────────────

    /// Committed funds must always be backed by real balance, on every path.
    function test_solvency_holdsAcrossFullLifecycle() public {
        bytes32 a = keccak256("a");
        bytes32 b = keccak256("b");

        _bound(a, AMOUNT);
        assertLe(escrow.totalCommitted(), address(escrow).balance);

        _bound(b, AMOUNT * 2);
        assertLe(escrow.totalCommitted(), address(escrow).balance);

        uint256 bond = escrow.requiredBond(AMOUNT);
        bytes memory sigA = _sign(a, RESP_HASH, sellerPk);
        vm.prank(buyer);
        escrow.dispute{value: bond}(a, RESP_HASH, sigA);
        assertLe(escrow.totalCommitted(), address(escrow).balance);

        router.deliver(address(escrow), _verdict(a, Verdict.Outcome.Reject, 101));
        assertLe(escrow.totalCommitted(), address(escrow).balance);

        vm.warp(block.timestamp + MIN_WINDOW + 1);
        escrow.release(b);
        assertEq(escrow.totalCommitted(), 0);
        assertEq(address(escrow).balance, 0);
    }

    function testFuzz_bindNeverExceedsBalance(uint96 settled, uint96 requested) public {
        vm.assume(settled > 0 && requested > 0);
        _settle(settled);

        vm.prank(buyer);
        if (requested > settled) {
            vm.expectRevert(
                abi.encodeWithSelector(
                    RecourseEscrow.InsufficientUnbound.selector, uint256(settled), uint256(requested)
                )
            );
            escrow.bind(PID, seller, requested, SLA_HASH, MIN_WINDOW);
        } else {
            escrow.bind(PID, seller, requested, SLA_HASH, MIN_WINDOW);
            assertLe(escrow.totalCommitted(), address(escrow).balance);
        }
    }

    // ── stale dispute ────────────────────────────────────────────────

    /// The one state that previously had no way out: a dispute nobody adjudicates.
    function test_staleDispute_refundsBuyerWithBondAfterTimeout() public {
        uint256 bond = _openDispute();
        uint256 before = buyer.balance;

        vm.warp(block.timestamp + DISPUTE_TIMEOUT + 1);
        escrow.resolveStaleDispute(PID); // permissionless

        assertEq(buyer.balance - before, AMOUNT + bond);
        assertEq(escrow.totalCommitted(), 0);
        assertEq(address(escrow).balance, 0);
        assertEq(uint8(escrow.getPayment(PID).state), uint8(RecourseEscrow.State.Settled));
    }

    function test_staleDispute_revertsWhileVerdictStillDue() public {
        _openDispute();
        uint64 due = escrow.getPayment(PID).deadline;

        vm.expectRevert(abi.encodeWithSelector(RecourseEscrow.VerdictPending.selector, due));
        escrow.resolveStaleDispute(PID);
    }

    function test_staleDispute_rejectsUndisputedPayment() public {
        _bound(PID, AMOUNT);
        vm.warp(block.timestamp + DISPUTE_TIMEOUT + 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                RecourseEscrow.WrongState.selector,
                RecourseEscrow.State.Funded,
                RecourseEscrow.State.Disputed
            )
        );
        escrow.resolveStaleDispute(PID);
    }

    function test_staleDispute_cannotRunTwice() public {
        _openDispute();
        vm.warp(block.timestamp + DISPUTE_TIMEOUT + 1);
        escrow.resolveStaleDispute(PID);

        vm.expectRevert(
            abi.encodeWithSelector(
                RecourseEscrow.WrongState.selector,
                RecourseEscrow.State.Settled,
                RecourseEscrow.State.Disputed
            )
        );
        escrow.resolveStaleDispute(PID);
    }

    /// Opening a dispute must not shorten the wait by inheriting the old window.
    function test_dispute_setsVerdictDeadlineNotDisputeWindow() public {
        _bound(PID, AMOUNT);
        uint256 bond = escrow.requiredBond(AMOUNT);
        bytes memory sig = _sign(PID, RESP_HASH, sellerPk);

        vm.prank(buyer);
        escrow.dispute{value: bond}(PID, RESP_HASH, sig);

        assertEq(escrow.getPayment(PID).deadline, uint64(block.timestamp) + DISPUTE_TIMEOUT);
    }

    /// A verdict that lands after the timeout still settles, as long as nobody
    /// resolved the payment first.
    function test_verdict_lateArrivalStillSettles() public {
        uint256 bond = _openDispute();
        uint256 before = seller.balance;

        vm.warp(block.timestamp + DISPUTE_TIMEOUT + 1);
        router.deliver(address(escrow), _verdict(PID, Verdict.Outcome.Approve, Verdict.REASON_OK));

        assertEq(seller.balance - before, AMOUNT + bond);
        assertEq(escrow.totalCommitted(), 0);
    }

    /// Once the buyer has been refunded, a straggling verdict cannot pay the seller too.
    function test_verdict_cannotSettleAlreadyTimedOutDispute() public {
        _openDispute();
        vm.warp(block.timestamp + DISPUTE_TIMEOUT + 1);
        escrow.resolveStaleDispute(PID);

        vm.expectRevert(
            abi.encodeWithSelector(
                RecourseEscrow.WrongState.selector,
                RecourseEscrow.State.Settled,
                RecourseEscrow.State.Disputed
            )
        );
        router.deliver(address(escrow), _verdict(PID, Verdict.Outcome.Approve, Verdict.REASON_OK));
    }

    // ── router discoverability ───────────────────────────────────────

    /// The CCIP router staticcalls this before delivering. An address that
    /// reverts is treated as a plain account: the delivery is skipped and the
    /// message is still marked executed, so the verdict vanishes with nothing
    /// reporting a failure. A live deployment lost a verdict exactly this way.
    function test_supportsInterface_answersForCcipReceiver() public view {
        assertTrue(escrow.supportsInterface(type(IAny2EVMMessageReceiver).interfaceId));
        assertTrue(escrow.supportsInterface(type(IERC165).interfaceId));
        assertFalse(escrow.supportsInterface(0xdeadbeef));
    }

    /// Pins the constant the router actually uses, so a signature change to
    /// `ccipReceive` cannot quietly make the escrow undeliverable again.
    function test_supportsInterface_matchesTheRouterConstant() public view {
        assertEq(type(IAny2EVMMessageReceiver).interfaceId, bytes4(0x85572ffb));
        assertTrue(escrow.supportsInterface(0x85572ffb));
    }
}
