import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import {
  createAsyncMiddleware,
  type JsonRpcMiddleware,
} from '@metamask/json-rpc-engine';
import type { Json, JsonRpcParams } from '@metamask/utils';

export function providerAsMiddleware(
  provider: SafeEventEmitterProvider,
): JsonRpcMiddleware<JsonRpcParams, Json> {
  return createAsyncMiddleware(async (req, res) => {
    res.result = await provider.request(req);
  });
}
