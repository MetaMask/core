import { AddressZero } from '@ethersproject/constants';
import type {
  CurrencyRateState,
  MultichainAssetsRatesControllerState,
  TokenRatesControllerState,
} from '@metamask/assets-controllers';
import type { GasFeeEstimates } from '@metamask/gas-fee-controller';
import type { CaipAssetType } from '@metamask/utils';
import { isStrictHexString } from '@metamask/utils';
import { orderBy } from 'lodash';
import {
  createSelector as createSelector_,
  createStructuredSelector as createStructuredSelector_,
} from 'reselect';

import { BRIDGE_PREFERRED_GAS_ESTIMATE } from './constants/bridge';
import type {
  BridgeControllerState,
  BridgeFeatureFlagsKey,
  ExchangeRate,
  GenericQuoteRequest,
  QuoteMetadata,
  QuoteResponse,
} from './types';
import { RequestStatus, SortOrder } from './types';
import {
  getNativeAssetForChainId,
  isNativeAddress,
  isSolanaChainId,
} from './utils/bridge';
import {
  formatAddressToAssetId,
  formatChainIdToCaip,
  formatChainIdToHex,
} from './utils/caip-formatters';
import {
  calcAdjustedReturn,
  calcCost,
  calcEstimatedAndMaxTotalGasFee,
  calcRelayerFee,
  calcSentAmount,
  calcSolanaTotalNetworkFee,
  calcSwapRate,
  calcToAmount,
  calcTotalEstimatedNetworkFee,
  calcTotalMaxNetworkFee,
} from './utils/quote';

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
export type BridgeAppState = BridgeControllerState & {
  gasFeeEstimates: GasFeeEstimates;
} & ExchangeRateControllerState & {
    participateInMetaMetrics: boolean;
  };
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
  featureFlagsKey: BridgeFeatureFlagsKey;
};

const getExchangeRateByChainIdAndAddress = (
  exchangeRateSources: ExchangeRateControllerState,
  chainId?: GenericQuoteRequest['srcChainId'],
  address?: GenericQuoteRequest['srcTokenAddress'],
): ExchangeRate => {
  if (!chainId || !address) {
    return {};
  }
  // TODO return usd exchange rate if user has opted into metrics
  const assetId = formatAddressToAssetId(address, chainId);
  if (!assetId) {
    return {};
  }

  const { assetExchangeRates, currencyRates, marketData, conversionRates } =
    exchangeRateSources;

  // If the asset exchange rate is available in the bridge controller, use it
  // This is defined if the token's rate is not available from the assets controllers
  const bridgeControllerRate =
    assetExchangeRates?.[assetId] ??
    assetExchangeRates?.[assetId.toLowerCase() as CaipAssetType];
  if (bridgeControllerRate?.exchangeRate) {
    return bridgeControllerRate;
  }
  // If the chain is a Solana chain, use the conversion rate from the multichain assets controller
  if (isSolanaChainId(chainId)) {
    const multichainAssetExchangeRate = conversionRates?.[assetId];
    if (multichainAssetExchangeRate) {
      return {
        exchangeRate: multichainAssetExchangeRate.rate,
        usdExchangeRate: undefined,
      };
    }
    return {};
  }
  // If the chain is an EVM chain, use the conversion rate from the currency rates controller
  if (isNativeAddress(address)) {
    const { symbol } = getNativeAssetForChainId(chainId);
    const evmNativeExchangeRate = currencyRates?.[symbol.toLowerCase()];
    if (evmNativeExchangeRate) {
      return {
        exchangeRate: evmNativeExchangeRate?.conversionRate?.toString(),
        usdExchangeRate: evmNativeExchangeRate?.usdConversionRate?.toString(),
      };
    }
    return {};
  }
  // If the chain is an EVM chain and the asset is not the native asset, use the conversion rate from the token rates controller
  const evmTokenExchangeRates = marketData?.[formatChainIdToHex(chainId)];
  const evmTokenExchangeRateForAddress = isStrictHexString(address)
    ? evmTokenExchangeRates?.[address]
    : null;
  if (evmTokenExchangeRateForAddress) {
    return {
      exchangeRate: evmTokenExchangeRateForAddress?.price.toString(),
      usdExchangeRate: undefined,
    };
  }

  return {};
};

/**
 * Selects the asset exchange rate for a given chain and address
 *
 * @param state The state of the bridge controller and its dependency controllers
 * @param chainId The chain ID of the asset
 * @param address The address of the asset
 * @returns The asset exchange rate for the given chain and address
 */
export const selectExchangeRateByChainIdAndAddress = (
  state: BridgeAppState,
  chainId?: GenericQuoteRequest['srcChainId'],
  address?: GenericQuoteRequest['srcTokenAddress'],
) => {
  return getExchangeRateByChainIdAndAddress(state, chainId, address);
};

/**
 * Checks whether an exchange rate is available for a given chain and address
 *
 * @param params The parameters to pass to {@link getExchangeRateByChainIdAndAddress}
 * @returns Whether an exchange rate is available for the given chain and address
 */
export const selectIsAssetExchangeRateInState = (
  ...params: Parameters<typeof getExchangeRateByChainIdAndAddress>
) => Boolean(getExchangeRateByChainIdAndAddress(...params)?.exchangeRate);

/**
 * Selects the gas fee estimates from the gas fee controller. All potential networks
 * support EIP1559 gas fees so assume that gasFeeEstimates is of type GasFeeEstimates
 *
 * @returns The gas fee estimates in decGWEI
 */
