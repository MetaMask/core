import type { ServicePolicy } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';

/**
 * Represents the price of a token in a currency.
 */
export type TokenPrice<TokenAddress extends Hex, Currency extends string> = {
  tokenAddress: TokenAddress;
  currency: Currency;
  allTimeHigh: number;
  allTimeLow: number;
  circulatingSupply: number;
  dilutedMarketCap: number;
  high1d: number;
  low1d: number;
  marketCap: number;
  marketCapPercentChange1d: number;
  price: number;
  priceChange1d: number;
  pricePercentChange1d: number;
  pricePercentChange1h: number;
  pricePercentChange1y: number;
  pricePercentChange7d: number;
  pricePercentChange14d: number;
  pricePercentChange30d: number;
  pricePercentChange200d: number;
  totalVolume: number;
};

/**
 * Represents an exchange rate.
 */
export type ExchangeRate = {
  name: string;
  ticker: string;
  value: number;
  currencyType: string;
  usd?: number;
};

/**
 * A map of token address to its price.
 */
export type TokenPricesByTokenAddress<
  TokenAddress extends Hex,
  Currency extends string,
> = {
  [A in TokenAddress]: TokenPrice<A, Currency>;
};

/**
 * A map of currency to its exchange rate.
 */
export type ExchangeRatesByCurrency<Currency extends string> = {
  [C in Currency]: ExchangeRate;
};

/**
 * An ideal token prices service. All implementations must confirm to this
 * interface.
 *
 * @template ChainId - A type union of valid arguments for the `chainId`
 * argument to `fetchTokenPrices`.
 * @template TokenAddress - A type union of all token addresses. The reason this
 * type parameter exists is so that we can guarantee that same addresses that
 * `fetchTokenPrices` receives are the same addresses that shown up in the
 * return value.
 * @template Currency - A type union of valid arguments for the `currency`
 * argument to `fetchTokenPrices`.
 */
export type AbstractTokenPricesService<
  ChainId extends Hex = Hex,
  TokenAddress extends Hex = Hex,
  Currency extends string = string,
> = Partial<Pick<ServicePolicy, 'onBreak' | 'onDegraded'>> & {
  /**
   * Retrieves prices in the given currency for the tokens identified by the
   * given addresses which are expected to live on the given chain.
   *
   * @param args - The arguments to this function.
   * @param args.chainId - An EIP-155 chain ID.
   * @param args.tokenAddresses - Addresses for tokens that live on the chain.
   * @param args.currency - The desired currency of the token prices.
   * @returns The prices for the requested tokens.
   */
  fetchTokenPrices({
    chainId,
    tokenAddresses,
    currency,
  }: {
    chainId: ChainId;
    tokenAddresses: TokenAddress[];
    currency: Currency;
  }): Promise<Partial<TokenPricesByTokenAddress<TokenAddress, Currency>>>;

  /**
   * Fetches the supported chain ids from the price api.
   *
   * @returns The supported chain ids in hexadecimal format.
   */
  fetchSupportedChainIds(): Promise<Hex[]>;

  /**
   * Retrieves exchange rates in the given currency.
   *
   * @param args - The arguments to this function.
   * @param args.baseCurrency - The desired currency of the token prices.
   * @param args.includeUsdRate - Whether to include the USD rate in the response.
   * @param args.cryptocurrencies - The cryptocurrencies to get exchange rates for.
   * @returns The exchange rates in the requested base currency.
   */
  fetchExchangeRates({
    baseCurrency,
    includeUsdRate,
    cryptocurrencies,
  }: {
    baseCurrency: Currency;
    includeUsdRate: boolean;
    cryptocurrencies: string[];
  }): Promise<ExchangeRatesByCurrency<Currency>>;

  /**
   * Type guard for whether the API can return token prices in the given
   * currency.
   *
   * @param currency - The currency to check.
   * @returns True if the API supports the currency, false otherwise.
   */
  validateCurrencySupported(currency: unknown): currency is Currency;
};
