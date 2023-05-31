/**
 * The names of built-in Infura networks
 */
export const InfuraNetworkType = {
  mainnet: 'mainnet',
  goerli: 'goerli',
  sepolia: 'sepolia',
} as const;

export type InfuraNetworkType =
  typeof InfuraNetworkType[keyof typeof InfuraNetworkType];

/**
 * The "network type"; either the name of a built-in network, or "rpc" for custom networks.
 */
export const NetworkType = {
  ...InfuraNetworkType,
  rpc: 'rpc',
} as const;

export type NetworkType = typeof NetworkType[keyof typeof NetworkType];

/**
 * A helper to determine whether a given input is NetworkType.
 *
 * @param val - the value to check whether it is NetworkType or not.
 * @returns boolean indicating whether or not the argument is NetworkType.
 */
export function isNetworkType(val: any): val is NetworkType {
  return Object.values(NetworkType).includes(val);
}

/**
 * Names of networks built into the wallet.
 *
 * This includes both Infura and non-Infura networks.
 */
export enum BuiltInNetworkName {
  Mainnet = 'mainnet',
  Goerli = 'goerli',
  Sepolia = 'sepolia',
  Aurora = 'aurora',
}

/**
 * Decimal string chain IDs of built-in networks, by name.
 *
 * `toHex` not invoked to avoid cyclic dependency
 */
export const ChainId = {
  [BuiltInNetworkName.Mainnet]: '0x1', // toHex(1)
  [BuiltInNetworkName.Goerli]: '0x5', // toHex(5)
  [BuiltInNetworkName.Sepolia]: '0xaa36a7', // toHex(11155111)
  [BuiltInNetworkName.Aurora]: '0x4e454152', // toHex(1313161554)
} as const;
export type ChainId = typeof ChainId[keyof typeof ChainId];

/**
 * Decimal string network IDs of built-in Infura networks, by name.
 */
export const NetworkId = {
  [InfuraNetworkType.mainnet]: '1',
  [InfuraNetworkType.goerli]: '5',
  [InfuraNetworkType.sepolia]: '11155111',
} as const;
export type NetworkId = typeof NetworkId[keyof typeof NetworkId];

export enum NetworksTicker {
  mainnet = 'ETH',
  goerli = 'GoerliETH',
  sepolia = 'SepoliaETH',
  rpc = '',
}
