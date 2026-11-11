import { bytesToHex, hexToBytes } from '@metamask/byte-utils';
import { describe, expect, it } from 'vitest';

import fixtures from '../../tests/fixtures.js';
import { BIP_32_HARDENED_OFFSET } from '../constants.js';
import { ed25519, ed25519Bip32 } from '../curves/index.js';
import { SLIP10Node } from '../SLIP10Node.js';
import type { Cip3SupportedCurve } from './cip3.js';
import {
  add,
  bigIntToBytes,
  bytesToBigInt,
  deriveChainCode,
  deriveChildKey,
  derivePrivateKey,
  derivePublicKey,
  mod2Pow256,
  padEnd32Bytes,
  toReversed,
  trunc28Mul8,
} from './cip3.js';

const fixtureNodeToParentNode = (
  fixtureNode: (typeof fixtures.cip3)[number]['nodes'][keyof (typeof fixtures.cip3)[number]['nodes']],
): {
  privateKeyBytes: Uint8Array<ArrayBuffer>;
  publicKeyBytes: Uint8Array<ArrayBuffer>;
  chainCodeBytes: Uint8Array<ArrayBuffer>;
} => ({
  privateKeyBytes: hexToBytes(fixtureNode.privateKey),
  publicKeyBytes: hexToBytes(fixtureNode.publicKey),
  chainCodeBytes: hexToBytes(fixtureNode.chainCode),
});

