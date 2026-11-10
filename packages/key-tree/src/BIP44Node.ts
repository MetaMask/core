import { assert } from '@metamask/type-utils';

import type {
  BIP44Depth,
  Network,
  PartialHDPathTuple,
  RootedSLIP10PathTuple,
  RootedSLIP10SeedPathTuple,
  SLIP10Path,
} from './constants.js';
import {
  BIP44PurposeNodeToken,
  BIP_32_PATH_REGEX,
  BIP_39_PATH_REGEX,
  MAX_BIP_44_DEPTH,
  MIN_BIP_44_DEPTH,
} from './constants.js';
import type { CryptographicFunctions } from './cryptography.js';
import type { SupportedCurve } from './curves/index.js';
import { decodeExtendedKey } from './extended-keys.js';
import { SLIP10Node, validateBIP32Depth } from './SLIP10Node.js';
import { isHardened } from './utils.js';

export type BIP44ExtendedKeyOptions = {
  readonly depth: number;
  readonly parentFingerprint: number;
  readonly index: number;
  readonly network?: Network | undefined;
  readonly chainCode: Uint8Array | string;
  readonly privateKey?: Uint8Array | string | undefined;
  readonly publicKey?: Uint8Array | string | undefined;
};

export type BIP44DerivationPathOptions = {
  readonly derivationPath: RootedSLIP10PathTuple;
  readonly network?: Network | undefined;
};

export type BIP44SeedOptions = {
  readonly derivationPath: RootedSLIP10SeedPathTuple;
  readonly network?: Network | undefined;
};

/**
 * A wrapper for BIP-44 Hierarchical Deterministic (HD) tree nodes, i.e.
 * cryptographic keys used to generate keypairs and addresses for cryptocurrency
 * protocols.
 */
export type JsonBIP44Node = {
  /**
   * The 0-indexed BIP-44 path depth of this node.
   *
   * A BIP-44 path is of the form:
   *
   * `m / 44' / coin_type' / account' / change / address_index`
   *
   * With the following depths:
   *
   * `0 / 1 / 2 / 3 / 4 / 5`
   */
  readonly depth: BIP44Depth;

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
   * The hexadecimal string representation of the private key for this node.
   * May be `undefined` if the node is a public node.
   */
  readonly privateKey?: string | undefined;

  /**
   * The hexadecimal string representation of the public key for this node.
   */
  readonly publicKey: string;

  /**
   * The hexadecimal string representation of the chain code for this node.
   */
  readonly chainCode: string;
};

export type BIP44NodeInterface = JsonBIP44Node & {
  /**
   * @returns A JSON-compatible representation of this node's data fields.
   */
  toJSON(): JsonBIP44Node;
};

/**
 * A wrapper for BIP-44 Hierarchical Deterministic (HD) tree nodes, i.e.
 * cryptographic keys used to generate keypairs and addresses for cryptocurrency
 * protocols.
 *
 * This class contains methods and fields that may not serialize well. Use
 * {@link BIP44Node.toJSON} to get a JSON-compatible representation.
 */
export class BIP44Node implements BIP44NodeInterface {
  /**
   * Wrapper of the {@link fromExtendedKey} function. Refer to that function
   * for documentation.
   *
   * @param json - The JSON representation of a SLIP-10 node.
   * @param cryptographicFunctions - The cryptographic functions to use. If
   * provided, these will be used instead of the built-in implementations.
   * @returns A BIP44 node.
   */
  static async fromJSON(
    json: JsonBIP44Node,
    cryptographicFunctions?: CryptographicFunctions,
  ): Promise<BIP44Node> {
    return BIP44Node.fromExtendedKey(json, cryptographicFunctions);
  }

  /**
   * Create a new BIP-44 node from a key and chain code. You must specify
   * either a private key or a public key. When specifying a private key,
   * the public key will be derived from the private key.
   *
   * All parameters are stringently validated, and an error is thrown if
   * validation fails.
   *
   * @param options - An object containing the extended key, or an extended
   * public (xpub) or private (xprv) key.
   * @param options.depth - The depth of the node.
   * @param options.network - The network for the node. This is only used for
   * extended keys, and defaults to `mainnet`.
   * @param options.privateKey - The private key for the node.
   * @param options.publicKey - The public key for the node. If a private key is
   * specified, this parameter is ignored.
   * @param options.chainCode - The chain code for the node.
   * @param cryptographicFunctions - The cryptographic functions to use. If
   * provided, these will be used instead of the built-in implementations.
   * @returns A BIP44 node.
   */
  static async fromExtendedKey(
    options: BIP44ExtendedKeyOptions | string,
    cryptographicFunctions?: CryptographicFunctions,
  ): Promise<BIP44Node> {
    if (typeof options === 'string') {
      const extendedKey = decodeExtendedKey(options);

      const { type, chainCode, depth, parentFingerprint, index, network } =
        extendedKey;

      if (type === 'private') {
        const { privateKey } = extendedKey;

        return BIP44Node.fromExtendedKey(
          {
            depth,
            parentFingerprint,
            index,
            network,
            privateKey,
            chainCode,
          },
          cryptographicFunctions,
        );
      }

      const { publicKey } = extendedKey;

      return BIP44Node.fromExtendedKey(
        {
          depth,
          parentFingerprint,
          index,
          network,
          publicKey,
          chainCode,
        },
        cryptographicFunctions,
      );
    }

    const {
      privateKey,
      publicKey,
      chainCode,
      depth,
      parentFingerprint,
      index,
      network,
    } = options;

    validateBIP44Depth(depth);

    const node = await SLIP10Node.fromExtendedKey(
      {
        privateKey,
        publicKey,
        chainCode,
        depth,
        parentFingerprint,
        index,
        network,
        curve: 'secp256k1',
      },
      cryptographicFunctions,
    );

    return new BIP44Node(node);
  }

