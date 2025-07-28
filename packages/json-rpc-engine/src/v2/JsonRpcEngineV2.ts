import {
  type Json,
  type JsonRpcRequest,
  type JsonRpcNotification,
  type NonEmptyArray,
  hasProperty,
} from '@metamask/utils';
import deepFreeze from 'deep-freeze-strict';

import { MiddlewareContext } from './MiddlewareContext';
import {
  isNotification,
  isRequest,
  JsonRpcEngineError,
  stringify,
} from './utils';
import type { JsonRpcCall } from './utils';

export type Next<Request extends JsonRpcCall, Result extends Json | void> = (
  request?: Readonly<Request>,
) => Promise<Readonly<Result> | void>;

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
) => Readonly<Result> | void | Promise<Readonly<Result> | void>;

type RequestState<Request extends JsonRpcCall, Result extends Json | void> = {
  request: Request;
  result: Result | void;
};

type Options<Request extends JsonRpcCall, Result extends Json> = {
  middleware: NonEmptyArray<JsonRpcMiddleware<Request, Result | void>>;
};

type HandleOptions = {
  context?: MiddlewareContext;
};

/**
 * A JSON-RPC request and response processor.
 *
 * Give it a stack of middleware, pass it requests, and get back responses.
 *
 * @template Request - The type of request to handle.
 * @template Result - The type of result to return.
 *
 * @example
 * ```ts
 * const engine = new JsonRpcEngineV2({
 *   middleware,
 * });
 *
 * try {
 *   const result = await engine.handle(request);
 *   // Handle result
 * } catch (error) {
 *   // Handle error
 * }
 * ```
 */
export class JsonRpcEngineV2<
  Request extends JsonRpcCall = JsonRpcCall,
  Result extends Json = Json,
