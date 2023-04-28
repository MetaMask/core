/**
 * The names of Infura-supported built-in networks that can be used to create an
 * Infura-specific network client.
 */
export const InfuraNetworkType = {
  mainnet: 'mainnet',
  goerli: 'goerli',
  sepolia: 'sepolia',
} as const;

export type InfuraNetworkType =
  typeof InfuraNetworkType[keyof typeof InfuraNetworkType];

/**
 * Symbols that can be used to create a network client: either a
 * Infura-supported built-in network, "localhost" for a locally-operated custom
 * network, or "rpc" for a remotely-operated custom network.
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
