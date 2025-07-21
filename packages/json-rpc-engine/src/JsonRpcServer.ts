import { rpcErrors, serializeError } from '@metamask/rpc-errors';
import type {
  Json,
  JsonRpcId,
  JsonRpcParams,
  JsonRpcRequest,
  JsonRpcResponse,
} from '@metamask/utils';
import { hasProperty, isObject } from '@metamask/utils';

import { getUniqueId } from './getUniqueId';
import type { JsonRpcEngineV2 } from './JsonRpcEngineV2';
import type { JsonRpcCall } from './utils';

type HandleError = (error: unknown) => void | Promise<void>;

type Options = {
  engine: JsonRpcEngineV2<JsonRpcCall, Json>;
  handleError: HandleError;
};

const jsonrpc = '2.0' as const;

export class JsonRpcServer {
  readonly #engine: JsonRpcEngineV2<JsonRpcCall, Json>;

  readonly #handleError: HandleError;

  constructor({ engine, handleError }: Options) {
    this.#engine = engine;
    this.#handleError = handleError;
  }

  async handle(rawRequest: unknown): Promise<JsonRpcResponse | undefined> {
    const [originalId, isRequest] = getOriginalId(rawRequest);

    try {
      const request = this.#coerceRequest(rawRequest, isRequest);
      const result = await this.#engine.handleAny(request);

      if (isRequest) {
        return {
          jsonrpc,
          id: originalId as JsonRpcId,
          // The result is guaranteed to be Json by the engine.
          result: result as Json,
        };
      }
    } catch (error) {
      await this.#handleError(error);

      if (isRequest) {
        return {
          jsonrpc,
          // Remap the original id to the error response, regardless of its
          // type, which is not our problem.
          id: originalId as JsonRpcId,
          error: serializeError(error, {
            shouldIncludeStack: false,
            shouldPreserveMessage: true,
          }),
        };
      }
    }
    return undefined;
  }

  #coerceRequest(rawRequest: unknown, isRequest: boolean): JsonRpcCall {
    if (!isMinimalRequest(rawRequest)) {
      throw rpcErrors.invalidRequest({
        data: {
          request: rawRequest,
        },
      });
    }

    const request: JsonRpcCall = {
      jsonrpc: '2.0' as const,
      method: rawRequest.method,
    };

    if (hasProperty(rawRequest, 'params')) {
      request.params = rawRequest.params as JsonRpcParams;
    }

    if (isRequest) {
      (request as JsonRpcRequest).id = getUniqueId();
    }

    return request;
  }
}

/**
 * The most minimally conformant request object that we will accept.
 */
type MinimalRequest = {
  method: string;
  params?: JsonRpcParams;
} & Record<string, unknown>;

/**
 * Check if an unvalidated request is a minimal request.
 *
 * @param rawRequest - The raw request to check.
 * @returns `true` if the request is a {@link MinimalRequest}, `false` otherwise.
 */
function isMinimalRequest(rawRequest: unknown): rawRequest is MinimalRequest {
  return (
    isObject(rawRequest) &&
    hasProperty(rawRequest, 'method') &&
    typeof rawRequest.method === 'string' &&
    hasValidParams(rawRequest)
  );
}

/**
 * Check if a request has valid params.
 *
 * @param rawRequest - The request to check.
 * @returns `true` if the request has valid params, `false` otherwise.
 */
function hasValidParams(
  rawRequest: Record<string, unknown>,
): rawRequest is { params?: JsonRpcParams } {
  if (hasProperty(rawRequest, 'params')) {
    return Array.isArray(rawRequest.params) || isObject(rawRequest.params);
  }

  return true;
}

/**
 * Get the original id from a request.
 *
 * @param rawRequest - The request to get the original id from.
 * @returns The original id and a boolean indicating if the request is a request
 * (as opposed to a notification).
 */
function getOriginalId(rawRequest: unknown): [unknown, boolean] {
  if (isObject(rawRequest) && hasProperty(rawRequest, 'id')) {
    return [rawRequest.id, true];
  }

  return [undefined, false];
}
