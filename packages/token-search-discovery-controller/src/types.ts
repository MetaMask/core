// Function params

type ParamsBase = {
  chains?: string[];
  limit?: string;
};

export type TokenSearchParams = ParamsBase & {
  query?: string;
};

export type TrendingTokensParams = ParamsBase;

export type TopLosersParams = ParamsBase;

export type TopGainersParams = ParamsBase;

export type BlueChipParams = ParamsBase;

// API response types

export type TokenSearchResponseItem = {
  tokenAddress: string;
  chainId: string;
  name: string;
  symbol: string;
  usdPrice: number;
  usdPricePercentChange: {
    oneDay: number;
  };
  logoUrl?: string;
};

export type MoralisTokenResponseItem = {
  chain_id: string;
  token_address: string;
  token_logo: string;
  token_name: string;
  token_symbol: string;
  price_usd: number;
  token_age_in_days: number;
  on_chain_strength_index: number;
  security_score: number;
  market_cap: number;
  fully_diluted_valuation: number;
  twitter_followers: number;
  holders_change: {
    '1h': number | null;
    '1d': number | null;
    '1w': number | null;
    '1M': number | null;
  };
  liquidity_change_usd: {
    '1h': number | null;
    '1d': number | null;
    '1w': number | null;
    '1M': number | null;
  };
  experienced_net_buyers_change: {
    '1h': number | null;
    '1d': number | null;
    '1w': number | null;
    '1M': number | null;
  };
  volume_change_usd: {
    '1h': number | null;
    '1d': number | null;
    '1w': number | null;
    '1M': number | null;
  };
  net_volume_change_usd: {
    '1h': number | null;
    '1d': number | null;
    '1w': number | null;
    '1M': number | null;
  };
  price_percent_change_usd: {
    '1h': number | null;
    '1d': number | null;
    '1w': number | null;
    '1M': number | null;
  };
};
