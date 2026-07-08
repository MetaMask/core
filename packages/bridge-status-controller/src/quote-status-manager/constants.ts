/**
 * How often the manager re-processes entries that have not yet reached a
 * terminal state (`Completed`/`Expired`).
 *
 * Drives the periodic retry timer in `QuoteStatusUpdateManager`: on each tick
 * every non-terminal entry is re-sent to the backend until it is accepted or
 * evicted. The timer only runs while there is outstanding work.
 */
export const QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Maximum lifetime of a tracked quote-status entry, measured from when it was
 * created.
 *
 * Once an entry is older than this it is considered `Expired`, evicted from the
 * store on the next read, and never retried again. This bounds how long the
 * manager keeps trying to report a status that the backend may never accept.
 */
export const QUOTE_STATUS_UPDATE_ENTRY_TTL = 3 * 60 * 60 * 1000; // 3 hours

/**
 * Maximum age of a persisted `txHistory` item, measured from its `startTime`,
 * that is still eligible to have its quote-status entry backfilled on
 * startup.
 *
 * Used by `#seedQuoteStatusEntriesFromHistory` to skip history items whose
 * `startTime` predates this window: the backend's quote data itself is only
 * retained for a bounded period, so reporting a status for a quote older than
 * that would be rejected regardless of how fresh the locally-recreated entry
 * is. This is intentionally longer than `QUOTE_STATUS_UPDATE_ENTRY_TTL`
 * (which bounds an entry's local retry lifetime from creation, not the
 * underlying quote's age) so that swaps/bridges left in-flight across
 * multiple closed sessions still get a chance to be resumed.
 */
export const QUOTE_STATUS_BACKFILL_WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Quote lifecycle statuses as understood by the backend `quote/updateStatus`
 * API. These are the values sent over the wire (and echoed back in error
 * responses).
 */
export enum QuoteStatusBackendStatus {
  /**
   * Quote was served to the client. Unused locally, kept for parity with the backend enum.
   */
  Served = 'SERVED',
  /**
   * User has submitted the source transaction.
   */
  Submitted = 'SUBMITTED',
  /**
   * Transaction finalized successfully on-chain.
   */
  FinalizedSuccess = 'FINALIZED_SUCCESS',
  /**
   * Transaction failed or reverted on-chain.
   */
  FinalizedFailed = 'FINALIZED_FAILED',
}

/**
 * Machine-readable error `type` values returned by the backend
 * `quote/updateStatus` API on non-2xx responses. The comments record the HTTP
 * status the backend pairs with each type.
 */
export enum QuoteStatusUpdateBackendErrorType {
  QuoteNotFound = 'QUOTE_NOT_FOUND', // Http status: 404
  ConcurrentUpdate = 'CONCURRENT_UPDATE', // Http status: 409
  InvalidStatusTransaction = 'INVALID_STATUS_TRANSITION', // Http status: 400
  SrcTxHashRequiredForFinalized = 'SRC_TX_HASH_REQUIRED_FOR_FINALIZED', // Http status: 400
  PersistQuoteStatusFailed = 'PERSIST_QUOTE_STATUS_FAILED', // Http status: 400
  TransactionNotIndexed = 'TRANSACTION_NOT_INDEXED', // Http status: 409
  TxDataMissingHash = 'TX_DATA_MISSING_HASH', // Http status: 400
  TxDataMissingTrade = 'TX_DATA_MISSING_TRADE', // Http status: 400
  /**
   * On-chain tx payload does not match the served quote (EVM calldata, SVM message, TVM raw_data_hex).
   */
  TxDataMismatch = 'TX_DATA_MISMATCH', // Http status: 400
  SvmTradeDeserializeFailed = 'SVM_TRADE_DESERIALIZE_FAILED', // Http status: 400
  /**
   * Requested lifecycle status is inconsistent with observed on-chain tx status.
   */
  QuoteStatusOnChainMismatch = 'QUOTE_STATUS_ONCHAIN_MISMATCH', // Http status: 400
}

/**
 * Error types whose response payload carries no `currentStatus`. Used by the
 * response validator to define the base (non-mismatch) error response schema.
 */
export const BaseQuoteStatusUpdateErrorTypes = [
  QuoteStatusUpdateBackendErrorType.QuoteNotFound,
  QuoteStatusUpdateBackendErrorType.ConcurrentUpdate,
  QuoteStatusUpdateBackendErrorType.SrcTxHashRequiredForFinalized,
  QuoteStatusUpdateBackendErrorType.PersistQuoteStatusFailed,
  QuoteStatusUpdateBackendErrorType.TransactionNotIndexed,
  QuoteStatusUpdateBackendErrorType.TxDataMissingHash,
  QuoteStatusUpdateBackendErrorType.TxDataMissingTrade,
  QuoteStatusUpdateBackendErrorType.TxDataMismatch,
  QuoteStatusUpdateBackendErrorType.SvmTradeDeserializeFailed,
] as const;

