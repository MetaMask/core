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
} from 'cockatiel';

import type {
  AbstractTokenPricesService,
  TokenPrice,
  TokenPricesByTokenAddress,
} from './abstract-token-prices-service';

/**
 * The shape of the data that the /spot-prices endpoint returns.
 */
type SpotPricesEndpointData<
  TokenAddress extends Hex,
  Currency extends string,
> = Record<TokenAddress, Record<Currency, number>>;

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
 */
export const SUPPORTED_CHAIN_IDS = [
  // Ethereum Mainnet
  '1',
  // OP Mainnet
  '10',
  // Cronos Mainnet
  '25',
  // BNB Smart Chain Mainnet
  '56',
  // Syscoin Mainnet
  '57',
  // OKXChain Mainnet
  '66',
  // Hoo Smart Chain
  '70',
  // Meter Mainnet
  '82',
  // TomoChain
  '88',
  // Gnosis
  '100',
  // Velas EVM Mainnet
  '106',
  // Fuse Mainnet
  '122',
  // Huobi ECO Chain Mainnet
  '128',
  // Polygon Mainnet
  '137',
  // Fantom Opera
  '250',
  // Boba Network
  '288',
  // KCC Mainnet
  '321',
  // zkSync Era Mainnet
  '328',
  // Theta Mainnet
  '361',
  // Metis Andromeda Mainnet
  '1088',
  // Moonbeam
  '1284',
  // Moonriver
  '1285',
  // Base
  '8453',
  // Shiden
  // NOTE: This is the wrong chain ID, this should be '336'
  '336',
  // Smart Bitcoin Cash
  '10000',
  // Arbitrum One
  '42161',
  // Celo Mainnet
  '42220',
  // Oasis Emerald
  '42294',
  // Avalanche C-Chain
  '43114',
  // Polis Mainnet
  '535824',
  // Aurora Mainnet
  '1313161554',
  // Harmony Mainnet Shard 0
  '1666600000',
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
const BASE_URL = 'https://price-api.metafi.codefi.network/v2';

const DEFAULT_TOKEN_PRICE_RETRIES = 3;
// Each update attempt will result (1 + retries) calls if the server is down
const DEFAULT_TOKEN_PRICE_MAX_CONSECUTIVE_FAILURES =
  (1 + DEFAULT_TOKEN_PRICE_RETRIES) * 3;

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
   * @param options.retries - Number of retry attempts for each token price update.
   * @param options.maximumConsecutiveFailures - The maximum number of consecutive failures
   * allowed before breaking the circuit and pausing further updates.
   * @param options.circuitBreakDuration - The amount of time to wait when the circuit breaks
   * from too many consecutive failures.
   */
  constructor({
    retries = DEFAULT_TOKEN_PRICE_RETRIES,
    maximumConsecutiveFailures = DEFAULT_TOKEN_PRICE_MAX_CONSECUTIVE_FAILURES,
    circuitBreakDuration = 30 * 60 * 1000,
  }: {
    retries?: number;
    maximumConsecutiveFailures?: number;
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
  }): Promise<TokenPricesByTokenAddress<Hex, SupportedCurrency>> {
    const url = new URL(`${BASE_URL}/chains/${chainId}/spot-prices`);
    url.searchParams.append('tokenAddresses', tokenAddresses.join(','));
    url.searchParams.append('vsCurrency', currency);

    const pricesByCurrencyByTokenAddress: SpotPricesEndpointData<
      Lowercase<Hex>,
      Lowercase<SupportedCurrency>
    > = await this.#tokenPricePolicy.execute(() => handleFetch(url));

    return tokenAddresses.reduce(
      (
        obj: Partial<TokenPricesByTokenAddress<Hex, SupportedCurrency>>,
        tokenAddress,
      ) => {
        // The Price API lowercases both currency and token addresses, so we have
        // to keep track of them and make sure we return the original versions.
        const lowercasedTokenAddress =
          tokenAddress.toLowerCase() as Lowercase<Hex>;
        const lowercasedCurrency =
          currency.toLowerCase() as Lowercase<SupportedCurrency>;

        const price =
          pricesByCurrencyByTokenAddress[lowercasedTokenAddress]?.[
            lowercasedCurrency
          ];

        if (!price) {
          throw new Error(
            `Could not find price for "${tokenAddress}" in "${currency}"`,
          );
        }

        const tokenPrice: TokenPrice<Hex, SupportedCurrency> = {
          tokenAddress,
          value: price,
          currency,
        };
        return {
          ...obj,
          [tokenAddress]: tokenPrice,
        };
      },
      {},
    ) as TokenPricesByTokenAddress<Hex, SupportedCurrency>;
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
