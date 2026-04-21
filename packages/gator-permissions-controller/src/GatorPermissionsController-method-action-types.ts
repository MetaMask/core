/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { GatorPermissionsController } from './GatorPermissionsController';

/**
 * Fetches granted permissions from the gator permissions provider Snap and updates state.
 * If a sync is already in progress, returns the same promise. After the sync completes,
 * the next call will perform a new sync.
 *
 * @returns A promise that resolves when the sync completes. All data is available via the controller's state.
 * @throws {GatorPermissionsFetchError} If the gator permissions fetch fails.
 */
export type GatorPermissionsControllerFetchAndUpdateGatorPermissionsAction = {
  type: `GatorPermissionsController:fetchAndUpdateGatorPermissions`;
  handler: GatorPermissionsController['fetchAndUpdateGatorPermissions'];
};

/**
 * Initializes the controller. Call once after construction to ensure the
 * controller is ready for use.
 *
 * @returns A promise that resolves when initialization is complete.
 */
export type GatorPermissionsControllerInitializeAction = {
  type: `GatorPermissionsController:initialize`;
  handler: GatorPermissionsController['initialize'];
};

/**
 * Decodes a permission context into a structured permission for a specific origin.
 *
 * This method validates the caller origin, decodes the provided `permissionContext`
 * into delegations, identifies the permission type from the caveat enforcers,
 * extracts the permission-specific data and expiry, and reconstructs a
 * {@link DecodedPermission} containing chainId, account addresses, to, type and data.
 *
 * @param args - The arguments to this function.
 * @param args.origin - The caller's origin; must match the configured permissions provider Snap id.
 * @param args.chainId - Numeric EIP-155 chain id used for resolving enforcer contracts and encoding.
 * @param args.delegation - delegation representing the permission.
 * @param args.metadata - metadata included in the request.
 * @param args.metadata.justification - the justification as specified in the request metadata.
 * @param args.metadata.origin - the origin as specified in the request metadata.
 *
 * @returns A decoded permission object suitable for UI consumption and follow-up actions.
 * @throws If the origin is not allowed, the context cannot be decoded into exactly one delegation,
 * or the enforcers/terms do not match a supported permission type.
 */
export type GatorPermissionsControllerDecodePermissionFromPermissionContextForOriginAction =
  {
    type: `GatorPermissionsController:decodePermissionFromPermissionContextForOrigin`;
    handler: GatorPermissionsController['decodePermissionFromPermissionContextForOrigin'];
  };

/**
 * Submits a revocation to the gator permissions provider snap.
 *
 * @param revocationParams - The revocation parameters containing the permission context.
 * @returns A promise that resolves when the revocation is submitted successfully.
 * @throws {GatorPermissionsProviderError} If the snap request fails.
 */
export type GatorPermissionsControllerSubmitRevocationAction = {
  type: `GatorPermissionsController:submitRevocation`;
  handler: GatorPermissionsController['submitRevocation'];
};

/**
 * Adds a pending revocation that will be submitted once the transaction is confirmed.
 *
 * This method sets up listeners for the user's approval/rejection decision and
 * terminal transaction states (confirmed, failed, dropped). The flow is:
 * 1. Wait for user to approve or reject the transaction
 * 2. If approved, add to pending revocations state
 * 3. If rejected, cleanup without adding to state
 * 4. If confirmed, submit the revocation
 * 5. If failed or dropped, cleanup
 *
 * Includes a timeout safety net to prevent memory leaks if the transaction never
 * reaches a terminal state.
 *
 * @param params - The pending revocation parameters.
 * @returns A promise that resolves when the listener is set up.
 */
export type GatorPermissionsControllerAddPendingRevocationAction = {
  type: `GatorPermissionsController:addPendingRevocation`;
  handler: GatorPermissionsController['addPendingRevocation'];
};

/**
 * Submits a revocation directly without requiring an on-chain transaction.
 * Used for already-disabled delegations that don't require an on-chain transaction.
 *
 * This method:
 * 1. Adds the permission context to pending revocations state (disables UI button)
 * 2. Immediately calls submitRevocation to remove from snap storage
 * 3. On success, removes from pending revocations state (re-enables UI button)
 * 4. On failure, keeps in pending revocations so UI can show error/retry state
 *
 * @param params - The revocation parameters containing the permission context.
 * @returns A promise that resolves when the revocation is submitted successfully.
 * @throws {GatorPermissionsProviderError} If the snap request fails.
 */
export type GatorPermissionsControllerSubmitDirectRevocationAction = {
  type: `GatorPermissionsController:submitDirectRevocation`;
  handler: GatorPermissionsController['submitDirectRevocation'];
};

/**
 * Checks if a permission context is in the pending revocations list.
 *
 * @param permissionContext - The permission context to check.
 * @returns `true` if the permission context is pending revocation, `false` otherwise.
 */
export type GatorPermissionsControllerIsPendingRevocationAction = {
  type: `GatorPermissionsController:isPendingRevocation`;
  handler: GatorPermissionsController['isPendingRevocation'];
};

/**
 * Union of all GatorPermissionsController action types.
 */
export type GatorPermissionsControllerMethodActions =
  | GatorPermissionsControllerFetchAndUpdateGatorPermissionsAction
  | GatorPermissionsControllerInitializeAction
  | GatorPermissionsControllerDecodePermissionFromPermissionContextForOriginAction
  | GatorPermissionsControllerSubmitRevocationAction
  | GatorPermissionsControllerAddPendingRevocationAction
  | GatorPermissionsControllerSubmitDirectRevocationAction
  | GatorPermissionsControllerIsPendingRevocationAction;
