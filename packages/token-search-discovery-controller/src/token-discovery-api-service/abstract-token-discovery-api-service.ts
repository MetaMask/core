import type {
  MoralisTokenResponseItem,
  TrendingTokensParams,
  TopLosersParams,
  TopGainersParams,
  BlueChipParams,
} from '../types';

/**
 * Abstract class for fetching token discovery results.
 */
export abstract class AbstractTokenDiscoveryApiService {
  /**
   * Fetches trending tokens by chains from the portfolio API.
   *
   * @param params - Optional parameters including chains and limit
   * @returns A promise resolving to an array of {@link TokenTrendingResponseItem}
   */
  abstract getTrendingTokensByChains(
    params?: TrendingTokensParams,
  ): Promise<MoralisTokenResponseItem[]>;

  abstract getTopLosersByChains(
    params?: TopLosersParams,
  ): Promise<MoralisTokenResponseItem[]>;

  abstract getTopGainersByChains(
    params?: TopGainersParams,
  ): Promise<MoralisTokenResponseItem[]>;

  abstract getBlueChipTokensByChains(
    params?: BlueChipParams,
  ): Promise<MoralisTokenResponseItem[]>;
}
