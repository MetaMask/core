import type { Hex } from '@metamask/utils';

// === COMMON TYPES ===

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

// === REQUEST TYPES ===

export type AssociateAddressRequest = {
  signature: string;
  timestamp: string;
  address: string;
};

export type CreateUpgradeRequest = {
  r: string;
  s: string;
  v: number;
  yParity: number;
  address: string;
  chainId: string;
  nonce: string;
};

export type VerifyDelegationRequest = {
  signedDelegation: SignedDelegation;
  chainId: Hex;
};

export type IntentMetadataRequest = {
  allowance: Hex;
  tokenSymbol: string;
  tokenAddress: Hex;
  type: 'cash-deposit' | 'cash-withdrawal';
};

export type SendIntentRequest = {
  account: Hex;
  delegationHash: Hex;
  chainId: Hex;
  metadata: IntentMetadataRequest;
};

export type CreateWithdrawalRequest = {
  chainId: Hex;
  /** Decimal integer or 0x-prefixed hex string representing the amount. */
  amount: string;
  account: Hex;
};

// === RESPONSE TYPES ===

export type AssociateAddressResponse = {
  profileId: string;
  address: string;
  status: string;
};

export type UpgradeResponse = {
  signerAddress: string;
  status: string;
  createdAt: string;
};

export type VerifyDelegationResponse = {
  valid: boolean;
  delegationHash?: string;
  errors?: string[];
};

export type IntentMetadataResponse = {
  allowance: Hex;
  tokenSymbol: string;
  tokenAddress: Hex;
  type: 'cash-deposit' | 'cash-withdrawal';
};

export type SendIntentResponse = {
  delegationHash: string;
  metadata: IntentMetadataResponse;
  createdAt: string;
};

/**
 * The shape returned by GET /v1/intent/account/:address for each intent.
 *
 * Note: the metadata `type` uses 'deposit' | 'withdraw' here, whereas the
 * create-intent endpoint uses 'cash-deposit' | 'cash-withdrawal'.
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
    type: 'deposit' | 'withdraw';
  };
};

export type CreateWithdrawalResponse = {
  success: true;
};
