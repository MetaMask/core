import type {
  PermissionRequest,
  PermissionTypes,
  Rule,
} from '@metamask/7715-permission-types';
import type { Caveat } from '@metamask/delegation-core';
import type { Hex } from '@metamask/utils';

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
    type: PermissionTypes['type'];
    data: PermissionTypes['data'];
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
