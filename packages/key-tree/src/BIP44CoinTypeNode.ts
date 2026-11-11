import type { BIP44NodeInterface, JsonBIP44Node } from './BIP44Node.js';
import { BIP44Node } from './BIP44Node.js';
import type {
  BIP39Node,
  BIP44Depth,
  BIP44PurposeNodeToken,
  CoinTypeHDPathString,
  HardenedBIP32Node,
  Network,
} from './constants.js';
import { BIP_32_HARDENED_OFFSET } from './constants.js';
import type { SupportedCurve } from './curves/index.js';
import { deriveChildNode } from './SLIP10Node.js';
import type { CoinTypeToAddressIndices } from './utils.js';
import {
  getBIP44CoinType,
  getBIP32NodeToken,
  getBIP44ChangePathString,
  getBIP44CoinTypePathString,
  getBIP44CoinTypeToAddressPathTuple,
  getHardenedBIP32NodeToken,
  getUnhardenedBIP32NodeToken,
  hexStringToBytes,
  nullableHexStringToBytes,
} from './utils.js';

export type CoinTypeHDPathTuple = [
  BIP39Node,
  typeof BIP44PurposeNodeToken,
  HardenedBIP32Node,
];

export type CoinTypeSeedPathTuple = [
  Uint8Array<ArrayBuffer>,
  typeof BIP44PurposeNodeToken,
  HardenedBIP32Node,
];

export const BIP_44_COIN_TYPE_DEPTH = 2;

export type JsonBIP44CoinTypeNode = JsonBIP44Node & {
  readonly coin_type: number;
  readonly path: CoinTypeHDPathString;
};

export type BIP44CoinTypeNodeInterface = BIP44NodeInterface & {
  readonly coin_type: number;
  readonly path: CoinTypeHDPathString;
};

export type BIP44CoinTypeSeedOptions = {
  readonly derivationPath: CoinTypeSeedPathTuple;
  readonly network?: Network | undefined;
};

/**
 * A wrapper object for BIP-44 `coin_type` keys. `coin_type` is the index
 * specifying the protocol for which deeper keys are intended. For the
 * authoritative list of coin types, please see
 * [SLIP-44](https://github.com/satoshilabs/slips/blob/master/slip-0044.md).
 *
 * Recall that a BIP-44 HD tree path consists of the following nodes:
 *
 * `m / 44' / coin_type' / account' / change / address_index`
 *
 * With the following depths:
 *
 * `0 / 1 / 2 / 3 / 4 / 5`
 *
 */
export class BIP44CoinTypeNode implements BIP44CoinTypeNodeInterface {
  /**
   * Constructs a BIP-44 `coin_type` node. `coin_type` is the index
   * specifying the protocol for which deeper keys are intended. For the
   * authoritative list of coin types, please see
   * [SLIP-44](https://github.com/satoshilabs/slips/blob/master/slip-0044.md).
   *
   * Recall that a BIP-44 HD tree path consists of the following nodes:
   *
   * `m / 44' / coin_type' / account' / change / address_index`
   *
   * With the following depths:
   *
   * `0 / 1 / 2 / 3 / 4 / 5`
   *
   * @param json - The {@link JsonBIP44Node} for the key of this node.
   * @param coin_type - The coin_type index of this node. Must be a non-negative
   * integer.
   * @returns A BIP44CoinType node.
   */
  static async fromJSON(
    json: JsonBIP44Node,
    coin_type: number,
  ): Promise<BIP44CoinTypeNode> {
    validateCoinType(coin_type);
    validateCoinTypeNodeDepth(json.depth);

    const node = await BIP44Node.fromExtendedKey({
      depth: json.depth,
      index: json.index,
      network: json.network,
      parentFingerprint: json.parentFingerprint,
      chainCode: hexStringToBytes(json.chainCode),
      privateKey: nullableHexStringToBytes(json.privateKey),
      publicKey: hexStringToBytes(json.publicKey),
    });

    return new BIP44CoinTypeNode(node, coin_type);
  }

