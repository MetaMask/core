import type {
  Json,
  JsonRpcRequest,
  JsonRpcNotification,
  NonEmptyArray,
} from '@metamask/utils';
import { freeze, produce } from 'immer';

import {
  makeMiddlewareContext,
  type MiddlewareContext,
} from './MiddlewareContext';
import { isRequest, JsonRpcEngineError, stringify } from './utils';
import type { JsonRpcCall } from './utils';

export const EndNotification = Symbol.for('JsonRpcEngine:EndNotification');

export type ReturnHandler<Result extends Json | void = Json | void> = (
  result: Result | void,
) => Result | void | Promise<Result | void>;

type MiddlewareReturnValue =
  | Json
  | void
  | ReturnHandler
  | typeof EndNotification;

// "EngineResult" being the "Result" generic parameter of the engine
export type MiddlewareResult<EngineResult extends Json | void = Json | void> =
  | EngineResult
  | ReturnHandler<EngineResult>
  | typeof EndNotification
  | void;

export type JsonRpcMiddleware<
  Request extends JsonRpcCall = JsonRpcCall,
  EngineResult extends Json | void = Json | void,
> = (
  request: Request,
  context: MiddlewareContext,
) => MiddlewareResult<EngineResult> | Promise<MiddlewareResult<EngineResult>>;

// The return type of `handle()` and `handleAny()`
type HandledResult<Result extends MiddlewareReturnValue> = Exclude<
  Result,
  typeof EndNotification | ReturnHandler
> | void;

type Options<Request extends JsonRpcCall, Result extends Json | void> = {
  middleware: NonEmptyArray<JsonRpcMiddleware<Request, Result>>;
};

/**
 * A JSON-RPC request and response processor.
 *
 * Give it a stack of middleware, pass it requests, and get back responses.
 *
 * @template Request - The type of request to handle.
 * @template Result - The type of result to return.
 */
export class JsonRpcEngineV2<
  Request extends JsonRpcCall,
  Result extends Json | void,
