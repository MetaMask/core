import { prefixError } from './error-prefix';

describe('prefixError', () => {
  it('prefixes Error messages without replacing the Error object', () => {
    const error = new Error('boom');
    const { stack } = error;

    const result = prefixError(error, 'Test: ');

    expect(result).toBe(error);
    expect(result.message).toBe('Test: boom');
    expect(result.stack).toBe(stack);
  });

  it('does not duplicate prefixes', () => {
    const error = new Error('Test: boom');

    const result = prefixError(error, 'Test: ');

    expect(result.message).toBe('Test: boom');
  });

  it('converts non-Error throws to prefixed Errors', () => {
    const result = prefixError('boom', 'Test: ');

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('Test: boom');
  });
});
