import { MiddlewareContext } from './MiddlewareContext';

describe('MiddlewareContext', () => {
  it('is a map', () => {
    const context = new MiddlewareContext();
    expect(context).toBeInstanceOf(Map);
  });

  it('can be constructed with entries', () => {
    const symbol = Symbol('test');
    const context = new MiddlewareContext([
      ['test', 'value'],
      [symbol, 'value'],
    ]);
    expect(context.get('test')).toBe('value');
    expect(context.get(symbol)).toBe('value');
  });

  it('is frozen', () => {
    const context = new MiddlewareContext();
    expect(Object.isFrozen(context)).toBe(true);
  });

  it('assertGet throws if the key is not found', () => {
    const context = new MiddlewareContext();
    expect(() => context.assertGet('test')).toThrow(
      `Context key "test" not found`,
    );
  });

  it('assertGet returns the value if the key is found (string)', () => {
    const context = new MiddlewareContext();
    context.set('test', 'value');
    expect(context.assertGet('test')).toBe('value');
  });

  it('assertGet returns the value if the key is found (symbol)', () => {
    const context = new MiddlewareContext();
    const symbol = Symbol('test');
    context.set(symbol, 'value');
    expect(context.assertGet(symbol)).toBe('value');
  });
});
