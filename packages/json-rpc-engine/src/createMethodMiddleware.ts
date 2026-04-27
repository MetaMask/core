import type { ActionConstraint } from '@metamask/messenger';
import { Messenger } from '@metamask/messenger';
import { rpcErrors } from '@metamask/rpc-errors';
import type {
  Json,
  JsonRpcParams,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';

import type {
  JsonRpcEngineEndCallback,
  JsonRpcEngineNextCallback,
  JsonRpcMiddleware,
} from './JsonRpcEngine';
import {
  assertExpectedHooks,
  createHandlerMessenger,
  selectHooks,
} from './middlewareUtils';

/**
 * A middleware function for handling a permitted method.
 *
 * @deprecated Use the v2 handler type from `./v2` instead.
 */
export type HandlerMiddlewareFunction<
  Hooks extends Record<string, unknown> = never,
  MessengerActions extends ActionConstraint = never,
  Params extends JsonRpcParams = JsonRpcParams,
  Result extends Json = Json,
> = (
  req: JsonRpcRequest<Params>,
  res: PendingJsonRpcResponse<Result>,
  next: JsonRpcEngineNextCallback,
  end: JsonRpcEngineEndCallback,
  hooks: Hooks,
  messenger: Messenger<string, MessengerActions>,
) => void | Promise<void>;

/**
 * We use a mapped object type in order to create a type that requires the
 * presence of the names of all hooks for the given handler.
 * This can then be used to select only the necessary hooks whenever a method
 * is called for purposes of POLA.
 *
 * @deprecated Use the v2 handler type from `./v2` instead.
 */
export type HookNames<HookMap> = {
  [Property in keyof HookMap]: true;
};

/**
 * A handler for a permitted method.
 *
 * @deprecated Use the v2 `MethodHandler` from `./v2` instead.
 */
export type MethodHandler<
  Hooks extends Record<string, unknown> = never,
  MessengerActions extends ActionConstraint = never,
  Params extends JsonRpcParams = JsonRpcParams,
  Result extends Json = Json,
> = {
  implementation: HandlerMiddlewareFunction<
    Hooks,
    MessengerActions,
    Params,
    Result
  >;
  methodNames: string[];
} & ([Hooks] extends [never]
  ? { hookNames?: undefined }
  : { hookNames: HookNames<Hooks> }) &
  ([MessengerActions] extends [never]
    ? { actionNames?: undefined }
    : { actionNames: readonly MessengerActions['type'][] });

/**
 * Options for {@link createMethodMiddlewareFactory}.
 */
export type CreateMethodMiddlewareFactoryOptions<
  MessengerActions extends ActionConstraint = never,
> = {
  /**
   * Called when a handler throws, before the error is forwarded to `end`.
   * Intended for logging; must not throw.
   */
  onError?: (error: unknown, request: JsonRpcRequest) => void;
} & ([MessengerActions] extends [never]
  ? {
      /**
       * The root messenger. A per-handler messenger, namespaced to each handler
       * and delegated the actions the handler declared, is passed to the
       * handler's `implementation` at call time. Optional when no handler
       * declares any actions.
       */
      messenger?: Messenger<string, never> | undefined;
    }
  : {
      /**
       * The root messenger. A per-handler messenger, namespaced to each handler
       * and delegated the actions the handler declared, is passed to the
       * handler's `implementation` at call time.
       */
      messenger: Messenger<string, MessengerActions>;
    });

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
 * @deprecated Use `createMethodMiddleware` from `./v2` instead.
 * @param handlers - The method handlers the middleware should dispatch to.
 * @param options - Options including the root messenger.
 * @returns A function that takes the required hooks and returns a
 * `JsonRpcMiddleware`.
 */
export function createMethodMiddlewareFactory<
  Hooks extends Record<string, unknown> = never,
  MessengerActions extends ActionConstraint = never,
>(
  handlers: MethodHandler<Hooks, MessengerActions>[],
  options?: CreateMethodMiddlewareFactoryOptions<MessengerActions>,
): [Hooks] extends [never]
  ? () => JsonRpcMiddleware<JsonRpcParams, Json>
  : (hooks: Hooks) => JsonRpcMiddleware<JsonRpcParams, Json> {
  const { onError } = options ?? {};
  const rootMessenger =
    options?.messenger ??
    new Messenger<string, MessengerActions>({
      namespace: 'json-rpc-engine',
    });

  type ResolvedHandler = {
    implementation: HandlerMiddlewareFunction<
      Hooks,
      MessengerActions,
      JsonRpcParams,
      Json
    >;
    hooks: Hooks;
    messenger: Messenger<string, MessengerActions>;
  };

  const baseHandlers = handlers.map((handler) => ({
    handler,
    messenger: createHandlerMessenger<MessengerActions>({
      namespace: handler.methodNames.join(':'),
      actionNames: handler.actionNames,
      rootMessenger,
    }),
  }));

  const expectedHookNames = new Set(
    handlers.flatMap((handler) =>
      handler.hookNames ? Object.getOwnPropertyNames(handler.hookNames) : [],
    ),
  );

  return ((hooks?: Hooks) => {
    assertExpectedHooks(
      (hooks ?? {}) as Record<string, unknown>,
      expectedHookNames,
    );

    const resolvedHandlers = baseHandlers.reduce<
      Record<string, ResolvedHandler>
    >((map, { handler, messenger }) => {
      const handlerHooks = (selectHooks(hooks, handler.hookNames) ??
        {}) as Hooks;
      for (const methodName of handler.methodNames) {
        map[methodName] = {
          implementation: handler.implementation,
          hooks: handlerHooks,
          messenger,
        };
      }
      return map;
    }, {});

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const middleware: JsonRpcMiddleware<JsonRpcParams, Json> = async (
      req,
      res,
      next,
      end,
    ) => {
      const resolved = resolvedHandlers[req.method];
      if (resolved) {
        const { implementation, hooks: handlerHooks, messenger } = resolved;
        try {
          return await implementation(
            req,
            res,
            next,
            end,
            handlerHooks,
            messenger,
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
  }) as [Hooks] extends [never]
    ? () => JsonRpcMiddleware<JsonRpcParams, Json>
    : (hooks: Hooks) => JsonRpcMiddleware<JsonRpcParams, Json>;
}
