import { bytesToHex } from '@metamask/byte-utils';
import { assert } from '@metamask/type-utils';

import type { BIP44CoinTypeNode } from './BIP44CoinTypeNode.js';
import type { BIP44Node } from './BIP44Node.js';
import { BYTES_KEY_LENGTH } from './constants.js';
import type {
  Network,
  RootedSLIP10PathTuple,
  SLIP10PathTuple,
} from './constants.js';
import type { SupportedCurve } from './curves/index.js';
import { getCurveByName } from './curves/index.js';
import { deriveKeyFromPath } from './derivation.js';
import { publicKeyToEthAddress } from './derivers/bip32.js';
import { getDerivationPathWithSeed } from './derivers/bip39.js';
import { decodeExtendedKey, encodeExtendedKey } from './extended-keys.js';
import { PUBLIC_KEY_GUARD } from './guard.js';
import {
  getBytes,
  getBytesUnsafe,
  getFingerprint,
  isValidInteger,
  validateBIP32Index,
  validateCurve,
  validateNetwork,
} from './utils.js';

/**
 * A wrapper for SLIP-10 Hierarchical Deterministic (HD) tree nodes, i.e.
 * cryptographic keys used to generate key pairs and addresses for cryptocurrency
 * protocols.
 */
export type JsonSLIP10Node = {
  /**
   * The 0-indexed path depth of this node.
   */
  readonly depth: number;

  /**
   * The fingerprint of the master node, i.e., the node at depth 0. May be
   * undefined if this node was created from an extended key.
   */
  readonly masterFingerprint?: number | undefined;

  /**
   * The fingerprint of the parent key, or 0 if this is a master node.
   */
  readonly parentFingerprint: number;

  /**
   * The index of the node, or 0 if this is a master node.
   */
  readonly index: number;

  /**
   * The network for the node. This is only used for extended keys, and defaults
   * to `mainnet`.
   */
  readonly network?: Network | undefined;

  /**
   * The (optional) private key of this node.
   */
  readonly privateKey?: string | undefined;

  /**
   * The public key of this node.
   */
  readonly publicKey: string;

  /**
   * The chain code of this node.
   */
  readonly chainCode: string;

  /**
   * The name of the curve used by the node.
   */
  readonly curve: SupportedCurve;
};

export type SLIP10NodeInterface = JsonSLIP10Node & {
  chainCodeBytes: Uint8Array<ArrayBuffer>;

  /**
   * The private key for this node, as a {@link Uint8Array}.
   * May be undefined if this node is a public key only node.
   */
  privateKeyBytes?: Uint8Array<ArrayBuffer> | undefined;

  /**
   * The public key for this node, as a {@link Uint8Array}.
   */
  publicKeyBytes: Uint8Array<ArrayBuffer>;

  /**
   * @returns A JSON-compatible representation of this node's data fields.
   */
  toJSON(): JsonSLIP10Node;
};

type BaseSLIP10NodeConstructorOptions = {
  readonly depth: number;
  readonly masterFingerprint?: number | undefined;
  readonly parentFingerprint: number;
  readonly index: number;
  readonly network?: Network | undefined;
  readonly chainCode: Uint8Array<ArrayBuffer>;
  readonly curve: SupportedCurve;
};

type SLIP10NodePrivateKeyConstructorOptions =
  BaseSLIP10NodeConstructorOptions & {
    readonly privateKey: Uint8Array<ArrayBuffer>;
    readonly publicKey: Uint8Array<ArrayBuffer>;
  };

type SLIP10NodePublicKeyConstructorOptions =
  BaseSLIP10NodeConstructorOptions & {
    readonly privateKey?: Uint8Array<ArrayBuffer> | undefined;
    readonly publicKey: Uint8Array<ArrayBuffer>;
  };

export type SLIP10NodeConstructorOptions =
  | SLIP10NodePrivateKeyConstructorOptions
  | SLIP10NodePublicKeyConstructorOptions;

