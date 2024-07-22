import type { Json, JsonRpcParams, JsonRpcRequest, PendingJsonRpcResponse } from '@metamask/utils';
import type { JsonRpcMiddleware } from './JsonRpcEngine';
export type AsyncJsonRpcEngineNextCallback = () => Promise<void>;
export type AsyncJsonrpcMiddleware<Params extends JsonRpcParams, Result extends Json> = (request: JsonRpcRequest<Params>, response: PendingJsonRpcResponse<Result>, next: AsyncJsonRpcEngineNextCallback) => Promise<void>;
/**
 * JsonRpcEngine only accepts callback-based middleware directly.
 * createAsyncMiddleware exists to enable consumers to pass in async middleware
 * functions.
 *
 * Async middleware have no "end" function. Instead, they "end" if they return
 * without calling "next". Rather than passing in explicit return handlers,
 * async middleware can simply await "next", and perform operations on the
 * response object when execution resumes.
 *
 * To accomplish this, createAsyncMiddleware passes the async middleware a
 * wrapped "next" function. That function calls the internal JsonRpcEngine
 * "next" function with a return handler that resolves a promise when called.
 *
 * The return handler will always be called. Its resolution of the promise
 * enables the control flow described above.
 *
 * @param asyncMiddleware - The asynchronous middleware function to wrap.
 * @returns The wrapped asynchronous middleware function, ready to be consumed
 * by JsonRpcEngine.
 */
export declare function createAsyncMiddleware<Params extends JsonRpcParams, Result extends Json>(asyncMiddleware: AsyncJsonrpcMiddleware<Params, Result>): JsonRpcMiddleware<Params, Result>;
//# sourceMappingURL=createAsyncMiddleware.d.ts.map