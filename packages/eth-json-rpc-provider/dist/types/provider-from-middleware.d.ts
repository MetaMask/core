import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type { Json, JsonRpcParams } from '@metamask/utils';
import type { SafeEventEmitterProvider } from './safe-event-emitter-provider';
/**
 * Construct an Ethereum provider from the given middleware.
 *
 * @param middleware - The middleware to construct a provider from.
 * @returns An Ethereum provider.
 */
export declare function providerFromMiddleware<Params extends JsonRpcParams, Result extends Json>(middleware: JsonRpcMiddleware<Params, Result>): SafeEventEmitterProvider;
//# sourceMappingURL=provider-from-middleware.d.ts.map