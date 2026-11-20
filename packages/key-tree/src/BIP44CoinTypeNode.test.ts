import { bytesToHex } from '@metamask/byte-utils';
import { describe, expect, it } from 'vitest';

import fixtures from '../tests/fixtures.js';
import { encodeExtendedKey } from './extended-keys.js';
import {
  BIP_44_COIN_TYPE_DEPTH,
  BIP44Node,
  BIP44CoinTypeNode,
  BIP44PurposeNodeToken,
  deriveBIP44AddressKey,
  getBIP44AddressKeyDeriver,
} from './index.js';
import { mnemonicPhraseToBytes } from './utils.js';

const defaultBip39NodeToken = `bip39:${fixtures.local.mnemonic}` as const;
const defaultBip39BytesToken = mnemonicPhraseToBytes(fixtures.local.mnemonic);

describe('BIP44CoinTypeNode', () => {
  describe('fromJSON', () => {
    it('initializes a BIP44CoinTypeNode (serialized BIP44Node)', async () => {
      const bip44Node = await BIP44Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:60'`,
        ],
      });

      const coinType = 60;
      const pathString = `m / bip32:44' / bip32:${coinType}'`;
      const node = await BIP44CoinTypeNode.fromJSON(
        bip44Node.toJSON(),
        coinType,
      );

      expect(node.coin_type).toStrictEqual(coinType);
      expect(node.depth).toBe(2);
      expect(node.privateKey).toStrictEqual(bip44Node.privateKey);
      expect(node.publicKey).toStrictEqual(bip44Node.publicKey);
      expect(node.path).toStrictEqual(pathString);

      expect(node.toJSON()).toStrictEqual({
        coin_type: coinType,
        depth: node.depth,
        masterFingerprint: node.masterFingerprint,
        parentFingerprint: node.parentFingerprint,
        index: node.index,
        network: node.network,
        path: pathString,
        privateKey: node.privateKey,
        publicKey: node.publicKey,
        chainCode: node.chainCode,
      });
    });

    it('throws if node has invalid depth', async () => {
      const arbitraryCoinType = 78;

      await expect(
        BIP44CoinTypeNode.fromJSON(
          { key: 'foo', depth: 1 } as any,
          arbitraryCoinType,
        ),
      ).rejects.toThrow(
        `Invalid depth: Coin type nodes must be of depth ${BIP_44_COIN_TYPE_DEPTH}. Received: "1"`,
      );

      await expect(
        BIP44CoinTypeNode.fromJSON(
          { key: 'foo', depth: 3 } as any,
          arbitraryCoinType,
        ),
      ).rejects.toThrow(
        `Invalid depth: Coin type nodes must be of depth ${BIP_44_COIN_TYPE_DEPTH}. Received: "3"`,
      );
    });

    it('throws if node has invalid key', async () => {
      const arbitraryCoinType = 78;

      const options = {
        depth: 2,
        index: 0,
        parentFingerprint: 1,
      };

      const inputs = [
        {
          privateKey: '0xf00',
          publicKey: new Uint8Array(65).fill(1),
          chainCode: new Uint8Array(32).fill(1),
          ...options,
        },
        {
          privateKey: bytesToHex(new Uint8Array(64).fill(1)),
          publicKey: new Uint8Array(65).fill(1),
          chainCode: new Uint8Array(32).fill(1),
          ...options,
        },
        {
          privateKey: bytesToHex(new Uint8Array(63).fill(1)),
          publicKey: new Uint8Array(65).fill(1),
          chainCode: new Uint8Array(32).fill(1),
          ...options,
        },
        {
          privateKey: bytesToHex(new Uint8Array(64)),
          publicKey: new Uint8Array(65).fill(1),
          chainCode: new Uint8Array(32).fill(1),
          ...options,
        },
      ];

      for (const input of inputs) {
        await expect(
          BIP44CoinTypeNode.fromJSON(input as any, arbitraryCoinType),
        ).rejects.toThrow('Invalid value: Must be a 32-byte byte array.');
      }

      await expect(
        BIP44CoinTypeNode.fromJSON(
          {
            privateKey: 1,
            publicKey: new Uint8Array(65).fill(1),
            chainCode: new Uint8Array(32).fill(1),
            depth: 2,
          } as any,
          arbitraryCoinType,
        ),
      ).rejects.toThrow('Value must be a hexadecimal string.');
    });

    it('throws if coin type is invalid', async () => {
      const node = await BIP44Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:60'`,
        ],
      });
      const jsonNode = node.toJSON();

      const inputs = ['60', 1.1, -1, {}];

      for (const input of inputs) {
        await expect(
          BIP44CoinTypeNode.fromJSON(jsonNode, input as any),
        ).rejects.toThrow(
          'Invalid coin type: The specified coin type must be a non-negative integer number.',
        );
      }
    });
  });

  describe('fromNode', () => {
    it('initializes a BIP44CoinTypeNode (BIP44Node)', async () => {
      const bip44Node = await BIP44Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:60'`,
        ],
      });

      const coinType = 60;
      const pathString = `m / bip32:44' / bip32:${coinType}'`;
      const node = await BIP44CoinTypeNode.fromNode(bip44Node, coinType);

      expect(node.coin_type).toStrictEqual(coinType);
      expect(node.depth).toBe(2);
      expect(node.privateKey).toStrictEqual(bip44Node.privateKey);
      expect(node.publicKey).toStrictEqual(bip44Node.publicKey);
      expect(node.path).toStrictEqual(pathString);

      expect(node.toJSON()).toStrictEqual({
        coin_type: coinType,
        depth: node.depth,
        masterFingerprint: node.masterFingerprint,
        parentFingerprint: node.parentFingerprint,
        index: node.index,
        network: node.network,
        path: pathString,
        privateKey: node.privateKey,
        publicKey: node.publicKey,
        chainCode: node.chainCode,
      });
    });

    it('throws if the node is not a BIP44Node', async () => {
      // @ts-expect-error Invalid node type.
      await expect(BIP44CoinTypeNode.fromNode({}, 0)).rejects.toThrow(
        'Invalid node: Expected an instance of BIP44Node.',
      );
    });
  });

  describe('fromDerivationPath', () => {
    it('initializes a BIP44CoinTypeNode (derivation path)', async () => {
      const node = await BIP44CoinTypeNode.fromDerivationPath([
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:60'`,
      ]);
      const coinType = 60;
      const pathString = `m / bip32:44' / bip32:${coinType}'`;

      expect(node.coin_type).toStrictEqual(coinType);
      expect(node.depth).toBe(2);
      expect(node.privateKeyBytes).toHaveLength(32);
      expect(node.publicKeyBytes).toHaveLength(65);
      expect(node.path).toStrictEqual(pathString);

      expect(node.toJSON()).toStrictEqual({
        coin_type: coinType,
        depth: node.depth,
        masterFingerprint: node.masterFingerprint,
        parentFingerprint: node.parentFingerprint,
        index: node.index,
        network: node.network,
        path: pathString,
        privateKey: node.privateKey,
        publicKey: node.publicKey,
        chainCode: node.chainCode,
      });
    });

    it('initializes a BIP44CoinTypeNode with a Uint8Array', async () => {
      const node = await BIP44CoinTypeNode.fromDerivationPath([
        defaultBip39BytesToken,
        BIP44PurposeNodeToken,
        `bip32:60'`,
      ]);

      const stringNode = await BIP44CoinTypeNode.fromDerivationPath([
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:60'`,
      ]);

      expect(node.toJSON()).toStrictEqual(stringNode.toJSON());
    });

    it('throws if derivation path has invalid depth', async () => {
      await expect(
        BIP44CoinTypeNode.fromDerivationPath([
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
        ] as any),
      ).rejects.toThrow(
        `Invalid depth: Coin type nodes must be of depth ${BIP_44_COIN_TYPE_DEPTH}. Received: "1"`,
      );

      await expect(
        BIP44CoinTypeNode.fromDerivationPath([
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:60'`,
          `bip32:0'`,
        ] as any),
      ).rejects.toThrow(
        `Invalid depth: Coin type nodes must be of depth ${BIP_44_COIN_TYPE_DEPTH}. Received: "3"`,
      );
    });
  });

  describe('fromSeed', () => {
    it('initializes a BIP44CoinTypeNode from a seed', async () => {
      const node = await BIP44CoinTypeNode.fromSeed({
        derivationPath: [
          fixtures.local.seed,
          BIP44PurposeNodeToken,
          `bip32:60'`,
        ],
      });

      const mnemonicNode = await BIP44CoinTypeNode.fromDerivationPath([
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:60'`,
      ]);

      expect(node.toJSON()).toStrictEqual(mnemonicNode.toJSON());
    });

    it('throws if derivation path has invalid depth', async () => {
      await expect(
        BIP44CoinTypeNode.fromSeed({
          // @ts-expect-error: Invalid derivation path.
          derivationPath: [fixtures.local.seed, BIP44PurposeNodeToken],
        }),
      ).rejects.toThrow(
        `Invalid depth: Coin type nodes must be of depth ${BIP_44_COIN_TYPE_DEPTH}. Received: "1"`,
      );

      await expect(
        BIP44CoinTypeNode.fromDerivationPath([
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:60'`,
          `bip32:0'`,
        ] as any),
      ).rejects.toThrow(
        `Invalid depth: Coin type nodes must be of depth ${BIP_44_COIN_TYPE_DEPTH}. Received: "3"`,
      );
    });
  });

  describe('deriveBIP44AddressKey', () => {
    const coinTypePath = [
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:60'`,
    ] as const;

    it('derives an address_index key (default inputs)', async () => {
      const node = await BIP44Node.fromDerivationPath({
        derivationPath: [...coinTypePath, `bip32:0'`, `bip32:0`, `bip32:0`],
      });

      const coinTypeNode = await BIP44CoinTypeNode.fromDerivationPath([
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:60'`,
      ]);

      const childNode = await coinTypeNode.deriveBIP44AddressKey({
        address_index: 0,
      });

      expect(childNode.privateKey).toStrictEqual(node.privateKey);
      expect(childNode.chainCode).toStrictEqual(node.chainCode);
    });

    it('derives an address_index key (default inputs, different address_index)', async () => {
      const node = await BIP44Node.fromDerivationPath({
        derivationPath: [...coinTypePath, `bip32:0'`, `bip32:0`, `bip32:99`],
      });

      const coinTypeNode = await BIP44CoinTypeNode.fromDerivationPath([
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:60'`,
      ]);

      const childNode = await coinTypeNode.deriveBIP44AddressKey({
        address_index: 99,
      });

      expect(childNode.privateKey).toStrictEqual(node.privateKey);
      expect(childNode.chainCode).toStrictEqual(node.chainCode);
    });

    it('derives an address_index key (non-default account value)', async () => {
      const node = await BIP44Node.fromDerivationPath({
        derivationPath: [...coinTypePath, `bip32:4'`, `bip32:0`, `bip32:0`],
      });

      const coinTypeNode = await BIP44CoinTypeNode.fromDerivationPath([
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:60'`,
      ]);

      const childNode = await coinTypeNode.deriveBIP44AddressKey({
        account: 4,
        address_index: 0,
      });

      expect(childNode.privateKey).toStrictEqual(node.privateKey);
      expect(childNode.chainCode).toStrictEqual(node.chainCode);
    });

    it('derives an address_index key (non-default change value)', async () => {
      const node = await BIP44Node.fromDerivationPath({
        derivationPath: [...coinTypePath, `bip32:0'`, `bip32:3`, `bip32:0`],
      });

      const coinTypeNode = await BIP44CoinTypeNode.fromDerivationPath([
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:60'`,
      ]);

      const childNode = await coinTypeNode.deriveBIP44AddressKey({
        change: 3,
        address_index: 0,
      });

      expect(childNode.privateKey).toStrictEqual(node.privateKey);
      expect(childNode.chainCode).toStrictEqual(node.chainCode);
    });

    it('derives an address_index key (non-default account and change values)', async () => {
      const node = await BIP44Node.fromDerivationPath({
        derivationPath: [...coinTypePath, `bip32:4'`, `bip32:3`, `bip32:0`],
      });

      const coinTypeNode = await BIP44CoinTypeNode.fromDerivationPath([
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:60'`,
      ]);

      const childNode = await coinTypeNode.deriveBIP44AddressKey({
        account: 4,
        change: 3,
        address_index: 0,
      });

      expect(childNode.privateKey).toStrictEqual(node.privateKey);
      expect(childNode.chainCode).toStrictEqual(node.chainCode);
    });
  });

  describe('publicKey', () => {
    it('returns the public key for a node', async () => {
      const coinType = 60;
      const node = await BIP44Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:${coinType}'`,
        ],
      });

      const parentNode = await BIP44CoinTypeNode.fromNode(node, coinType);

      expect(parentNode.publicKey).toBe(node.publicKey);
    });
  });

  describe('compressedPublicKey', () => {
    it('returns the compressed public key for a node', async () => {
      const coinType = 60;
      const node = await BIP44Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:${coinType}'`,
        ],
      });

      const parentNode = await BIP44CoinTypeNode.fromNode(node, coinType);

      expect(parentNode.compressedPublicKey).toStrictEqual(
        node.compressedPublicKey,
      );
    });
  });

  describe('compressedPublicKeyBytes', () => {
    it('returns the compressed public key for a node', async () => {
      const coinType = 60;
      const node = await BIP44Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:${coinType}'`,
        ],
      });

      const parentNode = await BIP44CoinTypeNode.fromNode(node, coinType);

      expect(parentNode.compressedPublicKeyBytes).toStrictEqual(
        node.compressedPublicKeyBytes,
      );
    });
  });

  describe('address', () => {
    it('returns an Ethereum address for a node', async () => {
      const coinType = 60;
      const node = await BIP44Node.fromDerivationPath({
        derivationPath: [
          defaultBip39NodeToken,
          BIP44PurposeNodeToken,
          `bip32:${coinType}'`,
        ],
      });

      const parentNode = await BIP44CoinTypeNode.fromNode(node, coinType);

      expect(parentNode.address).toBe(node.address);
    });
  });

  describe('extendedKey', () => {
    it('returns the extended private key for nodes with a private key (mainnet)', async () => {
      const coinType = 60;
      const node = await BIP44CoinTypeNode.fromDerivationPath([
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
      ]);

      const extendedKey = encodeExtendedKey({
        type: 'private',
        privateKey: node.privateKeyBytes as Uint8Array<ArrayBuffer>,
        chainCode: node.chainCodeBytes,
        depth: node.depth,
        parentFingerprint: node.parentFingerprint,
        index: node.index,
        network: 'mainnet',
      });

      expect(node.extendedKey).toStrictEqual(extendedKey);
    });

    it('returns the extended private key for nodes with a private key (testnet)', async () => {
      const coinType = 60;
      const node = await BIP44CoinTypeNode.fromDerivationPath(
        [defaultBip39NodeToken, BIP44PurposeNodeToken, `bip32:${coinType}'`],
        'testnet',
      );

      const extendedKey = encodeExtendedKey({
        type: 'private',
        privateKey: node.privateKeyBytes as Uint8Array<ArrayBuffer>,
        chainCode: node.chainCodeBytes,
        depth: node.depth,
        parentFingerprint: node.parentFingerprint,
        index: node.index,
        network: 'testnet',
      });

      expect(node.extendedKey).toStrictEqual(extendedKey);
    });
  });

  describe('toJSON', () => {
    it('returns a JSON-compatible representation of the node', async () => {
      const coinType = 60;
      const node = await BIP44CoinTypeNode.fromDerivationPath([
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
      ]);
      const pathString = `m / bip32:44' / bip32:${coinType}'`;

      expect(node.coin_type).toStrictEqual(coinType);
      expect(node.depth).toBe(2);
      expect(node.path).toStrictEqual(pathString);

      const nodeJson = node.toJSON();
      expect(nodeJson).toStrictEqual({
        coin_type: coinType,
        depth: node.depth,
        masterFingerprint: node.masterFingerprint,
        parentFingerprint: node.parentFingerprint,
        index: node.index,
        network: node.network,
        path: pathString,
        privateKey: node.privateKey,
        publicKey: node.publicKey,
        chainCode: node.chainCode,
      });

      expect(JSON.parse(JSON.stringify(nodeJson))).toStrictEqual({
        coin_type: coinType,
        depth: node.depth,
        masterFingerprint: node.masterFingerprint,
        parentFingerprint: node.parentFingerprint,
        index: node.index,
        network: node.network,
        path: pathString,
        privateKey: node.privateKey,
        publicKey: node.publicKey,
        chainCode: node.chainCode,
      });
    });
  });
});

