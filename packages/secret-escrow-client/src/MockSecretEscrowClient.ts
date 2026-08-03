import { bytesToBase64, bytesToHex, hexToBytes } from '@metamask/utils';

import {
  SecretEscrowError,
  SecretEscrowErrorCode,
  SecretEscrowErrorMessage,
} from './errors.js';
import { verifyTotpCode } from './totp.js';
import type {
  AddFactorParams,
  EscrowAssertion,
  EscrowFactor,
  EscrowFactorPublic,
  ExportCompleteParams,
  ExportCompleteResult,
  ExportInitParams,
  ExportInitResult,
  FactorProof,
  PasswordEscrowFactor,
  RegisterParams,
  RegisterResult,
  RevokeParams,
  SecretEscrowClient,
  TotpEscrowFactor,
  WebAuthnEscrowFactor,
} from './types.js';

const SECRET_BYTE_LENGTH = 32;
const CHALLENGE_BYTE_LENGTH = 32;

/**
 * Server-side stored factor (password / totp secrets kept hashed or raw for mock).
 */
type StoredFactor =
  | WebAuthnEscrowFactor
  | { type: 'password'; passwordHash: string }
  | { type: 'totp'; secret: string };

type StoredEscrowRecord = {
  factors: Record<string, StoredFactor>;
  /** Hex-encoded wallet secret `S`. */
  secretHex: string;
};

type PendingChallenge = {
  factorId: string;
  challenge: string;
};

export type MockSecretEscrowClientOptions = {
  /**
   * Optional RNG for secrets and challenges (defaults to Web Crypto).
   *
   * @param length - Number of random bytes to produce.
   */
  getRandomBytes?: (length: number) => Uint8Array;
};

/**
 * Converts bytes to unpadded base64url.
 *
 * @param bytes - Input bytes.
 * @returns Base64url string.
 */
function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '');
}

/**
 * Generates cryptographically random bytes via Web Crypto.
 *
 * @param length - Number of bytes.
 * @returns Random byte array.
 */
function defaultRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Deterministic mock password hash (not for production).
 *
 * @param password - Plaintext password.
 * @returns Hex hash string.
 */
async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Type guard for {@link WebAuthnEscrowFactor}.
 *
 * @param factor - Factor to check.
 * @returns Whether the factor is a webauthn factor.
 */
function isWebAuthnFactor(
  factor: EscrowFactor | StoredFactor,
): factor is WebAuthnEscrowFactor {
  return factor.type === 'webauthn';
}

/**
 * Type guard for password factor at register time.
 *
 * @param factor - Factor to check.
 * @returns Whether the factor is a password factor with plaintext.
 */
function isPasswordFactor(factor: EscrowFactor): factor is PasswordEscrowFactor {
  return factor.type === 'password';
}

/**
 * Type guard for TOTP factor at register time.
 *
 * @param factor - Factor to check.
 * @returns Whether the factor is a TOTP factor with a shared secret.
 */
function isTotpFactor(factor: EscrowFactor): factor is TotpEscrowFactor {
  return factor.type === 'totp';
}

/**
 * Validates a webauthn factor shape (mock does not verify the public key
 * cryptographically — that belongs on the real escrow).
 *
 * @param factor - Factor to validate.
 */
function assertValidWebAuthnFactor(factor: WebAuthnEscrowFactor): void {
  if (!factor.rpId || factor.origins.length === 0 || !factor.credentialId) {
    throw new SecretEscrowError(SecretEscrowErrorMessage.InvalidFactor, {
      code: SecretEscrowErrorCode.InvalidFactor,
    });
  }
  const { publicKey } = factor;
  if (
    publicKey.kty !== 'EC' ||
    publicKey.crv !== 'P-256' ||
    !publicKey.x ||
    !publicKey.y
  ) {
    throw new SecretEscrowError(SecretEscrowErrorMessage.InvalidFactor, {
      code: SecretEscrowErrorCode.InvalidFactor,
    });
  }
}

