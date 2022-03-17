declare module '@metamask/contract-metadata' {
  export type Token = {
    name: string;
    logo: string;
    erc20: boolean;
    erc721?: boolean;
    symbol: string;
    decimals: number;
  };
  const contractMap: Record<string, Token>;
  export default contractMap;
}
