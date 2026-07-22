/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { getAddress } from '@ethersproject/address';
import type {
  CurrencyRateState,
  MultichainAssetsRatesControllerState,
  TokenRatesControllerState,
} from '@metamask/assets-controllers';
import type {
  GasFeeEstimates,
  GasFeeEstimatesByChainId,
} from '@metamask/gas-fee-controller';
import type { CaipAssetType } from '@metamask/utils';
import { isStrictHexString, parseCaipAssetType } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import { orderBy } from 'lodash';
import {
  createSelector as createSelector_,
  createStructuredSelector as createStructuredSelector_,
} from 'reselect';

import { BRIDGE_PREFERRED_GAS_ESTIMATE } from './constants/bridge';
import type { BridgeControllerState, DeepPartial, ExchangeRate } from './types';
import { RequestStatus, SortOrder } from './types';
import {
  getNativeAssetForChainId,
  isNativeAddress,
  isNonEvmChainId,
} from './utils/bridge';
import {
  formatAddressToAssetId,
  formatAddressToCaipReference,
  formatChainIdToCaip,
  formatChainIdToHex,
} from './utils/caip-formatters';
import { processFeatureFlags } from './utils/feature-flags';
import { sumAmounts } from './utils/number-formatters';
import { calcBatchFees } from './utils/quote-metadata/calculators';
import { calcQuoteMetadata } from './utils/quote-metadata/calculators';
import { mergeQuoteMetadata } from './utils/quote-metadata/merge';
import type { QuoteMetadata } from './utils/quote-metadata/types';
import { getDefaultSlippagePercentage } from './utils/slippage';
import type { QuoteResponse } from './validators/quote-response';

/**
 * The controller states that provide exchange rates
 */
type ExchangeRateControllerState = MultichainAssetsRatesControllerState &
  TokenRatesControllerState &
  CurrencyRateState &
  Pick<BridgeControllerState, 'assetExchangeRates'>;
/**
 * The state of the bridge controller and all its dependency controllers
 */
type RemoteFeatureFlagControllerState = {
  remoteFeatureFlags: {
    bridgeConfig: unknown;
  };
};

/**
 * Minimal shape required for exchange-rate lookups (used by getExchangeRateByChainIdAndAddress).
 * Uses types from assets-controllers; marketData and conversionRates also accept the bridge format.
 */
export type ExchangeRateSourcesForLookup = Pick<
  BridgeControllerState,
  'assetExchangeRates'
> &
  Partial<Pick<CurrencyRateState, 'currencyRates'>> & {
    marketData?:
      | TokenRatesControllerState['marketData']
      | Record<string, Record<string, { price?: number; currency?: string }>>;
    conversionRates?:
      | MultichainAssetsRatesControllerState['conversionRates']
      | Record<string, { rate: string }>;
  };

export type BridgeAppState = BridgeControllerState & {
  gasFeeEstimatesByChainId: GasFeeEstimatesByChainId;
} & ExchangeRateControllerState & {
    participateInMetaMetrics: boolean;
  } & RemoteFeatureFlagControllerState;
/**
 * Creates a structured selector for the bridge controller
 */
const createStructuredBridgeSelector =
  createStructuredSelector_.withTypes<BridgeAppState>();
/**
 * Creates a typed selector for the bridge controller
 */
const createBridgeSelector = createSelector_.withTypes<BridgeAppState>();
/**
 * Required parameters that clients must provide for the bridge quotes selector
 */
type BridgeQuotesClientParams = {
  sortOrder: SortOrder;
  selectedQuote: (QuoteResponse & QuoteMetadata) | null;
};

type EvmTokenExchangeRate = { price?: number; currency?: string };
type EvmTokenExchangeRates = Record<string, EvmTokenExchangeRate>;

const createFeatureFlagsSelector =
  createSelector_.withTypes<RemoteFeatureFlagControllerState>();

