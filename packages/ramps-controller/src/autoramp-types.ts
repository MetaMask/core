/**
 * Non-PII deposit readiness summary from a neo-bank autoramp response.
 * Full deposit rail details (IBAN, etc.) should be re-fetched when needed.
 */
export type AutorampDepositRailsSummary = {
  /** Source currency code when known (e.g. EUR). */
  currency?: string;
  /** True when the autoramp is approved and deposit details may be shared. */
  ready: boolean;
};

/**
 * Minimal remote snapshot from `GET /neobank/autoramps/{id}` (or a push payload).
 * Identity fields may be omitted on partial proxy responses.
 */
export type AutorampRemoteSnapshot = {
  id: string;
  customerId?: string;
  walletAddress?: string;
  status: string;
  depositRailsSummary?: AutorampDepositRailsSummary;
};
