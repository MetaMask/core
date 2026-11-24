import { hexToBytes } from '@metamask/byte-utils';
import { stringToBytes } from '@metamask/byte-utils';
import { mnemonicToSeed } from '@metamask/scure-bip39';
import { wordlist } from '@metamask/scure-bip39/dist/wordlists/english.js';
import { describe, expect, it } from 'vitest';

import fixtures from '../tests/fixtures.js';
import { BIP44Node } from './BIP44Node.js';
import {
  getBIP32NodeToken,
  getBIP44ChangePathString,
  getBIP44CoinTypePathString,
  getBIP44CoinTypeToAddressPathTuple,
  getHardenedBIP32NodeToken,
  getUnhardenedBIP32NodeToken,
  isValidBytesKey,
  nullableHexStringToBytes,
  getBytes,
  getFingerprint,
  hexStringToBytes,
  validateBIP32Index,
  isValidBIP32Index,
  isHardened,
  encodeBase58check,
  decodeBase58check,
  mnemonicPhraseToBytes,
  getBytesUnsafe,
  isValidBIP32PathSegment,
  validateNetwork,
} from './utils.js';

// Inputs used for testing non-negative integers
const inputs = [-1, 1.1, NaN, {}, null, undefined] as number[];

describe('getBIP44CoinTypePathString', () => {
  it('returns a BIP-44 coin type path string', () => {
    expect(getBIP44CoinTypePathString(0)).toBe(`m / bip32:44' / bip32:0'`);
    expect(getBIP44CoinTypePathString(1)).toBe(`m / bip32:44' / bip32:1'`);
    expect(getBIP44CoinTypePathString(1000)).toBe(
      `m / bip32:44' / bip32:1000'`,
    );
  });

  it.each(inputs)('validates the index', (input) => {
    expect(() => getBIP44CoinTypePathString(input)).toThrow(
      'Invalid BIP-32 index: Must be a non-negative integer.',
    );
  });
});

describe('getBIP44ChangePathString', () => {
  const coinTypePath = getBIP44CoinTypePathString(1);

  it('returns a BIP-44 change path string (default values)', () => {
    expect(getBIP44ChangePathString(coinTypePath, {})).toBe(
      `${coinTypePath} / bip32:0' / bip32:0`,
    );
  });

  it('returns a BIP-44 change path string (custom change)', () => {
    expect(getBIP44ChangePathString(coinTypePath, { change: 1 })).toBe(
      `${coinTypePath} / bip32:0' / bip32:1`,
    );
  });

  it('returns a BIP-44 change path string (custom account)', () => {
    expect(getBIP44ChangePathString(coinTypePath, { account: 1 })).toBe(
      `${coinTypePath} / bip32:1' / bip32:0`,
    );
  });

  it('returns a BIP-44 change path string (custom change, custom account)', () => {
    expect(
      getBIP44ChangePathString(coinTypePath, { account: 2, change: 3 }),
    ).toBe(`${coinTypePath} / bip32:2' / bip32:3`);
  });

  it.each([-1, 1.1])('validates the index', (input) => {
    expect(() =>
      getBIP44ChangePathString(coinTypePath, { account: input }),
    ).toThrow('Invalid BIP-32 index: Must be a non-negative integer.');
  });
});

describe('getBIP44CoinTypeToAddressPathTuple', () => {
  it('returns a BIP-44 coin type as address path tuple (default values)', () => {
    expect(
      getBIP44CoinTypeToAddressPathTuple({ address_index: 0 }),
    ).toStrictEqual([`bip32:0'`, `bip32:0`, `bip32:0`]);
  });

  it('returns a BIP-44 coin type as address path tuple (custom address_index)', () => {
    expect(
      getBIP44CoinTypeToAddressPathTuple({ address_index: 1 }),
    ).toStrictEqual([`bip32:0'`, `bip32:0`, `bip32:1`]);
  });

  it('returns a BIP-44 coin type as address path tuple (custom change, hardened address_index)', () => {
    expect(
      getBIP44CoinTypeToAddressPathTuple({
        change: 1,
        address_index: { index: 2, hardened: true },
      }),
    ).toStrictEqual([`bip32:0'`, `bip32:1`, `bip32:2'`]);
  });

  it('returns a BIP-44 coin type as address path tuple (custom account, hardened change and address_index)', () => {
    expect(
      getBIP44CoinTypeToAddressPathTuple({
        account: 1,
        change: { index: 2, hardened: true },
        address_index: { index: 3, hardened: true },
      }),
    ).toStrictEqual([`bip32:1'`, `bip32:2'`, `bip32:3'`]);
  });

  it.each([-1, 1.1, NaN, {}] as number[])('validates the index', (input) => {
    expect(() =>
      getBIP44CoinTypeToAddressPathTuple({ account: input, address_index: 0 }),
    ).toThrow('Invalid BIP-32 index: Must be a non-negative integer.');
  });
});