describe('deriveBIP44AddressKey', () => {
  it('derives a BIP-44 address key (default inputs)', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);

    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:0'`,
        `bip32:0`,
        `bip32:0`,
      ],
    });

    const childNode = await deriveBIP44AddressKey(parentNode, {
      address_index: 0,
    });

    expect(childNode.privateKey).toStrictEqual(node.privateKey);
    expect(childNode.chainCode).toStrictEqual(node.chainCode);
  });

  it('derives an address_index key (default inputs, different address_index)', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);

    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:0'`,
        `bip32:0`,
        `bip32:3333`,
      ],
    });

    const childNode = await deriveBIP44AddressKey(parentNode, {
      address_index: 3333,
    });

    expect(childNode.privateKey).toStrictEqual(node.privateKey);
    expect(childNode.chainCode).toStrictEqual(node.chainCode);
  });

  it('derives an address_index key (default inputs, object address_index)', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);

    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:0'`,
        `bip32:0`,
        `bip32:3333`,
      ],
    });

    const childNode = await deriveBIP44AddressKey(parentNode, {
      address_index: {
        index: 3333,
        hardened: false,
      },
    });

    expect(childNode.privateKey).toStrictEqual(node.privateKey);
    expect(childNode.chainCode).toStrictEqual(node.chainCode);
  });

  it('derives an address_index key (default inputs, hardened address_index)', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);

    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:0'`,
        `bip32:0`,
        `bip32:3333'`,
      ],
    });

    const childNode = await deriveBIP44AddressKey(parentNode, {
      address_index: {
        index: 3333,
        hardened: true,
      },
    });

    expect(childNode.privateKey).toStrictEqual(node.privateKey);
    expect(childNode.chainCode).toStrictEqual(node.chainCode);
  });

  it('derives a BIP-44 address key (non-default account value)', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);

    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:3'`,
        `bip32:0`,
        `bip32:0`,
      ],
    });

    const childNode = await deriveBIP44AddressKey(parentNode, {
      account: 3,
      address_index: 0,
    });

    expect(childNode.privateKey).toStrictEqual(node.privateKey);
    expect(childNode.chainCode).toStrictEqual(node.chainCode);
  });

  it('derives a BIP-44 address key (non-default change value)', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);

    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:0'`,
        `bip32:9`,
        `bip32:0`,
      ],
    });

    const childNode = await deriveBIP44AddressKey(parentNode, {
      change: 9,
      address_index: 0,
    });

    expect(childNode.privateKey).toStrictEqual(node.privateKey);
    expect(childNode.chainCode).toStrictEqual(node.chainCode);
  });

  it('derives a BIP-44 address key (non-default account and change values)', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);

    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:3'`,
        `bip32:9`,
        `bip32:0`,
      ],
    });

    const childNode = await deriveBIP44AddressKey(parentNode, {
      account: 3,
      change: 9,
      address_index: 0,
    });

    expect(childNode.privateKey).toStrictEqual(node.privateKey);
    expect(childNode.chainCode).toStrictEqual(node.chainCode);
  });

  it('derives a BIP-44 address key (JSON node)', async () => {
    const coinType = 60;
    const node = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);
    const parentNode = node.toJSON();

    const expectedNode = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:0'`,
        `bip32:0`,
        `bip32:0`,
      ],
    });

    const childNode = await deriveBIP44AddressKey(parentNode, {
      address_index: 0,
    });

    expect(childNode.privateKey).toStrictEqual(expectedNode.privateKey);
    expect(childNode.chainCode).toStrictEqual(expectedNode.chainCode);
  });

  it('derives a BIP-44 address key (extended key)', async () => {
    const coinType = 60;
    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
      ],
    });

    const expectedNode = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:0'`,
        `bip32:0`,
        `bip32:0`,
      ],
    });

    const childNode = await deriveBIP44AddressKey(node.extendedKey, {
      address_index: 0,
    });

    expect(childNode.privateKey).toStrictEqual(expectedNode.privateKey);
    expect(childNode.chainCode).toStrictEqual(expectedNode.chainCode);
  });

  it('throws if a node value is invalid', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);

    const inputs = [
      { account: -1 },
      { change: 1.1 },
      { account: NaN },
      { account: null },
      { account: {} },
    ];

    for (const input of inputs) {
      await expect(
        deriveBIP44AddressKey(parentNode, input as any),
      ).rejects.toThrow(
        `Invalid BIP-32 index: Must be a non-negative integer.`,
      );
    }
  });

  it('throws if the change or address_index value is invalid', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);

    const inputs = [
      {},
      { change: {} },
      { change: null },
      { change: undefined },
      { address_index: {} },
      { address_index: 'foo' },
      { address_index: { index: 1 } },
      { address_index: { index: 1.1, hardened: true } },
      { address_index: { hardened: true } },
      { address_index: { index: 1, hardened: 'foo' } },
    ];

    for (const input of inputs) {
      await expect(
        deriveBIP44AddressKey(parentNode, input as any),
      ).rejects.toThrow(
        `Invalid BIP-32 index: Must be an object containing the index and whether it is hardened.`,
      );
    }
  });
});

