import type { Json, JsonRpcParams } from '@metamask/utils';
import type { JsonRpcMiddleware } from './JsonRpcEngine';
/**
 * Returns a middleware function that overwrites the `id` property of each
 * request with an ID that is guaranteed to be unique, and restores the original
 * ID in a return handler.
 *
 * If used, should be the first middleware in the stack.
 *
 * @returns The ID remap middleware function.
 */
export declare function createIdRemapMiddleware(): JsonRpcMiddleware<JsonRpcParams, Json>;
//# sourceMappingURL=idRemapMiddleware.d.ts.map