describe('getHardenedBIP32NodeToken', () => {
  it('returns a hardened BIP-32 node token', () => {
    expect(getHardenedBIP32NodeToken(0)).toBe(`bip32:0'`);
    expect(getHardenedBIP32NodeToken(1)).toBe(`bip32:1'`);
    expect(getHardenedBIP32NodeToken(1000)).toBe(`bip32:1000'`);
  });

  it.each(inputs)('validates the index', (input) => {
    expect(() => getHardenedBIP32NodeToken(input)).toThrow(
      'Invalid BIP-32 index: Must be a non-negative integer.',
    );
  });
});

describe('getUnhardenedBIP32NodeToken', () => {
  it('returns an unhardened BIP-32 node token', () => {
    expect(getUnhardenedBIP32NodeToken(0)).toBe(`bip32:0`);
    expect(getUnhardenedBIP32NodeToken(1)).toBe(`bip32:1`);
    expect(getUnhardenedBIP32NodeToken(1000)).toBe(`bip32:1000`);
  });

  it.each(inputs)('validates the index', (input) => {
    expect(() => getUnhardenedBIP32NodeToken(input)).toThrow(
      'Invalid BIP-32 index: Must be a non-negative integer.',
    );
  });
});

describe('getBIP32NodeToken', () => {
  it('returns a BIP-32 node token (normal index)', () => {
    expect(getBIP32NodeToken(1)).toBe(`bip32:1`);
  });

  it('returns a BIP-32 node token (hardened index)', () => {
    expect(getBIP32NodeToken({ index: 1, hardened: true })).toBe(`bip32:1'`);
  });

  it('throws if the object is missing parameters', () => {
    // @ts-expect-error Invalid type.
    expect(() => getBIP32NodeToken({})).toThrow(
      'Invalid BIP-32 index: Must be an object containing the index and whether it is hardened.',
    );
  });

  it.each([NaN, {}, null, undefined] as number[])(
    'validates the index',
    (input) => {
      expect(() => getBIP32NodeToken({ hardened: true, index: input })).toThrow(
        'Invalid BIP-32 index: Must be an object containing the index and whether it is hardened.',
      );
    },
  );
});

describe('validateBIP32Index', () => {
  it('does not throw if the index is valid', () => {
    expect(() => validateBIP32Index(0)).not.toThrow();
    expect(() => validateBIP32Index(1)).not.toThrow();
    expect(() => validateBIP32Index(1000)).not.toThrow();
  });

  it.each(inputs)('throws if the index is invalid', (input) => {
    expect(() => validateBIP32Index(input)).toThrow(
      'Invalid BIP-32 index: Must be a non-negative integer.',
    );
  });
});

describe('isValidBIP32Index', () => {
  it('returns true if the index is valid', () => {
    expect(isValidBIP32Index(0)).toBe(true);
    expect(isValidBIP32Index(1)).toBe(true);
    expect(isValidBIP32Index(1000)).toBe(true);
  });

  it.each(inputs)('returns false if the index is invalid', (input) => {
    expect(isValidBIP32Index(input)).toBe(false);
  });
});

describe('isValidBIP32PathSegment', () => {
  it('returns true if the path segment is valid', () => {
    expect(isValidBIP32PathSegment(`0`)).toBe(true);
    expect(isValidBIP32PathSegment(`0'`)).toBe(true);
    expect(isValidBIP32PathSegment(`1`)).toBe(true);
    expect(isValidBIP32PathSegment(`1'`)).toBe(true);
    expect(isValidBIP32PathSegment(`1000`)).toBe(true);
    expect(isValidBIP32PathSegment(`1000'`)).toBe(true);
    expect(isValidBIP32PathSegment(`${2 ** 31 - 1}'`)).toBe(true);
  });

  it.each([`${2 ** 31}'`, 'foo', `123''`, `'123'`, `123'/456'`, ...inputs])(
    'returns false if the path segment is invalid',
    (input) => {
      // @ts-expect-error Invalid type.
      expect(isValidBIP32PathSegment(input)).toBe(false);
    },
  );
});

