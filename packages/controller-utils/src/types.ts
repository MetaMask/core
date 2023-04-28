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
  localhost: 'localhost',
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

export enum NetworksChainId {
  mainnet = '1',
  goerli = '5',
  sepolia = '11155111',
  localhost = '',
  rpc = '',
}

export enum NetworkId {
  mainnet = '1',
  goerli = '5',
  sepolia = '11155111',
}

export enum NetworksTicker {
  mainnet = 'ETH',
  goerli = 'GoerliETH',
  sepolia = 'SepoliaETH',
  localhost = '',
  rpc = '',
}

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [prop: string]: Json };
