import SafeEventEmitter from '@metamask/safe-event-emitter';
import type { JsonRpcError as SerializedJsonRpcError, JsonRpcRequest, JsonRpcResponse, JsonRpcNotification, Json, JsonRpcParams, PendingJsonRpcResponse } from '@metamask/utils';
export type JsonRpcEngineCallbackError = Error | SerializedJsonRpcError | null;
export type JsonRpcEngineReturnHandler = (done: (error?: unknown) => void) => void;
export type JsonRpcEngineNextCallback = (returnHandlerCallback?: JsonRpcEngineReturnHandler) => void;
export type JsonRpcEngineEndCallback = (error?: unknown) => void;
export type JsonRpcMiddleware<Params extends JsonRpcParams, Result extends Json> = {
    (req: JsonRpcRequest<Params>, res: PendingJsonRpcResponse<Result>, next: JsonRpcEngineNextCallback, end: JsonRpcEngineEndCallback): void;
    destroy?: () => void | Promise<void>;
};
export type JsonRpcNotificationHandler<Params extends JsonRpcParams> = (notification: JsonRpcNotification<Params>) => void | Promise<void>;
type JsonRpcEngineArgs = {
    /**
     * A function for handling JSON-RPC notifications. A JSON-RPC notification is
     * defined as a JSON-RPC request without an `id` property. If this option is
     * _not_ provided, notifications will be treated the same as requests. If this
     * option _is_ provided, notifications will be passed to the handler
     * function without touching the engine's middleware stack.
     *
     * This function should not throw or reject.
     */
    notificationHandler?: JsonRpcNotificationHandler<JsonRpcParams>;
};
/**
 * A JSON-RPC request and response processor.
 * Give it a stack of middleware, pass it requests, and get back responses.
 */
export declare class JsonRpcEngine extends SafeEventEmitter {
    #private;
    /**
     * Constructs a {@link JsonRpcEngine} instance.
     *
     * @param options - Options bag.
     * @param options.notificationHandler - A function for handling JSON-RPC
     * notifications. A JSON-RPC notification is defined as a JSON-RPC request
     * without an `id` property. If this option is _not_ provided, notifications
     * will be treated the same as requests. If this option _is_ provided,
     * notifications will be passed to the handler function without touching
     * the engine's middleware stack. This function should not throw or reject.
     */
    constructor({ notificationHandler }?: JsonRpcEngineArgs);
    /**
     * Calls the `destroy()` function of any middleware with that property, clears
     * the middleware array, and marks this engine as destroyed. A destroyed
     * engine cannot be used.
     */
    destroy(): void;
    /**
     * Add a middleware function to the engine's middleware stack.
     *
     * @param middleware - The middleware function to add.
     */
    push<Params extends JsonRpcParams, Result extends Json>(middleware: JsonRpcMiddleware<Params, Result>): void;
    /**
     * Handle a JSON-RPC request, and return a response.
     *
     * @param request - The request to handle.
     * @param callback - An error-first callback that will receive the response.
     */
    handle<Params extends JsonRpcParams, Result extends Json>(request: JsonRpcRequest<Params>, callback: (error: unknown, response: JsonRpcResponse<Result>) => void): void;
    /**
     * Handle a JSON-RPC notification.
     *
     * @param notification - The notification to handle.
     * @param callback - An error-first callback that will receive a `void` response.
     */
    handle<Params extends JsonRpcParams>(notification: JsonRpcNotification<Params>, callback: (error: unknown, response: void) => void): void;
    /**
     * Handle an array of JSON-RPC requests and/or notifications, and return an
     * array of responses to any included requests.
     *
     * @param request - The requests to handle.
     * @param callback - An error-first callback that will receive the array of
     * responses.
     */
    handle<Params extends JsonRpcParams, Result extends Json>(requests: (JsonRpcRequest<Params> | JsonRpcNotification<Params>)[], callback: (error: unknown, responses: JsonRpcResponse<Result>[]) => void): void;
    /**
     * Handle a JSON-RPC request, and return a response.
     *
     * @param request - The JSON-RPC request to handle.
     * @returns The JSON-RPC response.
     */
    handle<Params extends JsonRpcParams, Result extends Json>(request: JsonRpcRequest<Params>): Promise<JsonRpcResponse<Result>>;
    /**
     * Handle a JSON-RPC notification.
     *
     * @param notification - The notification to handle.
     */
    handle<Params extends JsonRpcParams>(notification: JsonRpcNotification<Params>): Promise<void>;
    /**
     * Handle an array of JSON-RPC requests and/or notifications, and return an
     * array of responses to any included requests.
     *
     * @param request - The JSON-RPC requests to handle.
     * @returns An array of JSON-RPC responses.
     */
    handle<Params extends JsonRpcParams, Result extends Json>(requests: (JsonRpcRequest<Params> | JsonRpcNotification<Params>)[]): Promise<JsonRpcResponse<Result>[]>;
    /**
     * Returns this engine as a middleware function that can be pushed to other
     * engines.
     *
     * @returns This engine as a middleware function.
     */
    asMiddleware(): JsonRpcMiddleware<JsonRpcParams, Json>;
    /**
     * A promise-wrapped _handle.
     *
     * @param request - The JSON-RPC request.
     * @returns The JSON-RPC response.
     */
    private _promiseHandle;
}
export {};
//# sourceMappingURL=JsonRpcEngine.d.ts.map