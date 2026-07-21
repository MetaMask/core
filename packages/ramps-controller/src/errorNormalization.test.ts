import {
  extractExplicitTypedError,
  getErrorMessage,
  normalizeToTypedError,
} from './errorNormalization';

type Code = 'NO_QUOTES' | 'QUOTE_FAILED' | 'UNKNOWN';

const isValidCode = (value: unknown): value is Code =>
  value === 'NO_QUOTES' || value === 'QUOTE_FAILED' || value === 'UNKNOWN';

describe('getErrorMessage', () => {
  it('reads Error.message', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('reads a record message', () => {
    expect(getErrorMessage({ message: 'nope' })).toBe('nope');
  });

  it('returns a string value directly', () => {
    expect(getErrorMessage('raw')).toBe('raw');
  });

  it('returns undefined when no message can be derived', () => {
    expect(getErrorMessage(42)).toBeUndefined();
    expect(getErrorMessage(null)).toBeUndefined();
  });
});

describe('extractExplicitTypedError', () => {
  it('reads a valid code from the default `code` property', () => {
    expect(
      extractExplicitTypedError(
        { code: 'NO_QUOTES', message: 'none' },
        { isValidCode },
      ),
    ).toStrictEqual({ code: 'NO_QUOTES', message: 'none', details: undefined });
  });

  it('honours codeProperties precedence order', () => {
    expect(
      extractExplicitTypedError(
        { headlessCode: 'QUOTE_FAILED', code: 'NO_QUOTES' },
        { isValidCode, codeProperties: ['headlessCode', 'code'] },
      ),
    ).toStrictEqual({
      code: 'QUOTE_FAILED',
      message: undefined,
      details: undefined,
    });
  });

  it('passes through a record details object', () => {
    expect(
      extractExplicitTypedError(
        { code: 'NO_QUOTES', details: { providerId: 'moonpay' } },
        { isValidCode },
      ),
    ).toStrictEqual({
      code: 'NO_QUOTES',
      message: undefined,
      details: { providerId: 'moonpay' },
    });
  });

  it('returns undefined when no valid code is present', () => {
    expect(
      extractExplicitTypedError({ code: 'NOT_A_CODE' }, { isValidCode }),
    ).toBeUndefined();
    expect(extractExplicitTypedError('boom', { isValidCode })).toBeUndefined();
  });
});

describe('normalizeToTypedError', () => {
  it('returns the explicit typed error when present', () => {
    expect(
      normalizeToTypedError(
        { code: 'QUOTE_FAILED', message: 'x' },
        { isValidCode, fallbackCode: 'UNKNOWN' },
      ),
    ).toStrictEqual({
      code: 'QUOTE_FAILED',
      message: 'x',
      details: undefined,
    });
  });

  it('falls back with the derived message when no valid code is present', () => {
    expect(
      normalizeToTypedError(new Error('boom'), {
        isValidCode,
        fallbackCode: 'UNKNOWN',
      }),
    ).toStrictEqual({ code: 'UNKNOWN', message: 'boom' });
  });
});
