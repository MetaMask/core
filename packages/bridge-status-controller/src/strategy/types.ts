import type { AccountsControllerState } from '@metamask/accounts-controller';
import type {
  BridgeClientId,
  QuoteMetadata,
  QuoteResponse,
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

/**
 * Any possible result returned by steps in a submission strategy. These can be returned in any order.
 */
export type SubmitStepResult =
  | {
      type: 'publishFailedEvent';
      payload: boolean;
    }
  | {
      type: 'addHistoryItem';
      payload: Pick<
        StartPollingForBridgeTxStatusArgs,
        'approvalTxId' | 'bridgeTxMeta' | 'originalTransactionId' | 'actionId'
      >;
    }
  | {
      type: 'rekeyHistoryItem';
      payload: {
        /** The actionId of the preceeding `approval` transaction */
        actionId: string;
        /** The {@link TransactionMeta} for the `trade` transaction after it has been submitted successfully */
        tradeMeta: TransactionMeta;
      };
    }
  | {
      type: 'startPolling';
      /** The `txHistory` key of the transaction to start polling for */
      payload: string;
    }
  | {
      type: 'publishCompletedEvent';
      /** The `txHistory` key of the transaction that has been submitted successfully */
      payload: string;
    }
  | {
      type: 'setTradeMeta';
      /** The {@link TransactionMeta} for the transaction that has been submitted successfully */
      payload: TransactionMeta;
    };

/**
 * The parameters for the submission flow
 */
export type SubmitStrategyParams = {
  addTransactionBatchFn: TransactionController['addTransactionBatch'];
  isBridgeTx: boolean;
  isDelegatedAccount: boolean;
  isStxEnabledOnClient: boolean;
  messenger: BridgeStatusControllerMessenger;
  quoteResponse: QuoteResponse & QuoteMetadata;
  requireApproval: boolean;
  selectedAccount: AccountsControllerState['internalAccounts']['accounts'][string];
  traceFn: TraceCallback;
  // Used for intent transactions
  fetchFn: FetchFunction;
  clientId: BridgeClientId;
  bridgeApiBaseUrl: string;
};

/**
 * A strategy for submitting a transaction and/or intent
 */
export type SubmitStrategy = {
  matchesFlow: (params: SubmitStrategyParams) => boolean;
  execute: (
    params: SubmitStrategyParams,
  ) => AsyncGenerator<SubmitStepResult, void, void>;
};
