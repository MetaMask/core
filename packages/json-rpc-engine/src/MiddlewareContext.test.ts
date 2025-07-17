import { makeMiddlewareContext } from './MiddlewareContext';

describe('MiddlewareContext', () => {
  it('is a map', () => {
    const context = makeMiddlewareContext();
    expect(context).toBeInstanceOf(Map);
  });

  it('is frozen', () => {
    const context = makeMiddlewareContext();
    expect(Object.isFrozen(context)).toBe(true);
  });

  it('assertGet throws if the key is not found', () => {
    const context = makeMiddlewareContext();
    expect(() => context.assertGet('test')).toThrow(
      `Context key "test" not found`,
    );
  });

  it('assertGet returns the value if the key is found', () => {
    const context = makeMiddlewareContext();
    context.set('test', 'value');
    expect(context.assertGet('test')).toBe('value');
  });
});
