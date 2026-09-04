/**
 * Local + remote models for Money Account deposit/payout transactions.
 *
 * A deposit is a single payment instance flowing through an
 * {@link ./autorampAccount.ts AutorampAccount} (the standing route): the partner
 * receives fiat (e.g. a Pix payment in Brazil) and pays out mUSD on Monad to the
 * user's Money Account. Deposits are tracked separately from autoramps because a
 * single autoramp can produce many deposits over time, each with its own status
 * lifecycle, payout transaction hash, and notification bookkeeping.
 *
 * NOTE: The status values below mirror the partner (Iron) transaction lifecycle
 * and are assumed pending confirmation of the neo-bank proxy transactions
 * contract. Keep {@link normalizeDepositStatus} tolerant of unknown values.
 */

import type { Hex } from '@metamask/utils';

/**
 * Deposit/transaction lifecycle statuses from the neo-bank proxy.
 */
export enum MoneyAccountDepositStatus {
  /** Created / awaiting partner processing. */
  Pending = 'Pending',
  /** Partner is processing the fiat leg. */
  Processing = 'Processing',
  /** Payout settled on Monad; `payoutTransactionHash` is available. */
  Completed = 'Completed',
  /** Terminal failure. */
  Failed = 'Failed',
  /** Cancelled before completion. */
  Cancelled = 'Cancelled',
}

/**
 * Local controller representation of a Money Account deposit.
 */
export type MoneyAccountDeposit = {
  /** Proxy deposit/transaction id (dedupe key). */
  id: string;
  /** Owning autoramp id, when known. */
  autorampId?: string;
  /** Destination Money Account address (the mUSD payout recipient), when known. */
  moneyAccountAddress?: Hex;
  /** Latest status from the partner (source of truth after refresh). */
  status: MoneyAccountDepositStatus;
  /**
   * Monad payout transaction hash, present once the payout settles on-chain.
   * Surfaced for display/analytics (and any future vault sweep, which is out of
   * scope for this ticket). Preserved across refreshes; a later snapshot must
   * never null it out.
   */
  payoutTransactionHash?: Hex;
  /** Optional payout amount as returned by the partner (display only). */
  amount?: string;
  /** Optional currency code for {@link amount} (display only). */
  currency?: string;
  /**
   * Status observed before the most recent remote apply.
   * Used for transition UX / analytics (e.g. Processing to Completed).
   */
  lastSeenStatus: MoneyAccountDepositStatus;
  /**
   * Last status for which the UI already showed a notification.
   * Prevents duplicate toasts across refreshes.
   */
  notifiedForStatus?: MoneyAccountDepositStatus;
  /** Epoch ms of the last local update from remote. */
  updatedAt: number;
};

/**
 * Minimal remote snapshot from the neo-bank proxy transactions endpoint.
 * The service maps proxy responses into this shape.
 */
export type MoneyAccountDepositRemoteSnapshot = {
  id: string;
  autorampId?: string;
  moneyAccountAddress?: Hex;
  status: MoneyAccountDepositStatus | string;
  payoutTransactionHash?: Hex;
  amount?: string;
  currency?: string;
};

/**
 * Result of applying a remote deposit snapshot onto local state.
 */
export type ApplyDepositRemoteStatusResult = {
  deposit: MoneyAccountDeposit;
  previousStatus: MoneyAccountDepositStatus;
  statusChanged: boolean;
  /** True when status changed and UI has not yet notified for the new status. */
  shouldNotify: boolean;
};

/**
 * Terminal deposit statuses (no further lifecycle progress expected).
 */
export const TERMINAL_DEPOSIT_STATUSES: ReadonlySet<MoneyAccountDepositStatus> =
  new Set([
    MoneyAccountDepositStatus.Completed,
    MoneyAccountDepositStatus.Failed,
    MoneyAccountDepositStatus.Cancelled,
  ]);

/**
 * Statuses that commonly warrant user-visible transition UX (toast / banner).
 */
export const NOTABLE_DEPOSIT_STATUSES: ReadonlySet<MoneyAccountDepositStatus> =
  new Set([
    MoneyAccountDepositStatus.Completed,
    MoneyAccountDepositStatus.Failed,
  ]);

/**
 * Whether a deposit status is terminal.
 *
 * @param status - Status to test.
 * @returns Whether the status is terminal.
 */
export function isTerminalDepositStatus(
  status: MoneyAccountDepositStatus,
): boolean {
  return TERMINAL_DEPOSIT_STATUSES.has(status);
}

