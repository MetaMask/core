import type {
  PermissionRequest,
  PermissionTypes,
} from '@metamask/7715-permission-types';
import type { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';

export type DeployedContractsByName =
  (typeof DELEGATOR_CONTRACTS)[number][number];

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
    'isAdjustmentAllowed'
  > & {
    // PermissionRequest type does not work well without the specific permission type, so we amend it here
    justification?: string;
  };
  expiry: number | null;
  origin: string;
};

/**
 * Supported permission type identifiers that can be decoded from a permission context.
 */
export type PermissionType = DecodedPermission['permission']['type'];