> {
  static readonly EndNotification = EndNotification;

  readonly #middleware: readonly JsonRpcMiddleware<Request, Result>[];

  constructor({ middleware }: Options<Request, Result>) {
    this.#middleware = [...middleware];
  }

  /**
   * Handle a JSON-RPC request. A result will be returned.
   *
   * @param request - The JSON-RPC request to handle.
   * @returns The JSON-RPC response.
   */
  async handle(
    request: Request & JsonRpcRequest,
  ): Promise<Exclude<HandledResult<Result>, void>>;

  /**
   * Handle a JSON-RPC notification. No result will be returned.
   *
   * @param notification - The JSON-RPC notification to handle.
   */
  async handle(notification: Request & JsonRpcNotification): Promise<void>;

  async handle(request: Request): Promise<HandledResult<Result>> {
    const { result } = await this.#handle(freeze({ ...request }));

    if (result === undefined) {
      throw new JsonRpcEngineError(
        `Nothing ended request: ${stringify(request)}`,
      );
    }

    return result === EndNotification
      ? undefined
      : (result as HandledResult<Result>);
  }

  // This exists because a JsonRpcCall overload of handle() cannot coexist with
  // the other overloads due to type union / overload shenanigans.
  /**
   * Handle a JSON-RPC call. A response will be returned if the call is a request.
   *
   * @param request - The JSON-RPC call to handle.
   * @returns The JSON-RPC response, if any.
   */
  async handleAny(request: Request): Promise<HandledResult<Result>> {
    return this.handle(request);
  }

  /**
   * Handle a JSON-RPC request. Throws if a middleware or return handler
   * performs an invalid operation. Permits returning an `undefined` result.
   *
   * @param request - The JSON-RPC request to handle.
   * @param context - The context to pass to the middleware.
   * @returns The result from the middleware.
   */
  async #handle(
    request: Request,
    context: MiddlewareContext = makeMiddlewareContext(),
  ): Promise<{
    result: MiddlewareResult<Result> | void;
    finalRequest: Readonly<Request>;
  }> {
    const { result, returnHandlers, finalRequest } = await this.#runMiddleware(
      request,
      context,
    );

    return {
      result:
        returnHandlers.length === 0
          ? result
          : await this.#runReturnHandlers(result, returnHandlers),
      finalRequest,
    };
  }

  /**
   * Run the middleware for a request.
   *
   * @param originalRequest - The request to run the middleware for.
   * @param context - The context to pass to the middleware.
   * @returns The result from the middleware.
   */
  async #runMiddleware(
    originalRequest: Request,
    context: MiddlewareContext,
  ): Promise<{
    result: MiddlewareResult<Result>;
    returnHandlers: ReturnHandler<Result>[];
    finalRequest: Readonly<Request>;
  }> {
    const returnHandlers: ReturnHandler<Result>[] = [];
    const isReq = isRequest(originalRequest);

    let request = originalRequest;
    let result: MiddlewareResult<Result> | undefined;

    for (const middleware of this.#middleware) {
      let currentResult: MiddlewareResult<Result> | undefined;
      request = await updateRequest(request, async (draft) => {
        currentResult = await middleware(draft, context);
      });

      if (typeof currentResult === 'function') {
        if (!isReq) {
          throw new JsonRpcEngineError(
            `Middleware returned a return handler for notification: ${stringify(request)}`,
          );
        }

        returnHandlers.push(currentResult);
      } else if (currentResult !== undefined) {
        // Cast required due to unexpected type narrowing
        result = currentResult as Extract<
          Result,
          Json | typeof EndNotification
        >;
        break;
      }
    }

    if (result !== undefined) {
      if (isReq) {
        if (result === EndNotification) {
          throw new JsonRpcEngineError(
            `Request handled as notification: ${stringify(request)}`,
          );
        }
      } else if (result !== EndNotification) {
        throw new JsonRpcEngineError(
          `Notification handled as request: ${stringify(request)}`,
        );
      }
    }

    return {
      result,
      returnHandlers,
      finalRequest: request,
    };
  }

  /**
   * Run the return handlers for a result. May or may not return a new result.
   *
   * @param initialResult - The initial result from the middleware.
   * @param returnHandlers - The return handlers to run.
   * @returns The final result.
   */
  async #runReturnHandlers(
    initialResult: MiddlewareResult<Result> | void,
    returnHandlers: readonly ReturnHandler<Result>[],
  ): Promise<Result | void> {
    let result = initialResult;
    // Run return handlers in reverse order of registration.
    for (let i = returnHandlers.length - 1; i >= 0; i--) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const returnHandler = returnHandlers[i]!;

      result = await produce(result, async (draft: Result) => {
        // Return handlers can either modify the result in place or return a
        // new value.
        const newResult = await returnHandler(draft);
        return newResult === undefined ? draft : newResult;
      });
    }

    return result as Result | void;
  }

  /**
   * Convert the engine into a JSON-RPC middleware.
   *
   * @returns The JSON-RPC middleware.
   */
  asMiddleware(): JsonRpcMiddleware<Request> {
    return async (request, context) => {
      const { result, finalRequest } = await this.#handle(request, context);

      // Propagate any changes to the request to the original request.
      request.method = finalRequest.method;
      if ('params' in finalRequest) {
        request.params = finalRequest.params;
      } else {
        delete request.params;
      }

      return result as MiddlewareResult;
    };
  }
}

// Properties of a request that you're not allowed to modify.
const readonlyProps = ['id', 'jsonrpc'] as const;

/**
 * Update a request using `immer`. Middleware may update the `method` and
 * `params` properties, but not the `id` or `jsonrpc` properties. The request
 * object must be updated in place.
 *
 * @param request - The request to update.
 * @param recipe - The recipe function.
 * @returns The updated request.
 */
async function updateRequest<Request extends JsonRpcCall>(
  request: Request,
  recipe: (request: Request) => Promise<void>,
): Promise<Request> {
  return produce(request, async (draft) => {
    const draftProxy = new Proxy(draft, {
      set(target, prop, value) {
        if (readonlyProps.includes(prop as (typeof readonlyProps)[number])) {
          throw new JsonRpcEngineError(
            `Middleware attempted to modify readonly property "${String(prop)}" for request: ${stringify(request)}`,
          );
        }
        return Reflect.set(target, prop, value);
      },
    });

    // The Jest parser encounters "TS2589: Type instantiation is excessively
    // deep and possibly infinite."
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return recipe(draftProxy as any);
  });
}