export type SLIP10ExtendedKeyOptions = {
  readonly depth: number;
  readonly masterFingerprint?: number | undefined;
  readonly parentFingerprint: number;
  readonly index: number;
  readonly network?: Network | undefined;
  readonly chainCode: string | Uint8Array;
  readonly privateKey?: string | Uint8Array | undefined;
  readonly publicKey?: string | Uint8Array | undefined;
  readonly curve: SupportedCurve;

  /**
   * For internal use only. This is used to ensure the public key provided to
   * the constructor is trusted.
   */
  readonly guard?: typeof PUBLIC_KEY_GUARD;
};

export type SLIP10DerivationPathOptions = {
  readonly derivationPath: RootedSLIP10PathTuple;
  readonly network?: Network | undefined;
  readonly curve: SupportedCurve;
};

export class SLIP10Node implements SLIP10NodeInterface {
  /**
   * Wrapper of the {@link fromExtendedKey} function. Refer to that function
   * for documentation.
   *
   * @param json - The JSON representation of a SLIP-10 node.
   * @returns A SLIP10 node.
   */
  static async fromJSON(json: JsonSLIP10Node): Promise<SLIP10Node> {
    return SLIP10Node.fromExtendedKey(json);
  }

  /**
   * Create a new SLIP-10 node from a BIP-32 serialised extended key string.
   * The key may be either public or private. Note that `secp256k1` is assumed
   * as the curve for the key.
   *
   * All parameters are stringently validated, and an error is thrown if
   * validation fails.
   *
   * @param extendedKey - The BIP-32 extended key string.
   * @returns A SLIP10 node.
   */
  static async fromExtendedKey(extendedKey: string): Promise<SLIP10Node>;

  /**
   * Create a new SLIP-10 node from a key and chain code. You must specify
   * either a private key or a public key. When specifying a private key,
   * the public key will be derived from the private key.
   *
   * All parameters are stringently validated, and an error is thrown if
   * validation fails.
   *
   * @param options - The options for the new node.
   * @param options.depth - The depth of the node.
   * @param options.masterFingerprint - The fingerprint of the master node, i.e., the
   * node at depth 0. May be undefined if this node was created from an extended
   * key.
   * @param options.parentFingerprint - The fingerprint of the parent key, or 0 if
   * the node is a master node.
   * @param options.index - The index of the node, or 0 if the node is a master node.
   * @param options.privateKey - The private key for the node.
   * @param options.publicKey - The public key for the node. If a private key is
   * specified, this parameter is ignored.
   * @param options.chainCode - The chain code for the node.
   * @param options.curve - The curve used by the node.
   * @returns A SLIP10 node.
   */
  static async fromExtendedKey(
    // These signatures could technically be combined, but it's easier to
    // document them separately.
    // eslint-disable-next-line @typescript-eslint/unified-signatures
    options: SLIP10ExtendedKeyOptions,
  ): Promise<SLIP10Node>;

