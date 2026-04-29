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

// === PARAMS TYPES ===

export type AssociateAddressParams = {
  signature: Hex;
  timestamp: number;
  address: Hex;
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
  type: 'cash-deposit' | 'cash-withdrawal';
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

export type AssociateAddressResponse = {
  profileId: string;
  address: Hex;
  status: string;
};

export type UpgradeResponse = {
  signerAddress: Hex;
  status: string;
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
  type: 'cash-deposit' | 'cash-withdrawal';
};

export type SendIntentResponse = {
  delegationHash: Hex;
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

// === SERVICE DETAILS TYPES ===

export type ServiceDetailsSupportedToken = {
  tokenAddress: Hex;
  tokenDecimals: number;
};

export type ServiceDetailsProtocol = {
  supportedTokens: ServiceDetailsSupportedToken[];
  adapterAddress: Hex;
  intentTypes: ('cash-deposit' | 'cash-withdrawal')[];
};

export type ServiceDetailsChain = {
  autoDepositDelegate: Hex;
  protocol: Record<string, ServiceDetailsProtocol>;
};

export type ServiceDetailsResponse = {
  auth: {
    message: string;
  };
  chains: Record<Hex, ServiceDetailsChain>;
};
