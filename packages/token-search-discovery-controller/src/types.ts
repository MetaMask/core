export type TokenSearchParams = {
  chains?: string[];
  query?: string;
  limit?: string;
};

export type TokenSearchResponseItem = {
  tokenAddress: string;
  chainId: string;
  name: string;
  symbol: string;
  usdPrice: number;
  usdPricePercentChange: {
    oneDay: number;
  };
  logoUrl: string;
};
