/**
 * Response from {@link MoneyAccountBalanceService.getExchangeRate}.
 * Rate is the raw uint256 string returned by the Accountant's `getRate()`.
 */
export type ExchangeRateResponse = {
  rate: string;
};

/**
 * Response from {@link MoneyAccountBalanceService.getMusdEquivalentValue}.
 * Balance of in assets is the raw uint256 string returned by the Lens's `balanceOfInAssets()`.
 */
export type MusdEquivalentValueResponse = {
  balanceOfInAssets: string;
};

/**
 * Response from {@link MoneyAccountBalanceService.getMoneyAccountBalance}.
 */
export type MoneyAccountBalanceResponse = {
  musdBalance: string;
  vmusdValueInMusd: string;
  totalBalance: string;
};

/**
 * Canonical balance result from
 * {@link MoneyAccountBalanceService.fetchBalanceWithFallback}.
 *
 * Freshness fields are present when `source === 'api'` and omitted for RPC
 * results (additive — older consumers may ignore them).
 */
export type CanonicalMoneyAccountBalanceResponse =
  MoneyAccountBalanceResponse & {
    source: 'api' | 'rpc';
    usedFallback: boolean;
    /** Indexer watermark block from the Money API positions response. */
    asOfBlock?: number;
    /** Indexer watermark timestamp (ISO-8601) from the Money API. */
    asOfTimestamp?: string;
    /** Money API data_freshness envelope (`live` | `degraded`). */
    dataFreshness?: 'live' | 'degraded';
    /** Seconds the vault-share indexer lags wall clock. */
    indexerLagSeconds?: number;
    /**
     * ISO-8601 timestamp of the last wallet mUSD observation, when the API
     * provided it. Distinct from `asOfTimestamp` (indexer watermark).
     */
    musdBalanceUpdatedAt?: string | null;
  };

/**
 * Options for {@link MoneyAccountBalanceService.fetchBalanceWithFallback}.
 * All fields are optional and additive.
 */
export type FetchBalanceWithFallbackOptions = {
  /**
   * Minimum indexer `as_of_block` the Money API must have reached for the
   * API result to be accepted. When the API is behind, the facade throws
   * {@link MoneyAccountBalanceStaleError} and falls back to RPC (when the
   * active policy allows it). Typically the confirmed transaction's block.
   *
   * Implies `fetchPositions({ fresh: true })`, which cancels an in-flight read
   * and invalidates the resulting positions cache entry for subsequent reads.
   */
  minBlock?: number;
  /**
   * Forwarded to `MoneyAccountApiDataService:fetchPositions` so the Nest
   * response cache is bypassed (when the API honors `Cache-Control: no-cache`)
   * and the wallet mUSD balance is refreshed on demand. Independent of
   * `minBlock`, but `minBlock` already implies the same fresh-read path.
   */
  fresh?: boolean;
};

/**
 * Response from {@link MoneyAccountBalanceService.getVaultApy}.
 * APY and fee values are decimals (multiply by 100 for percentage).
 * Veda's APY values are actually APR (labeled incorrectly). They are converted APY using daily compounding
 * (see {@link convertAprToApy}) before this response is returned.
 *
 * Only `apy` and `timestamp` are guaranteed to be present — all other fields
 * are optional because the Veda API omits them when the vault has no activity.
 */
export type NormalizedVaultApyResponse = {
  aggregationPeriod?: string; // E.g. "7 days"
  apy: number;
  chainAllocation?: {
    [network: string]: number;
  };
  fees?: number;
  globalApyBreakdown?: {
    fee?: number;
    maturityApy?: number;
    realApy?: number;
  };
  performanceFees?: number;
  realApyBreakdown?: {
    allocation?: number;
    apy?: number;
    apyNet?: number;
    chain?: string;
    protocol?: string;
  }[];
  timestamp: string;
};
