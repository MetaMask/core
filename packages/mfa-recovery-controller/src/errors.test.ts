import { describe, expect, it } from 'vitest';

import { MfaRecoveryError } from './errors.js';

describe('MfaRecoveryError', () => {
  it('sets the message and code', () => {
    const error = new MfaRecoveryError('Something failed', 'some_code');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('MfaRecoveryError');
    expect(error.message).toBe('Something failed');
    expect(error.code).toBe('some_code');
    expect('cause' in error).toBe(false);
  });

  it('sets the cause when given one', () => {
    const cause = new Error('Underlying failure');

    const error = new MfaRecoveryError('Something failed', 'some_code', {
      cause,
    });

    expect(error.cause).toBe(cause);
  });
});
