import type { Env } from '../shared/env';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type AuthenticatedUserStorageConfig = {
  env: Env;
  getAccessToken: () => Promise<string>;
};

// ---------------------------------------------------------------------------
// Delegations
// ---------------------------------------------------------------------------

/** A single caveat attached to a delegation. */
export type Caveat = {
  /** Address of the caveat enforcer contract (0x-prefixed). */
  enforcer: string;
  /** ABI-encoded caveat terms. */
  terms: string;
  /** ABI-encoded caveat arguments. */
  args: string;
};

/** An EIP-712 signed delegation. */
export type SignedDelegation = {
  /** Address the delegation is granted to (0x-prefixed). */
  delegate: string;
  /** Address granting the delegation (0x-prefixed). */
  delegator: string;
  /** Root authority or parent delegation hash (0x-prefixed). */
  authority: string;
  /** Caveats restricting how the delegation may be used. */
  caveats: Caveat[];
  /** Unique salt to prevent replay (0x-prefixed). */
  salt: string;
  /** EIP-712 signature over the delegation (0x-prefixed). */
  signature: string;
};

/** Metadata associated with a delegation. */
export type DelegationMetadata = {
  /** Keccak-256 hash uniquely identifying the delegation (0x-prefixed). */
  delegationHash: string;
  /** Chain ID in hex format (0x-prefixed). */
  chainIdHex: string;
  /** Token allowance in hex format (0x-prefixed). */
  allowance: string;
  /** Symbol of the token (e.g. "USDC"). */
  tokenSymbol: string;
  /** Token contract address (0x-prefixed). */
  tokenAddress: string;
  /** Type of delegation. */
  type: string;
};

/** Request body for submitting a new delegation. */
export type DelegationSubmission = {
  signedDelegation: SignedDelegation;
  metadata: DelegationMetadata;
};

/** A stored delegation record returned by the API. */
export type DelegationResponse = {
  signedDelegation: SignedDelegation;
  metadata: DelegationMetadata;
};

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

/** Wallet activity tracking for a single address. */
export type WalletActivityAccount = {
  /** Wallet address to track activity for (0x-prefixed). */
  address: string;
  enabled: boolean;
};

export type WalletActivityPreference = {
  enabled: boolean;
  accounts: WalletActivityAccount[];
};

export type MarketingPreference = {
  enabled: boolean;
};

export type PerpsPreference = {
  enabled: boolean;
};

export type SocialAIPreference = {
  enabled: boolean;
  txAmountLimit: number;
  tokens: string[];
};

/** Notification preferences for the authenticated user. */
export type NotificationPreferences = {
  walletActivity: WalletActivityPreference;
  marketing: MarketingPreference;
  perps: PerpsPreference;
  socialAI: SocialAIPreference;
};

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** The type of client making the request. */
export type ClientType = 'extension' | 'mobile' | 'portfolio';
