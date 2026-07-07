import type { TransactionControllerOptions } from '@metamask/transaction-controller';

export type TransactionControllerInstanceOptions = Omit<
  TransactionControllerOptions,
  'messenger' | 'state'
> & { disableSwaps?: boolean };
