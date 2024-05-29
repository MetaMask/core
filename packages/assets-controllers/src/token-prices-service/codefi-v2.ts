import { handleFetch } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { hexToNumber } from '@metamask/utils';
import {
  circuitBreaker,
  ConsecutiveBreaker,
  ExponentialBackoff,
  handleAll,
  type IPolicy,
  retry,
  wrap,
  CircuitState,
} from 'cockatiel';

import type {
  AbstractTokenPricesService,
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
 * A currency that can be supplied as the `vsCurrency` parameter to
 * the `/spot-prices` endpoint. Covers both uppercase and lowercase versions.
 */
type SupportedCurrency =
  | (typeof SUPPORTED_CURRENCIES)[number]
  | Uppercase<(typeof SUPPORTED_CURRENCIES)[number]>;

/**
 * The list of chain IDs that can be supplied in the URL for the `/spot-prices`
 * endpoint, but in hexadecimal form (for consistency with how we represent
 * chain IDs in other places).
 * @see Used by {@link CodefiTokenPricesServiceV2} to validate that a given chain ID is supported by V2 of the Codefi Price API.
 */
export const SUPPORTED_CHAIN_IDS = [
  // Ethereum Mainnet
  '0x1',
  // OP Mainnet
  '0xa',
  // Cronos Mainnet
  '0x19',
  // BNB Smart Chain Mainnet
  '0x38',
  // Syscoin Mainnet
  '0x39',
  // OKXChain Mainnet
  '0x42',
  // Hoo Smart Chain
  '0x46',
  // Meter Mainnet
  '0x52',
  // TomoChain
  '0x58',
  // Gnosis
  '0x64',
  // Velas EVM Mainnet
  '0x6a',
  // Fuse Mainnet
  '0x7a',
  // Huobi ECO Chain Mainnet
  '0x80',
  // Polygon Mainnet
  '0x89',
  // Fantom Opera
  '0xfa',
  // Boba Network
  '0x120',
  // KCC Mainnet
  '0x141',
  // zkSync Era Mainnet
  '0x144',
  // Theta Mainnet
  '0x169',
  // Metis Andromeda Mainnet
  '0x440',
  // Moonbeam
  '0x504',
  // Moonriver
  '0x505',
  // Base
  '0x2105',
  // Shiden
  '0x150',
  // Smart Bitcoin Cash
  '0x2710',
  // Arbitrum One
  '0xa4b1',
  // Celo Mainnet
  '0xa4ec',
  // Oasis Emerald
  '0xa516',
  // Avalanche C-Chain
  '0xa86a',
  // Polis Mainnet
  '0x518af',
  // Aurora Mainnet
  '0x4e454152',
  // Harmony Mainnet Shard 0
  '0x63564c40',
  // Linea Mainnet
  '0xe708',
] as const;

/**
 * A chain ID that can be supplied in the URL for the `/spot-prices` endpoint,
 * but in hexadecimal form (for consistency with how we represent chain IDs in
 * other places).
 */
type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

/**
 * All requests to V2 of the Price API start with this.
 */
const BASE_URL = 'https://price.api.cx.metamask.io/v2';

const DEFAULT_TOKEN_PRICE_RETRIES = 3;
// Each update attempt will result (1 + retries) calls if the server is down
const DEFAULT_TOKEN_PRICE_MAX_CONSECUTIVE_FAILURES =
  (1 + DEFAULT_TOKEN_PRICE_RETRIES) * 3;

const DEFAULT_DEGRADED_THRESHOLD = 5_000;

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
  implements
    AbstractTokenPricesService<SupportedChainId, Hex, SupportedCurrency>
{
  #tokenPricePolicy: IPolicy;

  /**
   * Construct a Codefi Token Price Service.
   *
   * @param options - Constructor options
   * @param options.degradedThreshold - The threshold between "normal" and "degrated" service,
   * in milliseconds.
   * @param options.retries - Number of retry attempts for each token price update.
   * @param options.maximumConsecutiveFailures - The maximum number of consecutive failures
   * allowed before breaking the circuit and pausing further updates.
   * @param options.onBreak - An event handler for when the circuit breaks, useful for capturing
   * metrics about network failures.
   * @param options.onDegraded - An event handler for when the circuit remains closed, but requests
   * are failing or resolving too slowly (i.e. resolving more slowly than the `degradedThreshold).
   * @param options.circuitBreakDuration - The amount of time to wait when the circuit breaks
   * from too many consecutive failures.
   */
  constructor({
    degradedThreshold = DEFAULT_DEGRADED_THRESHOLD,
    retries = DEFAULT_TOKEN_PRICE_RETRIES,
    maximumConsecutiveFailures = DEFAULT_TOKEN_PRICE_MAX_CONSECUTIVE_FAILURES,
    onBreak,
    onDegraded,
    circuitBreakDuration = 30 * 60 * 1000,
  }: {
    degradedThreshold?: number;
    retries?: number;
    maximumConsecutiveFailures?: number;
    onBreak?: () => void;
    onDegraded?: () => void;
    circuitBreakDuration?: number;
  } = {}) {
    // Construct a policy that will retry each update, and halt further updates
    // for a certain period after too many consecutive failures.
    const retryPolicy = retry(handleAll, {
      maxAttempts: retries,
      backoff: new ExponentialBackoff(),
    });
    const circuitBreakerPolicy = circuitBreaker(handleAll, {
      halfOpenAfter: circuitBreakDuration,
      breaker: new ConsecutiveBreaker(maximumConsecutiveFailures),
    });
    if (onBreak) {
      circuitBreakerPolicy.onBreak(onBreak);
    }
    if (onDegraded) {
      retryPolicy.onGiveUp(() => {
        if (circuitBreakerPolicy.state === CircuitState.Closed) {
          onDegraded();
        }
      });
      retryPolicy.onSuccess(({ duration }) => {
        if (
          circuitBreakerPolicy.state === CircuitState.Closed &&
          duration > degradedThreshold
        ) {
          onDegraded();
        }
      });
    }
    this.#tokenPricePolicy = wrap(retryPolicy, circuitBreakerPolicy);
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
    chainId: SupportedChainId;
    tokenAddresses: Hex[];
    currency: SupportedCurrency;
  }): Promise<Partial<TokenPricesByTokenAddress<Hex, SupportedCurrency>>> {
    const chainIdAsNumber = hexToNumber(chainId);

    const url = new URL(`${BASE_URL}/chains/${chainIdAsNumber}/spot-prices`);
    url.searchParams.append(
      'tokenAddresses',
      [ZERO_ADDRESS, ...tokenAddresses].join(','),
    );
    url.searchParams.append('vsCurrency', currency);
    url.searchParams.append('includeMarketData', 'true');

    const addressCryptoDataMap: MarketDataByTokenAddress =
      await this.#tokenPricePolicy.execute(() =>
        handleFetch(url, { headers: { 'Cache-Control': 'no-cache' } }),
      );

    return [ZERO_ADDRESS, ...tokenAddresses].reduce(
      (
        obj: Partial<TokenPricesByTokenAddress<Hex, SupportedCurrency>>,
        tokenAddress,
      ) => {
        // The Price API lowercases both currency and token addresses, so we have
        // to keep track of them and make sure we return the original versions.
        const lowercasedTokenAddress =
          tokenAddress.toLowerCase() as Lowercase<Hex>;

        const marketData = addressCryptoDataMap[lowercasedTokenAddress];

        if (marketData === undefined) {
          return obj;
        }

        const { price } = marketData;

        const token: TokenPrice<Hex, SupportedCurrency> = {
          tokenAddress,
          value: price,
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
   * Type guard for whether the API can return token prices for the given chain
   * ID.
   *
   * @param chainId - The chain ID to check.
   * @returns True if the API supports the chain ID, false otherwise.
   */
  validateChainIdSupported(chainId: unknown): chainId is SupportedChainId {
    const supportedChainIds: readonly string[] = SUPPORTED_CHAIN_IDS;
    return typeof chainId === 'string' && supportedChainIds.includes(chainId);
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
