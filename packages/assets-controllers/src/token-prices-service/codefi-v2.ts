import { handleFetch } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { hexToNumber } from '@metamask/utils';

import type {
  AbstractTokenPricesService,
  TokenPrice,
  TokenPricesByTokenContractAddress,
} from './abstract-token-prices-service';

/**
 * The shape of the data that the /spot-prices endpoint returns.
 */
type SpotPricesEndpointData<
  TokenContractAddress extends Hex,
  Currency extends string,
> = Record<TokenContractAddress, Record<Currency, number>>;

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
  // NOTE: This is the wrong chain ID, this should be 0x150
  '0x2107',
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

/**
 * This version of the token prices service uses V2 of the Codefi Price API to
 * fetch token prices.
 */
export const codefiTokenPricesServiceV2: AbstractTokenPricesService<
  SupportedChainId,
  Hex,
  SupportedCurrency
> = {
  /**
   * Retrieves prices in the given currency for the tokens identified by the
   * given contract addresses which are expected to live on the given chain.
   *
   * @param args - The arguments to function.
   * @param args.chainId - An EIP-155 chain ID.
   * @param args.tokenContractAddresses - Contract addresses for tokens that
   * live on the chain.
   * @param args.currency - The desired currency of the token prices.
   * @returns The prices for the requested tokens.
   */
  async fetchTokenPrices({
    chainId,
    tokenContractAddresses,
    currency,
  }: {
    chainId: SupportedChainId;
    tokenContractAddresses: Hex[];
    currency: SupportedCurrency;
  }): Promise<TokenPricesByTokenContractAddress<Hex, SupportedCurrency>> {
    const chainIdAsNumber = hexToNumber(chainId);

    const url = new URL(`${BASE_URL}/chains/${chainIdAsNumber}/spot-prices`);
    url.searchParams.append('tokenAddresses', tokenContractAddresses.join(','));
    url.searchParams.append('vsCurrency', currency);

    const pricesByCurrencyByTokenContractAddress: SpotPricesEndpointData<
      Lowercase<Hex>,
      Lowercase<SupportedCurrency>
    > = await handleFetch(url);

    return tokenContractAddresses.reduce(
      (
        obj: Partial<TokenPricesByTokenContractAddress<Hex, SupportedCurrency>>,
        tokenContractAddress,
      ) => {
        // The Price API lowercases both currency and token addresses, so we have
        // to keep track of them and make sure we return the original versions.
        const lowercasedTokenContractAddress =
          tokenContractAddress.toLowerCase() as Lowercase<Hex>;
        const lowercasedCurrency =
          currency.toLowerCase() as Lowercase<SupportedCurrency>;

        const price =
          pricesByCurrencyByTokenContractAddress[
            lowercasedTokenContractAddress
          ]?.[lowercasedCurrency];

        if (!price) {
          throw new Error(
            `Could not find price for "${tokenContractAddress}" in "${currency}"`,
          );
        }

        const tokenPrice: TokenPrice<Hex, SupportedCurrency> = {
          tokenContractAddress,
          value: price,
          currency,
        };
        return {
          ...obj,
          [tokenContractAddress]: tokenPrice,
        };
      },
      {},
    ) as TokenPricesByTokenContractAddress<Hex, SupportedCurrency>;
  },

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
  },

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
  },
};
