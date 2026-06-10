import type {
  BasePermission,
  MetaMaskBasePermissionData,
  PermissionRequest,
  PermissionTypes,
  Rule,
} from '@metamask/7715-permission-types';
import type {
  ApprovalRevocationTerms,
  Caveat,
} from '@metamask/delegation-core';
import type { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';
import type { Hex } from '@metamask/utils';

export type DeployedContractsByName =
  (typeof DELEGATOR_CONTRACTS)[number][number];

/**
 * Permission type for an unbounded ERC-20 token allowance.
 *
 * Encoded on-chain as an ERC20PeriodTransferEnforcer caveat with
 * `periodDuration` set to `UINT256_MAX` so that the allowance never resets
 * within any realistic time horizon.
 *
 * Not yet defined in `@metamask/7715-permission-types`, so declared locally.
 */
type Erc20TokenAllowancePermission = BasePermission & {
  type: 'erc20-token-allowance';
  data: MetaMaskBasePermissionData & {
    allowanceAmount: Hex;
    startTime?: number | null;
    tokenAddress: Hex;
  };
};

/**
 * Permission type for an unbounded native token allowance.
 *
 * Encoded on-chain as a NativeTokenPeriodTransferEnforcer caveat with
 * `periodDuration` set to `UINT256_MAX`.
 *
 * Not yet defined in `@metamask/7715-permission-types`, so declared locally.
 */
type NativeTokenAllowancePermission = BasePermission & {
  type: 'native-token-allowance';
  data: MetaMaskBasePermissionData & {
    allowanceAmount: Hex;
    startTime?: number | null;
  };
};

/**
 * Permission type for token approval revocation.
 *
 * Not yet defined in `@metamask/7715-permission-types`, so declared locally.
 */
type TokenApprovalRevocationPermission = BasePermission & {
  type: 'token-approval-revocation';
  data: MetaMaskBasePermissionData & ApprovalRevocationTerms;
};

/**
 * Extended permission union, including types not yet published in
 * `@metamask/7715-permission-types` but supported by this package's decoder.
 */
type ExtendedPermissionTypes =
  | PermissionTypes
  | Erc20TokenAllowancePermission
  | NativeTokenAllowancePermission
  | TokenApprovalRevocationPermission;

// This is a somewhat convoluted type - it includes all of the fields that are decoded from the permission context.
/**
 * A partially reconstructed permission object decoded from a permission context.
 *
 * This mirrors the shape of {@link PermissionRequest} for fields that can be
 * deterministically recovered from the encoded permission context, and it
 * augments the result with an explicit `expiry` property derived from the
 * `TimestampEnforcer` terms, as well as the `origin` property.
 */
export type DecodedPermission = Pick<
  PermissionRequest<PermissionTypes>,
  'chainId' | 'from' | 'to'
> & {
  permission: Omit<
    PermissionRequest<PermissionTypes>['permission'],
    'isAdjustmentAllowed' | 'type' | 'data'
  > & {
    type: ExtendedPermissionTypes['type'];
    data: ExtendedPermissionTypes['data'];
    // PermissionRequest type does not work well without the specific permission type, so we amend it here
    justification?: string;
  };
  /**
   * @deprecated Use `rules` instead.
   */
  expiry: number | null;
  origin: string;
  /** Rules recovered from caveats (e.g. redeemer allowlist). */
  rules?: Rule[];
};

/**
 * Supported permission type identifiers that can be decoded from a permission context.
 */
export type PermissionType = DecodedPermission['permission']['type'];

/**
 * Checksummed enforcer contract addresses for a chain (from getChecksumEnforcersByChainId).
 */
export type ChecksumEnforcersByChainId = {
  erc20StreamingEnforcer: Hex;
  erc20PeriodicEnforcer: Hex;
  nativeTokenStreamingEnforcer: Hex;
  nativeTokenPeriodicEnforcer: Hex;
  approvalRevocationEnforcer: Hex;
  exactCalldataEnforcer: Hex;
  valueLteEnforcer: Hex;
  timestampEnforcer: Hex;
  nonceEnforcer: Hex;
  allowedCalldataEnforcer: Hex;
  allowedTargetsEnforcer: Hex;
  redeemerEnforcer: Hex;
};

/** Caveat with checksummed enforcer address; used by rule decode functions. */
export type ChecksumCaveat = Caveat<Hex>;

/**
 * Result of validating and decoding permission terms from caveats.
 * When valid, includes expiry and decoded data; when invalid, includes the error.
 */
export type ValidateAndDecodeResult =
  | {
      isValid: true;
      expiry: number | null;
      data: DecodedPermission['permission']['data'];
      rules?: Rule[];
    }
  | { isValid: false; error: Error };

/**
 * A decoder that defines the required and optional enforcers for a permission
 * type, and provides methods to test whether caveat addresses match the
 * permission and to validate and decode permission terms from caveats.
 */
export type PermissionDecoder = {
  permissionType: PermissionType;
  requiredEnforcers: Map<Hex, number>;
  optionalEnforcers: Set<Hex>;
  /**
   * Returns true if the given caveat addresses (enforcer addresses) match this
   * decoder (required enforcers present with correct multiplicity, no
   * forbidden enforcers).
   */
  caveatAddressesMatch: (caveatAddresses: Hex[]) => boolean;
  /**
   * Validates and decodes permission terms from the caveats. Returns a result
   * object with isValid; when valid, includes expiry and data.
   */
  validateAndDecodePermission: (
    caveats: Caveat<Hex>[],
  ) => ValidateAndDecodeResult;
};

/**
 * A function that inspects checksummed caveats and optionally produces a
 * {@link Rule} (e.g. redeemer, payee, expiry). Each rule decoder is
 * responsible for a single rule type and is composed by
 * `makePermissionDecoder` to populate the permission's `rules` array. The
 * `expiry` rule, in addition to being appended to `rules`, has its value
 * hoisted onto the top-level `expiry` field of the decoded permission.
 */
export type RuleDecoder = (args: {
  contractAddresses: ChecksumEnforcersByChainId;
  caveats: ChecksumCaveat[];
  requiredEnforcers: Map<Hex, number>;
}) => Rule | null;
