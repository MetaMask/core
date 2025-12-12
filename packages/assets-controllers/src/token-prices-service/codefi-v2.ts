import {
  createServicePolicy,
  DEFAULT_CIRCUIT_BREAK_DURATION,
  DEFAULT_DEGRADED_THRESHOLD,
  DEFAULT_MAX_CONSECUTIVE_FAILURES,
  DEFAULT_MAX_RETRIES,
  handleFetch,
} from '@metamask/controller-utils';
import type { ServicePolicy } from '@metamask/controller-utils';
import type { CaipAssetType, Hex } from '@metamask/utils';
import {
  hexToNumber,
  KnownCaipNamespace,
  toCaipChainId,
} from '@metamask/utils';

import type {
  AbstractTokenPricesService,
  EvmAssetAddressWithChain,
  EvmAssetWithId,
  EvmAssetWithMarketData,
  ExchangeRatesByCurrency,
} from './abstract-token-prices-service';
import type { MarketDataDetails } from '../TokenRatesController';

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
  // Georgian Lari
  'gel',
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
  // Monad
  'mon',
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
  // Colombian Peso
  'cop',
  // Kenyan Shilling
  'kes',
  // Romanian Leu
  'ron',
  // Dominican Peso
  'dop',
  // Costa Rican Colón
  'crc',
  // Honduran Lempira
  'hnl',
  // Zambian Kwacha
  'zmw',
  // Salvadoran Colón
  'svc',
  // Bosnia-Herzegovina Convertible Mark
  'bam',
  // Peruvian Sol
  'pen',
  // Guatemalan Quetzal
  'gtq',
  // Lebanese Pound
  'lbp',
  // Armenian Dram
  'amd',
  // Solana
  'sol',
  // Sei
  'sei',
  // Sonic
  'sonic',
  // Tron
  'trx',
  // Taiko
  'taiko',
  // Pepu
  'pepu',
  // Polygon
  'pol',
  // Mantle
  'mnt',
  // Onomy
  'nom',
  // Avalanche
  'avax',
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
  '0x89': '0x0000000000000000000000000000000000001010', // Polygon
  '0x440': '0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000', // Metis Andromeda
  '0x1388': '0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000', // Mantle
};

/**
 * Returns the address that should be used to query the price api for the
 * chain's native token. On most chains, this is signified by the zero address.
 * But on some chains, the native token has a specific address.
 *
 * @param chainId - The hexadecimal chain id.
 * @returns The address of the chain's native token.
 */
export const getNativeTokenAddress = (chainId: Hex): Hex =>
  chainIdToNativeTokenAddress[chainId] ?? ZERO_ADDRESS;

