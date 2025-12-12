import { hasProperty } from '@metamask/utils';
import type {
  Json,
  JsonRpcRequest,
  JsonRpcNotification,
  NonEmptyArray,
} from '@metamask/utils';
import deepFreeze from 'deep-freeze-strict';

import type {
  ContextConstraint,
  InferKeyValues,
  MergeContexts,
} from './MiddlewareContext';
import { MiddlewareContext } from './MiddlewareContext';
import {
  isNotification,
  isRequest,
  JsonRpcEngineError,
  stringify,
} from './utils';
import type { JsonRpcCall } from './utils';

// Helper to forbid `id` on notifications
type WithoutId<Request extends JsonRpcCall> = Request & { id?: never };

// Helper to enable JsonRpcCall overload of handle()
type MixedParam<Request extends JsonRpcCall> = [
  Extract<Request, JsonRpcRequest>,
] extends [never]
  ? never
  : [Extract<Request, JsonRpcNotification>] extends [never]
    ? never
    :
        | Extract<Request, JsonRpcRequest>
        | WithoutId<Extract<Request, JsonRpcNotification>>;

export type ResultConstraint<Request extends JsonRpcCall> =
  Request extends JsonRpcRequest ? Json : void;

export type Next<Request extends JsonRpcCall> = (
  request?: Readonly<Request>,
) => Promise<Readonly<ResultConstraint<Request>> | undefined>;

export type MiddlewareParams<
  Request extends JsonRpcCall = JsonRpcCall,
  Context extends ContextConstraint = MiddlewareContext,
> = {
  request: Readonly<Request>;
  context: Context;
  next: Next<Request>;
};

export type JsonRpcMiddleware<
  Request extends JsonRpcCall = JsonRpcCall,
  Result extends ResultConstraint<Request> = ResultConstraint<Request>,
  Context extends ContextConstraint = MiddlewareContext,
> = (
  params: MiddlewareParams<Request, Context>,
) => Readonly<Result> | undefined | Promise<Readonly<Result> | undefined>;

type RequestState<Request extends JsonRpcCall> = {
  request: Request;
  result: Readonly<ResultConstraint<Request>> | undefined;
};

/**
 * The options for the JSON-RPC request/notification handling operation.
 */
export type HandleOptions<Context extends ContextConstraint> = {
  context?: Context | InferKeyValues<Context>;
};

type ConstructorOptions<
  Request extends JsonRpcCall,
  Context extends MiddlewareContext,
> = {
  middleware: NonEmptyArray<
    JsonRpcMiddleware<Request, ResultConstraint<Request>, Context>
  >;
};

/**
 * The request type of a middleware.
 */
export type RequestOf<Middleware> =
  Middleware extends JsonRpcMiddleware<
    infer Request,
    ResultConstraint<infer Request>,
    // Non-polluting `any` constraint.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >
    ? Request
    : never;

type ContextOf<Middleware> =
  // Non-polluting `any` constraint.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Middleware extends JsonRpcMiddleware<any, ResultConstraint<any>, infer C>
    ? C
    : never;

/**
 * A constraint for {@link JsonRpcMiddleware} generic parameters.
 */
// Non-polluting `any` constraint.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type MiddlewareConstraint = JsonRpcMiddleware<
  any,
  ResultConstraint<any>,
  MiddlewareContext<any>
>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The context supertype of a middleware type.
 */
export type MergedContextOf<Middleware extends MiddlewareConstraint> =
  MergeContexts<ContextOf<Middleware>>;

const INVALID_ENGINE = Symbol('Invalid engine');

/**
 * An internal type for invalid engines that explains why the engine is invalid.
 *
 * @template Message - The message explaining why the engine is invalid.
 */
type InvalidEngine<Message extends string> = { [INVALID_ENGINE]: Message };

