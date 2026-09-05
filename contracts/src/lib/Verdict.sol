// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Verdict
/// @notice Shared encoding for adjudication results as they travel
///         enclave -> CRE report -> Sepolia relay -> CCIP -> Hedera escrow.
/// @dev Both ends of the cross-chain hop must agree on this layout, so it lives
///      in one library rather than being re-declared per contract.
library Verdict {
    /// @notice Outcome of a dispute, decided inside the enclave.
    enum Outcome {
        None, // 0 — never emitted; guards against a zero-filled payload decoding as valid
        Approve, // 1 — response satisfied the SLA; seller is paid, buyer forfeits the bond
        Reject // 2 — response violated the SLA; buyer is refunded and the bond returned
    }

    /// @notice Reason codes that are not a failed-assertion index.
    /// @dev The enclave reports the index of the first failed assertion (0-based)
    ///      offset by ASSERTION_OFFSET, so a reason code below that offset is a
    ///      structural failure rather than a content failure.
    uint16 internal constant REASON_OK = 0;
    uint16 internal constant REASON_RECEIPT_MISMATCH = 1;
    uint16 internal constant REASON_MALFORMED_BODY = 2;
    uint16 internal constant REASON_CONTENT_TYPE = 3;
    uint16 internal constant REASON_MISSING_FIELD = 4;
    uint16 internal constant REASON_LATENCY = 5;
    /// @dev Never produced by the enclave. Recorded when a dispute settles because no
    ///      verdict ever arrived, so settlement history distinguishes "the adjudicator
    ///      ruled against the seller" from "the adjudicator never answered".
    uint16 internal constant REASON_VERDICT_TIMEOUT = 6;
    uint16 internal constant ASSERTION_OFFSET = 100;

    /// @notice Encode a verdict for transport.
    function encode(bytes32 paymentId, Outcome outcome, uint16 reasonCode)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(paymentId, uint8(outcome), reasonCode);
    }

    /// @notice Decode a verdict, rejecting anything that is not a well-formed outcome.
    function decode(bytes memory payload)
        internal
        pure
        returns (bytes32 paymentId, Outcome outcome, uint16 reasonCode)
    {
        uint8 raw;
        (paymentId, raw, reasonCode) = abi.decode(payload, (bytes32, uint8, uint16));
        require(raw == uint8(Outcome.Approve) || raw == uint8(Outcome.Reject), "Verdict: bad outcome");
        outcome = Outcome(raw);
    }
}
