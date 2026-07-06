import type {
  NestedTransactionMetadata,
  TransactionMeta,
} from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { isMusdOnMoneyAccountChain, isMusdToken } from './musd';

/**
 * Find the first nested transaction matching a given {@link TransactionType}.
 *
 * @param transactionMeta - The transaction to search.
 * @param targetType - The nested transaction type to look for.
 * @returns The first matching nested transaction, or undefined if none exists.
 */
export function nestedTxWithType(
  transactionMeta: TransactionMeta,
  targetType: TransactionType,
): NestedTransactionMetadata | undefined {
  return transactionMeta.nestedTransactions?.find(
    (nested) => nested.type === targetType,
  );
}

/**
 * Check whether a transaction is a Money Account deposit, either as its
 * top-level type or nested inside a batch.
 *
 * @param transactionMeta - The transaction to check.
 * @returns Whether the transaction is a Money Account deposit.
 */
export function isMoneyDepositTx(transactionMeta: TransactionMeta): boolean {
  return (
    transactionMeta.type === TransactionType.moneyAccountDeposit ||
    Boolean(
      nestedTxWithType(transactionMeta, TransactionType.moneyAccountDeposit),
    )
  );
}

/**
 * Check whether a transaction is a Money Account withdrawal, either as its
 * top-level type or nested inside a batch.
 *
 * @param transactionMeta - The transaction to check.
 * @returns Whether the transaction is a Money Account withdrawal.
 */
export function isMoneyWithdrawTx(transactionMeta: TransactionMeta): boolean {
  return (
    transactionMeta.type === TransactionType.moneyAccountWithdraw ||
    Boolean(
      nestedTxWithType(transactionMeta, TransactionType.moneyAccountWithdraw),
    )
  );
}

/**
 * Check whether a Money Account withdrawal lands as mUSD (single-row hero and
 * "Sent mUSD" title). Cross-token destinations (e.g. USDC) return false.
 * Chain is irrelevant — only the destination token matters.
 *
 * @param transactionMeta - The transaction to check.
 * @returns Whether the transaction is an mUSD-destination Money withdrawal.
 */
export function isSingleRowMusdMoneyWithdraw(
  transactionMeta: TransactionMeta,
): boolean {
  if (!isMoneyWithdrawTx(transactionMeta)) {
    return false;
  }
  return isMusdToken(transactionMeta.metamaskPay?.tokenAddress);
}

/**
 * Check whether a transaction is a Money Account deposit or withdrawal.
 *
 * @param transactionMeta - The transaction to check.
 * @returns Whether the transaction touches the Money Account.
 */
export function isMoneyAccountTx(transactionMeta: TransactionMeta): boolean {
  return (
    isMoneyDepositTx(transactionMeta) || isMoneyWithdrawTx(transactionMeta)
  );
}

/**
 * Perps/Predict deposit parent types (money → service). When funded from the
 * Money account these are paid with mUSD via MetaMask Pay; the on-chain deposit
 * is signed from the user's EOA on the service chain (Arbitrum/Polygon).
 */
export const PERPS_PREDICT_DEPOSIT_TYPES: TransactionType[] = [
  TransactionType.perpsDeposit,
  TransactionType.perpsDepositAndOrder,
  TransactionType.predictDeposit,
  TransactionType.predictDepositAndOrder,
];

/**
 * Perps/Predict withdraw types (service → money). When the destination is the
 * Money account these arrive as mUSD on Monad. The withdraw is wrapped in an
 * EIP-7702 `batch`, so the type sits in `nestedTransactions`.
 */
export const PERPS_PREDICT_WITHDRAW_TYPES: TransactionType[] = [
  TransactionType.perpsWithdraw,
  TransactionType.predictWithdraw,
];

/**
 * Resolve the Perps/Predict deposit or withdraw type for a transaction,
 * unwrapping an EIP-7702 `batch` whose money-moving call sits in
 * `nestedTransactions`.
 *
 * @param transactionMeta - The transaction to inspect.
 * @returns The service transaction type, or undefined for other transactions.
 */
function effectiveServiceType(
  transactionMeta: TransactionMeta,
): TransactionType | undefined {
  const serviceTypes = [
    ...PERPS_PREDICT_DEPOSIT_TYPES,
    ...PERPS_PREDICT_WITHDRAW_TYPES,
  ];
  if (transactionMeta.type && serviceTypes.includes(transactionMeta.type)) {
    return transactionMeta.type;
  }
  return transactionMeta.nestedTransactions?.find(
    (nested) => nested.type && serviceTypes.includes(nested.type),
  )?.type;
}

