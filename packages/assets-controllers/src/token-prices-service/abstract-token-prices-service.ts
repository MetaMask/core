import type { ServicePolicy } from '@metamask/controller-utils';
import type { CaipAssetType, Hex } from '@metamask/utils';

import type { MarketDataDetails } from '../TokenRatesController';

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
 * A map of currency to its exchange rate.
 */
export type ExchangeRatesByCurrency<Currency extends string> = {
  [C in Currency]: ExchangeRate;
};

export type EvmAssetAddressWithChain<ChainId extends Hex = Hex> = {
  tokenAddress: Hex;
  chainId: ChainId;
};

export type EvmAssetWithId<ChainId extends Hex = Hex> =
  EvmAssetAddressWithChain<ChainId> & {
    assetId: CaipAssetType;
  };

export type EvmAssetWithMarketData<
  ChainId extends Hex = Hex,
  Currency extends string = string,
> = EvmAssetAddressWithChain<ChainId> &
  MarketDataDetails & { currency: Currency };

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
