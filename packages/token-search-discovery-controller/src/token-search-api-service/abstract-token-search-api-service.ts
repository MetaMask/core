import type {
  SwappableTokenSearchParams,
  TokenSearchParams,
  TokenSearchResponseItem,
} from '../types';

/**
 * Abstract class for fetching token search results.
 */
export abstract class AbstractTokenSearchApiService {
  /**
   * Fetches token search results from the portfolio API.
   *
   * @param tokenSearchParams - Optional search parameters including chains, name, and limit {@link TokenSearchParams}
   * @returns A promise resolving to an array of {@link TokenSearchResponseItem}
   */
  abstract searchTokens(
    tokenSearchParams?: TokenSearchParams,
  ): Promise<TokenSearchResponseItem[]>;

  /**
   * Fetches swappable token search results from the portfolio API.
   *
   * @param swappableTokenSearchParams - Search parameters including name, and optional limit {@link SwappableTokenSearchParams}
   * @returns A promise resolving to an array of {@link TokenSearchResponseItem}
   */
  abstract searchSwappableTokens(
    swappableTokenSearchParams: SwappableTokenSearchParams,
  ): Promise<TokenSearchResponseItem[]>;
}
