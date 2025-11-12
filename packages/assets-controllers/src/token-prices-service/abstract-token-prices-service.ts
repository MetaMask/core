import type { ServicePolicy } from '@metamask/controller-utils';
import type { CaipAssetType, Hex } from '@metamask/utils';

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

// /**
//  * A map of token address to its price.
//  */
// export type TokenPricesByTokenAddress<
//   ChainId extends Hex = Hex,
//   Currency extends string = string,
// > = {
//   [A in Hex]: EvmAssetWithMarketData<ChainId, Currency>;
// };

/**
 * A map of currency to its exchange rate.
 */
export type ExchangeRatesByCurrency<Currency extends string> = {
  [C in Currency]: ExchangeRate;
};

export type EvmAssetAddressWithChain<ChainId extends Hex = Hex> = {
  address: Hex;
  chainId: ChainId;
};

export type EvmAssetWithId<ChainId extends Hex = Hex> =
  EvmAssetAddressWithChain<ChainId> & {
    assetId: CaipAssetType;
  };

export type EvmAssetWithMarketData<
  ChainId extends Hex = Hex,
  Currency extends string = string,
> = EvmAssetWithId<ChainId> & MarketData & { currency: Currency };

/**
 * The shape of the data that the /spot-prices endpoint returns.
 */
export type MarketData = {
  /**
   * The all-time highest price of the token.
   */
  allTimeHigh: number;
  /**
   * The all-time lowest price of the token.
   */
  allTimeLow: number;
  /**
   * The number of tokens currently in circulation.
   */
  circulatingSupply: number;
  /**
   * The market cap calculated using the diluted supply.
   */
  dilutedMarketCap: number;
  /**
   * The highest price of the token in the last 24 hours.
   */
  high1d: number;
  /**
   * The lowest price of the token in the last 24 hours.
   */
  low1d: number;
  /**
   * The current market capitalization of the token.
   */
  marketCap: number;
  /**
   * The percentage change in market capitalization over the last 24 hours.
   */
  marketCapPercentChange1d: number;
  /**
   * The current price of the token.
   */
  price: number;
  /**
   * The absolute change in price over the last 24 hours.
   */
  priceChange1d: number;
  /**
   * The percentage change in price over the last 24 hours.
   */
  pricePercentChange1d: number;
  /**
   * The percentage change in price over the last hour.
   */
  pricePercentChange1h: number;
  /**
   * The percentage change in price over the last year.
   */
  pricePercentChange1y: number;
  /**
   * The percentage change in price over the last 7 days.
   */
  pricePercentChange7d: number;
  /**
   * The percentage change in price over the last 14 days.
   */
  pricePercentChange14d: number;
  /**
   * The percentage change in price over the last 30 days.
   */
  pricePercentChange30d: number;
  /**
   * The percentage change in price over the last 200 days.
   */
  pricePercentChange200d: number;
  /**
   * The total trading volume of the token in the last 24 hours.
   */
  totalVolume: number;
};

/**
 * An ideal token prices service. All implementations must confirm to this
 * interface.
 *
 * @template ChainId - A type union of valid arguments for the `chainId`
 * argument to `fetchTokenPrices`.
 * @template Currency - A type union of valid arguments for the `currency`
 * argument to `fetchTokenPrices`.
 */
export type AbstractTokenPricesService<
  ChainId extends Hex = Hex,
  Currency extends string = string,
> = Partial<Pick<ServicePolicy, 'onBreak' | 'onDegraded'>> & {
  /**
   * Retrieves prices in the given currency for the tokens identified by the
   * given addresses which are expected to live on the given chain.
   *
   * @param args - The arguments to this function.
   * @param args.assets - The assets to get prices for.
   * @param args.currency - The desired currency of the token prices.
   * @returns The prices for the requested tokens.
   */
  fetchTokenPrices({
    assets,
    currency,
  }: {
    assets: EvmAssetAddressWithChain<ChainId>[];
    currency: Currency;
  }): Promise<EvmAssetWithMarketData<ChainId, Currency>[]>;

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
   * Type guard for whether the API can return token prices for the given chain
   * ID.
   *
   * @param chainId - The chain ID to check.
   * @returns True if the API supports the chain ID, false otherwise.
   */
  validateChainIdSupported(chainId: unknown): chainId is ChainId;

  /**
   * Type guard for whether the API can return token prices in the given
   * currency.
   *
   * @param currency - The currency to check.
   * @returns True if the API supports the currency, false otherwise.
   */
  validateCurrencySupported(currency: unknown): currency is Currency;
};
