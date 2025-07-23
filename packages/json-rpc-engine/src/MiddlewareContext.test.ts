import { MiddlewareContext } from './MiddlewareContext';

describe('MiddlewareContext', () => {
  it('is a map', () => {
    const context = new MiddlewareContext();
    expect(context).toBeInstanceOf(Map);
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

  it('assertGet returns the value if the key is found', () => {
    const context = new MiddlewareContext();
    context.set('test', 'value');
    expect(context.assertGet('test')).toBe('value');
  });
});
