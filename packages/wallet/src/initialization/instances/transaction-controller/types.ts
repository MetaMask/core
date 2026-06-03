import type { TransactionControllerOptions } from '@metamask/transaction-controller';

export type TransactionControllerInstanceOptions = Omit<
  TransactionControllerOptions,
  'incomingTransactions' | 'messenger' | 'state'
>;
