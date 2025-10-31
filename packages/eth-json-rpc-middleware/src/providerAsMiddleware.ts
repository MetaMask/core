import type { InternalProvider } from '@metamask/eth-json-rpc-provider';
import {
  createAsyncMiddleware,
  type JsonRpcMiddleware as LegacyJsonRpcMiddleware,
} from '@metamask/json-rpc-engine';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine/v2';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

export function providerAsMiddleware(
  provider: InternalProvider,
): LegacyJsonRpcMiddleware<JsonRpcParams, Json> {
  return createAsyncMiddleware(async (req, res) => {
    res.result = await provider.request(req);
  });
}

export function providerAsMiddlewareV2(
  provider: InternalProvider,
): JsonRpcMiddleware<JsonRpcRequest, Json> {
  return async ({ request }) => provider.request(request);
}
