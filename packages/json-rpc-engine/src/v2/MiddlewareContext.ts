/**
 * A append-only context object for middleware. Its interface is frozen.
 *
 * Map keys may still be deleted. The append-only behavior is mostly intended
 * to prevent accidental naming collisions.
 *
 * The append-only behavior is overriden when using e.g. `Reflect.set`,
 * so don't do that.
 */
export class MiddlewareContext extends Map<string | symbol, unknown> {
  constructor(entries?: Iterable<readonly [string | symbol, unknown]>) {
    super(entries);
    Object.freeze(this);
  }

  assertGet<Value>(key: string | symbol): Value {
    if (!this.has(key)) {
      throw new Error(`Context key "${String(key)}" not found`);
    }
    return this.get(key) as Value;
  }

  set<Value>(key: string | symbol, value: Value): this {
    if (this.has(key)) {
      throw new Error(`MiddlewareContext key "${String(key)}" already exists`);
    }
    return super.set(key, value) as this;
  }
}