/**
 * Validates and converts a register-time factor into a stored factor.
 *
 * @param factor - Factor from the client.
 * @returns Server-side stored factor.
 */
async function toStoredFactor(factor: EscrowFactor): Promise<StoredFactor> {
  if (isWebAuthnFactor(factor)) {
    assertValidWebAuthnFactor(factor);
    return structuredClone(factor);
  }
  if (isPasswordFactor(factor)) {
    if (!factor.password) {
      throw new SecretEscrowError(SecretEscrowErrorMessage.InvalidFactor, {
        code: SecretEscrowErrorCode.InvalidFactor,
      });
    }
    return {
      type: 'password',
      passwordHash: await hashPassword(factor.password),
    };
  }
  if (isTotpFactor(factor)) {
    if (!factor.secret) {
      throw new SecretEscrowError(SecretEscrowErrorMessage.InvalidFactor, {
        code: SecretEscrowErrorCode.InvalidFactor,
      });
    }
    return {
      type: 'totp',
      secret: factor.secret.replace(/\s+/gu, '').toUpperCase(),
    };
  }
  throw new SecretEscrowError(SecretEscrowErrorMessage.InvalidFactor, {
    code: SecretEscrowErrorCode.InvalidFactor,
  });
}

/**
 * Validates a WebAuthn assertion against the pending challenge (mock).
 *
 * @param factor - Registered webauthn factor.
 * @param assertion - Client assertion.
 * @param expectedChallenge - Challenge from exportInit.
 */
function assertMockWebAuthnProof(
  factor: WebAuthnEscrowFactor,
  assertion: EscrowAssertion,
  expectedChallenge: string,
): void {
  if (
    assertion.challenge !== expectedChallenge ||
    assertion.id !== factor.credentialId
  ) {
    throw new SecretEscrowError(SecretEscrowErrorMessage.AssertionFailed, {
      code: SecretEscrowErrorCode.AssertionFailed,
    });
  }
}

/**
 * Validates a factor proof against the stored factor and pending challenge.
 *
 * @param stored - Stored factor.
 * @param proof - Client proof.
 * @param expectedChallenge - Challenge from exportInit.
 */
async function assertMockProof(
  stored: StoredFactor,
  proof: FactorProof,
  expectedChallenge: string,
): Promise<void> {
  if (stored.type === 'webauthn') {
    if (proof.type !== 'webauthn') {
      throw new SecretEscrowError(SecretEscrowErrorMessage.AssertionFailed, {
        code: SecretEscrowErrorCode.AssertionFailed,
      });
    }
    assertMockWebAuthnProof(stored, proof.assertion, expectedChallenge);
    return;
  }

  if (stored.type === 'totp') {
    if (proof.type !== 'totp') {
      throw new SecretEscrowError(SecretEscrowErrorMessage.AssertionFailed, {
        code: SecretEscrowErrorCode.AssertionFailed,
      });
    }
    const valid = await verifyTotpCode(stored.secret, proof.code);
    if (!valid) {
      throw new SecretEscrowError(SecretEscrowErrorMessage.AssertionFailed, {
        code: SecretEscrowErrorCode.AssertionFailed,
      });
    }
    return;
  }

  if (proof.type !== 'password') {
    throw new SecretEscrowError(SecretEscrowErrorMessage.AssertionFailed, {
      code: SecretEscrowErrorCode.AssertionFailed,
    });
  }
  const hash = await hashPassword(proof.password);
  if (hash !== stored.passwordHash) {
    throw new SecretEscrowError(SecretEscrowErrorMessage.AssertionFailed, {
      code: SecretEscrowErrorCode.AssertionFailed,
    });
  }
}

/**
 * Public view of a stored factor.
 *
 * @param stored - Stored factor.
 * @returns Public factor metadata.
 */
function storedToPublic(stored: StoredFactor): EscrowFactorPublic {
  if (stored.type === 'password') {
    return { type: 'password' };
  }
  if (stored.type === 'totp') {
    return { type: 'totp' };
  }
  return structuredClone(stored);
}

