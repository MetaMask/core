export const BYTES_KEY_LENGTH = 32;

export const MIN_BIP_44_DEPTH = 0;
export const MAX_BIP_44_DEPTH = 5;

export const MAX_UNHARDENED_BIP_32_INDEX = 0x7fffffff; // 2^31 - 1
export const MAX_BIP_32_INDEX = 0xffffffff; // 2^32 - 1

export type MinBIP44Depth = typeof MIN_BIP_44_DEPTH;
export type MaxBIP44Depth = typeof MAX_BIP_44_DEPTH;
export type BIP44Depth = MinBIP44Depth | 1 | 2 | 3 | 4 | MaxBIP44Depth;

// BIP-44 derivation path:
// m / purpose' / coin_type' / account' / change / address_index
//
// Per BIP-43 / BIP-44, "purpose" should always be "44":
// m / 44' / coin_type' / account' / change / address_index
//
// The Ethereum "coin_type" is "60". Its "account" and "change" indices are
// always "0". Here's an example Ethereum HD path for account "0":
// m  / 44' / 60' / 0' / 0 / 0

export type UnprefixedNode = `${number}'`;

export type AnonymizedBIP39Node = 'm';
export type BIP39StringNode = `bip39:${string}`;
export type BIP39Node = BIP39StringNode | Uint8Array;

export type HardenedBIP32Node = `bip32:${number}'`;
export type UnhardenedBIP32Node = `bip32:${number}`;
export type BIP32Node = HardenedBIP32Node | UnhardenedBIP32Node;

export type HardenedSLIP10Node = `slip10:${number}'`;
export type UnhardenedSLIP10Node = `slip10:${number}`;
export type SLIP10PathNode = HardenedSLIP10Node | UnhardenedSLIP10Node;

export type HardenedCIP3Node = `cip3:${number}'`;
export type UnhardenedCIP3Node = `cip3:${number}`;
export type CIP3PathNode = HardenedCIP3Node | UnhardenedCIP3Node;

export const BIP44PurposeNodeToken = `bip32:44'`;

export const UNPREFIXED_PATH_REGEX = /^\d+$/u;

/**
 * e.g.
 * -  0
 * -  0'
 */
export const UNPREFIXED_BIP_32_PATH_REGEX = /^(?<index>\d+)'?$/u;

/**
 * e.g.
 * -  bip32:0
 * -  bip32:0'
 */
export const BIP_32_PATH_REGEX = /^bip32:\d+'?$/u;

/**
 * e.g.
 * -  slip10:0
 * -  slip10:0'
 */
export const SLIP_10_PATH_REGEX = /^slip10:\d+'?$/u;

/**
 * e.g.
 * -  cip3:0
 * -  cip3:0'
 */
export const CIP_3_PATH_REGEX = /^cip3:\d+'?$/u;

/**
 * bip39:<SPACE_DELMITED_SEED_PHRASE>
 *
 * The seed phrase must consist of 12 <= 24 words.
 */
export const BIP_39_PATH_REGEX = /^bip39:([a-z]+){1}( [a-z]+){11,23}$/u;

export const BIP_32_HARDENED_OFFSET = 0x80000000;

export type HDPathString0 = AnonymizedBIP39Node;
export type HDPathString1 = `${HDPathString0} / ${HardenedBIP32Node}`;
export type HDPathString2 = `${HDPathString1} / ${HardenedBIP32Node}`;
export type HDPathString3 = `${HDPathString2} / ${HardenedBIP32Node}`;
export type HDPathString4 = `${HDPathString3} / ${BIP32Node}`;
export type HDPathString5 = `${HDPathString4} / ${BIP32Node}`;

export type CoinTypeHDPathString = HDPathString2;
export type ChangeHDPathString = HDPathString4;
export type AddressHDPathString = HDPathString5;

export type HDPathString =
  | HDPathString0
  | HDPathString1
  | HDPathString2
  | HDPathString3
  | HDPathString4
  | HDPathString5;

export type RootedHDPathTuple0 = readonly [BIP39Node];
export type RootedHDPathTuple1 = readonly [
  ...RootedHDPathTuple0,
  HardenedBIP32Node,
];
export type RootedHDPathTuple2 = readonly [
  ...RootedHDPathTuple1,
  HardenedBIP32Node,
];
export type RootedHDPathTuple3 = readonly [
  ...RootedHDPathTuple2,
  HardenedBIP32Node,
];
export type RootedHDPathTuple4 = readonly [...RootedHDPathTuple3, BIP32Node];
export type RootedHDPathTuple5 = readonly [...RootedHDPathTuple4, BIP32Node];

export type RootedHDPathTuple =
  | RootedHDPathTuple0
  | RootedHDPathTuple1
  | RootedHDPathTuple2
  | RootedHDPathTuple3
  | RootedHDPathTuple4
  | RootedHDPathTuple5;

export type PartialHDPathTuple1 = readonly [HardenedBIP32Node];
export type PartialHDPathTuple2 = readonly [
  ...PartialHDPathTuple1,
  HardenedBIP32Node,
];
export type PartialHDPathTuple3 = readonly [
  ...PartialHDPathTuple2,
  HardenedBIP32Node,
];
export type PartialHDPathTuple4 = readonly [...PartialHDPathTuple3, BIP32Node];
export type PartialHDPathTuple5 = readonly [...PartialHDPathTuple4, BIP32Node];
export type PartialHDPathTuple6 = readonly [BIP32Node];
export type PartialHDPathTuple7 = readonly [BIP32Node, BIP32Node];
export type PartialHDPathTuple8 = readonly [
  HardenedBIP32Node,
  BIP32Node,
  BIP32Node,
];
export type PartialHDPathTuple9 = readonly [HardenedBIP32Node, BIP32Node];
export type PartialHDPathTuple10 = readonly [
  HardenedBIP32Node,
  HardenedBIP32Node,
  BIP32Node,
];
export type PartialHDPathTuple11 = readonly [
  HardenedBIP32Node,
  HardenedBIP32Node,
  BIP32Node,
  BIP32Node,
];

export type CoinTypeToAddressTuple = PartialHDPathTuple8;

export type PartialHDPathTuple =
  | PartialHDPathTuple1
  | PartialHDPathTuple2
  | PartialHDPathTuple3
  | PartialHDPathTuple4
  | PartialHDPathTuple5
  | PartialHDPathTuple6
  | PartialHDPathTuple7
  | PartialHDPathTuple8
  | PartialHDPathTuple9
  | PartialHDPathTuple10
  | PartialHDPathTuple11;

/**
 * Every ordered subset of a full HD path tuple.
 */
export type HDPathTuple = RootedHDPathTuple | PartialHDPathTuple;

export type RootedSLIP10PathTuple = readonly [
  BIP39Node,
  ...(BIP32Node[] | SLIP10PathNode[] | CIP3PathNode[]),
];

export type RootedSLIP10SeedPathTuple = readonly [
  Uint8Array,
  ...(BIP32Node[] | SLIP10PathNode[] | CIP3PathNode[]),
];

export type SLIP10PathTuple =
  | readonly BIP32Node[]
  | readonly SLIP10PathNode[]
  | readonly CIP3PathNode[];
export type SLIP10Path = RootedSLIP10PathTuple | SLIP10PathTuple;

export type FullHDPathTuple = RootedHDPathTuple5;

/**
 * The network for which the HD path is intended.
 */
export type Network = 'mainnet' | 'testnet';