  /**
   * Create a new SLIP-10 node from a key and chain code. You must specify
   * either a private key or a public key. When specifying a private key,
   * the public key will be derived from the private key.
   *
   * All parameters are stringently validated, and an error is thrown if
   * validation fails.
   *
   * @param options - The options for the new node. This can be an object
   * containing the extended key options, or a string containing the extended
   * key.
   * @param options.depth - The depth of the node.
   * @param options.masterFingerprint - The fingerprint of the master node, i.e., the
   * node at depth 0. May be undefined if this node was created from an extended
   * key.
   * @param options.parentFingerprint - The fingerprint of the parent key, or 0 if
   * the node is a master node.
   * @param options.index - The index of the node, or 0 if the node is a master node.
   * @param options.privateKey - The private key for the node.
   * @param options.publicKey - The public key for the node. If a private key is
   * specified, this parameter is ignored.
   * @param options.chainCode - The chain code for the node.
   * @param options.curve - The curve used by the node.
   * @returns A SLIP10 node.
   */
  static async fromExtendedKey(
    options: SLIP10ExtendedKeyOptions | string,
  ): Promise<SLIP10Node> {
    if (typeof options === 'string') {
      const extendedKey = decodeExtendedKey(options);

      const { chainCode, depth, parentFingerprint, index } = extendedKey;

      if (extendedKey.type === 'private') {
        const { privateKey } = extendedKey;

        return SLIP10Node.fromExtendedKey({
          depth,
          parentFingerprint,
          index,
          privateKey,
          chainCode,
          // BIP-32 key serialisation assumes `secp256k1`.
          curve: 'secp256k1',
        });
      }

      const { publicKey } = extendedKey;

      return SLIP10Node.fromExtendedKey({
        depth,
        parentFingerprint,
        index,
        publicKey,
        chainCode,
        // BIP-32 key serialisation assumes `secp256k1`.
        curve: 'secp256k1',
      });
    }

    const {
      depth,
      masterFingerprint,
      parentFingerprint,
      index,
      network,
      privateKey,
      publicKey,
      chainCode,
      curve,
      guard,
    } = options;

    const chainCodeBytes = getBytes(chainCode, BYTES_KEY_LENGTH);

    validateCurve(curve);
    validateBIP32Depth(depth);
    validateBIP32Index(index);
    validateRootIndex(index, depth);
    validateNetwork(network);
    validateParentFingerprint(parentFingerprint, depth);
    validateMasterParentFingerprint(
      masterFingerprint,
      parentFingerprint,
      depth,
    );

    const curveObject = getCurveByName(curve);

    if (privateKey) {
      const privateKeyBytes = getBytesUnsafe(
        privateKey,
        curveObject.privateKeyLength,
      );

      assert(
        curveObject.isValidPrivateKey(privateKeyBytes),
        `Invalid private key: Value is not a valid ${curve} private key.`,
      );

      const trustedPublicKey =
        guard === PUBLIC_KEY_GUARD
          ? // `publicKey` is typed as `string | Uint8Array`, but we know it's
            // a `Uint8Array` because of the guard. We use `getBytes` to ensure
            // the type is correct.
            getBytes(publicKey, curveObject.publicKeyLength)
          : await curveObject.getPublicKey(privateKeyBytes);

      return new SLIP10Node(
        {
          depth,
          masterFingerprint,
          parentFingerprint,
          index,
          network,
          chainCode: chainCodeBytes,
          privateKey: privateKeyBytes,
          publicKey: trustedPublicKey,
          curve,
        },
        this.#constructorGuard,
      );
    }

    if (publicKey) {
      const publicKeyBytes = getBytes(publicKey, curveObject.publicKeyLength);

      return new SLIP10Node(
        {
          depth,
          masterFingerprint,
          parentFingerprint,
          index,
          network,
          chainCode: chainCodeBytes,
          publicKey: publicKeyBytes,
          curve,
        },
        this.#constructorGuard,
      );
    }

    throw new Error(
      'Invalid options: Must provide either a private key or a public key.',
    );
  }

