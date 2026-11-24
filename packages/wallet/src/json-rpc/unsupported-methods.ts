import { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { rpcErrors } from '@metamask/rpc-errors';
import { JsonRpcParams } from '@metamask/utils';

export const UNSUPPORTED_RPC_METHODS = new Set([
  // This is implemented later in our middleware stack – specifically, in
  // eth-json-rpc-middleware – but our UI does not support it.
  'eth_signTransaction' as const,
]);

/**
 * Creates a middleware that rejects explicitly unsupported RPC methods with the
 * appropriate error.
 *
 * @param methods - The list of unsupported RPC methods.
 */
export function createUnsupportedMethodMiddleware(
  methods: Set<string> = UNSUPPORTED_RPC_METHODS,
): JsonRpcMiddleware<JsonRpcParams, null> {
  return async function unsupportedMethodMiddleware(req, _res, next, end) {
    if (methods.has(req.method)) {
      return end(rpcErrors.methodNotSupported());
    }
    return next();
  };
}
