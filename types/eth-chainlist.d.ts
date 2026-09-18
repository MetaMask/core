declare module 'eth-chainlist' {
  export type ChainListEntry = {
    name: string;
    chainId: number;
    networkId?: number;
    slip44?: number;
    nativeCurrency?: {
      name?: string;
      symbol?: string;
      decimals?: number;
    };
  };

  export function getChainById(chainId: number): ChainListEntry | undefined;
}
