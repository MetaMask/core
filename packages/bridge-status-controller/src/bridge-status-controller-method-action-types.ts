/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { BridgeStatusController } from './bridge-status-controller.js';

export type BridgeStatusControllerStartPollingForBridgeTxStatusAction = {
  type: `BridgeStatusController:startPollingForBridgeTxStatus`;
  handler: BridgeStatusController['startPollingForBridgeTxStatus'];
};

export type BridgeStatusControllerWipeBridgeStatusAction = {
  type: `BridgeStatusController:wipeBridgeStatus`;
  handler: BridgeStatusController['wipeBridgeStatus'];
};

export type BridgeStatusControllerResetStateAction = {
  type: `BridgeStatusController:resetState`;
  handler: BridgeStatusController['resetState'];
};

export type BridgeStatusControllerSubmitTxAction = {
  type: `BridgeStatusController:submitTx`;
  handler: BridgeStatusController['submitTx'];
};

export type BridgeStatusControllerSubmitIntentAction = {
  type: `BridgeStatusController:submitIntent`;
  handler: BridgeStatusController['submitIntent'];
};

export type BridgeStatusControllerSubmitBatchSellAction = {
  type: `BridgeStatusController:submitBatchSell`;
  handler: BridgeStatusController['submitBatchSell'];
};

export type BridgeStatusControllerRestartPollingForFailedAttemptsAction = {
  type: `BridgeStatusController:restartPollingForFailedAttempts`;
  handler: BridgeStatusController['restartPollingForFailedAttempts'];
};

export type BridgeStatusControllerGetBridgeHistoryItemByTxMetaIdAction = {
  type: `BridgeStatusController:getBridgeHistoryItemByTxMetaId`;
  handler: BridgeStatusController['getBridgeHistoryItemByTxMetaId'];
};

/**
 * Union of all BridgeStatusController action types.
 */
export type BridgeStatusControllerMethodActions =
  | BridgeStatusControllerStartPollingForBridgeTxStatusAction
  | BridgeStatusControllerWipeBridgeStatusAction
  | BridgeStatusControllerResetStateAction
  | BridgeStatusControllerSubmitTxAction
  | BridgeStatusControllerSubmitIntentAction
  | BridgeStatusControllerSubmitBatchSellAction
  | BridgeStatusControllerRestartPollingForFailedAttemptsAction
  | BridgeStatusControllerGetBridgeHistoryItemByTxMetaIdAction;
