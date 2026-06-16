/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SmartTransactionsController } from './SmartTransactionsController';

export type SmartTransactionsControllerCheckPollAction = {
  type: `SmartTransactionsController:checkPoll`;
  handler: SmartTransactionsController['checkPoll'];
};

export type SmartTransactionsControllerInitializeSmartTransactionsForChainIdAction =
  {
    type: `SmartTransactionsController:initializeSmartTransactionsForChainId`;
    handler: SmartTransactionsController['initializeSmartTransactionsForChainId'];
  };

export type SmartTransactionsControllerPollAction = {
  type: `SmartTransactionsController:poll`;
  handler: SmartTransactionsController['poll'];
};

export type SmartTransactionsControllerStopAction = {
  type: `SmartTransactionsController:stop`;
  handler: SmartTransactionsController['stop'];
};

export type SmartTransactionsControllerSetOptInStateAction = {
  type: `SmartTransactionsController:setOptInState`;
  handler: SmartTransactionsController['setOptInState'];
};

export type SmartTransactionsControllerTrackStxStatusChangeAction = {
  type: `SmartTransactionsController:trackStxStatusChange`;
  handler: SmartTransactionsController['trackStxStatusChange'];
};

export type SmartTransactionsControllerIsNewSmartTransactionAction = {
  type: `SmartTransactionsController:isNewSmartTransaction`;
  handler: SmartTransactionsController['isNewSmartTransaction'];
};

export type SmartTransactionsControllerUpdateSmartTransactionAction = {
  type: `SmartTransactionsController:updateSmartTransaction`;
  handler: SmartTransactionsController['updateSmartTransaction'];
};

export type SmartTransactionsControllerUpdateSmartTransactionsAction = {
  type: `SmartTransactionsController:updateSmartTransactions`;
  handler: SmartTransactionsController['updateSmartTransactions'];
};

export type SmartTransactionsControllerFetchSmartTransactionsStatusAction = {
  type: `SmartTransactionsController:fetchSmartTransactionsStatus`;
  handler: SmartTransactionsController['fetchSmartTransactionsStatus'];
};

export type SmartTransactionsControllerClearFeesAction = {
  type: `SmartTransactionsController:clearFees`;
  handler: SmartTransactionsController['clearFees'];
};

export type SmartTransactionsControllerGetFeesAction = {
  type: `SmartTransactionsController:getFees`;
  handler: SmartTransactionsController['getFees'];
};

export type SmartTransactionsControllerSubmitSignedTransactionsAction = {
  type: `SmartTransactionsController:submitSignedTransactions`;
  handler: SmartTransactionsController['submitSignedTransactions'];
};

export type SmartTransactionsControllerCancelSmartTransactionAction = {
  type: `SmartTransactionsController:cancelSmartTransaction`;
  handler: SmartTransactionsController['cancelSmartTransaction'];
};

/**
 * Fetches the liveness status of Smart Transactions for a given chain.
 *
 * @param options - The options object.
 * @param options.chainId - The chain ID to fetch liveness for. Preferred over networkClientId.
 * @param options.networkClientId - The network client ID to derive chain ID from.
 * @returns A promise that resolves to the liveness status.
 */
export type SmartTransactionsControllerFetchLivenessAction = {
  type: `SmartTransactionsController:fetchLiveness`;
  handler: SmartTransactionsController['fetchLiveness'];
};

export type SmartTransactionsControllerSetStatusRefreshIntervalAction = {
  type: `SmartTransactionsController:setStatusRefreshInterval`;
  handler: SmartTransactionsController['setStatusRefreshInterval'];
};

export type SmartTransactionsControllerGetTransactionsAction = {
  type: `SmartTransactionsController:getTransactions`;
  handler: SmartTransactionsController['getTransactions'];
};

export type SmartTransactionsControllerGetSmartTransactionByMinedTxHashAction =
  {
    type: `SmartTransactionsController:getSmartTransactionByMinedTxHash`;
    handler: SmartTransactionsController['getSmartTransactionByMinedTxHash'];
  };

export type SmartTransactionsControllerWipeSmartTransactionsAction = {
  type: `SmartTransactionsController:wipeSmartTransactions`;
  handler: SmartTransactionsController['wipeSmartTransactions'];
};

/**
 * Union of all SmartTransactionsController action types.
 */
export type SmartTransactionsControllerMethodActions =
  | SmartTransactionsControllerCheckPollAction
  | SmartTransactionsControllerInitializeSmartTransactionsForChainIdAction
  | SmartTransactionsControllerPollAction
  | SmartTransactionsControllerStopAction
  | SmartTransactionsControllerSetOptInStateAction
  | SmartTransactionsControllerTrackStxStatusChangeAction
  | SmartTransactionsControllerIsNewSmartTransactionAction
  | SmartTransactionsControllerUpdateSmartTransactionAction
  | SmartTransactionsControllerUpdateSmartTransactionsAction
  | SmartTransactionsControllerFetchSmartTransactionsStatusAction
  | SmartTransactionsControllerClearFeesAction
  | SmartTransactionsControllerGetFeesAction
  | SmartTransactionsControllerSubmitSignedTransactionsAction
  | SmartTransactionsControllerCancelSmartTransactionAction
  | SmartTransactionsControllerFetchLivenessAction
  | SmartTransactionsControllerSetStatusRefreshIntervalAction
  | SmartTransactionsControllerGetTransactionsAction
  | SmartTransactionsControllerGetSmartTransactionByMinedTxHashAction
  | SmartTransactionsControllerWipeSmartTransactionsAction;
