import { FeatureId } from '../validators/feature-flags.js';

/**
 * Sentry trace names published by the BridgeController
 */
export enum TraceName {
  BatchSellQuotesFetched = 'Batch Sell Quotes Fetched',
  BridgeQuotesFetched = 'Bridge Quotes Fetched',
  QuoteProviderFirstResult = 'Quote Provider First Result',
  SwapQuotesFetched = 'Swap Quotes Fetched',
  SwapQuoteFetch = 'Swap Quote Fetch',
  SwapTokenSearch = 'Swap Token Search',
  SwapPopularTokensFetch = 'Swap Popular Tokens Fetch',
  SwapViewLoaded = 'Swap View Loaded',
  BridgeBalancesUpdated = 'Bridge Balances Updated',
}

/**
 * Sentry tags used to identify swap/bridge features
 */
export enum TraceFeatureTag {
  SWAP = 'swap',
  BATCH_SELL = 'batch_sell',
  QUICK_BUY = 'quick_buy',
  PERPS = 'perps',
  DAPP_SWAP = 'dapp_swap',
  LIMIT_ORDER = 'limit_order',
  RECURRING_ORDER = 'recurring_order',
}

export enum TraceOperation {
  BridgeScreenPerformance = 'bridge.screen.performance',
  BridgeDataFetch = 'bridge.data_fetch',
}

/**
 * Map of FeatureId to Sentry Trace Feature Tag
 */
export const BRIDGE_FEATURE_ID_TO_FEATURE_TAG: Record<
  FeatureId,
  TraceFeatureTag
> = {
  [FeatureId.UNIFIED_SWAP_BRIDGE]: TraceFeatureTag.SWAP,
  [FeatureId.BATCH_SELL]: TraceFeatureTag.BATCH_SELL,
  [FeatureId.PERPS]: TraceFeatureTag.PERPS,
  [FeatureId.QUICK_BUY_FOLLOW_TRADING]: TraceFeatureTag.QUICK_BUY,
  [FeatureId.QUICK_BUY_EXPLORE]: TraceFeatureTag.QUICK_BUY,
  [FeatureId.QUICK_BUY_TOKEN_DETAILS]: TraceFeatureTag.QUICK_BUY,
  [FeatureId.DAPP_SWAP]: TraceFeatureTag.DAPP_SWAP,
  [FeatureId.LIMIT_ORDER]: TraceFeatureTag.LIMIT_ORDER,
  [FeatureId.RECURRING_ORDER]: TraceFeatureTag.RECURRING_ORDER,
  [FeatureId.UNKNOWN]: TraceFeatureTag.SWAP,
};
