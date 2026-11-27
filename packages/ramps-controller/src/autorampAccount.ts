/**
 * Local + remote models for MoonPay Enterprise autoramp accounts.
 * Separate from {@link RampsOrder}: autoramps are standing routes; orders are payments.
 */

import type {
  AutorampDepositRailsSummary,
  AutorampRemoteSnapshot,
} from './autoramp-types.js';
import type { NeoBankCustomerAbilities } from './NeoBankService.js';

export type {
  AutorampDepositRailsSummary,
  AutorampRemoteSnapshot,
} from './autoramp-types.js';

/**
 * Autoramp lifecycle statuses from MoonPay Enterprise.
 *
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
 * Controller-facing payload for creating an autoramp.
 *
 * Mirrors the MoonPay `POST /api/autoramps` body that
 * {@link NeoBankService.createAutoramp} forwards opaquely, minus `customer_id`:
 * `RampsController.createAutoramp` injects the vendor customer id resolved from
 * Profile Sync, so callers never supply (or need to know) it.
 */
export type CreateAutorampRequest = Record<string, unknown>;

/** Destination of every {@link buildMusdAutorampRequest} autoramp. */
const MUSD_DESTINATION = { token: 'mUSD', blockchain: 'Monad' } as const;

/**
 * Standing fiat → mUSD autoramp for a Money Account on Monad.
 *
 * `customer_id` is omitted; {@link RampsController.createAutoramp} injects it.
 * The fiat code is required: this helper does not default to BRL.
 *
 * The body does not set `source_is_third_party`: neobank-proxy overwrites it
 * on every market create, choosing per customer from the eligible rails.
 *
 * @param walletAddress - Money Account address that receives mUSD.
 * @param sourceCurrencyCode - Fiat code placed in `source_currencies[0].code`.
 * @returns MoonPay `POST /autoramps` market body.
 */
export function buildMusdAutorampRequest(
  walletAddress: string,
  sourceCurrencyCode: string,
): CreateAutorampRequest {
  return {
    source_currencies: [{ type: 'Fiat', code: sourceCurrencyCode }],
    destination_currency: { type: 'Crypto', ...MUSD_DESTINATION },
    recipient_account: {
      type: 'Crypto',
      chain: MUSD_DESTINATION.blockchain,
      address: walletAddress,
    },
  };
}

/**
 * Standing BRL → mUSD autoramp for a Money Account on Monad.
 *
 * Wrapper around {@link buildMusdAutorampRequest} with code `BRL`.
 * `customer_id` is omitted; {@link RampsController.createAutoramp} injects it.
 *
 * @param walletAddress - Money Account address that receives mUSD.
 * @returns MoonPay `POST /autoramps` market body.
 */
export function buildBrazilMusdAutorampRequest(
  walletAddress: string,
): CreateAutorampRequest {
  return buildMusdAutorampRequest(walletAddress, 'BRL');
}

/**
 * Whether the customer may onramp into mUSD on Monad. MoonPay lists in
 * `currencies` only what the customer's jurisdiction allows, and rejects a
 * create for anything else. Fails open when `currencies` is missing.
 *
 * @param abilities - Customer abilities.
 * @returns False only when `currencies` lacks mUSD on Monad with `Onramp`.
 */
function isMusdDestinationAvailable(
  abilities: NeoBankCustomerAbilities,
): boolean {
  const { currencies } = abilities as { currencies?: unknown };
  if (!Array.isArray(currencies)) {
    return true;
  }
  return (currencies as NeoBankCustomerAbilities['currencies']).some(
    ({ currency, flows }) =>
      currency?.type === 'Crypto' &&
      currency.token?.toLowerCase() === MUSD_DESTINATION.token.toLowerCase() &&
      currency.blockchain?.toLowerCase() ===
        MUSD_DESTINATION.blockchain.toLowerCase() &&
      Array.isArray(flows) &&
      flows.includes('Onramp'),
  );
}

/**
 * A create rejected because the destination token is not available in the
 * customer's jurisdiction: neobank-proxy's error code, or MoonPay's own text
 * when the proxy forwards the body as is.
 */
const TOKEN_UNAVAILABLE_IN_JURISDICTION =
  /token_unavailable_in_jurisdiction|not available in the jurisdiction/iu;

/**
 * Whether a failed create was rejected because the destination token is not
 * available in the customer's jurisdiction. The response body is only carried
 * in the error message, so this matches it there.
 *
 * @param error - Error thrown by `RampsController.createAutoramp`.
 * @returns True when the error message carries the jurisdiction rejection.
 */
export function isTokenUnavailableInJurisdictionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    TOKEN_UNAVAILABLE_IN_JURISDICTION.test(error.message)
  );
}

/**
 * Deposit rails MoonPay needs Active before it accepts a
 * {@link buildMusdAutorampRequest} create, keyed by fiat code. neobank-proxy
 * normally sends creates as third-party, so that rail is required too. EUR is
 * the exception: the proxy falls back to a first-party autoramp when
 * `sepa_thirdparty` is not Active, so only the base rail is required.
 */
const MUSD_AUTORAMP_REQUIRED_DEPOSIT_RAILS: Readonly<
  Record<string, readonly string[]>
