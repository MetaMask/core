/**
 * Human-readable network name
 */
export type NetworkType =
  | 'kovan'
  | 'localhost'
  | 'mainnet'
  | 'rinkeby'
  | 'goerli'
  | 'ropsten'
  | 'rpc';

export enum NetworksChainId {
  Mainnet = '1',
  Kovan = '42',
  Rinkeby = '4',
  Goerli = '5',
  Ropsten = '3',
  Localhost = '',
  Rpc = '',
}

// TODO: Use `@metamask/utils`.
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [prop: string]: Json };
