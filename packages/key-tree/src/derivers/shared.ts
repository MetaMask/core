import { hexToBytes } from '@metamask/byte-utils';
import { bytesToBigInt, concatBytes } from '@metamask/byte-utils';
import { hmacSha512 } from '@metamask/cryptography/hmac';
import { assert } from '@metamask/type-utils';

import type { Network } from '../constants.js';
import { BIP_32_HARDENED_OFFSET, UNPREFIXED_PATH_REGEX } from '../constants.js';
import type { Curve } from '../curves/index.js';
import { mod } from '../curves/index.js';
import { PUBLIC_KEY_GUARD } from '../guard.js';
import { SLIP10Node } from '../SLIP10Node.js';
import { isValidBytesKey, numberToUint32, validateBytes } from '../utils.js';
import type { DeriveChildKeyArgs, DerivedKeys } from './index.js';

type ErrorHandler = (
  error: unknown,
  options: DeriveNodeArgs,
) => Promise<DeriveNodeArgs>;

/**
 * Derive a BIP-32 or SLIP-10 child key with a given path from a parent key.
 *
 * Since BIP-32 and SLIP-10 are very similar, this function can be used to
 * derive both types of keys.
 *
 * @param options - The options for deriving a child key.
 * @param options.path - The derivation path part to derive.
 * @param options.node - The node to derive from.
 * @param options.curve - The curve to use for derivation.
 * @param options.network - The network for the node. This is only used for
 * extended keys, and defaults to `mainnet`.
 * @param handleError - A function that can handle errors that occur during
 * derivation.
 * @returns The derived node.
 */
export async function deriveChildKey(
  { path, node, curve, network }: DeriveChildKeyArgs,
  handleError: ErrorHandler,
): Promise<SLIP10Node> {
  validateNode(node);

  const { childIndex, isHardened } = getValidatedPath(path, node, curve);

  const args = {
    chainCode: node.chainCodeBytes,
    childIndex,
    isHardened,
    depth: node.depth,
    parentFingerprint: node.fingerprint,
    masterFingerprint: node.masterFingerprint,
    curve,
    network,
  };

  if (node.privateKeyBytes) {
    const secretExtension = await deriveSecretExtension({
      privateKey: node.privateKeyBytes,
      get publicKey() {
        return node.compressedPublicKeyBytes;
      },
      childIndex,
      isHardened,
      curve,
    });

    const entropy = await generateEntropy({
      chainCode: node.chainCodeBytes,
      extension: secretExtension,
    });

    return await deriveNode(
      {
        privateKey: node.privateKeyBytes,
        get publicKey() {
          return node.publicKeyBytes;
        },
        entropy,
        ...args,
      },
      handleError,
    );
  }

  const publicExtension = derivePublicExtension({
    parentPublicKey: node.compressedPublicKeyBytes,
    childIndex,
  });

  const entropy = await generateEntropy({
    chainCode: node.chainCodeBytes,
    extension: publicExtension,
  });

  return await deriveNode(
    {
      publicKey: node.compressedPublicKeyBytes,
      entropy,
      ...args,
    },
    handleError,
  );
}

type BaseDeriveNodeArgs = {
  entropy: Uint8Array<ArrayBuffer>;
  chainCode: Uint8Array<ArrayBuffer>;
  childIndex: number;
  isHardened: boolean;
  depth: number;
  parentFingerprint: number;
  masterFingerprint?: number | undefined;
  curve: Curve;
  network?: Network | undefined;
};

type DerivePrivateKeyArgs = BaseDeriveNodeArgs & {
  privateKey: Uint8Array<ArrayBuffer>;
  publicKey: Uint8Array<ArrayBuffer>;
};

type DerivePublicKeyArgs = BaseDeriveNodeArgs & {
  publicKey: Uint8Array<ArrayBuffer>;
  privateKey?: never | undefined;
};

export type DeriveNodeArgs = DerivePrivateKeyArgs | DerivePublicKeyArgs;

type DeriveSecretExtensionArgs = {
  privateKey: Uint8Array<ArrayBuffer>;
  publicKey: Uint8Array<ArrayBuffer>;
  childIndex: number;
  isHardened: boolean;
  curve: Curve;
};