  /**
   * Create a new SLIP-10 node from a derivation path. The derivation path
   * must be rooted, i.e. it must begin with a BIP-39 node, given as a string of
   * the form `bip39:MNEMONIC`, where `MNEMONIC` is a space-separated list of
   * BIP-39 seed phrase words.
   *
   * All parameters are stringently validated, and an error is thrown if
   * validation fails.
   *
   * Recall that a BIP-44 HD tree path consists of the following nodes:
   *
   * `m / 44' / coin_type' / account' / change / address_index`
   *
   * With the following depths:
   *
   * `0 / 1 / 2 / 3 / 4 / 5`
   *
   * @param options - The options for the new node.
   * @param options.derivationPath - The rooted HD tree path that will be used
   * to derive the key of this node.
   * @param options.curve - The curve used by the node.
   * @param options.network - The network for the node. This is only used for
   * extended keys, and defaults to `mainnet`.
   * @returns A new SLIP-10 node.
   */
  static async fromDerivationPath({
    derivationPath,
    network,
    curve,
  }: SLIP10DerivationPathOptions): Promise<SLIP10Node> {
    validateCurve(curve);

    if (!derivationPath) {
      throw new Error('Invalid options: Must provide a derivation path.');
    }

    if (derivationPath.length === 0) {
      throw new Error(
        'Invalid derivation path: May not specify an empty derivation path.',
      );
    }

    // `deriveKeyFromPath` expects a seed derivation path, so we need to
    // convert the rooted path to a seed path.
    const seedDerivationPath = await getDerivationPathWithSeed({
      path: derivationPath,
      curve,
    });

    return await deriveKeyFromPath({
      path: seedDerivationPath,
      depth: derivationPath.length - 1,
      network,
      curve,
    });
  }

  /**
   * Create a new SLIP-10 node from a BIP-39 seed. The derivation path
   * must be rooted, i.e. it must begin with a BIP-39 node, given as a
   * `Uint8Array` of the seed bytes.
   *
   * All parameters are stringently validated, and an error is thrown if
   * validation fails.
   *
   * @param options - The options for the new node.
   * @param options.derivationPath - The rooted HD tree path that will be used
   * to derive the key of this node.
   * @param options.curve - The curve used by the node.
   * @param options.network - The network for the node. This is only used for
   * extended keys, and defaults to `mainnet`.
   * @returns A new SLIP-10 node.
   */
  static async fromSeed({
    derivationPath,
    network,
    curve,
  }: SLIP10DerivationPathOptions): Promise<SLIP10Node> {
    validateCurve(curve);

    if (curve === 'ed25519Bip32') {
      throw new Error(
        'Invalid curve: The curve "ed25519Bip32" is not supported by the `fromSeed` function.',
      );
    }

    if (!derivationPath) {
      throw new Error('Invalid options: Must provide a derivation path.');
    }

    if (derivationPath.length === 0) {
      throw new Error(
        'Invalid derivation path: May not specify an empty derivation path.',
      );
    }

    return await deriveKeyFromPath({
      path: derivationPath,
      depth: derivationPath.length - 1,
      network,
      curve,
    });
  }

  static readonly #constructorGuard = Symbol('SLIP10Node.constructor');

  public readonly curve: SupportedCurve;

  public readonly depth: number;

  public readonly masterFingerprint?: number | undefined;

  public readonly parentFingerprint: number;

  public readonly index: number;

  public readonly network: Network;

  public readonly chainCodeBytes: Uint8Array<ArrayBuffer>;

  public readonly privateKeyBytes?: Uint8Array<ArrayBuffer> | undefined;

  readonly #publicKeyBytes: Uint8Array<ArrayBuffer>;

  // eslint-disable-next-line no-restricted-syntax
  private constructor(
    {
      depth,
      masterFingerprint,
      parentFingerprint,
      index,
      network = 'mainnet',
      chainCode,
      privateKey,
      publicKey,
      curve,
    }: SLIP10NodeConstructorOptions,
    constructorGuard?: symbol,
  ) {
    assert(
      constructorGuard === SLIP10Node.#constructorGuard,
      'SLIP10Node can only be constructed using `SLIP10Node.fromJSON`, `SLIP10Node.fromExtendedKey`, `SLIP10Node.fromDerivationPath`, or `SLIP10Node.fromSeed`.',
    );

    assert(
      privateKey !== undefined || publicKey !== undefined,
      'SLIP10Node requires either a private key or a public key to be set.',
    );

    this.depth = depth;
    this.masterFingerprint = masterFingerprint;
    this.parentFingerprint = parentFingerprint;
    this.index = index;
    this.network = network;
    this.chainCodeBytes = chainCode;
    this.privateKeyBytes = privateKey;
    this.curve = curve;
    this.#publicKeyBytes = publicKey;

    Object.freeze(this);
  }

