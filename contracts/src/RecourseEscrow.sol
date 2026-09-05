// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Client, CCIPReceiverBase} from "./vendor/CCIP.sol";
import {Verdict} from "./lib/Verdict.sol";

/// @title RecourseEscrow
/// @notice Holds an x402 payment on Hedera until either the claim window lapses
///         or a dispute is adjudicated inside a Chainlink CRE enclave.
///
/// @dev Two platform constraints shape this contract, both verified rather than assumed:
///
///      1. On Hedera a native `TransferTransaction` credits a contract's balance
///         WITHOUT invoking `receive()` or `fallback()`. The x402 facilitator settles
///         that way, so the contract cannot be notified by the payment itself.
///         Funding and terms are therefore separate: the facilitator settles into
///         this address, then the buyer calls `bind()`, which may only commit funds
///         the contract can prove it already holds (see `unboundBalance`).
///
///      2. CRE cannot write to Hedera — it is absent from every supported chain.
///         Verdicts arrive over CCIP from a relay on Ethereum Sepolia, which is
///         where the CRE forwarder verified the DON signatures.
contract RecourseEscrow is CCIPReceiverBase, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    enum State {
        None,
        Funded,
        Disputed,
        ReceiptChallenged,
        Settled
    }

    struct Payment {
        address buyer;
        address seller;
        uint256 amount;
        uint256 bond;
        bytes32 slaHash;
        bytes32 responseHash;
        uint64 deadline; // dispute window, or challenge grace while ReceiptChallenged
        bool wasChallenged; // one challenge round only, so the two cannot ping-pong
        State state;
    }

    /// @notice Sum of every escrowed amount and posted bond currently owed to someone.
    /// @dev `address(this).balance - totalCommitted` is what an incoming settlement
    ///      has added but nobody has claimed yet. `bind` may only draw from that.
    uint256 public totalCommitted;

    mapping(bytes32 => Payment) private s_payments;

    // ── Cross-chain verdict provenance ──────────────────────────────
    uint64 public immutable sourceChainSelector; // Ethereum Sepolia
    address public immutable verdictRelay; // the relay contract on that chain

    // ── Timing and bond policy ──────────────────────────────────────
    uint64 public immutable minWindow;
    uint64 public immutable maxWindow;
    uint64 public immutable challengeGrace; // seller's time to prove delivery
    uint64 public immutable postProofWindow; // buyer's time to dispute after a proof
    uint16 public immutable bondBps; // bond as a fraction of the amount

    uint16 private constant BPS = 10_000;

    error NotBuyer();
    error NotFound();
    error WrongState(State actual, State expected);
    error WindowClosed();
    error WindowOpen();
    error InsufficientUnbound(uint256 available, uint256 requested);
    error BadWindow();
    error BondTooSmall(uint256 sent, uint256 required);
    error BadSignature();
    error AlreadyChallenged();
    error UnknownSourceChain(uint64 received, uint64 expected);
    error UnknownSender(address received, address expected);
    error TransferFailed();

    event Bound(
        bytes32 indexed paymentId,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        bytes32 slaHash,
        uint64 deadline
    );
    event DisputeOpened(
        bytes32 indexed paymentId, bytes32 indexed slaHash, bytes32 responseHash, uint256 bond
    );
    event ReceiptChallengeOpened(bytes32 indexed paymentId, uint64 graceEnds);
    event DeliveryProven(bytes32 indexed paymentId, bytes32 responseHash, uint64 newDeadline);
    event Settled(
        bytes32 indexed paymentId, address indexed paidTo, uint256 amount, uint16 reasonCode
    );
    event VerdictReceived(
        bytes32 indexed paymentId, Verdict.Outcome outcome, uint16 reasonCode, bytes32 ccipMessageId
    );

    constructor(
        address router,
        uint64 _sourceChainSelector,
        address _verdictRelay,
        uint64 _minWindow,
        uint64 _maxWindow,
        uint64 _challengeGrace,
        uint64 _postProofWindow,
        uint16 _bondBps
    ) CCIPReceiverBase(router) {
        require(_verdictRelay != address(0), "escrow: zero relay");
        require(_minWindow > 0 && _maxWindow >= _minWindow, "escrow: bad window bounds");
        require(_bondBps <= BPS, "escrow: bond > 100%");
        sourceChainSelector = _sourceChainSelector;
        verdictRelay = _verdictRelay;
        minWindow = _minWindow;
        maxWindow = _maxWindow;
        challengeGrace = _challengeGrace;
        postProofWindow = _postProofWindow;
        bondBps = _bondBps;
    }

    // ─────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────

    function getPayment(bytes32 paymentId) external view returns (Payment memory) {
        return s_payments[paymentId];
    }

    /// @notice Funds held by this contract that are not owed to anyone yet.
    function unboundBalance() public view returns (uint256) {
        return address(this).balance - totalCommitted;
    }

    /// @notice Bond required to open a dispute on a given amount.
    function requiredBond(uint256 amount) public view returns (uint256) {
        return (amount * bondBps) / BPS;
    }

    /// @notice The digest a seller signs to acknowledge what it delivered.
    /// @dev Domain-separated by contract and chain so a receipt cannot be replayed
    ///      against another deployment. The seller service must sign exactly this.
    function receiptDigest(bytes32 paymentId, bytes32 responseHash) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), block.chainid, paymentId, responseHash))
            .toEthSignedMessageHash();
    }

    // ─────────────────────────────────────────────────────────────────
    // Funding
    // ─────────────────────────────────────────────────────────────────

    /// @notice Attach terms to a settlement that has already landed in this contract.
    /// @dev Callable only by the buyer. The griefing case — someone else binding your
    ///      deposit to terms you did not agree — is closed by that restriction, and the
    ///      seller independently checks the bound terms before serving the response.
    function bind(
        bytes32 paymentId,
        address seller,
        uint256 amount,
        bytes32 slaHash,
        uint64 window
    ) external nonReentrant {
        Payment storage p = s_payments[paymentId];
        if (p.state != State.None) revert WrongState(p.state, State.None);
        if (window < minWindow || window > maxWindow) revert BadWindow();
        require(seller != address(0) && amount > 0, "escrow: bad terms");

        uint256 available = unboundBalance();
        if (available < amount) revert InsufficientUnbound(available, amount);

        totalCommitted += amount;

        uint64 deadline = uint64(block.timestamp) + window;
        p.buyer = msg.sender;
        p.seller = seller;
        p.amount = amount;
        p.slaHash = slaHash;
        p.deadline = deadline;
        p.state = State.Funded;

        emit Bound(paymentId, msg.sender, seller, amount, slaHash, deadline);
    }

    // ─────────────────────────────────────────────────────────────────
    // Happy path
    // ─────────────────────────────────────────────────────────────────

    /// @notice Pay the seller once the dispute window has lapsed untouched.
    /// @dev Permissionless: anyone may trigger it, the funds only ever go to the seller.
    function release(bytes32 paymentId) external nonReentrant {
        Payment storage p = _get(paymentId);
        if (p.state != State.Funded) revert WrongState(p.state, State.Funded);
        if (block.timestamp <= p.deadline) revert WindowOpen();

        uint256 amount = p.amount;
        p.state = State.Settled;
        totalCommitted -= amount;

        _pay(p.seller, amount);
        emit Settled(paymentId, p.seller, amount, Verdict.REASON_OK);
    }

    // ─────────────────────────────────────────────────────────────────
    // Dispute path
    // ─────────────────────────────────────────────────────────────────

    /// @notice Contest a response, presenting the seller's own signed receipt.
    /// @dev The seller fixes the hash by signing it; the buyer supplies the bytes.
    ///      Neither can move without the other, so neither can fabricate the evidence.
    function dispute(bytes32 paymentId, bytes32 responseHash, bytes calldata sellerSig)
        external
        payable
        nonReentrant
    {
        Payment storage p = _get(paymentId);
        if (msg.sender != p.buyer) revert NotBuyer();
        if (p.state != State.Funded) revert WrongState(p.state, State.Funded);
        if (block.timestamp > p.deadline) revert WindowClosed();

        uint256 bond = requiredBond(p.amount);
        if (msg.value < bond) revert BondTooSmall(msg.value, bond);
        if (!_validReceipt(p.seller, paymentId, responseHash, sellerSig)) revert BadSignature();

        p.bond = msg.value;
        p.responseHash = responseHash;
        p.state = State.Disputed;
        totalCommitted += msg.value;

        emit DisputeOpened(paymentId, p.slaHash, responseHash, msg.value);
    }

    /// @notice Claim the seller never handed over a signed receipt.
    /// @dev Without this, a seller could deliver garbage, withhold the signature so the
    ///      buyer cannot open a dispute, and simply wait for `release()`. The claim is
    ///      not taken at face value: it opens a grace period in which the seller can
    ///      produce the receipt and re-start the clock.
    function challengeReceipt(bytes32 paymentId) external nonReentrant {
        Payment storage p = _get(paymentId);
        if (msg.sender != p.buyer) revert NotBuyer();
        if (p.state != State.Funded) revert WrongState(p.state, State.Funded);
        if (block.timestamp > p.deadline) revert WindowClosed();
        if (p.wasChallenged) revert AlreadyChallenged();

        p.wasChallenged = true;
        p.state = State.ReceiptChallenged;
        p.deadline = uint64(block.timestamp) + challengeGrace;

        emit ReceiptChallengeOpened(paymentId, p.deadline);
    }

    /// @notice Answer a receipt challenge by publishing the signed receipt.
    /// @dev Returns the payment to `Funded` with a fresh short window rather than paying
    ///      out directly, because the receipt is only now visible to the buyer — who must
    ///      still get their chance to dispute the response on its merits.
    function proveDelivery(bytes32 paymentId, bytes32 responseHash, bytes calldata sellerSig)
        external
        nonReentrant
    {
        Payment storage p = _get(paymentId);
        if (p.state != State.ReceiptChallenged) revert WrongState(p.state, State.ReceiptChallenged);
        if (block.timestamp > p.deadline) revert WindowClosed();
        if (!_validReceipt(p.seller, paymentId, responseHash, sellerSig)) revert BadSignature();

        p.responseHash = responseHash;
        p.state = State.Funded;
        p.deadline = uint64(block.timestamp) + postProofWindow;

        emit DeliveryProven(paymentId, responseHash, p.deadline);
    }

    /// @notice Refund the buyer when a receipt challenge went unanswered.
    function resolveChallenge(bytes32 paymentId) external nonReentrant {
        Payment storage p = _get(paymentId);
        if (p.state != State.ReceiptChallenged) revert WrongState(p.state, State.ReceiptChallenged);
        if (block.timestamp <= p.deadline) revert WindowOpen();

        uint256 amount = p.amount;
        p.state = State.Settled;
        totalCommitted -= amount;

        _pay(p.buyer, amount);
        emit Settled(paymentId, p.buyer, amount, Verdict.REASON_RECEIPT_MISMATCH);
    }

    // ─────────────────────────────────────────────────────────────────
    // Verdict arrival
    // ─────────────────────────────────────────────────────────────────

    /// @inheritdoc CCIPReceiverBase
    /// @dev The router proves the message crossed CCIP; these two checks prove it came
    ///      from our relay on the chain where the CRE forwarder validated DON signatures.
    function _ccipReceive(Client.Any2EVMMessage memory message) internal override nonReentrant {
        if (message.sourceChainSelector != sourceChainSelector) {
            revert UnknownSourceChain(message.sourceChainSelector, sourceChainSelector);
        }
        address sender = abi.decode(message.sender, (address));
        if (sender != verdictRelay) revert UnknownSender(sender, verdictRelay);

        (bytes32 paymentId, Verdict.Outcome outcome, uint16 reasonCode) = Verdict.decode(message.data);
        emit VerdictReceived(paymentId, outcome, reasonCode, message.messageId);

        Payment storage p = _get(paymentId);
        if (p.state != State.Disputed) revert WrongState(p.state, State.Disputed);

        uint256 total = p.amount + p.bond;
        p.state = State.Settled;
        totalCommitted -= total;

        // Approve: the response held up, so the seller takes the payment and the
        // bond, which is what makes frivolous disputes cost something.
        // Reject: the buyer is made whole and gets the bond back.
        address winner = outcome == Verdict.Outcome.Approve ? p.seller : p.buyer;
        _pay(winner, total);
        emit Settled(paymentId, winner, total, reasonCode);
    }

    // ─────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────

    function _get(bytes32 paymentId) private view returns (Payment storage p) {
        p = s_payments[paymentId];
        if (p.state == State.None) revert NotFound();
    }

    function _validReceipt(
        address seller,
        bytes32 paymentId,
        bytes32 responseHash,
        bytes calldata sig
    ) private view returns (bool) {
        (address recovered, ECDSA.RecoverError err,) =
            receiptDigest(paymentId, responseHash).tryRecover(sig);
        return err == ECDSA.RecoverError.NoError && recovered == seller;
    }

    function _pay(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @dev Present so the contract also works on ordinary EVM chains, where a
    ///      transfer does run code. On Hedera the settlement bypasses this entirely,
    ///      which is exactly why `bind` verifies the balance instead of trusting a hook.
    receive() external payable {}
}
