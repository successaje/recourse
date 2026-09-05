// SPDX-License-Identifier: MIT
// Interfaces and base receiver reproduced from the Chainlink CRE templates
// (https://docs.chain.link/cre). Trimmed to the checks Recourse actually uses:
// forwarder, workflow owner, and workflow id. The plaintext-workflow-name
// helper from the full template is omitted — we pin the workflow id instead,
// which is strictly narrower.
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/// @title IReceiver - receives keystone reports
interface IReceiver is IERC165 {
    /// @notice Handles incoming keystone reports.
    /// @param metadata Report's metadata.
    /// @param report Workflow report.
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title CREReceiver
/// @notice Accepts DON-signed reports delivered by the CRE KeystoneForwarder.
/// @dev The forwarder is the security boundary: it verifies the DON signatures
///      before calling in, so a report arriving here has already been attested.
///      The author and workflow-id checks narrow that further to *our* workflow,
///      which matters because a forwarder is shared across every workflow on a chain.
abstract contract CREReceiver is IReceiver, Ownable {
    address private s_forwarder;
    address private s_expectedAuthor;
    bytes32 private s_expectedWorkflowId;

    error InvalidForwarderAddress();
    error InvalidSender(address sender, address expected);
    error InvalidAuthor(address received, address expected);
    error InvalidWorkflowId(bytes32 received, bytes32 expected);

    event ForwarderUpdated(address indexed previousForwarder, address indexed newForwarder);
    event ExpectedAuthorUpdated(address indexed previousAuthor, address indexed newAuthor);
    event ExpectedWorkflowIdUpdated(bytes32 indexed previousId, bytes32 indexed newId);

    constructor(address forwarder) Ownable(msg.sender) {
        if (forwarder == address(0)) revert InvalidForwarderAddress();
        s_forwarder = forwarder;
        emit ForwarderUpdated(address(0), forwarder);
    }

    function getForwarder() external view returns (address) {
        return s_forwarder;
    }

    function getExpectedAuthor() external view returns (address) {
        return s_expectedAuthor;
    }

    function getExpectedWorkflowId() external view returns (bytes32) {
        return s_expectedWorkflowId;
    }

    /// @inheritdoc IReceiver
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (msg.sender != s_forwarder) revert InvalidSender(msg.sender, s_forwarder);

        if (s_expectedWorkflowId != bytes32(0) || s_expectedAuthor != address(0)) {
            (bytes32 workflowId, address workflowOwner) = _decodeMetadata(metadata);

            if (s_expectedWorkflowId != bytes32(0) && workflowId != s_expectedWorkflowId) {
                revert InvalidWorkflowId(workflowId, s_expectedWorkflowId);
            }
            if (s_expectedAuthor != address(0) && workflowOwner != s_expectedAuthor) {
                revert InvalidAuthor(workflowOwner, s_expectedAuthor);
            }
        }

        _processReport(report);
    }

    function setForwarder(address forwarder) external onlyOwner {
        if (forwarder == address(0)) revert InvalidForwarderAddress();
        address previous = s_forwarder;
        s_forwarder = forwarder;
        emit ForwarderUpdated(previous, forwarder);
    }

    function setExpectedAuthor(address author) external onlyOwner {
        address previous = s_expectedAuthor;
        s_expectedAuthor = author;
        emit ExpectedAuthorUpdated(previous, author);
    }

    function setExpectedWorkflowId(bytes32 id) external onlyOwner {
        bytes32 previous = s_expectedWorkflowId;
        s_expectedWorkflowId = id;
        emit ExpectedWorkflowIdUpdated(previous, id);
    }

    /// @dev Metadata layout is fixed by the forwarder: 32-byte workflow id,
    ///      10-byte workflow name, 20-byte owner, packed without padding.
    function _decodeMetadata(bytes memory metadata)
        internal
        pure
        returns (bytes32 workflowId, address workflowOwner)
    {
        assembly {
            workflowId := mload(add(metadata, 32))
            workflowOwner := shr(mul(12, 8), mload(add(metadata, 74)))
        }
    }

    function _processReport(bytes calldata report) internal virtual;

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
