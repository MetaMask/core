/**
 * Human-readable network name
 */
export type NetworkType =
  | 'localhost'
  | 'mainnet'
  | 'goerli'
  | 'sepolia'
  | 'rpc';

export enum NetworksChainId {
  mainnet = '1',
  goerli = '5',
  sepolia = '11155111',
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