describe('Cip3', () => {
  fixtures.cip3.forEach((fixture) => {
    describe('derivePrivate', () => {
      const { bip39Node, purposeNode, coinTypeNode, accountNode, changeNode } =
        fixture.nodes;

      it('derives hardened private key 1', async () => {
        const privateKey = await derivePrivateKey({
          parentNode: fixtureNodeToParentNode(bip39Node),
          isHardened: true,
          childIndex: purposeNode.index - BIP_32_HARDENED_OFFSET,
        });
        expect(bytesToHex(privateKey)).toBe(purposeNode.privateKey);
      });

      it('derives hardened private key', async () => {
        const privateKey = await derivePrivateKey({
          parentNode: fixtureNodeToParentNode(purposeNode),
          isHardened: true,
          childIndex: coinTypeNode.index - BIP_32_HARDENED_OFFSET,
        });
        expect(bytesToHex(privateKey)).toBe(coinTypeNode.privateKey);
      });

      it('derives non-hardened private key', async () => {
        const privateKey = await derivePrivateKey({
          parentNode: fixtureNodeToParentNode(accountNode),
          isHardened: false,
          childIndex: changeNode.index,
        });
        expect(bytesToHex(privateKey)).toBe(changeNode.privateKey);
      });
    });

    describe('deriveChainCode', () => {
      const { bip39Node, purposeNode, accountNode, changeNode } = fixture.nodes;

      it('derives hardened chainCode key', async () => {
        const chainCode = await deriveChainCode({
          parentNode: fixtureNodeToParentNode(bip39Node),
          isHardened: true,
          childIndex: purposeNode.index - BIP_32_HARDENED_OFFSET,
        });
        expect(bytesToHex(chainCode)).toBe(purposeNode.chainCode);
      });

      it('derives non-hardened private key', async () => {
        const chainCode = await deriveChainCode({
          parentNode: fixtureNodeToParentNode(accountNode),
          isHardened: false,
          childIndex: changeNode.index,
        });
        expect(bytesToHex(chainCode)).toBe(changeNode.chainCode);
      });
    });

    describe('derivePublicKey', () => {
      const { changeNode, addressIndexNode } = fixture.nodes;

      it('derives public key', async () => {
        const chainCode = await derivePublicKey({
          parentNode: fixtureNodeToParentNode(changeNode),
          childIndex: addressIndexNode.index,
          isHardened: false,
          curve: ed25519Bip32,
        });
        expect(bytesToHex(chainCode)).toBe(addressIndexNode.publicKey);
      });
    });

    describe('deriveChildKey', () => {
      const [purpose, coinType, accountIndex, change, addressIndex] =
        fixture.derivationPath;
      const {
        bip39Node,
        purposeNode,
        coinTypeNode,
        accountNode,
        changeNode,
        addressIndexNode,
      } = fixture.nodes;

      it('derives purpose node', async () => {
        const purposeNodeRes = await deriveChildKey({
          node: await SLIP10Node.fromJSON(bip39Node),
          path: purpose,
          curve: ed25519Bip32,
        });

        expect(JSON.stringify(purposeNodeRes)).toBe(
          JSON.stringify(purposeNode),
        );
      });

      it('derives coinType node', async () => {
        const coinTypeNodeRes = await deriveChildKey({
          node: await SLIP10Node.fromJSON(purposeNode),
          path: coinType,
          curve: ed25519Bip32,
        });

        expect(JSON.stringify(coinTypeNodeRes)).toBe(
          JSON.stringify(coinTypeNode),
        );
      });

      it('derives account node', async () => {
        const accountNodeRes = await deriveChildKey({
          node: await SLIP10Node.fromJSON(coinTypeNode),
          path: accountIndex,
          curve: ed25519Bip32,
        });

        expect(JSON.stringify(accountNodeRes)).toBe(
          JSON.stringify(accountNode),
        );
      });

      it('derives change node', async () => {
        const changeNodeRes = await deriveChildKey({
          node: await SLIP10Node.fromJSON(accountNode),
          path: change,
          curve: ed25519Bip32,
        });

        expect(JSON.stringify(changeNodeRes)).toBe(JSON.stringify(changeNode));
      });

      it('derives addressIndex node', async () => {
        const addressIndexNodeRes = await deriveChildKey({
          node: await SLIP10Node.fromJSON(changeNode),
          path: addressIndex,
          curve: ed25519Bip32,
        });

        expect(JSON.stringify(addressIndexNodeRes)).toBe(
          JSON.stringify(addressIndexNode),
        );
      });

      it('throws with unsupported curve error', async () => {
        await expect(
          deriveChildKey({
            node: await SLIP10Node.fromJSON(bip39Node),
            path: purpose,
            curve: ed25519 as unknown as Cip3SupportedCurve,
          }),
        ).rejects.toThrow(
          `Unsupported curve: Only ed25519Bip32 is supported by CIP3.`,
        );
      });
    });
  });

  describe('toReversed', () => {
    it('reverts bytes', () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      expect(toReversed(bytes)).toStrictEqual(new Uint8Array([5, 4, 3, 2, 1]));
    });
  });

  describe('bytesToBigInt', () => {
    it('converts bytes to bigint', () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      expect(bytesToBigInt(bytes)).toStrictEqual(BigInt('0x0504030201'));
    });
  });

  describe('bigIntToBytes', () => {
    it('converts bigint to bytes', () => {
      const bigInt = BigInt('0x0504030201');
      expect(bigIntToBytes(bigInt)).toStrictEqual(
        new Uint8Array([1, 2, 3, 4, 5]),
      );
    });
  });

  describe('padEnd32Bytes', () => {
    it('pads end of byte array to 32 bytes', () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      const padding = new Array(27).fill(0);
      const padded = new Uint8Array([1, 2, 3, 4, 5, ...padding]);
      expect(padEnd32Bytes(bytes)).toStrictEqual(padded);
    });
  });

  describe('trunc28Mul8', () => {
    it('truncates bytes to length 28 and multiply byt 8', () => {
      const bytes = hexToBytes(
        '0xade6ef960e9fc741bc1808bd91ed7c3944c760de5947662adc428029c722deab',
      );
      const expectedResult = hexToBytes(
        '0x68357fb774f83c0ee2c540e88d6ce7cb213a06f3ce3a3253e116024c01000000',
      );
      const result = trunc28Mul8(bytes);
      expect(result).toStrictEqual(expectedResult);
    });
  });

  describe('mod2Pow256', () => {
    it('modulo 2^256', () => {
      const bytes = hexToBytes(
        '0xd664152bff95f76efdd0052643eb096eea6f18b6793365563bcaa12b3aa04fed',
      );
      const expectedResult = hexToBytes(
        '0xd664152bff95f76efdd0052643eb096eea6f18b6793365563bcaa12b3aa04fed',
      );
      const result = mod2Pow256(bytes);
      expect(result).toStrictEqual(expectedResult);
    });
  });

  describe('add', () => {
    it('adds two arrays of bytes', () => {
      const left = hexToBytes(
        '0xa09de4b08a21d9223bd3b8196e3c92b809898755d6d0246d662063b203000000',
      );
      const right = hexToBytes(
        '0x5049005d5a97d5ea60753fb511460079a56b9981bc2e75f05e40dd46788c7748',
      );
      const expectedResult = hexToBytes(
        '0xf0e6e40de5b8ae0d9c48f8ce7f829231aff420d792ff995dc56040f97b8c7748',
      );
      const result = add(left, right);
      expect(result).toStrictEqual(expectedResult);
    });
  });
});
