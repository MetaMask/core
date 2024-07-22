import type { JsonRpcEngine } from '@metamask/json-rpc-engine';
import SafeEventEmitter from '@metamask/safe-event-emitter';
import type { Json, JsonRpcId, JsonRpcParams, JsonRpcRequest, JsonRpcVersion2 } from '@metamask/utils';
/**
 * A JSON-RPC request conforming to the EIP-1193 specification.
 */
type Eip1193Request<Params extends JsonRpcParams> = {
    id?: JsonRpcId;
    jsonrpc?: JsonRpcVersion2;
    method: string;
    params?: Params;
};
/**
 * Converts an EIP-1193 request to a JSON-RPC request.
 *
 * @param eip1193Request - The EIP-1193 request to convert.
 * @returns The corresponding JSON-RPC request.
 */
export declare function convertEip1193RequestToJsonRpcRequest<Params extends JsonRpcParams>(eip1193Request: Eip1193Request<Params>): JsonRpcRequest<Params | Record<never, never>>;
/**
 * An Ethereum provider.
 *
 * This provider loosely follows conventions that pre-date EIP-1193.
 * It is not compliant with any Ethereum provider standard.
 */
export declare class SafeEventEmitterProvider extends SafeEventEmitter {
    #private;
    /**
     * Construct a SafeEventEmitterProvider from a JSON-RPC engine.
     *
     * @param options - Options.
     * @param options.engine - The JSON-RPC engine used to process requests.
     */
    constructor({ engine }: {
        engine: JsonRpcEngine;
    });
    /**
     * Send a provider request asynchronously.
     *
     * @param eip1193Request - The request to send.
     * @returns The JSON-RPC response.
     */
    request<Params extends JsonRpcParams, Result extends Json>(eip1193Request: Eip1193Request<Params>): Promise<Result>;
    /**
     * Send a provider request asynchronously.
     *
     * This method serves the same purpose as `request`. It only exists for
     * legacy reasons.
     *
     * @param eip1193Request - The request to send.
     * @param callback - A function that is called upon the success or failure of the request.
     * @deprecated Please use `request` instead.
     */
    sendAsync: <Params extends JsonRpcParams>(eip1193Request: Eip1193Request<Params>, callback: (error: unknown, providerRes?: any) => void) => void;
    /**
     * Send a provider request asynchronously.
     *
     * This method serves the same purpose as `request`. It only exists for
     * legacy reasons.
     *
     * @param eip1193Request - The request to send.
     * @param callback - A function that is called upon the success or failure of the request.
     * @deprecated Please use `request` instead.
     */
    send: <Params extends JsonRpcParams>(eip1193Request: Eip1193Request<Params>, callback: (error: unknown, providerRes?: any) => void) => void;
}
export {};
//# sourceMappingURL=safe-event-emitter-provider.d.ts.map