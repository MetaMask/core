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
  // These values are used together with `NetworkType` above, meaning that we
  // can't follow the naming convention. It can potentially be refactored to a
  // regular object in the future.
  /* eslint-disable @typescript-eslint/naming-convention */
  mainnet = '1',
  kovan = '42',
  rinkeby = '4',
  goerli = '5',
  ropsten = '3',
  localhost = '',
  rpc = '',
  /* eslint-enable @typescript-eslint/naming-convention */
}

// TODO: Use `@metamask/utils`.
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [prop: string]: Json };
