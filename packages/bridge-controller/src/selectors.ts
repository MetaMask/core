import type {
  CurrencyRateState,
  MultichainAssetsRatesControllerState,
  TokenRatesControllerState,
} from '@metamask/assets-controllers';
import type { CaipAssetType } from '@metamask/utils';
import { isStrictHexString } from '@metamask/utils';
import { orderBy } from 'lodash';
import { createSelector } from 'reselect';

import type {
  BridgeControllerState,
  BridgeFeatureFlagsKey,
  GenericQuoteRequest,
  QuoteMetadata,
  QuoteResponse,
  SolanaFees,
  TokenAmountValues,
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
  calcRelayerFee,
  calcSentAmount,
  calcSwapRate,
  calcToAmount,
  getQuoteIdentifier,
} from './utils/quote';

/**
 * The controller states that provide exchange rates
 */
type ExchangeRateControllers = MultichainAssetsRatesControllerState &
  TokenRatesControllerState &
  CurrencyRateState &
  Pick<BridgeControllerState, 'assetExchangeRates'>;

/**
 * The state of the bridge controller and all its dependency controllers
 */
export type BridgeAppState = BridgeControllerState & ExchangeRateControllers;

/**
 * Selects the asset exchange rate for a given chain and address
 *
 * @param exchangeRateSources The exchange rate sources
 * @param chainId The chain ID of the asset
 * @param address The address of the asset
 * @returns The asset exchange rate for the given chain and address
 */
export const selectAssetExchangeRate = (
  exchangeRateSources: ExchangeRateControllers,
  chainId?: GenericQuoteRequest['srcChainId'],
  address?: GenericQuoteRequest['srcTokenAddress'],
): Omit<TokenAmountValues, 'amount'> | null => {
  if (!chainId || !address) {
    return null;
  }
  // TODO return usd exchange rate if user has opted into metrics
  const assetId = formatAddressToAssetId(address, chainId);
  if (!assetId) {
    return null;
  }

  const { assetExchangeRates, currencyRates, marketData, conversionRates } =
    exchangeRateSources;

  const assetExchangeRateToUse =
    assetExchangeRates[assetId] ??
    assetExchangeRates[assetId.toLowerCase() as CaipAssetType];
  if (assetExchangeRateToUse) {
    return assetExchangeRateToUse;
  }

  const multichainAssetExchangeRate = conversionRates?.[assetId];
  if (isSolanaChainId(chainId)) {
    if (multichainAssetExchangeRate) {
      return {
        valueInCurrency: multichainAssetExchangeRate.rate,
        usd: null,
      };
    }
    return null;
  }

  const { symbol } = getNativeAssetForChainId(chainId);
  const evmNativeExchangeRate = currencyRates[symbol];
  if (isNativeAddress(address) && evmNativeExchangeRate) {
    return {
      valueInCurrency:
        evmNativeExchangeRate?.conversionRate?.toString() ?? null,
      usd: evmNativeExchangeRate?.usdConversionRate?.toString() ?? null,
    };
  }

  const evmTokenExchangeRates = marketData[formatChainIdToHex(chainId)];
  const evmTokenExchangeRateForAddress = isStrictHexString(address)
    ? evmTokenExchangeRates?.[address]
    : null;
  if (evmTokenExchangeRateForAddress) {
    return {
      valueInCurrency: evmTokenExchangeRateForAddress?.price.toString() ?? null,
      usd: null,
    };
  }

  return null;
};

/**
 * Selects whether an exchange rate is available for a given chain and address
 *
 * @param params The parameters to pass to {@link selectAssetExchangeRate}
 * @returns Whether an exchange rate is available for the given chain and address
 */
export const selectIsAssetExchangeRateInState = (
  ...params: Parameters<typeof selectAssetExchangeRate>
) => selectAssetExchangeRate(...params) !== null;

/**
 * Selects cross-chain swap quotes including their metadata
 *
 * @param state - The state of the bridge controller and its dependency controllers
 * @returns The quotes with metadata
 *
 * @example usage in the extension
 * ```ts
 * const quotes = useSelector(state => selectBridgeQuotesWithMetadata(state.metamask));
 * ```
 */
