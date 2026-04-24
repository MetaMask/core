import type { ActionConstraint } from '@metamask/messenger';
import { Messenger } from '@metamask/messenger';
import { hasProperty } from '@metamask/utils';

/**
 * Returns the subset of the specified `hooks` that are included in the
 * `hookNames` object. This is a Principle of Least Authority (POLA) measure
 * to ensure that each RPC method implementation only has access to the
 * API "hooks" it needs to do its job.
 *
 * @param hooks - The hooks to select from.
 * @param hookNames - The names of the hooks to select.
 * @returns The selected hooks, or `undefined` if `hookNames` is not provided.
 * @template Hooks - The hooks to select from.
 * @template HookName - The names of the hooks to select.
 */
export function selectHooks<Hooks, HookName extends keyof Hooks>(
  hooks: Hooks,
  hookNames?: Record<HookName, true>,
): Pick<Hooks, HookName> | undefined {
  if (hookNames) {
    return Object.keys(hookNames).reduce<Partial<Pick<Hooks, HookName>>>(
      (subset, name) => {
        const hookName = name as HookName;
        subset[hookName] = hooks[hookName];
        return subset;
      },
      {},
    ) as Pick<Hooks, HookName>;
  }
  return undefined;
}

/**
 * Asserts that `hooks` contains exactly the hook names in `expectedHookNames`.
 * Throws on any missing hooks, then on any extraneous hooks.
 *
 * @param hooks - The hooks object to validate.
 * @param expectedHookNames - The expected hook names.
 */
export function assertExpectedHooks(
  hooks: Record<string, unknown>,
  expectedHookNames: Set<string>,
): void {
  const missingHookNames: string[] = [];
  expectedHookNames.forEach((hookName) => {
    if (!hasProperty(hooks, hookName)) {
      missingHookNames.push(hookName);
    }
  });
  if (missingHookNames.length > 0) {
    throw new Error(
      `Missing expected hooks:\n\n${missingHookNames.join('\n')}\n`,
    );
  }

  const extraneousHookNames = Object.getOwnPropertyNames(hooks).filter(
    (hookName) => !expectedHookNames.has(hookName),
  );
  if (extraneousHookNames.length > 0) {
    throw new Error(
      `Received unexpected hooks:\n\n${extraneousHookNames.join('\n')}\n`,
    );
  }
}

/**
 * Creates a per-handler messenger namespaced to `namespace`, and delegates the
 * specified `actionNames` from `rootMessenger` to it. This lets each handler
 * call only the actions it declared, per POLA.
 *
 * @param options - The options.
 * @param options.namespace - The namespace for the handler messenger.
 * @param options.actionNames - Actions to delegate from the root messenger.
 * @param options.rootMessenger - The root messenger to delegate from.
 * @returns The per-handler messenger.
 */
export function createHandlerMessenger<Actions extends ActionConstraint>({
  namespace,
  actionNames,
  rootMessenger,
}: {
  namespace: string;
  actionNames: readonly Actions['type'][] | undefined;
  rootMessenger: Messenger<string, Actions>;
}): Messenger<string, Actions> {
  const handlerMessenger = new Messenger<
    string,
    Actions,
    never,
    typeof rootMessenger
  >({
    namespace,
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    actions: (actionNames ?? []) as Actions['type'][],
    messenger: handlerMessenger,
  });

  return handlerMessenger;
}
