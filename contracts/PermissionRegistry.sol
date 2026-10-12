// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice Administrator-published Semaphore roots; no old-root grace period.
/// @dev This records authority. It does not verify membership or execute actions.
contract PermissionRegistry {
    uint256 private constant SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    address public immutable administrator;

    struct Permission {
        uint256 root;
        uint64 epoch;
        uint64 validUntil;
        bool enabled;
    }

    mapping(bytes32 => Permission) public permissions;
    event PermissionUpdated(bytes32 indexed permission, uint256 root, uint64 epoch, uint64 validUntil, bool enabled);
    error Unauthorized();
    error InvalidPermission();
    error StaleEpoch();

    constructor(address admin) {
        if (admin == address(0)) revert Unauthorized();
        administrator = admin;
    }

    /// @notice Publish a new membership root, expiry, or disabled state.
    /// @dev expectedEpoch prevents concurrent operators overwriting each other.
    function update(bytes32 permission, uint64 expectedEpoch, uint256 root, uint64 validUntil, bool enabled) external {
        if (msg.sender != administrator) revert Unauthorized();
        if (permission == bytes32(0) || root >= SCALAR_FIELD) revert InvalidPermission();
        if (enabled && (root == 0 || validUntil <= block.timestamp)) revert InvalidPermission();
        Permission storage current = permissions[permission];
        if (current.epoch != expectedEpoch) revert StaleEpoch();
        uint64 nextEpoch = current.epoch + 1;
        permissions[permission] = Permission(root, nextEpoch, validUntil, enabled);
        emit PermissionUpdated(permission, root, nextEpoch, validUntil, enabled);
    }
}
