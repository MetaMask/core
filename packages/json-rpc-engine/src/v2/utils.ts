import type { ActionConstraint } from '@metamask/messenger';
import { Messenger } from '@metamask/messenger';
import { hasProperty, isObject } from '@metamask/utils';
import type {
  JsonRpcNotification,
  JsonRpcParams,
  JsonRpcRequest,
} from '@metamask/utils';

export type {
  Json,
  JsonRpcParams,
  JsonRpcRequest,
  JsonRpcNotification,
} from '@metamask/utils';

export type JsonRpcCall<Params extends JsonRpcParams = JsonRpcParams> =
  | JsonRpcNotification<Params>
  | JsonRpcRequest<Params>;

export const isRequest = <Params extends JsonRpcParams>(
  message: JsonRpcCall<Params> | Readonly<JsonRpcCall<Params>>,
): message is JsonRpcRequest<Params> => hasProperty(message, 'id');

export const isNotification = <Params extends JsonRpcParams>(
  message: JsonRpcCall<Params>,
): message is JsonRpcNotification<Params> => !isRequest(message);

/**
 * An unholy incantation that converts a union of object types into an
 * intersection of object types.
 *
 * @example
 * type A = { a: string } | { b: number };
 * type B = UnionToIntersection<A>; // { a: string } & { b: number }
 */
export type UnionToIntersection<Union> = (
  Union extends never ? never : (k: Union) => void
) extends (k: infer Args) => void
  ? Args
  : never;

/**
 * JSON-stringifies a value.
 *
 * @param value - The value to stringify.
 * @returns The stringified value.
 */
export function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * The implementation of static `isInstance` methods for classes that have them.
 *
 * @param value - The value to check.
 * @param symbol - The symbol property to check for.
 * @returns Whether the value has `{ [symbol]: true }` in its prototype chain.
 */
export const isInstance = (
  value: unknown,
  symbol: symbol,
): value is { [key: symbol]: true } =>
  isObject(value) && symbol in value && value[symbol] === true;

const JsonRpcEngineErrorSymbol = Symbol.for(
  'json-rpc-engine#JsonRpcEngineError',
);

export class JsonRpcEngineError extends Error {
  // This is a computed property name, and it doesn't seem possible to make it
  // hash private using `#`.
  // eslint-disable-next-line no-restricted-syntax
  private readonly [JsonRpcEngineErrorSymbol] = true;

  constructor(message: string) {
    super(message);
    this.name = 'JsonRpcEngineError';
  }

  /**
   * Check if a value is a {@link JsonRpcEngineError} instance.
   * Works across different package versions in the same realm.
   *
   * @param value - The value to check.
   * @returns Whether the value is a {@link JsonRpcEngineError} instance.
   */
  static isInstance(value: unknown): value is JsonRpcEngineError {
    return isInstance(value, JsonRpcEngineErrorSymbol);
  }
}

// Method middleware utils

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
  const missingHookNames = Array.from(expectedHookNames).filter(
    (hookName) => !hasProperty(hooks, hookName),
  );
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
 * @param options.rootMessenger - The root messenger to delegate from. Required
 * when `actionNames` are provided.
 * @returns The per-handler messenger.
 */
export function createHandlerMessenger<Actions extends ActionConstraint>({
  namespace,
  actionNames,
  rootMessenger,
}: {
  namespace: string;
  actionNames: readonly Actions['type'][] | undefined;
  rootMessenger?: Messenger<string, Actions> | undefined;
}): Messenger<string, Actions> | undefined {
  if (!actionNames) {
    return undefined;
  }

  if (!rootMessenger) {
    throw new Error(
      'A messenger is required when a handler declares actionNames.',
    );
  }

  const handlerMessenger = new Messenger<
    string,
    Actions,
    never,
    typeof rootMessenger
  >({ namespace, parent: rootMessenger });

  rootMessenger.delegate({
    actions: actionNames as Actions['type'][],
    messenger: handlerMessenger,
  });

  return handlerMessenger;
}
