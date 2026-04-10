import type { Hex } from '@metamask/utils';

// ---------------------------------------------------------------------------
// Delegations
// ---------------------------------------------------------------------------

/** A single caveat attached to a delegation. */
export type Caveat = {
  /** Address of the caveat enforcer contract (0x-prefixed). */
  enforcer: Hex;
  /** ABI-encoded caveat terms (0x-prefixed). */
  terms: Hex;
  /** ABI-encoded caveat arguments (0x-prefixed). */
  args: Hex;
};

/** An EIP-712 signed delegation. */
export type SignedDelegation = {
  /** Address the delegation is granted to (0x-prefixed). */
  delegate: Hex;
  /** Address granting the delegation (0x-prefixed). */
  delegator: Hex;
  /** Root authority or parent delegation hash (0x-prefixed). */
  authority: Hex;
  /** Caveats restricting how the delegation may be used. */
  caveats: Caveat[];
  /** Unique salt to prevent replay (0x-prefixed). */
  salt: Hex;
  /** EIP-712 signature over the delegation (0x-prefixed). */
  signature: Hex;
};

/** Metadata associated with a delegation. */
export type DelegationMetadata = {
  /** Keccak-256 hash uniquely identifying the delegation (0x-prefixed). */
  delegationHash: Hex;
  /** Chain ID in hex format (0x-prefixed). */
  chainIdHex: Hex;
  /** Token allowance in hex format (0x-prefixed). */
  allowance: Hex;
  /** Symbol of the token (e.g. "USDC"). */
  tokenSymbol: string;
  /** Token contract address (0x-prefixed). */
  tokenAddress: Hex;
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
  address: Hex;
  enabled: boolean;
};

export type WalletActivityPreference = {
  enabled: boolean;
  accounts: WalletActivityAccount[];
};

export type MarketingPreference = {
  enabled: boolean;
};

export type PerpsWatchlistExchange = {
  testnet: string[];
  mainnet: string[];
};

export type PerpsWatchlistMarkets = {
  hyperliquid: PerpsWatchlistExchange;
  myx: PerpsWatchlistExchange;
};

export type PerpsPreference = {
  enabled: boolean;
  watchlistMarkets?: PerpsWatchlistMarkets;
};

export type SocialAIPreference = {
  enabled: boolean;
  txAmountLimit?: number;
  traderProfileIds: string[];
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
