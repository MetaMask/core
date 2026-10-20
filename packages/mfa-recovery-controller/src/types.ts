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
  /**
   * Unix time in seconds.
   */
  expiresAt: number;
};

export type IdentifierAuthMode = 'key-bound';

export type KeyBoundIdentifierToken = {
  identifier: Identifier;
  /**
   * Raw 32-byte Ed25519 public key of the ephemeral proof key.
   */
  proofPublicKey: Uint8Array;
  requestHash: string;
  providerAssertion: unknown;
};

export type ProofOfPossession = {
  challengeId: string;
  requestHash: string;
  signature: string;
};

/**
 * Identifier proof presented to an escrow. Only key-bound proofs are wired;
 * escrow-challenge grants land with MFA-605 / MFA-606 / MFA-568.
 */
export type IdentifierAuthorization = {
  kind: 'key-bound';
  token: KeyBoundIdentifierToken;
  proof: ProofOfPossession;
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

/**
 * Hydra access token (compact JWT). Its `ext` claims bind it to one mutation:
 * `aal`, `request_hash`, and `identifiers_hash`.
 */
export type AuthControllerToken = string;

export type MutationReceipt = {
  mutationId: string;
  requestHash: string;
  escrowId: string;
  version: number;
  /**
   * SHA-256 of the raw 32-byte Ed25519 receipt public key, as `0x` hex.
   */
  receiptKeyId: string;
  signature: string;
};

/**
 * Key-bound identifier credential: the IdP token and the private key that
 * proves possession of it. Ephemeral; keep only in memory.
 */
export type KeyBoundCredential = {
  token: KeyBoundIdentifierToken;
  /**
   * Raw 32-byte Ed25519 private key of the ephemeral proof key.
   */
  proofPrivateKey: Uint8Array;
};

/**
 * Result of first-factor identifier authentication, consumed by
 * `getRecoverySecret`.
 *
 * `proofPrivateKey` signs escrow challenges. `ephemeralPrivateKey` is the
 * private half of `pkE` and decrypts the recovery secret. Keep both in
 * memory only.
 */
export type IdentifierSession = KeyBoundCredential & {
  requestId: string;
  /**
   * Raw 32-byte X25519 private key matching `pkE`.
   */
  ephemeralPrivateKey: Uint8Array;
  /**
   * Raw 32-byte X25519 public key, the client's one-time read key.
   */
  pkE: Uint8Array;
};

/**
 * Recovery secret wrapped to one escrow wrap key for transit.
 */
export type WrappedSecret = {
  /**
   * Raw 32-byte X25519 public key of the sender's ephemeral key.
   */
  pkE: Uint8Array;
  /**
   * Raw bytes of `iv || AES-256-GCM(ciphertext+tag)`.
   */
  ciphertext: Uint8Array;
};

export type WrappedSecretOutput = {
  /**
   * Raw bytes of `iv || AES-256-GCM(ciphertext+tag)`.
   */
  ciphertext: Uint8Array;
};

export type RegisterPayload = {
  recoverySecret: WrappedSecret;
  identifiers: Identifier[];
};

export type UpdateRecoverySecretPayload = Pick<
  RegisterPayload,
  'recoverySecret'
>;

export type UpdateIdentifiersPayload = Pick<RegisterPayload, 'identifiers'>;

/**
 * Escrow `applyMutation` body. Recovery secrets are wrapped to that escrow's
 * wrap key; do not confuse with {@link PendingMutationPayload}.
 */
export type MutationPayload =
  | RegisterPayload
  | UpdateRecoverySecretPayload
  | UpdateIdentifiersPayload;

/**
 * 0x-hex of a plaintext recovery secret. Encrypted pending state stores this
 * logical value; each escrow receives a {@link WrappedSecret} only at apply.
 */
export type PendingRecoverySecretHex = string;

/**
 * Logical register payload stored in encrypted pending state.
 */
export type PendingRegisterPayload = {
  identifiers: Identifier[];
  recoverySecret: PendingRecoverySecretHex;
};

/**
 * Logical secret-update payload stored in encrypted pending state.
 */
export type PendingUpdateRecoverySecretPayload = Pick<
  PendingRegisterPayload,
  'recoverySecret'
>;

/**
 * Logical identifier-update payload stored in encrypted pending state.
 */
export type PendingUpdateIdentifiersPayload = Pick<
  PendingRegisterPayload,
  'identifiers'
>;

/**
 * Logical mutation payload persisted in encrypted pending state. Distinct from
 * {@link MutationPayload}, which is the per-escrow apply body.
 */
export type PendingMutationPayload =
  | PendingRegisterPayload
  | PendingUpdateRecoverySecretPayload
  | PendingUpdateIdentifiersPayload;

type PendingOperationBase = {
  mutation: Mutation;
  identifier: Identifier | null;
  payload: PendingMutationPayload;
};

export type AuthorizingPendingOperation = PendingOperationBase & {
  phase: 'authorizing';
};

export type WritingPendingOperation = PendingOperationBase & {
  phase: 'writing';
  authControllerToken: AuthControllerToken;
  receipts: MutationReceipt[];
};

export type PendingOperation =
  | AuthorizingPendingOperation
  | WritingPendingOperation;

export type RecoveryPhase = 'idle' | PendingOperation['phase'];

/**
 * Encoded ciphertext of {@link PendingOperation}. Wallet secure storage
 * encrypts this blob (including any hex recovery secret). A raw recovery
 * secret is never persisted in BaseController state.
 *
 * The recovery spec's pseudocode represents this as `Uint8Array`, but the
 * controller stores the encoded ciphertext as a string so BaseController state
 * persistence and serialization preserve it without binary coercion.
 */
export type EncryptedPendingOperation = string;

export type GetRecoverySecretResponse = {
  recoverySecret: WrappedSecretOutput;
  version: number;
  lastMutationId: string;
  wrapKeyId: string;
};

/**
 * Recovery secret plus the version to use as `epoch` on later mutations.
 */
export type RecoveredSecret = {
  recoverySecret: Uint8Array;
  epoch: number;
};

/**
 * Authenticates the MetaMask profile and issues request-bound attestations.
 */
export type RecoveryAuthProvider = {
  getAuthenticatedProfileId: () => Promise<string>;
  authorizeRecoveryRequest: (params: {
    requestHash: string;
    audiences: string[];
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
    /**
     * Raw 32-byte Ed25519 public key to bind into the token.
     */
    proofPublicKey: Uint8Array;
    requestHash: string;
  }) => Promise<KeyBoundIdentifierToken>;
};

/**
 * One recovery escrow replica. Implementations may talk to different backends.
 */
export type RecoveryEscrowProvider = {
  readonly id: string;
  /**
   * Audience the AuthController token must carry for this escrow to accept it.
   * Independent of `id`.
   */
  readonly authAudience: string;
  /**
   * Raw 32-byte X25519 wrap public key. Mutation payloads are encrypted to this
   * key; `getSecret` responses are encrypted to the request's ephemeral key
   * using the corresponding wrap private key.
   */
  readonly wrapPublicKey: Uint8Array;
  isAvailable: () => Promise<boolean>;
  generateChallenge: () => Promise<PoPChallenge>;
  getSecret: (
    authorization: IdentifierAuthorization,
    requestId: string,
    pkE: Uint8Array,
  ) => Promise<GetRecoverySecretResponse>;
  applyMutation: (
    mutation: Mutation,
    authControllerToken: AuthControllerToken,
    identifierAuthorization: IdentifierAuthorization | null,
    payload: MutationPayload,
  ) => Promise<MutationReceipt>;
  /**
   * Verifies a receipt cryptographically using the build-pinned receipt key
   * and confirms it targets the expected escrow.
   *
   * @param receipt - Receipt returned by an escrow.
   * @param mutation - Mutation acknowledged by the receipt.
   * @param expectedEscrowId - Escrow identity expected by the caller.
   */
  verifyReceipt: (
    receipt: MutationReceipt,
    mutation: Mutation,
    expectedEscrowId: string,
  ) => Promise<boolean>;
};

/**
 * Encrypts pending mutation state using wallet secure storage.
 */
export type PendingOperationEncryptor = {
  encrypt: (operation: PendingOperation) => Promise<EncryptedPendingOperation>;
  decrypt: (ciphertext: EncryptedPendingOperation) => Promise<PendingOperation>;
};