  /**
   * Construct a BIP-44 `coin_type` node. `coin_type` is the index
   * specifying the protocol for which deeper keys are intended. For the
   * authoritative list of coin types, please see
   * [SLIP-44](https://github.com/satoshilabs/slips/blob/master/slip-0044.md).
   *
   * Recall that a BIP-44 HD tree path consists of the following nodes:
   *
   * `m / 44' / coin_type' / account' / change / address_index`
   *
   * With the following depths:
   *
   * `0 / 1 / 2 / 3 / 4 / 5`
   *
   * @param derivationPath - The derivation path for the key of this node.
   * @param network - The network for the node. This is only used for extended
   * keys, and defaults to `mainnet`.
   * @returns A BIP44CoinType node.
   */
  static async fromDerivationPath(
    derivationPath: CoinTypeHDPathTuple,
    network?: Network | undefined,
  ): Promise<BIP44CoinTypeNode> {
    validateCoinTypeNodeDepth(derivationPath.length - 1);

    const node = await BIP44Node.fromDerivationPath({
      derivationPath,
      network,
    });

    const coinType = getBIP44CoinType(derivationPath);
    return new BIP44CoinTypeNode(node, coinType);
  }

  /**
   * Create a new BIP-44 coin type node from a BIP-39 seed. The derivation path
   * must be rooted, i.e. it must begin with a BIP-39 node, given as a
   * `Uint8Array` of the seed bytes.
   *
   * All parameters are stringently validated, and an error is thrown if
   * validation fails.
   *
   * @param options - The options for the new node.
   * @param options.derivationPath - The rooted HD tree path that will be used
   * to derive the key of this node.
   * @param options.network - The network for the node. This is only used for
   * extended keys, and defaults to `mainnet`.
   * @returns A new BIP-44 node.
   */
  static async fromSeed({
    derivationPath,
    network,
  }: BIP44CoinTypeSeedOptions): Promise<BIP44CoinTypeNode> {
    validateCoinTypeNodeDepth(derivationPath.length - 1);

    const node = await BIP44Node.fromSeed({
      derivationPath,
      network,
    });

    const coinType = getBIP44CoinType(derivationPath);
    return new BIP44CoinTypeNode(node, coinType);
  }

  /**
   * Constructs a BIP-44 `coin_type` node. `coin_type` is the index
   * specifying the protocol for which deeper keys are intended. For the
   * authoritative list of coin types, please see
   * [SLIP-44](https://github.com/satoshilabs/slips/blob/master/slip-0044.md).
   *
   * Recall that a BIP-44 HD tree path consists of the following nodes:
   *
   * `m / 44' / coin_type' / account' / change / address_index`
   *
   * With the following depths:
   *
   * `0 / 1 / 2 / 3 / 4 / 5`
   *
   * @param node - The {@link BIP44Node} for the key of this node.
   * @param coin_type - The coin_type index of this node. Must be a non-negative
   * integer.
   * @returns A BIP44CoinType node.
   */
  static async fromNode(
    node: BIP44Node,
    coin_type: number,
  ): Promise<BIP44CoinTypeNode> {
    if (!(node instanceof BIP44Node)) {
      throw new Error('Invalid node: Expected an instance of BIP44Node.');
    }

    validateCoinType(coin_type);
    validateCoinTypeNodeDepth(node.depth);

    // TODO: Make this function not async in a future version.
    return Promise.resolve(new BIP44CoinTypeNode(node, coin_type));
  }

  readonly #node: BIP44Node;

  public readonly path: CoinTypeHDPathString;

  public readonly coin_type: number;

  // Constructors cannot use hash names.
  // eslint-disable-next-line no-restricted-syntax
  private constructor(node: BIP44Node, coin_type: number) {
    this.#node = node;
    this.coin_type = coin_type;
    this.path = getBIP44CoinTypePathString(coin_type);

    Object.freeze(this);
  }

  public get depth(): BIP44Depth {
    return this.#node.depth;
  }

  public get privateKeyBytes(): Uint8Array<ArrayBuffer> | undefined {
    return this.#node.privateKeyBytes;
  }

