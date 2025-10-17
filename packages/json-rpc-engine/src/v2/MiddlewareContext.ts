/**
 * An context object for middleware that attempts to protect against accidental
 * modifications. Its interface is frozen.
 *
 * Map keys may not be directly overridden with {@link set}. Instead, use
 * {@link delete} to remove a key and then {@link set} to add a new value.
 *
 * The override protections are circumvented when using e.g. `Reflect.set`, so
 * don't do that.
 */
export class MiddlewareContext<
  // The `{}` type is not problematic in this context, it just means "no keys".
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  KeyValues extends Record<string | symbol, unknown> = {},
> extends Map<keyof KeyValues, KeyValues[keyof KeyValues]> {
  constructor(
    entries?: Iterable<readonly [keyof KeyValues, KeyValues[keyof KeyValues]]>,
  ) {
    super(entries);
    Object.freeze(this);
  }

  get<K extends keyof KeyValues>(key: K): KeyValues[K] | undefined {
    return super.get(key) as KeyValues[K] | undefined;
  }

  /**
   * Get a value from the context. Throws if the key is not found.
   *
   * @param key - The key to get the value for.
   * @returns The value.
   */
  assertGet<K extends keyof KeyValues>(key: K): KeyValues[K] {
    if (!super.has(key)) {
      throw new Error(`Context key "${String(key)}" not found`);
    }
    return super.get(key) as KeyValues[K];
  }

  /**
   * Set a value in the context. Throws if the key already exists.
   * {@link delete} an existing key before setting it to a new value.
   *
   * @throws If the key already exists.
   * @param key - The key to set the value for.
   * @param value - The value to set.
   * @returns The context.
   */
  set<K extends keyof KeyValues>(key: K, value: KeyValues[K]): this {
    if (super.has(key)) {
      throw new Error(`MiddlewareContext key "${String(key)}" already exists`);
    }
    super.set(key, value);
    return this;
  }
}
