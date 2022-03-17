declare module 'eth-json-rpc-infura' {
  import type { JsonRpcMiddleware } from 'json-rpc-engine';

  // Source: <https://docs.infura.io>
  export type SupportedInfuraNetwork =
    | 'mainnet'
    | 'ropsten'
    | 'rinkeby'
    | 'kovan'
    | 'goerli'
    | 'eth2-beacon-mainnet'
    | 'ipfs'
    | 'filecoin'
    | 'polygon-mainnet'
    | 'polygon-mumbai'
    | 'palm-mainnet'
    | 'palm-testnet'
    | 'optimism-mainnet'
    | 'optimism-kovan'
    | 'arbitrum-mainnet'
    | 'arbitrum-rinkeby'
    | 'near-mainnet'
    | 'near-testnet'
    | 'aurora-mainnet'
    | 'aurora-testnet'
    // Legacy networks for compatibility with NetworkController
    | 'optimism'
    | 'optimismTest';

  export type CreateInfuraMiddlewareOptions = {
    network?: SupportedInfuraNetwork;
    maxAttempts?: number;
    source?: string;
    projectId: string;
    headers?: Record<string, string>;
  };

  export default function createInfuraMiddleware<T, U>(
    opts: CreateInfuraMiddlewareOptions,
  ): JsonRpcMiddleware<T, U>;
}
