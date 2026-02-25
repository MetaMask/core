/* eslint-disable @typescript-eslint/naming-convention */
export const UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY = 'Unified SwapBridge';

/**
 * These event names map to events defined in the segment-schema: https://github.com/Consensys/segment-schema/tree/main/libraries/events/metamask-cross-chain-swaps
 */
export enum UnifiedSwapBridgeEventName {
  ButtonClicked = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Button Clicked`,
  PageViewed = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Page Viewed`,
  InputChanged = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Input Changed`,
  InputSourceDestinationSwitched = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Source Destination Switched`,
  QuotesRequested = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Quotes Requested`,
  QuotesReceived = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Quotes Received`,
  QuotesError = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Quotes Error`,
  Submitted = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Submitted`,
  Completed = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Completed`,
  Failed = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Failed`,
  AllQuotesOpened = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} All Quotes Opened`,
  AllQuotesSorted = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} All Quotes Sorted`,
  QuoteSelected = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Quote Selected`,
  AssetDetailTooltipClicked = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Asset Detail Tooltip Clicked`,
  QuotesValidationFailed = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Quotes Failed Validation`,
  StatusValidationFailed = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Status Failed Validation`,
  PollingStatusUpdated = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Polling Status Updated`,
}

export enum PollingStatus {
  MaxPollingReached = 'max_polling_reached',
  ManuallyRestarted = 'manually_restarted',
}

export enum AbortReason {
  NewQuoteRequest = 'New Quote Request',
  QuoteRequestUpdated = 'Quote Request Updated',
  ResetState = 'Reset controller state',
  TransactionSubmitted = 'Transaction submitted',
}

/**
 * Identifies the entry point from which the user initiated a swap or bridge flow.
 * Included as the `location` property on every Unified SwapBridge event so
 * analytics can trace the user's origin regardless of where they are in the flow.
 */
export enum MetaMetricsSwapsEventSource {
  MainView = 'Main View',
  TokenView = 'Token View',
  TrendingExplore = 'Trending Explore',
  Rewards = 'Rewards',
}

export enum InputAmountPreset {
  PERCENT_25 = '25%',
  PERCENT_50 = '50%',
  PERCENT_75 = '75%',
  PERCENT_90 = '90%',
  // "Max" may not equal 100% of balance (e.g. gas reserves are withheld)
  MAX = 'MAX',
}

export enum MetricsActionType {
  /**
   * @deprecated new events should use SWAPBRIDGE_V1 instead
   */
  CROSSCHAIN_V1 = 'crosschain-v1',
  SWAPBRIDGE_V1 = 'swapbridge-v1',
}

export enum MetricsSwapType {
  SINGLE = 'single_chain',
  CROSSCHAIN = 'crosschain',
}
