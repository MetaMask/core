import { TransactionType } from '@metamask/transaction-controller';

export const isSmartTransactionsEnabled = (
  txType: TransactionType,
  defaultStxPreference: boolean,
  isStxEnabledOnClient: boolean, // getSmartTransactionsEnabled selector value should be passed in
  isUserOptedInToStx?: boolean,
) => {
  // User has no opt in status, use default value from client
  return (
    txType === TransactionType.bridge &&
    (isUserOptedInToStx ?? defaultStxPreference) &&
    isStxEnabledOnClient
  );
};