> = {
  BRL: ['pix', 'pix_thirdparty'],
  USD: ['ach', 'ach_thirdparty'],
  EUR: ['sepa'],
};

const BLOCKED_ABILITY_STATUSES: ReadonlySet<string> = new Set([
  'Unavailable',
  'Blocked',
]);

/**
 * Whether a fiat → mUSD autoramp can be created now.
 *
 * - `active`: every required rail is Active, or the fiat has none, and mUSD
 * on Monad is available to the customer.
 * - `pending`: a required rail is not Active yet (Pending, Maintenance or
 * missing), so MoonPay would reject the create for now.
 * - `blocked`: a required rail is Unavailable or Blocked.
 * - `unavailable`: the rails are ready, but mUSD on Monad is not available to
 * the customer's jurisdiction (missing from abilities `currencies`, or
 * without `Onramp`), so MoonPay would reject the create. It follows the
 * customer's KYC region, so an immediate retry does not help, but a later
 * check passes once MoonPay offers the token to that customer.
 */
export type MusdAutorampDepositRailReadiness =
  | 'active'
  | 'pending'
  | 'blocked'
  | 'unavailable';

/**
 * Reads whether a fiat → mUSD autoramp can be created from the customer's
 * abilities: the deposit rails first, then the destination token. The token
 * is only checked once the rails are ready, so a customer whose rails are
 * still settling keeps waiting instead of failing on a partial `currencies`.
 *
 * @param abilities - Customer abilities, e.g. `vbaCustomerAbilities`.
 * @param sourceCurrencyCode - Fiat code passed to
 * {@link buildMusdAutorampRequest}.
 * @returns The autoramp readiness.
 */
export function getMusdAutorampDepositRailReadiness(
  abilities: NeoBankCustomerAbilities,
  sourceCurrencyCode: string,
): MusdAutorampDepositRailReadiness {
  const railReadiness = getDepositRailReadiness(abilities, sourceCurrencyCode);
  if (railReadiness === 'active' && !isMusdDestinationAvailable(abilities)) {
    return 'unavailable';
  }
  return railReadiness;
}

/**
 * Reads the deposit rail readiness for a fiat → mUSD autoramp.
 *
 * @param abilities - Customer abilities.
 * @param sourceCurrencyCode - Fiat code passed to
 * {@link buildMusdAutorampRequest}.
 * @returns The rail readiness.
 */
function getDepositRailReadiness(
  abilities: NeoBankCustomerAbilities,
  sourceCurrencyCode: string,
): Exclude<MusdAutorampDepositRailReadiness, 'unavailable'> {
  const code = sourceCurrencyCode.toUpperCase();
  const rails = MUSD_AUTORAMP_REQUIRED_DEPOSIT_RAILS[code];
  if (!rails) {
    return 'active';
  }
  const currencyRails = abilities.fiat_deposit[code.toLowerCase()] ?? {};
  const statuses = rails.map((rail) => currencyRails[rail]);
  if (
    statuses.some(
      (status) => status !== undefined && BLOCKED_ABILITY_STATUSES.has(status),
    )
  ) {
    return 'blocked';
  }
  return statuses.every((status) => status === 'Active') ? 'active' : 'pending';
}

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
 * @param input.id - MoonPay autoramp id.
 * @param input.customerId - MoonPay customer id.
 * @param input.walletAddress - Destination wallet address.
 * @param input.status - Optional remote status (defaults to Authorized).
 * @param input.depositRailsSummary - Optional non-PII deposit readiness cache.
 * @param input.updatedAt - Optional epoch ms timestamp (defaults to now).
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
 * Keeps a currency the client already learned when a later snapshot omits it.
 * Readiness follows the remote snapshot. A remote currency replaces the local one.
 *
 * @param local - Currency summary already stored for this autoramp.
 * @param remote - Currency summary from the latest GET or push.
 * @returns The summary to store, or undefined when neither side has one.
 */
export function mergeDepositRailsSummary(
  local: AutorampDepositRailsSummary | undefined,
  remote: AutorampDepositRailsSummary | undefined,
): AutorampDepositRailsSummary | undefined {
  if (!remote) {
    return local;
  }
  if (!local) {
    return remote;
  }
  const currency = remote.currency ?? local.currency;
  return {
    ready: remote.ready,
    ...(currency ? { currency } : {}),
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
      customerId: remote.customerId ?? '',
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
    // A blank remote identity field means "not supplied", not "cleared": the
    // proxy omits or empties these on partial status pushes, so keep the local
    // value rather than wiping it.
    customerId:
      remote.customerId !== undefined && remote.customerId.length > 0
        ? remote.customerId
        : local.customerId,
    walletAddress:
      remote.walletAddress !== undefined && remote.walletAddress.length > 0
        ? remote.walletAddress
        : local.walletAddress,
    status: remoteStatus,
    lastSeenStatus: previousStatus,
    updatedAt: Date.now(),
    depositRailsSummary: mergeDepositRailsSummary(
      local.depositRailsSummary,
      remote.depositRailsSummary,
    ),
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
export function markAutorampNotified(
  account: AutorampAccount,
): AutorampAccount {
  return {
    ...account,
    notifiedForStatus: account.status,
  };
}
