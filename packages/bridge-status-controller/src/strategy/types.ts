import type { AccountsControllerState } from '@metamask/accounts-controller';
import type {
  BatchSellTradesResponse,
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
  QuoteAndTxMetadata,
  StartPollingForBridgeTxStatusArgs,
} from '../types';

export enum SubmitStep {
  AddHistoryItem = 'addHistoryItem',
  RekeyHistoryItem = 'rekeyHistoryItem',
  StartPolling = 'startPolling',
  PublishCompletedEvent = 'publishCompletedEvent',
  SetTradeMeta = 'setTradeMeta',
  UpdateBatchTransactions = 'updateBatchTransactions',
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
        quoteResponse: QuoteResponse & QuoteMetadata;
        batchSellData?: BatchSellTradesResponse;
        quoteIds?: string[];
      };
    }
  | {
      type: SubmitStep.RekeyHistoryItem;
      payload: {
        /** Usually the actionId of the preceeding `approval` transaction */
        oldHistoryKey: string;
        /** Usually the txMeta.id of the `trade` transaction */
        newHistoryKey: string;
        /** The {@link TransactionMeta} for the `trade` transaction after it has been submitted successfully */
        tradeMeta: TransactionMeta;
      };
    }
  | {
      type: SubmitStep.StartPolling;
      payload: {
        /** The `txHistory` key of the transaction to start polling for */
        historyKey: string;
      };
    }
  | {
      type: SubmitStep.PublishCompletedEvent;
      payload: {
        /** The `txHistory` key of the transaction that has been submitted successfully */
        historyKey: string;
      };
    }
  | {
      type: SubmitStep.SetTradeMeta;
      /** The {@link TransactionMeta} for the transaction that has been submitted successfully */
      payload: {
        tradeMeta: TransactionMeta;
      };
    }
  | {
      type: SubmitStep.UpdateBatchTransactions;
      payload: {
        quoteAndTxMetas: QuoteAndTxMetadata[];
      };
    };

/**
 * The parameters for the submission flow
 */
export type SubmitStrategyParams<
  TradeType extends Trade = TxData,
  BatchSellTradesResponseType extends BatchSellTradesResponse | undefined =
    | BatchSellTradesResponse
    | undefined,
> = {
  batchSellTrades: BatchSellTradesResponseType;
  addTransactionBatchFn: TransactionController['addTransactionBatch'];
  isBridgeTx: boolean;
  isDelegatedAccount: boolean;
  isStxEnabled: boolean;
  messenger: BridgeStatusControllerMessenger;
  quoteResponses: (QuoteResponse<TradeType, TradeType> & QuoteMetadata)[];
  requireApproval: boolean;
  selectedAccount: AccountsControllerState['internalAccounts']['accounts'][string];
  traceFn: TraceCallback;
  // Used for intent transactions
  fetchFn: FetchFunction;
  clientId: BridgeClientId;
  bridgeApiBaseUrl: string;
};
