export type ContextKeys = string | symbol;

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
  KeyValues extends Record<ContextKeys, unknown> = {},
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

/**
 * Extract the {@link MiddlewareContext} union from an array of {@link MiddlewareContext}s.
 */
// Using `any` in this constraint does not pollute other types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExtractContexts<T extends MiddlewareContext<any>[]> = T[number];

/**
 * Infer the KeyValues type from a {@link MiddlewareContext}.
 */
// Using `any` in this constraint does not pollute other types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InferKeyValues<T extends MiddlewareContext<any>> =
  T extends MiddlewareContext<infer U> ? U : never;

/**
 * An unholy incantation that converts a union of object types into an
 * intersection of object types.
 *
 * @example
 * type A = { a: string } | { b: number };
 * type B = UnionToIntersection<A>; // { a: string } & { b: number }
 */
type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

/**
 * Simplifies an object type by "merging" its properties.
 *
 * - Expands intersections into a single object type.
 * - Forces mapped/conditional results to resolve into a readable shape.
 * - No runtime effect; purely a type-level normalization.
 *
 * @example
 * type A = { a: string } & { b: number };
 * type B = Simplify<A>; // { a: string; b: number }
 */
type Simplify<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

/**
 * Rejects record types that contain any `never`-valued property.
 *
 * If any property of `T` resolves to `never`, the result is `never`; otherwise it returns `T` unchanged.
 * Useful as a guard to ensure computed/merged record types didn't collapse any fields to `never`.
 *
 * @example
 * type A = ExcludeNever<{ a: string; b: never }>; // never
 * type B = ExcludeNever<{ a: string; b: number }>; // { a: string; b: number }
 */
type ExcludeNever<T extends Record<PropertyKey, unknown>> = {
  [K in keyof T]-?: [T[K]] extends [never] ? K : never;
}[keyof T] extends never
  ? T
  : never;

/**
 * Merge a union of {@link MiddlewareContext}s into a single {@link MiddlewareContext}
 * supertype.
 *
 * @param Contexts - The union of {@link MiddlewareContext}s to merge.
 * @returns The merged {@link MiddlewareContext} supertype.
 * @example
 * type A = MiddlewareContext<{ a: string }> | MiddlewareContext<{ b: number }>;
 * type B = MergeContexts<A>; // MiddlewareContext<{ a: string, b: number }>
 */
export type MergeContexts<Contexts extends MiddlewareContext<any>[]> =
  MiddlewareContext<
    ExcludeNever<
      Simplify<UnionToIntersection<InferKeyValues<ExtractContexts<Contexts>>>>
    >
  >;
