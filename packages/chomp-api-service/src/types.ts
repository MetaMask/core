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
  signedDelegation: string;
  chainId: string;
};

/**
 * A single intent to be submitted to the Chomp API.
 * TODO: Define the full shape of an intent once the API schema is confirmed.
 */
export type SendIntentRequest = Record<string, unknown>;

/**
 * TODO: Define request shape once the withdrawal endpoint path and schema are
 * confirmed against CHOMP API docs.
 */
export type CreateWithdrawalRequest = Record<string, unknown>;

// === RESPONSE TYPES ===

export type AssociateAddressResponse = {
  profileId: string;
  address: string;
  status: string;
};

export type CreateUpgradeResponse = {
  signerAddress: string;
  status: string;
  createdAt: string;
};

/**
 * The upgrade record returned by GET /v1/account-upgrade/:address.
 * TODO: Confirm full shape against CHOMP API docs.
 */
export type GetUpgradeResponse = {
  signerAddress: string;
  status: string;
  createdAt: string;
};

export type VerifyDelegationResponse = {
  valid: boolean;
  delegationHash?: string;
  errors?: string[];
};

/**
 * A single intent response.
 * TODO: Define the full shape once the API schema is confirmed.
 */
export type SendIntentResponse = Record<string, unknown>;

/**
 * TODO: Define response shape once the withdrawal endpoint path and schema are
 * confirmed against CHOMP API docs.
 */
export type CreateWithdrawalResponse = Record<string, unknown>;
