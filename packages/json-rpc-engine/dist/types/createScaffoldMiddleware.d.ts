import type { Json, JsonRpcParams } from '@metamask/utils';
import type { JsonRpcMiddleware } from './JsonRpcEngine';
type ScaffoldMiddlewareHandler<Params extends JsonRpcParams, Result extends Json> = JsonRpcMiddleware<Params, Result> | Json;
/**
 * Creates a middleware function from an object of RPC method handler functions,
 * keyed to particular method names. If a method corresponding to a key of this
 * object is requested, this middleware will pass it to the corresponding
 * handler and return the result.
 *
 * @param handlers - The RPC method handler functions.
 * @returns The scaffold middleware function.
 */
export declare function createScaffoldMiddleware(handlers: {
    [methodName: string]: ScaffoldMiddlewareHandler<JsonRpcParams, Json>;
}): JsonRpcMiddleware<JsonRpcParams, Json>;
export {};
//# sourceMappingURL=createScaffoldMiddleware.d.ts.map