  public get chainCode(): string {
    return bytesToHex(this.chainCodeBytes);
  }

  public get privateKey(): string | undefined {
    if (this.privateKeyBytes) {
      return bytesToHex(this.privateKeyBytes);
    }

    return undefined;
  }

  public get publicKey(): string {
    return bytesToHex(this.publicKeyBytes);
  }

  public get publicKeyBytes(): Uint8Array<ArrayBuffer> {
    return this.#publicKeyBytes;
  }

  public get compressedPublicKeyBytes(): Uint8Array<ArrayBuffer> {
    return getCurveByName(this.curve).compressPublicKey(this.publicKeyBytes);
  }

  public get compressedPublicKey(): string {
    return bytesToHex(this.compressedPublicKeyBytes);
  }

  public get address(): string {
    if (this.curve !== 'secp256k1') {
      throw new Error(
        'Unable to get address for this node: Only secp256k1 is supported.',
      );
    }

    return bytesToHex(publicKeyToEthAddress(this.publicKeyBytes));
  }

  public get fingerprint(): number {
    return getFingerprint(
      this.compressedPublicKeyBytes,
      getCurveByName(this.curve).compressedPublicKeyLength,
    );
  }

  /**
   * Get the extended public or private key for the SLIP-10 node. SLIP-10
   * doesn't specify a format for extended keys, so we use the BIP-32 format.
   *
   * This property is only supported for `secp256k1` nodes, as other curves
   * don't specify a standard format for extended keys.
   *
   * @returns The extended public or private key for the node.
   */
  public get extendedKey(): string {
    assert(
      this.curve === 'secp256k1',
      'Unable to get extended key for this node: Only secp256k1 is supported.',
    );

    const data = {
      depth: this.depth,
      parentFingerprint: this.parentFingerprint,
      index: this.index,
      network: this.network,
      chainCode: this.chainCodeBytes,
    };

    if (this.privateKeyBytes) {
      return encodeExtendedKey({
        ...data,
        type: 'private',
        privateKey: this.privateKeyBytes,
      });
    }

    return encodeExtendedKey({
      ...data,
      type: 'public',
      publicKey: this.publicKeyBytes,
    });
  }

  /**
   * Get a neutered version of this node, i.e. a node without a private key.
   *
   * @returns A neutered version of this node.
   */
  public neuter(): SLIP10Node {
    return new SLIP10Node(
      {
        depth: this.depth,
        masterFingerprint: this.masterFingerprint,
        parentFingerprint: this.parentFingerprint,
        index: this.index,
        chainCode: this.chainCodeBytes,
        publicKey: this.publicKeyBytes,
        curve: this.curve,
        network: this.network,
      },
      SLIP10Node.#constructorGuard,
    );
  }

  /**
   * Derives a child of the key contains be this node and returns a new
   * {@link SLIP10Node} containing the child key.
   *
   * The specified path must be a valid HD path from this node, per SLIP-10.
   *
   * @param path - The partial (non-rooted) SLIP-10 HD tree path will be used
   * to derive a child key from the parent key contained within this node.
   * @returns The {@link SLIP10Node} corresponding to the derived child key.
   */
  public async derive(path: SLIP10PathTuple): Promise<SLIP10Node> {
    return await deriveChildNode({
      path,
      node: this,
    });
  }

  // This is documented in the interface of this class.
  public toJSON(): JsonSLIP10Node {
    return {
      depth: this.depth,
      masterFingerprint: this.masterFingerprint,
      parentFingerprint: this.parentFingerprint,
      index: this.index,
      network: this.network,
      curve: this.curve,
      privateKey: this.privateKey,
      publicKey: this.publicKey,
      chainCode: this.chainCode,
    };
  }
}

