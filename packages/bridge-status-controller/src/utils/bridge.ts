import {
  AbortReason,
  UnifiedSwapBridgeEventName,
  BatchSellTradesResponse,
  RequiredEventContextFromClient,
  type QuoteResponseV1,
  type GenericQuoteRequest,
  type QuoteMetadata,
  getQuoteRefreshRate,
  FeatureId,
} from '@metamask/bridge-controller';

import {
  BridgeStatusControllerMessenger,
  type BridgeHistoryItem,
} from '../types.js';

export const stopPollingForQuotes = (
  messenger: BridgeStatusControllerMessenger,
  metricsContext?: RequiredEventContextFromClient[UnifiedSwapBridgeEventName.QuotesReceived],
): void => {
  messenger.call(
    'BridgeController:stopPollingForQuotes',
    AbortReason.TransactionSubmitted,
    metricsContext,
  );
};

export const getBatchSellTrades = (
  messenger: BridgeStatusControllerMessenger,
): BatchSellTradesResponse | null => {
  return messenger.call('BridgeController:getState').batchSellTrades;
};

export const trackMetricsEvent = ({
  messenger,
  eventName,
  properties,
}: {
  messenger: BridgeStatusControllerMessenger;
  eventName: UnifiedSwapBridgeEventName;
  properties: RequiredEventContextFromClient[UnifiedSwapBridgeEventName];
}): void => {
  messenger.call(
    'BridgeController:trackUnifiedSwapBridgeEvent',
    eventName,
    properties,
  );
};

/**
 * Checks whether swap/bridge quote is expired and fetches a new one if it is.
 * Assumes that there is only one quote in the response.
 *
 * @param messenger - the messenger instance
 * @param historyItem - the most recent history item
 * @param cachedQuoteResponse - the cached quote response
 * @returns the new quote response
 * @throws an error if the new quote fetch fails or if there's no quote available
 */
export const resolveValidQuotes = async (
  messenger: BridgeStatusControllerMessenger,
  { startTime, quote, account }: BridgeHistoryItem,
  cachedQuoteResponse: QuoteResponseV1 & QuoteMetadata,
) => {
  const quoteRefreshRate = getQuoteRefreshRate(messenger, quote.srcChainId);

  if (Date.now() - startTime < quoteRefreshRate) {
    return [cachedQuoteResponse];
  }

  const quoteRequest: GenericQuoteRequest = {
    walletAddress: account,
    srcTokenAddress: quote.srcAsset.address,
    destTokenAddress: quote.destAsset.address,
    srcChainId: quote.srcChainId,
    destChainId: quote.destChainId,
    srcTokenAmount: quote.srcTokenAmount,
    slippage: quote.slippage,
    gasIncluded: Boolean(quote.gasIncluded),
    gasIncluded7702: Boolean(quote.gasIncluded7702),
    isMoneyAccount: true,
  };
  const newQuoteResponse = (
    await messenger.call(
      'BridgeController:fetchQuotes',
      quoteRequest,
      FeatureId.UNIFIED_SWAP_BRIDGE,
    )
  )[0];

  if (!newQuoteResponse) {
    throw new Error('Failed to refresh quote');
  }

  return [newQuoteResponse];
};
