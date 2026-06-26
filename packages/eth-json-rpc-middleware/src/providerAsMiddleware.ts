import type { InternalProvider } from '@metamask/eth-json-rpc-provider';
import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import type { JsonRpcMiddleware as LegacyJsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine/v2';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

/**
 * Creates a legacy JSON-RPC middleware that forwards requests to a provider.
 *
 * @param provider - The provider to forward requests to.
 * @returns A legacy JSON-RPC middleware that forwards requests to the provider.
 * @deprecated Use {@link providerAsMiddlewareV2} instead.
 */
export function providerAsMiddleware(
  provider: InternalProvider,
): LegacyJsonRpcMiddleware<JsonRpcParams, Json> {
  return createAsyncMiddleware(async (req, res) => {
    res.result = await provider.request(req);
  });
}

/**
 * Creates a V2 JSON-RPC middleware that forwards requests to a provider.
 *
 * @param provider - The provider to forward requests to.
 * @returns A V2 JSON-RPC middleware that forwards requests to the provider.
 */
export function providerAsMiddlewareV2(
  provider: InternalProvider,
): JsonRpcMiddleware<JsonRpcRequest, Json> {
  return async ({ request }) => provider.request(request);
}