/**
 * Selects the bridge feature flags
 *
 * @param state - The state of the bridge controller
 * @returns The bridge feature flags
 *
 * @example
 * ```ts
 * const featureFlags = useSelector(state => selectBridgeFeatureFlags(state));
 *
 * Or
 *
 * export const selectBridgeFeatureFlags = createSelector(
 * selectRemoteFeatureFlags,
 *  (remoteFeatureFlags) =>
 *    selectBridgeFeatureFlagsBase({
 *      bridgeConfig: remoteFeatureFlags.bridgeConfig,
 *    }),
 * );
 * ```
 */
export const selectBridgeFeatureFlags = createFeatureFlagsSelector(
  [(state) => state.remoteFeatureFlags.bridgeConfig],
  (bridgeConfig: unknown) => processFeatureFlags(bridgeConfig),
);

const getEvmTokenExchangeRateForAddress = (
  evmTokenExchangeRates: EvmTokenExchangeRates | undefined,
  address: string,
): EvmTokenExchangeRate | null | undefined => {
  try {
    return isStrictHexString(address)
      ? (evmTokenExchangeRates?.[getAddress(address)] ??
          evmTokenExchangeRates?.[address.toLowerCase()])
      : null;
  } catch {
    return null;
  }
};

/**
 * Selects the asset exchange rate for a given chain and address
 *
 * @param exchangeRateSources - the controller states containing the exchange rates
 * @param assetId - the assetId to get the exchange rate for
 * @returns The asset exchange rate for the given assetId
 */
export const selectExchangeRateByAssetId = (
  exchangeRateSources: ExchangeRateSourcesForLookup,
  assetId?: CaipAssetType,
): ExchangeRate => {
  if (!assetId) {
    return {};
  }

  const { assetExchangeRates, currencyRates, marketData, conversionRates } =
    exchangeRateSources;

  // If the asset exchange rate is available in the bridge controller, use it
  // This is defined if the token's rate is not available from the assets controllers
  const bridgeControllerRate =
    assetExchangeRates?.[assetId.toLowerCase() as CaipAssetType] ??
    assetExchangeRates?.[assetId];
  if (
    bridgeControllerRate?.exchangeRate &&
    bridgeControllerRate?.usdExchangeRate
  ) {
    return bridgeControllerRate;
  }

  const { chainId } = parseCaipAssetType(assetId);

  // If the chain is a non-EVM chain, use the conversion rate from the multichain assets controller
  if (isNonEvmChainId(chainId)) {
    const conversionRatesByKey = conversionRates as
      | Record<string, { rate?: string }>
      | undefined;
    const multichainAssetExchangeRate = conversionRatesByKey?.[assetId];
    const rate = multichainAssetExchangeRate?.rate;
    if (rate) {
      // The multichain rate is denominated in the user's selected currency.
      // To get a USD rate, find the user's-currency-to-USD conversion factor from any EVM native currency rate.
      const nativeCurrencyRate = Object.values(currencyRates ?? {}).find(
        (rateEntry) =>
          rateEntry?.conversionRate !== undefined &&
          rateEntry?.conversionRate !== null &&
          rateEntry?.usdConversionRate !== undefined &&
          rateEntry?.usdConversionRate !== null,
      );
      const usersCurrencyToUsdRate =
        nativeCurrencyRate?.conversionRate !== undefined &&
        nativeCurrencyRate?.conversionRate !== null &&
        nativeCurrencyRate?.usdConversionRate !== undefined &&
        nativeCurrencyRate?.usdConversionRate !== null
          ? new BigNumber(nativeCurrencyRate.usdConversionRate).div(
              nativeCurrencyRate.conversionRate,
            )
          : undefined;
      const usdExchangeRate = usersCurrencyToUsdRate
        ? new BigNumber(rate).times(usersCurrencyToUsdRate).toString()
        : undefined;
      return {
        exchangeRate: rate,
        usdExchangeRate,
      };
    }
    return {};
  }

  const address = formatAddressToCaipReference(assetId);

  // If the chain is an EVM chain, use the conversion rate from the currency rates controller
  if (isNativeAddress(address)) {
    const { symbol } = getNativeAssetForChainId(chainId);
    const evmNativeExchangeRate = currencyRates?.[symbol];
    if (evmNativeExchangeRate) {
      return {
        exchangeRate: evmNativeExchangeRate.conversionRate?.toString(),
        usdExchangeRate: evmNativeExchangeRate.usdConversionRate?.toString(),
      };
    }
    return {};
  }
  // If the chain is an EVM chain and the asset is not the native asset, use the conversion rate from the token rates controller
  if (!isNonEvmChainId(chainId)) {
    const marketDataByChain =
      (marketData as Record<string, EvmTokenExchangeRates> | undefined) ?? {};
    const evmTokenExchangeRates =
      marketDataByChain[formatChainIdToHex(chainId)];
    const evmTokenExchangeRateForAddress = getEvmTokenExchangeRateForAddress(
      evmTokenExchangeRates,
      address,
    );
    const currencyKey = evmTokenExchangeRateForAddress?.currency;
    const nativeCurrencyRate =
      currencyKey !== undefined && currencyKey !== null
        ? currencyRates?.[currencyKey]
        : undefined;
    const price = evmTokenExchangeRateForAddress?.price;
    // A missing or zero price is not a usable exchange rate. Returning a "0"
    // rate here is harmful in two ways: it surfaces a $0 fiat value, and it
    // makes `selectIsAssetExchangeRateInState` treat the token as already
    // priced (the non-empty "0" string is truthy), which prevents the
    // controller from fetching the real rate. Fall through to `{}` instead so
    // the rate gets fetched from the price API.
    if (price && nativeCurrencyRate) {
      return {
        exchangeRate: new BigNumber(price)
          .multipliedBy(nativeCurrencyRate.conversionRate ?? 0)
          .toString(),
        usdExchangeRate: new BigNumber(price)
          .multipliedBy(nativeCurrencyRate.usdConversionRate ?? 0)
          .toString(),
      };
    }
  }

  return {};
};