// Source: https://github.com/consensys-vertical-apps/va-mmcx-price-api/blob/main/src/constants/slip44.ts
// We can only support PricesAPI V3 for EVM chains that have a CAIP-19 native asset mapping.
export const SPOT_PRICES_SUPPORT_INFO = {
  '0x1': 'eip155:1/slip44:60', // Ethereum Mainnet - Native symbol: ETH
  '0xa': 'eip155:10/slip44:60', // OP Mainnet - Native symbol: ETH
  '0x19': 'eip155:25/slip44:394', // Cronos Mainnet - Native symbol: CRO
  '0x38': 'eip155:56/slip44:714', // BNB Smart Chain Mainnet - Native symbol: BNB
  '0x39': 'eip155:57/erc20:0x0000000000000000000000000000000000000000', // 'eip155:57/slip44:57', // Syscoin Mainnet - Native symbol: SYS
  '0x52': null, // 'eip155:82/slip44:18000', // Meter Mainnet - Native symbol: MTR
  '0x58': 'eip155:88/erc20:0x0000000000000000000000000000000000000000', // 'eip155:88/slip44:889', // TomoChain - Native symbol: TOMO
  '0x64': 'eip155:100/slip44:700', // Gnosis (formerly xDAI Chain) - Native symbol: xDAI
  '0x6a': 'eip155:106/erc20:0x0000000000000000000000000000000000000000', // 'eip155:106/slip44:5655640', // Velas EVM Mainnet - Native symbol: VLX
  '0x80': 'eip155:128/erc20:0x0000000000000000000000000000000000000000', // 'eip155:128/slip44:1010', // Huobi ECO Chain Mainnet - Native symbol: HT
  '0x89': 'eip155:137/slip44:966', // Polygon Mainnet - Native symbol: POL
  '0x8f': 'eip155:143/slip44:268435779', // Monad Mainnet - Native symbol: MON
  '0x92': 'eip155:146/slip44:10007', // Sonic Mainnet - Native symbol: S
  '0xfa': 'eip155:250/slip44:1007', // Fantom Opera - Native symbol: FTM
  '0x141': 'eip155:321/erc20:0x0000000000000000000000000000000000000000', // 'eip155:321/slip44:641', // KCC Mainnet - Native symbol: KCS
  '0x144': 'eip155:324/slip44:60', // zkSync Era Mainnet (Ethereum L2) - Native symbol: ETH
  '0x169': 'eip155:361/erc20:0x0000000000000000000000000000000000000000', // 'eip155:361/slip44:589', // Theta Mainnet - Native symbol: TFUEL
  '0x3e7': 'eip155:999/slip44:2457', // HyperEVM - Native symbol: ETH
  '0x440': 'eip155:1088/erc20:0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000', // 'eip155:1088/slip44:XXX', // Metis Andromeda Mainnet (Ethereum L2) - Native symbol: METIS
  '0x44d': 'eip155:1101/slip44:60', // Polygon zkEVM mainnet - Native symbol: ETH
  '0x504': 'eip155:1284/slip44:1284', // Moonbeam - Native symbol: GLMR
  '0x505': 'eip155:1285/slip44:1285', // Moonriver - Native symbol: MOVR
  '0x531': 'eip155:1329/slip44:19000118', // Sei Mainnet - Native symbol: SEI
  '0x1388': 'eip155:5000/erc20:0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000', // 'eip155:5000/slip44:XXX', // Mantle - Native symbol: MNT
  '0x2105': 'eip155:8453/slip44:60', // Base - Native symbol: ETH
  '0x2710': 'eip155:10000/erc20:0x0000000000000000000000000000000000000000', // 'eip155:10000/slip44:145', // Smart Bitcoin Cash - Native symbol: BCH
  '0xa4b1': 'eip155:42161/slip44:60', // Arbitrum One - Native symbol: ETH
  '0xa4ec': 'eip155:42220/slip44:52752', // Celo Mainnet - Native symbol: CELO
  '0xa516': 'eip155:42262/erc20:0x0000000000000000000000000000000000000000', // 'eip155:42262/slip44:474', // Oasis Emerald - Native symbol: ROSE
  '0xa729': 'eip155:42793/erc20:0x0000000000000000000000000000000000000000', // Etherlink - Native symbol: XTZ (Tezos L2)
  '0xa86a': 'eip155:43114/slip44:9005', // Avalanche C-Chain - Native symbol: AVAX
  '0xe708': 'eip155:59144/slip44:60', // Linea Mainnet - Native symbol: ETH
  '0x10b3e': 'eip155:68414/erc20:0x0000000000000000000000000000000000000000', // MapleStory Universe, no Coingecko info
  '0x13c31': 'eip155:81457/erc20:0x0000000000000000000000000000000000000000', // 'eip155:81457/slip44:60', // Blast Mainnet - Native symbol: ETH
  '0x17dcd': 'eip155:97741/erc20:0x0000000000000000000000000000000000000000', // 'eip155:97741/slip44:XXX', // Pepe Unchained Mainnet - Native symbol: PEPU
  '0x518af': null, // 'eip155:333999/slip44:1997', // Polis Mainnet - Native symbol: POLIS
  '0x82750': 'eip155:534352/slip44:60', // Scroll Mainnet - Native symbol: ETH
  '0x4e454152': 'eip155:60/slip44:60', // Aurora Mainnet (Ethereum L2 on NEAR) - Native symbol: ETH
  '0x63564c40': 'eip155:1666600000/slip44:1023', // Harmony Mainnet Shard 0 - Native symbol: ONE
} as const;

// MISSING CHAINS WITH NO NATIVE ASSET PRICES IN V2
// '0x42': 'eip155:66/slip44:996', // OKXChain Mainnet - Native symbol: OKT
// '0x46': 'eip155:70/slip44:1170', // Hoo Smart Chain - Native symbol: HOO
// '0x7a': 'eip155:122/slip44:XXX', // Fuse Mainnet - Native symbol: FUSE
// '0x120': 'eip155:288/slip44:60', // Boba Network (Ethereum L2) - Native symbol: ETH
// '0x150': 'eip155:336/slip44:809', // Shiden - Native symbol: SDN
// '0x28c58': 'eip155:167000/slip44:60', // Taiko Mainnet - Native symbol: ETH

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
 *
 * @see Used by {@link CodefiTokenPricesServiceV2} to validate that a given chain ID is supported by V2 of the Codefi Price API.
 */
export const SUPPORTED_CHAIN_IDS = Object.keys(
  SPOT_PRICES_SUPPORT_INFO,
) as (keyof typeof SPOT_PRICES_SUPPORT_INFO)[];

/**
 * A chain ID that can be supplied in the URL for the `/spot-prices` endpoint,
 * but in hexadecimal form (for consistency with how we represent chain IDs in
 * other places).
 */
type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

/**
 * The list of chain IDs that are supported by V3 of the Codefi Price API.
 * Only includes chain IDs from SPOT_PRICES_SUPPORT_INFO that have a non-null CAIP-19 value.
 */
const SUPPORTED_CHAIN_IDS_V3 = Object.keys(SPOT_PRICES_SUPPORT_INFO).filter(
  (chainId) =>
    SPOT_PRICES_SUPPORT_INFO[
      chainId as keyof typeof SPOT_PRICES_SUPPORT_INFO
    ] !== null,
);

const BASE_URL_V1 = 'https://price.api.cx.metamask.io/v1';