/**
 * Normalize a remote status string into {@link MoneyAccountDepositStatus}.
 * Unknown values fall back to {@link MoneyAccountDepositStatus.Pending}.
 *
 * @param status - Remote status string.
 * @returns A known {@link MoneyAccountDepositStatus}.
 */
export function normalizeDepositStatus(
  status: MoneyAccountDepositStatus | string,
): MoneyAccountDepositStatus {
  if (
    Object.values(MoneyAccountDepositStatus).includes(
      status as MoneyAccountDepositStatus,
    )
  ) {
    return status as MoneyAccountDepositStatus;
  }
  return MoneyAccountDepositStatus.Pending;
}

/**
 * Build a new local deposit record from create/response fields.
 *
 * @param input - Deposit fields.
 * @param input.id - Proxy deposit/transaction id.
 * @param input.moneyAccountAddress - Destination Money Account address.
 * @param input.status - Current deposit status (defaults to Pending).
 * @param input.autorampId - Owning autoramp id, when known.
 * @param input.payoutTransactionHash - Monad payout hash, when settled.
 * @param input.amount - Optional payout amount for display.
 * @param input.currency - Optional currency code for the amount.
 * @param input.updatedAt - Epoch ms of this update (defaults to now).
 * @returns A new {@link MoneyAccountDeposit}.
 */
export function createMoneyAccountDeposit(input: {
  id: string;
  moneyAccountAddress?: Hex;
  status?: MoneyAccountDepositStatus | string;
  autorampId?: string;
  payoutTransactionHash?: Hex;
  amount?: string;
  currency?: string;
  updatedAt?: number;
}): MoneyAccountDeposit {
  const status = normalizeDepositStatus(
    input.status ?? MoneyAccountDepositStatus.Pending,
  );
  return {
    id: input.id,
    autorampId: input.autorampId,
    moneyAccountAddress: input.moneyAccountAddress,
    status,
    payoutTransactionHash: input.payoutTransactionHash,
    amount: input.amount,
    currency: input.currency,
    lastSeenStatus: status,
    updatedAt: input.updatedAt ?? Date.now(),
  };
}

/**
 * Apply a remote deposit snapshot onto a local deposit for transition detection.
 * Pure helper, shared by refresh-on-poll paths.
 *
 * @param local - Current local deposit (or null when first upserting from remote).
 * @param remote - Remote snapshot from the neo-bank proxy.
 * @returns Updated deposit plus change / notify flags.
 */
export function applyDepositRemoteStatus(
  local: MoneyAccountDeposit | null,
  remote: MoneyAccountDepositRemoteSnapshot,
): ApplyDepositRemoteStatusResult {
  const remoteStatus = normalizeDepositStatus(remote.status);

  if (!local) {
    const deposit = createMoneyAccountDeposit({
      id: remote.id,
      autorampId: remote.autorampId,
      moneyAccountAddress: remote.moneyAccountAddress,
      status: remoteStatus,
      payoutTransactionHash: remote.payoutTransactionHash,
      amount: remote.amount,
      currency: remote.currency,
    });
    return {
      deposit,
      previousStatus: remoteStatus,
      statusChanged: false,
      shouldNotify: false,
    };
  }

  const previousStatus = local.status;
  const statusChanged = previousStatus !== remoteStatus;
  const shouldNotify =
    statusChanged &&
    local.notifiedForStatus !== remoteStatus &&
    NOTABLE_DEPOSIT_STATUSES.has(remoteStatus);

  const deposit: MoneyAccountDeposit = {
    ...local,
    id: remote.id,
    autorampId: remote.autorampId ?? local.autorampId,
    moneyAccountAddress: remote.moneyAccountAddress ?? local.moneyAccountAddress,
    status: remoteStatus,
    // Never null out a payout hash once observed.
    payoutTransactionHash:
      remote.payoutTransactionHash ?? local.payoutTransactionHash,
    amount: remote.amount ?? local.amount,
    currency: remote.currency ?? local.currency,
    lastSeenStatus: previousStatus,
    updatedAt: Date.now(),
  };

  return {
    deposit,
    previousStatus,
    statusChanged,
    shouldNotify,
  };
}

/**
 * Mark that the UI has notified for the deposit's current status.
 *
 * @param deposit - Deposit to update.
 * @returns Deposit with `notifiedForStatus` set to current status.
 */
export function markDepositNotified(
  deposit: MoneyAccountDeposit,
): MoneyAccountDeposit {
  return {
    ...deposit,
    notifiedForStatus: deposit.status,
  };
}