/**
 * Checks whether an exchange rate is available for a given assetId
 *
 * @param state The state of the bridge controller and its dependency controllers
 * @param assetId The assetId to check
 * @returns Whether an exchange rate is available for the given chain and address
 */
export const selectIsAssetExchangeRateInState = (
  state: ExchangeRateSourcesForLookup,
  assetId?: CaipAssetType,
) =>
  Boolean(selectExchangeRateByAssetId(state, assetId)?.exchangeRate) &&
  Boolean(selectExchangeRateByAssetId(state, assetId)?.usdExchangeRate);

/**
 * Selects the gas fee estimates from the gas fee controller. All potential networks
 * support EIP1559 gas fees so assume that gasFeeEstimates is of type GasFeeEstimates
 *
 * @param state - The state of the bridge controller and its dependency controllers
 * @param state.gasFeeEstimatesByChainId - gasEstimates by Hex ChainId
 * @param state.quotes - Fetched bridge/swap quotes
 * @returns The gas fee estimates in decGWEI
 */
const selectBridgeFeesPerGas = createBridgeSelector(
  [
    (state) => state.gasFeeEstimatesByChainId,
    (state) => state.quotes?.[0]?.chainId,
  ],
  (gasFeeEstimatesByChainId, srcChainId) => {
    if (!srcChainId) {
      return null;
    }
    if (isNonEvmChainId(srcChainId)) {
      return null;
    }
    // @ts-expect-error - all supported networks use this type of estimates
    const gasFeeEstimates: GasFeeEstimates | undefined =
      gasFeeEstimatesByChainId?.[
        formatChainIdToHex(srcChainId) as keyof typeof gasFeeEstimatesByChainId
      ]?.gasFeeEstimates;
    if (!gasFeeEstimates) {
      return null;
    }
    return {
      estimatedBaseFeeInDecGwei: gasFeeEstimates.estimatedBaseFee,
      feePerGasInDecGwei:
        gasFeeEstimates[BRIDGE_PREFERRED_GAS_ESTIMATE]?.suggestedMaxFeePerGas,
      maxFeePerGasInDecGwei: gasFeeEstimates.high?.suggestedMaxFeePerGas,
    };
  },
);

const selectExchangeRateSources = createStructuredBridgeSelector({
  currencyRates: (state) => state.currencyRates,
  marketData: (state) => state.marketData,
  conversionRates: (state) => state.conversionRates,
  assetExchangeRates: (state) => state.assetExchangeRates,
});

