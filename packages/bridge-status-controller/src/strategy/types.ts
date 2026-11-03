import type {
  BatchSellTradesResponse,
  SwapTraceFunction,
  QuoteMetadata,
  QuoteResponseV1,
  Trade,
  TxData,
} from '@metamask/bridge-controller';
import type {
  TransactionController,
  TransactionMeta,
} from '@metamask/transaction-controller';

import type { TraceName } from '../constants.js';
import type {
  BridgeHistoryItem,
  BridgeStatusControllerMessenger,
  FetchFunction,
  QuoteAndTxMetadata,
  StartPollingForBridgeTxStatusArgs,
  SubmitStrategyParamsJson,
} from '../types.js';

export enum SubmitStep {
  /**
   * Adds quote and submission data to BridgeStatusController's `txHistory`
   */
  AddHistoryItem = 'addHistoryItem',
  /**
   * Rekeys the history item keyed by the old history key to the new history key,
   * and merges in the tradeMeta's id and hash
   */
  RekeyHistoryItem = 'rekeyHistoryItem',
  /**
   * Triggers polling for the transaction's status
   */
  StartPolling = 'startPolling',
  /**
   * Publishes the Unified SwapBridge Completed metrics event
   */
  PublishCompletedEvent = 'publishCompletedEvent',
  /**
   * Sets the tradeMeta returned to the client after submission
   */
  SetTradeMeta = 'setTradeMeta',
  /**
   * Updates the transaction type of batch transactions to swap/bridge/swapApproval/bridgeApproval
   * for display purposes.
   */
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
        quoteResponse: QuoteResponseV1 & QuoteMetadata;
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
        tradeMeta?: TransactionMeta;
        historyItemOverrides?: Partial<
          Pick<BridgeHistoryItem, 'approvalTxId' | 'quoteIds' | 'quote'>
        >;
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
  BatchSellTradesResponseType extends BatchSellTradesResponse | null =
    BatchSellTradesResponse | null,
> = {
  /**
   * The function to add a transaction batch to the {@link TransactionControllers}
   */
  addTransactionBatchFn: TransactionController['addTransactionBatch'];
  messenger: BridgeStatusControllerMessenger;
  traceFn: SwapTraceFunction<TraceName>;
  // Used for intent transactions
  fetchFn: FetchFunction;
} & SubmitStrategyParamsJson<TradeType, BatchSellTradesResponseType>;
