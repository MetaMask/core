import { errorWithPrefix } from './errors';

describe('errorWithPrefix', () => {
  it('should prefix the error message', () => {
    const error = new Error('error message');
    const prefixedError = errorWithPrefix(error, 'prefix');
    expect(prefixedError.message).toBe('prefix: error message');
  });
  it('should prefix non-Error values', () => {
    const error = 'error message';
    const prefixedError = errorWithPrefix(error, 'prefix');
    expect(prefixedError.message).toBe('prefix: error message');
  });
});
