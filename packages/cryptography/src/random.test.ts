import { getRandomBytes } from './random.js';

describe('getRandomBytes', () => {
  it('returns a Uint8Array of the requested length', () => {
    const bytes = getRandomBytes(32);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes).toHaveLength(32);
  });

  it('fills the array using `crypto.getRandomValues`', () => {
    const spy = jest
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation((array) => {
        (array as Uint8Array).fill(0xab);
        return array;
      });

    const bytes = getRandomBytes(4);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect(bytes).toStrictEqual(new Uint8Array([0xab, 0xab, 0xab, 0xab]));
  });
});
