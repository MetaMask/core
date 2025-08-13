export type GetSupportedNetworksResponse = {
  fullSupport: number[];
  partialSupport: {
    balances: number[];
  };
};

export type GetBalancesQueryParams = {
  /** Comma-separated network/chain IDs */
  networks?: string;
  /** Whether or not to filter the assets to contain only the tokens existing in the Token API */
  filterSupportedTokens?: boolean;
  /** Specific token addresses to fetch balances for across specified network(s) */
  includeTokenAddresses?: string;
  /** Whether to include balances of the account's staked asset balances */
  includeStakedAssets?: boolean;
};

export type GetBalancesResponse = {
  count: number;
  balances: {
    /** Underlying object type. Seems to be always `token` */
    object: string;
    /** Token Type: This is only supplied as `native` to native chain tokens (e.g. - ETH, POL) */
    type?: string;
    /** Timestamp is only provided for `native` chain tokens */
    timestamp?: string;
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    chainId: number;
    /** string representation of the balance in decimal format (decimals adjusted). e.g. - 123.456789 */
    balance: string;
  }[];
  /** networks that failed to process, if no network is processed, returns HTTP 422  */
  unprocessedNetworks: number[];
};
