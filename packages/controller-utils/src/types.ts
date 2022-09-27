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
  mainnet = '1',
  kovan = '42',
  rinkeby = '4',
  goerli = '5',
  ropsten = '3',
  localhost = '',
  rpc = '',
}
