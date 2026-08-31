/**
 * MFA recovery protocol types from the recovery ADR.
 */

export type Identifier = {
  type: string;
  namespace: string;
  value: string;
  verifier: unknown;
};

export type PoPChallenge = {
  id: string;
  escrowId: string;
  expiresAt: number;
};

export type IdentifierAuthMode = 'key-bound' | 'escrow-challenge';

export type KeyBoundIdentifierToken = {
  identifier: Identifier;
  proofPublicKey: string;
  requestHash: string;
  providerAssertion: unknown;
};

export type ProofOfPossession = {
  challengeId: string;
  requestHash: string;
  signature: string;
};

export type EscrowAuthChallenge = {
  id: string;
  escrowId: string;
  identifier: Identifier;
  requestHash: string;
  expiresAt: number;
};

export type EscrowIdentifierGrant = {
  id: string;
};

export type IdentifierAuthorization =
  | {
      kind: 'key-bound';
      token: KeyBoundIdentifierToken;
      proof: ProofOfPossession;
    }
  | {
      kind: 'escrow-challenge';
      grant: EscrowIdentifierGrant;
    };

export type MutationOperation =
  | 'register'
  | 'updateRecoverySecret'
  | 'updateIdentifiers';

export type Mutation = {
  id: string;
  profileId: string;
  operation: MutationOperation;
  expectedVersion: number;
  newVersion: number;
  payloadHash: string;
  audiences: string[];
  requestHash: string;
};

export type AuthControllerToken = {
  profileId: string;
  requestHash: string;
  twoFactor?: true;
  identifiersHash?: string;
  identifierOwnershipApproved?: true;
  issuer: string;
  expiresAt: number;
  signature: string;
};

export type MutationReceipt = {
  mutationId: string;
  requestHash: string;
  escrowId: string;
  version: number;
  signature: string;
};

export type RegisterPayload = {
  recoverySecret: string;
  identifiers: Identifier[];
};

export type UpdateRecoverySecretPayload = {
  recoverySecret: string;
};

export type UpdateIdentifiersPayload = {
  identifiers: Identifier[];
};

export type MutationPayload =
  | RegisterPayload
  | UpdateRecoverySecretPayload
  | UpdateIdentifiersPayload;

export type AuthorizingPendingOperation = {
  phase: 'authorizing';
  mutation: Mutation;
  payload: MutationPayload;
  identifier: Identifier | null;
};

export type WritingPendingOperation = {
  phase: 'writing';
  mutation: Mutation;
  authControllerToken: AuthControllerToken;
  payload: MutationPayload;
  identifier: Identifier | null;
  receipts: MutationReceipt[];
};

export type PendingOperation =
  | AuthorizingPendingOperation
  | WritingPendingOperation;

export type RecoveryPhase = 'idle' | PendingOperation['phase'];

/**
 * Ciphertext of {@link PendingOperation}. Wallet secure storage encrypts this
 * value; a raw recovery secret is never persisted in the clear.
 */
export type EncryptedPendingOperation = string;

export type RecoveryRecordMetadata = {
  version: number;
  lastMutationId: string;
};

export type RecoverySecretResponse = {
  recoverySecret: Uint8Array;
  version: number;
  lastMutationId: string;
};

/**
 * Authenticates the MetaMask profile and issues request-bound attestations.
 */
export type RecoveryAuthProvider = {
  getAuthenticatedProfileId: () => Promise<string>;
  authorizeRecoveryRequest: (params: {
    requestHash: string;
    requireTwoFactor?: boolean;
    identifiers?: Identifier[];
  }) => Promise<AuthControllerToken>;
};

/**
 * Obtains a key-bound identifier assertion from an IdP (OIDC, Passkey, SIWE).
 */
export type RecoveryIdentifierAuthProvider = {
  getKeyBoundIdentifierToken: (params: {
    identifier: Identifier;
    proofPublicKey: string;
    requestHash: string;
  }) => Promise<KeyBoundIdentifierToken>;
};

/**
 * One recovery escrow replica. Implementations may talk to different backends.
 */
export type RecoveryEscrowProvider = {
  readonly id: string;
  isAvailable: () => Promise<boolean>;
  generateChallenge: () => Promise<PoPChallenge>;
  beginIdentifierAuthentication: (params: {
    identifier: Identifier;
    requestHash: string;
  }) => Promise<EscrowAuthChallenge>;
  completeIdentifierAuthentication: (
    challengeId: string,
    response: unknown,
  ) => Promise<EscrowIdentifierGrant>;
  getRecoveryMetadata: (
    profileId: string,
  ) => Promise<RecoveryRecordMetadata | null>;
  getSecret: (
    authorization: IdentifierAuthorization,
    requestId: string,
  ) => Promise<RecoverySecretResponse>;
  applyMutation: (
    mutation: Mutation,
    authControllerToken: AuthControllerToken,
    identifierAuthorization: IdentifierAuthorization | null,
    payload: MutationPayload,
  ) => Promise<MutationReceipt>;
  verifyReceipt: (receipt: MutationReceipt, mutation: Mutation) => boolean;
};

/**
 * Encrypts pending mutation state using wallet secure storage.
 */
export type PendingOperationEncryptor = {
  encrypt: (operation: PendingOperation) => Promise<EncryptedPendingOperation>;
  decrypt: (ciphertext: EncryptedPendingOperation) => Promise<PendingOperation>;
};