describe('isHardened', () => {
  it('returns true if the index is hardened', () => {
    expect(isHardened(`0'`)).toBe(true);
    expect(isHardened(`1'`)).toBe(true);
    expect(isHardened(`1000'`)).toBe(true);
  });

  it('returns false if the index is not hardened', () => {
    expect(isHardened(`0`)).toBe(false);
    expect(isHardened(`1`)).toBe(false);
    expect(isHardened(`1000`)).toBe(false);
  });
});

describe('hexStringToBytes', () => {
  it('returns the same Uint8Array if a Uint8Array is passed', () => {
    const bytes = hexToBytes('123');
    expect(hexStringToBytes(bytes)).toBe(bytes);
  });

  it('returns a Uint8Array from a hex string', () => {
    expect(hexStringToBytes('1234')).toStrictEqual(hexToBytes('1234'));
    expect(hexStringToBytes('0x1234')).toStrictEqual(hexToBytes('1234'));
  });

  it('throws if the string is not a valid hex string', () => {
    expect(() => hexStringToBytes('')).toThrow(
      'Value must be a hexadecimal string.',
    );

    expect(() => hexStringToBytes('0x0g')).toThrow(
      'Value must be a hexadecimal string.',
    );
  });
});

describe('nullableHexStringToBytes', () => {
  it('returns the same Uint8Array if a Uint8Array is passed', () => {
    const bytes = hexToBytes('123');
    expect(nullableHexStringToBytes(bytes)).toBe(bytes);
  });

  it('returns a Uint8Array for a hexadecimal string', () => {
    expect(nullableHexStringToBytes('1234')).toStrictEqual(hexToBytes('1234'));

    expect(nullableHexStringToBytes('0x1234')).toStrictEqual(
      hexToBytes('1234'),
    );
  });

  it('returns undefined for falsy values', () => {
    expect(nullableHexStringToBytes(undefined)).toBeUndefined();
  });

  it('throws if the string is not a valid hex string', () => {
    expect(() => nullableHexStringToBytes('')).toThrow(
      'Value must be a hexadecimal string.',
    );

    expect(() => nullableHexStringToBytes('0x0g')).toThrow(
      'Value must be a hexadecimal string.',
    );
  });
});

describe('isValidBytesKey', () => {
  it('checks the Uint8Array length', () => {
    expect(isValidBytesKey(new Uint8Array(32).fill(1), 32)).toBe(true);
    expect(isValidBytesKey(new Uint8Array(31).fill(1), 32)).toBe(false);
  });

  it('checks if the Uint8Array has at least one non-zero byte', () => {
    expect(isValidBytesKey(new Uint8Array(32).fill(1), 32)).toBe(true);
    expect(isValidBytesKey(new Uint8Array(32).fill(0), 32)).toBe(false);
  });
});

describe('isValidInteger', () => {
  it('returns true if the value is a positive integer', () => {
    expect(isValidBIP32Index(0)).toBe(true);
    expect(isValidBIP32Index(1)).toBe(true);
    expect(isValidBIP32Index(1000)).toBe(true);
  });

  it.each(inputs)(
    'returns false if the value is not a positive integer',
    (input) => {
      expect(isValidBIP32Index(input)).toBe(false);
    },
  );
});

describe('getBytes', () => {
  it('returns a Uint8Array for a hexadecimal string', () => {
    expect(getBytes('0x1234', 2)).toStrictEqual(hexStringToBytes('1234'));
    expect(getBytes('1234', 2)).toStrictEqual(hexStringToBytes('1234'));
  });

  it('returns the same Uint8Array if a Uint8Array is passed', () => {
    const bytes = hexStringToBytes('1234');
    expect(getBytes(bytes, 2)).toBe(bytes);
  });

  it('throws if the length is invalid', () => {
    expect(() => getBytes('1234', 1)).toThrow(
      'Invalid value: Must be a non-zero 1-byte byte array.',
    );

    expect(() => getBytes(hexStringToBytes('1234'), 1)).toThrow(
      'Invalid value: Must be a non-zero 1-byte byte array.',
    );
  });

  it('throws if the value is zero', () => {
    expect(() => getBytes('0x00', 1)).toThrow(
      'Invalid value: Must be a non-zero 1-byte byte array.',
    );

    expect(() => getBytes(new Uint8Array(1).fill(0), 1)).toThrow(
      'Invalid value: Must be a non-zero 1-byte byte array.',
    );
  });

  it('throws if the value is not a Uint8Array or a hexadecimal string', () => {
    expect(() => getBytes(1, 1)).toThrow(
      'Invalid value: Expected an instance of Uint8Array or hexadecimal string.',
    );
  });
});

