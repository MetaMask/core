import type { BridgeStatusControllerState } from './types';

export const REFRESH_INTERVAL_MS = 10 * 1000; // 10 seconds
export const MAX_ATTEMPTS = 7; // at 7 attempts, delay is 10:40, cumulative time is 21:10
export const DEFAULT_MAX_PENDING_HISTORY_ITEM_AGE_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

export const BRIDGE_STATUS_CONTROLLER_NAME = 'BridgeStatusController';

export const DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE: BridgeStatusControllerState =
  {
    txHistory: {},
    deferredStatusUpdates: {},
  };

export const QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
export const QUOTE_STATUS_UPDATE_RETRY_MAX_LIFETIME_MS = 12 * 60 * 60 * 1000; // 12 hours
export const QUOTE_STATUS_UPDATE_IMMEDIATE_MAX_RETRIES = 6;
export const QUOTE_STATUS_UPDATE_IMMEDIATE_RETRY_DELAY_MS = 5_000;

export enum QuoteStatusUpdateType {
  Submitted = 'SUBMITTED',
  FinalizedSuccess = 'FINALIZED_SUCCESS',
  FinalizedFailure = 'FINALIZED_FAILURE',
}

export enum SendWithRetryResult {
  Success = 'success',
  Retryable = 'retryable',
  Handled = 'handled',
}

export const BRIDGE_PROD_API_BASE_URL = 'https://bridge.api.cx.metamask.io';

export const APPROVAL_DELAY_MS = 5000;

export enum TraceName {
  BridgeTransactionApprovalCompleted = 'Bridge Transaction Approval Completed',
  BridgeTransactionCompleted = 'Bridge Transaction Completed',
  SwapTransactionApprovalCompleted = 'Swap Transaction Approval Completed',
  SwapTransactionCompleted = 'Swap Transaction Completed',
}

export enum QuoteStatusUpdateErrorType {
  QuoteNotFound = 'QUOTE_NOT_FOUND', // Http status: 404
  ConcurrentUpdate = 'CONCURRENT_UPDATE', // Http status: 409
  InvalidStatusTransaction = 'INVALID_STATUS_TRANSITION', // Http status: 400
  SrcTxHashRequiredForFinalized = 'SRC_TX_HASH_REQUIRED_FOR_FINALIZED', // Http status: 400
  PersistQuoteStatusFailed = 'PERSIST_QUOTE_STATUS_FAILED', // Http status: 400
  TransactionNotIndexed = 'TRANSACTION_NOT_INDEXED', // Http status: 409
  TxDataMissingHash = 'TX_DATA_MISSING_HASH', // Http status: 400
  TxDataMissingTrade = 'TX_DATA_MISSING_TRADE', // Http status: 400
  /** On-chain tx payload does not match the served quote (EVM calldata, SVM message, TVM raw_data_hex). */
  TxDataMismatch = 'TX_DATA_MISMATCH', // Http status: 400
  SvmTradeDeserializeFailed = 'SVM_TRADE_DESERIALIZE_FAILED', // Http status: 400
  /** Requested lifecycle status is inconsistent with observed on-chain tx status. */
  QuoteStatusOnChainMismatch = 'QUOTE_STATUS_ONCHAIN_MISMATCH', // Http status: 400
}

export enum QuoteStatusUpdateStatus {
  Served = 'SERVED',
  /** User has submitted the transaction (to be implemented). */
  Submitted = 'SUBMITTED',
  /** Transaction finalized successfully on-chain (to be implemented). */
  FinalizedSuccess = 'FINALIZED_SUCCESS',
  /** Transaction failed or reverted on-chain (to be implemented). */
  FinalizedFailed = 'FINALIZED_FAILED',
}