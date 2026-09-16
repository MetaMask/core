import type { TransactionControllerOptions } from '@metamask/transaction-controller';

export type TransactionControllerInstanceOptions = Omit<
  TransactionControllerOptions,
  'disableSwaps' | 'hooks' | 'messenger' | 'state'
> & {
  disableSwaps?: boolean;
  hooks?: TransactionControllerOptions['hooks'];
};