/**
 * Check whether the `metamaskPay` token is mUSD on the Money account chain
 * (Monad). For a deposit this is the source the Money account paid; for a
 * withdraw (`isPostQuote`) it's the destination — either way it links the
 * transaction to the Money account.
 *
 * @param transactionMeta - The transaction to check.
 * @returns Whether the pay token is mUSD on the Money account chain.
 */
function isMusdMoneyPayToken(transactionMeta: TransactionMeta): boolean {
  return isMusdOnMoneyAccountChain(
    transactionMeta.metamaskPay?.tokenAddress,
    transactionMeta.metamaskPay?.chainId,
  );
}

/**
 * Check for a Perps/Predict deposit funded from the Money account — from the
 * perspective of the Money account this is a 'Send'. The transaction `from` is
 * the user's EOA, not the Money account, so it's matched via the mUSD pay
 * token rather than the address.
 *
 * @param transactionMeta - The transaction to check.
 * @returns Whether the transaction is a Money-funded Perps/Predict deposit.
 */
export function isPerpsPredictMoneyDeposit(
  transactionMeta: TransactionMeta,
): boolean {
  const type = effectiveServiceType(transactionMeta);
  return (
    Boolean(type) &&
    PERPS_PREDICT_DEPOSIT_TYPES.includes(type as TransactionType) &&
    isMusdMoneyPayToken(transactionMeta)
  );
}

/**
 * Check for a Perps/Predict withdraw landing in the Money account — an inflow
 * ("Deposited").
 *
 * @param transactionMeta - The transaction to check.
 * @returns Whether the transaction is a Perps/Predict withdraw into the Money
 * account.
 */
export function isPerpsPredictMoneyWithdraw(
  transactionMeta: TransactionMeta,
): boolean {
  const type = effectiveServiceType(transactionMeta);
  return (
    Boolean(type) &&
    PERPS_PREDICT_WITHDRAW_TYPES.includes(type as TransactionType) &&
    isMusdMoneyPayToken(transactionMeta)
  );
}

/**
 * Check whether a transaction is a Perps/Predict ↔ Money transfer in either
 * direction.
 *
 * @param transactionMeta - The transaction to check.
 * @returns Whether the transaction moves funds between the Money account and
 * a Perps/Predict service.
 */
export function isPerpsPredictMoneyActivity(
  transactionMeta: TransactionMeta,
): boolean {
  return (
    isPerpsPredictMoneyDeposit(transactionMeta) ||
    isPerpsPredictMoneyWithdraw(transactionMeta)
  );
}

/**
 * Resolve the service family for a Perps/Predict ↔ Money transaction, used to
 * label the activity row's subtitle.
 *
 * @param transactionMeta - The transaction to inspect.
 * @returns 'perps' or 'predict' for service transactions, undefined otherwise.
 */
export function perpsPredictServiceFamily(
  transactionMeta: TransactionMeta,
): 'perps' | 'predict' | undefined {
  const type = effectiveServiceType(transactionMeta);
  if (
    type === TransactionType.perpsDeposit ||
    type === TransactionType.perpsDepositAndOrder ||
    type === TransactionType.perpsWithdraw
  ) {
    return 'perps';
  }
  if (
    type === TransactionType.predictDeposit ||
    type === TransactionType.predictDepositAndOrder ||
    type === TransactionType.predictWithdraw
  ) {
    return 'predict';
  }
  return undefined;
}

/**
 * Resolve source and destination chain IDs for a MetaMask Pay transaction.
 *
 * `metamaskPay.chainId` is the payment-token chain. Its role flips based on
 * `isPostQuote`: for withdrawals (post-quote) it's the destination, for
 * deposits it's the source.
 *
 * @param transactionMeta - The transaction to inspect.
 * @returns The source and destination chain ids of the payment.
 */
export function getMMPayChainIds(transactionMeta: TransactionMeta): {
  sourceChainId: Hex | undefined;
  destinationChainId: Hex | undefined;
} {
  const local = transactionMeta.chainId;
  const pay = transactionMeta.metamaskPay?.chainId;

  return transactionMeta.metamaskPay?.isPostQuote
    ? { sourceChainId: local, destinationChainId: pay }
    : { sourceChainId: pay ?? local, destinationChainId: local };
}
