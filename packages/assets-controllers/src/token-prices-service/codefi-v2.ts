import {
  createServicePolicy,
  DEFAULT_CIRCUIT_BREAK_DURATION,
  DEFAULT_DEGRADED_THRESHOLD,
  DEFAULT_MAX_CONSECUTIVE_FAILURES,
  DEFAULT_MAX_RETRIES,
  handleFetch,
  toHex,
} from '@metamask/controller-utils';
import type { ServicePolicy } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { hexToNumber } from '@metamask/utils';

import type {
  AbstractTokenPricesService,
  ExchangeRatesByCurrency,
  TokenPrice,
  TokenPricesByTokenAddress,
} from './abstract-token-prices-service';

/**
 * The list of currencies that can be supplied as the `vsCurrency` parameter to
 * the `/spot-prices` endpoint, in lowercase form.
 */
export const SUPPORTED_CURRENCIES = [
  // Bitcoin
  'btc',
  // Ether
  'eth',
  // Litecoin
  'ltc',
  // Bitcoin Cash
  'bch',
  // Binance Coin
  'bnb',
  // EOS
  'eos',
  // XRP
  'xrp',
  // Lumens
  'xlm',
  // Chainlink
  'link',
  // Polkadot
  'dot',
  // Yearn.finance
  'yfi',
  // US Dollar
  'usd',
  // United Arab Emirates Dirham
  'aed',
  // Argentine Peso
  'ars',
  // Australian Dollar
  'aud',
  // Bangladeshi Taka
  'bdt',
  // Bahraini Dinar
  'bhd',
  // Bermudian Dollar
  'bmd',
  // Brazil Real
  'brl',
  // Canadian Dollar
  'cad',
  // Swiss Franc
  'chf',
  // Chilean Peso
  'clp',
  // Chinese Yuan
  'cny',
  // Czech Koruna
  'czk',
  // Danish Krone
  'dkk',
  // Euro
  'eur',
  // British Pound Sterling
  'gbp',
  // Hong Kong Dollar
  'hkd',
  // Hungarian Forint
  'huf',
  // Indonesian Rupiah
  'idr',
  // Israeli New Shekel
  'ils',
  // Indian Rupee
  'inr',
  // Japanese Yen
  'jpy',
  // South Korean Won
  'krw',
  // Kuwaiti Dinar
  'kwd',
  // Sri Lankan Rupee
  'lkr',
  // Burmese Kyat
  'mmk',
  // Mexican Peso
  'mxn',
  // Malaysian Ringgit
  'myr',
  // Nigerian Naira
  'ngn',
  // Norwegian Krone
  'nok',
  // New Zealand Dollar
  'nzd',
  // Philippine Peso
  'php',
  // Pakistani Rupee
  'pkr',
  // Polish Zloty
  'pln',
  // Russian Ruble
  'rub',
  // Saudi Riyal
  'sar',
  // Swedish Krona
  'sek',
  // Singapore Dollar
  'sgd',
  // Thai Baht
  'thb',
  // Turkish Lira
  'try',
  // New Taiwan Dollar
  'twd',
  // Ukrainian hryvnia
  'uah',
  // Venezuelan bolívar fuerte
  'vef',
  // Vietnamese đồng
  'vnd',
  // South African Rand
  'zar',
  // IMF Special Drawing Rights
  'xdr',
  // Silver - Troy Ounce
  'xag',
  // Gold - Troy Ounce
  'xau',
  // Bits
  'bits',
  // Satoshi
  'sats',
] as const;

/**
 * Represents the zero address, commonly used as a placeholder in blockchain transactions.
 * In the context of fetching market data, the zero address is utilized to retrieve information
 * specifically for native currencies. This allows for a standardized approach to query market
 * data for blockchain-native assets without a specific contract address.
 */
export const ZERO_ADDRESS: Hex =
  '0x0000000000000000000000000000000000000000' as const;

/**
 * A mapping from chain id to the address of the chain's native token.
 * Only for chains whose native tokens have a specific address.
 */
const chainIdToNativeTokenAddress: Record<Hex, Hex> = {
  '0x89': '0x0000000000000000000000000000000000001010',
};

