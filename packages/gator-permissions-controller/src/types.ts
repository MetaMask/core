import type {
  PermissionTypes,
  BasePermission,
  NativeTokenStreamPermission,
  NativeTokenPeriodicPermission,
  Erc20TokenStreamPermission,
  Erc20TokenPeriodicPermission,
  Rule,
  MetaMaskBasePermissionData,
  Erc20TokenRevocationPermission,
} from '@metamask/7715-permission-types';
import type { Delegation } from '@metamask/delegation-core';
import type { Hex } from '@metamask/utils';

/**
 * Enum for the error codes of the gator permissions controller.
 */
export enum GatorPermissionsControllerErrorCode {
  GatorPermissionsFetchError = 'gator-permissions-fetch-error',
  GatorPermissionsNotEnabled = 'gator-permissions-not-enabled',
  GatorPermissionsProviderError = 'gator-permissions-provider-error',
  GatorPermissionsMapSerializationError = 'gator-permissions-map-serialization-error',
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
 * Represents a custom permission that are not of the standard ERC-7715 permission types.
 */
export type CustomPermission = BasePermission & {
  type: 'custom';
  data: MetaMaskBasePermissionData & Record<string, unknown>;
};

/**
 * Represents the type of the ERC-7715 permissions that can be granted including custom permissions.
 */
export type PermissionTypesWithCustom = PermissionTypes | CustomPermission;

/**
 * Represents a ERC-7715 permission request.
 *
 * @template to - The type of the signer provided, either an AccountSigner or WalletSigner.
 * @template Permission - The type of the permission provided.
 */
export type PermissionRequest<TPermission extends PermissionTypesWithCustom> = {
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
 * Represents a ERC-7715 permission response.
 *
 * @template Permission - The type of the permission provided.
 */
export type PermissionResponse<TPermission extends PermissionTypesWithCustom> =
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
 * Represents a sanitized version of the PermissionResponse type.
 * Internal fields (dependencies, to) are removed
 *
 * @template Permission - The type of the permission provided.
 */
export type PermissionResponseSanitized<
  TPermission extends PermissionTypesWithCustom,
> = Omit<PermissionResponse<TPermission>, 'dependencies' | 'to'>;

/**
 * Represents a gator ERC-7715 granted(ie. signed by an user account) permission entry that is stored in profile sync.
 *
 * @template Permission - The type of the permission provided
 */
export type StoredGatorPermission<
  TPermission extends PermissionTypesWithCustom,
> = {
  permissionResponse: PermissionResponse<TPermission>;
  siteOrigin: string;
  /**
   * Flag indicating whether this permission has been revoked.
   */
  isRevoked?: boolean;
};

/**
 * Represents a sanitized version of the StoredGatorPermission type. Some fields have been removed but the fields are still present in profile sync.
 *
 * @template Permission - The type of the permission provided.
 */
export type StoredGatorPermissionSanitized<
  TPermission extends PermissionTypesWithCustom,
> = {
  permissionResponse: PermissionResponseSanitized<TPermission>;
  siteOrigin: string;
  /**
   * Flag indicating whether this permission has been revoked.
   */
  isRevoked?: boolean;
};

/**
 * Represents a map of gator permissions by chainId and permission type.
 */
export type GatorPermissionsMap = {
  'erc20-token-revocation': {
    [
      chainId: Hex
    ]: StoredGatorPermissionSanitized<Erc20TokenRevocationPermission>[];
  };
  'native-token-stream': {
    [
      chainId: Hex
    ]: StoredGatorPermissionSanitized<NativeTokenStreamPermission>[];
  };
  'native-token-periodic': {
    [
      chainId: Hex
    ]: StoredGatorPermissionSanitized<NativeTokenPeriodicPermission>[];
  };
  'erc20-token-stream': {
    [
      chainId: Hex
    ]: StoredGatorPermissionSanitized<Erc20TokenStreamPermission>[];
  };
  'erc20-token-periodic': {
    [
      chainId: Hex
    ]: StoredGatorPermissionSanitized<Erc20TokenPeriodicPermission>[];
  };
  other: {
    [chainId: Hex]: StoredGatorPermissionSanitized<CustomPermission>[];
  };
};

/**
 * Represents the supported permission type(e.g. 'native-token-stream', 'native-token-periodic', 'erc20-token-stream', 'erc20-token-periodic') of the gator permissions map.
 */
export type SupportedGatorPermissionType = keyof GatorPermissionsMap;

/**
 * Represents a map of gator permissions for a given permission type with key of chainId. The value being an array of gator permissions for that chainId.
 */
export type GatorPermissionsMapByPermissionType<
  TPermissionType extends SupportedGatorPermissionType,
> = GatorPermissionsMap[TPermissionType];

/**
 * Represents an array of gator permissions for a given permission type and chainId.
 */
export type GatorPermissionsListByPermissionTypeAndChainId<
  TPermissionType extends SupportedGatorPermissionType,
> = GatorPermissionsMap[TPermissionType][Hex];

/**
 * Represents the details of a delegation, that are required to decode a permission.
 */
export type DelegationDetails = Pick<
  Delegation<Hex>,
  'caveats' | 'delegator' | 'delegate' | 'authority'
>;

/**
 * Represents the metadata for confirmed transaction revocation.
 */
export type RevocationMetadata = {
  txHash?: Hex | undefined;
};

/**
 * Represents the parameters for submitting a revocation.
 */
export type RevocationParams = {
  /**
   * The permission context as a hex string that identifies the permission to revoke.
   */
  permissionContext: Hex;

  /**
   * The metadata associated with the permission revocation transaction.
   */
  revocationMetadata: RevocationMetadata;
};

/**
 * Represents the parameters for adding a pending revocation.
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