  public get publicKeyBytes(): Uint8Array<ArrayBuffer> {
    return this.#node.publicKeyBytes;
  }

  public get chainCodeBytes(): Uint8Array<ArrayBuffer> {
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

  public get compressedPublicKeyBytes(): Uint8Array<ArrayBuffer> {
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

  public get curve(): SupportedCurve {
    return this.#node.curve;
  }

  public get extendedKey(): string {
    return this.#node.extendedKey;
  }

  /**
   * Derives a BIP-44 `address_index` key corresponding to the path of this
   * node and the specified `account`, `change`, and `address_index` values.
   * `address_index` keys are normally the keys used to generate user account
   * addresses.
   *
   * Recall that a BIP-44 HD tree path consists of the following nodes:
   *
   * `m / 44' / coin_type' / account' / change / address_index`
   *
   * With the following depths:
   *
   * `0 / 1 / 2 / 3 / 4 / 5`
   *
   * @param indices - The BIP-44 index values to use in key derivation.
   * @param indices.account - The `account` index. Default: `0`
   * @param indices.change - The `change` index. Default: `0`
   * @param indices.address_index - The `address_index` index.
   * @returns The derived BIP-44 `address_index` node.
   */
  async deriveBIP44AddressKey({
    account = 0,
    change = 0,
    address_index,
  }: CoinTypeToAddressIndices): Promise<BIP44Node> {
    return await this.#node.derive(
      getBIP44CoinTypeToAddressPathTuple({ account, change, address_index }),
    );
  }

  toJSON(): JsonBIP44CoinTypeNode {
    return {
      ...this.#node.toJSON(),
      coin_type: this.coin_type,
      path: this.path,
    };
  }
}

/**
 * Validates the depth of a `coin_type` node. Simply, ensures that it is the
 * number `2`. An error is thrown if validation fails.
 *
 * @param depth - The depth to validate.
 */
function validateCoinTypeNodeDepth(depth: number): void {
  if (depth !== BIP_44_COIN_TYPE_DEPTH) {
    throw new Error(
      `Invalid depth: Coin type nodes must be of depth ${BIP_44_COIN_TYPE_DEPTH}. Received: "${depth}"`,
    );
  }
}

/**
 * Validates that the coin type is a non-negative integer number. An error is
 * thrown if validation fails.
 *
 * @param coin_type - The coin type to validate.
 */
function validateCoinType(coin_type: unknown): asserts coin_type is number {
  if (
    typeof coin_type !== 'number' ||
    !Number.isInteger(coin_type) ||
    coin_type < 0
  ) {
    throw new Error(
      'Invalid coin type: The specified coin type must be a non-negative integer number.',
    );
  }
}

/**
 * Derives a BIP-44 address key corresponding to the specified derivation path,
 * given either by a {@link BIP44CoinTypeNode} or derivation path tuple.
 *
 * Recall that a BIP-44 HD tree path consists of the following nodes:
 *
 * `m / 44' / coin_type' / account' / change / address_index`
 *
 * With the following depths:
 *
 * `0 / 1 / 2 / 3 / 4 / 5`
 *
 * @param parentKeyOrNode - The `coin_type` parent key to derive from.
 * @param indices - The BIP-44 index values to use in key derivation.
 * @param indices.account - The `account` index. Default: `0`.
 * @param indices.change - The `change` index. Default: `0`.
 * @param indices.address_index - The `address_index` index.
 * @returns The derived `address_index` key for the specified derivation path.
 */
export async function deriveBIP44AddressKey(
  parentKeyOrNode: BIP44CoinTypeNode | JsonBIP44CoinTypeNode | string,
  { account = 0, change = 0, address_index }: CoinTypeToAddressIndices,
): Promise<BIP44Node> {
  const path = getBIP44CoinTypeToAddressPathTuple({
    account,
    change,
    address_index,
  });

  const node = await getNode(parentKeyOrNode);
  const childNode = await deriveChildNode({
    path,
    node,
  });

  return new BIP44Node(childNode);
}

export type BIP44AddressKeyDeriver = {
  /**
   * @param address_index - The `address_index` value.
   * @param isHardened - Whether the derived index is hardened.
   * @returns The key corresponding to the path of this deriver and the
   * specified `address_index` value.
   */
  (address_index: number, isHardened?: boolean): Promise<BIP44Node>;

  /**
   * A human-readable representation of the derivation path of this deriver
   * function, excluding the `address_index`, which is parameterized.
   *
   * Recall that a BIP-44 HD tree path consists of the following nodes:
   *
   * `m / 44' / coin_type' / account' / change / address_index`
   *
   * With the following depths:
   *
   * `0 / 1 / 2 / 3 / 4 / 5`
   */
  path: ReturnType<typeof getBIP44ChangePathString>;

  /**
   * The `coin_type` index of addresses derived by this deriver function.
   */
  coin_type: number;
};

/**
 * Creates a function that derives BIP-44 address keys corresponding to the
 * specified derivation path, given either by a {@link BIP44CoinTypeNode} or
 * derivation path tuple.
 *
 * Recall that a BIP-44 HD tree path consists of the following nodes:
 *
 * `m / 44' / coin_type' / account' / change / address_index`
 *
 * With the following depths:
 *
 * `0 / 1 / 2 / 3 / 4 / 5`
 *
 * @param node - The {@link BIP44CoinTypeNode} to derive address keys from.
 * This node contains a BIP-44 key of depth 2, `coin_type`.
 * @param accountAndChangeIndices - The `account` and `change` indices that
 * will be used to derive addresses.
 * @returns The deriver function for the derivation path specified by the
 * `coin_type` node, `account`, and `change` indices.
 */
export async function getBIP44AddressKeyDeriver(
  node: BIP44CoinTypeNode | JsonBIP44CoinTypeNode | string,
  accountAndChangeIndices?: Omit<CoinTypeToAddressIndices, 'address_index'>,
): Promise<BIP44AddressKeyDeriver> {
  const { account = 0, change = 0 } = accountAndChangeIndices ?? {};

  const actualNode = await getNode(node);

  const accountNode = getHardenedBIP32NodeToken(account);
  const changeNode = getBIP32NodeToken(change);

  const bip44AddressKeyDeriver: BIP44AddressKeyDeriver = async (
    address_index: number,
    isHardened = false,
  ): Promise<BIP44Node> => {
    const slip10Node = await deriveChildNode({
      path: [
        accountNode,
        changeNode,
        isHardened
          ? getHardenedBIP32NodeToken(address_index)
          : getUnhardenedBIP32NodeToken(address_index),
      ],
      node: actualNode,
    });

    return new BIP44Node(slip10Node);
  };

  bip44AddressKeyDeriver.coin_type = actualNode.coin_type;
  bip44AddressKeyDeriver.path = getBIP44ChangePathString(actualNode.path, {
    account,
    change,
  });

  Object.freeze(bip44AddressKeyDeriver);

  return bip44AddressKeyDeriver;
}

/**
 * Get a BIP-44 coin type node from a JSON node or extended key string. If an existing coin type
 * node is provided, the same node is returned.
 *
 * The depth of the node is validated to be a valid coin type node.
 *
 * @param node - A BIP-44 coin type node, JSON node or extended key.
 * @returns A BIP44CoinType node.
 */
async function getNode(
  node: BIP44CoinTypeNode | JsonBIP44CoinTypeNode | string,
): Promise<BIP44CoinTypeNode> {
  if (node instanceof BIP44CoinTypeNode) {
    validateCoinTypeNodeDepth(node.depth);

    return node;
  }

  if (typeof node === 'string') {
    const bip44Node = await BIP44Node.fromExtendedKey(node);
    const coinTypeNode = await BIP44CoinTypeNode.fromNode(
      bip44Node,
      bip44Node.index - BIP_32_HARDENED_OFFSET,
    );

    validateCoinTypeNodeDepth(coinTypeNode.depth);

    return coinTypeNode;
  }

  return BIP44CoinTypeNode.fromJSON(node, node.coin_type);
}