/**
 * Derive a SLIP-10 child key from a parent key.
 *
 * @param options - The options for deriving a child key.
 * @param options.privateKey - The private key to derive from.
 * @param options.publicKey - The public key to derive from.
 * @param options.entropy - The entropy to use for deriving the child key.
 * @param options.chainCode - The chain code to use for deriving the child key.
 * @param options.childIndex - The child index to use for deriving the child key.
 * @param options.isHardened - Whether the child key is hardened.
 * @param options.depth - The depth of the child key.
 * @param options.parentFingerprint - The fingerprint of the parent key.
 * @param options.masterFingerprint - The fingerprint of the master key.
 * @param options.curve - The curve to use for deriving the child key.
 * @param handleError - A function to handle errors during derivation.
 * @returns The derived child key as {@link SLIP10Node}.
 */
async function deriveNode(
  options: DeriveNodeArgs,
  handleError: ErrorHandler,
): Promise<SLIP10Node> {
  const {
    privateKey,
    publicKey,
    entropy,
    childIndex,
    isHardened,
    depth,
    parentFingerprint,
    masterFingerprint,
    curve,
    network,
  } = options;

  try {
    if (privateKey) {
      return await derivePrivateChildKey({
        entropy,
        privateKey,
        depth,
        masterFingerprint,
        parentFingerprint,
        childIndex,
        isHardened,
        curve,
        network,
      });
    }

    return await derivePublicChildKey({
      entropy,
      publicKey,
      depth,
      masterFingerprint,
      parentFingerprint,
      childIndex,
      curve,
      network,
    });
  } catch (error) {
    return await deriveNode(await handleError(error, options), handleError);
  }
}

/**
 * Derive a BIP-32 secret extension from a parent key and child index.
 *
 * @param options - The options for deriving a secret extension.
 * @param options.privateKey - The parent private key bytes.
 * @param options.publicKey - The parent compressed public key bytes.
 * @param options.childIndex - The child index to derive.
 * @param options.isHardened - Whether the child index is hardened.
 * @param options.curve - The curve to use for derivation.
 * @returns The secret extension bytes.
 */
export async function deriveSecretExtension({
  privateKey,
  publicKey,
  childIndex,
  isHardened,
  curve,
}: DeriveSecretExtensionArgs): Promise<Uint8Array<ArrayBuffer>> {
  if (isHardened) {
    // Hardened child
    return concatBytes([
      new Uint8Array([0]),
      privateKey,
      numberToUint32(childIndex + BIP_32_HARDENED_OFFSET),
    ]);
  }

  // Normal child
  validateBytes(publicKey, curve.compressedPublicKeyLength);
  return derivePublicExtension({ parentPublicKey: publicKey, childIndex });
}

type DerivePublicExtensionArgs = {
  parentPublicKey: Uint8Array<ArrayBuffer>;
  childIndex: number;
};

/**
 * Derive a BIP-32 public extension from a parent key and child index.
 *
 * @param options - The options for deriving a public extension.
 * @param options.parentPublicKey - The parent public key bytes.
 * @param options.childIndex - The child index to derive.
 * @returns The public extension bytes.
 */
export function derivePublicExtension({
  parentPublicKey,
  childIndex,
}: DerivePublicExtensionArgs): Uint8Array<ArrayBuffer> {
  return concatBytes([parentPublicKey, numberToUint32(childIndex)]);
}

type GenerateKeyArgs = {
  privateKey: Uint8Array<ArrayBuffer>;
  entropy: Uint8Array<ArrayBuffer>;
  curve: Curve;
};

/**
 * Derive a BIP-32 key from a parent key and secret extension.
 *
 * @param options - The options for deriving a key.
 * @param options.privateKey - The parent private key bytes.
 * @param options.entropy - The entropy bytes.
 * @param options.curve - The curve to use for derivation.
 * @returns The derived key.
 */
function generateKey({ privateKey, entropy, curve }: GenerateKeyArgs): Omit<
  DerivedKeys,
  'publicKey'
> & {
  privateKey: Uint8Array<ArrayBuffer>;
} {
  const keyMaterial = entropy.slice(0, 32);
  const childChainCode = entropy.slice(32);

  // If curve is ed25519: The returned child key ki is parse256(IL).
  // https://github.com/satoshilabs/slips/blob/133ea52a8e43d338b98be208907e144277e44c0e/slip-0010.md#private-parent-key--private-child-key
  if (curve.name === 'ed25519') {
    return { privateKey: keyMaterial, chainCode: childChainCode };
  }

  const childPrivateKey = privateAdd(privateKey, keyMaterial, curve);

  return { privateKey: childPrivateKey, chainCode: childChainCode };
}