describe('getBytesUnsafe', () => {
  it('returns a Uint8Array for a hexadecimal string', () => {
    expect(getBytesUnsafe('0x1234', 2)).toStrictEqual(hexStringToBytes('1234'));
    expect(getBytesUnsafe('1234', 2)).toStrictEqual(hexStringToBytes('1234'));
    expect(getBytesUnsafe('0000', 2)).toStrictEqual(hexStringToBytes('0000'));
  });

  it('returns the same Uint8Array if a Uint8Array is passed', () => {
    const bytes = hexStringToBytes('1234');
    expect(getBytesUnsafe(bytes, 2)).toBe(bytes);

    const zeroBytes = hexStringToBytes('0000');
    expect(getBytesUnsafe(zeroBytes, 2)).toBe(zeroBytes);
  });

  it('throws if the length is invalid', () => {
    expect(() => getBytesUnsafe('1234', 1)).toThrow(
      'Invalid value: Must be a 1-byte byte array.',
    );

    expect(() => getBytesUnsafe(hexStringToBytes('1234'), 1)).toThrow(
      'Invalid value: Must be a 1-byte byte array.',
    );
  });

  it('throws if the value is not a Uint8Array or a hexadecimal string', () => {
    expect(() => getBytesUnsafe(1, 1)).toThrow(
      'Invalid value: Expected an instance of Uint8Array or hexadecimal string.',
    );
  });
});

describe('encodeBase58Check', () => {
  it('encodes a Uint8Array with Base58check', () => {
    expect(encodeBase58check(stringToBytes('foo bar'))).toBe('SQHFQMRT97ajZaP');
  });
});

describe('decodeBase58Check', () => {
  it('decodes a Base58check encoded string', () => {
    expect(decodeBase58check('SQHFQMRT97ajZaP')).toStrictEqual(
      stringToBytes('foo bar'),
    );
  });

  it('throws if the checksum is invalid', () => {
    expect(() => decodeBase58check('SQHFQMRT97ajZff')).toThrow(
      'Invalid extended key: Value is not base58-encoded, or the checksum is invalid.',
    );
  });
});

describe('getFingerprint', () => {
  it('returns the fingerprint for a compressed public key', async () => {
    const node = await BIP44Node.fromExtendedKey(
      'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi',
    );

    expect(getFingerprint(node.compressedPublicKeyBytes, 33)).toBe(876747070);
  });

  it('throws if the public key is not a valid Uint8Array', () => {
    expect(() => getFingerprint(new Uint8Array(33).fill(0), 33)).toThrow(
      'Invalid public key: The key must be a 33-byte, non-zero byte array.',
    );

    expect(() => getFingerprint(new Uint8Array(65).fill(1), 33)).toThrow(
      'Invalid public key: The key must be a 33-byte, non-zero byte array.',
    );
  });
});

describe('mnemonicPhraseToBytes', () => {
  it.each([fixtures.local.mnemonic, fixtures['eth-hd-keyring'].mnemonic])(
    'converts a mnemonic phrase to a Uint8Array',
    async (mnemonicPhrase) => {
      const array = mnemonicPhraseToBytes(mnemonicPhrase);
      expect(await mnemonicToSeed(array, wordlist)).toStrictEqual(
        await mnemonicToSeed(mnemonicPhrase, wordlist),
      );
    },
  );
});

describe('validateNetwork', () => {
  it('does not throw if the network is valid', () => {
    expect(() => validateNetwork('mainnet')).not.toThrow();
    expect(() => validateNetwork('testnet')).not.toThrow();
    expect(() => validateNetwork(undefined)).not.toThrow();
  });

  it('throws if the network is not a string', () => {
    expect(() => validateNetwork(1)).toThrow(
      'Invalid network: Must be a string if specified.',
    );
  });

  it('throws if the network is not a valid string', () => {
    expect(() => validateNetwork('foo')).toThrow(
      'Invalid network: Must be either "mainnet" or "testnet" if specified.',
    );
  });
});
