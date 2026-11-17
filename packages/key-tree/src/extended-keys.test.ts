import { hexToBytes } from '@metamask/byte-utils';
import { describe, expect, it } from 'vitest';

import type { ExtendedKey } from './extended-keys.js';
import { decodeExtendedKey, encodeExtendedKey } from './extended-keys.js';
import { hexStringToBytes } from './utils.js';

describe('decodeExtendedKey', () => {
  it('decodes an extended public key (mainnet)', () => {
    const extendedKey =
      'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8';

    expect(decodeExtendedKey(extendedKey)).toStrictEqual({
      type: 'public',
      depth: 0,
      parentFingerprint: 0,
      index: 0,
      network: 'mainnet',
      chainCode: hexToBytes(
        '873dff81c02f525623fd1fe5167eac3a55a049de3d314bb42ee227ffed37d508',
      ),
      publicKey: hexToBytes(
        '0439a36013301597daef41fbe593a02cc513d0b55527ec2df1050e2e8ff49c85c23cbe7ded0e7ce6a594896b8f62888fdbc5c8821305e2ea42bf01e37300116281',
      ),
    });
  });

  it('decodes an extended public key (testnet)', () => {
    const extendedKey =
      'tpubD6NzVbkrYhZ4XgiXtGrdW5XDAPFCL9h7we1vwNCpn8tGbBcgfVYjXyhWo4E1xkh56hjod1RhGjxbaTLV3X4FyWuejifB9jusQ46QzG87VKp';

    expect(decodeExtendedKey(extendedKey)).toStrictEqual({
      type: 'public',
      depth: 0,
      parentFingerprint: 0,
      index: 0,
      network: 'testnet',
      chainCode: hexToBytes(
        '873dff81c02f525623fd1fe5167eac3a55a049de3d314bb42ee227ffed37d508',
      ),
      publicKey: hexToBytes(
        '0439a36013301597daef41fbe593a02cc513d0b55527ec2df1050e2e8ff49c85c23cbe7ded0e7ce6a594896b8f62888fdbc5c8821305e2ea42bf01e37300116281',
      ),
    });
  });

  it('decodes an extended private key', () => {
    const extendedKey =
      'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi';

    expect(decodeExtendedKey(extendedKey)).toStrictEqual({
      type: 'private',
      depth: 0,
      parentFingerprint: 0,
      index: 0,
      network: 'mainnet',
      chainCode: hexStringToBytes(
        '873dff81c02f525623fd1fe5167eac3a55a049de3d314bb42ee227ffed37d508',
      ),
      privateKey: hexStringToBytes(
        'e8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35',
      ),
    });
  });

  it('decodes an extended private key (testnet)', () => {
    const extendedKey =
      'tprv8ZgxMBicQKsPeDgjzdC36fs6bMjGApWDNLR9erAXMs5skhMv36j9MV5ecvfavji5khqjWaWSFhN3YcCUUdiKH6isR4Pwy3U5y5egddBr16m';

    expect(decodeExtendedKey(extendedKey)).toStrictEqual({
      type: 'private',
      depth: 0,
      parentFingerprint: 0,
      index: 0,
      network: 'testnet',
      chainCode: hexStringToBytes(
        '873dff81c02f525623fd1fe5167eac3a55a049de3d314bb42ee227ffed37d508',
      ),
      privateKey: hexStringToBytes(
        'e8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35',
      ),
    });
  });

  it('throws if the extended key is not a valid Base58 string', () => {
    const extendedKey =
      'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMP';

    expect(() => decodeExtendedKey(extendedKey)).toThrow(
      'Invalid extended key: Value is not base58-encoded, or the checksum is invalid.',
    );
  });

  it('throws if the extended key is not 78 bytes long', () => {
    const extendedKey = '3kSkWR5gTP';

    expect(() => decodeExtendedKey(extendedKey)).toThrow(
      'Invalid extended key: Expected a length of 78, got 3.',
    );
  });

  it('throws if the chain code is invalid', () => {
    const extendedKey =
      'xprv9s21ZrQH143K24Mfq5zL5MhWK9hUhhGbd45hLXo2Pq2oqzMMo63oStZzFAp8UkorEcJ4wSbGzEaLySRnFibyHm9Wvj72EK5vSiRn21B5B1e';

    expect(() => decodeExtendedKey(extendedKey)).toThrow(
      'Invalid extended key: Chain code must be a 32-byte non-zero byte array.',
    );
  });

  it('throws if the key is invalid', () => {
    const extendedKey =
      'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChijLXZSun8bsGj49MuvWWsqL9fqS5fhiDUkRQvq8cj8L42RGwHP';

    expect(() => decodeExtendedKey(extendedKey)).toThrow(
      'Invalid extended key: Key must be a 33-byte non-zero byte array.',
    );
  });

  it('throws if the public key does not start with 0x02 or 0x03', () => {
    const extendedKey =
      'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gYxFk5nqmbwrSjnkQvUtYydeKpRyanfmc6qmeyusqpnVEF2j8DGn';

    expect(() => decodeExtendedKey(extendedKey)).toThrow(
      'Invalid extended key: Public key must start with 0x02 or 0x03.',
    );
  });

  it('throws if the private key does not start with 0x00', () => {
    const extendedKey =
      'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiCqXZ9CTurr9xyzDFnddSPdB3k1pPUqfyv5k5KrkLa5wTGuBuaXXE';

    expect(() => decodeExtendedKey(extendedKey)).toThrow(
      'Invalid extended key: Private key must start with 0x00.',
    );
  });

  it('throws if the version is invalid', () => {
    const extendedKey =
      'xpuawnJgETRpXRUEauaMeTjxFtUTpGU6atj1BvkT6gWzaHrxtD2MWRCJkqjJE5j5VQuSNXkpoT7VPMHTTsFeySMd9WrjsTy28qcuJywWdgp5PfV';

    expect(() => decodeExtendedKey(extendedKey)).toThrow(
      'Invalid extended key: Expected a public (xpub) or private key (xprv) version.',
    );
  });
});