describe('getBIP44AddressKeyDeriver', () => {
  it('returns the expected BIP-44 address key deriver function (default inputs)', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);
    const expectedPath = `m / bip32:44' / bip32:${coinType}' / bip32:0' / bip32:0`;

    const deriver = await getBIP44AddressKeyDeriver(parentNode);
    expect(deriver.coin_type).toStrictEqual(coinType);
    expect(deriver.path).toStrictEqual(expectedPath);

    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:0'`,
        `bip32:0`,
        `bip32:0`,
      ],
    });

    const childNode = await deriver(0);

    expect(childNode.privateKey).toStrictEqual(node.privateKey);
    expect(childNode.chainCode).toStrictEqual(node.chainCode);
  });

  it('returns the expected BIP-44 address key deriver function and derives a hardened index (default inputs)', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);
    const expectedPath = `m / bip32:44' / bip32:${coinType}' / bip32:0' / bip32:0`;

    const deriver = await getBIP44AddressKeyDeriver(parentNode);
    expect(deriver.coin_type).toStrictEqual(coinType);
    expect(deriver.path).toStrictEqual(expectedPath);

    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:0'`,
        `bip32:0`,
        `bip32:0'`,
      ],
    });

    const childNode = await deriver(0, true);

    expect(childNode.privateKey).toStrictEqual(node.privateKey);
    expect(childNode.chainCode).toStrictEqual(node.chainCode);
  });

  it('returns the expected BIP-44 address key deriver function and derives a hardened index (default inputs, different address_index)', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);
    const expectedPath = `m / bip32:44' / bip32:${coinType}' / bip32:0' / bip32:0`;

    const deriver = await getBIP44AddressKeyDeriver(parentNode);
    expect(deriver.coin_type).toStrictEqual(coinType);
    expect(deriver.path).toStrictEqual(expectedPath);

    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:0'`,
        `bip32:0`,
        `bip32:9873'`,
      ],
    });

    const childNode = await deriver(9873, true);

    expect(childNode.privateKey).toStrictEqual(node.privateKey);
    expect(childNode.chainCode).toStrictEqual(node.chainCode);
  });

  it('returns the expected BIP-44 address key deriver function (different coin_type)', async () => {
    const coinType = 8129837;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);
    const expectedPath = `m / bip32:44' / bip32:${coinType}' / bip32:0' / bip32:0`;

    const deriver = await getBIP44AddressKeyDeriver(parentNode);
    expect(deriver.coin_type).toStrictEqual(coinType);
    expect(deriver.path).toStrictEqual(expectedPath);

    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:0'`,
        `bip32:0`,
        `bip32:0`,
      ],
    });

    const childNode = await deriver(0);

    expect(childNode.privateKey).toStrictEqual(node.privateKey);
    expect(childNode.chainCode).toStrictEqual(node.chainCode);
  });

  it('returns the expected BIP-44 address key deriver function (default inputs, different address_index)', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);
    const expectedPath = `m / bip32:44' / bip32:${coinType}' / bip32:0' / bip32:0`;

    const deriver = await getBIP44AddressKeyDeriver(parentNode);
    expect(deriver.coin_type).toStrictEqual(coinType);
    expect(deriver.path).toStrictEqual(expectedPath);

    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:0'`,
        `bip32:0`,
        `bip32:9873`,
      ],
    });

    const childNode = await deriver(9873);

    expect(childNode.privateKey).toStrictEqual(node.privateKey);
    expect(childNode.chainCode).toStrictEqual(node.chainCode);
  });

  it('returns the expected BIP-44 address key deriver function (non-default account value)', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);
    const expectedPath = `m / bip32:44' / bip32:${coinType}' / bip32:46' / bip32:0`;

    const deriver = await getBIP44AddressKeyDeriver(parentNode, {
      account: 46,
    });
    expect(deriver.coin_type).toStrictEqual(coinType);
    expect(deriver.path).toStrictEqual(expectedPath);

    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:46'`,
        `bip32:0`,
        `bip32:0`,
      ],
    });

    const childNode = await deriver(0);

    expect(childNode.privateKey).toStrictEqual(node.privateKey);
    expect(childNode.chainCode).toStrictEqual(node.chainCode);
  });

  it('returns the expected BIP-44 address key deriver function (non-default change value)', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);
    const expectedPath = `m / bip32:44' / bip32:${coinType}' / bip32:0' / bip32:2`;

    const deriver = await getBIP44AddressKeyDeriver(parentNode, { change: 2 });
    expect(deriver.coin_type).toStrictEqual(coinType);
    expect(deriver.path).toStrictEqual(expectedPath);

    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:0'`,
        `bip32:2`,
        `bip32:0`,
      ],
    });

    const childNode = await deriver(0);

    expect(childNode.privateKey).toStrictEqual(node.privateKey);
    expect(childNode.chainCode).toStrictEqual(node.chainCode);
  });

  it('returns the expected BIP-44 address key deriver function (object change value)', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);
    const expectedPath = `m / bip32:44' / bip32:${coinType}' / bip32:0' / bip32:2`;

    const deriver = await getBIP44AddressKeyDeriver(parentNode, {
      change: {
        index: 2,
        hardened: false,
      },
    });
    expect(deriver.coin_type).toStrictEqual(coinType);
    expect(deriver.path).toStrictEqual(expectedPath);

    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:0'`,
        `bip32:2`,
        `bip32:0`,
      ],
    });

    const childNode = await deriver(0);

    expect(childNode.privateKey).toStrictEqual(node.privateKey);
    expect(childNode.chainCode).toStrictEqual(node.chainCode);
  });

  it('returns the expected BIP-44 address key deriver function (hardened change value)', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);
    const expectedPath = `m / bip32:44' / bip32:${coinType}' / bip32:0' / bip32:2'`;

    const deriver = await getBIP44AddressKeyDeriver(parentNode, {
      change: {
        index: 2,
        hardened: true,
      },
    });
    expect(deriver.coin_type).toStrictEqual(coinType);
    expect(deriver.path).toStrictEqual(expectedPath);

    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:0'`,
        `bip32:2'`,
        `bip32:0`,
      ],
    });

    const childNode = await deriver(0);

    expect(childNode.privateKey).toStrictEqual(node.privateKey);
    expect(childNode.chainCode).toStrictEqual(node.chainCode);
  });

  it('returns the expected BIP-44 address key deriver function (non-default account and change values)', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);
    const expectedPath = `m / bip32:44' / bip32:${coinType}' / bip32:46' / bip32:2`;

    const deriver = await getBIP44AddressKeyDeriver(parentNode, {
      account: 46,
      change: 2,
    });
    expect(deriver.coin_type).toStrictEqual(coinType);
    expect(deriver.path).toStrictEqual(expectedPath);

    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:46'`,
        `bip32:2`,
        `bip32:0`,
      ],
    });

    const childNode = await deriver(0);

    expect(childNode.privateKey).toStrictEqual(node.privateKey);
    expect(childNode.chainCode).toStrictEqual(node.chainCode);
  });

  it('returns the expected BIP-44 address key deriver function (JSON node)', async () => {
    const coinType = 60;
    const node = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);
    const parentNode = node.toJSON();
    const expectedPath = `m / bip32:44' / bip32:${coinType}' / bip32:0' / bip32:0`;

    const deriver = await getBIP44AddressKeyDeriver(parentNode);
    expect(deriver.coin_type).toStrictEqual(coinType);
    expect(deriver.path).toStrictEqual(expectedPath);

    const expectedNode = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:0'`,
        `bip32:0`,
        `bip32:0`,
      ],
    });

    const childNode = await deriver(0);

    expect(childNode.privateKey).toStrictEqual(expectedNode.privateKey);
    expect(childNode.chainCode).toStrictEqual(expectedNode.chainCode);
  });

  it('returns the expected BIP-44 address key deriver function (extended key)', async () => {
    const coinType = 60;
    const node = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
      ],
    });

    const expectedPath = `m / bip32:44' / bip32:${coinType}' / bip32:0' / bip32:0`;

    const deriver = await getBIP44AddressKeyDeriver(node.extendedKey);
    expect(deriver.coin_type).toStrictEqual(coinType);
    expect(deriver.path).toStrictEqual(expectedPath);

    const expectedNode = await BIP44Node.fromDerivationPath({
      derivationPath: [
        defaultBip39NodeToken,
        BIP44PurposeNodeToken,
        `bip32:${coinType}'`,
        `bip32:0'`,
        `bip32:0`,
        `bip32:0`,
      ],
    });

    const childNode = await deriver(0);

    expect(childNode.privateKey).toStrictEqual(expectedNode.privateKey);
    expect(childNode.chainCode).toStrictEqual(expectedNode.chainCode);
  });

  it('throws if a node value is invalid', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);

    const inputs = [
      { account: -1 },
      { change: 1.1 },
      { account: NaN },
      { account: null },
      { account: {} },
    ];

    for (const invalidInput of inputs) {
      await expect(
        getBIP44AddressKeyDeriver(parentNode, invalidInput as any),
      ).rejects.toThrow(
        `Invalid BIP-32 index: Must be a non-negative integer.`,
      );
    }
  });

  it('deriver throws if address_index value is invalid', async () => {
    const coinType = 60;
    const parentNode = await BIP44CoinTypeNode.fromDerivationPath([
      defaultBip39NodeToken,
      BIP44PurposeNodeToken,
      `bip32:${coinType}'`,
    ]);

    const expectedPath = `m / bip32:44' / bip32:${coinType}' / bip32:0' / bip32:0`;

    const deriver = await getBIP44AddressKeyDeriver(parentNode);
    expect(deriver.coin_type).toStrictEqual(coinType);
    expect(deriver.path).toStrictEqual(expectedPath);

    const inputs = [
      {},
      { address_index: -1 },
      { address_index: 1.1 },
      { address_index: NaN },
      { address_index: null },
      { address_index: {} },
    ];

    for (const input of inputs) {
      await expect(deriver(input as any)).rejects.toThrow(
        `Invalid BIP-32 index: Must be a non-negative integer.`,
      );
    }
  });
});
