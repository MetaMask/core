import type {
  CaveatSpecificationConstraint,
  PermissionControllerOptions,
  PermissionSpecificationConstraint,
} from '@metamask/permission-controller';

type Options = PermissionControllerOptions<
  PermissionSpecificationConstraint,
  CaveatSpecificationConstraint
>;

/**
 * Per-instance options for the wallet's `PermissionController`.
 */
export type PermissionControllerInstanceOptions = {
  /** Caveat specifications available to the controller. Defaults to none. */
  caveatSpecifications?: Options['caveatSpecifications'];
  /** Permission specifications available to the controller. Defaults to none. */
  permissionSpecifications?: Options['permissionSpecifications'];
  /** JSON-RPC methods ignored by the controller. Defaults to none. */
  unrestrictedMethods?: Options['unrestrictedMethods'];
};