> {
  #middleware: Readonly<
    NonEmptyArray<JsonRpcMiddleware<Request, Result | void>>
  >;

  readonly #makeMiddlewareIterator = (): Iterator<
    JsonRpcMiddleware<Request, Result | void>
  > => this.#middleware[Symbol.iterator]();

  #isDestroyed = false;

  constructor({ middleware }: Options<Request, Result>) {
    this.#middleware = [...middleware];
  }

  /**
   * Handle a JSON-RPC request. A result will be returned.
   *
   * @param request - The JSON-RPC request to handle.
   * @param options - The options for the handle operation.
   * @param options.context - The context to pass to the middleware.
   * @returns The JSON-RPC response.
   */
  async handle(
    request: Request & JsonRpcRequest,
    options?: HandleOptions,
  ): Promise<Result>;

  /**
   * Handle a JSON-RPC notification. No result will be returned.
   *
   * @param notification - The JSON-RPC notification to handle.
   * @param options - The options for the handle operation.
   * @param options.context - The context to pass to the middleware.
   */
  async handle(
    notification: Request & JsonRpcNotification,
    options?: HandleOptions,
  ): Promise<void>;

  async handle(
    request: Request,
    { context }: HandleOptions = {},
  ): Promise<Result | void> {
    const isReq = isRequest(request);
    const { result } = await this.#handle(request, context);

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
   * @param options - The options for the handle operation.
   * @param options.context - The context to pass to the middleware.
   * @returns The JSON-RPC response, if any.
   */
  async handleAny(
    request: JsonRpcCall & Request,
    options?: HandleOptions,
  ): Promise<Result | void> {
    return this.handle(request, options);
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
    context: MiddlewareContext = new MiddlewareContext(),
  ): Promise<{
    result: Result | void;
    request: Readonly<Request>;
  }> {
    this.#assertIsNotDestroyed();

    deepFreeze(originalRequest);

    const state: RequestState<Request, Result> = {
      request: originalRequest,
      result: undefined,
    };
    const middlewareIterator = this.#makeMiddlewareIterator();
    const firstMiddleware = middlewareIterator.next().value;

    const makeNext = this.#makeNextFactory(middlewareIterator, state, context);

    const result = await firstMiddleware({
      request: originalRequest,
      context,
      next: makeNext(),
    });
    this.#updateResult(result, state);

    return state;
  }

  /**
   * Create a factory of `next()` functions for use with a particular request.
   * The factory is recursive, and a new `next()` is created for each middleware
   * invocation.
   *
   * @param middlewareIterator - The iterator of middleware for the current
   * request.
   * @param state - The current values of the request and result.
   * @param context - The context to pass to the middleware.
   * @returns The `next()` function factory.
   */
  #makeNextFactory(
    middlewareIterator: Iterator<JsonRpcMiddleware<Request, Result | void>>,
    state: RequestState<Request, Result>,
    context: MiddlewareContext,
  ): () => Next<Request, Result> {
    const makeNext = (): Next<Request, Result> => {
      let wasCalled = false;

      const next = async (
        request: Request = state.request,
      ): Promise<Result | void> => {
        if (wasCalled) {
          throw new JsonRpcEngineError(
            `Middleware attempted to call next() multiple times for request: ${stringify(request)}`,
          );
        }
        wasCalled = true;

        if (request !== state.request) {
          this.#assertValidNextRequest(state.request, request);
          state.request = deepFreeze(request);
        }

        const { value: middleware, done } = middlewareIterator.next();
        if (done) {
          return undefined;
        }

        const result = await middleware({ request, context, next: makeNext() });
        this.#updateResult(result, state);

        return state.result;
      };
      return next;
    };

    return makeNext;
  }

  /**
   * Validate the result from a middleware and, if it's a new value, update the
   * current result.
   *
   * @param result - The result from the middleware.
   * @param state - The current values of the request and result.
   */
  #updateResult(
    result: Result | void,
    state: RequestState<Request, Result>,
  ): void {
    if (isNotification(state.request) && result !== undefined) {
      throw new JsonRpcEngineError(
        `Result returned for notification: ${stringify(state.request)}`,
      );
    }

    if (result !== undefined && result !== state.result) {
      if (typeof result === 'object' && result !== null) {
        deepFreeze(result);
      }
      state.result = result;
    }
  }

  /**
   * Assert that a request modified by a middleware is valid.
   *
   * @param currentRequest - The current request.
   * @param nextRequest - The next request.
   */
  #assertValidNextRequest(currentRequest: Request, nextRequest: Request): void {
    if (nextRequest.jsonrpc !== currentRequest.jsonrpc) {
      throw new JsonRpcEngineError(
        `Middleware attempted to modify readonly property "jsonrpc" for request: ${stringify(currentRequest)}`,
      );
    }
    if (
      hasProperty(nextRequest, 'id') !== hasProperty(currentRequest, 'id') ||
      // @ts-expect-error - "id" does not exist on notifications, but this will
      // produce the desired behavior at runtime.
      nextRequest.id !== currentRequest.id
    ) {
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
    this.#assertIsNotDestroyed();

    return async ({ request, context, next }) => {
      const { result, request: finalRequest } = await this.#handle(
        request,
        context,
      );
      return result === undefined ? await next(finalRequest) : result;
    };
  }

  /**
   * Destroy the engine. Calls the `destroy()` method of any middleware that has
   * one. Attempting to use the engine after destroying it will throw an error.
   */
  destroy(): void {
    if (this.#isDestroyed) {
      return;
    }

    this.#isDestroyed = true;
    Promise.all(
      this.#middleware.map(async (middleware) => {
        if (
          'destroy' in middleware &&
          typeof middleware.destroy === 'function'
        ) {
          return middleware.destroy();
        }
        return undefined;
      }),
    ).catch((error) => {
      console.error('Error destroying middleware:', error);
    });
    this.#middleware = [] as never;
  }

  #assertIsNotDestroyed(): void {
    if (this.#isDestroyed) {
      throw new JsonRpcEngineError('Engine is destroyed');
    }
  }
}
