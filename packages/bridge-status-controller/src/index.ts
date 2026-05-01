// Export constants
export {
  REFRESH_INTERVAL_MS,
  DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE,
  BRIDGE_STATUS_CONTROLLER_NAME,
  MAX_ATTEMPTS,
} from './constants';

export type {
  FetchFunction,
  StatusRequest,
  StatusRequestDto,
  StatusRequestWithSrcTxHash,
  StatusResponse,
  RefuelStatusResponse,
  BridgeHistoryItem,
  BridgeStatusControllerState,
  BridgeStatusControllerMessenger,
  BridgeStatusControllerActions,
  BridgeStatusControllerGetStateAction,
  BridgeStatusControllerEvents,
  BridgeStatusControllerStateChangeEvent,
  StartPollingForBridgeTxStatusArgs,
  StartPollingForBridgeTxStatusArgsSerialized,
  TokenAmountValuesSerialized,
  QuoteMetadataSerialized,
} from './types';

export type {
  BridgeStatusControllerStartPollingForBridgeTxStatusAction,
  BridgeStatusControllerWipeBridgeStatusAction,
  BridgeStatusControllerResetStateAction,
  BridgeStatusControllerSubmitTxAction,
  BridgeStatusControllerSubmitIntentAction,
  BridgeStatusControllerRestartPollingForFailedAttemptsAction,
  BridgeStatusControllerGetBridgeHistoryItemByTxMetaIdAction,
} from './bridge-status-controller-method-action-types';

export { BridgeId, BridgeStatusAction } from './types';

export { BridgeStatusController } from './bridge-status-controller';
