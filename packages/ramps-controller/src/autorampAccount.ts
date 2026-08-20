/**
 * Local + remote models for MoonPay Enterprise autoramp accounts.
 * Separate from {@link RampsOrder}: autoramps are standing routes; orders are payments.
 */

/**
 * Autoramp lifecycle statuses from MoonPay Enterprise.
 * @see https://dev.enterprise.moonpay.com/autoramp-status
 */
export enum AutorampStatus {
  Created = 'Created',
  Authorized = 'Authorized',
  EditPending = 'EditPending',
  DepositAccountAdded = 'DepositAccountAdded',
  Approved = 'Approved',
  Rejected = 'Rejected',
  Cancelled = 'Cancelled',
}

/**
 * Non-PII deposit readiness summary cached after a remote refresh.
 * Full deposit rail details (IBAN, etc.) should be re-fetched when needed — not synced.
 */
export type AutorampDepositRailsSummary = {
  /** Source currency code when known (e.g. EUR). */
  currency?: string;
  /** True when the autoramp is approved and deposit details may be shared. */
  ready: boolean;
};

/**
 * Local controller representation of an autoramp account.
 */
export type AutorampAccount = {
  /** MoonPay autoramp id. */
  id: string;
  /** MoonPay customer id. */
  customerId: string;
  /** Destination wallet address associated with this autoramp. */
  walletAddress: string;
  /** Latest status from MoonPay (source of truth after refresh). */
  status: AutorampStatus;
  /**
   * Status observed before the most recent remote apply.
   * Used for transition UX / analytics (e.g. Authorized → Approved).
   */
  lastSeenStatus: AutorampStatus;
  /**
   * Last status for which the UI already showed a notification.
   * Prevents duplicate toasts across refresh and push.
   */
  notifiedForStatus?: AutorampStatus;
  /** Epoch ms of the last local update from remote or push. */
  updatedAt: number;
  /** Optional non-PII deposit readiness cache. */
  depositRailsSummary?: AutorampDepositRailsSummary;
};

/**
 * Minimal remote snapshot from `GET /api/autoramps/{id}` (or a push payload).
 * Host apps / BFF map MoonPay responses into this shape.
 */
export type AutorampRemoteSnapshot = {
  id: string;
  customerId: string;
  walletAddress?: string;
  status: AutorampStatus | string;
  depositRailsSummary?: AutorampDepositRailsSummary;
};

/**
 * Result of applying a remote autoramp snapshot onto local state.
 */
export type ApplyAutorampRemoteStatusResult = {
  account: AutorampAccount;
  previousStatus: AutorampStatus;
  statusChanged: boolean;
  /** True when status changed and UI has not yet notified for the new status. */
  shouldNotify: boolean;
};

/**
 * Terminal autoramp statuses — no further lifecycle progress expected.
 */
export const TERMINAL_AUTORAMP_STATUSES: ReadonlySet<AutorampStatus> = new Set([
  AutorampStatus.Rejected,
  AutorampStatus.Cancelled,
]);

/**
 * Statuses that commonly warrant user-visible transition UX (toast / banner).
 */
export const NOTABLE_AUTORAMP_STATUSES: ReadonlySet<AutorampStatus> = new Set([
  AutorampStatus.Approved,
  AutorampStatus.Rejected,
  AutorampStatus.Cancelled,
]);

/**
 * Whether an autoramp status is terminal.
 *
 * @param status - Status to test.
 * @returns Whether the status is terminal.
 */
export function isTerminalAutorampStatus(status: AutorampStatus): boolean {
  return TERMINAL_AUTORAMP_STATUSES.has(status);
}

/**
 * Normalize a remote status string into {@link AutorampStatus}.
 * Unknown values fall back to {@link AutorampStatus.Created}.
 *
 * @param status - Remote status string.
 * @returns A known {@link AutorampStatus}.
 */
export function normalizeAutorampStatus(
  status: AutorampStatus | string,
): AutorampStatus {
  if (Object.values(AutorampStatus).includes(status as AutorampStatus)) {
    return status as AutorampStatus;
  }
  return AutorampStatus.Created;
}

/**
 * Build a new local autoramp account from create/response fields.
 *
 * @param input - Required identity + status fields.
 * @returns A new {@link AutorampAccount}.
 */
export function createAutorampAccount(input: {
  id: string;
  customerId: string;
  walletAddress: string;
  status?: AutorampStatus | string;
  depositRailsSummary?: AutorampDepositRailsSummary;
  updatedAt?: number;
}): AutorampAccount {
  const status = normalizeAutorampStatus(
    input.status ?? AutorampStatus.Authorized,
  );
  return {
    id: input.id,
    customerId: input.customerId,
    walletAddress: input.walletAddress,
    status,
    lastSeenStatus: status,
    updatedAt: input.updatedAt ?? Date.now(),
    depositRailsSummary: input.depositRailsSummary,
  };
}

/**
 * Apply a remote autoramp snapshot onto a local account for transition detection.
 * Pure helper — shared by refresh-on-load and websocket push paths.
 *
 * @param local - Current local account (or null when first upserting from remote).
 * @param remote - Remote snapshot (MoonPay GET or push).
 * @returns Updated account plus change / notify flags.
 */
export function applyAutorampRemoteStatus(
  local: AutorampAccount | null,
  remote: AutorampRemoteSnapshot,
): ApplyAutorampRemoteStatusResult {
  const remoteStatus = normalizeAutorampStatus(remote.status);

  if (!local) {
    const account = createAutorampAccount({
      id: remote.id,
      customerId: remote.customerId,
      walletAddress: remote.walletAddress ?? '',
      status: remoteStatus,
      depositRailsSummary: remote.depositRailsSummary,
    });
    return {
      account,
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
    NOTABLE_AUTORAMP_STATUSES.has(remoteStatus);

  const account: AutorampAccount = {
    ...local,
    id: remote.id,
    customerId: remote.customerId || local.customerId,
    walletAddress: remote.walletAddress || local.walletAddress,
    status: remoteStatus,
    lastSeenStatus: previousStatus,
    updatedAt: Date.now(),
    depositRailsSummary:
      remote.depositRailsSummary ?? local.depositRailsSummary,
  };

  return {
    account,
    previousStatus,
    statusChanged,
    shouldNotify,
  };
}

/**
 * Mark that the UI has notified for the account's current status.
 *
 * @param account - Account to update.
 * @returns Account with `notifiedForStatus` set to current status.
 */
export function markAutorampNotified(account: AutorampAccount): AutorampAccount {
  return {
    ...account,
    notifiedForStatus: account.status,
  };
}
