import type { UnionToIntersection } from './utils';

/**
 * An context object for middleware that attempts to protect against accidental
 * modifications. Its interface is frozen.
 *
 * Map keys may not be directly overridden with {@link set}. Instead, use
 * {@link delete} to remove a key and then {@link set} to add a new value.
 *
 * The override protections are circumvented when using e.g. `Reflect.set`, so
 * don't do that.
 *
 * @template KeyValues - The type of the keys and values in the context.
 * @example
 * // By default, the context permits any PropertyKey as a key.
 * const context = new MiddlewareContext();
 * context.set('foo', 'bar');
 * context.get('foo'); // 'bar'
 * context.get('fizz'); // undefined
 * @example
 * // By specifying an object type, the context permits only the keys of the object.
 * type Context = MiddlewareContext<{ foo: string }>;
 * const context = new Context([['foo', 'bar']]);
 * context.get('foo'); // 'bar'
 * context.get('fizz'); // Type error
 */
export class MiddlewareContext<
  KeyValues extends Record<PropertyKey, unknown> = Record<PropertyKey, unknown>,
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
 * Infer the KeyValues type from a {@link MiddlewareContext}.
 */
type InferKeyValues<T> = T extends MiddlewareContext<infer U> ? U : never;

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
export type MergeContexts<Contexts extends ContextConstraint> =
  ExcludeNever<
    Simplify<UnionToIntersection<InferKeyValues<Contexts>>>
  > extends never
    ? never
    : MiddlewareContext<
        ExcludeNever<Simplify<UnionToIntersection<InferKeyValues<Contexts>>>>
      >;

// Non-polluting `any` constraint.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ContextConstraint = MiddlewareContext<any>;

/**
 * The empty context type, i.e. `MiddlewareContext<{}>`.
 */
// The empty object type is literally an empty object in this context.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type EmptyContext = MiddlewareContext<{}>;