// Selects metadata for cross-chain swap quotes
const selectMetadata = createBridgeSelector(
  [
    ({ quotes }) => quotes,
    selectBridgeFeesPerGas,
    selectExchangeRateSources,
    ({ quoteRequest }) => quoteRequest,
  ],
  (quotes, bridgeFeesPerGas, exchangeRateSources, quoteRequest) => {
    const { destTokenAddress, srcChainId, destChainId } = quoteRequest[0] ?? {};

    return quotes.map((quote) =>
      calcQuoteMetadata(quote, {
        srcTokenExchangeRate: selectExchangeRateByAssetId(
          exchangeRateSources,
          quote.quote.src.asset.assetId,
        ),
        bridgeFeesPerGas,
        destTokenExchangeRate: selectExchangeRateByAssetId(
          exchangeRateSources,
          formatAddressToAssetId(
            destTokenAddress ?? quote.quote.dest.asset.assetId,
            destChainId,
          ),
        ),
        nativeExchangeRate: selectExchangeRateByAssetId(
          exchangeRateSources,
          getNativeAssetForChainId(srcChainId ?? quote.chainId)?.assetId,
        ),
      }),
    );
  },
);

// Selects cross-chain swap quotes including their metadata
const selectBridgeQuotesWithMetadata = createBridgeSelector(
  [selectMetadata, ({ quotes }) => quotes],
  (quoteMetadata, quotes) =>
    quotes.map((quote, index) =>
      mergeQuoteMetadata(quote, quoteMetadata[index]),
    ),
);

const selectSortedBridgeQuotes = createBridgeSelector(
  [
    selectBridgeQuotesWithMetadata,
    (_, { sortOrder }: BridgeQuotesClientParams) => sortOrder,
  ],
  (quotesWithMetadata, sortOrder): (QuoteResponse & QuoteMetadata)[] => {
    switch (sortOrder) {
      case SortOrder.ETA_ASC:
        return orderBy(
          quotesWithMetadata,
          (quote) => quote.estimatedProcessingTimeInSeconds,
          'asc',
        );
      default:
        if (
          quotesWithMetadata.every(
            (quote) => quote.quote.priceData?.cost?.valueInCurrency,
          )
        ) {
          return orderBy(
            quotesWithMetadata,
            ({ quote: { priceData } }) =>
              Number(priceData?.cost?.valueInCurrency),
            'asc',
          );
        }
        if (
          quotesWithMetadata.every(
            (quote) => quote.quote.priceData?.priceImpact?.amount,
          )
        ) {
          return orderBy(
            quotesWithMetadata,
            ({ quote }) => Number(quote.priceData?.priceImpact?.amount),
            'asc',
          );
        }
        return orderBy(
          quotesWithMetadata,
          ({ quote }) => Number(quote.dest.amount),
          'desc',
        );
    }
  },
);

const selectRecommendedQuote = createBridgeSelector(
  [selectSortedBridgeQuotes],
  (quotes) => (quotes.length > 0 ? quotes[0] : null),
);

const selectActiveQuote = createBridgeSelector(
  [
    selectRecommendedQuote,
    selectSortedBridgeQuotes,
    (_, { selectedQuote }) => selectedQuote?.quote.requestId,
  ],
  (recommendedQuote, sortedQuotes, requestId) =>
    sortedQuotes.find((quote) => quote.quote.requestId === requestId) ??
    recommendedQuote,
);

const selectIsQuoteGoingToRefresh = createBridgeSelector(
  [
    selectBridgeFeatureFlags,
    // If at least one quote request is sufficiently funded, continue polling until max refresh count is reached
    (state) =>
      state.quoteRequest.every((quoteRequest) =>
        Boolean(quoteRequest.insufficientBal),
      ),
    (state) => state.quotesRefreshCount,
  ],
  (featureFlags, insufficientBal, quotesRefreshCount) =>
    insufficientBal ? false : featureFlags.maxRefreshCount > quotesRefreshCount,
);

const selectQuoteRefreshRate = createBridgeSelector(
  [selectBridgeFeatureFlags, (state) => state.quoteRequest[0]?.srcChainId],
  (featureFlags, srcChainId) =>
    (srcChainId
      ? featureFlags.chains[formatChainIdToCaip(srcChainId)]?.refreshRate
      : featureFlags.refreshRate) ?? featureFlags.refreshRate,
);

