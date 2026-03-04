import type { PermissionTypes, Rule } from '@metamask/7715-permission-types';
import type { Delegation } from '@metamask/delegation-core';
import type { Hex } from '@metamask/utils';

/**
 * Enum for the error codes of the gator permissions controller.
 */
export enum GatorPermissionsControllerErrorCode {
  GatorPermissionsFetchError = 'gator-permissions-fetch-error',
  GatorPermissionsProviderError = 'gator-permissions-provider-error',
  PermissionDecodingError = 'permission-decoding-error',
  OriginNotAllowedError = 'origin-not-allowed-error',
}

/**
 * Enum for the RPC methods of the gator permissions provider snap.
 */
export enum GatorPermissionsSnapRpcMethod {
  /**
   * This method is used by the metamask to request a permissions provider to get granted permissions for all sites.
   */
  PermissionProviderGetGrantedPermissions = 'permissionsProvider_getGrantedPermissions',
  /**
   * This method is used by the metamask to submit a revocation to the permissions provider.
   */
  PermissionProviderSubmitRevocation = 'permissionsProvider_submitRevocation',
}

/**
 * Represents an ERC-7715 permission request.
 *
 * @template TPermission - The type of the permission provided.
 */
export type PermissionRequest<TPermission extends PermissionTypes> = {
  /**
   * hex-encoding of uint256 defined the chain with EIP-155
   */
  chainId: Hex;

  /**
   *
   * The account being targeted for this permission request.
   * It is optional to let the user choose which account to grant permission from.
   */
  from?: Hex;

  /**
   * A field that identifies the DApp session account associated with the permission
   */
  to: Hex;

  /**
   * Defines the allowed behavior the `to` account can do on behalf of the `from` account.
   */
  permission: TPermission;

  rules?: Rule[] | null;
};

/**
 * Represents an ERC-7715 permission response.
 *
 * @template TPermission - The type of the permission provided.
 */
export type PermissionResponse<TPermission extends PermissionTypes> =
  PermissionRequest<TPermission> & {
    /**
     * Is a catch-all to identify a permission for revoking permissions or submitting
     * Defined in ERC-7710.
     */
    context: Hex;

    /**
     * The dependencyInfo field is required and contains information needed to deploy accounts.
     * Each entry specifies a factory contract and its associated deployment data.
     * If no account deployment is needed when redeeming the permission, this array must be empty.
     * When non-empty, DApps MUST deploy the accounts by calling the factory contract with factoryData as the calldata.
     * Defined in ERC-4337.
     */
    dependencies: {
      factory: Hex;
      factoryData: Hex;
    }[];

    /**
     * Is required as defined in ERC-7710.
     */
    delegationManager: Hex;
  };

/**
 * Represents a gator ERC-7715 permission entry retrieved from gator permissions snap.
 *
 * @template TPermission - The type of the permission provided.
 */
export type StoredGatorPermission<
  TPermission extends PermissionTypes = PermissionTypes,
> = {
  permissionResponse: PermissionResponse<TPermission>;
  siteOrigin: string;
  revocationMetadata?: RevocationMetadata;
};

/**
 * Permission response with internal fields (dependencies, to) removed.
 * Used when exposing permission data to the client/UI.
 *
 * @template TPermission - The type of the permission provided.
 */
export type PermissionInfo<TPermission extends PermissionTypes> = Omit<
  PermissionResponse<TPermission>,
  'dependencies' | 'to'
>;

/**
 * Granted permission with metadata (siteOrigin, optional revocationMetadata).
 *
 * @template TPermission - The type of the permission provided.
 */
export type PermissionInfoWithMetadata<
  TPermission extends PermissionTypes = PermissionTypes,
> = {
  permissionResponse: PermissionInfo<TPermission>;
  siteOrigin: string;
  revocationMetadata?: RevocationMetadata;
};

/**
 * Delegation fields required to decode a permission (caveats, delegator, delegate, authority).
 */
export type DelegationDetails = Pick<
  Delegation<Hex>,
  'caveats' | 'delegator' | 'delegate' | 'authority'
>;

/**
 * Metadata for a confirmed revocation (e.g. when and how it was recorded).
 */
export type RevocationMetadata = {
  /** Timestamp when the revocation was recorded in storage. */
  recordedAt: number;
  /** Hash of the revocation transaction, if we submitted it. */
  txHash?: Hex | undefined;
};

/**
 * Parameters for the permissions provider Snap's submitRevocation RPC.
 */
export type RevocationParams = {
  /**
   * The permission context as a hex string that identifies the permission to revoke.
   */
  permissionContext: Hex;

  /**
   * The hash of the transaction that was used to revoke the permission. Optional because we might not have submitted the transaction ourselves.
   */
  txHash: Hex | undefined;
};

/**
 * Parameters for adding a pending revocation (tracked until the revocation tx is confirmed).
 */
export type PendingRevocationParams = {
  /**
   * The transaction metadata ID to monitor.
   */
  txId: string;
  /**
   * The permission context as a hex string that identifies the permission to revoke.
   */
  permissionContext: Hex;
};

/**
 * Permission type identifier: the `type` field of standard ERC-7715 permissions.
 */
export type SupportedPermissionType = PermissionTypes['type'];
