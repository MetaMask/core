import type { AccountsControllerState } from '@metamask/accounts-controller';
import type {
  BridgeClientId,
  QuoteMetadata,
  QuoteResponse,
  Trade,
  TxData,
} from '@metamask/bridge-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import type {
  TransactionController,
  TransactionMeta,
} from '@metamask/transaction-controller';

import type {
  BridgeStatusControllerMessenger,
  FetchFunction,
  StartPollingForBridgeTxStatusArgs,
} from '../types';

export enum SubmitStep {
  AddHistoryItem = 'addHistoryItem',
  RekeyHistoryItem = 'rekeyHistoryItem',
  StartPolling = 'startPolling',
  PublishCompletedEvent = 'publishCompletedEvent',
  SetTradeMeta = 'setTradeMeta',
}

/**
 * Any possible result returned by steps in a submission strategy. These can be returned in any order.
 */
export type SubmitStepResult =
  | {
      type: SubmitStep.AddHistoryItem;
      payload: Pick<
        StartPollingForBridgeTxStatusArgs,
        'approvalTxId' | 'bridgeTxMeta' | 'originalTransactionId' | 'actionId'
      > & {
        historyKey: string;
      };
    }
  | {
      type: SubmitStep.RekeyHistoryItem;
      payload: {
        /** Usually the actionId of the preceeding `approval` transaction */
        oldKey: string;
        /** Usually the txMeta.id of the `trade` transaction */
        newKey: string;
        /** The {@link TransactionMeta} for the `trade` transaction after it has been submitted successfully */
        tradeMeta: TransactionMeta;
      };
    }
  | {
      type: SubmitStep.StartPolling;
      /** The `txHistory` key of the transaction to start polling for */
      payload: string;
    }
  | {
      type: SubmitStep.PublishCompletedEvent;
      /** The `txHistory` key of the transaction that has been submitted successfully */
      payload: string;
    }
  | {
      type: SubmitStep.SetTradeMeta;
      /** The {@link TransactionMeta} for the transaction that has been submitted successfully */
      payload: TransactionMeta;
    };

/**
 * The parameters for the submission flow
 */
export type SubmitStrategyParams<TradeType extends Trade = TxData> = {
  addTransactionBatchFn: TransactionController['addTransactionBatch'];
  isBridgeTx: boolean;
  isDelegatedAccount: boolean;
  isStxEnabledOnClient: boolean;
  messenger: BridgeStatusControllerMessenger;
  quoteResponse: QuoteResponse<TradeType, TradeType> & QuoteMetadata;
  requireApproval: boolean;
  selectedAccount: AccountsControllerState['internalAccounts']['accounts'][string];
  traceFn: TraceCallback;
  // Used for intent transactions
  fetchFn: FetchFunction;
  clientId: BridgeClientId;
  bridgeApiBaseUrl: string;
};
