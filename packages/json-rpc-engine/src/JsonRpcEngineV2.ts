import type {
  Json,
  JsonRpcRequest,
  JsonRpcNotification,
  NonEmptyArray,
} from '@metamask/utils';
import { freeze, produce } from 'immer';

import { isRequest, JsonRpcEngineError, stringify } from './utils';
import type { JsonRpcCall } from './utils';

export const EndNotification = Symbol.for('JsonRpcEngine:EndNotification');

type Context = Record<string, unknown>;

type ReturnHandler<Result extends Json = Json> = (
  result: Result,
) => void | Result | Promise<void | Result>;

type MiddlewareResultConstraint<Request extends JsonRpcCall> =
  Request extends JsonRpcNotification
    ? Request extends JsonRpcRequest
      ? void | Json | ReturnHandler
      : void | typeof EndNotification
    : void | Json | ReturnHandler;

type HandledResult<Result extends MiddlewareResultConstraint<JsonRpcCall>> =
  Exclude<Result, typeof EndNotification> | void;

export type JsonRpcMiddleware<
  Request extends JsonRpcCall,
  Result extends MiddlewareResultConstraint<Request>,
> = (request: Request, context: Context) => Result | Promise<Result>;

type Options<
  Request extends JsonRpcCall,
  Result extends MiddlewareResultConstraint<Request>,
> = {
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
  Result extends MiddlewareResultConstraint<Request>,
> {
  static readonly EndNotification = EndNotification;

  readonly #middleware: readonly JsonRpcMiddleware<Request, Result>[];

  constructor({ middleware }: Options<Request, Result>) {
    this.#middleware = [...middleware];
  }

  /**
   * Handle a JSON-RPC request. A response will be returned.
   *
   * @param request - The JSON-RPC request to handle.
   * @returns The JSON-RPC response.
   */
  async handle(
    request: Request & JsonRpcRequest,
  ): Promise<Exclude<HandledResult<Result>, void>>;

  /**
   * Handle a JSON-RPC notification. No response will be returned.
   *
   * @param notification - The JSON-RPC notification to handle.
   */
  async handle(notification: Request & JsonRpcNotification): Promise<void>;

  async handle(request: Request): Promise<HandledResult<Result>> {
    const result = await this.#handle(request);
    return result === EndNotification
      ? undefined
      : (result as HandledResult<Result>);
  }

  // This exists because a JsonRpcCall overload of handle() cannot coexist with
  // the other overloads due to type union / overload shenanigans.
  /**
   * Handle a JSON-RPC call. A response will be returned if the call is a request.
   *
   * @param call - The JSON-RPC call to handle.
   * @returns The JSON-RPC response, if any.
   */
  async handleAny(call: Request): Promise<Extract<Result, Json> | void> {
    return this.handle(call);
  }

  async #handle(request: Request, context: Context = {}): Promise<Result> {
    const { result, returnHandlers, finalRequest } = await this.#runMiddleware(
      request,
      context,
    );

    return await this.#runReturnHandlers(result, returnHandlers, finalRequest);
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
    context: Context,
  ): Promise<{
    result: Extract<Result, Json | typeof EndNotification>;
    returnHandlers: ReturnHandler[];
    finalRequest: Readonly<Request>;
  }> {
    const returnHandlers: ReturnHandler[] = [];

    let request = freeze({ ...originalRequest });
    let result: Extract<Result, Json | typeof EndNotification> | undefined;

    for (const middleware of this.#middleware) {
      let currentResult: Result | undefined;
      request = await updateRequest(request, async (draft) => {
        currentResult = await middleware(draft, context);
      });

      if (typeof currentResult === 'function') {
        returnHandlers.push(currentResult);
      } else if (currentResult !== undefined) {
        // Cast required due to incorrect type narrowing
        result = currentResult as Extract<
          Result,
          Json | typeof EndNotification
        >;
        break;
      }
    }

    if (result === undefined) {
      throw new JsonRpcEngineError(
        `Nothing ended request: ${stringify(request)}`,
      );
    } else if (isRequest(originalRequest)) {
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
   * @param request - The request that caused the result. Only used for logging.
   * Will not be passed to the return handlers.
   * @returns The final result.
   */
  async #runReturnHandlers(
    initialResult: Extract<Result, Json | typeof EndNotification>,
    returnHandlers: ReturnHandler[],
    request: Readonly<Request>,
  ): Promise<Result> {
    if (returnHandlers.length === 0) {
      return initialResult;
    }

    if (initialResult === EndNotification) {
      throw new JsonRpcEngineError(
        `Received return handlers for notification: ${stringify(request)}`,
      );
    }

    let result = initialResult;
    for (const returnHandler of returnHandlers) {
      result = await produce(result, async (draft: Json) => {
        return await returnHandler(draft);
      });
    }

    return result;
  }

  /**
   * Convert the engine into a JSON-RPC middleware.
   *
   * @returns The JSON-RPC middleware.
   */
  asMiddleware(): JsonRpcMiddleware<Request, Result> {
    return async (request, context) => this.#handle(request, context);
  }
}

// Properties of a request that you're not allowed to modify.
const readonlyProps = ['id', 'jsonrpc'] as const;

/**
 * Update a request using Immer.
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
    await recipe(draftProxy as any);
  });
}