/**
 * Validates a BIP-32 path depth. Effectively, asserts that the depth is an
 * integer `number`. Throws an error if validation fails.
 *
 * @param depth - The depth to validate.
 */
export function validateBIP32Depth(depth: unknown): asserts depth is number {
  if (!isValidInteger(depth)) {
    throw new Error(
      `Invalid HD tree path depth: The depth must be a positive integer. Received: "${String(
        depth,
      )}".`,
    );
  }
}

/**
 * Validates a BIP-32 parent fingerprint. Effectively, asserts that the fingerprint is an
 * integer `number`. Throws an error if validation fails.
 *
 * @param parentFingerprint - The parent fingerprint to validate.
 * @param depth - The depth of the node to validate.
 * @throws If the parent fingerprint is not a positive integer, or invalid for
 * the current depth.
 */
export function validateParentFingerprint(
  parentFingerprint: unknown,
  depth: number,
): asserts parentFingerprint is number {
  if (!isValidInteger(parentFingerprint)) {
    throw new Error(
      `Invalid parent fingerprint: The fingerprint must be a positive integer. Received: "${String(
        parentFingerprint,
      )}".`,
    );
  }

  if (depth === 0 && parentFingerprint !== 0) {
    throw new Error(
      `Invalid parent fingerprint: The fingerprint of the root node must be 0. Received: "${String(
        parentFingerprint,
      )}".`,
    );
  }

  if (depth > 0 && parentFingerprint === 0) {
    throw new Error(
      `Invalid parent fingerprint: The fingerprint of a child node must not be 0. Received: "${String(
        parentFingerprint,
      )}".`,
    );
  }
}

/**
 * Validate that a given combination of master fingerprint and parent
 * fingerprint is valid for the given depth.
 *
 * @param masterFingerprint - The master fingerprint to validate.
 * @param parentFingerprint - The parent fingerprint to validate.
 * @param depth - The depth of the node to validate.
 * @throws If the combination of master fingerprint and parent fingerprint is
 * invalid for the given depth.
 */
export function validateMasterParentFingerprint(
  masterFingerprint: number | undefined,
  parentFingerprint: number,
  depth: number,
): void {
  // The master fingerprint is optional.
  if (!masterFingerprint) {
    return;
  }

  if (depth >= 2 && masterFingerprint === parentFingerprint) {
    throw new Error(
      `Invalid parent fingerprint: The fingerprint of a child node cannot be equal to the master fingerprint. Received: "${String(
        parentFingerprint,
      )}".`,
    );
  }
}

/**
 * Validate that the index is zero for the root node.
 *
 * @param index - The index to validate.
 * @param depth - The depth of the node to validate.
 * @throws If the index is not zero for the root node.
 */
export function validateRootIndex(index: number, depth: number): void {
  if (depth === 0 && index !== 0) {
    throw new Error(
      `Invalid index: The index of the root node must be 0. Received: "${String(
        index,
      )}".`,
    );
  }
}

type DeriveChildNodeArgs = {
  path: SLIP10PathTuple;
  node: SLIP10Node | BIP44Node | BIP44CoinTypeNode;
};

/**
 * Derives a child key from the given parent key.
 *
 * @param options - The options to use when deriving the child key.
 * @param options.node - The node to derive from.
 * @param options.path - The path to the child node / key.
 * @returns The derived key and depth.
 */
export async function deriveChildNode({
  path,
  node,
}: DeriveChildNodeArgs): Promise<SLIP10Node> {
  if (path.length === 0) {
    throw new Error(
      'Invalid HD tree derivation path: Deriving a path of length 0 is not defined.',
    );
  }

  // Note that we do not subtract 1 from the length of the path to the child,
  // unlike when we calculate the depth of a rooted path.
  const newDepth = node.depth + path.length;
  validateBIP32Depth(newDepth);

  return await deriveKeyFromPath({
    path,
    node,
    depth: newDepth,
  });
}
