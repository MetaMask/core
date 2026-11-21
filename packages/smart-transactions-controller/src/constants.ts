export enum MetaMetricsEventName {
  StxStatusUpdated = 'STX Status Updated',
  StxConfirmed = 'STX Confirmed',
  StxConfirmationFailed = 'STX Confirmation Failed',
  ReceiveRequest = 'Receive Request',
}

export enum MetaMetricsEventCategory {
  Transactions = 'Transactions',
  Navigation = 'Navigation',
}

export enum SmartTransactionsTraceName {
  GetFees = 'Smart Transactions: Get Fees',
  SubmitTransactions = 'Smart Transactions: Submit Transactions',
  CancelTransaction = 'Smart Transactions: Cancel Transaction',
  FetchLiveness = 'Smart Transactions: Fetch Liveness',
}

/**
 * Default feature flags configuration for smart transactions.
 * Used as a fallback when remote feature flags are unavailable or invalid.
 * This is voluntarily defensive because it is applied to any network without valid configuration.
 */
export const DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS = {
  default: {
    extensionActive: false,
    mobileActive: false,
    mobileActiveIOS: false,
    mobileActiveAndroid: false,
    expectedDeadline: 45,
    maxDeadline: 150,
    extensionReturnTxHashAsap: false,
    extensionReturnTxHashAsapBatch: false,
    mobileReturnTxHashAsap: false,
    extensionSkipSmartTransactionStatusPage: false,
    gaslessBridgeWith7702Enabled: false,
    batchStatusPollingInterval: 1000,
  },
} as const;
