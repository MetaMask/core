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
import {
  isNotification,
  isRequest,
  JsonRpcEngineError,
  stringify,
} from './utils';
import type { JsonRpcCall } from './utils';

export type Next<Result extends Json | void> = () => Promise<Result | void>;

export type MiddlewareParams<
  Request extends JsonRpcCall,
  Result extends Json | void,
> = {
  request: Request;
  context: MiddlewareContext;
  next: Next<Result>;
};

export type JsonRpcMiddleware<
  Request extends JsonRpcCall,
  Result extends Json | void,
> = (
  params: MiddlewareParams<Request, Result | void>,
) => Result | void | Promise<Result | void>;

type Options<Request extends JsonRpcCall, Result extends Json> = {
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
export class JsonRpcEngineV2<Request extends JsonRpcCall, Result extends Json> {
  readonly #middleware: Readonly<
    NonEmptyArray<JsonRpcMiddleware<Request, Result>>
  >;

  #makeMiddlewareIterator(): Iterator<JsonRpcMiddleware<Request, Result>> {
    return this.#middleware[Symbol.iterator]();
  }

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
    const { result } = await this.#handle(freeze({ ...request }));

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
   * Handle a JSON-RPC request. Throws if a middleware or return handler
   * performs an invalid operation. Permits returning an `undefined` result.
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
    const middlewareIterator = this.#makeMiddlewareIterator();
    const firstMiddleware: JsonRpcMiddleware<Request, Result> =
      middlewareIterator.next().value;

    let request = originalRequest;

    const next: Next<Result> = async (): Promise<Result | void> => {
      const { value: middleware, done } = middlewareIterator.next();
      // Unavoidable forward reference
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      return done ? undefined : await runMiddleware(middleware);
    };

    const runMiddleware = async (
      middleware: JsonRpcMiddleware<Request, Result>,
    ): Promise<Result | void> => {
      let nextResult: Result | void;
      request = await updateRequest(request, async (draft) => {
        nextResult = await middleware({
          request: draft,
          context,
          next,
        });
      });

      // @ts-expect-error - We happen to know that updateRequest awaits the
      // callback, so we know that nextResult is not undefined.
      return nextResult;
    };

    const result = await runMiddleware(firstMiddleware);

    if (isNotification(request) && result !== undefined) {
      throw new JsonRpcEngineError(
        `Result returned for notification: ${stringify(request)}`,
      );
    }

    return {
      result,
      finalRequest: request,
    };
  }

  /**
   * Convert the engine into a JSON-RPC middleware.
   *
   * @returns The JSON-RPC middleware.
   */
  asMiddleware(): JsonRpcMiddleware<Request, Result> {
    return async ({ request, context, next }) => {
      const { result, finalRequest } = await this.#handle(request, context);

      // Propagate any changes to the request to the original request.
      request.method = finalRequest.method;
      if ('params' in finalRequest) {
        request.params = finalRequest.params;
      } else {
        delete request.params;
      }

      return result === undefined ? await next() : result;
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
