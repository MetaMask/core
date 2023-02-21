/**
 * Human-readable network name
 */
export enum NetworkType {
  localhost = 'localhost',
  mainnet = 'mainnet',
  goerli = 'goerli',
  sepolia = 'sepolia',
  rpc = 'rpc',
}

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
