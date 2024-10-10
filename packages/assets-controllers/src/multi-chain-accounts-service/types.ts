export type GetBalancesQueryParams = {
  /** @description Comma-separated network/chain IDs */
  networks?: string;
  /** @description Whether or not to filter the assets to contain only the tokens existing in the Token API */
  filterSupportedTokens?: boolean;
  /** @description Specific token addresses to fetch balances for across specified network(s) */
  includeTokenAddresses?: string;
  /** @description Whether to include balances of the account's staked asset balances */
  includeStakedAssets?: boolean;
};

export type GetBalancesResponse = {
  count: number;
  balances: {
    object: string;
    address: string;
    symbol: string;
    name: string;
    type?: string;
    timestamp?: string;
    decimals: number;
    chainId: number;
    balance: string;
  }[];
  /** @description networks that failed to process, if no network is processed, returns HTTP 422  */
  unprocessedNetworks: number[];
};
