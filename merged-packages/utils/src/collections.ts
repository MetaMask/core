/**
 * A {@link ReadonlyMap} that cannot be modified after instantiation.
 * The implementation uses an inner map hidden via a private field, and the
 * immutability guarantee relies on it being impossible to get a reference
 * to this map.
 */
class FrozenMap<Key, Value> implements ReadonlyMap<Key, Value> {
  readonly #map: Map<Key, Value>;

  public get size() {
    return this.#map.size;
  }

  public [Symbol.iterator]() {
    return this.#map[Symbol.iterator]();
  }

  constructor(entries?: readonly (readonly [Key, Value])[] | null) {
    this.#map = new Map<Key, Value>(entries);
    Object.freeze(this);
  }

  public entries() {
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

  public get(key: Key) {
    return this.#map.get(key);
  }

  public has(key: Key) {
    return this.#map.has(key);
  }

  public keys() {
    return this.#map.keys();
  }

  public values() {
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
  readonly #set: Set<Value>;

  public get size() {
    return this.#set.size;
  }

  public [Symbol.iterator]() {
    return this.#set[Symbol.iterator]();
  }

  constructor(values?: readonly Value[] | null) {
    this.#set = new Set<Value>(values);
    Object.freeze(this);
  }

  public entries() {
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

  public has(value: Value) {
    return this.#set.has(value);
  }

  public keys() {
    return this.#set.keys();
  }

  public values() {
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
