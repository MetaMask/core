/**
 * Controller name for the Intent Manager
 */
export const INTENT_MANAGER_NAME = 'IntentManager';

/**
 * Default state for the Intent Manager Controller
 */
export const DEFAULT_INTENT_MANAGER_CONTROLLER_STATE = {
  intents: {},
  intentHistory: [],
};

/**
 * Default polling interval for intent status updates (5 seconds)
 */
export const DEFAULT_POLLING_INTERVAL_MS = 5000;

/**
 * Maximum number of retry attempts for intent execution
 */
export const MAX_RETRY_ATTEMPTS = 3;

/**
 * Timeout for intent execution (5 minutes)
 */
export const INTENT_EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Maximum number of intents to keep in history
 */
export const MAX_INTENT_HISTORY_SIZE = 100;
