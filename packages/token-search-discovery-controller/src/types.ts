export type TokenSearchParams = {
  chains?: string[];
  name?: string;
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
};
