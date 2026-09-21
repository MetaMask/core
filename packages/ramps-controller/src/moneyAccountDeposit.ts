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
 * NOTE: The status values below mirror MoonPay Enterprise's
 * `AutorampTransactionStatus` as surfaced by the neobank-proxy (onramp-api PR
 * #1248, raw MoonPay). TRAM-3925 will introduce a mobile-safe DTO that may
 * rename these fields.
 */

import type { Hex } from '@metamask/utils';

/**
 * Deposit/transaction lifecycle statuses from the neo-bank proxy.
 *
 * These are MoonPay Enterprise's `AutorampTransactionStatus` values: three
 * in-progress states followed by five terminal outcomes (one success, four
 * failure/rejection).
 */
export enum MoneyAccountDepositStatus {
  /** Partner is reviewing the received funds (first in-progress state). */
  FundsReviewInProgress = 'FundsReviewInProgress',
  /** Received fiat is being converted to crypto. */
  ConversionInProgress = 'ConversionInProgress',
  /** Crypto payout is being sent on-chain. */
  PayoutInProgress = 'PayoutInProgress',
  /** Payout settled on Monad; `payoutTransactionHash` is available. */
  Completed = 'Completed',
  /** Terminal failure. */
  Failed = 'Failed',
  /** Rejected by AML screening. */
  RejectedAml = 'RejectedAml',
  /** Rejected by fraud screening. */
  RejectedFraud = 'RejectedFraud',
  /** Rejected for being under the minimum amount. */
  RejectedMinAmount = 'RejectedMinAmount',
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
   * Used for transition UX / analytics (e.g. PayoutInProgress to Completed).
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
  /**
   * True when the snapshot produced a materially different record (new record,
   * status change, or any field change). When false the returned `deposit` is
   * the unchanged local record, so callers can skip a redundant state write and
   * avoid churning `updatedAt` / `stateChange` on every poll.
   */
  changed: boolean;
};

/**
 * Terminal deposit statuses (no further lifecycle progress expected).
 */
export const TERMINAL_DEPOSIT_STATUSES: ReadonlySet<MoneyAccountDepositStatus> =
  new Set([
    MoneyAccountDepositStatus.Completed,
    MoneyAccountDepositStatus.Failed,
    MoneyAccountDepositStatus.RejectedAml,
    MoneyAccountDepositStatus.RejectedFraud,
    MoneyAccountDepositStatus.RejectedMinAmount,
  ]);

/**
 * Statuses that warrant user-visible transition UX (toast / banner). Every
 * terminal outcome is notable: a landed deposit (`Completed`) or a
 * failure/rejection the user should be told about.
 */
export const NOTABLE_DEPOSIT_STATUSES: ReadonlySet<MoneyAccountDepositStatus> =
  new Set([
    MoneyAccountDepositStatus.Completed,
    MoneyAccountDepositStatus.Failed,
    MoneyAccountDepositStatus.RejectedAml,
    MoneyAccountDepositStatus.RejectedFraud,
    MoneyAccountDepositStatus.RejectedMinAmount,
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
 *
 * Unknown values throw instead of silently changing a terminal local deposit
 * back to an in-progress status. The error includes the raw value so contract
 * changes can be diagnosed.
 *
 * @param status - Remote status string.
 * @returns A known {@link MoneyAccountDepositStatus}.
 * @throws If the remote status is not in the MoonPay/Iron status enum.
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
  throw new Error(`Unknown Money Account deposit status '${status}'`);
}

/**
 * Build a new local deposit record from create/response fields.
 *
 * @param input - Deposit fields.
 * @param input.id - Proxy deposit/transaction id.
 * @param input.moneyAccountAddress - Destination Money Account address.
 * @param input.status - Current deposit status (defaults to FundsReviewInProgress).
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
    input.status ?? MoneyAccountDepositStatus.FundsReviewInProgress,
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

  // Initial sync establishes the local baseline. It is not a transition, so a
  // deposit first seen already terminal is stored without firing an event. This
  // avoids showing historical completion notifications when state is hydrated.
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
      changed: true,
    };
  }

  const previousStatus = local.status;
  const statusChanged = previousStatus !== remoteStatus;
  const shouldNotify =
    statusChanged &&
    local.notifiedForStatus !== remoteStatus &&
    NOTABLE_DEPOSIT_STATUSES.has(remoteStatus);

  // Merge fields, never nulling out a value already observed.
  const autorampId = remote.autorampId ?? local.autorampId;
  const moneyAccountAddress =
    remote.moneyAccountAddress ?? local.moneyAccountAddress;
  const payoutTransactionHash =
    remote.payoutTransactionHash ?? local.payoutTransactionHash;
  const amount = remote.amount ?? local.amount;
  const currency = remote.currency ?? local.currency;

  const changed =
    statusChanged ||
    autorampId !== local.autorampId ||
    moneyAccountAddress !== local.moneyAccountAddress ||
    payoutTransactionHash !== local.payoutTransactionHash ||
    amount !== local.amount ||
    currency !== local.currency;

  // Nothing material changed: return the untouched local record so the caller
  // can skip a redundant write (avoids per-poll `updatedAt` / stateChange churn).
  if (!changed) {
    return {
      deposit: local,
      previousStatus,
      statusChanged: false,
      shouldNotify: false,
      changed: false,
    };
  }

  const deposit: MoneyAccountDeposit = {
    ...local,
    id: remote.id,
    autorampId,
    moneyAccountAddress,
    status: remoteStatus,
    payoutTransactionHash,
    amount,
    currency,
    lastSeenStatus: previousStatus,
    updatedAt: Date.now(),
  };

  return {
    deposit,
    previousStatus,
    statusChanged,
    shouldNotify,
    changed: true,
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
