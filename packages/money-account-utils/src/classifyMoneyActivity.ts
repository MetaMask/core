import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';

import type {
  MoneyActivityTitleKey,
  MoneyActivityTransactionMeta,
} from './moneyActivity';
import {
  isPerpsPredictMoneyDeposit,
  isPerpsPredictMoneyWithdraw,
} from './moneyTransactionGuards';
import { isMusdToken } from './musd';

export type MoneyActivityStatus = 'pending' | 'confirmed' | 'failed';

/**
 * Map a transaction's status onto the Money activity display status.
 *
 * @param tx - The transaction to inspect.
 * @returns The activity display status.
 */
export function getMoneyActivityStatus(
  tx: TransactionMeta,
): MoneyActivityStatus {
  switch (tx.status) {
    // `approved`/`signed` = user has confirmed but the tx is held by the
    // MetaMask Pay publish hook while a cross-chain payment (e.g. bridge)
    // completes — in-flight from the user's perspective.
    case TransactionStatus.approved:
    case TransactionStatus.signed:
    case TransactionStatus.submitted:
      return 'pending';
    case TransactionStatus.failed:
      return 'failed';
    default:
      return 'confirmed';
  }
}

export type MoneyActivityKind =
  | 'deposited'
  | 'received'
  | 'converted'
  | 'sent'
  | 'card'
  | 'cashback';

const TITLE_KEY_TO_KIND: Record<MoneyActivityTitleKey, MoneyActivityKind> = {
  deposited: 'deposited',
  received: 'received',
  card_transaction: 'card',
  converted: 'converted',
  sent: 'sent',
};

/**
 * Resolve the money-moving transaction type, unwrapping an EIP-7702 `batch`
 * whose money call sits in `nestedTransactions`.
 *
 * @param tx - The transaction to inspect.
 * @returns The effective transaction type.
 */
function resolveMoneyTransactionType(
  tx: TransactionMeta,
): TransactionType | undefined {
  if (tx.type === TransactionType.batch) {
    const nestedMoneyType = tx.nestedTransactions?.find(
      (nested) =>
        nested.type === TransactionType.moneyAccountDeposit ||
        nested.type === TransactionType.moneyAccountWithdraw,
    )?.type;
    if (nestedMoneyType) {
      return nestedMoneyType;
    }
  }
  return tx.type;
}

/**
 * Check for a `moneyAccountDeposit` funded by a fiat on-ramp (e.g. Transak),
 * not crypto.
 *
 * @param tx - The transaction to inspect.
 * @returns Whether the deposit was funded with fiat.
 */
function isFiatDeposit(tx: TransactionMeta): boolean {
  return Boolean(tx.metamaskPay?.fiat);
}

/**
 * Check for a `moneyAccountDeposit` paid with mUSD itself.
 *
 * @param tx - The transaction to inspect.
 * @returns Whether the deposit was paid with mUSD.
 */
function isMusdPayToken(tx: TransactionMeta): boolean {
  return isMusdToken(tx.metamaskPay?.tokenAddress);
}

/**
 * Classify a transaction into its Money activity kind.
 *
 * @param tx - The transaction to classify.
 * @returns The neutral activity kind for the row.
 */
export function classifyMoneyActivity(tx: TransactionMeta): MoneyActivityKind {
  const { moneyActivityTitleKey } = tx as MoneyActivityTransactionMeta;
  if (moneyActivityTitleKey) {
    return TITLE_KEY_TO_KIND[moneyActivityTitleKey] ?? 'received';
  }

  // Perps/Predict ↔ Money transfers (matched via the mUSD pay token). Withdraw
  // into the Money account reads as a deposit; deposit out of it reads as sent.
  if (isPerpsPredictMoneyWithdraw(tx)) {
    return 'deposited';
  }
  if (isPerpsPredictMoneyDeposit(tx)) {
    return 'sent';
  }

  const type = resolveMoneyTransactionType(tx);
  if (!type) {
    return 'deposited';
  }

  switch (type) {
    case TransactionType.moneyAccountDeposit:
      if (isFiatDeposit(tx) || isMusdPayToken(tx)) {
        return 'deposited';
      }
      return 'converted';
    case TransactionType.musdConversion:
      return 'converted';
    case TransactionType.incoming:
    case TransactionType.tokenMethodTransfer:
    case TransactionType.tokenMethodTransferFrom:
      return 'received';
    case TransactionType.moneyAccountWithdraw:
    case TransactionType.simpleSend:
      return 'sent';
    default:
      return 'received';
  }
}

/**
 * The i18n label key for each activity kind's confirmed (past-tense) form.
 */
export const MONEY_ACTIVITY_KIND_LABEL_KEY: Record<MoneyActivityKind, string> =
  {
    deposited: 'money.transaction.deposited',
    received: 'money.transaction.received',
    converted: 'money.transaction.converted',
    sent: 'money.transaction.sent',
    card: 'money.transaction.card_transaction',
    cashback: 'money.transaction.cashback',
  };

/**
 * Present-tense label keys for in-flight rows (e.g. "Depositing"). Kinds
 * without an entry fall back to the confirmed key.
 */
export const MONEY_ACTIVITY_KIND_PENDING_LABEL_KEY: Partial<
  Record<MoneyActivityKind, string>
> = {
  deposited: 'money.transaction.depositing',
  converted: 'money.transaction.converting',
  sent: 'money.transaction.sending',
  received: 'money.transaction.receiving',
};

/**
 * Failed-state label keys. Kinds without an entry fall back to the confirmed
 * key.
 */
export const MONEY_ACTIVITY_KIND_FAILED_LABEL_KEY: Partial<
  Record<MoneyActivityKind, string>
> = {
  deposited: 'money.transaction.deposit_failed',
  converted: 'money.transaction.conversion_failed',
  sent: 'money.transaction.send_failed',
};

/**
 * Resolve the i18n label key for an activity row. Returns a key, not a
 * localized string — each client passes it through its own i18n layer.
 *
 * @param kind - The activity kind.
 * @param status - The activity display status.
 * @returns The i18n key for the row's label.
 */
export function moneyActivityLabelKey(
  kind: MoneyActivityKind,
  status: MoneyActivityStatus,
): string {
  let statusKey: string | undefined;
  if (status === 'pending') {
    statusKey = MONEY_ACTIVITY_KIND_PENDING_LABEL_KEY[kind];
  } else if (status === 'failed') {
    statusKey = MONEY_ACTIVITY_KIND_FAILED_LABEL_KEY[kind];
  }
  return statusKey ?? MONEY_ACTIVITY_KIND_LABEL_KEY[kind];
}