  /**
   * Create a new BIP-44 node from a derivation path. The derivation path
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
   * @param options - An object containing the derivation path.
   * @param options.derivationPath - The rooted HD tree path that will be used
   * to derive the key of this node.
   * @param options.network - The network for the node. This is only used for
   * extended keys, and defaults to `mainnet`.
   * @param cryptographicFunctions - The cryptographic functions to use. If
   * provided, these will be used instead of the built-in implementations.
   * @returns A BIP44 node.
   */
  static async fromDerivationPath(
    { derivationPath, network }: BIP44DerivationPathOptions,
    cryptographicFunctions?: CryptographicFunctions,
  ): Promise<BIP44Node> {
    validateBIP44Depth(derivationPath.length - 1);
    validateBIP44DerivationPath(derivationPath, MIN_BIP_44_DEPTH);

    const node = await SLIP10Node.fromDerivationPath(
      {
        derivationPath,
        network,
        curve: 'secp256k1',
      },
      cryptographicFunctions,
    );

    return new BIP44Node(node);
  }

  /**
   * Create a new BIP-44 node from a BIP-39 seed. The derivation path must be
   * rooted, i.e. it must begin with a BIP-39 node, given as a `Uint8Array` of
   * the seed bytes.
   *
   * All parameters are stringently validated, and an error is thrown if
   * validation fails.
   *
   * @param options - The options for the new node.
   * @param options.derivationPath - The rooted HD tree path that will be used
   * to derive the key of this node.
   * @param options.network - The network for the node. This is only used for
   * extended keys, and defaults to `mainnet`.
   * @param cryptographicFunctions - The cryptographic functions to use. If
   * provided, these will be used instead of the built-in implementations.
   * @returns A new BIP-44 node.
   */
  static async fromSeed(
    { derivationPath, network }: BIP44SeedOptions,
    cryptographicFunctions?: CryptographicFunctions,
  ): Promise<BIP44Node> {
    validateBIP44Depth(derivationPath.length - 1);
    validateBIP44DerivationPath(derivationPath, MIN_BIP_44_DEPTH);

    const node = await SLIP10Node.fromSeed(
      {
        derivationPath,
        network,
        curve: 'secp256k1',
      },
      cryptographicFunctions,
    );

    return new BIP44Node(node);
  }

  readonly #node: SLIP10Node;

  public get depth(): BIP44Depth {
    return this.#node.depth as BIP44Depth;
  }

  public get privateKeyBytes(): Uint8Array | undefined {
    return this.#node.privateKeyBytes;
  }

  public get publicKeyBytes(): Uint8Array {
    return this.#node.publicKeyBytes;
  }

  public get chainCodeBytes(): Uint8Array {
    return this.#node.chainCodeBytes;
  }

  public get privateKey(): string | undefined {
    return this.#node.privateKey;
  }

  public get publicKey(): string {
    return this.#node.publicKey;
  }

  public get compressedPublicKey(): string {
    return this.#node.compressedPublicKey;
  }

  public get compressedPublicKeyBytes(): Uint8Array {
    return this.#node.compressedPublicKeyBytes;
  }

  public get chainCode(): string {
    return this.#node.chainCode;
  }

  public get address(): string {
    return this.#node.address;
  }

  public get masterFingerprint(): number | undefined {
    return this.#node.masterFingerprint;
  }

  public get parentFingerprint(): number {
    return this.#node.parentFingerprint;
  }

  public get fingerprint(): number {
    return this.#node.fingerprint;
  }

  public get index(): number {
    return this.#node.index;
  }

  public get network(): Network {
    return this.#node.network;
  }

  public get extendedKey(): string {
    return this.#node.extendedKey;
  }

  public get curve(): SupportedCurve {
    return this.#node.curve;
  }

  constructor(node: SLIP10Node) {
    this.#node = node;

    Object.freeze(this);
  }

