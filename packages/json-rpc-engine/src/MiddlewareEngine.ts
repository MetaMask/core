import type {
  Json,
  JsonRpcRequest,
  JsonRpcNotification,
  NonEmptyArray,
} from '@metamask/utils';
import { produce } from 'immer';

import { isRequest, stringify } from './utils';
import type { JsonRpcCall } from './utils';

export const EndNotification = Symbol.for('MiddlewareEngine:EndNotification');

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

export class MiddlewareEngine<
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
   * @param request - The JSON-RPC call to handle.
   * @returns The JSON-RPC response, if any.
   */
  async handleAny(request: Request): Promise<Extract<Result, Json> | void> {
    return this.handle(request);
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

    let request = structuredClone(originalRequest);
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
      throw new Error(`Nothing ended call:\n${stringify(request)}`);
    } else if (isRequest(originalRequest)) {
      if (result === EndNotification) {
        throw new Error(
          `Request handled as notification:\n${stringify(request)}`,
        );
      }
    } else if (result !== EndNotification) {
      throw new Error(
        `Notification handled as request:\n${stringify(request)}`,
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
      throw new Error(
        `Received return handlers for notification:\n${stringify(request)}`,
      );
    }

    let finalResult = initialResult as Json;
    for (const returnHandler of returnHandlers) {
      finalResult = await produce(finalResult, async (draft: Json) => {
        return await returnHandler(draft);
      });
    }

    return finalResult as Extract<Result, Json>;
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
          throw new TypeError(
            `Cannot assign to read only property '${String(prop)}'`,
          );
        }
        return Reflect.set(target, prop, value);
      },
    });
    await recipe(draftProxy as Request);
  });
}
