// Export custom error classes
export {
  QuoteStatusUpdateError,
  QuoteStatusGetError,
} from './quote-status-manager/errors.js';
export { BaseQuoteStatusUpdateErrorTypes } from './quote-status-manager/constants.js';

// Export constants
export {
  REFRESH_INTERVAL_MS,
  DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE,
  BRIDGE_STATUS_CONTROLLER_NAME,
  MAX_ATTEMPTS,
} from './constants.js';

export type {
  FetchFunction,
  StatusRequest,
  StatusRequestDto,
  StatusRequestWithSrcTxHash,
  StatusResponse,
  RefuelStatusResponse,
  BridgeHistoryItem,
  BridgeStatusControllerState,
  QuoteStatusPersistEntry,
  BridgeStatusControllerMessenger,
  BridgeStatusControllerActions,
  BridgeStatusControllerGetStateAction,
  BridgeStatusControllerEvents,
  BridgeStatusControllerStateChangeEvent,
  StartPollingForBridgeTxStatusArgs,
  StartPollingForBridgeTxStatusArgsSerialized,
  TokenAmountValuesSerialized,
  QuoteMetadataSerialized,
} from './types.js';

export type {
  BridgeStatusControllerStartPollingForBridgeTxStatusAction,
  BridgeStatusControllerWipeBridgeStatusAction,
  BridgeStatusControllerResetStateAction,
  BridgeStatusControllerSubmitTxAction,
  BridgeStatusControllerSubmitIntentAction,
  BridgeStatusControllerRestartPollingForFailedAttemptsAction,
  BridgeStatusControllerGetBridgeHistoryItemByTxMetaIdAction,
} from './bridge-status-controller-method-action-types.js';

export { BridgeId, BridgeStatusAction } from './types.js';

export { BridgeStatusController } from './bridge-status-controller.js';

export {
  getBatchSellHistoryItemsForTxHash,
  isBatchSellHistoryItem,
} from './utils/history.js';
