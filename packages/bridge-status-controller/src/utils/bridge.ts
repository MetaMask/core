import {
  AbortReason,
  UnifiedSwapBridgeEventName,
  BatchSellTradesResponse,
  RequiredEventContextFromClient,
  getQuoteRefreshRate,
  FeatureId,
} from '@metamask/bridge-controller';
import type {
  QuoteResponseV1,
  GenericQuoteRequest,
  QuoteMetadata,
} from '@metamask/bridge-controller';

import { BridgeStatusControllerMessenger, Operation } from '../types.js';
import type { BridgeHistoryItem } from '../types.js';

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
 * Post-swap deposit does not need to refresh the quote
 * Assumes that there is only one quote in the response.
 *
 * @param messenger - the messenger instance
 * @param historyItem - the most recent history item
 * @param cachedQuoteResponse - the cached quote response
 * @param operation - the pending follow-up operation
 * @returns the new quote response
 * @throws an error if the new quote fetch fails or if there's no quote available
 */
export const resolveValidQuotes = async (
  messenger: BridgeStatusControllerMessenger,
  historyItem: BridgeHistoryItem,
  cachedQuoteResponse: QuoteResponseV1 & QuoteMetadata,
  operation: Operation,
) => {
  const { startTime, quote, account, slippagePercentage } = historyItem;
  if (operation !== Operation.SWAP) {
    return [cachedQuoteResponse];
  }

  const quoteRefreshRate = getQuoteRefreshRate(messenger, quote.srcChainId);

  if (Date.now() - startTime < quoteRefreshRate) {
    return [cachedQuoteResponse];
  }

  const quoteRequest: GenericQuoteRequest = {
    walletAddress: account,
    destWalletAddress: quote.destWalletAddress,
    srcTokenAddress: quote.srcAsset.address,
    destTokenAddress: quote.destAsset.address,
    srcChainId: quote.srcChainId,
    destChainId: quote.destChainId,
    srcTokenAmount: quote.srcTokenAmount,
    slippage: slippagePercentage || quote.slippage,
    gasIncluded: Boolean(quote.gasIncluded),
    gasIncluded7702: Boolean(quote.gasIncluded7702),
    isMoneyAccount: true,
    aggIds: quote.aggregator ? [quote.aggregator] : undefined,
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
