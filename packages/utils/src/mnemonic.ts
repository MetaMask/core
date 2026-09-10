import * as englishWordlist from '@metamask/scure-bip39/dist/wordlists/english.js';

const { wordlist } = englishWordlist;

/**
 * Transform a typed array containing mnemonic data to the seed phrase.
 * @param uint8Array - Typed array containing mnemonic data.
 * @returns The seed phrase.
 */
export function uint8ArrayToMnemonic(uint8Array: Uint8Array): string {
  if (uint8Array.length === 0) {
    throw new Error(
      'The method uint8ArrayToMnemonic expects a non-empty array',
    );
  }

  const recoveredIndices = Array.from(
    new Uint16Array(new Uint8Array(uint8Array).buffer),
  );

  return recoveredIndices.map((i) => wordlist[i]).join(' ');
}

/**
 * Encodes a BIP-39 mnemonic as the indices of words in the English BIP-39 wordlist.
 *
 * @param mnemonic - The BIP-39 mnemonic.
 * @returns The Unicode code points for the seed phrase formed from the words in the wordlist.
 */
export function convertMnemonicToWordlistIndices(mnemonic: string): Uint8Array {
  const indices = mnemonic.split(' ').map((word) => wordlist.indexOf(word));
  return new Uint8Array(new Uint16Array(indices).buffer);
}
