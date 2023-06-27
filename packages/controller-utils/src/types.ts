/**
 * Human-readable network name
 */
export type NetworkType =
  | 'localhost'
  | 'mainnet'
  | 'goerli'
  | 'sepolia'
  | 'rpc'
  | 'linea-goerli'
  | 'linea-mainnet';

export enum NetworksChainId {
  mainnet = '1',
  goerli = '5',
  sepolia = '11155111',
  localhost = '',
  rpc = '',
  'linea-goerli' = '',
  'linea-mainnet' = '',
}

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [prop: string]: Json };
