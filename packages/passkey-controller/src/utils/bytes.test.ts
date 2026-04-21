import { concatUint8Arrays } from './bytes';

describe('concatUint8Arrays', () => {
  it('concatenates two arrays', () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4, 5]);
    expect(concatUint8Arrays(a, b)).toStrictEqual(
      new Uint8Array([1, 2, 3, 4, 5]),
    );
  });

  it('concatenates three arrays', () => {
    expect(
      concatUint8Arrays(
        new Uint8Array([0x04]),
        new Uint8Array([1, 2]),
        new Uint8Array([3]),
      ),
    ).toStrictEqual(new Uint8Array([0x04, 1, 2, 3]));
  });

  it('returns empty array when given no inputs', () => {
    expect(concatUint8Arrays()).toStrictEqual(new Uint8Array());
  });
});