export const selectBridgeQuotesWithMetadata = createSelector(
  (state: BridgeAppState) => state.quotes,
  (state: BridgeAppState) =>
    selectAssetExchangeRate(
      state,
      state.quoteRequest.srcChainId,
      state.quoteRequest.srcTokenAddress,
    ),
  (state: BridgeAppState) =>
    selectAssetExchangeRate(
      state,
      state.quoteRequest.destChainId,
      state.quoteRequest.destTokenAddress,
    ),
  (state: BridgeAppState) =>
    selectAssetExchangeRate(
      state,
      state.quoteRequest.srcChainId,
      state.quoteRequest.srcChainId
        ? getNativeAssetForChainId(state.quoteRequest.srcChainId).assetId
        : undefined,
    ),
  (
    quotes,
    srcTokenExchangeRate,
    destTokenExchangeRate,
    nativeExchangeRate,
  ): (QuoteResponse & QuoteMetadata)[] => {
    const newQuotes = quotes.map((quote: QuoteResponse & SolanaFees) => {
      const sentAmount = calcSentAmount(
        quote.quote,
        srcTokenExchangeRate?.valueInCurrency ?? null,
        srcTokenExchangeRate?.usd ?? null,
      );
      const toTokenAmount = calcToAmount(
        quote.quote,
        destTokenExchangeRate?.valueInCurrency ?? null,
        destTokenExchangeRate?.usd ?? null,
      );
      const relayerFee = calcRelayerFee(
        quote,
        nativeExchangeRate?.valueInCurrency ?? null,
        nativeExchangeRate?.usd ?? null,
      );

      return {
        ...quote,
        // QuoteMetadata fields
        sentAmount,
        toTokenAmount,
        swapRate: calcSwapRate(sentAmount.amount, toTokenAmount.amount),
      };
    });

    // TODO rm type cast once everything is ported
    return newQuotes as (QuoteResponse & QuoteMetadata)[];
  },
);

const selectOrderedBridgeQuotes = createSelector(
  selectBridgeQuotesWithMetadata,
  (_state: BridgeAppState, sortOrder: SortOrder = SortOrder.COST_ASC) =>
    sortOrder,
  (quotesWithMetadata, sortOrder) => {
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

/**
 * Selects sorted cross-chain swap quotes. By default, the quotes are sorted by cost in ascending order.
 *
 * @param state - The state of the bridge controller and its dependency controllers
 * @param sortOrder - The sort order of the quotes
 * @param featureFlagsKey - The feature flags key for the client (e.g. `BridgeFeatureFlagsKey.EXTENSION_CONFIG`
 * @param currentSelectedQuote - The quote that is currently selected by the user, should be cleared by clients when the req params change
 * @returns The activeQuote, recommendedQuote, sortedQuotes, and other quote fetching metadata
 *
 * @example usage in the extension
 * ```ts
 * const quotes = useSelector(state => selectBridgeQuotes(
 *   state.metamask,
 *   state.bridge.sortOrder,
 *   BridgeFeatureFlagsKey.EXTENSION_CONFIG,
 *   state.bridge.selectedQuote,
 * ));
 * ```
 */
export const selectBridgeQuotes = createSelector(
  (state, sortOrder) => selectOrderedBridgeQuotes(state, sortOrder),
  ({
    quotesRefreshCount,
    quotesLastFetched,
    quotesLoadingStatus,
    quoteFetchError,
    quotesInitialLoadTime,
    quoteRequest,
  }: BridgeAppState) => ({
    quotesRefreshCount,
    quotesLastFetched,
    isLoading: quotesLoadingStatus === RequestStatus.LOADING,
    quoteFetchError,
    quotesInitialLoadTime,
    insufficientBal: quoteRequest.insufficientBal,
  }),
  (
    { bridgeFeatureFlags }: BridgeAppState,
    _sortOrder: SortOrder,
    featureFlagsKey: BridgeFeatureFlagsKey,
    currentSelectedQuote: QuoteResponse,
  ) => ({
    selectedQuote: currentSelectedQuote,
    maxRefreshCount: bridgeFeatureFlags[featureFlagsKey].maxRefreshCount,
  }),
  (
    sortedQuotes: ReturnType<typeof selectOrderedBridgeQuotes>,
    quoteFetchInfo,
    { selectedQuote, maxRefreshCount },
  ) => {
    const {
      quotesRefreshCount,
      quotesLastFetched,
      isLoading,
      quoteFetchError,
      quotesInitialLoadTime,
      insufficientBal,
    } = quoteFetchInfo;

    const userSelectedQuote =
      quotesRefreshCount <= 1
        ? (selectedQuote ?? sortedQuotes[0])
        : // Find match for selectedQuote in new quotes
          sortedQuotes.find(({ quote }) =>
            selectedQuote
              ? getQuoteIdentifier(quote) ===
                getQuoteIdentifier(selectedQuote.quote)
              : false,
          );

    return {
      sortedQuotes,
      recommendedQuote: sortedQuotes[0],
      activeQuote: userSelectedQuote ?? sortedQuotes[0],
      quotesLastFetchedMs: quotesLastFetched,
      isLoading,
      quoteFetchError,
      quotesRefreshCount,
      quotesInitialLoadTimeMs: quotesInitialLoadTime,
      isQuoteGoingToRefresh: insufficientBal
        ? false
        : quotesRefreshCount < maxRefreshCount,
    };
  },
);
