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
import type { Hex } from '@metamask/utils';

import type {
  BridgeStatusControllerMessenger,
  FetchFunction,
  QuoteAndTxMetadata,
  StartPollingForBridgeTxStatusArgs,
} from '../types';

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
  BatchSellTradesResponseType extends
    | BatchSellTradesResponse
    | undefined
    | null = BatchSellTradesResponse | undefined | null,
> = {
  /**
   * The response from obtainGaslessBatch API containing submittable transactions and their fees
   */
  batchSellTrades: BatchSellTradesResponseType;
  /**
   * The function to add a transaction batch to the {@link TransactionControllers}
   */
  addTransactionBatchFn: TransactionController['addTransactionBatch'];
  isBridgeTx: boolean;
  isDelegatedAccount: boolean;
  /**
   * Whether the STX is enabled in the wallet. Does not necessarily mean that
   * STX will be used to submit the transaction.
   */
  isStxEnabled: boolean;
  messenger: BridgeStatusControllerMessenger;
  quoteResponses: (QuoteResponse<TradeType, TradeType> & QuoteMetadata)[];
  /**
   * Set to true so hardware wallets get prompted for approval on mobile
   */
  requireApproval: boolean;
  selectedAccount: AccountsControllerState['internalAccounts']['accounts'][string];
  traceFn: TraceCallback;
  // Used for intent transactions
  fetchFn: FetchFunction;
  clientId: BridgeClientId;
  bridgeApiBaseUrl: string;
  /**
   * The batch ID of the transaction batch passed to the addTransactionBatchFn
   * This is only used for batch-sell transactions.
   */
  batchId?: Hex;
};
