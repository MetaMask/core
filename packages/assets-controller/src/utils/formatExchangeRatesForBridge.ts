import { toChecksumAddress } from '@ethereumjs/util';
import {
  CurrencyRateState,
  MAP_CAIP_CURRENCIES,
  MarketDataDetails,
  MultichainAssetsRatesControllerState,
  TokenRatesControllerState,
  getNativeTokenAddress,
} from '@metamask/assets-controllers';
import { Hex, KnownCaipNamespace, numberToHex } from '@metamask/utils';
import { parseCaipAssetType, parseCaipChainId } from '@metamask/utils';
import { isEqual } from 'lodash';

import type {
  AssetMetadata,
  AssetPrice,
  FungibleAssetPrice,
  Caip19AssetId,
} from '../types';

/**
 * Exchange rates in the format expected by the bridge controller:
 * conversionRates (MultichainAssetsRatesController) + currencyRates (CurrencyRateController)
 * + marketData (TokenRatesController) + currentCurrency.
 */
export type BridgeExchangeRatesFormat = {
  conversionRates: MultichainAssetsRatesControllerState['conversionRates'];
  currencyRates: CurrencyRateState['currencyRates'];
  marketData: TokenRatesControllerState['marketData'];
  currentCurrency: string;
};

/** Parameters accepted by {@link formatExchangeRatesForBridge}. */
export type FormatExchangeRatesForBridgeParams = {
  assetsInfo: Record<string, AssetMetadata>;
  assetsPrice: Record<string, AssetPrice>;
  selectedCurrency: string;
  nativeAssetIdentifiers: Record<string, string>;
  networkConfigurationsByChainId?: Record<string, { nativeCurrency?: string }>;
};

let lastCall: {
  params: FormatExchangeRatesForBridgeParams;
  result: BridgeExchangeRatesFormat;
} | null = null;

/**
 * Converts AssetsController state (assetsPrice, selectedCurrency) into the
 * same format the bridge expects from MultichainAssetsRatesController,
 * CurrencyRateController, and TokenRatesController so the bridge can use
 * a single action when useAssetsControllerForRates is true.
 *
 * Memoized on input identity for BaseController state slices (`===`) and
 * lodash `isEqual` for rebuilt maps (`nativeAssetIdentifiers`). Bridge quote
 * / rate paths call this repeatedly while assets state is unchanged; recomputing
 * runs keccak256 (`toChecksumAddress`) and CAIP parsing per priced asset.
 *
 * @param params - Conversion parameters.
 * @returns Bridge-compatible conversionRates, currencyRates, marketData, currentCurrency.
 */
export function formatExchangeRatesForBridge(
  params: FormatExchangeRatesForBridgeParams,
): BridgeExchangeRatesFormat {
  if (
    lastCall?.params.assetsInfo === params.assetsInfo &&
    lastCall.params.assetsPrice === params.assetsPrice &&
    lastCall.params.selectedCurrency === params.selectedCurrency &&
    lastCall.params.networkConfigurationsByChainId ===
      params.networkConfigurationsByChainId &&
    isEqual(
      lastCall.params.nativeAssetIdentifiers,
      params.nativeAssetIdentifiers,
    )
  ) {
    return lastCall.result;
  }

  const result = computeExchangeRatesForBridge(params);
  lastCall = { params, result };
  return result;
}

/**
 * Clears the {@link formatExchangeRatesForBridge} memoize cache. Exported for tests.
 */
export function clearFormatExchangeRatesForBridgeCacheForTesting(): void {
  lastCall = null;
}

/**
 * Performs the actual exchange-rate conversion for
 * {@link formatExchangeRatesForBridge}.
 *
 * @param params - Conversion parameters.
 * @returns Bridge-compatible rates.
 */
function computeExchangeRatesForBridge(
  params: FormatExchangeRatesForBridgeParams,
): BridgeExchangeRatesFormat {
  const {
    assetsInfo,
    assetsPrice,
    selectedCurrency,
    nativeAssetIdentifiers,
    networkConfigurationsByChainId = {},
  } = params;
  const conversionRates: MultichainAssetsRatesControllerState['conversionRates'] =
    {};
  const currencyRates: CurrencyRateState['currencyRates'] = {};
  const marketData: TokenRatesControllerState['marketData'] = {};

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
      const isNative = assetsInfo[assetId]?.type === 'native';
      const parsed = parseCaipAssetType(assetId as Caip19AssetId);
      const chainIdParsed = parseCaipChainId(parsed.chainId);

      if (chainIdParsed.namespace === KnownCaipNamespace.Eip155) {
        const chainIdHex = numberToHex(parseInt(chainIdParsed.reference, 10));

        const nativeAssetId = (
          isNative ? assetId : nativeAssetIdentifiers[parsed.chainId]
        ) as Caip19AssetId | undefined;

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

        let tokenAddress: Hex | undefined;
        if (parsed.assetNamespace === 'erc20') {
          tokenAddress = toChecksumAddress(parsed.assetReference);
        } else if (isNative) {
          tokenAddress = toChecksumAddress(getNativeTokenAddress(chainIdHex));
        }

        if (tokenAddress) {
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
          } as MarketDataDetails;
        }

        if (isNative) {
          currencyRates[nativeCurrencySymbol] = {
            conversionDate: lastUpdatedInSeconds,
            conversionRate: price,
            usdConversionRate: usdPrice,
          };
        }
      } else {
        conversionRates[assetId as Caip19AssetId] = {
          rate: String(price),
          currency: currencyCaip,
          conversionTime: lastUpdatedInSeconds,
          expirationTime,
          marketData: {
            fungible: true,
            allTimeHigh: `${priceData.allTimeHigh}`,
            allTimeLow: `${priceData.allTimeLow}`,
            circulatingSupply: `${priceData.circulatingSupply}`,
            marketCap: `${priceData.marketCap}`,
            totalVolume: `${priceData.totalVolume}`,
            pricePercentChange: {
              PT1H: priceData.pricePercentChange1h as number,
              P1D: priceData.pricePercentChange1d as number,
              P7D: priceData.pricePercentChange7d as number,
              P14D: priceData.pricePercentChange14d as number,
              P30D: priceData.pricePercentChange30d as number,
              P200D: priceData.pricePercentChange200d as number,
              P1Y: priceData.pricePercentChange1y as number,
            },
          },
        } as MultichainAssetsRatesControllerState['conversionRates'][Caip19AssetId];
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
