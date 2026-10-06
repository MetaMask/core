import type { Hex } from '@metamask/utils';

// === COMMON TYPES ===

/**
 * The CHOMP intent metadata `type` discriminator, covering the base vault
 * (`cash-deposit`, `cash-withdrawal`), the premium vault
 * (`cash-deposit-premium`, `cash-withdrawal-premium`), and the recurring
 * subscription payment (`cash-subscription`).
 */
export type ChompIntentType =
  | 'cash-deposit'
  | 'cash-withdrawal'
  | 'cash-deposit-premium'
  | 'cash-withdrawal-premium'
  | 'cash-subscription';

export type DelegationCaveat = {
  enforcer: Hex;
  terms: Hex;
  args: Hex;
};

export type SignedDelegation = {
  delegate: Hex;
  delegator: Hex;
  authority: Hex;
  caveats: DelegationCaveat[];
  salt: Hex;
  signature: Hex;
};

// === PARAMS TYPES ===

/**
 * Why an address is being associated through the v2 flow. `ASSOCIATE` creates
 * a normal association, while `ASSOCIATE_SUCCESSOR` also links the address to
 * its predecessor as the next address in the Money Account identity chain.
 */
export type AssociationPurpose = 'ASSOCIATE' | 'ASSOCIATE_SUCCESSOR';

export type CreateAddressChallengeParams =
  | {
      address: Hex;
      purpose: 'ASSOCIATE';
    }
  | {
      address: Hex;
      purpose: 'ASSOCIATE_SUCCESSOR';
      /**
       * The current address of the Money Account that `address` succeeds.
       * Must be set before any intents exist on `address`.
       */
      predecessorAddress: Hex;
    };

export type AssociateAddressV2Params = {
  challengeId: string;
  /**
   * The `personal_sign` signature of the challenge `message`, signed exactly
   * as returned by CHOMP with the address being associated.
   */
  signature: Hex;
};

export type CreateUpgradeParams = {
  r: Hex;
  s: Hex;
  v: number;
  yParity: number;
  address: Hex;
  chainId: string;
  nonce: string;
};

export type VerifyDelegationParams = {
  signedDelegation: SignedDelegation;
  chainId: Hex;
};

export type IntentMetadataParams = {
  allowance: Hex;
  tokenSymbol: string;
  tokenAddress: Hex;
  type: ChompIntentType;
};

export type SendIntentParams = {
  account: Hex;
  delegationHash: Hex;
  chainId: Hex;
  metadata: IntentMetadataParams;
};

export type CreateWithdrawalParams = {
  chainId: Hex;
  /** Decimal integer or 0x-prefixed hex string representing the amount. */
  amount: string;
  account: Hex;
};

// === RESPONSE TYPES ===

/**
 * Returned by POST /v2/auth/address.
 *
 * `profileId` is only included when the address was newly associated
 * (`status: 'created'`). When the address was already associated with the
 * authenticated profile (`status: 'active'`), only `address` is returned.
 * An address associated with a different profile responds with 409, which is
 * surfaced as an error.
 */
export type AssociateAddressResponse = {
  profileId?: string;
  address: Hex;
  status: 'active' | 'created';
};

/**
 * Returned by POST /v2/auth/address/challenge.
 */
export type CreateAddressChallengeResponse = {
  challengeId: string;
  /**
   * The EIP-4361 (Sign-In with Ethereum) message to sign, bound to the
   * profile, chain, purpose, address and predecessor.
   */
  message: string;
  /**
   * When the challenge expires, as an ISO 8601 timestamp.
   */
  expiresAt: string;
};

/**
 * One entry returned by GET /v1/auth/address. The endpoint returns an array
 * of these — the active address associations of the authenticated profile
 * (the API filters out soft-deleted associations, so `status` is always
 * `'active'`). Addresses are lowercased.
 */
export type ProfileAddressEntry = {
  profileId: string;
  address: Hex;
  status: 'active';
};

export type AccountUpgradeStatus = 'pending' | 'upgraded';

export type AuthorizationData = {
  r: Hex;
  s: Hex;
  v: number;
  yParity: number;
  address: Hex;
  chainId: Hex;
  nonce: Hex;
};

/**
 * Returned by POST /v1/account-upgrade.
 */
export type CreateUpgradeResponse = {
  signerAddress: Hex;
  address: Hex;
  chainId: Hex;
  nonce: Hex;
  status: AccountUpgradeStatus;
  createdAt: string;
};

