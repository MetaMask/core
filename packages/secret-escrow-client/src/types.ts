/**
 * Base64url-encoded string (no padding), as used by WebAuthn JSON fields.
 */
export type Base64URLString = string;

/**
 * P-256 public key in JWK form, as registered with the escrow for assertion
 * verification.
 */
export type EscrowPublicKeyJwk = {
  kty: 'EC';
  crv: 'P-256';
  x: Base64URLString;
  y: Base64URLString;
};

/**
 * WebAuthn / passkey factor registered with the escrow.
 *
 * Matches the CubeSigner C2F `webauthn` factor shape used by
 * `cubist-secret-escrow` (credential created client-side; escrow verifies
 * assertions).
 */
export type WebAuthnEscrowFactor = {
  type: 'webauthn';
  rpId: string;
  origins: string[];
  credentialId: Base64URLString;
  publicKey: EscrowPublicKeyJwk;
  requireUserVerification?: boolean;
};

/**
 * Factor types supported by the escrow client.
 *
 * Additional factor kinds (password, OIDC) can be added later without changing
 * the register / export flow.
 */
export type EscrowFactor = WebAuthnEscrowFactor;

/**
 * Parameters for registering a factor and escrowing a secret.
 */
export type RegisterParams = {
  /** Stable escrow user id (typically derived from social / seedless identity). */
  userId: string;
  /** Client-chosen id for this factor (e.g. `"passkey"`). */
  factorId: string;
  /** Public factor metadata used to verify later assertions. */
  factor: EscrowFactor;
  /**
   * Optional 32-byte secret to escrow.
   *
   * When omitted, the escrow generates a cryptographically random secret and
   * returns it once in {@link RegisterResult}. Callers that wrap a wallet
   * password should either supply `secret` or consume the returned value
   * immediately and clear it.
   */
  secret?: Uint8Array;
};

/**
 * Result of a successful {@link SecretEscrowClient.register} call.
 */
export type RegisterResult = {
  /** Escrowed secret (caller must clear after use). */
  secret: Uint8Array;
};

/**
 * Parameters for starting a secret export (challenge issuance).
 */
export type ExportInitParams = {
  userId: string;
  factorId: string;
};

/**
 * Result of {@link SecretEscrowClient.exportInit}.
 */
export type ExportInitResult = {
  /**
   * Challenge for `navigator.credentials.get()`.
   *
   * Mock backends use base64url; production backends may return hex — clients
   * should treat this as an opaque challenge string unless documented otherwise.
   */
  challenge: Base64URLString;
};

/**
 * Minimal assertion payload accepted by the escrow.
 *
 * Production backends expect a full WebAuthn `PublicKeyCredential` JSON with
 * `response.{clientDataJSON,authenticatorData,signature}`. The mock verifies
 * `id` + `challenge` only so clients can integrate before a real backend exists.
 */
export type EscrowAssertion = {
  /** Credential id (base64url), must match the registered factor. */
  id: Base64URLString;
  /** Challenge from {@link ExportInitResult.challenge}. */
  challenge: Base64URLString;
  response?: {
    clientDataJSON?: Base64URLString;
    authenticatorData?: Base64URLString;
    signature?: Base64URLString;
    userHandle?: Base64URLString;
  };
};

/**
 * Parameters for completing a secret export after WebAuthn assertion.
 */
export type ExportCompleteParams = {
  userId: string;
  factorId: string;
  assertion: EscrowAssertion;
};

/**
 * Result of {@link SecretEscrowClient.exportComplete}.
 */
export type ExportCompleteResult = {
  /** Released escrow secret (caller must clear after use). */
  secret: Uint8Array;
};

/**
 * Parameters for revoking all escrowed material for a user.
 */
export type RevokeParams = {
  userId: string;
};

/**
 * Wallet password ciphertext wrapped under the escrow secret.
 *
 * Stored by clients / mock backends so Social + Passkey can recover the
 * password after wipe without keeping it only in extension state.
 */
export type EscrowWrappedPassword = {
  ciphertext: string;
  iv: string;
};

/**
 * Public enrollment metadata (never includes the raw escrow secret).
 */
export type EscrowEnrollmentMetadata = {
  userId: string;
  factorId: string;
  factor: WebAuthnEscrowFactor;
  wrappedPassword: EscrowWrappedPassword;
  enrolledAt: number;
};

/**
 * Client interface for a WebAuthn-gated secret escrow service.
 *
 * Protocol: `register` → (`exportInit` → WebAuthn `get` → `exportComplete`)*.
 * Release of the secret must require a valid factor assertion — never OAuth /
 * bearer token alone.
 */
export type SecretEscrowClient = {
  register: (params: RegisterParams) => Promise<RegisterResult>;
  exportInit: (params: ExportInitParams) => Promise<ExportInitResult>;
  exportComplete: (
    params: ExportCompleteParams,
  ) => Promise<ExportCompleteResult>;
  revoke: (params: RevokeParams) => Promise<void>;
};

/**
 * Client that can persist/restore enrollment metadata for wipe recovery.
 */
export type EnrollmentCapableSecretEscrowClient = SecretEscrowClient & {
  putEnrollmentMetadata: (
    metadata: EscrowEnrollmentMetadata,
  ) => Promise<void>;
  getEnrollmentMetadata: (
    userId: string,
  ) => Promise<EscrowEnrollmentMetadata | null>;
};
