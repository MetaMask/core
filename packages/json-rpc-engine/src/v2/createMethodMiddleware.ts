import { ActionConstraint, Messenger } from '@metamask/messenger';

import { JsonRpcMiddleware, Next } from './JsonRpcEngineV2';
import { ContextConstraint } from './MiddlewareContext';
import {
  Json,
  JsonRpcParams,
  JsonRpcRequest,
  UnionToIntersection,
} from './utils';

// The helpers below seem excessive, but they are required for inference of hooks/actions.
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

export type CreateMethodMiddlewareOptions<
  Handlers extends Record<string, AnyMethodHandler>,
> = {
  handlers: Handlers;
  messenger: Messenger<string, HandlerActions<Handlers[keyof Handlers]>>;
  hooks: UnionToIntersection<HandlerHooks<Handlers[keyof Handlers]>>;
};

type ResolvedHandler = {
  implementation: AnyMethodHandler['implementation'];
  hooks: Record<string, unknown>;
  messenger: Messenger<string, ActionConstraint>;
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

  const handlers = Object.entries(options.handlers).reduce<
    Record<string, ResolvedHandler>
  >((accumulator, [handlerName, handler]) => {
    const handlerHooks = selectHooks(allHooks, handler.hookNames) ?? {};
    const handlerMessenger = new Messenger<
      string,
      HandlerActions<Handlers[keyof Handlers]>,
      never,
      typeof rootMessenger
    >({
      namespace: handlerName,
      parent: rootMessenger,
    });

    rootMessenger.delegate({
      actions: (handler.actionNames ?? []) as HandlerActions<
        Handlers[keyof Handlers]
      >['type'][],
      messenger: handlerMessenger,
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

/**
 * Returns the subset of the specified `hooks` that are included in the
 * `hookNames` object. This is a Principle of Least Authority (POLA) measure
 * to ensure that each RPC method implementation only has access to the
 * API "hooks" it needs to do its job.
 *
 * @param hooks - The hooks to select from.
 * @param hookNames - The names of the hooks to select.
 * @returns The selected hooks.
 * @template Hooks - The hooks to select from.
 * @template HookName - The names of the hooks to select.
 */
export function selectHooks<
  Hooks extends Record<string, unknown>,
  HookName extends keyof Hooks,
>(
  hooks: Hooks,
  hookNames?: Record<HookName, true>,
): Pick<Hooks, HookName> | undefined {
  if (hookNames) {
    return Object.keys(hookNames).reduce<Partial<Pick<Hooks, HookName>>>(
      (hookSubset, _hookName) => {
        const hookName = _hookName as HookName;
        hookSubset[hookName] = hooks[hookName];
        return hookSubset;
      },
      {},
    ) as Pick<Hooks, HookName>;
  }
  return undefined;
}
