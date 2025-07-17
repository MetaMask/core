export type MiddlewareContext = Readonly<
  Map<string, unknown> & {
    assertGet<Value>(key: string): Value;
  }
>;

export const makeMiddlewareContext = (): MiddlewareContext => {
  const map = new Map<string, unknown>();
  const assertGet = <Value>(key: string): Value => {
    if (!map.has(key)) {
      throw new Error(`Context key "${key}" not found`);
    }
    return map.get(key) as Value;
  };

  Object.defineProperty(map, 'assertGet', {
    value: assertGet,
    writable: false,
    enumerable: true,
    configurable: false,
  });
  return Object.freeze(map) as MiddlewareContext;
};