describe('encodeExtendedKey', () => {
  it('encodes an extended public key (mainnet)', () => {
    const extendedKey: ExtendedKey = {
      type: 'public',
      depth: 0,
      parentFingerprint: 0,
      index: 0,
      network: 'mainnet',
      chainCode: hexStringToBytes(
        '873dff81c02f525623fd1fe5167eac3a55a049de3d314bb42ee227ffed37d508',
      ),
      publicKey: hexStringToBytes(
        '0439a36013301597daef41fbe593a02cc513d0b55527ec2df1050e2e8ff49c85c23cbe7ded0e7ce6a594896b8f62888fdbc5c8821305e2ea42bf01e37300116281',
      ),
    };

    expect(encodeExtendedKey(extendedKey)).toBe(
      'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8',
    );
  });

  it('encodes an extended public key (testnet)', () => {
    const extendedKey: ExtendedKey = {
      type: 'public',
      depth: 0,
      parentFingerprint: 0,
      index: 0,
      network: 'testnet',
      chainCode: hexStringToBytes(
        '873dff81c02f525623fd1fe5167eac3a55a049de3d314bb42ee227ffed37d508',
      ),
      publicKey: hexStringToBytes(
        '0439a36013301597daef41fbe593a02cc513d0b55527ec2df1050e2e8ff49c85c23cbe7ded0e7ce6a594896b8f62888fdbc5c8821305e2ea42bf01e37300116281',
      ),
    };

    expect(encodeExtendedKey(extendedKey)).toBe(
      'tpubD6NzVbkrYhZ4XgiXtGrdW5XDAPFCL9h7we1vwNCpn8tGbBcgfVYjXyhWo4E1xkh56hjod1RhGjxbaTLV3X4FyWuejifB9jusQ46QzG87VKp',
    );
  });

  it('encodes an extended private key (mainnet)', () => {
    const extendedKey: ExtendedKey = {
      type: 'private',
      depth: 0,
      parentFingerprint: 0,
      index: 0,
      network: 'mainnet',
      chainCode: hexStringToBytes(
        '873dff81c02f525623fd1fe5167eac3a55a049de3d314bb42ee227ffed37d508',
      ),
      privateKey: hexStringToBytes(
        'e8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35',
      ),
    };

    expect(encodeExtendedKey(extendedKey)).toBe(
      'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi',
    );
  });

  it('encodes an extended private key (testnet)', () => {
    const extendedKey: ExtendedKey = {
      type: 'private',
      depth: 0,
      parentFingerprint: 0,
      index: 0,
      network: 'testnet',
      chainCode: hexStringToBytes(
        '873dff81c02f525623fd1fe5167eac3a55a049de3d314bb42ee227ffed37d508',
      ),
      privateKey: hexStringToBytes(
        'e8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35',
      ),
    };

    expect(encodeExtendedKey(extendedKey)).toBe(
      'tprv8ZgxMBicQKsPeDgjzdC36fs6bMjGApWDNLR9erAXMs5skhMv36j9MV5ecvfavji5khqjWaWSFhN3YcCUUdiKH6isR4Pwy3U5y5egddBr16m',
    );
  });

  it('throws if the network is invalid', () => {
    const extendedKey: ExtendedKey = {
      type: 'public',
      depth: 0,
      parentFingerprint: 0,
      index: 0,
      // @ts-expect-error - Invalid network.
      network: 'invalid',
      chainCode: hexStringToBytes(
        '873dff81c02f525623fd1fe5167eac3a55a049de3d314bb42ee227ffed37d508',
      ),
      publicKey: hexStringToBytes(
        '0439a36013301597daef41fbe593a02cc513d0b55527ec2df1050e2e8ff49c85c23cbe7ded0e7ce6a594896b8f62888fdbc5c8821305e2ea42bf01e37300116281',
      ),
    };

    expect(() => encodeExtendedKey(extendedKey)).toThrow(
      'Invalid branch reached. Should be detected during compilation.',
    );
  });
});