const selectBridgeFeesPerGas = createStructuredBridgeSelector({
  estimatedBaseFeeInDecGwei: ({ gasFeeEstimates }) =>
    gasFeeEstimates?.estimatedBaseFee,
  maxPriorityFeePerGasInDecGwei: ({ gasFeeEstimates }) =>
    gasFeeEstimates?.[BRIDGE_PREFERRED_GAS_ESTIMATE]
      ?.suggestedMaxPriorityFeePerGas,
  maxFeePerGasInDecGwei: ({ gasFeeEstimates }) =>
    gasFeeEstimates?.high?.suggestedMaxFeePerGas,
});

// Selects cross-chain swap quotes including their metadata
const selectBridgeQuotesWithMetadata = createBridgeSelector(
  [
    ({ quotes }) => quotes,
    selectBridgeFeesPerGas,
    createBridgeSelector(
      [
        (state) => state,
        ({ quoteRequest: { srcChainId } }) => srcChainId,
        ({ quoteRequest: { srcTokenAddress } }) => srcTokenAddress,
      ],
      selectExchangeRateByChainIdAndAddress,
    ),
    createBridgeSelector(
      [
        (state) => state,
        ({ quoteRequest: { destChainId } }) => destChainId,
        ({ quoteRequest: { destTokenAddress } }) => destTokenAddress,
      ],
      selectExchangeRateByChainIdAndAddress,
    ),
    createBridgeSelector(
      [(state) => state, ({ quoteRequest: { srcChainId } }) => srcChainId],
      (state, chainId) =>
        selectExchangeRateByChainIdAndAddress(state, chainId, AddressZero),
    ),
  ],
  (
    quotes,
    bridgeFeesPerGas,
    srcTokenExchangeRate,
    destTokenExchangeRate,
    nativeExchangeRate,
  ) => {
    const newQuotes = quotes.map((quote) => {
      const sentAmount = calcSentAmount(quote.quote, srcTokenExchangeRate);
      const toTokenAmount = calcToAmount(quote.quote, destTokenExchangeRate);

      let totalEstimatedNetworkFee, gasFee, totalMaxNetworkFee, relayerFee;

      if (isSolanaChainId(quote.quote.srcChainId)) {
        totalEstimatedNetworkFee = calcSolanaTotalNetworkFee(
          quote,
          nativeExchangeRate,
        );
        gasFee = totalEstimatedNetworkFee;
        totalMaxNetworkFee = totalEstimatedNetworkFee;
      } else {
        relayerFee = calcRelayerFee(quote, nativeExchangeRate);
        gasFee = calcEstimatedAndMaxTotalGasFee({
          bridgeQuote: quote,
          ...bridgeFeesPerGas,
          ...nativeExchangeRate,
        });
        totalEstimatedNetworkFee = calcTotalEstimatedNetworkFee(
          gasFee,
          relayerFee,
        );
        totalMaxNetworkFee = calcTotalMaxNetworkFee(gasFee, relayerFee);
      }

      const adjustedReturn = calcAdjustedReturn(
        toTokenAmount,
        totalEstimatedNetworkFee,
      );
      const cost = calcCost(adjustedReturn, sentAmount);

      return {
        ...quote,
        // QuoteMetadata fields
        sentAmount,
        toTokenAmount,
        swapRate: calcSwapRate(sentAmount.amount, toTokenAmount.amount),
        totalNetworkFee: totalEstimatedNetworkFee,
        totalMaxNetworkFee,
        gasFee,
        adjustedReturn,
        cost,
      };
    });

    return newQuotes;
  },
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
        return orderBy(
          quotesWithMetadata,
          ({ cost }) =>
            cost.valueInCurrency ? Number(cost.valueInCurrency) : 0,
          'asc',
        );
    }
  },
);

const selectRecommendedQuote = createBridgeSelector(
  [selectSortedBridgeQuotes],
  ([recommendedQuote]) => recommendedQuote,
);

const selectActiveQuote = createBridgeSelector(
  [
    selectRecommendedQuote,
    (_, { selectedQuote }: BridgeQuotesClientParams) => selectedQuote,
  ],
  (recommendedQuote, selectedQuote) => selectedQuote ?? recommendedQuote,
);

const selectIsQuoteGoingToRefresh = (
  state: BridgeAppState,
  { featureFlagsKey }: BridgeQuotesClientParams,
) =>
  state.quoteRequest.insufficientBal
    ? false
    : state.quotesRefreshCount <
      state.bridgeFeatureFlags[featureFlagsKey].maxRefreshCount;

const selectQuoteRefreshRate = createBridgeSelector(
  [
    ({ bridgeFeatureFlags }, { featureFlagsKey }: BridgeQuotesClientParams) =>
      bridgeFeatureFlags[featureFlagsKey],
    (state) => state.quoteRequest.srcChainId,
  ],
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
    (_, __, currentTimeInMs: number) => currentTimeInMs,
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
 * @param featureFlagsKey - The feature flags key for the client (e.g. `BridgeFeatureFlagsKey.EXTENSION_CONFIG`
 * @returns The activeQuote, recommendedQuote, sortedQuotes, and other quote fetching metadata
 *
 * @example
 * ```ts
 * const quotes = useSelector(state => selectBridgeQuotes(
 *   state.metamask,
 *   {
 *     sortOrder: state.bridge.sortOrder,
 *     selectedQuote: state.bridge.selectedQuote,
 *     featureFlagsKey: BridgeFeatureFlagsKey.EXTENSION_CONFIG,
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