export const selectIsQuoteExpired = createBridgeSelector(
  [
    selectIsQuoteGoingToRefresh,
    ({ quotesLastFetched }) => quotesLastFetched,
    selectQuoteRefreshRate,
    (_, _ignoredParam, currentTimeInMs: number) => currentTimeInMs,
  ],
  (isQuoteGoingToRefresh, quotesLastFetched, refreshRate, currentTimeInMs) =>
    Boolean(
      !isQuoteGoingToRefresh &&
      quotesLastFetched &&
      currentTimeInMs - quotesLastFetched > refreshRate,
    ),
);

/**
 * Selects sorted cross-chain swap quotes. By default, the quotes are sorted by cost in ascending order.
 *
 * @param state - The state of the bridge controller and its dependency controllers
 * @param sortOrder - The sort order of the quotes
 * @param selectedQuote - The quote that is currently selected by the user, should be cleared by clients when the req params change
 * @returns The activeQuote, recommendedQuote, sortedQuotes, and other quote fetching metadata
 *
 * @example
 * ```ts
 * const quotes = useSelector(state => selectBridgeQuotes(
 *   { ...state.metamask, bridgeConfig: remoteFeatureFlags.bridgeConfig },
 *   {
 *     sortOrder: state.bridge.sortOrder,
 *     selectedQuote: state.bridge.selectedQuote,
 *   }
 * ));
 * ```
 */
export const selectBridgeQuotes = createStructuredBridgeSelector({
  sortedQuotes: selectSortedBridgeQuotes,
  recommendedQuote: selectRecommendedQuote,
  activeQuote: selectActiveQuote,
  quotesLastFetchedMs: (state) => state.quotesLastFetched,
  isLoading: (state) => state.quotesLoadingStatus === RequestStatus.LOADING,
  quoteFetchError: (state) => state.quoteFetchError,
  quotesRefreshCount: (state) => state.quotesRefreshCount,
  quotesInitialLoadTimeMs: (state) => state.quotesInitialLoadTime,
  isQuoteGoingToRefresh: selectIsQuoteGoingToRefresh,
});

const selectRecommendedQuotes = createBridgeSelector(
  [
    selectSortedBridgeQuotes,
    (_, { requestCount }: { requestCount: number }) => requestCount,
  ],
  (quotes, requestCount) =>
    quotes.reduce((acc, quote) => {
      const requestIndex = quote.quoteRequestIndex ?? 0;
      acc[requestIndex] ??= quote;
      return acc;
    }, Array<QuoteResponse | null>(requestCount).fill(null)),
);
const selectDestAmountSum = createBridgeSelector(
  [selectRecommendedQuotes],
  (recommendedQuotes) => {
    return sumAmounts(recommendedQuotes.map((quote) => quote?.quote.dest));
  },
);

const selectMinDestAmountSum = createBridgeSelector(
  [selectDestAmountSum],
  (destAmountSum): DeepPartial<QuoteResponse['quote']['dest']> | undefined => {
    if (!destAmountSum) {
      return undefined;
    }

    const {
      minAmount,
      minAmountNormalized,
      minAmountValueInCurrency,
      minAmountUsd,
      asset,
    } = destAmountSum;

    return {
      amount: minAmount,
      normalizedAmount: minAmountNormalized,
      valueInCurrency: minAmountValueInCurrency,
      usd: minAmountUsd,
      asset,
    };
  },
);

/**
 * Selects the recommended swap quotes for a batch of quote requests.
 *
 * @param state - The state of the bridge controller and its dependency controllers
 * @param sortOrder - The sort order of the quotes
 * @param requestCount - The number of quote requests fetched in the batch
 * @returns The quotes for multiple quote requests, including their recommendedQuotes,
 * totalReceived, minimumReceived, totalNetworkFee, and other quote fetching metadata.
 *
 * @example
 * ```ts
 * const quotes = useSelector(state => selectBatchSellQuotes(
 *   { ...state.metamask },
 *   {
 *     sortOrder: state.bridge.sortOrder,
 *     requestCount: 4,
 *   }
 * ));
 * ```
 */
