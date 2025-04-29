// Export constants
export {
  REFRESH_INTERVAL_MS,
  DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE,
  BRIDGE_STATUS_CONTROLLER_NAME,
} from './constants';

export type {
  FetchFunction,
  StatusRequest,
  StatusRequestDto,
  StatusRequestWithSrcTxHash,
  Asset,
  SrcChainStatus,
  DestChainStatus,
  StatusResponse,
  RefuelStatusResponse,
  RefuelData,
  BridgeHistoryItem,
  BridgeStatusControllerState,
  BridgeStatusControllerMessenger,
  BridgeStatusControllerActions,
  BridgeStatusControllerGetStateAction,
  BridgeStatusControllerStartPollingForBridgeTxStatusAction,
  BridgeStatusControllerWipeBridgeStatusAction,
  BridgeStatusControllerResetStateAction,
  BridgeStatusControllerEvents,
  BridgeStatusControllerStateChangeEvent,
  BridgeStatusControllerBridgeTransactionCompleteEvent,
  BridgeStatusControllerBridgeTransactionFailedEvent,
  StartPollingForBridgeTxStatusArgs,
  StartPollingForBridgeTxStatusArgsSerialized,
  TokenAmountValuesSerialized,
  QuoteMetadataSerialized,
} from './types';

export { BridgeId, FeeType, ActionTypes, BridgeStatusAction } from './types';

export { BridgeStatusController } from './bridge-status-controller';

export { getTxMetaFields } from './utils/transaction';
