import { ActionConstraint, Messenger } from '@metamask/messenger';

import { JsonRpcMiddleware, Next } from './JsonRpcEngineV2';
import { ContextConstraint } from './MiddlewareContext';
import { Json, JsonRpcParams, JsonRpcRequest } from './utils';

type HandlerActions<Handler> =
  Handler extends MethodHandler<any, any, infer Actions, any> ? Actions : never;

export type MethodHandlerImplementation<
  Hooks extends Record<string, unknown> = Record<string, never>,
  Parameters extends JsonRpcParams = JsonRpcParams,
  MessengerActions extends ActionConstraint = never,
  Context extends ContextConstraint = ContextConstraint,
> = (options: {
  request: Readonly<JsonRpcRequest<Parameters>>;
  context: Context;
  next: Next<JsonRpcRequest>;
  messenger: Messenger<string, MessengerActions>;
  hooks: Hooks;
}) => Promise<Json> | Json;

export type MethodHandler<
  Hooks extends Record<string, unknown> = Record<string, unknown>,
  Parameters extends JsonRpcParams = JsonRpcParams,
  MessengerActions extends ActionConstraint = never,
  Context extends ContextConstraint = ContextConstraint,
> = {
  implementation: MethodHandlerImplementation<
    Hooks,
    Parameters,
    MessengerActions,
    Context
  >;
  hookNames?: { [Key in keyof Hooks]: true };
  actionNames?: MessengerActions['type'][];
};

export type CreateMethodMiddlewareOptions<
  Handlers extends Record<string, MethodHandler>,
> = {
  handlers: Record<string, MethodHandler>;
  messenger: Messenger<string, HandlerActions<Handlers[keyof Handlers]>>;
  hooks: Record<string, unknown>;
};

type ResolvedHandler<
  Hooks extends Record<string, unknown> = Record<string, unknown>,
  Parameters extends JsonRpcParams = JsonRpcParams,
  MessengerActions extends ActionConstraint = never,
  Context extends ContextConstraint = ContextConstraint,
> = {
  implementation: MethodHandlerImplementation<
    Hooks,
    Parameters,
    MessengerActions,
    Context
  >;
  hooks: Record<string, unknown>;
  messenger: Messenger<string, MessengerActions>;
};

export function createMethodMiddleware<
  Handlers extends Record<string, MethodHandler>,
  Context extends ContextConstraint,
>(
  options: CreateMethodMiddlewareOptions<Handlers>,
): JsonRpcMiddleware<JsonRpcRequest, Json, Context> {
  const { messenger: rootMessenger, hooks: allHooks } = options;

  const handlers = Object.entries(options.handlers).reduce<
    Record<string, ResolvedHandler>
  >((accumulator, [handlerName, handler]) => {
    const handlerHooks = selectHooks(allHooks, handler.hookNames) ?? {};
    const handlerMessenger = new Messenger({
      namespace: handlerName,
      parent: rootMessenger,
    });

    rootMessenger.delegate({
      actions: handler.actionNames ?? [],
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
