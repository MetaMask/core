import { bytesToHex, hexToBytes } from '@metamask/byte-utils';
import { describe, expect, it, vi } from 'vitest';

import fixtures from '../../tests/fixtures.js';
import { BIP_32_HARDENED_OFFSET } from '../constants.js';
import { ed25519, secp256k1 } from '../curves/index.js';
import { SLIP10Node } from '../SLIP10Node.js';
import { hexStringToBytes } from '../utils.js';
import {
  deriveChildKey,
  privateKeyToEthAddress,
  publicKeyToEthAddress,
} from './bip32.js';
import { bip39MnemonicToMultipath, createBip39KeyFromSeed } from './bip39.js';

describe('deriveChildKey', () => {
  it('handles deriving invalid private keys', async () => {
    const node = await SLIP10Node.fromDerivationPath({
      derivationPath: [bip39MnemonicToMultipath(fixtures.local.mnemonic)],
      curve: 'secp256k1',
    });

    // Simulate an invalid key once.
    vi.spyOn(secp256k1, 'isValidPrivateKey').mockReturnValueOnce(false);

    const childNode = await deriveChildKey({
      node,
      path: `0'`,
      curve: secp256k1,
    });

    expect(childNode.index).toBe(BIP_32_HARDENED_OFFSET + 1);
    expect(childNode).toMatchInlineSnapshot(`
      {
        "chainCode": "0xe7862c5448c2e347dbdd0ee287e69888beec88e958388c927d2eff0e04df88f8",
        "curve": "secp256k1",
        "depth": 1,
        "index": 2147483649,
        "masterFingerprint": 3293725253,
        "network": "mainnet",
        "parentFingerprint": 3293725253,
        "privateKey": "0xdcc114faa58e3feccf10e6658494c0c48b9d146dec313f0dedbd263547da23dc",
        "publicKey": "0x044948f8f48422b7608754bf228d93aff08c8e27fa46397afd80632be39f1213f8ca7aa33fd2b3630bdbbfa259841ca66f18de39f1de89a603c34f15378c817c24",
      }
    `);
  });

  it.each(fixtures.errorHandling.bip32.keys)(
    'handles deriving invalid private keys (test vectors)',
    async ({ path, privateKey, chainCode, index, depth }) => {
      const node = await createBip39KeyFromSeed(
        hexToBytes(fixtures.errorHandling.bip32.hexSeed),
        secp256k1,
      );

      // Simulate an invalid key once.
      vi.spyOn(secp256k1, 'isValidPrivateKey').mockReturnValueOnce(false);

      const childNode = await node.derive(path.ours.tuple);
      expect(childNode.privateKey).toBe(privateKey);
      expect(childNode.chainCode).toBe(chainCode);
      expect(childNode.index).toBe(index);
      expect(childNode.depth).toBe(depth);
    },
  );

  it('handles deriving invalid public keys', async () => {
    const node = await SLIP10Node.fromDerivationPath({
      derivationPath: [bip39MnemonicToMultipath(fixtures.local.mnemonic)],
      curve: 'secp256k1',
    }).then((privateNode) => privateNode.neuter());

    // Simulate an invalid key once.
    vi.spyOn(secp256k1, 'publicAdd').mockImplementationOnce(() => {
      throw new Error('Invalid key.');
    });

    const childNode = await deriveChildKey({
      node,
      path: `0`,
      curve: secp256k1,
    });

    expect(childNode.index).toBe(1);
    expect(childNode).toMatchInlineSnapshot(`
      {
        "chainCode": "0x4304d9e48a694baabefba498c2ef85f9e88307f4f621f79f19cbf5f704483130",
        "curve": "secp256k1",
        "depth": 1,
        "index": 1,
        "masterFingerprint": 3293725253,
        "network": "mainnet",
        "parentFingerprint": 3293725253,
        "privateKey": undefined,
        "publicKey": "0x048aa5d3fe38c7e81685f9efa72d8b4e9f2cb61647c954e9cdf324a6eefe8a4a00c2b7fa2b2d3e598c87d244fb4eb8708e402aa5ccd945533f4a6ddbc026f77c7b",
      }
    `);
  });

  it('throws an error if the curve is ed25519', async () => {
    const node = await SLIP10Node.fromDerivationPath({
      derivationPath: [bip39MnemonicToMultipath(fixtures.local.mnemonic)],
      curve: 'secp256k1',
    });

    await expect(
      deriveChildKey({
        node,
        path: `'bip32:0'`,
        curve: ed25519,
      }),
    ).rejects.toThrow(`Invalid curve: Only secp256k1 is supported by BIP-32.`);
  });
});

describe('privateKeyToEthAddress', () => {
  it('returns the Ethereum address for a private key', () => {
    const { privateKey, address } = fixtures['ethereumjs-wallet'];

    expect(
      bytesToHex(privateKeyToEthAddress(hexStringToBytes(privateKey))),
    ).toBe(address);
  });

  it('throws for invalid private keys', () => {
    // @ts-expect-error Invalid public key type.
    expect(() => privateKeyToEthAddress('foo')).toThrow(
      'Invalid key: The key must be a 32-byte, non-zero Uint8Array.',
    );

    expect(() => privateKeyToEthAddress(new Uint8Array(31).fill(1))).toThrow(
      'Invalid key: The key must be a 32-byte, non-zero Uint8Array.',
    );
  });
});

describe('publicKeyToEthAddress', () => {
  it('returns the Ethereum address for a public key', () => {
    const { publicKey, address } = fixtures['ethereumjs-wallet'];

    expect(bytesToHex(publicKeyToEthAddress(hexStringToBytes(publicKey)))).toBe(
      address,
    );
  });

  it('throws for invalid public keys', () => {
    // @ts-expect-error Invalid public key type.
    expect(() => publicKeyToEthAddress('foo')).toThrow(
      'Invalid key: The key must be a 65-byte, non-zero Uint8Array.',
    );

    expect(() => publicKeyToEthAddress(new Uint8Array(64).fill(1))).toThrow(
      'Invalid key: The key must be a 65-byte, non-zero Uint8Array.',
    );
  });
});