  /**
   * Get a neutered version of this node, i.e. a node without a private key.
   *
   * @returns A neutered version of this node.
   */
  public neuter(): BIP44Node {
    const node = this.#node.neuter();
    return new BIP44Node(node);
  }

  /**
   * Derives a child of the key contains be this node and returns a new
   * {@link BIP44Node} containing the child key.
   *
   * The specified path must be a valid HD path from this node, per BIP-44.
   * At present, this means that the path must consist of no more than 5 BIP-32
   * nodes, depending on the depth of this node.
   *
   * Recall that a BIP-44 HD tree path consists of the following nodes:
   *
   * `m / 44' / coin_type' / account' / change / address_index`
   *
   * With the following depths:
   *
   * `0 / 1 / 2 / 3 / 4 / 5`
   *
   * @param path - The partial (non-rooted) BIP-44 HD tree path will be used
   * to derive a child key from the parent key contained within this node.
   * @returns The {@link BIP44Node} corresponding to the derived child key.
   */
  public async derive(path: PartialHDPathTuple): Promise<BIP44Node> {
    if (this.depth === MAX_BIP_44_DEPTH) {
      throw new Error(
        'Illegal operation: This HD tree node is already a leaf node.',
      );
    }

    const newDepth = this.depth + path.length;

    validateBIP44Depth(newDepth);
    validateBIP44DerivationPath(path, (this.depth + 1) as BIP44Depth);

    const node = await this.#node.derive(path);
    return new BIP44Node(node);
  }

  // This is documented in the interface of this class.
  public toJSON(): JsonBIP44Node {
    return {
      depth: this.depth,
      masterFingerprint: this.masterFingerprint,
      parentFingerprint: this.parentFingerprint,
      index: this.index,
      network: this.network,
      privateKey: this.privateKey,
      publicKey: this.publicKey,
      chainCode: this.chainCode,
    };
  }
}

/**
 * Validates a BIP-44 path depth. Effectively, asserts that the depth is an
 * integer `number` N such that 0 <= N <= 5. Throws an error if validation
 * fails.
 *
 * @param depth - The depth to validate.
 */
export function validateBIP44Depth(
  depth: unknown,
): asserts depth is BIP44Depth {
  validateBIP32Depth(depth);

  if (depth < MIN_BIP_44_DEPTH || depth > MAX_BIP_44_DEPTH) {
    throw new Error(
      `Invalid HD tree path depth: The depth must be a positive integer N such that 0 <= N <= 5. Received: "${depth}"`,
    );
  }
}

/**
 * Ensures that the given derivation is valid by BIP-44.
 *
 * Recall that a BIP-44 HD tree path consists of the following nodes:
 *
 * `m / 44' / coin_type' / account' / change / address_index`
 *
 * With the following depths:
 *
 * `0 / 1 / 2 / 3 / 4 / 5`
 *
 * @param path - The path to validate.
 * @param startingDepth - The depth of the first node of the derivation path.
 */
function validateBIP44DerivationPath(
  path: SLIP10Path,
  startingDepth: BIP44Depth,
): void {
  path.forEach((nodeToken, index) => {
    const currentDepth = startingDepth + index;

    if (currentDepth === MIN_BIP_44_DEPTH) {
      if (
        !(nodeToken instanceof Uint8Array) &&
        !BIP_39_PATH_REGEX.test(nodeToken)
      ) {
        throw new Error(
          'Invalid derivation path: The "m" / seed node (depth 0) must be a BIP-39 node.',
        );
      }

      return;
    }

    assert(typeof nodeToken === 'string');

    // eslint-disable-next-line default-case
    switch (currentDepth) {
      case 1:
        if (nodeToken !== BIP44PurposeNodeToken) {
          throw new Error(
            `Invalid derivation path: The "purpose" node (depth 1) must be the string "${BIP44PurposeNodeToken}".`,
          );
        }
        break;

      case 2:
        if (!BIP_32_PATH_REGEX.test(nodeToken) || !isHardened(nodeToken)) {
          throw new Error(
            'Invalid derivation path: The "coin_type" node (depth 2) must be a hardened BIP-32 node.',
          );
        }
        break;

      case 3:
        if (!BIP_32_PATH_REGEX.test(nodeToken) || !isHardened(nodeToken)) {
          throw new Error(
            'Invalid derivation path: The "account" node (depth 3) must be a hardened BIP-32 node.',
          );
        }
        break;

      case 4:
        if (!BIP_32_PATH_REGEX.test(nodeToken)) {
          throw new Error(
            'Invalid derivation path: The "change" node (depth 4) must be a BIP-32 node.',
          );
        }
        break;

      case MAX_BIP_44_DEPTH: // 5
        if (!BIP_32_PATH_REGEX.test(nodeToken)) {
          throw new Error(
            'Invalid derivation path: The "address_index" node (depth 5) must be a BIP-32 node.',
          );
        }
        break;
    }
  });
}
