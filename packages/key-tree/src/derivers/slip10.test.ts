import { hexToBytes } from '@metamask/byte-utils';
import { describe, expect, it, vi } from 'vitest';

import fixtures from '../../tests/fixtures.js';
import { BIP_32_HARDENED_OFFSET } from '../constants.js';
import { ed25519, secp256k1 } from '../curves/index.js';
import { SLIP10Node } from '../SLIP10Node.js';
import { bip39MnemonicToMultipath, createBip39KeyFromSeed } from './bip39.js';
import { deriveChildKey } from './slip10.js';

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

    expect(childNode.index).toBe(BIP_32_HARDENED_OFFSET);
    expect(childNode).toMatchInlineSnapshot(`
      {
        "chainCode": "0x69c58a9e53bb674d1bbeb871975f01adce5e058cdcba89f8930225341a75b439",
        "curve": "secp256k1",
        "depth": 1,
        "index": 2147483648,
        "masterFingerprint": 3293725253,
        "network": "mainnet",
        "parentFingerprint": 3293725253,
        "privateKey": "0xb9dbe9cda5d858df377ab6c6a9b3efef99269142e390d24aaceb49c547b9fcad",
        "publicKey": "0x0422a2beb2a0c800ef19200db9161a3a7ee5645ccf67c05e18e7055a73cb1e1451f2c85f9aaac274bd16ea9a77f102feef3aba3f37ed6ac6e0961fb569011e42cf",
      }
    `);
  });

  it.each(fixtures.errorHandling.slip10.keys)(
    'handles deriving invalid private keys (test vectors)',
    async ({ path, privateKey, chainCode }) => {
      const node = await createBip39KeyFromSeed(
        hexToBytes(fixtures.errorHandling.slip10.hexSeed),
        secp256k1,
      );

      // Simulate an invalid key once.
      vi.spyOn(secp256k1, 'isValidPrivateKey').mockReturnValueOnce(false);

      const childNode = await node.derive(path.ours.tuple);
      expect(childNode.privateKey).toBe(privateKey);
      expect(childNode.chainCode).toBe(chainCode);
    },
  );

  it('throws the original error if the curve is ed25519', async () => {
    const node = await SLIP10Node.fromDerivationPath({
      derivationPath: [bip39MnemonicToMultipath(fixtures.local.mnemonic)],
      curve: 'ed25519',
    });

    // This should never be the case.
    const error = new Error('Unable to derive child key.');
    vi.spyOn(SLIP10Node, 'fromExtendedKey').mockImplementationOnce(() => {
      throw error;
    });

    await expect(
      deriveChildKey({
        node,
        path: `0'`,
        curve: ed25519,
      }),
    ).rejects.toThrow(error);
  });

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

    expect(childNode.index).toBe(0);
    expect(childNode).toMatchInlineSnapshot(`
      {
        "chainCode": "0x03eebbe4707329e7da4aef868adb65f21bdc8712a86567b17a15ee4c3f01a57a",
        "curve": "secp256k1",
        "depth": 1,
        "index": 0,
        "masterFingerprint": 3293725253,
        "network": "mainnet",
        "parentFingerprint": 3293725253,
        "privateKey": undefined,
        "publicKey": "0x04bc28203026c9fda2030f00ca592bdbe25392a106afae5205fa07dc4d77ecc61d21fa7a4bf21920abb52f56ae87f2d7b10d5db8d51229dea9c98c6b7982d514f9",
      }
    `);
  });
});
