/**
 * A {@link ReadonlyMap} that cannot be modified after instantiation.
 * The implementation uses an inner map hidden via a private field, and the
 * immutability guarantee relies on it being impossible to get a reference
 * to this map.
 */
class FrozenMap<Key, Value> implements ReadonlyMap<Key, Value> {
  // The iterator methods below borrow their return types from the inner map
  // rather than naming one. The name changed across TypeScript versions
  // (`IterableIterator` became `MapIterator`), and `tsd` type tests run against
  // a different version than the build, so any hardcoded name is wrong for one
  // of them. Deriving the type keeps it correct under both.
  readonly #map: Map<Key, Value>;

  public get size(): number {
    return this.#map.size;
  }

  public [Symbol.iterator](): ReturnType<
    Map<Key, Value>[typeof Symbol.iterator]
  > {
    return this.#map[Symbol.iterator]();
  }

  constructor(entries?: readonly (readonly [Key, Value])[] | null) {
    this.#map = new Map<Key, Value>(entries);
    Object.freeze(this);
  }

  public entries(): ReturnType<Map<Key, Value>['entries']> {
    return this.#map.entries();
  }

  public forEach(
    callbackfn: (value: Value, key: Key, map: this) => void,
    thisArg?: any,
  ): void {
    // We have to wrap the specified callback in order to prevent it from
    // receiving a reference to the inner map.
    return this.#map.forEach((value: Value, key: Key, _map: unknown) =>
      callbackfn.call(thisArg, value, key, this),
    );
  }

  public get(key: Key): Value | undefined {
    return this.#map.get(key);
  }

  public has(key: Key): boolean {
    return this.#map.has(key);
  }

  public keys(): ReturnType<Map<Key, Value>['keys']> {
    return this.#map.keys();
  }

  public values(): ReturnType<Map<Key, Value>['values']> {
    return this.#map.values();
  }

  public toString(): string {
    return `FrozenMap(${this.size}) {${
      this.size > 0
        ? ` ${[...this.entries()]
            .map(([key, value]) => `${String(key)} => ${String(value)}`)
            .join(', ')} `
        : ''
    }}`;
  }
}

/**
 * A {@link ReadonlySet} that cannot be modified after instantiation.
 * The implementation uses an inner set hidden via a private field, and the
 * immutability guarantee relies on it being impossible to get a reference
 * to this set.
 */
class FrozenSet<Value> implements ReadonlySet<Value> {
  // Derived from the inner set for the same reason as `FrozenMap` above.
  readonly #set: Set<Value>;

  public get size(): number {
    return this.#set.size;
  }

  public [Symbol.iterator](): ReturnType<Set<Value>[typeof Symbol.iterator]> {
    return this.#set[Symbol.iterator]();
  }

  constructor(values?: readonly Value[] | null) {
    this.#set = new Set<Value>(values);
    Object.freeze(this);
  }

  public entries(): ReturnType<Set<Value>['entries']> {
    return this.#set.entries();
  }

  public forEach(
    callbackfn: (value: Value, value2: Value, set: this) => void,
    thisArg?: any,
  ): void {
    // We have to wrap the specified callback in order to prevent it from
    // receiving a reference to the inner set.
    return this.#set.forEach((value: Value, value2: Value, _set: unknown) =>
      callbackfn.call(thisArg, value, value2, this),
    );
  }

  public has(value: Value): boolean {
    return this.#set.has(value);
  }

  public keys(): ReturnType<Set<Value>['keys']> {
    return this.#set.keys();
  }

  public values(): ReturnType<Set<Value>['values']> {
    return this.#set.values();
  }

  public toString(): string {
    return `FrozenSet(${this.size}) {${
      this.size > 0
        ? ` ${[...this.values()].map((member) => String(member)).join(', ')} `
        : ''
    }}`;
  }
}

Object.freeze(FrozenMap);
Object.freeze(FrozenMap.prototype);

Object.freeze(FrozenSet);
Object.freeze(FrozenSet.prototype);

export { FrozenMap, FrozenSet };
