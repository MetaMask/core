import type { JsonRpcEngineEndCallback, JsonRpcEngineNextCallback } from '@metamask/json-rpc-engine';
import type { Json, JsonRpcParams, JsonRpcRequest, PendingJsonRpcResponse } from '@metamask/utils';
import type { CaveatConstraint, CaveatSpecificationConstraint, CaveatSpecificationMap } from './Caveat';
import type { PermissionConstraint, PermissionSpecificationConstraint, PermissionSpecificationMap } from './Permission';
export declare enum MethodNames {
    RequestPermissions = "wallet_requestPermissions",
    GetPermissions = "wallet_getPermissions",
    RevokePermissions = "wallet_revokePermissions"
}
/**
 * Utility type for extracting a union of all individual caveat or permission
 * specification types from a {@link CaveatSpecificationMap} or
 * {@link PermissionSpecificationMap}.
 *
 * @template SpecificationsMap - The caveat or permission specifications map
 * whose specification type union to extract.
 */
export type ExtractSpecifications<SpecificationsMap extends CaveatSpecificationMap<CaveatSpecificationConstraint> | PermissionSpecificationMap<PermissionSpecificationConstraint>> = SpecificationsMap[keyof SpecificationsMap];
/**
 * A middleware function for handling a permitted method.
 */
export type HandlerMiddlewareFunction<Hooks, Params extends JsonRpcParams, Result extends Json> = (req: JsonRpcRequest<Params>, res: PendingJsonRpcResponse<Result>, next: JsonRpcEngineNextCallback, end: JsonRpcEngineEndCallback, hooks: Hooks) => void | Promise<void>;
/**
 * We use a mapped object type in order to create a type that requires the
 * presence of the names of all hooks for the given handler.
 * This can then be used to select only the necessary hooks whenever a method
 * is called for purposes of POLA.
 */
export type HookNames<HookMap> = {
    [Property in keyof HookMap]: true;
};
/**
 * A handler for a permitted method.
 */
export type PermittedHandlerExport<Hooks, Params extends JsonRpcParams, Result extends Json> = {
    implementation: HandlerMiddlewareFunction<Hooks, Params, Result>;
    hookNames: HookNames<Hooks>;
    methodNames: string[];
};
/**
 * Given two permission objects, computes 3 sets:
 * - The set of caveat pairs that are common to both permissions.
 * - The set of caveats that are unique to the existing permission.
 * - The set of caveats that are unique to the requested permission.
 *
 * Assumes that the caveat arrays of both permissions are valid.
 *
 * @param leftPermission - The left-hand permission.
 * @param rightPermission - The right-hand permission.
 * @returns The sets of caveat pairs and unique caveats.
 */
export declare function collectUniqueAndPairedCaveats(leftPermission: Partial<PermissionConstraint> | undefined, rightPermission: Partial<PermissionConstraint>): {
    caveatPairs: [CaveatConstraint, CaveatConstraint][];
    leftUniqueCaveats: CaveatConstraint[];
    rightUniqueCaveats: CaveatConstraint[];
};
//# sourceMappingURL=utils.d.ts.map