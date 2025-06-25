/**
 * Common types for backend platform utilities.
 * Includes keyring-api compatible transaction and balance types.
 */

import type { 
  Transaction,
  AccountBalancesUpdatedEventPayload
} from '@metamask/keyring-api';

/**
 * Re-export the standard types from keyring-api
 * These are the canonical transaction formats defined in:
 * https://github.com/MetaMask/accounts/blob/main/packages/keyring-api/src/api/transaction.ts#L185-L241
 */
export type { 
  Transaction,
  TransactionType,
  TransactionStatus,
  FeeType
} from '@metamask/keyring-api';

/**
 * Re-export the standard balance event types from keyring-api
 * These are defined in:
 * https://github.com/MetaMask/accounts/blob/main/packages/keyring-api/src/events.ts#L150-L178
 */
export type { 
  AccountBalancesUpdatedEvent,
  AccountBalancesUpdatedEventPayload
} from '@metamask/keyring-api';


/**
 * Transaction confirmation message using keyring-api balance structure
 * 
 * This uses the official AccountBalancesUpdatedEventPayload structure
 * for better integration with the MetaMask keyring system.
 */
export type TransactionWithKeyringBalanceUpdate = {
  /**
   * The transaction data using the standard keyring-api Transaction format
   */
  tx: Transaction;
  
  /**
   * The updated balances using the official keyring-api balance structure
   * This follows the AccountBalancesUpdatedEventPayload format from:
   * https://github.com/MetaMask/accounts/blob/main/packages/keyring-api/src/events.ts#L150-L178
   */
  postBalances: AccountBalancesUpdatedEventPayload;
};
