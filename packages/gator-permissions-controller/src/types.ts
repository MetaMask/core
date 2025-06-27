import type { Hex } from '@metamask/utils';

type BasePermission = {
  type: string;

  /**
   * Data structure varies by permission type.
   */
  data: Record<string, unknown>;

  /**
   * set of restrictions or conditions that a signer must abide by when redeeming a Permission.
   */
  rules?: Record<string, unknown>;
};

export type MetaMaskBasePermissionData = {
  /**
   * A human-readable explanation of why the permission is being requested.
   */
  justification: string;
};

export type NativeTokenStreamPermission = BasePermission & {
  type: 'native-token-stream';
  data: MetaMaskBasePermissionData & {
    initialAmount?: Hex;
    maxAmount?: Hex;
    amountPerSecond: Hex;
    startTime: number;
  };
};

export type NativeTokenPeriodicPermission = BasePermission & {
  type: 'native-token-periodic';
  data: MetaMaskBasePermissionData & {
    periodAmount: Hex;
    periodDuration: number;
    startTime: number;
  };
};

export type Erc20TokenStreamPermission = BasePermission & {
  type: 'erc20-token-stream';
  data: MetaMaskBasePermissionData & {
    initialAmount?: Hex;
    maxAmount?: Hex;
    amountPerSecond: Hex;
    startTime: number;
    tokenAddress: Hex;
  };
};

/**
 * Represents the type of the ERC-7715 permissions that can be granted.
 */
export type PermissionTypes =
  | NativeTokenStreamPermission
  | NativeTokenPeriodicPermission
  | Erc20TokenStreamPermission;

/**
 * Represents an ERC-7715 account signer type.
 */
export type AccountSigner = {
  type: 'account';
  data: {
    address: Hex;
  };
};

/**
 * Represents an ERC-7715 wallet signer type.
 *
 */
export type WalletSigner = {
  type: 'wallet';
  data: Record<string, unknown>;
};

export type SignerParam = AccountSigner | WalletSigner;

/**
 * Represents a ERC-7715 permission request.
 *
 * @template Signer - The type of the signer provided, either an AccountSigner or WalletSigner.
 * @template Permission - The type of the permission provided.
 */
export type PermissionRequest<
  Signer extends SignerParam,
  Permission extends PermissionTypes,
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
   * unix timestamp in seconds
   */
  expiry: number;

  /**
   * Boolean value that allows DApp to define whether the permission can be attenuated–adjusted to meet the user’s terms.
   */
  isAdjustmentAllowed: boolean;

  /**
   * An account that is associated with the recipient of the granted 7715 permission or alternatively the wallet will manage the session.
   */
  signer: Signer;

  /**
   * Defines the allowed behavior the signer can do on behalf of the account.
   */
  permission: Permission;
};

/**
 * Represents a ERC-7715 permission response.
 *
 * @template Signer - The type of the signer provided, either an AccountSigner or WalletSigner.
 * @template Permission - The type of the permission provided.
 */
export type PermissionResponse<
  Signer extends SignerParam,
  Permission extends PermissionTypes,
> = PermissionRequest<Signer, Permission> & {
  /**
   * Is a catch-all to identify a permission for revoking permissions or submitting
   * Defined in ERC-7710.
   */
  context: Hex;

  /**
   * The accountMeta field is required and contains information needed to deploy accounts.
   * Each entry specifies a factory contract and its associated deployment data.
   * If no account deployment is needed when redeeming the permission, this array must be empty.
   * When non-empty, DApps MUST deploy the accounts by calling the factory contract with factoryData as the calldata.
   * Defined in ERC-4337.
   */
  accountMeta: {
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
 * Represents a gator ERC-7715 granted(ie. signed by an user account) permission entry that is stored in profile sync.
 *
 * @template Signer - The type of the signer provided, either an AccountSigner or WalletSigner.
 * @template Permission - The type of the permission provided
 */
export type StoredGatorPermission<
  Signer extends SignerParam,
  Permission extends PermissionTypes,
> = {
  permissionResponse: PermissionResponse<Signer, Permission>;
  siteOrigin: string;
};

/**
 * Represents a list of gator permissions filtered by permission type.
 */
export type GatorPermissionsList = {
  'native-token-stream': StoredGatorPermission<
    SignerParam,
    NativeTokenStreamPermission
  >[];
  'native-token-periodic': StoredGatorPermission<
    SignerParam,
    NativeTokenPeriodicPermission
  >[];
  'erc20-token-stream': StoredGatorPermission<
    SignerParam,
    Erc20TokenStreamPermission
  >[];
};
