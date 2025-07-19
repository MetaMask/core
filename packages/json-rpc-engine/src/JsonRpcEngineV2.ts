import type {
  Json,
  JsonRpcRequest,
  JsonRpcNotification,
  NonEmptyArray,
} from '@metamask/utils';
import deepFreeze from 'deep-freeze-strict';

import {
  makeMiddlewareContext,
  type MiddlewareContext,
} from './MiddlewareContext';
import {
  isNotification,
  isRequest,
  JsonRpcEngineError,
  stringify,
} from './utils';
import type { JsonRpcCall } from './utils';

export type Next<Request extends JsonRpcCall, Result extends Json | void> = (
  request?: Readonly<Request>,
) => Promise<Result | void>;

export type MiddlewareParams<
  Request extends JsonRpcCall,
  Result extends Json | void,
> = {
  request: Readonly<Request>;
  context: MiddlewareContext;
  next: Next<Request, Result>;
};

export type JsonRpcMiddleware<
  Request extends JsonRpcCall = JsonRpcCall,
  Result extends Json | void = Json | void,
> = (
  params: MiddlewareParams<Request, Result | void>,
) => Result | void | Promise<Result | void>;

type Options<Request extends JsonRpcCall, Result extends Json> = {
  middleware: NonEmptyArray<JsonRpcMiddleware<Request, Result | void>>;
};

/**
 * A JSON-RPC request and response processor.
 *
 * Give it a stack of middleware, pass it requests, and get back responses.
 *
 * @template Request - The type of request to handle.
 * @template Result - The type of result to return.
 */
export class JsonRpcEngineV2<Request extends JsonRpcCall, Result extends Json> {
  readonly #middleware: Readonly<
    NonEmptyArray<JsonRpcMiddleware<Request, Result | void>>
  >;

  #makeMiddlewareIterator = (): Iterator<
    JsonRpcMiddleware<Request, Result | void>
  > => this.#middleware[Symbol.iterator]();

  constructor({ middleware }: Options<Request, Result>) {
    this.#middleware = [...middleware];
  }

  /**
   * Handle a JSON-RPC request. A result will be returned.
   *
   * @param request - The JSON-RPC request to handle.
   * @returns The JSON-RPC response.
   */
  async handle(request: Request & JsonRpcRequest): Promise<Result>;

  /**
   * Handle a JSON-RPC notification. No result will be returned.
   *
   * @param notification - The JSON-RPC notification to handle.
   */
  async handle(notification: Request & JsonRpcNotification): Promise<void>;

  async handle(request: Request): Promise<Result | void> {
    const isReq = isRequest(request);
    const { result } = await this.#handle(request);

    if (isReq && result === undefined) {
      throw new JsonRpcEngineError(
        `Nothing ended request: ${stringify(request)}`,
      );
    }
    return result;
  }

  // This exists because a JsonRpcCall overload of handle() cannot coexist with
  // the other overloads due to type union / overload shenanigans.
  /**
   * Handle a JSON-RPC call. A response will be returned if the call is a request.
   *
   * @param request - The JSON-RPC call to handle.
   * @returns The JSON-RPC response, if any.
   */
  async handleAny(request: JsonRpcCall & Request): Promise<Result | void> {
    return this.handle(request);
  }

  /**
   * Handle a JSON-RPC request. Throws if a middleware performs an invalid
   * operation. Permits returning an `undefined` result.
   *
   * @param originalRequest - The JSON-RPC request to handle.
   * @param context - The context to pass to the middleware.
   * @returns The result from the middleware.
   */
  async #handle(
    originalRequest: Request,
    context: MiddlewareContext = makeMiddlewareContext(),
  ): Promise<{
    result: Result | void;
    finalRequest: Readonly<Request>;
  }> {
    deepFreeze(originalRequest);

    let currentRequest = originalRequest;
    const middlewareIterator = this.#makeMiddlewareIterator();
    const firstMiddleware: JsonRpcMiddleware<Request, Result | void> =
      middlewareIterator.next().value;

    const makeNext = (): Next<Request, Result> => {
      let wasCalled = false;

      const next = async (
        request: Request = currentRequest,
      ): Promise<Result | void> => {
        if (wasCalled) {
          throw new JsonRpcEngineError(
            `Middleware attempted to call next() multiple times for request: ${stringify(request)}`,
          );
        }
        wasCalled = true;

        if (request !== currentRequest) {
          this.#assertNextRequestValid(currentRequest, request);
          currentRequest = deepFreeze(request);
        }

        const { value: middleware, done } = middlewareIterator.next();
        return done
          ? undefined
          : await middleware({ request, context, next: makeNext() });
      };
      return next;
    };

    const result = await firstMiddleware({
      request: originalRequest,
      context,
      next: makeNext(),
    });

    if (isNotification(currentRequest) && result !== undefined) {
      throw new JsonRpcEngineError(
        `Result returned for notification: ${stringify(currentRequest)}`,
      );
    }

    return {
      result,
      finalRequest: currentRequest,
    };
  }

  #assertNextRequestValid(currentRequest: Request, nextRequest: Request): void {
    if (nextRequest.jsonrpc !== currentRequest.jsonrpc) {
      throw new JsonRpcEngineError(
        `Middleware attempted to modify readonly property "jsonrpc" for request: ${stringify(currentRequest)}`,
      );
    }
    // @ts-expect-error - "id" does not exist on notifications, but this will
    // produce the desired behavior at runtime.
    if (nextRequest.id !== currentRequest.id) {
      throw new JsonRpcEngineError(
        `Middleware attempted to modify readonly property "id" for request: ${stringify(currentRequest)}`,
      );
    }
  }

  /**
   * Convert the engine into a JSON-RPC middleware.
   *
   * @returns The JSON-RPC middleware.
   */
  asMiddleware(): JsonRpcMiddleware<Request, Result> {
    return async ({ request, context, next }) => {
      const { result, finalRequest } = await this.#handle(request, context);
      return result === undefined ? await next(finalRequest) : result;
    };
  }
}