type DerivePrivateChildKeyArgs = {
  entropy: Uint8Array<ArrayBuffer>;
  privateKey: Uint8Array<ArrayBuffer>;
  depth: number;
  masterFingerprint?: number | undefined;
  parentFingerprint: number;
  childIndex: number;
  isHardened: boolean;
  curve: Curve;
  network?: Network | undefined;
};

/**
 * Derive a BIP-32 private child key with a given path from a parent key.
 *
 * @param args - The arguments for deriving a private child key.
 * @param args.entropy - The entropy to use for derivation.
 * @param args.privateKey - The parent private key to use for derivation.
 * @param args.depth - The depth of the parent node.
 * @param args.masterFingerprint - The fingerprint of the master node.
 * @param args.parentFingerprint - The fingerprint of the parent node.
 * @param args.childIndex - The child index to derive.
 * @param args.isHardened - Whether the child index is hardened.
 * @param args.curve - The curve to use for derivation.
 * @param args.network - The network for the node. This is only used for
 * extended keys, and defaults to `mainnet`.
 * @returns The derived {@link SLIP10Node}.
 */
async function derivePrivateChildKey({
  entropy,
  privateKey,
  depth,
  masterFingerprint,
  parentFingerprint,
  childIndex,
  isHardened,
  curve,
  network,
}: DerivePrivateChildKeyArgs): Promise<SLIP10Node> {
  const actualChildIndex =
    childIndex + (isHardened ? BIP_32_HARDENED_OFFSET : 0);

  const { privateKey: childPrivateKey, chainCode: childChainCode } =
    generateKey({
      privateKey,
      entropy,
      curve,
    });

  return await SLIP10Node.fromExtendedKey({
    privateKey: childPrivateKey,
    chainCode: childChainCode,
    depth: depth + 1,
    masterFingerprint,
    parentFingerprint,
    index: actualChildIndex,
    curve: curve.name,
    network,
    guard: PUBLIC_KEY_GUARD,
  });
}

type GeneratePublicKeyArgs = {
  publicKey: Uint8Array<ArrayBuffer>;
  entropy: Uint8Array<ArrayBuffer>;
  curve: Curve;
};

/**
 * Derive a BIP-32 public key from a parent key and public extension.
 *
 * @param options - The options for deriving a public key.
 * @param options.publicKey - The parent public key bytes.
 * @param options.entropy - The entropy bytes.
 * @param options.curve - The curve to use for derivation.
 * @returns The derived public key.
 */
function generatePublicKey({
  publicKey,
  entropy,
  curve,
}: GeneratePublicKeyArgs): DerivedKeys {
  const keyMaterial = entropy.slice(0, 32);
  const childChainCode = entropy.slice(32);

  // This function may fail if the resulting key is invalid.
  const childPublicKey = curve.publicAdd(publicKey, keyMaterial);

  return {
    publicKey: childPublicKey,
    chainCode: childChainCode,
  };
}

type DerivePublicChildKeyArgs = {
  entropy: Uint8Array<ArrayBuffer>;
  publicKey: Uint8Array<ArrayBuffer>;
  depth: number;
  masterFingerprint?: number | undefined;
  parentFingerprint: number;
  childIndex: number;
  curve: Curve;
  network?: Network | undefined;
};

/**
 * Derive a BIP-32 public child key with a given path from a parent key.
 *
 * @param args - The arguments for deriving a public child key.
 * @param args.entropy - The entropy to use for derivation.
 * @param args.publicKey - The parent public key to use for derivation.
 * @param args.depth - The depth of the parent node.
 * @param args.masterFingerprint - The fingerprint of the master node.
 * @param args.parentFingerprint - The fingerprint of the parent node.
 * @param args.childIndex - The child index to derive.
 * @param args.curve - The curve to use for derivation.
 * @param args.network - The network for the node. This is only used for
 * extended keys, and defaults to `mainnet`.
 * @returns The derived {@link SLIP10Node}.
 */
export async function derivePublicChildKey({
  entropy,
  publicKey,
  depth,
  masterFingerprint,
  parentFingerprint,
  childIndex,
  curve,
  network,
}: DerivePublicChildKeyArgs): Promise<SLIP10Node> {
  const { publicKey: childPublicKey, chainCode: childChainCode } =
    generatePublicKey({
      publicKey,
      entropy,
      curve,
    });

  return await SLIP10Node.fromExtendedKey({
    publicKey: childPublicKey,
    chainCode: childChainCode,
    depth: depth + 1,
    masterFingerprint,
    parentFingerprint,
    index: childIndex,
    curve: curve.name,
    network,
  });
}

