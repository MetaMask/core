import type {
  PermissionTypes,
  Signer,
  BasePermission,
  NativeTokenStreamPermission,
  NativeTokenPeriodicPermission,
  Erc20TokenStreamPermission,
  Erc20TokenPeriodicPermission,
  Rule,
  MetaMaskBasePermissionData,
} from '@metamask/7715-permission-types';
import type { Hex } from '@metamask/utils';

/**
 * Enum for the error codes of the gator permissions controller.
 */
export enum GatorPermissionsControllerErrorCode {
  GatorPermissionsFetchError = 'gator-permissions-fetch-error',
  GatorPermissionsNotEnabled = 'gator-permissions-not-enabled',
  GatorPermissionsProviderError = 'gator-permissions-provider-error',
  GatorPermissionsMapSerializationError = 'gator-permissions-map-serialization-error',
}

/**
 * Enum for the RPC methods of the gator permissions provider snap.
 */
export enum GatorPermissionsSnapRpcMethod {
  /**
   * This method is used by the metamask to request a permissions provider to get granted permissions for all sites.
   */
  PermissionProviderGetGrantedPermissions = 'permissionsProvider_getGrantedPermissions',
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
 * @template Signer - The type of the signer provided, either an AccountSigner or WalletSigner.
 * @template Permission - The type of the permission provided.
 */
export type PermissionRequest<
  TSigner extends Signer,
  TPermission extends PermissionTypesWithCustom,
> = {
  /**
   * hex-encoding of uint256 defined the chain with EIP-155
   */
  chainId: Hex;

  /**
   *
   * The account being targeted for this permission request.
   * It is optional to let the user choose which account to grant permission from.
   */
  address?: Hex;

  /**
   * An account that is associated with the recipient of the granted 7715 permission or alternatively the wallet will manage the session.
   */
  signer: TSigner;

  /**
   * Defines the allowed behavior the signer can do on behalf of the account.
   */
  permission: TPermission;

  rules?: Rule[] | null;
};

/**
 * Represents a ERC-7715 permission response.
 *
 * @template Signer - The type of the signer provided, either an AccountSigner or WalletSigner.
 * @template Permission - The type of the permission provided.
 */
export type PermissionResponse<
  TSigner extends Signer,
  TPermission extends PermissionTypesWithCustom,
> = PermissionRequest<TSigner, TPermission> & {
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
  dependencyInfo: {
    factory: Hex;
    factoryData: Hex;
  }[];

  /**
   * If the signer type is account then delegationManager is required as defined in ERC-7710.
   */
  signerMeta: {
    delegationManager: Hex;
  };
};

/**
 * Represents a sanitized version of the PermissionResponse type.
 * Some fields have been removed but the fields are still present in profile sync.
 *
 * @template Signer - The type of the signer provided, either an AccountSigner or WalletSigner.
 * @template Permission - The type of the permission provided.
 */
export type PermissionResponseSanitized<
  TSigner extends Signer,
  TPermission extends PermissionTypesWithCustom,
> = Omit<
  PermissionResponse<TSigner, TPermission>,
  'dependencyInfo' | 'signer' | 'rules'
>;

/**
 * Represents a gator ERC-7715 granted(ie. signed by an user account) permission entry that is stored in profile sync.
 *
 * @template Signer - The type of the signer provided, either an AccountSigner or WalletSigner.
 * @template Permission - The type of the permission provided
 */
export type StoredGatorPermission<
  TSigner extends Signer,
  TPermission extends PermissionTypesWithCustom,
> = {
  permissionResponse: PermissionResponse<TSigner, TPermission>;
  siteOrigin: string;
};

/**
 * Represents a sanitized version of the StoredGatorPermission type. Some fields have been removed but the fields are still present in profile sync.
 *
 * @template Signer - The type of the signer provided, either an AccountSigner or WalletSigner.
 * @template Permission - The type of the permission provided.
 */
export type StoredGatorPermissionSanitized<
  TSigner extends Signer,
  TPermission extends PermissionTypesWithCustom,
> = {
  permissionResponse: PermissionResponseSanitized<TSigner, TPermission>;
  siteOrigin: string;
};

/**
 * Represents a map of gator permissions by chainId and permission type.
 */
export type GatorPermissionsMap = {
  'native-token-stream': {
    [chainId: Hex]: StoredGatorPermissionSanitized<
      Signer,
      NativeTokenStreamPermission
    >[];
  };
  'native-token-periodic': {
    [chainId: Hex]: StoredGatorPermissionSanitized<
      Signer,
      NativeTokenPeriodicPermission
    >[];
  };
  'erc20-token-stream': {
    [chainId: Hex]: StoredGatorPermissionSanitized<
      Signer,
      Erc20TokenStreamPermission
    >[];
  };
  'erc20-token-periodic': {
    [chainId: Hex]: StoredGatorPermissionSanitized<
      Signer,
      Erc20TokenPeriodicPermission
    >[];
  };
  other: {
    [chainId: Hex]: StoredGatorPermissionSanitized<Signer, CustomPermission>[];
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
