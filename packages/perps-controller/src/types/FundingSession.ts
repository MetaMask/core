/**
 * A funding session is a progress tracker over Resting Points — never a
 * custodian of funds. Funds always sit in user-recoverable balances between
 * legs. Glossary: docs (Leg, Resting Point) in the mobile repo's CONTEXT.md.
 */
export type FundingLegKind = 'swap' | 'bridge' | 'deposit';

/** Capabilities, not keyring types (D9): software accounts render legs silent. */
export type FundingLegCapability = {
  requiresDeviceSignature: boolean;
  /** true = never rendered as a Signing Step (e.g. software-account legs) */
  silent: boolean;
};

export type FundingLegStatus =
  | 'pending'
  | 'awaiting_signature'
  | 'submitted'
  | 'confirmed'
  | 'failed';

export type FundingLegQuoteSnapshot = {
  srcAsset: string; // CAIP asset id
  destAsset: string; // CAIP asset id
  estimatedAmountOut: string; // atomic units, decimal string
  fetchedAt: number; // ms epoch — quote freshness is composer policy (D7)
};

export type FundingLegFailure = {
  reason: string;
  retryable: boolean;
  at: number;
};

export type FundingLeg = {
  kind: FundingLegKind;
  capability: FundingLegCapability;
  status: FundingLegStatus;
  /** Quote snapshot captured at leg start. Never the full quote payload. */
  quote?: FundingLegQuoteSnapshot;
  /** Key into BridgeStatusController txHistory (swap/bridge) or depositRequests (deposit). */
  externalId?: string;
  failure?: FundingLegFailure;
};

export type FundingSessionStatus =
  | 'preflight'
  | 'active'
  | 'paused'
  | 'completed'
  | 'failed';

export type FundingSession = {
  id: string;
  /** Trading EOA, lowercased — the account the deposit credits. */
  accountAddress: string;
  createdAt: number;
  updatedAt: number;
  status: FundingSessionStatus;
  legs: FundingLeg[];
  /** Links the deposit leg to the depositRequests entry for history rendering. */
  depositRequestId?: string;
};
