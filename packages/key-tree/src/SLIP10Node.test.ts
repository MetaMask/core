import { bytesToHex, hexToBytes } from '@metamask/byte-utils';
import { describe, expect, it, vi } from 'vitest';

import fixtures from '../tests/fixtures.js';
import { BIP44PurposeNodeToken } from './constants.js';
import { pbkdf2Sha512, hmacSha512 } from './cryptography.js';
import { ed25519, secp256k1 } from './curves/index.js';
import { compressPublicKey } from './curves/secp256k1.js';
import { createBip39KeyFromSeed, deriveChildKey } from './derivers/bip39.js';
import { encodeExtendedKey } from './extended-keys.js';
import { SLIP10Node } from './SLIP10Node.js';
import { hexStringToBytes, mnemonicPhraseToBytes } from './utils.js';

const defaultBip39NodeToken = `bip39:${fixtures.local.mnemonic}` as const;
const defaultBip39BytesToken = mnemonicPhraseToBytes(fixtures.local.mnemonic);

describe('SLIP10Node', () => {
  describe('constructor', () => {
    it('throws an error when the constructor guard is not provided', async () => {
      const { privateKey, chainCode } = await deriveChildKey({
        path: fixtures.local.seed,
        curve: secp256k1,
      });

      expect(
        () =>
          // @ts-expect-error - Constructor is private.
          new SLIP10Node({
            privateKey,
            chainCode,
            depth: 0,
            masterFingerprint: 0,
            parentFingerprint: 0,
            index: 0,
            curve: 'secp256k1',
          }),
      ).toThrow(
        'SLIP10Node can only be constructed using `SLIP10Node.fromJSON`, `SLIP10Node.fromExtendedKey`, `SLIP10Node.fromDerivationPath`, or `SLIP10Node.fromSeed`.',
      );
    });
  });

  describe('fromExtendedKey', () => {
    describe('using an object', () => {
      it('initializes a new node from a private key', async () => {
        const { privateKeyBytes, chainCodeBytes } = await deriveChildKey({
          path: fixtures.local.seed,
          curve: secp256k1,
        });

        const node = await SLIP10Node.fromExtendedKey({
          privateKey: privateKeyBytes,
          chainCode: chainCodeBytes,
          depth: 0,
          parentFingerprint: 0,
          index: 0,
          curve: 'secp256k1',
        });

        expect(node.depth).toBe(0);
        expect(node.privateKeyBytes).toHaveLength(32);
        expect(node.publicKeyBytes).toHaveLength(65);
      });

      it('initializes a new node from a hexadecimal private key and chain code', async () => {
        const { privateKey, chainCode } = await deriveChildKey({
          path: fixtures.local.seed,
          curve: secp256k1,
        });

        const node = await SLIP10Node.fromExtendedKey({
          privateKey,
          chainCode,
          depth: 0,
          parentFingerprint: 0,
          index: 0,
          curve: 'secp256k1',
        });

        expect(node.depth).toBe(0);
        expect(node.privateKeyBytes).toHaveLength(32);
        expect(node.publicKeyBytes).toHaveLength(65);
      });

      it('initializes a new ed25519 node from a private key', async () => {
        const { privateKey, chainCode } = await deriveChildKey({
          path: fixtures.local.seed,
          curve: ed25519,
        });

        const node = await SLIP10Node.fromExtendedKey({
          privateKey,
          chainCode,
          depth: 0,
          parentFingerprint: 0,
          index: 0,
          curve: 'ed25519',
        });

        expect(node.depth).toBe(0);
        expect(node.privateKeyBytes).toHaveLength(32);
        expect(node.publicKeyBytes).toHaveLength(33);
      });

      it('initializes a new ed25519 node from a zero private key', async () => {
        const node = await SLIP10Node.fromExtendedKey({
          privateKey: new Uint8Array(32).fill(0),
          chainCode: new Uint8Array(32).fill(1),
          depth: 0,
          parentFingerprint: 0,
          index: 0,
          curve: 'ed25519',
        });

        expect(node.depth).toBe(0);
        expect(node.privateKeyBytes).toStrictEqual(new Uint8Array(32).fill(0));
        expect(node.publicKeyBytes).toHaveLength(33);
      });

      it('initializes a new node from a public key', async () => {
        const { publicKeyBytes, chainCodeBytes } = await deriveChildKey({
          path: fixtures.local.seed,
          curve: secp256k1,
        });

        const node = await SLIP10Node.fromExtendedKey({
          publicKey: publicKeyBytes,
          chainCode: chainCodeBytes,
          depth: 0,
          parentFingerprint: 0,
          index: 0,
          curve: 'secp256k1',
        });

        expect(node.depth).toBe(0);
        expect(node.privateKeyBytes).toBeUndefined();
        expect(node.publicKeyBytes).toHaveLength(65);
      });

      it('initializes a new ed25519 node from a public key', async () => {
        const { publicKeyBytes, chainCodeBytes } = await deriveChildKey({
          path: fixtures.local.seed,
          curve: ed25519,
        });

        const node = await SLIP10Node.fromExtendedKey({
          publicKey: publicKeyBytes,
          chainCode: chainCodeBytes,
          depth: 0,
          parentFingerprint: 0,
          index: 0,
          curve: 'ed25519',
        });

        expect(node.depth).toBe(0);
        expect(node.privateKeyBytes).toBeUndefined();
        expect(node.publicKeyBytes).toHaveLength(33);
      });

      it('initializes a new node from a hexadecimal public key and chain code', async () => {
        const { publicKey, chainCode } = await deriveChildKey({
          path: fixtures.local.seed,
          curve: secp256k1,
        });

        const node = await SLIP10Node.fromExtendedKey({
          publicKey,
          chainCode,
          depth: 0,
          parentFingerprint: 0,
          index: 0,
          curve: 'secp256k1',
        });

        expect(node.depth).toBe(0);
        expect(node.privateKeyBytes).toBeUndefined();
        expect(node.publicKeyBytes).toHaveLength(65);
      });

      it('initializes a new node from JSON', async () => {
        const node = await deriveChildKey({
          path: fixtures.local.seed,
          curve: secp256k1,
        });

        expect(await SLIP10Node.fromJSON(node.toJSON())).toStrictEqual(node);
      });

      it('initializes a new node from JSON with a public key', async () => {
        const { privateKey, chainCode } = await deriveChildKey({
          path: fixtures.local.seed,
          curve: secp256k1,
        });

        const node = await SLIP10Node.fromExtendedKey({
          privateKey,
          chainCode,
          depth: 0,
          parentFingerprint: 0,
          index: 0,
          curve: 'secp256k1',
        });

        const neuteredNode = node.neuter();

        expect(await SLIP10Node.fromJSON(neuteredNode.toJSON())).toStrictEqual(
          neuteredNode,
        );
      });

      it('throws if no public or private key is specified', async () => {
        await expect(
          SLIP10Node.fromExtendedKey({
            chainCode: new Uint8Array(32).fill(1),
            depth: 0,
            parentFingerprint: 0,
            index: 0,
            curve: 'secp256k1',
          }),
        ).rejects.toThrow(
          'Invalid options: Must provide either a private key or a public key.',
        );
      });

      it('throws if the depth is invalid', async () => {
        const inputs = [
          -1,
          0.1,
          -0.1,
          NaN,
          Infinity,
          '0',
          'zero',
          {},
          null,
          undefined,
        ];

        for (const input of inputs) {
          await expect(
            SLIP10Node.fromExtendedKey({
              depth: input as any,
              parentFingerprint: 0,
              index: 0,
              publicKey: new Uint8Array(65).fill(1),
              chainCode: new Uint8Array(32).fill(1),
              curve: 'secp256k1',
            }),
          ).rejects.toThrow(
            `Invalid HD tree path depth: The depth must be a positive integer. Received: "${String(
              input,
            )}"`,
          );
        }
      });

      it('throws if the parent fingerprint is invalid', async () => {
        const inputs = [
          -1,
          0.1,
          -0.1,
          NaN,
          Infinity,
          '0',
          'zero',
          {},
          null,
          undefined,
        ];

        for (const input of inputs) {
          await expect(
            SLIP10Node.fromExtendedKey({
              depth: 0,
              parentFingerprint: input as any,
              index: 0,
              publicKey: new Uint8Array(65).fill(1),
              chainCode: new Uint8Array(32).fill(1),
              curve: 'secp256k1',
            }),
          ).rejects.toThrow(
            `Invalid parent fingerprint: The fingerprint must be a positive integer. Received: "${String(
              input,
            )}"`,
          );
        }
      });

      it('throws if the private key is invalid', async () => {
        await expect(
          SLIP10Node.fromExtendedKey({
            privateKey: 'foo',
            chainCode: new Uint8Array(32).fill(1),
            depth: 0,
            parentFingerprint: 0,
            index: 0,
            curve: 'secp256k1',
          }),
        ).rejects.toThrow('Value must be a hexadecimal string.');
      });

      it('throws if the private key is not a Uint8Array or hexadecimal string', async () => {
        await expect(
          SLIP10Node.fromExtendedKey({
            // @ts-expect-error Invalid private key type.
            privateKey: 123,
            chainCode: new Uint8Array(32).fill(1),
            depth: 0,
            parentFingerprint: 0,
            index: 0,
            curve: 'secp256k1',
          }),
        ).rejects.toThrow(
          'Invalid value: Expected an instance of Uint8Array or hexadecimal string.',
        );
      });

      it('throws if the private key is zero for secp256k1', async () => {
        await expect(
          SLIP10Node.fromExtendedKey({
            privateKey: new Uint8Array(32).fill(0),
            chainCode: new Uint8Array(32).fill(1),
            depth: 0,
            parentFingerprint: 0,
            index: 0,
            curve: 'secp256k1',
          }),
        ).rejects.toThrow(
          'Invalid private key: Value is not a valid secp256k1 private key.',
        );
      });

      it('throws if the depth is zero and the parent fingerprint is not zero', async () => {
        await expect(
          SLIP10Node.fromExtendedKey({
            privateKey: new Uint8Array(32).fill(1),
            chainCode: new Uint8Array(32).fill(1),
            depth: 0,
            parentFingerprint: 1,
            index: 0,
            curve: 'secp256k1',
          }),
        ).rejects.toThrow(
          'Invalid parent fingerprint: The fingerprint of the root node must be 0. Received: "1".',
        );
      });

      it('throws if the depth is not zero and the parent fingerprint is zero', async () => {
        await expect(
          SLIP10Node.fromExtendedKey({
            privateKey: new Uint8Array(32).fill(1),
            chainCode: new Uint8Array(32).fill(1),
            depth: 1,
            parentFingerprint: 0,
            index: 0,
            curve: 'secp256k1',
          }),
        ).rejects.toThrow(
          'Invalid parent fingerprint: The fingerprint of a child node must not be 0. Received: "0".',
        );
      });

      it('throws if the depth is >= 2 and the parent fingerprint is equal to the master fingerprint', async () => {
        await expect(
          SLIP10Node.fromExtendedKey({
            privateKey: new Uint8Array(32).fill(1),
            chainCode: new Uint8Array(32).fill(1),
            depth: 2,
            parentFingerprint: 1,
            masterFingerprint: 1,
            index: 0,
            curve: 'secp256k1',
          }),
        ).rejects.toThrow(
          'Invalid parent fingerprint: The fingerprint of a child node cannot be equal to the master fingerprint. Received: "1".',
        );
      });

      it('throws if the depth is zero and the index is not zero', async () => {
        await expect(
          SLIP10Node.fromExtendedKey({
            privateKey: new Uint8Array(32).fill(1),
            chainCode: new Uint8Array(32).fill(1),
            depth: 0,
            parentFingerprint: 0,
            index: 1,
            curve: 'secp256k1',
          }),
        ).rejects.toThrow(
          'Invalid index: The index of the root node must be 0. Received: "1".',
        );
      });
    });

    describe('using a BIP-32 serialised extended key', () => {
      it('initializes a new node from a private key', async () => {
        const { extendedKey, privateKey, chainCode } = await deriveChildKey({
          path: fixtures.local.seed,
          curve: secp256k1,
        });

        const node = await SLIP10Node.fromExtendedKey(extendedKey);

        expect(node.depth).toBe(0);
        expect(node.privateKeyBytes).toHaveLength(32);
        expect(node.publicKeyBytes).toHaveLength(65);
        expect(node.privateKey).toBe(privateKey);
        expect(node.chainCode).toBe(chainCode);
      });

      it('initializes a new node from a public key', async () => {
        const baseNode = await deriveChildKey({
          path: fixtures.local.seed,
          curve: secp256k1,
        });

        const { extendedKey, publicKey } = baseNode.neuter();

        const node = await SLIP10Node.fromExtendedKey(extendedKey);

        expect(node.depth).toBe(0);
        expect(node.privateKeyBytes).toBeUndefined();
        expect(node.publicKeyBytes).toHaveLength(65);
        expect(node.publicKey).toBe(publicKey);
      });

      it('throws if the extended key is invalid', async () => {
        await expect(SLIP10Node.fromExtendedKey('foo')).rejects.toThrow(
          'Invalid extended key: Value is not base58-encoded, or the checksum is invalid.',
        );
      });

      it('throws if the private key is zero', async () => {
        const extendedKey = encodeExtendedKey({
          type: 'private',
          depth: 0,
          parentFingerprint: 0,
          index: 0,
          network: 'mainnet',
          chainCode: new Uint8Array(32).fill(1),
          privateKey: new Uint8Array(32).fill(0),
        });

        await expect(SLIP10Node.fromExtendedKey(extendedKey)).rejects.toThrow(
          'Invalid extended key: Key must be a 33-byte non-zero byte array.',
        );
      });

      it('throws if the depth is zero and the parent fingerprint is not zero', async () => {
        const extendedKey = encodeExtendedKey({
          type: 'private',
          depth: 0,
          parentFingerprint: 1,
          index: 0,
          network: 'mainnet',
          chainCode: new Uint8Array(32).fill(1),
          privateKey: new Uint8Array(32).fill(1),
        });

        await expect(SLIP10Node.fromExtendedKey(extendedKey)).rejects.toThrow(
          'Invalid parent fingerprint: The fingerprint of the root node must be 0. Received: "1".',
        );
      });

      it('throws if the depth is not zero and the parent fingerprint is zero', async () => {
        const extendedKey = encodeExtendedKey({
          type: 'private',
          depth: 1,
          parentFingerprint: 0,
          index: 0,
          network: 'mainnet',
          chainCode: new Uint8Array(32).fill(1),
          privateKey: new Uint8Array(32).fill(1),
        });

        await expect(SLIP10Node.fromExtendedKey(extendedKey)).rejects.toThrow(
          'Invalid parent fingerprint: The fingerprint of a child node must not be 0. Received: "0".',
        );
      });

      it('throws if the depth is zero and the index is not zero', async () => {
        const extendedKey = encodeExtendedKey({
          type: 'private',
          depth: 0,
          parentFingerprint: 0,
          index: 1,
          network: 'mainnet',
          chainCode: new Uint8Array(32).fill(1),
          privateKey: new Uint8Array(32).fill(1),
        });

        await expect(SLIP10Node.fromExtendedKey(extendedKey)).rejects.toThrow(
          'Invalid index: The index of the root node must be 0. Received: "1".',
        );
      });
    });
  });

  describe('fromDerivationPath', () => {
    it('initializes a new node from a derivation path', async () => {
      // Ethereum coin type node
      const node = await SLIP10Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:60'`,
        ],
        curve: 'secp256k1',
      });

      expect(node.depth).toBe(2);
      expect(node.toJSON()).toStrictEqual({
        depth: node.depth,
        masterFingerprint: node.masterFingerprint,
        parentFingerprint: node.parentFingerprint,
        index: node.index,
        network: node.network,
        curve: 'secp256k1',
        privateKey: node.privateKey,
        publicKey: node.publicKey,
        chainCode: node.chainCode,
      });
    });

    it('initializes a new node from a derivation path with a Uint8Array', async () => {
      const node = await SLIP10Node.fromDerivationPath({
        derivationPath: [
          defaultBip39BytesToken,
          BIP44PurposeNodeToken,
          `bip32:60'`,
        ],
        curve: 'secp256k1',
      });

      const stringNode = await SLIP10Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:60'`,
        ],
        curve: 'secp256k1',
      });

      expect(node.toJSON()).toStrictEqual(stringNode.toJSON());
    });

    it('initializes a new node from a derivation path with a Uint8Array using ed25519', async () => {
      const node = await SLIP10Node.fromDerivationPath({
        derivationPath: [defaultBip39BytesToken, `slip10:44'`, `slip10:60'`],
        curve: 'ed25519',
      });

      const stringNode = await SLIP10Node.fromDerivationPath({
        derivationPath: [defaultBip39NodeToken, `slip10:44'`, `slip10:60'`],
        curve: 'ed25519',
      });

      expect(node.toJSON()).toStrictEqual(stringNode.toJSON());
    });

    it('throws if the derivation path is empty', async () => {
      await expect(
        SLIP10Node.fromDerivationPath({
          derivationPath: [] as any,
          curve: 'secp256k1',
        }),
      ).rejects.toThrow(
        'Invalid derivation path: May not specify an empty derivation path.',
      );
    });

    it('throws if no derivation path is specified', async () => {
      await expect(
        // @ts-expect-error No derivation path specified
        SLIP10Node.fromDerivationPath({
          curve: 'secp256k1',
        }),
      ).rejects.toThrow('Invalid options: Must provide a derivation path.');
    });

    it('throws if the derivation path is of depth 0 and not a single BIP-39 node', async () => {
      await expect(
        SLIP10Node.fromDerivationPath({
          derivationPath: [`bip32:0'`] as any,
          curve: 'secp256k1',
        }),
      ).rejects.toThrow(
        'Invalid HD path segment: The BIP-39 path must start with "bip39:".',
      );
    });

    it('throws an error if attempting to modify the fields of a node', async () => {
      const node: any = await SLIP10Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:60'`,
        ],
        curve: 'secp256k1',
      });

      // getter
      ['privateKey', 'publicKeyBytes'].forEach((property) => {
        expect(() => (node[property] = 'foo')).toThrow(
          /^Cannot set property .+ of .+ which has only a getter/iu,
        );
      });

      // frozen / readonly
      ['depth', 'privateKeyBytes', 'chainCodeBytes'].forEach((property) => {
        expect(() => (node[property] = new Uint8Array(64).fill(1))).toThrow(
          expect.objectContaining({
            name: 'TypeError',
            message: expect.stringMatching(
              `Cannot assign to read only property '${property}' of object`,
            ),
          }),
        );
      });
    });

    it('throws an error if no curve is specified', async () => {
      await expect(
        // @ts-expect-error No curve specified, but required in type
        SLIP10Node.fromDerivationPath({}),
      ).rejects.toThrow('Invalid curve: Must specify a curve.');
    });

    it('throws an error for unsupported curves', async () => {
      await expect(
        SLIP10Node.fromDerivationPath({
          // @ts-expect-error Invalid curve name for type
          curve: 'foo bar',
          specification: 'bip32',
        }),
      ).rejects.toThrow(
        'Invalid curve: Only the following curves are supported: secp256k1, ed25519, ed25519Bip32.',
      );
    });
  });

  describe('fromSeed', () => {
    it('initializes a new node from a seed', async () => {
      const node = await SLIP10Node.fromSeed({
        derivationPath: [
          fixtures.local.seed,
          BIP44PurposeNodeToken,
          `bip32:60'`,
        ],
        curve: 'secp256k1',
      });

      const mnemonicNode = await SLIP10Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:60'`,
        ],
        curve: 'secp256k1',
      });

      expect(node.toJSON()).toStrictEqual(mnemonicNode.toJSON());
    });

    it('initializes a new node from a seed with a Uint8Array using ed25519', async () => {
      const node = await SLIP10Node.fromSeed({
        derivationPath: [fixtures.local.seed, `slip10:44'`, `slip10:60'`],
        curve: 'ed25519',
      });

      const mnemonicNode = await SLIP10Node.fromDerivationPath({
        derivationPath: [defaultBip39NodeToken, `slip10:44'`, `slip10:60'`],
        curve: 'ed25519',
      });

      expect(node.toJSON()).toStrictEqual(mnemonicNode.toJSON());
    });

    it('throws if the curve is `ed25519Bip32`', async () => {
      await expect(
        SLIP10Node.fromSeed({
          derivationPath: [
            fixtures.local.seed,
            BIP44PurposeNodeToken,
            `bip32:60'`,
          ],
          curve: 'ed25519Bip32',
        }),
      ).rejects.toThrow(
        'Invalid curve: The curve "ed25519Bip32" is not supported by the `fromSeed` function.',
      );
    });

    it('throws if the derivation path is empty', async () => {
      await expect(
        SLIP10Node.fromSeed({
          derivationPath: [] as any,
          curve: 'secp256k1',
        }),
      ).rejects.toThrow(
        'Invalid derivation path: May not specify an empty derivation path.',
      );
    });

    it('throws if no derivation path is specified', async () => {
      await expect(
        // @ts-expect-error No derivation path specified
        SLIP10Node.fromSeed({
          curve: 'secp256k1',
        }),
      ).rejects.toThrow('Invalid options: Must provide a derivation path.');
    });

    it('throws if the derivation path is of depth 0 and not a single BIP-39 node', async () => {
      await expect(
        SLIP10Node.fromSeed({
          derivationPath: [`bip32:0'`] as any,
          curve: 'secp256k1',
        }),
      ).rejects.toThrow(
        'Invalid HD path segment: The segment must consist of a single BIP-39 node for depths of 0. Received: "bip32:0\'".',
      );
    });

    it('throws an error if attempting to modify the fields of a node', async () => {
      const node: any = await SLIP10Node.fromSeed({
        derivationPath: [
          fixtures.local.seed,
          BIP44PurposeNodeToken,
          `bip32:60'`,
        ],
        curve: 'secp256k1',
      });

      // getter
      ['privateKey', 'publicKeyBytes'].forEach((property) => {
        expect(() => (node[property] = 'foo')).toThrow(
          /^Cannot set property .+ of .+ which has only a getter/iu,
        );
      });

      // frozen / readonly
      ['depth', 'privateKeyBytes', 'chainCodeBytes'].forEach((property) => {
        expect(() => (node[property] = new Uint8Array(64).fill(1))).toThrow(
          expect.objectContaining({
            name: 'TypeError',
            message: expect.stringMatching(
              `Cannot assign to read only property '${property}' of object`,
            ),
          }),
        );
      });
    });

    it('throws an error if no curve is specified', async () => {
      await expect(
        // @ts-expect-error No curve specified, but required in type
        SLIP10Node.fromSeed({}),
      ).rejects.toThrow('Invalid curve: Must specify a curve.');
    });

    it('throws an error for unsupported curves', async () => {
      await expect(
        SLIP10Node.fromSeed({
          // @ts-expect-error Invalid curve name for type
          curve: 'foo bar',
          specification: 'bip32',
        }),
      ).rejects.toThrow(
        'Invalid curve: Only the following curves are supported: secp256k1, ed25519, ed25519Bip32.',
      );
    });
  });

  describe('derive', () => {
    it('derives a child node', async () => {
      const coinTypeNode = `bip32:40'`;
      const targetNode = await SLIP10Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          coinTypeNode,
        ],
        curve: 'secp256k1',
      });

      const node = await SLIP10Node.fromDerivationPath({
        derivationPath: [defaultBip39NodeToken, BIP44PurposeNodeToken],
        curve: 'secp256k1',
      });

      const childNode = await node.derive([coinTypeNode]);

      expect(childNode).toMatchObject({
        depth: targetNode.depth,
        privateKey: targetNode.privateKey,
        chainCode: targetNode.chainCode,
      });
    });

    it('derives a public child node', async () => {
      const targetNode = await SLIP10Node.fromDerivationPath({
        derivationPath: [defaultBip39NodeToken, 'bip32:0'],
        curve: 'secp256k1',
      });

      const node = await SLIP10Node.fromDerivationPath({
        derivationPath: [defaultBip39NodeToken],
        curve: 'secp256k1',
      }).then((privateNode) => privateNode.neuter());

      const childNode = await node.derive(['bip32:0']);

      expect(childNode.privateKey).toBeUndefined();
      expect(childNode).toMatchObject({
        depth: targetNode.depth,
        publicKey: targetNode.publicKey,
      });
    });

    it('throws when trying to derive a hardened node without a private key', async () => {
      const node = await SLIP10Node.fromDerivationPath({
        derivationPath: [defaultBip39NodeToken, BIP44PurposeNodeToken],
        curve: 'secp256k1',
      });

      await expect(node.neuter().derive([`bip32:0'`])).rejects.toThrow(
        'Invalid parameters: Cannot derive hardened child keys without a private key.',
      );
    });

    it('throws if the child derivation path is zero', async () => {
      const node = await SLIP10Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:3'`,
          `bip32:0'`,
        ],
        curve: 'secp256k1',
      });

      await expect(node.derive([] as any)).rejects.toThrow(
        'Invalid HD tree derivation path: Deriving a path of length 0 is not defined',
      );
    });

    it('throws when trying to derive a unhardened node with ed25519', async () => {
      const node = await SLIP10Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          `slip10:44'`,
          `slip10:3'`,
          `slip10:0'`,
        ],
        curve: 'ed25519',
      });

      await expect(node.derive(['slip10:0'])).rejects.toThrow(
        'Invalid path: Cannot derive unhardened child keys with ed25519.',
      );
    });
  });

  describe('publicKey', () => {
    const {
      ed25519: { slip10 },
      bip32,
    } = fixtures;

    it.each(slip10)(
      'returns the public key for an ed25519 node',
      async ({ hexSeed, keys }) => {
        const { privateKey, chainCode } = await createBip39KeyFromSeed(
          hexStringToBytes(hexSeed),
          ed25519,
        );

        for (const { path, publicKey } of keys) {
          const node = await SLIP10Node.fromExtendedKey({
            privateKey,
            chainCode,
            curve: 'ed25519',
            depth: 0,
            parentFingerprint: 0,
            index: 0,
          });

          if (path.ours.tuple.length === 0) {
            continue;
          }

          const childNode = await node.derive(path.ours.tuple);
          expect(childNode.publicKey).toBe(publicKey);
        }
      },
    );

    it.each(bip32)(
      'returns the public key for an secp256k1 node',
      async ({ hexSeed, keys }) => {
        const { privateKey, chainCode } = await createBip39KeyFromSeed(
          hexStringToBytes(hexSeed),
          secp256k1,
        );

        for (const { path, publicKey } of keys) {
          const node = await SLIP10Node.fromExtendedKey({
            privateKey,
            chainCode,
            curve: 'secp256k1',
            depth: 0,
            parentFingerprint: 0,
            index: 0,
          });

          if (path.ours.tuple.length === 0) {
            continue;
          }

          const childNode = await node.derive(path.ours.tuple);
          expect(childNode.publicKey).toBe(publicKey);
        }
      },
    );
  });

  describe('compressedPublicKey', () => {
    it('returns the public key in compressed form', async () => {
      const node = await SLIP10Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:0'`,
          `bip32:0'`,
        ],
        curve: 'secp256k1',
      });

      expect(node.compressedPublicKey).toStrictEqual(
        bytesToHex(compressPublicKey(node.publicKeyBytes)),
      );
    });
  });

  describe('publicKeyBytes', () => {
    it('lazily computes the public key bytes', async () => {
      const baseNode = await SLIP10Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:0'`,
          `bip32:0'`,
        ],
        curve: 'secp256k1',
      });

      const { publicKey, ...json } = baseNode.toJSON();

      const spy = vi.spyOn(secp256k1, 'getPublicKey');

      const node = await SLIP10Node.fromExtendedKey(json);
      expect(spy).not.toHaveBeenCalled();

      expect(node.publicKeyBytes).toStrictEqual(baseNode.publicKeyBytes);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('compressedPublicKeyBytes', () => {
    it('returns the public key in compressed form', async () => {
      const node = await SLIP10Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:0'`,
          `bip32:0'`,
        ],
        curve: 'secp256k1',
      });

      expect(node.compressedPublicKeyBytes).toStrictEqual(
        compressPublicKey(node.publicKeyBytes),
      );
    });
  });

  describe('address', () => {
    const { hexSeed, path, sampleAddressIndices } =
      fixtures['ethereumjs-wallet'];

    it.each(sampleAddressIndices)(
      'returns the address for an secp256k1 node',
      async ({ index, address }) => {
        const { privateKey, chainCode } = await createBip39KeyFromSeed(
          hexToBytes(hexSeed),
          secp256k1,
        );

        const node = await SLIP10Node.fromExtendedKey({
          privateKey,
          chainCode,
          curve: 'secp256k1',
          depth: 0,
          parentFingerprint: 0,
          index: 0,
        });

        const childNode = await node.derive([
          ...path.ours.tuple,
          `bip32:${index}`,
        ]);

        expect(childNode.address).toBe(address);
      },
    );

    it('throws an error when trying to get an address for an ed25519 node', async () => {
      const node = await SLIP10Node.fromDerivationPath({
        derivationPath: [defaultBip39NodeToken, `slip10:44'`, `slip10:60'`],
        curve: 'ed25519',
      });

      expect(() => node.address).toThrow(
        'Unable to get address for this node: Only secp256k1 is supported.',
      );
    });
  });

  describe('fingerprint', () => {
    it('returns the fingerprint for a public key', async () => {
      const node = await SLIP10Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:60'`,
        ],
        curve: 'secp256k1',
      });

      expect(node.fingerprint).toBe(3263250961);
    });
  });

  describe('masterFingerprint', () => {
    it('returns the master fingerprint for a node', async () => {
      const masterNode = await SLIP10Node.fromDerivationPath({
        derivationPath: [defaultBip39NodeToken],
        curve: 'secp256k1',
      });

      const node = await masterNode.derive([
        BIP44PurposeNodeToken,
        `bip32:60'`,
      ]);

      expect(node.masterFingerprint).toBe(3293725253);
      expect(node.masterFingerprint).toBe(masterNode.fingerprint);
    });
  });

  describe('extendedKey', () => {
    it.each(fixtures.bip32)(
      'returns the extended private key for an secp256k1 node',
      async ({ hexSeed, keys }) => {
        const { privateKey, chainCode } = await createBip39KeyFromSeed(
          hexStringToBytes(hexSeed),
          secp256k1,
        );

        for (const { path, extPrivKey } of keys) {
          const node = await SLIP10Node.fromExtendedKey({
            privateKey,
            chainCode,
            curve: 'secp256k1',
            depth: 0,
            parentFingerprint: 0,
            index: 0,
          });

          if (path.ours.tuple.length === 0) {
            continue;
          }

          const childNode = await node.derive(path.ours.tuple);
          expect(childNode.extendedKey).toBe(extPrivKey);
        }
      },
    );

    it.each(fixtures.bip32)(
      'returns the extended public key for an secp256k1 node',
      async ({ hexSeed, keys }) => {
        const { privateKey, chainCode } = await createBip39KeyFromSeed(
          hexStringToBytes(hexSeed),
          secp256k1,
        );

        for (const { path, extPubKey } of keys) {
          const node = await SLIP10Node.fromExtendedKey({
            privateKey,
            chainCode,
            curve: 'secp256k1',
            depth: 0,
            parentFingerprint: 0,
            index: 0,
          });

          if (path.ours.tuple.length === 0) {
            continue;
          }

          const childNode = await node.derive(path.ours.tuple);
          const neuteredNode = childNode.neuter();
          expect(neuteredNode.extendedKey).toBe(extPubKey);
        }
      },
    );

    it('returns the extended testnet private key for an secp256k1 node', async () => {
      const node = await SLIP10Node.fromExtendedKey({
        privateKey: new Uint8Array(32).fill(1),
        chainCode: new Uint8Array(32).fill(1),
        curve: 'secp256k1',
        depth: 0,
        parentFingerprint: 0,
        index: 0,
        network: 'testnet',
      });

      expect(node.extendedKey).toBe(
        'tprv8ZgxMBicQKsPctApesa5pSgtbDeXGwawgfkzsWBPXjjgEXF92BQTYA9RXGe2FsQL5zm3ACoXUjzyrEtDev8rFURWNsuntNWBd8G1qtZpCpE',
      );

      const childNode = await node.derive(['bip32:0']);
      expect(childNode.extendedKey).toBe(
        'tprv8cTy44gVjuSkhrHSZReGT641bV6n3h1EopVst2NqPYVwfdFVcCuUGm6GvWB8213fybfNUMQoEtBeyX8au2qLjVu3LNH7JjQ9P97hptzZG3J',
      );
    });

    it('returns the extended testnet public key for an secp256k1 node', async () => {
      const baseNode = await SLIP10Node.fromExtendedKey({
        privateKey: new Uint8Array(32).fill(1),
        chainCode: new Uint8Array(32).fill(1),
        curve: 'secp256k1',
        depth: 0,
        parentFingerprint: 0,
        index: 0,
        network: 'testnet',
      });

      const node = baseNode.neuter();

      expect(node.extendedKey).toBe(
        'tpubD6NzVbkrYhZ4WMCcYXEgDrM1AFATSGmrFyMnA2Dgx1Y551VueaE3iemHhRjLgGo3u6oYvwRT8jBRgoG7ZX7PdcG9MXnqjSHJgzHZk9NYnre',
      );

      const childNode = await node.derive(['bip32:0']);
      expect(childNode.extendedKey).toBe(
        'tpubD9A1CUijtH8RbKKET5JrrVi8AWciD2C9P86fAYR8opJLW7WGEbj4TFi96gCEFwSvwKFAxToWo3tk3hxWFpS5dBj9zc6fG5jZbso5MJnVtK8',
      );
    });

    it('throws when trying to get an extended key for an ed25519 node', async () => {
      const node = await SLIP10Node.fromDerivationPath({
        derivationPath: [defaultBip39NodeToken, `slip10:44'`, `slip10:60'`],
        curve: 'ed25519',
      });

      expect(() => node.extendedKey).toThrow(
        'Unable to get extended key for this node: Only secp256k1 is supported.',
      );
    });
  });

  describe('neuter', () => {
    it('returns a SLIP-10 node without a private key', async () => {
      const node = await SLIP10Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:0'`,
          `bip32:0'`,
        ],
        curve: 'secp256k1',
      });

      const neuterNode = node.neuter();

      expect(neuterNode.publicKey).toBe(node.publicKey);
      expect(neuterNode.privateKey).toBeUndefined();
      expect(neuterNode.privateKeyBytes).toBeUndefined();
    });
  });

  describe('toJSON', () => {
    it('returns a JSON-compatible representation of the node', async () => {
      const node = await SLIP10Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:60'`,
        ],
        curve: 'secp256k1',
      });

      expect(node.depth).toBe(2);

      const nodeJson = node.toJSON();
      expect(nodeJson).toStrictEqual({
        depth: node.depth,
        masterFingerprint: node.masterFingerprint,
        parentFingerprint: node.parentFingerprint,
        index: node.index,
        network: node.network,
        curve: 'secp256k1',
        privateKey: node.privateKey,
        publicKey: node.publicKey,
        chainCode: node.chainCode,
      });

      expect(JSON.parse(JSON.stringify(nodeJson))).toStrictEqual({
        depth: node.depth,
        masterFingerprint: node.masterFingerprint,
        parentFingerprint: node.parentFingerprint,
        index: node.index,
        network: node.network,
        curve: 'secp256k1',
        privateKey: node.privateKey,
        publicKey: node.publicKey,
        chainCode: node.chainCode,
      });
    });
  });
});
