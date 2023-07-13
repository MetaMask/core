/**
 * The names of built-in Infura networks
 */
export const InfuraNetworkType = {
  mainnet: 'mainnet',
  goerli: 'goerli',
  sepolia: 'sepolia',
  'linea-goerli': 'linea-goerli',
  'linea-mainnet': 'linea-mainnet',
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
  LineaGoerli = 'linea-goerli',
  LineaMainnet = 'linea-mainnet',
  Aurora = 'aurora',
}

/**
 * Caip-2 chain IDs of built-in networks, by name.
 */
export const BuiltInCaipChainId = {
  [BuiltInNetworkName.Mainnet]: 'eip155:1',
  [BuiltInNetworkName.Goerli]: 'eip155:5',
  [BuiltInNetworkName.Sepolia]: 'eip155:11155111',
  [BuiltInNetworkName.Aurora]: 'eip155:1313161554',
  [BuiltInNetworkName.LineaGoerli]: 'eip155:59140',
  [BuiltInNetworkName.LineaMainnet]: 'eip155:59144',
} as const;

/**
 * Decimal string network IDs of built-in Infura networks, by name.
 */
export const InfuraNetworkId = {
  // should these be eip'd?..
  [InfuraNetworkType.mainnet]: '1',
  [InfuraNetworkType.goerli]: '5',
  [InfuraNetworkType.sepolia]: '11155111',
  [InfuraNetworkType['linea-goerli']]: '59140',
  [InfuraNetworkType['linea-mainnet']]: '59144',
} as const;
export type InfuraNetworkId =
  typeof InfuraNetworkId[keyof typeof InfuraNetworkId];

export enum NetworksTicker {
  mainnet = 'ETH',
  goerli = 'GoerliETH',
  sepolia = 'SepoliaETH',
  'linea-goerli' = 'LineaETH',
  'linea-mainnet' = 'ETH',
  rpc = '',
}