const BASE_URL_V2 = 'https://price.api.cx.metamask.io/v2';

const BASE_URL_V3 = 'https://price.api.cx.metamask.io/v3';

/**
 * This version of the token prices service uses V2 of the Codefi Price API to
 * fetch token prices.
 */
export class CodefiTokenPricesServiceV2
  implements AbstractTokenPricesService<SupportedChainId, SupportedCurrency>
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
   * @param args.assets - The assets to get prices for.
   * @param args.currency - The desired currency of the token prices.
   * @returns The prices for the requested tokens.
   */
  async fetchTokenPrices({
    assets,
    currency,
  }: {
    assets: EvmAssetAddressWithChain<SupportedChainId>[];
    currency: SupportedCurrency;
  }): Promise<EvmAssetWithMarketData<SupportedChainId, SupportedCurrency>[]> {
    const v3Assets = await this.#fetchTokenPricesV3(assets, currency);
    const v2Assets = await this.#fetchTokenPricesV2(assets, currency);

    return [...v3Assets, ...v2Assets];
  }

  async #fetchTokenPricesV3(
    assets: EvmAssetAddressWithChain<SupportedChainId>[],
    currency: SupportedCurrency,
  ): Promise<EvmAssetWithMarketData<SupportedChainId, SupportedCurrency>[]> {
    const assetsWithIds: EvmAssetWithId<SupportedChainId>[] = assets
      // Filter out assets that are not supported by V3 of the Price API.
      .filter((asset) => SUPPORTED_CHAIN_IDS_V3.includes(asset.chainId))
      .map((asset) => {
        const caipChainId = toCaipChainId(
          KnownCaipNamespace.Eip155,
          hexToNumber(asset.chainId).toString(),
        );

        const nativeAddress = getNativeTokenAddress(asset.chainId);

        return {
          ...asset,
          assetId: (nativeAddress.toLowerCase() ===
          asset.tokenAddress.toLowerCase()
            ? SPOT_PRICES_SUPPORT_INFO[asset.chainId]
            : `${caipChainId}/erc20:${asset.tokenAddress.toLowerCase()}`) as CaipAssetType,
        };
      })
      .filter((asset) => asset.assetId);

    if (assetsWithIds.length === 0) {
      return [];
    }

    const url = new URL(`${BASE_URL_V3}/spot-prices`);
    url.searchParams.append(
      'assetIds',
      assetsWithIds.map((asset) => asset.assetId).join(','),
    );
    url.searchParams.append('vsCurrency', currency);
    url.searchParams.append('includeMarketData', 'true');

    const addressCryptoDataMap: {
      [assetId: CaipAssetType]: Omit<
        MarketDataDetails,
        'currency' | 'tokenAddress'
      >;
    } = await this.#policy.execute(() =>
      handleFetch(url, { headers: { 'Cache-Control': 'no-cache' } }),
    );

    return assetsWithIds
      .map((assetWithId) => {
        const marketData = addressCryptoDataMap[assetWithId.assetId];

        if (!marketData) {
          return undefined;
        }

        return {
          ...marketData,
          ...assetWithId,
          currency,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }

  async #fetchTokenPricesV2(
    assets: EvmAssetAddressWithChain<SupportedChainId>[],
    currency: SupportedCurrency,
  ): Promise<EvmAssetWithMarketData<SupportedChainId, SupportedCurrency>[]> {
    const v2SupportedAssets = assets.filter(
      (asset) => !SUPPORTED_CHAIN_IDS_V3.includes(asset.chainId),
    );

    const assetsByChainId: Record<SupportedChainId, Hex[]> =
      v2SupportedAssets.reduce(
        (acc, { chainId, tokenAddress }) => {
          (acc[chainId] ??= []).push(tokenAddress);
          return acc;
        },
        {} as Record<SupportedChainId, Hex[]>,
      );

    const promises = Object.entries(assetsByChainId).map(
      async ([chainId, tokenAddresses]) => {
        if (tokenAddresses.length === 0) {
          return [];
        }

        const url = new URL(`${BASE_URL_V2}/chains/${chainId}/spot-prices`);
        url.searchParams.append('tokenAddresses', tokenAddresses.join(','));
        url.searchParams.append('vsCurrency', currency);
        url.searchParams.append('includeMarketData', 'true');

        const addressCryptoDataMap: {
          [tokenAddress: string]: Omit<
            MarketDataDetails,
            'currency' | 'tokenAddress'
          >;
        } = await this.#policy.execute(() =>
          handleFetch(url, { headers: { 'Cache-Control': 'no-cache' } }),
        );

        return tokenAddresses
          .map((tokenAddress) => {
            const marketData = addressCryptoDataMap[tokenAddress.toLowerCase()];

            if (!marketData) {
              return undefined;
            }

            return {
              ...marketData,
              tokenAddress,
              chainId: chainId as SupportedChainId,
              currency,
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> =>
            Boolean(entry),
          );
      },
    );

    return await Promise.allSettled(promises).then((results) =>
      results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value : [],
      ),
    );
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
