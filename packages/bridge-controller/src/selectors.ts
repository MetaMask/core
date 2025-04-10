import type {
  CurrencyRateState,
  MultichainAssetsRatesControllerState,
  TokenRatesControllerState,
} from '@metamask/assets-controllers';
import type { CaipAssetType } from '@metamask/utils';
import { isStrictHexString } from '@metamask/utils';
import { orderBy } from 'lodash';
import {
  createSelector as createSelector_,
  createStructuredSelector as createStructuredSelector_,
} from 'reselect';

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
export type BridgeAppState = BridgeControllerState &
  ExchangeRateControllerState & {
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
 * The merged client transaction and gas controller estimates for gas
 */
type BridgeFeesPerGas = {
  estimatedBaseFeeInDecGwei: string;
  maxPriorityFeePerGasInDecGwei: string;
  maxFeePerGasInDecGwei: string;
};
/**
 * Required parameters that clients must provide for the bridge quotes selector
 */
type BridgeQuotesClientParams = {
  bridgeFeesPerGas: BridgeFeesPerGas;
  sortOrder: SortOrder;
  selectedQuote: (QuoteResponse & QuoteMetadata) | null;
  featureFlagsKey: BridgeFeatureFlagsKey;
};

/**
 * Selects the asset exchange rate for a given chain and address
 *
 * @param exchangeRateSources The exchange rate sources
 * @param chainId The chain ID of the asset
 * @param address The address of the asset
 * @returns The asset exchange rate for the given chain and address
 */
export const selectExchangeRateByChainIdAndAddress = (
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
    assetExchangeRates[assetId] ??
    assetExchangeRates[assetId.toLowerCase() as CaipAssetType];
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
  const { symbol } = getNativeAssetForChainId(chainId);
  const evmNativeExchangeRate = currencyRates[symbol.toLowerCase()];
  if (isNativeAddress(address) && evmNativeExchangeRate) {
    return {
      exchangeRate: evmNativeExchangeRate?.conversionRate?.toString(),
      usdExchangeRate: evmNativeExchangeRate?.usdConversionRate?.toString(),
    };
  }
  // If the chain is an EVM chain and the asset is not the native asset, use the conversion rate from the token rates controller
  const evmTokenExchangeRates = marketData[formatChainIdToHex(chainId)];
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
 * Checks whether an exchange rate is available for a given chain and address
 *
 * @param params The parameters to pass to {@link selectExchangeRateByChainIdAndAddress}
 * @returns Whether an exchange rate is available for the given chain and address
 */
export const selectIsAssetExchangeRateInState = (
  ...params: Parameters<typeof selectExchangeRateByChainIdAndAddress>
) => Boolean(selectExchangeRateByChainIdAndAddress(...params)?.exchangeRate);

// Selects cross-chain swap quotes including their metadata
const selectBridgeQuotesWithMetadata = createBridgeSelector(
  [
    ({ quotes }, { bridgeFeesPerGas }: BridgeQuotesClientParams) => ({
      quotes,
      bridgeFeesPerGas,
    }),
    ({ quoteRequest: { srcChainId, srcTokenAddress }, ...state }) =>
      selectExchangeRateByChainIdAndAddress(state, srcChainId, srcTokenAddress),
    ({ quoteRequest: { destChainId, destTokenAddress }, ...state }) =>
      selectExchangeRateByChainIdAndAddress(
        state,
        destChainId,
        destTokenAddress,
      ),
    ({ quoteRequest: { srcChainId }, ...state }) =>
      selectExchangeRateByChainIdAndAddress(
        state,
        srcChainId,
        srcChainId ? getNativeAssetForChainId(srcChainId).address : undefined,
      ),
  ],
  (
    { quotes, bridgeFeesPerGas },
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

/**
 * Selects sorted cross-chain swap quotes. By default, the quotes are sorted by cost in ascending order.
 *
 * @param state - The state of the bridge controller and its dependency controllers
 * @param bridgeFeesPerGas - The merged client transaction and gas controller estimates for gas
 * @param sortOrder - The sort order of the quotes
 * @param selectedQuote - The quote that is currently selected by the user, should be cleared by clients when the req params change
 * @param featureFlagsKey - The feature flags key for the client (e.g. `BridgeFeatureFlagsKey.EXTENSION_CONFIG`
 * @returns The activeQuote, recommendedQuote, sortedQuotes, and other quote fetching metadata
 *
 * @example
 * ```ts
 * const bridgeFeesPerGas = useSelector(getGasFeeEstimates);
 * const quotes = useSelector(state => selectBridgeQuotes(
 *   state.metamask,
 *   {
 *     bridgeFeesPerGas,
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
  isQuoteGoingToRefresh: (
    state,
    { featureFlagsKey }: BridgeQuotesClientParams,
  ) =>
    state.quoteRequest.insufficientBal
      ? false
      : state.quotesRefreshCount <
        state.bridgeFeatureFlags[featureFlagsKey].maxRefreshCount,
});
