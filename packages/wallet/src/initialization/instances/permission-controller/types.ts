import type {
  CaveatSpecificationConstraint,
  PermissionControllerOptions,
  PermissionSpecificationConstraint,
} from '@metamask/permission-controller';

type GenericPermissionControllerOptions = PermissionControllerOptions<
  PermissionSpecificationConstraint,
  CaveatSpecificationConstraint
>;

/**
 * Per-instance options for the wallet's `PermissionController`.
 *
 * The permission and caveat specifications define which permissions exist and
 * how their caveats behave; they vary substantially between clients (CAIP-25
 * account permissions, Snaps endowments and restricted methods, etc.), as does
 * the set of unrestricted JSON-RPC methods. They are therefore injected rather
 * than hardcoded. Each field is optional and defaults to an empty set, so the
 * controller initializes with no permissions registered.
 */
export type PermissionControllerInstanceOptions = {
  /**
   * Specifications of all caveats available to the controller.
   */
  caveatSpecifications?: GenericPermissionControllerOptions['caveatSpecifications'];
  /**
   * Specifications of all permissions available to the controller.
   */
  permissionSpecifications?: GenericPermissionControllerOptions['permissionSpecifications'];
  /**
   * Names of all JSON-RPC methods that bypass permission gating.
   */
  unrestrictedMethods?: GenericPermissionControllerOptions['unrestrictedMethods'];
};
