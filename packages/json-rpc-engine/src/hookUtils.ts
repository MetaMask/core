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
