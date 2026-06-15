import type { TransactionControllerOptions } from '@metamask/transaction-controller';

export type TransactionControllerInstanceOptions = Partial<
  Omit<TransactionControllerOptions, 'messenger' | 'state'>
>;
