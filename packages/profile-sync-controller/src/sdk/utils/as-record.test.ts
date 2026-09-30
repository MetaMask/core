import { asRecord } from './as-record.js';

describe('asRecord()', () => {
  it('returns objects and arrays unchanged', () => {
    expect(asRecord({ foo: 'bar' })).toStrictEqual({ foo: 'bar' });
    expect(asRecord([1, 2, 3])).toStrictEqual([1, 2, 3]);
  });

  it.each([null, undefined, 'string', 123, true])(
    'returns undefined for non-object value %p',
    (value) => {
      expect(asRecord(value)).toBeUndefined();
    },
  );
});
