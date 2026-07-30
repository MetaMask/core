import {
  KeyringControllerError,
  KeyringControllerErrorMessage,
} from '@metamask/keyring-controller';

import {
  createSentryError,
  isSafeError,
  reportError,
  SafeError,
  safe,
} from './errors.js';

/**
 * Builds a minimal duck-typed StructError for testing the superstruct branch.
 *
 * @param path - The path to the failing field.
 * @param type - The expected superstruct type string.
 * @param refinement - Optional refinement name.
 * @returns A TypeError whose shape matches StructError.
 */
function buildStructError(
  path: string[],
  type: string,
  refinement?: string,
): Error {
  return Object.assign(
    new TypeError(
      `At path: ${path.join('.')} -- Expected a value of type \`${type}\``,
    ),
    { name: 'StructError' as const, path, type, refinement },
  );
}

describe('SafeError', () => {
  it('is an Error with name SafeError', () => {
    const error = new SafeError('step failed');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SafeError');
    expect(error.message).toBe('step failed');
  });
});

describe('isSafeError', () => {
  it('returns true for a SafeError', () => {
    expect(isSafeError(new SafeError('step failed'))).toBe(true);
  });

  it('returns true for a duck-typed object with name SafeError', () => {
    expect(isSafeError({ name: 'SafeError', message: 'step failed' })).toBe(
      true,
    );
  });

  it('returns false for a plain Error', () => {
    expect(isSafeError(new Error('oops'))).toBe(false);
  });

  it('returns false for null and non-objects', () => {
    expect(isSafeError(null)).toBe(false);
    expect(isSafeError('string')).toBe(false);
    expect(isSafeError(undefined)).toBe(false);
  });
});

describe('safe', () => {
  it('returns the callback result on success', async () => {
    expect(await safe('step', async () => 42)).toBe(42);
  });

  it('passes a SafeError through unchanged', async () => {
    const inner = new SafeError('inner step: detail');
    await expect(
      safe('outer step', async () => {
        throw inner;
      }),
    ).rejects.toThrow(inner);
  });

  it('passes a KeyringControllerError through unchanged', async () => {
    const error = new KeyringControllerError(
      KeyringControllerErrorMessage.DuplicatedAccount,
    );
    await expect(
      safe('step', async () => {
        throw error;
      }),
    ).rejects.toThrow(error);
  });

  it('wraps a StructError as a SafeError with path and type', async () => {
    const structError = buildStructError(
      ['accounts', 'uuid-123', 'type'],
      'enums',
    );
    await expect(
      safe('Adding keyring', async () => {
        throw structError;
      }),
    ).rejects.toThrow(
      new SafeError(
        'Adding keyring: Validation failed at "accounts.uuid-123.type" (expected: enums)',
      ),
    );
  });

  it('uses refinement name over type when present', async () => {
    const structError = buildStructError(['address'], 'string', 'nonempty');
    await expect(
      safe('step', async () => {
        throw structError;
      }),
    ).rejects.toThrow(
      new SafeError(
        'step: Validation failed at "address" (expected: nonempty)',
      ),
    );
  });

  it('uses "root" when StructError path is empty', async () => {
    const structError = buildStructError([], 'object');
    await expect(
      safe('step', async () => {
        throw structError;
      }),
    ).rejects.toThrow(
      new SafeError('step: Validation failed at root (expected: object)'),
    );
  });

  it('replaces an unknown error with a generic SafeError', async () => {
    await expect(
      safe('Adding keyring', async () => {
        throw new Error('internal error with address 0x1234');
      }),
    ).rejects.toThrow(
      new SafeError('Adding keyring: An unexpected error occurred'),
    );
  });

  it('re-forwards a SafeError from a nested safe without re-wrapping', async () => {
    const inner = new SafeError('inner: detail');
    const result = safe('outer', async () =>
      safe('inner', async () => {
        throw inner;
      }),
    );
    await expect(result).rejects.toThrow(inner);
  });
});

describe('createSentryError', () => {
  it('creates an error with a cause', () => {
    const inner = new Error('inner');
    const result = createSentryError('outer', inner);

    expect(result.message).toBe('outer');
    expect(result.cause).toBe(inner);
    expect(result.context).toBeUndefined();
  });

  it('attaches context when provided', () => {
    const inner = new Error('inner');
    const context = { snapId: 'npm:test-snap' };
    const result = createSentryError('outer', inner, context);

    expect(result.context).toStrictEqual(context);
  });
});

describe('reportError', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation();
  });

  it('logs to console.error', () => {
    const error = new Error('boom');
    reportError({}, 'Something failed', error);

    expect(console.error).toHaveBeenCalledWith('Something failed', error);
  });

  it('calls captureException when provided', () => {
    const error = new Error('boom');
    const captureException = jest.fn();
    reportError({ captureException }, 'Something failed', error);

    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Something failed', cause: error }),
    );
  });

  it('does not throw when captureException is absent', () => {
    const error = new Error('boom');
    expect(() => reportError({}, 'Something failed', error)).not.toThrow();
  });
});
