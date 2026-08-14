import {
  convertMnemonicToWordlistIndices,
  uint8ArrayToMnemonic,
} from './mnemonic';

const TWELVE_WORD_MNEMONIC =
  'bulk riot robust reward museum path chunk health rate soon zone wagon';
const TWELVE_WORD_INDICES = [
  240, 1489, 1498, 1477, 1165, 1287, 325, 849, 1425, 1658, 2046, 1970,
];

const TWENTY_FOUR_WORD_MNEMONIC =
  'abuse boss fly battle rubber wasp afraid hamster guide essence vibrant task banana pencil owner cube social job emotion member joy sting dash trouble';
const TWENTY_FOUR_WORD_INDICES = [
  9, 209, 719, 154, 1510, 1980, 36, 837, 828, 618, 1947, 1776, 145, 1301, 1265,
  427, 1647, 960, 582, 1110, 964, 1711, 445, 1864,
];

/**
 * Encode BIP-39 word indices as little-endian Uint16 bytes.
 *
 * @param indices - Wordlist indices to encode.
 * @returns The encoded bytes.
 */
function indicesToBytes(indices: number[]): Uint8Array {
  return new Uint8Array(new Uint16Array(indices).buffer);
}

describe('uint8ArrayToMnemonic', () => {
  it('throws for an empty array', () => {
    expect(() => uint8ArrayToMnemonic(new Uint8Array())).toThrow(
      'The method uint8ArrayToMnemonic expects a non-empty array',
    );
  });

  it('returns a 12-word mnemonic', () => {
    expect(uint8ArrayToMnemonic(indicesToBytes(TWELVE_WORD_INDICES))).toBe(
      TWELVE_WORD_MNEMONIC,
    );
  });

  it('returns a 24-word mnemonic', () => {
    expect(uint8ArrayToMnemonic(indicesToBytes(TWENTY_FOUR_WORD_INDICES))).toBe(
      TWENTY_FOUR_WORD_MNEMONIC,
    );
  });

  it('interprets bytes as little-endian word indices', () => {
    expect(
      uint8ArrayToMnemonic(
        new Uint8Array([
          240, 0, 209, 5, 218, 5, 197, 5, 141, 4, 7, 5, 69, 1, 81, 3, 145, 5,
          122, 6, 254, 7, 178, 7,
        ]),
      ),
    ).toBe(TWELVE_WORD_MNEMONIC);
  });
});

describe('convertMnemonicToWordlistIndices', () => {
  it('converts a 12-word mnemonic', () => {
    expect(
      convertMnemonicToWordlistIndices(TWELVE_WORD_MNEMONIC),
    ).toStrictEqual(indicesToBytes(TWELVE_WORD_INDICES));
  });

  it('converts a 24-word mnemonic', () => {
    expect(
      convertMnemonicToWordlistIndices(TWENTY_FOUR_WORD_MNEMONIC),
    ).toStrictEqual(indicesToBytes(TWENTY_FOUR_WORD_INDICES));
  });

  it('encodes an unknown word as the Uint16 representation of -1', () => {
    const mnemonicWithInvalidWord =
      'bulk riot robust reward notaword path chunk health rate soon zone wagon';
    const result = convertMnemonicToWordlistIndices(mnemonicWithInvalidWord);
    const indices = new Uint16Array(result.buffer);

    expect(Array.from(indices)).toStrictEqual([
      240, 1489, 1498, 1477, 65535, 1287, 325, 849, 1425, 1658, 2046, 1970,
    ]);
  });

  it('round-trips with uint8ArrayToMnemonic', () => {
    expect(
      uint8ArrayToMnemonic(
        convertMnemonicToWordlistIndices(TWELVE_WORD_MNEMONIC),
      ),
    ).toBe(TWELVE_WORD_MNEMONIC);
  });
});