/**
 * Add a tweak to the private key: `(privateKey + tweak) % n`.
 *
 * @param privateKeyBytes - The private key as 32 byte Uint8Array.
 * @param tweakBytes - The tweak as 32 byte Uint8Array.
 * @param curve - The curve to use.
 * @throws If the private key or tweak is invalid.
 * @returns The private key with the tweak added to it.
 */
export function privateAdd(
  privateKeyBytes: Uint8Array<ArrayBuffer>,
  tweakBytes: Uint8Array<ArrayBuffer>,
  curve: Curve,
): Uint8Array<ArrayBuffer> {
  assert(
    isValidBytesKey(tweakBytes, 32),
    'Invalid tweak: Tweak must be a non-zero 32-byte Uint8Array.',
  );

  const privateKey = bytesToBigInt(privateKeyBytes);
  const tweak = bytesToBigInt(tweakBytes);

  if (tweak >= curve.curve.n) {
    throw new Error('Invalid tweak: Tweak is larger than the curve order.');
  }

  const added = mod(privateKey + tweak, curve.curve.n);
  const bytes = hexToBytes(added.toString(16).padStart(64, '0'));

  if (!curve.isValidPrivateKey(bytes)) {
    throw new Error(
      'Invalid private key or tweak: The resulting private key is invalid.',
    );
  }

  return bytes;
}

type GenerateEntropyArgs = {
  chainCode: Uint8Array<ArrayBuffer>;
  extension: Uint8Array<ArrayBuffer>;
};

/**
 * Generate 64 bytes of (deterministic) entropy from a chain code and secret
 * extension.
 *
 * @param args - The arguments for generating entropy.
 * @param args.chainCode - The parent chain code bytes.
 * @param args.extension - The extension bytes.
 * @returns The generated entropy bytes.
 */
export async function generateEntropy({
  chainCode,
  extension,
}: GenerateEntropyArgs): Promise<Uint8Array<ArrayBuffer>> {
  return await hmacSha512(chainCode, extension, {
    // Chain code length is determined by the specifications.
    unsafeKeyLength: true,
  });
}

/**
 * Validate that a node is specified.
 *
 * @param node - The node to validate.
 * @throws If the node is not specified.
 */
export function validateNode(node?: SLIP10Node): asserts node is SLIP10Node {
  assert(node, 'Invalid parameters: Must specify a node to derive from.');
}

/**
 * Validate a path.
 *
 * @param path - The path to validate.
 * @param node - The node to validate the path against.
 * @param curve - The curve to validate the path against.
 * @throws If the path is invalid.
 */
function validatePath(
  path: string | Uint8Array,
  node: SLIP10Node,
  curve: Curve,
): asserts path is string {
  assert(typeof path === 'string', 'Invalid path: Must be a string.');

  const isHardened = path.endsWith(`'`);
  assert(
    !isHardened || node.privateKey,
    'Invalid parameters: Cannot derive hardened child keys without a private key.',
  );
  assert(
    isHardened || curve.deriveUnhardenedKeys,
    `Invalid path: Cannot derive unhardened child keys with ${curve.name}.`,
  );
}

/**
 * Validate a path and return the child index and whether it is hardened.
 *
 * @param path - The path to validate.
 * @param node - The node to validate the path against.
 * @param curve - The curve to validate the path against.
 * @returns The child index and whether it is hardened.
 */
export function getValidatedPath(
  path: string | Uint8Array,
  node: SLIP10Node,
  curve: Curve,
): { childIndex: number; isHardened: boolean } {
  validatePath(path, node, curve);

  const indexPart = path.split(`'`)[0];

  assert(indexPart);
  const childIndex = parseInt(indexPart, 10);

  if (
    !UNPREFIXED_PATH_REGEX.test(indexPart) ||
    !Number.isInteger(childIndex) ||
    childIndex < 0 ||
    childIndex >= BIP_32_HARDENED_OFFSET
  ) {
    throw new Error(
      `Invalid path: The index must be a non-negative decimal integer less than ${BIP_32_HARDENED_OFFSET}.`,
    );
  }

  return { childIndex, isHardened: path.includes(`'`) };
}