export const selectBatchSellQuotes = createStructuredBridgeSelector({
  recommendedQuotes: selectRecommendedQuotes,
  totalReceived: selectDestAmountSum,
  minimumReceived: selectMinDestAmountSum,
  quotesLastFetchedMs: (state) => state.quotesLastFetched,
  isLoading: (state) => state.quotesLoadingStatus === RequestStatus.LOADING,
  quoteFetchError: (state) => state.quoteFetchError,
  quotesRefreshCount: (state) => state.quotesRefreshCount,
  quotesInitialLoadTimeMs: (state) => state.quotesInitialLoadTime,
  isQuoteGoingToRefresh: selectIsQuoteGoingToRefresh,
});

const selectBatchSellFees = createBridgeSelector(
  [
    (state) => state.batchSellTrades?.fee?.amount,
    (state) => state.batchSellTrades?.fee?.asset,
    (state) =>
      selectExchangeRateByAssetId(
        state,
        state.batchSellTrades?.fee?.asset?.assetId,
      ),
  ],
  (feeAmount, feeAsset, exchangeRate) => {
    return feeAmount && feeAsset && exchangeRate
      ? calcBatchFees(feeAmount, feeAsset, exchangeRate)
      : undefined;
  },
);

/**
 * Selects the batch transactions and fees for a batch of quotes
 *
 * @param state - The state of the bridge controller and its dependency controllers
 * @returns The total transaction fees and whether the batch sell trades are submittable.
 *
 * @example
 * ```ts
 * const { totalNetworkFee, isBatchSellTradeAvailable } = useSelector(state => selectBatchSellTrades(state.metamask));
 * ```
 */
export const selectBatchSellTrades = createBridgeSelector(
  [
    (state) => state.batchSellTradesLoadingStatus === RequestStatus.FETCHED,
    (state) => state.batchSellTrades,
    selectBatchSellFees,
    (state) => state.batchSellTradesLoadingStatus === RequestStatus.LOADING,
  ],
  (isBatchSellTradeAvailable, batchSellTrades, batchFees, isLoading) => {
    return {
      totalNetworkFee: batchFees,
      /**
       * Whether the batch sell trades have been fetched and transactions are ready to be submitted
       */
      isBatchSellTradeAvailable:
        isBatchSellTradeAvailable &&
        Boolean(batchSellTrades?.transactions?.length),
      isLoading,
    };
  },
);

export const selectMinimumBalanceForRentExemptionInSOL = (
  state: BridgeAppState,
) =>
  new BigNumber(state.minimumBalanceForRentExemptionInLamports ?? 0)
    .div(10 ** 9)
    .toString();

export const selectTokenWarnings = (state: BridgeAppState) =>
  state.tokenWarnings;

export const selectDefaultSlippagePercentage = createBridgeSelector(
  [
    (state) => selectBridgeFeatureFlags(state).chains,
    (_, slippageParams: Parameters<typeof getDefaultSlippagePercentage>[0]) =>
      slippageParams.srcTokenAddress,
    (_, slippageParams: Parameters<typeof getDefaultSlippagePercentage>[0]) =>
      slippageParams.destTokenAddress,
    (_, slippageParams: Parameters<typeof getDefaultSlippagePercentage>[0]) =>
      slippageParams.srcChainId
        ? formatChainIdToCaip(slippageParams.srcChainId)
        : undefined,
    (_, slippageParams: Parameters<typeof getDefaultSlippagePercentage>[0]) =>
      slippageParams.destChainId
        ? formatChainIdToCaip(slippageParams.destChainId)
        : undefined,
  ],
  (
    featureFlagsByChain,
    srcTokenAddress,
    destTokenAddress,
    srcChainId,
    destChainId,
  ) => {
    return getDefaultSlippagePercentage(
      {
        srcTokenAddress,
        destTokenAddress,
        srcChainId,
        destChainId,
      },
      srcChainId ? featureFlagsByChain[srcChainId]?.stablecoins : undefined,
      destChainId ? featureFlagsByChain[destChainId]?.stablecoins : undefined,
    );
  },
);
