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
}
