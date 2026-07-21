import { toErrorMessage } from './errors';

describe('toErrorMessage', () => {
  it('returns the message property for Error instances', () => {
    expect(toErrorMessage(new Error('something went wrong'))).toBe(
      'something went wrong',
    );
  });

  it('returns String() for non-Error values', () => {
    expect(toErrorMessage('raw string error')).toBe('raw string error');
    expect(toErrorMessage(42)).toBe('42');
    expect(toErrorMessage(null)).toBe('null');
    expect(toErrorMessage(undefined)).toBe('undefined');
    expect(toErrorMessage({ code: 500 })).toBe('[object Object]');
  });
});
