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

/**
 * PIX "Copia e Cola" instructions from an autoramp `deposit_rails` entry.
 * Re-fetched for display; not stored on the autoramp cursor.
 */
export type PixDepositInstructions = {
  /** EMV BR Code the payer pastes into their bank app. */
  brCode: string;
  /** Human-readable payer guidance from MoonPay. */
  instruction: string;
  /** Bare PIX key, when MoonPay includes one. */
  pixKey?: string;
  /** Expiry of a one-time QR code. Absent for a reusable code. */
  expiresAt?: string;
};

/**
 * Polling summary of one autoramp transaction.
 * `status` is MoonPay `transaction_status` (`Completed`, `Failed`, …).
 */
export type AutorampTransactionSummary = {
  id: string;
  autorampId: string;
  status: string;
  /** Source amount decimal string, when present (BRL for this flow). */
  sourceAmount?: string;
  /** Destination amount decimal string, when present (mUSD). */
  destinationAmount?: string;
};
