import {
  SecretEscrowError,
  SecretEscrowErrorCode,
} from './errors.js';

describe('SecretEscrowError', () => {
  it('exposes a stable code and name', () => {
    const error = new SecretEscrowError('boom', {
      code: SecretEscrowErrorCode.AssertionFailed,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SecretEscrowError);
    expect(error.name).toBe('SecretEscrowError');
    expect(error.code).toBe(SecretEscrowErrorCode.AssertionFailed);
    expect(error.message).toBe('boom');
  });

  it('accepts an optional cause', () => {
    const cause = new Error('root');
    const error = new SecretEscrowError('wrapped', {
      code: SecretEscrowErrorCode.InvalidFactor,
      cause,
    });

    expect(error.cause).toBe(cause);
  });
});