/**
 * A JSON-RPC request and response processor.
 *
 * Give it a stack of middleware, pass it requests, and get back responses.
 *
 * #### Requests vs. notifications
 *
 * JSON-RPC requests come in two flavors:
 *
 * - [Requests](https://www.jsonrpc.org/specification#request_object), i.e. request objects _with_ an `id`
 * - [Notifications](https://www.jsonrpc.org/specification#notification), i.e. request objects _without_ an `id`
 *
 * For requests, one of the engine's middleware must "end" the request by returning a non-`undefined` result,
 * or {@link handle} will throw an error:
 *
 * For notifications, on the other hand, one of the engine's middleware must return `undefined` to end the request,
 * and any non-`undefined` return values will cause an error:
 *
 * @template Request - The type of request to handle.
 * @template Result - The type of result to return.
 *
 * @example
 * ```ts
 * const engine = JsonRpcEngineV2.create({
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
  Context extends ContextConstraint = MiddlewareContext,
> {
  #middleware: Readonly<
    NonEmptyArray<
      JsonRpcMiddleware<Request, ResultConstraint<Request>, Context>
    >
  >;

  #isDestroyed = false;

  // See .create() for why this is private.
  // eslint-disable-next-line no-restricted-syntax
  private constructor({ middleware }: ConstructorOptions<Request, Context>) {
    this.#middleware = [...middleware];
  }

  // We use a static factory method in order to construct a supertype of all middleware contexts,
  // which enables us to instantiate an engine despite different middleware expecting different
  // context types.
  /**
   * Create a new JSON-RPC engine.
   *
   * @throws If the middleware array is empty.
   * @param options - The options for the engine.
   * @param options.middleware - The middleware to use.
   * @returns The JSON-RPC engine.
   */
  static create<
    Middleware extends JsonRpcMiddleware<
      // Non-polluting `any` constraint.
      /* eslint-disable @typescript-eslint/no-explicit-any */
      any,
      ResultConstraint<any>,
      any
      /* eslint-enable @typescript-eslint/no-explicit-any */
    > = JsonRpcMiddleware,
  >({
    middleware,
  }: {
    middleware: Middleware[];
  }): MergedContextOf<Middleware> extends never
    ? InvalidEngine<'Some middleware have incompatible context types'>
    : JsonRpcEngineV2<RequestOf<Middleware>, MergedContextOf<Middleware>> {
    // We can't use NonEmptyArray for the params because it ruins type inference.
    if (middleware.length === 0) {
      throw new JsonRpcEngineError('Middleware array cannot be empty');
    }

    type MergedContext = MergedContextOf<Middleware>;
    type InputRequest = RequestOf<Middleware>;
    const mw = middleware as unknown as NonEmptyArray<
      JsonRpcMiddleware<
        InputRequest,
        ResultConstraint<InputRequest>,
        MergedContext
      >
    >;

    return new JsonRpcEngineV2<InputRequest, MergedContext>({
      middleware: mw,
    }) as MergedContext extends never
      ? InvalidEngine<'Some middleware have incompatible context types'>
      : JsonRpcEngineV2<InputRequest, MergedContext>;
  }

  /**
   * Handle a JSON-RPC request.
   *
   * @param request - The JSON-RPC request to handle.
   * @param options - The options for the handle operation.
   * @param options.context - The context to pass to the middleware.
   * @returns The JSON-RPC response.
   */
  async handle(
    request: Extract<Request, JsonRpcRequest> extends never
      ? never
      : Extract<Request, JsonRpcRequest>,
    options?: HandleOptions<Context>,
  ): Promise<
    Extract<Request, JsonRpcRequest> extends never
      ? never
      : ResultConstraint<Request>
  >;

  /**
   * Handle a JSON-RPC notification. Notifications do not return a result.
   *
   * @param notification - The JSON-RPC notification to handle.
   * @param options - The options for the handle operation.
   * @param options.context - The context to pass to the middleware.
   */
  async handle(
    notification: Extract<Request, JsonRpcNotification> extends never
      ? never
      : WithoutId<Extract<Request, JsonRpcNotification>>,
    options?: HandleOptions<Context>,
  ): Promise<
    Extract<Request, JsonRpcNotification> extends never
      ? never
      : ResultConstraint<Request>
  >;

  /**
   * Handle a JSON-RPC call, i.e. request or notification. Requests return a
   * result, notifications do not.
   *
   * @param call - The JSON-RPC call to handle.
   * @param options - The options for the handle operation.
   * @param options.context - The context to pass to the middleware.
   * @returns The JSON-RPC response, or `undefined` if the call is a notification.
   */
  async handle(
    call: MixedParam<Request>,
    options?: HandleOptions<Context>,
  ): Promise<ResultConstraint<Request> | void>;

  async handle(
    request: Request,
    { context }: HandleOptions<Context> = {},
  ): Promise<Readonly<ResultConstraint<Request>> | void> {
    const isReq = isRequest(request);
    const { result } = await this.#handle(request, context);

    if (isReq && result === undefined) {
      throw new JsonRpcEngineError(
        `Nothing ended request: ${stringify(request)}`,
      );
    }
    return result;
  }

  /**
   * Handle a JSON-RPC request. Throws if a middleware performs an invalid
   * operation. Permits returning an `undefined` result.
   *
   * @param originalRequest - The JSON-RPC request to handle.
   * @param rawContext - The context to pass to the middleware.
   * @returns The result from the middleware.
   */
  async #handle(
    originalRequest: Request,
    rawContext:
      | Context
      | InferKeyValues<Context> = new MiddlewareContext() as Context,
  ): Promise<RequestState<Request>> {
    this.#assertIsNotDestroyed();

    deepFreeze(originalRequest);

    const state: RequestState<Request> = {
      request: originalRequest,
      result: undefined,
    };
    const middlewareIterator = this.#makeMiddlewareIterator();
    const firstMiddleware = middlewareIterator.next().value;
    const context = MiddlewareContext.isInstance(rawContext)
      ? rawContext
      : (new MiddlewareContext(rawContext) as Context);

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
    middlewareIterator: Iterator<
      JsonRpcMiddleware<Request, ResultConstraint<Request>, Context>
    >,
    state: RequestState<Request>,
    context: Context,
  ): () => Next<Request> {
    const makeNext = (): Next<Request> => {
      let wasCalled = false;

      const next = async (
        request: Request = state.request,
      ): Promise<Readonly<ResultConstraint<Request>> | undefined> => {
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

        const { value: nextMiddleware, done } = middlewareIterator.next();
        if (done) {
          // This will cause the last middleware to return `undefined`. See the class
          // JSDoc or package README for more details.
          return undefined;
        }

        const result = await nextMiddleware({
          request,
          context,
          next: makeNext(),
        });
        this.#updateResult(result, state);

        return state.result;
      };
      return next;
    };

    return makeNext;
  }

  #makeMiddlewareIterator(): Iterator<
    JsonRpcMiddleware<Request, ResultConstraint<Request>, Context>
  > {
    return this.#middleware[Symbol.iterator]();
  }

  /**
   * Validate the result from a middleware and, if it's a new value, update the
   * current result.
   *
   * @param result - The result from the middleware.
   * @param state - The current values of the request and result.
   */
  #updateResult(
    result:
      | Readonly<ResultConstraint<Request>>
      | ResultConstraint<Request>
      | void,
    state: RequestState<Request>,
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
      // @ts-expect-error - "id" does not exist on notifications, but we can still
      // check the value of the property at runtime.
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
  asMiddleware(): JsonRpcMiddleware<
    Request,
    ResultConstraint<Request>,
    Context
  > {
    this.#assertIsNotDestroyed();

    return async ({ request, context, next }) => {
      const { result, request: finalRequest } = await this.#handle(
        request,
        context,
      );

      return result ?? (await next(finalRequest));
    };
  }

  /**
   * Destroy the engine. Calls the `destroy()` method of any middleware that has
   * one. Attempting to use the engine after destroying it will throw an error.
   */
  async destroy(): Promise<void> {
    if (this.#isDestroyed) {
      return;
    }
    this.#isDestroyed = true;

    const destructionPromise = Promise.all(
      this.#middleware.map(async (middleware) => {
        if (
          // Intentionally using `in` to walk the prototype chain.
          'destroy' in middleware &&
          typeof middleware.destroy === 'function'
        ) {
          return middleware.destroy();
        }
        return undefined;
      }),
    );
    this.#middleware = [] as never;
    await destructionPromise;
  }

  #assertIsNotDestroyed(): void {
    if (this.#isDestroyed) {
      throw new JsonRpcEngineError('Engine is destroyed');
    }
  }
}
