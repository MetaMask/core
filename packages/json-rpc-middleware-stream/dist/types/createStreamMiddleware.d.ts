import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import SafeEventEmitter from '@metamask/safe-event-emitter';
import { type JsonRpcParams } from '@metamask/utils';
import { Duplex } from 'readable-stream';
type Options = {
    retryOnMessage?: string;
};
/**
 * Creates a JsonRpcEngine middleware with an associated Duplex stream and
 * EventEmitter. The middleware, and by extension stream, assume that middleware
 * parameters are properly formatted. No runtime type checking or validation is
 * performed.
 *
 * @param options - Configuration options for middleware.
 * @returns The event emitter, middleware, and stream.
 */
export default function createStreamMiddleware(options?: Options): {
    events: SafeEventEmitter;
    middleware: JsonRpcMiddleware<JsonRpcParams, JsonRpcParams>;
    stream: Duplex;
};
export {};
//# sourceMappingURL=createStreamMiddleware.d.ts.map