/**
 * One entry returned by GET /v1/account-upgrade/:address. The endpoint returns
 * an array of these (one per chain).
 */
export type UpgradeEntry = {
  signerAddress: Hex;
  chainId: Hex;
  nonce: Hex;
  authorization: AuthorizationData;
  status: AccountUpgradeStatus;
  createdAt: string;
};

export type VerifyDelegationResponse = {
  valid: boolean;
  delegationHash?: Hex;
  errors?: string[];
};

export type IntentMetadataResponse = {
  allowance: Hex;
  tokenSymbol: string;
  tokenAddress: Hex;
  type: ChompIntentType;
};

export type SendIntentResponse = {
  delegationHash: Hex;
  metadata: IntentMetadataResponse;
  createdAt: string;
};

/**
 * The shape returned by GET /v1/intent/account/:address for each intent.
 */
export type IntentEntry = {
  account: Hex;
  delegationHash: Hex;
  chainId: Hex;
  status: 'active' | 'revoked';
  metadata: {
    allowance: Hex;
    tokenAddress: Hex;
    tokenSymbol: string;
    type: ChompIntentType;
  };
};

export type CreateWithdrawalResponse = {
  success: true;
};

// === DERIVED IDENTITY TYPES ===

/**
 * A step that must exist before a migration link counts as complete.
 * `SUCCESSOR_SUBSCRIPTION_INTENT` and `TRANSFER_INTENT_PVMUSD` are only
 * required for premium subscribers.
 */
export type MigrationStep =
  | 'SUCCESSOR_DEPOSIT_INTENT'
  | 'SUCCESSOR_WITHDRAWAL_INTENT'
  | 'SUCCESSOR_SUBSCRIPTION_INTENT'
  | 'SUCCESSOR_MONITORED'
  | 'ROOT_DELEGATION'
  | 'TRANSFER_INTENT_MUSD'
  | 'TRANSFER_INTENT_VMUSD'
  | 'TRANSFER_INTENT_PVMUSD';

/**
 * The settlement status of a Money Account identity chain. `NONE` is never
 * returned as an entry: a profile with no Money Account has no identities.
 */
export type DerivedIdentityStatus = 'NONE' | 'MIGRATING' | 'DONE';

/**
 * The latest link of an identity chain while it is migrating.
 */
export type DerivedIdentityMigration = {
  from: Hex;
  to: Hex;
  requiredSteps: MigrationStep[];
  completedSteps: MigrationStep[];
  missingSteps: MigrationStep[];
};

/**
 * One Money Account over time: a chain of addresses joined by links.
 * Addresses are lowercased.
 */
export type DerivedIdentity = {
  /** The tip of the chain. Stays on the old address while migrating. */
  currentAddress: Hex;
  /** Earlier addresses, from the immediate predecessor backwards. */
  previousAddresses: Hex[];
  status: DerivedIdentityStatus;
  migration: DerivedIdentityMigration | null;
};

/**
 * Returned by GET /v1/money-account/identities.
 */
export type DerivedIdentitiesResponse = {
  identities: DerivedIdentity[];
};

export type DerivedIdentityAddressRole =
  | 'CURRENT'
  | 'PREVIOUS'
  | 'PENDING_SUCCESSOR';

/**
 * Returned by GET /v1/money-account/identities/address/:address. Addresses
 * are lowercased.
 */
export type AddressIdentityResponse = {
  identity: DerivedIdentity;
  address: {
    address: Hex;
    role: DerivedIdentityAddressRole;
    predecessor: Hex | null;
    successor: Hex | null;
  };
};

// === SERVICE DETAILS TYPES ===

export type ServiceDetailsSupportedToken = {
  tokenAddress: Hex;
  tokenDecimals: number;
};

export type ServiceDetailsProtocol = {
  supportedTokens: ServiceDetailsSupportedToken[];
  adapterAddress: Hex;
  intentTypes: ChompIntentType[];
};

export type ServiceDetailsChain = {
  autoDepositDelegate: Hex;
  protocol: {
    vedaProtocol: ServiceDetailsProtocol;
    vedaPremiumProtocol?: ServiceDetailsProtocol;
  };
};

export type ServiceDetailsResponse = {
  auth: {
    message: string;
  };
  chains: Record<Hex, ServiceDetailsChain>;
};
