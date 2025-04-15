import { TransactionType } from '@metamask/transaction-controller';

/**
 * Check if smart transactions are enabled
 *
 * @param txType - The type of transaction
 * @param defaultStxPreference - The default preference for smart transactions for the client
 * @param isStxEnabledOnClient - Whether smart transactions are enabled on the client
 * @param isUserOptedInToStx - Whether the user has opted in to smart transactions
 * @returns Whether smart transactions should be used for the transaction
 */
export const isSmartTransactionsEnabled = (
  txType: TransactionType,
  defaultStxPreference: boolean,
  isStxEnabledOnClient: boolean,
  isUserOptedInToStx?: boolean,
) => {
  return (
    txType === TransactionType.bridge &&
    // If user has no opt in status, use default value from client
    (isUserOptedInToStx ?? defaultStxPreference) &&
    isStxEnabledOnClient
  );
};
