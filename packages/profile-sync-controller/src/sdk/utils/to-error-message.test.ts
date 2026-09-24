import { toErrorMessage } from './to-error-message.js';

describe('toErrorMessage()', () => {
  it('returns the message of an Error', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
  });

  it.each([
    ['string', 'plain', 'plain'],
    ['number', 42, '42'],
    ['null', null, 'null'],
    ['undefined', undefined, 'undefined'],
  ])('stringifies a non-Error %s', (_name, value, expected) => {
    expect(toErrorMessage(value)).toBe(expected);
  });
});
