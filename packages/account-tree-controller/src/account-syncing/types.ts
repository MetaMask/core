import type { AccountGroupObject } from 'src/group';
import type { AccountWalletEntropyObject } from 'src/wallet';

export type UserStorageSyncedWallet = Omit<
  AccountWalletEntropyObject['metadata'],
  'entropy'
>;

export type UserStorageSyncedWalletGroup = Omit<
  AccountGroupObject['metadata'],
  'entropy'
> & {
  groupIndex: number;
};
