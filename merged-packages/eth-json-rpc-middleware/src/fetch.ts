import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import type { AbstractRpcService } from './types';

/**
 * Like a JSON-RPC request, but includes an optional `origin` property.
 * This will be included in the request as a header if specified.
 */
type JsonRpcRequestWithOrigin<Params extends JsonRpcParams> =
  JsonRpcRequest<Params> & {
    origin?: string;
  };

/**
 * Creates middleware for sending a JSON-RPC request through the given RPC
 * service.
 *
 * @param args - The arguments to this function.
 * @param args.rpcService - The RPC service to use.
 * @param args.options - Options.
 * @param args.options.originHttpHeaderKey - If provided, the origin field for
 * each JSON-RPC request will be attached to each outgoing fetch request under
 * this header.
 * @returns The fetch middleware.
 */
export function createFetchMiddleware({
  rpcService,
  options = {},
}: {
  rpcService: AbstractRpcService;
  options?: {
    originHttpHeaderKey?: string;
  };
}): JsonRpcMiddleware<JsonRpcParams, Json> {
  return createAsyncMiddleware(
    async (req: JsonRpcRequestWithOrigin<JsonRpcParams>, res) => {
      const headers =
        'originHttpHeaderKey' in options &&
        options.originHttpHeaderKey !== undefined &&
        req.origin !== undefined
          ? { [options.originHttpHeaderKey]: req.origin }
          : {};

      const jsonRpcResponse = await rpcService.request(
        {
          id: req.id,
          jsonrpc: req.jsonrpc,
          method: req.method,
          params: req.params,
        },
        {
          headers,
        },
      );

      // NOTE: We intentionally do not test to see if `jsonRpcResponse.error` is
      // strictly a JSON-RPC error response as per
      // <https://www.jsonrpc.org/specification#error_object> to account for
      // Ganache returning error objects with extra properties such as `name`
      if ('error' in jsonRpcResponse) {
        throw rpcErrors.internal({
          data: jsonRpcResponse.error,
        });
      }

      // Discard the `id` and `jsonrpc` fields in the response body
      // (the JSON-RPC engine will fill those in)
      res.result = jsonRpcResponse.result;
    },
  );
}