/**
 * The full set of valid backend status values. Used by the response validator
 * to constrain the `currentStatus`/`newStatus` fields of error responses.
 */
export const QuoteStatusBackendValues = [
  QuoteStatusBackendStatus.Served,
  QuoteStatusBackendStatus.Submitted,
  QuoteStatusBackendStatus.FinalizedSuccess,
  QuoteStatusBackendStatus.FinalizedFailed,
] as const;

/**
 * Error types whose response payload includes a `currentStatus` describing the
 * backend's observed status. Used by the validator for the mismatch response
 * schema and by the manager to reconcile local state with the backend.
 */
export const QuoteStatusUpdateBackendOnChainMismatchTypes = [
  QuoteStatusUpdateBackendErrorType.InvalidStatusTransaction,
  QuoteStatusUpdateBackendErrorType.QuoteStatusOnChainMismatch,
] as const;

/**
 * Error types that represent transient backend conditions. A response with one
 * of these types is retried by `updateQuoteStatusWithRetry`; any other error
 * type is treated as non-retryable.
 */
export const QuoteStatusUpdateRetryableBackendTypes = [
  QuoteStatusUpdateBackendErrorType.ConcurrentUpdate,
  QuoteStatusUpdateBackendErrorType.TransactionNotIndexed,
];

/**
 * Local quote-status lifecycle states tracked by the state machine. These are
 * the states the manager owns; a subset maps onto backend statuses while
 * `Completed`/`Expired` are terminal, client-only states.
 */
export enum QuoteStatusState {
  /** Source transaction submitted; awaiting finalization. */
  Submitted = 'Submitted',
  /** Transaction finalized successfully on-chain. */
  FinalizedSuccess = 'FinalizedSuccess',
  /** Transaction failed or reverted on-chain. */
  FinalizedFailed = 'FinalizedFailed',
  /** Terminal: the backend accepted the final status; nothing left to report. */
  Completed = 'Completed',
  /** Terminal: the entry outlived its TTL and was abandoned. */
  Expired = 'Expired',
}

/**
 * Maps each local lifecycle state to the backend status to report for it, or
 * `null` for terminal states that require no backend update. The manager uses a
 * `null` mapping as the signal to remove the entry instead of calling the API.
 */
export const QuoteStatusStateToBackendStatus = {
  [QuoteStatusState.Submitted]: QuoteStatusBackendStatus.Submitted,
  [QuoteStatusState.FinalizedSuccess]:
    QuoteStatusBackendStatus.FinalizedSuccess,
  [QuoteStatusState.FinalizedFailed]: QuoteStatusBackendStatus.FinalizedFailed,
  [QuoteStatusState.Completed]: null,
  [QuoteStatusState.Expired]: null,
};

/**
 * Adjacency list defining the allowed forward-only transitions between
 * lifecycle states. Enforced by `QuoteStatusStateFsm`; terminal states map to
 * an empty array. Any state not present is treated as terminal.
 */
export const AllowedQuoteStatusStateTransitions: Record<
  QuoteStatusState,
  readonly QuoteStatusState[]
> = {
  [QuoteStatusState.Submitted]: [
    QuoteStatusState.FinalizedFailed,
    QuoteStatusState.FinalizedSuccess,
    QuoteStatusState.Expired,
  ],
  [QuoteStatusState.FinalizedFailed]: [
    QuoteStatusState.Completed,
    QuoteStatusState.Expired,
  ],
  [QuoteStatusState.FinalizedSuccess]: [
    QuoteStatusState.Completed,
    QuoteStatusState.Expired,
  ],
  [QuoteStatusState.Completed]: [],
  [QuoteStatusState.Expired]: [],
};

/**
 * Outcome of a retrying status fetch call. Tells the
 * manager how to proceed after an update attempt completes.
 */
export enum QuoteStatusFetchWithRetryOutcomeType {
  /** The backend accepted the update (2xx); the entry can be finalized/removed. */
  Accepted = 'accepted',
  /** All retry attempts for a retryable error were used up; back off and try again later. */
  RetryableExhausted = 'retryableExhausted',
  /** The backend returned a non-retryable error; the entry must be reconciled or evicted. */
  NonRetryable = 'nonRetryable',
  /** The request was aborted (e.g. via abort signal) before completing. */
  Interrupted = 'interrupted',
}
