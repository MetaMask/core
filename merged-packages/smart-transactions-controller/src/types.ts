/** API */

export enum APIType {
  'GET_FEES',
  'SUBMIT_TRANSACTIONS',
  'CANCEL',
  'BATCH_STATUS',
  'LIVENESS',
}

/** SmartTransactions */

export enum SmartTransactionMinedTx {
  NOT_MINED = 'not_mined',
  SUCCESS = 'success',
  CANCELLED = 'cancelled',
  REVERTED = 'reverted',
  UNKNOWN = 'unknown',
}

export enum SmartTransactionCancellationReason {
  WOULD_REVERT = 'would_revert',
  TOO_CHEAP = 'too_cheap',
  DEADLINE_MISSED = 'deadline_missed',
  INVALID_NONCE = 'invalid_nonce',
  USER_CANCELLED = 'user_cancelled',
  NOT_CANCELLED = 'not_cancelled',
}

export enum SmartTransactionStatuses {
  PENDING = 'pending',
  SUCCESS = 'success',
  REVERTED = 'reverted',
  UNKNOWN = 'unknown',
  CANCELLED_WOULD_REVERT = 'cancelled_would_revert',
  CANCELLED_TOO_CHEAP = 'cancelled_too_cheap',
  CANCELLED_DEADLINE_MISSED = 'cancelled_deadline_missed',
  CANCELLED_INVALID_NONCE = 'cancelled_invalid_nonce',
  CANCELLED_USER_CANCELLED = 'cancelled_user_cancelled',
  RESOLVED = 'resolved',
}

export const cancellationReasonToStatusMap = {
  [SmartTransactionCancellationReason.WOULD_REVERT]:
    SmartTransactionStatuses.CANCELLED_WOULD_REVERT,
  [SmartTransactionCancellationReason.TOO_CHEAP]:
    SmartTransactionStatuses.CANCELLED_TOO_CHEAP,
  [SmartTransactionCancellationReason.DEADLINE_MISSED]:
    SmartTransactionStatuses.CANCELLED_DEADLINE_MISSED,
  [SmartTransactionCancellationReason.INVALID_NONCE]:
    SmartTransactionStatuses.CANCELLED_INVALID_NONCE,
  [SmartTransactionCancellationReason.USER_CANCELLED]:
    SmartTransactionStatuses.CANCELLED_USER_CANCELLED,
};

export interface SmartTransactionsStatus {
  error?: string;
  cancellationFeeWei: number;
  cancellationReason?: SmartTransactionCancellationReason;
  deadlineRatio: number;
  minedHash: string | undefined;
  minedTx: SmartTransactionMinedTx;
}

export interface SmartTransaction {
  uuid: string;
  chainId?: string;
  destinationTokenAddress?: string;
  destinationTokenDecimals?: string;
  destinationTokenSymbol?: string;
  history?: any;
  metamaskNetworkId?: string;
  nonceDetails?: any;
  origin?: string;
  preTxBalance?: string;
  status?: string;
  statusMetadata?: SmartTransactionsStatus;
  sourceTokenSymbol?: string;
  swapMetaData?: any;
  swapTokenValue?: string;
  time?: number;
  txParams?: any;
  type?: string;
  confirmed?: boolean;
  cancellable?: boolean;
}

export interface Fee {
  maxFeePerGas: number;
  maxPriorityFeePerGas: number;
}

// TODO: maybe grab the type from transactions controller?
export type UnsignedTransaction = any;

// TODO
export type SignedTransaction = any;

// TODO
export type SignedCanceledTransaction = any;
