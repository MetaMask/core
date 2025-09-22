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
  SnapConfirmationViewed = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Snap Confirmation Page Viewed`,
  Submitted = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Submitted`,
  Completed = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Completed`,
  Failed = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Failed`,
  AllQuotesOpened = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} All Quotes Opened`,
  AllQuotesSorted = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} All Quotes Sorted`,
  QuoteSelected = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Quote Selected`,
  AssetDetailTooltipClicked = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Asset Detail Tooltip Clicked`,
  QuotesValidationFailed = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Quotes Failed Validation`,
  StatusValidationFailed = `${UNIFIED_SWAP_BRIDGE_EVENT_CATEGORY} Status Failed Validation`,
}

export enum AbortReason {
  NewQuoteRequest = 'New Quote Request',
  QuoteRequestUpdated = 'Quote Request Updated',
  ResetState = 'Reset controller state',
}

/**
 * @deprecated remove this event property
 */
export enum MetaMetricsSwapsEventSource {
  MainView = 'Main View',
  TokenView = 'Token View',
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
