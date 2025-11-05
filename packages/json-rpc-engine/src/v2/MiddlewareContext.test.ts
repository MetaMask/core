import { MiddlewareContext } from './MiddlewareContext';

describe('MiddlewareContext', () => {
  it('can be constructed with entries', () => {
    const symbol = Symbol('test');
    const context = new MiddlewareContext<{ test: string; [symbol]: string }>([
      ['test', 'value'],
      [symbol, 'value'],
    ]);
    expect(context.get('test')).toBe('value');
    expect(context.get(symbol)).toBe('value');
  });

  it('can be constructed with a KeyValues object', () => {
    const symbol = Symbol('symbol');
    const context = new MiddlewareContext<{ test: string; [symbol]: string }>({
      test: 'string value',
      [symbol]: 'symbol value',
    });

    expect(context.get('test')).toBe('string value');
    expect(context.get(symbol)).toBe('symbol value');
  });

  it('is frozen', () => {
    const context = new MiddlewareContext();
    expect(Object.isFrozen(context)).toBe(true);
  });

  it('type errors and returns undefined when getting unknown keys', () => {
    const context = new MiddlewareContext<{ test: string }>();
    // @ts-expect-error - foo is not a valid key
    expect(context.get('foo')).toBeUndefined();
  });

  it('type errors and throws when assertGet:ing unknown keys', () => {
    const context = new MiddlewareContext<{ test: string }>();
    // @ts-expect-error - foo is not a valid key
    expect(() => context.assertGet('foo')).toThrow(
      `Context key "foo" not found`,
    );
  });

  it('type errors when setting unknown keys', () => {
    const context = new MiddlewareContext<{ test: string }>();
    // @ts-expect-error - foo is not a valid key
    expect(context.set('foo', 'value')).toBe(context);
  });

  it('assertGet throws if the key is not found', () => {
    const context = new MiddlewareContext<{ test: string }>();
    expect(() => context.assertGet('test')).toThrow(
      `Context key "test" not found`,
    );
  });

  it('assertGet returns the value if the key is found (string)', () => {
    const context = new MiddlewareContext<{ test: string }>();
    context.set('test', 'value');
    expect(context.assertGet('test')).toBe('value');
  });

  it('assertGet returns the value if the key is found (symbol)', () => {
    const symbol = Symbol('test');
    const context = new MiddlewareContext<{ [symbol]: string }>();
    context.set(symbol, 'value');
    expect(context.assertGet(symbol)).toBe('value');
  });

  it('throws if setting an already set key', () => {
    const context = new MiddlewareContext<{ test: string }>();
    context.set('test', 'value');
    expect(() => context.set('test', 'value')).toThrow(
      `MiddlewareContext key "test" already exists`,
    );
  });

  it('identifies instances of MiddlewareContext via isInstance', () => {
    const context = new MiddlewareContext();

    expect(MiddlewareContext.isInstance(context)).toBe(true);
    expect(MiddlewareContext.isInstance({ foo: 'bar' })).toBe(false);
  });
});
