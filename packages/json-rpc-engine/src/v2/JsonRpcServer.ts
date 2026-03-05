import { rpcErrors, serializeError } from '@metamask/rpc-errors';
import type {
  JsonRpcNotification,
  JsonRpcParams,
  JsonRpcRequest,
  JsonRpcResponse,
  NonEmptyArray,
} from '@metamask/utils';
import { hasProperty, isObject } from '@metamask/utils';

import type {
  HandleOptions,
  JsonRpcMiddleware,
  MergedContextOf,
  MiddlewareConstraint,
  RequestOf,
} from './JsonRpcEngineV2';
import { JsonRpcEngineV2 } from './JsonRpcEngineV2';
import type { JsonRpcCall } from './utils';
import { getUniqueId } from '../getUniqueId';

type OnError = (error: unknown) => void;

type Options<Middleware extends MiddlewareConstraint> = {
  onError?: OnError;
} & (
  | {
      engine: ReturnType<typeof JsonRpcEngineV2.create<Middleware>>;
    }
  | {
      middleware: NonEmptyArray<Middleware>;
    }
);

const jsonrpc = '2.0' as const;

/**
 * A JSON-RPC server that handles requests and notifications.
 *
 * Essentially wraps a {@link JsonRpcEngineV2} in order to create a conformant
 * yet permissive JSON-RPC 2.0 server.
 *
 * Note that the server will accept both requests and notifications via {@link handle},
 * even if the underlying engine is only able to handle one or the other.
 *
 * @example
 * ```ts
 * const server = new JsonRpcServer({
 *   engine,
 *   onError,
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
export class JsonRpcServer<
  Middleware extends MiddlewareConstraint = JsonRpcMiddleware,
> {
  readonly #engine: JsonRpcEngineV2<
    RequestOf<Middleware>,
    MergedContextOf<Middleware>
  >;

  readonly #onError?: OnError | undefined;

  /**
   * Construct a new JSON-RPC server.
   *
   * @param options - The options for the server.
   * @param options.onError - The callback to handle errors thrown by the
   * engine. Errors always result in a failed response object, containing a
   * JSON-RPC 2.0 serialized version of the original error. If you need to
   * access the original error, use the `onError` callback. If the `onError`
   * callback itself throws or rejects, the error is silently ignored.
   * @param options.engine - The engine to use. Mutually exclusive with
   * `middleware`.
   * @param options.middleware - The middleware to use. Mutually exclusive with
   * `engine`.
   */
  constructor(options: Options<Middleware>) {
    this.#onError = options.onError;

    if (hasProperty(options, 'engine')) {
      // @ts-expect-error - hasProperty fails to narrow the type.
      this.#engine = options.engine;
    } else {
      // @ts-expect-error - TypeScript complains that engine is of the wrong type, but clearly it's not.
      this.#engine = JsonRpcEngineV2.create({ middleware: options.middleware });
    }
  }

  /**
   * Handle a JSON-RPC request.
   *
   * This method never throws. For requests, a response is always returned.
   * All errors are passed to the engine's `onError` callback.
   *
   * **WARNING**: This method is unaware of the request type of the underlying
   * engine. The request will fail if the engine can only handle notifications.
   *
   * @param request - The request to handle.
   * @param options - The options for the handle operation.
   * @param options.context - The context to pass to the middleware.
   * @returns The JSON-RPC response.
   */
  async handle(
    request: JsonRpcRequest,
    options?: HandleOptions<MergedContextOf<Middleware>>,
  ): Promise<JsonRpcResponse>;

  /**
   * Handle a JSON-RPC notification.
   *
   * This method never throws. For notifications, `undefined` is always returned.
   * All errors are passed to the engine's `onError` callback.
   *
   * **WARNING**: This method is unaware of the request type of the underlying
   * engine. The request will fail if the engine cannot handle notifications.
   *
   * @param notification - The notification to handle.
   * @param options - The options for the handle operation.
   * @param options.context - The context to pass to the middleware.
   */
  async handle(
    notification: JsonRpcNotification,
    options?: HandleOptions<MergedContextOf<Middleware>>,
  ): Promise<void>;

  /**
   * Handle an alleged JSON-RPC request or notification. Permits any plain
   * object with `{ method: string }`, so long as any present JSON-RPC 2.0
   * properties are valid. If the object has an `id` property, it will be
   * treated as a request, otherwise it will be treated as a notification.
   *
   * This method never throws. All errors are passed to the engine's
   * `onError` callback. A JSON-RPC response is always returned for requests,
   * and `undefined` is returned for notifications.
   *
   * **WARNING**: The request will fail if its coerced type (i.e. request or
   * response) is not of the type expected by the underlying engine.
   *
   * @param rawRequest - The raw request to handle.
   * @param options - The options for the handle operation.
   * @param options.context - The context to pass to the middleware.
   * @returns The JSON-RPC response, or `undefined` if the request is a
   * notification.
   */
  async handle(
    rawRequest: unknown,
    options?: HandleOptions<MergedContextOf<Middleware>>,
  ): Promise<JsonRpcResponse | void>;

  async handle(
    rawRequest: unknown,
    options?: HandleOptions<MergedContextOf<Middleware>>,
  ): Promise<JsonRpcResponse | void> {
    // If rawRequest is not a notification, the originalId will be attached
    // to the response. We attach our own, trusted id in #coerceRequest()
    // while the request is being handled.
    const [originalId, isRequest] = getOriginalId(rawRequest);

    try {
      const request = JsonRpcServer.#coerceRequest(rawRequest, isRequest);
      // @ts-expect-error - The request may not be of the type expected by the engine,
      // and we intentionally allow this to happen.
      const result = await this.#engine.handle(request, options);

      if (result !== undefined) {
        return {
          jsonrpc,
          // @ts-expect-error - Reassign the original id, regardless of its type.
          id: originalId,
          result,
        };
      }
    } catch (error) {
      try {
        const maybePromise: unknown = this.#onError?.(error);
        if (maybePromise instanceof Promise) {
          maybePromise.catch(() => {
            // Prevent unhandled promise rejection.
          });
        }
      } catch {
        // onError must not prevent handle() from honoring its "never throws" contract.
      }

      if (isRequest) {
        return {
          jsonrpc,
          // @ts-expect-error - Reassign the original id, regardless of its type.
          id: originalId,
          error: serializeError(error, {
            shouldIncludeStack: false,
            shouldPreserveMessage: true,
          }),
        };
      }
    }
    return undefined;
  }

  static #coerceRequest(rawRequest: unknown, isRequest: boolean): JsonRpcCall {
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
 * Check if a request has valid params, i.e. an array or object.
 * The contents of the params are not inspected.
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