/**
 * Returns the address that should be used to query the price api for the
 * chain's native token. On most chains, this is signified by the zero address.
 * But on some chains, the native token has a specific address.
 * @param chainId - The hexadecimal chain id.
 * @returns The address of the chain's native token.
 */
export const getNativeTokenAddress = (chainId: Hex): Hex =>
  chainIdToNativeTokenAddress[chainId] ?? ZERO_ADDRESS;

/**
 * A currency that can be supplied as the `vsCurrency` parameter to
 * the `/spot-prices` endpoint. Covers both uppercase and lowercase versions.
 */
type SupportedCurrency =
  | (typeof SUPPORTED_CURRENCIES)[number]
  | Uppercase<(typeof SUPPORTED_CURRENCIES)[number]>;

/**
 * All requests to V2 of the Price API start with this.
 */
const BASE_URL = 'https://price.api.cx.metamask.io/v2';

/**
 * All requests to V1 of the Price API start with this.
 */
const BASE_URL_V1 = 'https://price.api.cx.metamask.io/v1';

/**
 * The shape of the data that the /spot-prices endpoint returns.
 */
type MarketData = {
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

type MarketDataByTokenAddress = { [address: Hex]: MarketData };
/**
 * This version of the token prices service uses V2 of the Codefi Price API to
 * fetch token prices.
 */
export class CodefiTokenPricesServiceV2
  implements AbstractTokenPricesService<Hex, Hex, SupportedCurrency>
{
  readonly #policy: ServicePolicy;

  /**
   * Construct a Codefi Token Price Service.
   *
   * @param args - The arguments.
   * @param args.degradedThreshold - The length of time (in milliseconds)
   * that governs when the service is regarded as degraded (affecting when
   * `onDegraded` is called). Defaults to 5 seconds.
   * @param args.retries - Number of retry attempts for each fetch request.
   * @param args.maximumConsecutiveFailures - The maximum number of consecutive
   * failures allowed before breaking the circuit and pausing further updates.
   * @param args.circuitBreakDuration - The amount of time to wait when the
   * circuit breaks from too many consecutive failures.
   */
  constructor(args?: {
    degradedThreshold?: number;
    retries?: number;
    maximumConsecutiveFailures?: number;
    circuitBreakDuration?: number;
  });

  /**
   * Construct a Codefi Token Price Service.
   *
   * @deprecated This signature is deprecated; please use the `onBreak` and
   * `onDegraded` methods instead.
   * @param args - The arguments.
   * @param args.degradedThreshold - The length of time (in milliseconds)
   * that governs when the service is regarded as degraded (affecting when
   * `onDegraded` is called). Defaults to 5 seconds.
   * @param args.retries - Number of retry attempts for each fetch request.
   * @param args.maximumConsecutiveFailures - The maximum number of consecutive
   * failures allowed before breaking the circuit and pausing further updates.
   * @param args.onBreak - Callback for when the circuit breaks, useful
   * for capturing metrics about network failures.
   * @param args.onDegraded - Callback for when the API responds successfully
   * but takes too long to respond (5 seconds or more).
   * @param args.circuitBreakDuration - The amount of time to wait when the
   * circuit breaks from too many consecutive failures.
   */
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  constructor(args?: {
    degradedThreshold?: number;
    retries?: number;
    maximumConsecutiveFailures?: number;
    onBreak?: () => void;
    onDegraded?: () => void;
    circuitBreakDuration?: number;
  });

  constructor({
    degradedThreshold = DEFAULT_DEGRADED_THRESHOLD,
    retries = DEFAULT_MAX_RETRIES,
    maximumConsecutiveFailures = DEFAULT_MAX_CONSECUTIVE_FAILURES,
    onBreak,
    onDegraded,
    circuitBreakDuration = DEFAULT_CIRCUIT_BREAK_DURATION,
  }: {
    degradedThreshold?: number;
    retries?: number;
    maximumConsecutiveFailures?: number;
    onBreak?: () => void;
    onDegraded?: () => void;
    circuitBreakDuration?: number;
  } = {}) {
    this.#policy = createServicePolicy({
      maxRetries: retries,
      maxConsecutiveFailures: maximumConsecutiveFailures,
      circuitBreakDuration,
      degradedThreshold,
    });
    if (onBreak) {
      this.#policy.onBreak(onBreak);
    }
    if (onDegraded) {
      this.#policy.onDegraded(onDegraded);
    }
  }

  /**
   * Listens for when the request to the API fails too many times in a row.
   *
   * @param args - The same arguments that {@link ServicePolicy.onBreak}
   * takes.
   * @returns What {@link ServicePolicy.onBreak} returns.
   */
  onBreak(...args: Parameters<ServicePolicy['onBreak']>) {
    return this.#policy.onBreak(...args);
  }

  /**
   * Listens for when the API is degraded.
   *
   * @param args - The same arguments that {@link ServicePolicy.onDegraded}
   * takes.
   * @returns What {@link ServicePolicy.onDegraded} returns.
   */
  onDegraded(...args: Parameters<ServicePolicy['onDegraded']>) {
    return this.#policy.onDegraded(...args);
  }

  /**
   * Retrieves prices in the given currency for the tokens identified by the
   * given addresses which are expected to live on the given chain.
   *
   * @param args - The arguments to function.
   * @param args.chainId - An EIP-155 chain ID.
   * @param args.tokenAddresses - Addresses for tokens that live on the chain.
   * @param args.currency - The desired currency of the token prices.
   * @returns The prices for the requested tokens.
   */
  async fetchTokenPrices({
    chainId,
    tokenAddresses,
    currency,
  }: {
    chainId: Hex;
    tokenAddresses: Hex[];
    currency: SupportedCurrency;
  }): Promise<Partial<TokenPricesByTokenAddress<Hex, SupportedCurrency>>> {
    const chainIdAsNumber = hexToNumber(chainId);

    const url = new URL(`${BASE_URL}/chains/${chainIdAsNumber}/spot-prices`);
    url.searchParams.append(
      'tokenAddresses',
      [getNativeTokenAddress(chainId), ...tokenAddresses].join(','),
    );
    url.searchParams.append('vsCurrency', currency);
    url.searchParams.append('includeMarketData', 'true');

    const addressCryptoDataMap: MarketDataByTokenAddress =
      await this.#policy.execute(() =>
        handleFetch(url, { headers: { 'Cache-Control': 'no-cache' } }),
      );

    return [getNativeTokenAddress(chainId), ...tokenAddresses].reduce(
      (
        obj: Partial<TokenPricesByTokenAddress<Hex, SupportedCurrency>>,
        tokenAddress,
      ) => {
        // The Price API lowercases both currency and token addresses, so we have
        // to keep track of them and make sure we return the original versions.
        const lowercasedTokenAddress =
          tokenAddress.toLowerCase() as Lowercase<Hex>;

        const marketData = addressCryptoDataMap[lowercasedTokenAddress];

        if (!marketData) {
          return obj;
        }

        const token: TokenPrice<Hex, SupportedCurrency> = {
          tokenAddress,
          currency,
          ...marketData,
        };

        return {
          ...obj,
          [tokenAddress]: token,
        };
      },
      {},
    ) as Partial<TokenPricesByTokenAddress<Hex, SupportedCurrency>>;
  }

  /**
   * Retrieves exchange rates in the given base currency.
   *
   * @param args - The arguments to this function.
   * @param args.baseCurrency - The desired base currency of the exchange rates.
   * @param args.includeUsdRate - Whether to include the USD rate in the response.
   * @param args.cryptocurrencies - The cryptocurrencies to get exchange rates for.
   * @returns The exchange rates for the requested base currency.
   */
  async fetchExchangeRates({
    baseCurrency,
    includeUsdRate,
    cryptocurrencies,
  }: {
    baseCurrency: SupportedCurrency;
    includeUsdRate: boolean;
    cryptocurrencies: string[];
  }): Promise<ExchangeRatesByCurrency<SupportedCurrency>> {
    const url = new URL(`${BASE_URL_V1}/exchange-rates`);
    url.searchParams.append('baseCurrency', baseCurrency);

    const urlUsd = new URL(`${BASE_URL_V1}/exchange-rates`);
    urlUsd.searchParams.append('baseCurrency', 'usd');

    const [exchangeRatesResult, exchangeRatesResultUsd] =
      await Promise.allSettled([
        this.#policy.execute(() =>
          handleFetch(url, { headers: { 'Cache-Control': 'no-cache' } }),
        ),
        ...(includeUsdRate && baseCurrency.toLowerCase() !== 'usd'
          ? [
              this.#policy.execute(() =>
                handleFetch(urlUsd, {
                  headers: { 'Cache-Control': 'no-cache' },
                }),
              ),
            ]
          : []),
      ]);

    // Handle resolved/rejected
    const exchangeRates =
      exchangeRatesResult.status === 'fulfilled'
        ? exchangeRatesResult.value
        : {};
    const exchangeRatesUsd =
      exchangeRatesResultUsd?.status === 'fulfilled'
        ? exchangeRatesResultUsd.value
        : {};

    if (exchangeRatesResult.status === 'rejected') {
      throw new Error('Failed to fetch');
    }

    const filteredExchangeRates = cryptocurrencies.reduce((acc, key) => {
      if (exchangeRates[key.toLowerCase() as SupportedCurrency]) {
        acc[key.toLowerCase() as SupportedCurrency] =
          exchangeRates[key.toLowerCase() as SupportedCurrency];
      }
      return acc;
    }, {} as ExchangeRatesByCurrency<SupportedCurrency>);

    if (Object.keys(filteredExchangeRates).length === 0) {
      throw new Error(
        'None of the cryptocurrencies are supported by price api',
      );
    }

    const filteredUsdExchangeRates = cryptocurrencies.reduce((acc, key) => {
      if (exchangeRatesUsd[key.toLowerCase() as SupportedCurrency]) {
        acc[key.toLowerCase() as SupportedCurrency] =
          exchangeRatesUsd[key.toLowerCase() as SupportedCurrency];
      }
      return acc;
    }, {} as ExchangeRatesByCurrency<SupportedCurrency>);

    if (baseCurrency.toLowerCase() === 'usd') {
      Object.keys(filteredExchangeRates).forEach((key) => {
        filteredExchangeRates[key as SupportedCurrency] = {
          ...filteredExchangeRates[key as SupportedCurrency],
          usd: filteredExchangeRates[key as SupportedCurrency]?.value,
        };
      });
      return filteredExchangeRates;
    }
    if (!includeUsdRate) {
      return filteredExchangeRates;
    }

    const merged = Object.keys(filteredExchangeRates).reduce((acc, key) => {
      acc[key as SupportedCurrency] = {
        ...filteredExchangeRates[key as SupportedCurrency],
        ...(filteredUsdExchangeRates[key as SupportedCurrency]?.value
          ? { usd: filteredUsdExchangeRates[key as SupportedCurrency]?.value }
          : {}),
      };
      return acc;
    }, {} as ExchangeRatesByCurrency<SupportedCurrency>);

    return merged;
  }

  /**
   * Type guard for whether the API can return token prices for the given chain
   * ID.
   *
   * @returns The supported chain ids in hexadecimal format.
   */
  async fetchSupportedChainIds(): Promise<Hex[]> {
    const url = new URL(`${BASE_URL_V1}/supportedNetworks`);
    const response = await handleFetch(url);
    const supportedChainIds = response.fullSupport.concat(
      response.partialSupport.spotPricesV2,
    );
    return supportedChainIds.map((chainId: number) => toHex(chainId));
  }

  /**
   * Type guard for whether the API can return token prices in the given
   * currency.
   *
   * @param currency - The currency to check. If a string, can be either
   * lowercase or uppercase.
   * @returns True if the API supports the currency, false otherwise.
   */
  validateCurrencySupported(currency: unknown): currency is SupportedCurrency {
    const supportedCurrencies: readonly string[] = SUPPORTED_CURRENCIES;
    return (
      typeof currency === 'string' &&
      supportedCurrencies.includes(currency.toLowerCase())
    );
  }
}
