import { rpcErrors, serializeError } from '@metamask/rpc-errors';
import type {
  Json,
  JsonRpcId,
  JsonRpcParams,
  JsonRpcRequest,
  JsonRpcResponse,
  NonEmptyArray,
} from '@metamask/utils';
import { hasProperty, isObject } from '@metamask/utils';

import type { JsonRpcMiddleware } from './JsonRpcEngineV2';
import { JsonRpcEngineV2 } from './JsonRpcEngineV2';
import type { JsonRpcCall } from './utils';
import { getUniqueId } from '../getUniqueId';

type HandleError = (error: unknown) => void;

type Options = {
  handleError?: HandleError;
} & (
  | {
      engine: JsonRpcEngineV2<JsonRpcCall, Json>;
    }
  | {
      middleware: NonEmptyArray<JsonRpcMiddleware<JsonRpcCall, Json>>;
    }
);

const jsonrpc = '2.0' as const;

/**
 * A JSON-RPC server that handles requests and notifications.
 *
 * Essentially wraps a {@link JsonRpcEngineV2} in order to create a conformant
 * yet permissive JSON-RPC 2.0 server.
 *
 * @example
 * ```ts
 * const server = new JsonRpcServer({
 *   engine,
 *   handleError,
 * });
 *
 * const response = await server.handle(request);
 * if ('result' in response) {
 *   // Handle result
 * } else {
 *   // Handle error
 * }
 * ```
 */
export class JsonRpcServer {
  readonly #engine: JsonRpcEngineV2<JsonRpcCall, Json>;

  readonly #handleError?: HandleError | undefined;

  /**
   * Construct a new JSON-RPC server.
   *
   * @param options - The options for the server.
   * @param options.handleError - The callback to handle errors thrown by the
   * engine. Errors always result in a failed response object, containing a
   * JSON-RPC 2.0 serialized version of the original error.
   * @param options.engine - The engine to use. Mutually exclusive with
   * `middleware`.
   * @param options.middleware - The middleware to use. Mutually exclusive with
   * `engine`.
   */
  constructor(options: Options) {
    this.#handleError = options.handleError;

    if ('engine' in options) {
      this.#engine = options.engine;
    } else {
      this.#engine = new JsonRpcEngineV2({ middleware: options.middleware });
    }
  }

  /**
   * Handle an alleged JSON-RPC request. Permits any plain object with a `method`
   * property, so long as any other JSON-RPC 2.0 properties are valid.
   *
   * This method never throws. All errors are handled by the instance's
   * `handleError` callback. A response with a `result` or `error` property is
   * returned unless the request is a notification, in which case `undefined`
   * is returned.
   *
   * @param rawRequest - The raw request to handle.
   * @returns The JSON-RPC response, or `undefined` if the request is a
   * notification.
   */
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
      this.#handleError?.(error);

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
      jsonrpc,
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
