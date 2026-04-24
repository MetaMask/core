import { rpcErrors } from '@metamask/rpc-errors';
import type {
  Json,
  JsonRpcParams,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';

import { assertExpectedHooks, selectHooks } from './hookUtils';
import type {
  JsonRpcEngineEndCallback,
  JsonRpcEngineNextCallback,
  JsonRpcMiddleware,
} from './JsonRpcEngine';

/**
 * A middleware function for handling a permitted method.
 *
 * @deprecated Use the v2 handler type from `./v2/createMethodMiddleware` instead.
 */
export type HandlerMiddlewareFunction<
  Hooks,
  Params extends JsonRpcParams,
  Result extends Json,
> = (
  req: JsonRpcRequest<Params>,
  res: PendingJsonRpcResponse<Result>,
  next: JsonRpcEngineNextCallback,
  end: JsonRpcEngineEndCallback,
  hooks: Hooks,
) => void | Promise<void>;

/**
 * We use a mapped object type in order to create a type that requires the
 * presence of the names of all hooks for the given handler.
 * This can then be used to select only the necessary hooks whenever a method
 * is called for purposes of POLA.
 *
 * @deprecated Use the v2 handler type from `./v2/createMethodMiddleware` instead.
 */
export type HookNames<HookMap> = {
  [Property in keyof HookMap]: true;
};

/**
 * A handler for a permitted method.
 *
 * @deprecated Use the v2 `MethodHandler` from `./v2/createMethodMiddleware` instead.
 */
export type MethodHandler<
  Hooks,
  Params extends JsonRpcParams,
  Result extends Json,
> = {
  implementation: HandlerMiddlewareFunction<Hooks, Params, Result>;
  hookNames: HookNames<Hooks>;
  methodNames: string[];
};

/**
 * Options for {@link createMethodMiddlewareFactory}.
 */
export type CreateMethodMiddlewareFactoryOptions = {
  /**
   * Called when a handler throws, before the error is forwarded to `end`.
   * Intended for logging; must not throw.
   */
  onError?: (error: unknown, request: JsonRpcRequest) => void;
};

/**
 * Creates a factory that produces a JSON-RPC method middleware from a set of
 * handlers. The returned factory validates that the hooks it receives match
 * exactly the union of hook names declared by the handlers (no missing, no
 * extraneous), then returns a middleware that dispatches requests by method
 * name.
 *
 * Consolidates the bespoke `makeMethodMiddlewareMaker` implementations from
 * `metamask-extension` and `metamask-mobile`.
 *
 * @deprecated Use `createMethodMiddleware` from `./v2/createMethodMiddleware` instead.
 * @param handlers - The method handlers the middleware should dispatch to.
 * @param options - Optional configuration.
 * @returns A function that takes the required hooks and returns a
 * `JsonRpcMiddleware`.
 */
export function createMethodMiddlewareFactory<Hooks>(
  handlers: MethodHandler<Hooks, JsonRpcParams, Json>[],
  options: CreateMethodMiddlewareFactoryOptions = {},
): (hooks: Hooks) => JsonRpcMiddleware<JsonRpcParams, Json> {
  const { onError } = options;

  const handlerMap = handlers.reduce<
    Record<string, MethodHandler<Hooks, JsonRpcParams, Json>>
  >((map, handler) => {
    for (const methodName of handler.methodNames) {
      map[methodName] = handler;
    }
    return map;
  }, {});

  const expectedHookNames = new Set(
    handlers.flatMap(({ hookNames }) => Object.getOwnPropertyNames(hookNames)),
  );

  return (hooks: Hooks) => {
    assertExpectedHooks(hooks as Record<string, unknown>, expectedHookNames);

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const middleware: JsonRpcMiddleware<JsonRpcParams, Json> = async (
      req,
      res,
      next,
      end,
    ) => {
      const handler = handlerMap[req.method];
      if (handler) {
        const { implementation, hookNames } = handler;
        try {
          return await implementation(
            req,
            res,
            next,
            end,
            selectHooks(hooks, hookNames) as Hooks,
          );
        } catch (error) {
          onError?.(error, req);
          return end(
            error instanceof Error
              ? error
              : rpcErrors.internal({ data: error as Json }),
          );
        }
      }

      return next();
    };

    return middleware;
  };
}
