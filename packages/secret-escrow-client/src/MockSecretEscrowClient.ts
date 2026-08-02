import { bytesToBase64, bytesToHex, hexToBytes } from '@metamask/utils';

import {
  SecretEscrowError,
  SecretEscrowErrorCode,
  SecretEscrowErrorMessage,
} from './errors.js';
import type {
  EscrowAssertion,
  EscrowFactor,
  ExportCompleteParams,
  ExportCompleteResult,
  ExportInitParams,
  ExportInitResult,
  RegisterParams,
  RegisterResult,
  RevokeParams,
  SecretEscrowClient,
  WebAuthnEscrowFactor,
} from './types.js';

const SECRET_BYTE_LENGTH = 32;
const CHALLENGE_BYTE_LENGTH = 32;

type StoredEscrowRecord = {
  factors: Record<string, EscrowFactor>;
  /** Hex-encoded secret. */
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
 * Type guard for {@link WebAuthnEscrowFactor}.
 *
 * @param factor - Factor to check.
 * @returns Whether the factor is a webauthn factor.
 */
function isWebAuthnFactor(factor: EscrowFactor): factor is WebAuthnEscrowFactor {
  return factor.type === 'webauthn';
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
 * Validates that an assertion matches the pending challenge and registered
 * credential (mock verification).
 *
 * @param factor - Registered webauthn factor.
 * @param assertion - Client assertion.
 * @param expectedChallenge - Challenge from exportInit.
 */
function assertMockAssertion(
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
 * In-memory {@link SecretEscrowClient} for tests and local development.
 *
 * Mimics the CubeSigner C2F register / export_init / export_complete protocol
 * without network I/O or real WebAuthn signature verification.
 */
export class MockSecretEscrowClient implements SecretEscrowClient {
  readonly #records = new Map<string, StoredEscrowRecord>();

  readonly #challenges = new Map<string, PendingChallenge>();

  readonly #getRandomBytes: (length: number) => Uint8Array;

  constructor(options: MockSecretEscrowClientOptions = {}) {
    this.#getRandomBytes = options.getRandomBytes ?? defaultRandomBytes;
  }

  /**
   * Registers a factor and escrows a secret for `userId`.
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

    if (!isWebAuthnFactor(factor)) {
      throw new SecretEscrowError(SecretEscrowErrorMessage.InvalidFactor, {
        code: SecretEscrowErrorCode.InvalidFactor,
      });
    }
    assertValidWebAuthnFactor(factor);

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
      factors: { [factorId]: structuredClone(factor) },
      secretHex: bytesToHex(secret),
    });

    return { secret };
  }

  /**
   * Issues an export challenge for the given factor.
   *
   * @param params - Export init parameters.
   * @returns Challenge string for the WebAuthn ceremony.
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
   * Completes export after a (mock-verified) assertion and returns the secret.
   *
   * @param params - Export complete parameters.
   * @returns The released escrow secret.
   */
  async exportComplete(
    params: ExportCompleteParams,
  ): Promise<ExportCompleteResult> {
    const { userId, factorId, assertion } = params;
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

    const factor = record.factors[factorId];
    if (!factor || !isWebAuthnFactor(factor)) {
      throw new SecretEscrowError(SecretEscrowErrorMessage.UnknownFactor, {
        code: SecretEscrowErrorCode.UnknownFactor,
      });
    }

    assertMockAssertion(factor, assertion, pending.challenge);
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
   * @param factors - New factors map.
   */
  setFactorsForTests(userId: string, factors: Record<string, EscrowFactor>): void {
    const record = this.#records.get(userId);
    if (!record) {
      throw new Error(`No record for ${userId}`);
    }
    record.factors = factors;
  }

  /**
   * Serializes in-memory escrow state for mock persistence across process
   * restarts. Not for production backends.
   *
   * @returns JSON-serializable snapshot.
   */
  exportSnapshot(): MockSecretEscrowSnapshot {
    return {
      records: Object.fromEntries(this.#records.entries()),
    };
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
      factors: Record<string, EscrowFactor>;
      secretHex: string;
    }
  >;
};
