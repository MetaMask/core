import { hexToBytes } from '@metamask/byte-utils';
import { bigIntToBytes, concatBytes } from '@metamask/byte-utils';
import { mnemonicToEntropy } from '@metamask/scure-bip39';
import { wordlist } from '@metamask/scure-bip39/dist/wordlists/english.js';
import { assert } from '@metamask/type-utils';
import { describe, expect, it, vi } from 'vitest';

import fixtures from '../../tests/fixtures.js';
import * as cryptography from '../cryptography.js';
import type { Curve } from '../curves/index.js';
import { secp256k1, ed25519Bip32 } from '../curves/index.js';
import { mnemonicPhraseToBytes } from '../utils.js';
import {
  entropyToCip3MasterNode,
  createBip39KeyFromSeed,
  deriveChildKey,
  mnemonicToSeed,
  getDerivationPathWithSeed,
  bip39MnemonicToMultipath,
} from './bip39.js';

const TEST_MNEMONIC_PHRASE =
  'pill frown erosion humor invest inquiry rich garment seek such mention punch';

describe('mnemonicToSeed', () => {
  describe('without passphrase', () => {
    // https://github.com/MetaMask/scure-bip39/blob/612c6952ca8aee034e32dd0dc307c1d96e325ae2/test/bip39.test.ts#L127-L132
    const seed = new Uint8Array([
      213, 198, 189, 89, 252, 121, 48, 207, 56, 105, 8, 152, 129, 116, 186, 218,
      26, 71, 225, 55, 201, 122, 153, 178, 5, 235, 40, 132, 179, 248, 166, 147,
      18, 128, 248, 25, 184, 206, 113, 170, 71, 235, 73, 144, 0, 134, 22, 244,
      18, 229, 222, 139, 246, 28, 123, 131, 16, 215, 191, 216, 252, 159, 213,
      235,
    ]);

    it('generates the right seed for a string mnemonic phrase', async () => {
      const generatedSeed = await mnemonicToSeed(TEST_MNEMONIC_PHRASE);
      expect(generatedSeed).toStrictEqual(seed);
    });

    it('generates the right seed for a Uint8Array mnemonic phrase', async () => {
      const mnemonic = mnemonicPhraseToBytes(TEST_MNEMONIC_PHRASE);
      const generatedSeed = await mnemonicToSeed(mnemonic);
      expect(generatedSeed).toStrictEqual(seed);
    });

    it('throws if the length of the mnemonic phrase is invalid', async () => {
      await expect(mnemonicToSeed('test')).rejects.toThrow(
        'Invalid mnemonic phrase: The mnemonic phrase must consist of 12, 15, 18, 21, or 24 words.',
      );
    });

    it('throws if the mnemonic phrase contains invalid words', async () => {
      await expect(
        mnemonicToSeed(
          'test test test test test test test test test invalid mnemonic phrase',
        ),
      ).rejects.toThrow(
        'Invalid mnemonic phrase: The mnemonic phrase contains an unknown word.',
      );
    });
  });

  describe('with passphrase', () => {
    const passphrase = 'passphrase';

    // https://github.com/MetaMask/scure-bip39/blob/612c6952ca8aee034e32dd0dc307c1d96e325ae2/test/bip39.test.ts#L162-L167
    const seed = new Uint8Array([
      180, 211, 212, 196, 151, 216, 92, 25, 11, 35, 14, 186, 80, 80, 141, 156,
      245, 11, 25, 118, 50, 75, 80, 36, 116, 113, 11, 112, 36, 86, 70, 188, 92,
      156, 172, 167, 83, 159, 47, 149, 92, 107, 130, 66, 39, 251, 34, 169, 115,
      143, 121, 110, 166, 28, 221, 93, 252, 165, 155, 127, 19, 138, 107, 135,
    ]);

    it('generates the right seed for a string mnemonic phrase', async () => {
      const generatedSeed = await mnemonicToSeed(
        TEST_MNEMONIC_PHRASE,
        passphrase,
      );

      expect(generatedSeed).toStrictEqual(seed);
    });

    it('generates the right seed for a Uint8Array mnemonic phrase', async () => {
      const mnemonic = mnemonicPhraseToBytes(TEST_MNEMONIC_PHRASE);
      const generatedSeed = await mnemonicToSeed(mnemonic, passphrase);
      expect(generatedSeed).toStrictEqual(seed);
    });
  });
});

describe('getDerivationPathWithSeed', () => {
  it('returns a derivation path with a seed for the `secp256k1` curve', async () => {
    const derivationPath = await getDerivationPathWithSeed({
      path: [
        bip39MnemonicToMultipath(fixtures.local.mnemonic),
        'bip32:0',
        'bip32:1',
      ],
      curve: 'secp256k1',
    });

    expect(derivationPath).toStrictEqual([
      fixtures.local.seed,
      'bip32:0',
      'bip32:1',
    ]);
  });

  it('returns a derivation path with a seed for the `ed25519` curve', async () => {
    const derivationPath = await getDerivationPathWithSeed({
      path: [
        bip39MnemonicToMultipath(fixtures.local.mnemonic),
        'bip32:0',
        'bip32:1',
      ],
      curve: 'ed25519',
    });

    expect(derivationPath).toStrictEqual([
      fixtures.local.seed,
      'bip32:0',
      'bip32:1',
    ]);
  });

  it('returns a derivation path with entropy for the `ed25519Bip32` curve', async () => {
    const derivationPath = await getDerivationPathWithSeed({
      path: [
        bip39MnemonicToMultipath(fixtures.cip3[0].mnemonic),
        'bip32:0',
        'bip32:1',
      ],
      curve: 'ed25519Bip32',
    });

    expect(derivationPath).toStrictEqual([
      hexToBytes(fixtures.cip3[0].entropyHex),
      'bip32:0',
      'bip32:1',
    ]);
  });
});

