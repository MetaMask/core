declare module 'eth-chainlist' {
  export type ChainListEntry = {
    name: string;
    chainId: number;
    networkId?: number;
    slip44?: number;
    nativeCurrency?: {
      name: string;
      symbol: string;
      decimals: number;
    };
  };

  export function getChainById(chainId: number): ChainListEntry | undefined;

  export function getChainByNetworkId(
    networkId: number,
  ): ChainListEntry | undefined;

  export function getChainByName(name: string): ChainListEntry | undefined;

  export function getChainByShortName(
    shortName: string,
  ): ChainListEntry | undefined;

  export function rawChainData(): ChainListEntry[];
}
