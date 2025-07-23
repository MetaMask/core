export class MiddlewareContext extends Map<string, unknown> {
  constructor(entries?: Iterable<readonly [string, unknown]>) {
    super(entries);
    Object.freeze(this);
  }

  assertGet<Value>(key: string): Value {
    if (!this.has(key)) {
      throw new Error(`Context key "${key}" not found`);
    }
    return this.get(key) as Value;
  }
}