describe('createBip39KeyFromSeed', () => {
  const RANDOM_SEED = hexToBytes(
    '0xea82e6ee9d319c083007d0b011a37b0e480ae02417a988ac90355abd53cd04fc',
  );

  it('throws if the seed is less than 16 bytes', async () => {
    await expect(
      createBip39KeyFromSeed(new Uint8Array(15), secp256k1),
    ).rejects.toThrow(
      'Invalid seed: The seed must be between 16 and 64 bytes long.',
    );
  });

  it('throws if the seed is greater than 64 bytes', async () => {
    await expect(
      createBip39KeyFromSeed(new Uint8Array(65), secp256k1),
    ).rejects.toThrow(
      'Invalid seed: The seed must be between 16 and 64 bytes long.',
    );
  });

  it('throws if the private key is zero', async () => {
    // Mock the hmac function to return a zero private key.
    vi.spyOn(cryptography, 'hmacSha512').mockResolvedValueOnce(
      new Uint8Array(64),
    );

    await expect(
      createBip39KeyFromSeed(RANDOM_SEED, secp256k1),
    ).rejects.toThrow(
      'Invalid private key: The private key must greater than 0 and less than the curve order.',
    );
  });

  it.each([
    bigIntToBytes(secp256k1.curve.n),
    concatBytes([secp256k1.curve.n + BigInt(1)]),
  ])(
    'throws if the private key is greater than or equal to the curve order',
    async (privateKey) => {
      // For this test to be effective, the private key must be 32 bytes.
      assert(privateKey.length === 32);

      // Mock the hmac function to return a private key larger than the curve order.
      vi.spyOn(cryptography, 'hmacSha512').mockResolvedValueOnce(
        concatBytes([privateKey, new Uint8Array(32)]),
      );

      await expect(
        createBip39KeyFromSeed(RANDOM_SEED, secp256k1),
      ).rejects.toThrow(
        'Invalid private key: The private key must greater than 0 and less than the curve order.',
      );
    },
  );

  it('throws with unsupported master node generation error', async () => {
    await expect(
      deriveChildKey({
        path: new Uint8Array(),
        curve: {
          masterNodeGenerationSpec: 'notValidMasterNodeGenerationSpec',
        } as unknown as Curve,
      }),
    ).rejects.toThrow('Unsupported master node generation spec.');
  });
});

describe('Cip3', () => {
  describe('entropyToCip3MasterNode', () => {
    it.each(fixtures.cip3)(
      'derives the correct bip39 key for ed25519Bip32 curve',
      async (fixture) => {
        const result = await entropyToCip3MasterNode(
          hexToBytes(fixture.entropyHex),
          ed25519Bip32,
        );
        const { bip39Node } = fixture.nodes;
        expect(result.privateKey).toBe(bip39Node.privateKey);
        expect(result.chainCode).toBe(bip39Node.chainCode);
      },
    );

    it.each(fixtures.cip3)(
      'clamps the master key if a custom `pbkdf2Sha512` returns a `Buffer`',
      async (fixture) => {
        const result = await entropyToCip3MasterNode(
          hexToBytes(fixture.entropyHex),
          ed25519Bip32,
          undefined,
          {
            pbkdf2Sha512: async (password, salt, iterations, keyLength) =>
              Buffer.from(
                await cryptography.pbkdf2Sha512(
                  password,
                  salt,
                  iterations,
                  keyLength,
                ),
              ),
          },
        );
        const { bip39Node } = fixture.nodes;
        expect(result.privateKey).toBe(bip39Node.privateKey);
        expect(result.chainCode).toBe(bip39Node.chainCode);
      },
    );

    it('throws if the entropy is less than 16 bytes', async () => {
      await expect(
        entropyToCip3MasterNode(new Uint8Array(15), ed25519Bip32),
      ).rejects.toThrow(
        'Invalid entropy: The entropy must be between 16 and 64 bytes long.',
      );
    });

    it('throws if the entropy is greater than 64 bytes', async () => {
      await expect(
        entropyToCip3MasterNode(new Uint8Array(65), ed25519Bip32),
      ).rejects.toThrow(
        'Invalid entropy: The entropy must be between 16 and 64 bytes long.',
      );
    });
  });

  describe('deriveChildKey', () => {
    it.each(fixtures.cip3)(
      'derives the correct child key for ed25519Bip32 curve from mnemonic',
      async (fixture) => {
        const result = await deriveChildKey({
          path: mnemonicToEntropy(fixture.mnemonic, wordlist),
          curve: ed25519Bip32,
        });

        const { bip39Node } = fixture.nodes;
        expect(result.privateKey).toBe(bip39Node.privateKey);
        expect(result.chainCode).toBe(bip39Node.chainCode);
      },
    );
  });
});
