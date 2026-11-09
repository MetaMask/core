import { bytesToHex } from '@metamask/byte-utils';
// eslint-disable-next-line import-x/no-nodejs-modules
import { randomInt, randomBytes } from 'crypto';

import type { Curve } from '../src/curves/index.js';
import { deriveChildKey } from '../src/derivers/bip39.js';
import type { BIP32Node, SLIP10Node } from '../src/index.js';
import {
  BIP_32_HARDENED_OFFSET,
  ed25519,
  MAX_BIP_32_INDEX,
  secp256k1,
  ed25519Bip32,
} from '../src/index.js';

/**
 * Get a random boolean value.
 *
 * @returns A random boolean value.
 */
function getRandomBoolean(): boolean {
  return randomInt(2) === 0;
}

/**
 * Get a random BIP-32 index.
 *
 * @param hardened - Whether the index should be hardened. Defaults to a random
 * boolean value.
 * @returns A random BIP-32 index.
 */
function getRandomIndex(hardened: boolean = getRandomBoolean()): number {
  if (hardened) {
    return randomInt(BIP_32_HARDENED_OFFSET, MAX_BIP_32_INDEX);
  }

  return randomInt(0, BIP_32_HARDENED_OFFSET);
}

/**
 * Get a random seed.
 *
 * @param length - The length of the seed. Defaults to a random integer between
 * 16 and 64 bytes.
 * @returns A random seed.
 */
// eslint-disable-next-line no-restricted-globals
function getRandomSeed(length = randomInt(16, 64)): Buffer {
  return randomBytes(length);
}

/**
 * Get a random BIP-32 path, with the given length.
 *
 * @param spec - The path specification.
 * @param length - The length of the path. Defaults to a random integer between
 * 1 and 20.
 * @param hardened - Whether the path should be hardened. Defaults to a random
 * boolean value.
 * @returns A random BIP-32 path.
 */
function getRandomPath(
  spec: 'bip32' | 'slip10' | 'cip3',
  length = randomInt(1, 20),
  hardened?: boolean,
): BIP32Node[] {
  return new Array(length).fill(0).map(() => {
    const index = getRandomIndex(hardened);
    const formattedIndex =
      index >= BIP_32_HARDENED_OFFSET
        ? `${index - BIP_32_HARDENED_OFFSET}'`
        : index;

    return `${spec}:${formattedIndex}` as BIP32Node;
  });
}

/**
 * Get a random key vector.
 *
 * @param node - The node to derive the keys from.
 * @param spec - The path specification.
 * @param hardened - Whether the keys should be hardened. Defaults to a random
 * boolean value.
 * @returns A random key vector.
 */
async function getRandomKeyVector(
  node: SLIP10Node,
  spec: 'bip32' | 'slip10' | 'cip3',
  hardened?: boolean,
): Promise<TestKeyVector> {
  const path = getRandomPath(spec, undefined, hardened);
  const child = await node.derive(path);

  return {
    path: {
      tuple: path,
      string: path.join(' / '),
    },
    privateKey: child.privateKey,
    publicKey: child.compressedPublicKey,
    chainCode: child.chainCode,
    parentFingerprint: child.parentFingerprint,
    masterFingerprint: child.masterFingerprint,
    index: child.index,
    depth: child.depth,
  };
}
type TestKeyVector = {
  path: {
    tuple: BIP32Node[];
    string: string;
  };
  privateKey?: string | undefined;
  publicKey: string;
  chainCode: string;
  parentFingerprint: number;
  masterFingerprint?: number | undefined;
  index: number;
  depth: number;
};

type TestVector = Omit<TestKeyVector, 'path'> & {
  hexSeed: string;
  keys: TestKeyVector[];
};

/**
 * Generate a random vector.
 *
 * @param spec - The path specification.
 * @param amount - The amount of vectors to generate for the seed. Defaults to
 * 10.
 * @param hardened - Whether the keys should be hardened. Defaults to a random
 * boolean value.
 * @param curve - The curve to use. Defaults to secp256k1.
 * @returns A random test vector.
 */
async function getRandomVector(
  spec: 'bip32' | 'slip10' | 'cip3',
  amount = 10,
  hardened?: boolean,
  curve: Curve = secp256k1,
): Promise<TestVector> {
  const seed = getRandomSeed();
  const node = await deriveChildKey({ path: seed, curve });

  return {
    hexSeed: bytesToHex(seed),
    privateKey: node.privateKey,
    publicKey: node.compressedPublicKey,
    chainCode: node.chainCode,
    parentFingerprint: node.parentFingerprint,
    masterFingerprint: node.masterFingerprint,
    index: node.index,
    depth: node.depth,
    keys: await Promise.all(
      new Array(amount)
        .fill(0)
        .map(async () => getRandomKeyVector(node, spec, hardened)),
    ),
  };
}

/**
 * Generate random vectors.
 *
 * @param spec - The path specification.
 * @param amount - The amount of vectors to generate for the seed. Defaults to
 * 10.
 * @param hardened - Whether the keys should be hardened. Defaults to a random
 * boolean value.
 * @param curve - The curve to use. Defaults to secp256k1.
 * @returns The random vectors.
 */
async function getRandomVectors(
  spec: 'bip32' | 'slip10' | 'cip3',
  amount = 10,
  hardened?: boolean,
  curve: Curve = secp256k1,
): Promise<TestVector[]> {
  return Promise.all(
    new Array(amount)
      .fill(0)
      .map(async () => getRandomVector(spec, undefined, hardened, curve)),
  );
}

type TestVectorOutput = {
  hardened: TestVector[];
  unhardened: TestVector[];
  mixed: TestVector[];
};

/**
 * Get the output for the vectors.
 *
 * @returns The output for the vectors.
 */
async function getOutput(): Promise<{
  bip32: TestVectorOutput;
  slip10: Omit<TestVectorOutput, 'hardened'> & {
    hardened: {
      secp256k1: TestVector[];
      ed25519: TestVector[];
    };
  };
  cip3: TestVectorOutput;
}> {
  return {
    bip32: {
      hardened: await getRandomVectors('bip32', 50, true),
      unhardened: await getRandomVectors('bip32', 50, false),
      mixed: await getRandomVectors('bip32', 50),
    },
    slip10: {
      hardened: {
        secp256k1: await getRandomVectors('slip10', 50, true),
        ed25519: await getRandomVectors('slip10', 50, true, ed25519),
      },
      unhardened: await getRandomVectors('slip10', 50, false),
      mixed: await getRandomVectors('bip32', 50),
    },
    cip3: {
      hardened: await getRandomVectors('cip3', 50, true, ed25519Bip32),
      unhardened: await getRandomVectors('cip3', 50, false, ed25519Bip32),
      mixed: await getRandomVectors('cip3', 50, undefined, ed25519Bip32),
    },
  };
}

getOutput()
  // eslint-disable-next-line promise/always-return
  .then((output) => {
    console.log(JSON.stringify(output, undefined, 2));
  })
  .catch(console.error);
