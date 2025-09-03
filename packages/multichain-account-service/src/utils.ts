import { wordlist } from '@metamask/scure-bip39/dist/wordlists/english';

export const convertEnglishWordlistIndicesToCodepoints = (
  wordlistIndices: Uint8Array,
): Buffer => {
  return Buffer.from(
    Array.from(new Uint16Array(wordlistIndices.buffer))
      .map((i) => wordlist[i])
      .join(' '),
  );
};

export const convertMnemonicToWordlistIndices = (
  mnemonic: string,
): Uint8Array => {
  const indices = mnemonic
    .toString()
    .split(' ')
    .map((word) => wordlist.indexOf(word));
  return new Uint8Array(new Uint16Array(indices).buffer);
};
