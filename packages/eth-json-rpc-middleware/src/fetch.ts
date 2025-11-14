import type {
  JsonRpcMiddleware,
  MiddlewareContext,
} from '@metamask/json-rpc-engine/v2';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Json, JsonRpcRequest } from '@metamask/utils';

import type { AbstractRpcServiceLike } from './types';

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
  rpcService: AbstractRpcServiceLike;
  options?: {
    originHttpHeaderKey?: string;
  };
}): JsonRpcMiddleware<
  JsonRpcRequest,
  Json,
  MiddlewareContext<{ origin: string }>
> {
  return async ({ request, context }) => {
    const origin = context.get('origin');
    const headers =
      options.originHttpHeaderKey !== undefined && origin !== undefined
        ? { [options.originHttpHeaderKey]: origin }
        : {};

    const jsonRpcResponse = await rpcService.request(request, {
      headers,
    });

    // NOTE: We intentionally do not test to see if `jsonRpcResponse.error` is
    // strictly a JSON-RPC error response as per
    // <https://www.jsonrpc.org/specification#error_object> to account for
    // Ganache returning error objects with extra properties such as `name`
    if ('error' in jsonRpcResponse) {
      throw rpcErrors.internal({
        data: jsonRpcResponse.error,
      });
    }
    return jsonRpcResponse.result;
  };
}
