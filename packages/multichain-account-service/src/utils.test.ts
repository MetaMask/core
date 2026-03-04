import { toErrorMessage } from './utils';

describe('toErrorMessage', () => {
  it('returns the message of an Error instance', () => {
    const error = new Error('something went wrong');
    expect(toErrorMessage(error)).toBe(error.message);
  });

  it('returns the string representation of a non-Error value', () => {
    expect(toErrorMessage('raw string')).toBe('raw string');
  });

  it('converts a number to string', () => {
    expect(toErrorMessage(42)).toBe('42');
  });

  it('converts null to string', () => {
    expect(toErrorMessage(null)).toBe('null');
  });

  it('converts undefined to string', () => {
    expect(toErrorMessage(undefined)).toBe('undefined');
  });

  it('converts an object to string', () => {
    expect(toErrorMessage({ foo: 'bar' })).toBe('[object Object]');
  });
});
