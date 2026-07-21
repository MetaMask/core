import { ActionConstraint, Messenger } from '@metamask/messenger';

import { JsonRpcMiddleware, Next } from './JsonRpcEngineV2';
import { ContextConstraint } from './MiddlewareContext';
import {
  assertExpectedHooks,
  createHandlerMessenger,
  selectHooks,
  Json,
  JsonRpcParams,
  JsonRpcRequest,
  UnionToIntersection,
} from './utils';

type HandlerActions<Handler> = Handler extends {
  implementation: (options: infer Options) => unknown;
}
  ? Options extends { messenger: Messenger<string, infer Actions> }
    ? Actions
    : never
  : never;

type HandlerHooks<Handler> = Handler extends {
  implementation: (options: infer Options) => unknown;
}
  ? Options extends { hooks: infer Hooks }
    ? Hooks
    : never
  : never;

/**
 * A `JsonRpcEngineV2` method middleware handler.
 */
export type MethodHandler<
  Hooks extends Record<string, unknown> = never,
  MessengerActions extends ActionConstraint = never,
  Parameters extends JsonRpcParams = JsonRpcParams,
  Result extends Json = Json,
  Context extends ContextConstraint = ContextConstraint,
> = {
  implementation: (options: {
    request: Readonly<JsonRpcRequest<Parameters>>;
    context: Context;
    next: Next<JsonRpcRequest>;
    messenger: Messenger<string, MessengerActions>;
    hooks: Hooks;
  }) => Promise<Result> | Result;
} & ([Hooks] extends [never]
  ? { hookNames?: undefined }
  : { hookNames: { [Key in keyof Hooks]: true } }) &
  ([MessengerActions] extends [never]
    ? { actionNames?: undefined }
    : { actionNames: MessengerActions['type'][] });

type AnyMethodHandler = {
  implementation(
    this: void,
    options: {
      request: Readonly<JsonRpcRequest>;
      context: ContextConstraint;
      next: Next<JsonRpcRequest>;
      messenger: unknown;
      hooks: unknown;
    },
  ): Promise<Json> | Json;
  hookNames?: Record<string, true>;
  actionNames?: readonly string[];
};

type CreateMethodMiddlewareBaseOptions<
  Handlers extends Record<string, AnyMethodHandler>,
> = {
  handlers: Handlers;
  hooks: [HandlerHooks<Handlers[keyof Handlers]>] extends [never]
    ? Record<string, never>
    : UnionToIntersection<HandlerHooks<Handlers[keyof Handlers]>>;
};

/**
 * Options for {@link createMethodMiddleware}.
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
 * @param options The options.
 * @param options.handlers - The JSON-RPC method handler implementations.
 * @param options.messenger - The messenger to be used by the handlers.
 * @param options.hooks - The hooks to be used by the handlers.
 * @returns A JsonRpcEngineV2 middleware.
 */
export function createMethodMiddleware<
  Handlers extends Record<string, AnyMethodHandler>,
  Context extends ContextConstraint,
>(
  options: CreateMethodMiddlewareOptions<Handlers>,
): JsonRpcMiddleware<JsonRpcRequest, Json, Context> {
  const { messenger: rootMessenger } = options;
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

  return ({ request, context, next }) => {
    const handler = handlers[request.method];
    if (handler === undefined) {
      return next();
    }

    const { implementation, hooks, messenger } = handler;

    return implementation({ request, context, next, hooks, messenger });
  };
}
