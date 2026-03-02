import { toChecksumAddress } from '@ethereumjs/util';
import { MAP_CAIP_CURRENCIES } from '@metamask/assets-controllers';
import { numberToHex } from '@metamask/utils';
import { parseCaipAssetType, parseCaipChainId } from '@metamask/utils';

import type { AssetPrice, Caip19AssetId } from '../types';

/**
 * Bridge-compatible conversion rate entry (MultichainAssetsRatesController shape).
 */
export type BridgeConversionRateEntry = {
  rate: string;
  currency?: string;
  conversionTime?: number;
  expirationTime?: number;
  marketData?: Record<string, unknown>;
};

/**
 * Bridge-compatible currency rate entry (CurrencyRateController shape).
 */
export type BridgeCurrencyRateEntry = {
  conversionDate: number;
  conversionRate: number;
  usdConversionRate: number;
};

/**
 * Bridge-compatible market data entry (TokenRatesController marketData shape).
 */
export type BridgeMarketDataEntry = {
  price: number;
  currency: string;
  assetId?: string;
  chainId?: string;
  tokenAddress?: string;
  [key: string]: unknown;
};

/**
 * Exchange rates in the format expected by the bridge controller:
 * conversionRates (MultichainAssetsRatesController) + currencyRates (CurrencyRateController)
 * + marketData (TokenRatesController) + currentCurrency.
 */
export type BridgeExchangeRatesFormat = {
  conversionRates: Record<string, BridgeConversionRateEntry>;
  currencyRates: Record<string, BridgeCurrencyRateEntry>;
  marketData: Record<string, Record<string, BridgeMarketDataEntry>>;
  currentCurrency: string;
};

function getPriceNumber(price: AssetPrice): number {
  return typeof price === 'object' && price !== null && 'price' in price
    ? Number((price as { price: number }).price)
    : Number.NaN;
}

/**
 * Converts AssetsController state (assetsPrice, selectedCurrency) into the
 * same format the bridge expects from MultichainAssetsRatesController,
 * CurrencyRateController, and TokenRatesController so the bridge can use
 * a single action when useAssetsControllerForRates is true.
 *
 * @param params - Conversion parameters.
 * @param params.assetsPrice - Map of CAIP-19 asset ID to price data.
 * @param params.selectedCurrency - ISO 4217 currency code (e.g. 'usd').
 * @param params.nativeAssetIdentifiers - Optional map of CAIP-2 chain ID to native asset ID (e.g. from NetworkEnablementController state). When provided, used for EVM native lookups.
 * @param params.networkConfigurationsByChainId - Optional map of Hex chain ID to network config (e.g. from NetworkController state). Used to resolve native currency symbol via `nativeCurrency`; keys are Hex (e.g. '0x1').
 * @returns Bridge-compatible conversionRates, currencyRates, marketData, currentCurrency.
 */
export function formatExchangeRatesForBridge(params: {
  assetsPrice: Record<string, AssetPrice>;
  selectedCurrency: string;
  nativeAssetIdentifiers?: Record<string, string>;
  networkConfigurationsByChainId?: Record<string, { nativeCurrency?: string }>;
}): BridgeExchangeRatesFormat {
  const {
    assetsPrice,
    selectedCurrency,
    nativeAssetIdentifiers = {},
    networkConfigurationsByChainId = {},
  } = params;
  const conversionRates: Record<string, BridgeConversionRateEntry> = {};
  const currencyRates: Record<string, BridgeCurrencyRateEntry> = {};
  const marketData: Record<string, Record<string, BridgeMarketDataEntry>> = {};

  // Same as MultichainAssetsRatesController: resolve CAIP currency from selectedCurrency, default to USD
  const currencyCaip =
    MAP_CAIP_CURRENCIES[selectedCurrency.toLowerCase()] ??
    MAP_CAIP_CURRENCIES.usd;

  const expirationOffset = 60;

  for (const [assetId, priceData] of Object.entries(assetsPrice)) {
    const price = getPriceNumber(priceData);
    if (Number.isNaN(price) || price < 0) {
      continue;
    }

    const lastUpdated =
      typeof priceData === 'object' &&
      priceData !== null &&
      'lastUpdated' in priceData
        ? Number((priceData as { lastUpdated: number }).lastUpdated)
        : Date.now();
    const conversionTime =
      lastUpdated > 1e12 ? lastUpdated / 1000 : lastUpdated;
    const expirationTime = conversionTime + expirationOffset;

    try {
      const parsed = parseCaipAssetType(assetId as Caip19AssetId);
      const chainIdParsed = parseCaipChainId(parsed.chainId);
      const chainRef = chainIdParsed.reference;

      // conversionRates: only non-EVM assets (bridge uses this for non-EVM chains)
      if (chainIdParsed.namespace !== 'eip155') {
        conversionRates[assetId] = {
          rate: String(price),
          currency: currencyCaip,
          conversionTime,
          expirationTime,
          marketData:
            typeof priceData === 'object' && priceData !== null
              ? (priceData as Record<string, unknown>)
              : undefined,
        };
      }

      if (chainIdParsed.namespace === 'eip155') {
        const chainIdHex = numberToHex(parseInt(chainRef, 10));
        const nativeAssetId = nativeAssetIdentifiers[parsed.chainId] ?? null;
        const symbol =
          networkConfigurationsByChainId[chainIdHex]?.nativeCurrency ?? 'ETH';
        const nativePrice =
          nativeAssetId && assetsPrice[nativeAssetId]
            ? getPriceNumber(assetsPrice[nativeAssetId])
            : Number.NaN;

        let tokenAddress: string | null = null;
        if (parsed.assetNamespace === 'erc20') {
          tokenAddress = toChecksumAddress(String(parsed.assetReference));
        } else if (parsed.assetNamespace === 'slip44') {
          tokenAddress = '0x0000000000000000000000000000000000000000';
        }

        if (tokenAddress && nativeAssetId) {
          const priceInNative =
            !Number.isNaN(nativePrice) && nativePrice > 0
              ? price / nativePrice
              : price;
          if (!marketData[chainIdHex]) {
            marketData[chainIdHex] = {};
          }
          const baseMarketData =
            typeof priceData === 'object' && priceData !== null
              ? (priceData as Record<string, unknown>)
              : {};
          marketData[chainIdHex][tokenAddress] = {
            ...baseMarketData,
            price: priceInNative,
            currency: symbol,
            assetId,
            chainId: chainIdHex,
            tokenAddress,
          };
        }

        if (parsed.assetNamespace === 'slip44' && nativeAssetId) {
          currencyRates[symbol] = {
            conversionDate: conversionTime,
            conversionRate: price,
            usdConversionRate: price,
          };
        }
      }
    } catch {
      // Skip malformed asset IDs
    }
  }

  return {
    conversionRates,
    currencyRates,
    marketData,
    currentCurrency: selectedCurrency,
  };
}
