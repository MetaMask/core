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
 * Password factor for escrow registration.
 *
 * `password` is required at register / addFactor time. Public listings never
 * include it — only `{ type: 'password' }`.
 */
export type PasswordEscrowFactor = {
  type: 'password';
  password: string;
};

/**
 * Public password factor metadata (safe to persist / list).
 */
export type PasswordEscrowFactorPublic = {
  type: 'password';
};

/**
 * TOTP factor for escrow registration.
 *
 * `secret` is the shared base32 secret, required at register / addFactor time.
 * Public listings never include it — only `{ type: 'totp' }`.
 *
 * TOTP release of `S` requires the escrow backend; it is not a local vault
 * unlock factor on its own.
 */
export type TotpEscrowFactor = {
  type: 'totp';
  /** Base32-encoded shared secret (RFC 4648). */
  secret: string;
};

/**
 * Public TOTP factor metadata (safe to persist / list).
 */
export type TotpEscrowFactorPublic = {
  type: 'totp';
};

/**
 * Factor payload accepted by register / addFactor.
 */
export type EscrowFactor =
  | WebAuthnEscrowFactor
  | PasswordEscrowFactor
  | TotpEscrowFactor;

/**
 * Factor metadata safe to persist in client state or list to the UI.
 */
export type EscrowFactorPublic =
  | WebAuthnEscrowFactor
  | PasswordEscrowFactorPublic
  | TotpEscrowFactorPublic;

/**
 * Parameters for registering the first factor and escrowing wallet secret `S`.
 *
 * Additional factors are added with {@link SecretEscrowClient.addFactor}
 * (1-of-N release policy).
 */
export type RegisterParams = {
  /** Stable escrow user id (typically derived from social / seedless identity). */
  userId: string;
  /** Client-chosen id for this factor (e.g. `"passkey"` or `"password"`). */
  factorId: string;
  /** Factor metadata (password factors include plaintext password once). */
  factor: EscrowFactor;
  /**
   * Optional 32-byte wallet secret `S`.
   *
   * When omitted, the escrow generates a cryptographically random secret and
   * returns it once in {@link RegisterResult}.
   */
  secret?: Uint8Array;
};

/**
 * Result of a successful {@link SecretEscrowClient.register} call.
 */
export type RegisterResult = {
  /** Escrowed wallet secret `S` (caller must clear after use). */
  secret: Uint8Array;
};

/**
 * Parameters for adding another factor to an existing escrow user (1-of-N).
 */
export type AddFactorParams = {
  userId: string;
  factorId: string;
  factor: EscrowFactor;
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
   * Challenge for the factor ceremony.
   *
   * Required for WebAuthn `get()`; password factors may ignore it but still
   * consume the pending challenge on exportComplete (anti-replay).
   */
  challenge: Base64URLString;
};

/**
 * Minimal WebAuthn assertion payload accepted by the escrow.
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
 * Proof presented to complete an export for a given factor (1-of-N).
 */
export type FactorProof =
  | { type: 'webauthn'; assertion: EscrowAssertion }
  | { type: 'password'; password: string }
  | { type: 'totp'; code: string };

/**
 * Parameters for completing a secret export after factor verification.
 */
export type ExportCompleteParams = {
  userId: string;
  factorId: string;
  proof: FactorProof;
};

/**
 * Result of {@link SecretEscrowClient.exportComplete}.
 */
export type ExportCompleteResult = {
  /** Released wallet secret `S` (caller must clear after use). */
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
 * Legacy bridge: Social + Passkey coexistence while TOPRF still uses password.
 * New flows escrow wallet secret `S` directly and do not need this.
 */
export type EscrowWrappedPassword = {
  ciphertext: string;
  iv: string;
};

/**
 * Public enrollment metadata (never includes the raw escrow secret).
 *
 * Legacy single-factor shape used by the password-wrap bridge. Prefer listing
 * factors from the escrow when using multi-factor `S` flows.
 */
export type EscrowEnrollmentMetadata = {
  userId: string;
  factorId: string;
  factor: WebAuthnEscrowFactor;
  wrappedPassword: EscrowWrappedPassword;
  enrolledAt: number;
  /** Optional multi-factor public map when available. */
  factors?: Record<string, EscrowFactorPublic>;
};

/**
 * Client interface for a factor-gated secret escrow service.
 *
 * Protocol: `register` (+ `addFactor`*) → (`exportInit` → factor proof →
 * `exportComplete`)*. Release of `S` requires a valid factor proof — never
 * OAuth / bearer token alone. Policy: **1-of-N** (any enrolled factor).
 */
export type SecretEscrowClient = {
  register: (params: RegisterParams) => Promise<RegisterResult>;
  addFactor: (params: AddFactorParams) => Promise<void>;
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

/**
 * Strips secrets from a factor for public persistence / UI listing.
 *
 * @param factor - Factor as registered (may include password plaintext).
 * @returns Public factor metadata.
 */
export function toPublicEscrowFactor(factor: EscrowFactor): EscrowFactorPublic {
  if (factor.type === 'password') {
    return { type: 'password' };
  }
  if (factor.type === 'totp') {
    return { type: 'totp' };
  }
  return structuredClone(factor);
}
