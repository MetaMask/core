import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';

/**
 * Context for an account.
 */
export type AccountContext = {
  /**
   * Wallet ID associated to that account.
   */
  walletId: AccountWalletId;

  /**
   * Account group ID associated to that account.
   */
  groupId: AccountGroupId;
};
