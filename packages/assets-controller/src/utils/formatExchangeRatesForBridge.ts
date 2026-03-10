import { toChecksumAddress } from '@ethereumjs/util';
import { MAP_CAIP_CURRENCIES } from '@metamask/assets-controllers';
import { KnownCaipNamespace, numberToHex } from '@metamask/utils';
import { parseCaipAssetType, parseCaipChainId } from '@metamask/utils';

import type { AssetPrice, FungibleAssetPrice, Caip19AssetId } from '../types';

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

/**
 * Converts AssetsController state (assetsPrice, selectedCurrency) into the
 * same format the bridge expects from MultichainAssetsRatesController,
 * CurrencyRateController, and TokenRatesController so the bridge can use
 * a single action when useAssetsControllerForRates is true.
 *
 * @param params - Conversion parameters.
 * @param params.assetsPrice - Map of CAIP-19 asset ID to price data (must include both `price` and `usdPrice`).
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

  const currencyCaip = MAP_CAIP_CURRENCIES[selectedCurrency.toLowerCase()];
  if (!currencyCaip) {
    return {
      conversionRates: {},
      currencyRates: {},
      marketData: {},
      currentCurrency: selectedCurrency,
    };
  }

  const fungibleAssetsPrice = Object.entries(assetsPrice).reduce<
    Record<Caip19AssetId, FungibleAssetPrice>
  >((acc, [assetId, priceData]) => {
    if (priceData.assetPriceType === 'fungible') {
      acc[assetId as Caip19AssetId] = priceData;
    }
    return acc;
  }, {});

  for (const [assetId, priceData] of Object.entries(fungibleAssetsPrice)) {
    const { price, usdPrice, lastUpdated } = priceData;
    if (price < 0) {
      continue;
    }

    const lastUpdatedInSeconds = lastUpdated / 1000;
    const expirationOffsetInSeconds = 60;
    const expirationTime = lastUpdatedInSeconds + expirationOffsetInSeconds;

    try {
      const parsed = parseCaipAssetType(assetId as Caip19AssetId);
      const chainIdParsed = parseCaipChainId(parsed.chainId);

      if (chainIdParsed.namespace === KnownCaipNamespace.Eip155) {
        const chainIdHex = numberToHex(parseInt(chainIdParsed.reference, 10));

        const nativeAssetId = nativeAssetIdentifiers[parsed.chainId] as
          | Caip19AssetId
          | undefined;

        const nativeCurrencySymbol =
          networkConfigurationsByChainId[chainIdHex]?.nativeCurrency;

        const nativeAssetUsdPrice =
          nativeAssetId && fungibleAssetsPrice[nativeAssetId]?.usdPrice;

        if (
          !nativeAssetId ||
          !nativeCurrencySymbol ||
          nativeAssetUsdPrice === undefined
        ) {
          // If we do not have a native asset for that chain or a price for it, the asset needs to be skipped
          continue;
        }

        let tokenAddress: string | undefined;
        if (parsed.assetNamespace === 'erc20') {
          tokenAddress = toChecksumAddress(String(parsed.assetReference));
        } else if (parsed.assetNamespace === 'slip44') {
          tokenAddress = '0x0000000000000000000000000000000000000000';
        }

        if (tokenAddress && nativeAssetId) {
          const priceInNative =
            nativeAssetUsdPrice > 0 ? usdPrice / nativeAssetUsdPrice : usdPrice;
          if (!marketData[chainIdHex]) {
            marketData[chainIdHex] = {};
          }
          marketData[chainIdHex][tokenAddress] = {
            ...priceData,
            price: priceInNative,
            currency: nativeCurrencySymbol,
            assetId,
            chainId: chainIdHex,
            tokenAddress,
          };
        }

        if (parsed.assetNamespace === 'slip44' && nativeAssetId) {
          currencyRates[nativeCurrencySymbol] = {
            conversionDate: lastUpdatedInSeconds,
            conversionRate: price,
            usdConversionRate: usdPrice,
          };
        }
      } else {
        conversionRates[assetId] = {
          rate: String(price),
          currency: currencyCaip,
          conversionTime: lastUpdatedInSeconds,
          expirationTime,
          marketData: priceData,
        };
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
