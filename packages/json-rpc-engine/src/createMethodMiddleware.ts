import type { ActionConstraint } from '@metamask/messenger';
import type { Messenger } from '@metamask/messenger';
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
  UnionToIntersection,
} from './v2/utils';

type HandlerActions<Handler> = Handler extends {
  implementation: (...args: infer Args) => unknown;
}
  ? Args extends [
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
      infer HandlerMessenger,
    ]
    ? HandlerMessenger extends Messenger<string, infer Actions>
      ? Actions
      : never
    : never
  : never;

type HandlerHooks<Handler> = Handler extends {
  implementation: (...args: infer Args) => unknown;
}
  ? Args extends [
      unknown,
      unknown,
      unknown,
      unknown,
      infer ArgHooks,
      ...unknown[],
    ]
    ? ArgHooks extends Record<string, unknown>
      ? ArgHooks
      : never
    : never
  : never;

/**
 * A {@link MethodHandler} implementation.
 *
 * @deprecated Use the v2 `createMethodMiddleware` instead.
 */
export type MethodHandlerImplementation<
  Hooks extends Record<string, unknown> = never,
  MessengerActions extends ActionConstraint = never,
  Params extends JsonRpcParams = JsonRpcParams,
  Result extends Json = Json,
  RequestExtras extends Record<string, unknown> = Record<string, unknown>,
> = (
  req: JsonRpcRequest<Params> & RequestExtras,
  res: PendingJsonRpcResponse<Result>,
  next: JsonRpcEngineNextCallback,
  end: JsonRpcEngineEndCallback,
  hooks: Hooks,
  messenger: Messenger<string, MessengerActions>,
) => Promise<void> | void;

/**
 * A handler for {@link createMethodMiddleware}.
 *
 * @deprecated Use the v2 `createMethodMiddleware` instead.
 */
export type MethodHandler<
  Hooks extends Record<string, unknown> = never,
  MessengerActions extends ActionConstraint = never,
  Params extends JsonRpcParams = JsonRpcParams,
  Result extends Json = Json,
  RequestExtras extends Record<string, unknown> = Record<string, unknown>,
> = {
  implementation: MethodHandlerImplementation<
    Hooks,
    MessengerActions,
    Params,
    Result,
    RequestExtras
  >;
} & ([Hooks] extends [never]
  ? { hookNames?: undefined }
  : { hookNames: { [Key in keyof Hooks]: true } }) &
  ([MessengerActions] extends [never]
    ? { actionNames?: undefined }
    : { actionNames: readonly MessengerActions['type'][] });

type AnyMethodHandler = {
  implementation(
    this: void,
    req: JsonRpcRequest,
    res: PendingJsonRpcResponse,
    next: JsonRpcEngineNextCallback,
    end: JsonRpcEngineEndCallback,
    hooks: unknown,
    messenger: unknown,
  ): Promise<void> | void;
  hookNames?: Record<string, true>;
  actionNames?: readonly string[];
};

type CreateMethodMiddlewareBaseOptions<
  Handlers extends Record<string, AnyMethodHandler>,
> = {
  handlers: Handlers;
  // Due to a quirk of TypeScript's inference over generics, the hooks property must
  // be present even if no hooks are needed. Otherwise, TypeScript will fail to infer
  // the correct type for the messenger property. `Record<string, never>` is the
  // (hopefully) least confusing way to satisfy this requirement.
  hooks: [HandlerHooks<Handlers[keyof Handlers]>] extends [never]
    ? Record<string, never>
    : UnionToIntersection<HandlerHooks<Handlers[keyof Handlers]>>;
  /**
   * Called when a handler throws, before the error is forwarded to `end`.
   * Intended for logging; must not throw.
   */
  onError?: (error: unknown, request: JsonRpcRequest) => void;
};

/**
 * Options for {@link createMethodMiddleware}.
 *
 * @deprecated Use the v2 `createMethodMiddleware` instead.
 */
export type CreateMethodMiddlewareOptions<
  Handlers extends Record<string, AnyMethodHandler>,
> = CreateMethodMiddlewareBaseOptions<Handlers> &
  ([HandlerActions<Handlers[keyof Handlers]>] extends [never]
    ? {
        messenger?: undefined;
      }
    : {
        messenger: Messenger<string, HandlerActions<Handlers[keyof Handlers]>>;
      });

type ResolvedHandler = {
  implementation: AnyMethodHandler['implementation'];
  hooks: Record<string, unknown>;
  messenger?: Messenger<string, ActionConstraint> | undefined;
};

/**
 * Create a JSON-RPC middleware that handles the passed JSON-RPC method handlers using the messenger and hooks.
 *
 * @deprecated Use the v2 `createMethodMiddleware` instead.
 * @param options The options.
 * @param options.handlers - The JSON-RPC method handler implementations.
 * @param options.messenger - The messenger to be used by the handlers.
 * @param options.hooks - The hooks to be used by the handlers.
 * @returns A JsonRpcEngineV2 middleware.
 */
export function createMethodMiddleware<
  Handlers extends Record<string, AnyMethodHandler>,
>(
  options: CreateMethodMiddlewareOptions<Handlers>,
): JsonRpcMiddleware<JsonRpcParams, Json> {
  const { messenger: rootMessenger, onError } = options;
  const allHooks = options.hooks as Record<string, unknown>;

  const expectedHookNames = new Set(
    Object.values(options.handlers).flatMap((handler) =>
      handler.hookNames ? Object.getOwnPropertyNames(handler.hookNames) : [],
    ),
  );
  assertExpectedHooks(allHooks, expectedHookNames);

  const handlers = Object.entries(options.handlers).reduce<
    Record<string, ResolvedHandler>
  >((accumulator, [handlerName, handler]) => {
    const handlerHooks = selectHooks(allHooks, handler.hookNames) ?? {};
    const handlerMessenger = createHandlerMessenger<
      HandlerActions<Handlers[keyof Handlers]>
    >({
      namespace: handlerName,
      actionNames: handler.actionNames as
        | readonly HandlerActions<Handlers[keyof Handlers]>['type'][]
        | undefined,
      rootMessenger,
    });

    accumulator[handlerName] = {
      implementation: handler.implementation,
      hooks: handlerHooks,
      messenger: handlerMessenger,
    };
    return accumulator;
  }, {});

  // This should technically use createAsyncMiddleware, but we get around this by catching
  // all handler errors.
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  return async (req, res, next, end) => {
    const handler = handlers[req.method];
    if (!handler) {
      return next();
    }

    const { implementation, hooks: handlerHooks, messenger } = handler;
    try {
      return await implementation(req, res, next, end, handlerHooks, messenger);
    } catch (error) {
      onError?.(error, req);
      return end(
        error instanceof Error
          ? error
          : rpcErrors.internal({ data: error as Json }),
      );
    }
  };
}
