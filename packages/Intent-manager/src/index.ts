// Export constants
export {
  DEFAULT_INTENT_MANAGER_CONTROLLER_STATE,
  DEFAULT_POLLING_INTERVAL_MS,
  INTENT_EXECUTION_TIMEOUT_MS,
  INTENT_MANAGER_NAME,
  MAX_INTENT_HISTORY_SIZE,
  MAX_RETRY_ATTEMPTS,
} from './constants';

// Export types and enums
export { IntentStatus, IntentOrderStatus } from './types';

export type {
  IntentQuoteRequest,
  IntentQuote,
  IntentOrder,
  IntentFee,
  IntentSubmissionParams,
  IntentProviderConfig,
  ProviderRegistry,
  ProviderSelectionCriteria,
} from './types';

// Export main controller
export { IntentManager } from './intent-manager';
export type { IntentManagerState } from './intent-manager';

// Export providers
export * from './providers';