/**
 * In-memory {@link SecretEscrowClient} for tests and local development.
 *
 * Supports password, webauthn, and TOTP factors with **1-of-N** export (any
 * enrolled factor can release wallet secret `S`). Mimics CubeSigner C2F without
 * real WebAuthn signature verification.
 */
export class MockSecretEscrowClient implements SecretEscrowClient {
  readonly #records = new Map<string, StoredEscrowRecord>();

  readonly #challenges = new Map<string, PendingChallenge>();

  readonly #getRandomBytes: (length: number) => Uint8Array;

  constructor(options: MockSecretEscrowClientOptions = {}) {
    this.#getRandomBytes = options.getRandomBytes ?? defaultRandomBytes;
  }

  /**
   * Registers the first factor and escrows wallet secret `S` for `userId`.
   *
   * @param params - Registration parameters.
   * @returns The escrowed secret (generated when not provided).
   */
  async register(params: RegisterParams): Promise<RegisterResult> {
    const { userId, factorId, factor, secret: providedSecret } = params;

    if (this.#records.has(userId)) {
      throw new SecretEscrowError(SecretEscrowErrorMessage.AlreadyRegistered, {
        code: SecretEscrowErrorCode.AlreadyRegistered,
      });
    }

    const storedFactor = await toStoredFactor(factor);

    let secret: Uint8Array;
    if (providedSecret === undefined) {
      secret = this.#getRandomBytes(SECRET_BYTE_LENGTH);
    } else if (providedSecret.byteLength !== SECRET_BYTE_LENGTH) {
      throw new SecretEscrowError(SecretEscrowErrorMessage.InvalidSecret, {
        code: SecretEscrowErrorCode.InvalidSecret,
      });
    } else {
      secret = new Uint8Array(providedSecret);
    }

    this.#records.set(userId, {
      factors: { [factorId]: storedFactor },
      secretHex: bytesToHex(secret),
    });

    return { secret };
  }

  /**
   * Adds another factor to an existing user (1-of-N).
   *
   * @param params - Add-factor parameters.
   */
  async addFactor(params: AddFactorParams): Promise<void> {
    const { userId, factorId, factor } = params;
    const record = this.#records.get(userId);
    if (!record) {
      throw new SecretEscrowError(SecretEscrowErrorMessage.NotRegistered, {
        code: SecretEscrowErrorCode.NotRegistered,
      });
    }
    const existing = record.factors[factorId];
    if (existing) {
      // Allow rotating a password factor hash (vault password change during
      // onboarding). Other factor types remain unique.
      if (existing.type !== 'password' || factor.type !== 'password') {
        throw new SecretEscrowError(SecretEscrowErrorMessage.AlreadyRegistered, {
          code: SecretEscrowErrorCode.AlreadyRegistered,
        });
      }
    }
    record.factors[factorId] = await toStoredFactor(factor);
  }

  /**
   * Issues an export challenge for the given factor.
   *
   * @param params - Export init parameters.
   * @returns Challenge string for the factor ceremony.
   */
  async exportInit(params: ExportInitParams): Promise<ExportInitResult> {
    const { userId, factorId } = params;
    const record = this.#records.get(userId);
    if (!record) {
      throw new SecretEscrowError(SecretEscrowErrorMessage.NotRegistered, {
        code: SecretEscrowErrorCode.NotRegistered,
      });
    }
    if (!record.factors[factorId]) {
      throw new SecretEscrowError(SecretEscrowErrorMessage.UnknownFactor, {
        code: SecretEscrowErrorCode.UnknownFactor,
      });
    }

    const challenge = bytesToBase64Url(
      this.#getRandomBytes(CHALLENGE_BYTE_LENGTH),
    );
    this.#challenges.set(userId, { factorId, challenge });
    return { challenge };
  }

  /**
   * Completes export after a verified factor proof and returns wallet secret `S`.
   *
   * @param params - Export complete parameters.
   * @returns The released escrow secret.
   */
  async exportComplete(
    params: ExportCompleteParams,
  ): Promise<ExportCompleteResult> {
    const { userId, factorId, proof } = params;
    const pending = this.#challenges.get(userId);
    if (!pending || pending.factorId !== factorId) {
      throw new SecretEscrowError(SecretEscrowErrorMessage.NoChallenge, {
        code: SecretEscrowErrorCode.NoChallenge,
      });
    }

    const record = this.#records.get(userId);
    if (!record) {
      throw new SecretEscrowError(SecretEscrowErrorMessage.NotRegistered, {
        code: SecretEscrowErrorCode.NotRegistered,
      });
    }

    const stored = record.factors[factorId];
    if (!stored) {
      throw new SecretEscrowError(SecretEscrowErrorMessage.UnknownFactor, {
        code: SecretEscrowErrorCode.UnknownFactor,
      });
    }

    await assertMockProof(stored, proof, pending.challenge);
    this.#challenges.delete(userId);

    return { secret: hexToBytes(record.secretHex) };
  }

  /**
   * Removes all escrowed material and pending challenges for `userId`.
   *
   * @param params - Revoke parameters.
   */
  async revoke(params: RevokeParams): Promise<void> {
    this.#records.delete(params.userId);
    this.#challenges.delete(params.userId);
  }

  /**
   * Lists public factor metadata for a user.
   *
   * @param userId - Escrow user id.
   * @returns Public factors map, or empty object when unknown.
   */
  listFactors(userId: string): Record<string, EscrowFactorPublic> {
    const record = this.#records.get(userId);
    if (!record) {
      return {};
    }
    const out: Record<string, EscrowFactorPublic> = {};
    for (const [id, stored] of Object.entries(record.factors)) {
      out[id] = storedToPublic(stored);
    }
    return out;
  }

  /**
   * Test helper: whether a user has an escrow record.
   *
   * @param userId - Escrow user id.
   * @returns True when registered.
   */
  hasUser(userId: string): boolean {
    return this.#records.has(userId);
  }

  /**
   * Test helper: drop the stored record while leaving a pending challenge.
   *
   * @param userId - Escrow user id.
   */
  deleteRecordForTests(userId: string): void {
    this.#records.delete(userId);
  }

  /**
   * Test helper: replace stored factors for a user.
   *
   * @param userId - Escrow user id.
   * @param factors - New factors map (public / register shapes).
   */
  async setFactorsForTests(
    userId: string,
    factors: Record<string, EscrowFactor>,
  ): Promise<void> {
    const record = this.#records.get(userId);
    if (!record) {
      throw new Error(`No record for ${userId}`);
    }
    const stored: Record<string, StoredFactor> = {};
    for (const [id, factor] of Object.entries(factors)) {
      stored[id] = await toStoredFactor(factor);
    }
    record.factors = stored;
  }

  /**
   * Serializes in-memory escrow state for mock persistence across process
   * restarts. Not for production backends.
   *
   * @returns JSON-serializable snapshot.
   */
  exportSnapshot(): MockSecretEscrowSnapshot {
    // Clone so immer-persisted controller state cannot freeze live records.
    return structuredClone({
      records: Object.fromEntries(this.#records.entries()),
    });
  }

  /**
   * Restores in-memory escrow state from {@link exportSnapshot}.
   *
   * @param snapshot - Previously exported snapshot.
   */
  importSnapshot(snapshot: MockSecretEscrowSnapshot): void {
    this.#records.clear();
    this.#challenges.clear();
    for (const [userId, record] of Object.entries(snapshot.records)) {
      this.#records.set(userId, structuredClone(record));
    }
  }
}

/**
 * Serializable mock backend state (secrets included — mock / local-dev only).
 */
export type MockSecretEscrowSnapshot = {
  records: Record<
    string,
    {
      factors: Record<string, StoredFactor>;
      secretHex: string;
    }
  >;
};
