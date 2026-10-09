/**
 * Encryption schema whose `jwtChain` is checked against an issuer JWKS.
 *
 * `encryptionDataKey` is attested by the idOS enclave. `ukycCapabilityToken`
 * is attested by the idOS relay.
 */
export type UkycEncryptionSchemaName =
  | 'encryptionDataKey'
  | 'ukycCapabilityToken';

/**
 * Issuer whose JWKS is fetched to verify an encryption-schema `jwtChain`.
 */
export type UkycJwksSource = 'idos_enclave' | 'idos_relay';

/**
 * Stable codes for {@link UkycJwksError}.
 *
 * `fetch_failed` is the retryable case (network or HTTP). `not_configured`,
 * `malformed`, and `empty` will not succeed until configuration or the
 * published JWKS changes.
 */
export const UKYC_JWKS_ERROR_CODES = {
  notConfigured: 'not_configured',
  fetchFailed: 'fetch_failed',
  malformed: 'malformed',
  empty: 'empty',
} as const;

/**
 * Machine-readable cause of a JWKS fetch failure.
 */
export type UkycJwksErrorCode =
  (typeof UKYC_JWKS_ERROR_CODES)[keyof typeof UKYC_JWKS_ERROR_CODES];

/**
 * Stable codes for {@link UkycJwtVerificationError}.
 *
 * `invalid_signature` and `public_key_mismatch` mean the encryption schema
 * must not be used for wrapping. `unknown_key` can happen when the cached
 * JWKS is stale relative to the token's `kid`.
 */
export const UKYC_JWT_ERROR_CODES = {
  malformedJwt: 'malformed_jwt',
  unsupportedAlgorithm: 'unsupported_algorithm',
  unknownKey: 'unknown_key',
  invalidKey: 'invalid_key',
  invalidSignature: 'invalid_signature',
  invalidPayload: 'invalid_payload',
  publicKeyMismatch: 'public_key_mismatch',
  verificationFailed: 'verification_failed',
} as const;

/**
 * Machine-readable cause of a `jwtChain` verification failure.
 */
export type UkycJwtErrorCode =
  (typeof UKYC_JWT_ERROR_CODES)[keyof typeof UKYC_JWT_ERROR_CODES];

const UKYC_JWKS_SCHEMA_BY_SOURCE = {
  idos_enclave: 'encryptionDataKey',
  idos_relay: 'ukycCapabilityToken',
} as const satisfies Record<UkycJwksSource, UkycEncryptionSchemaName>;

/**
 * Reads a message from an unknown thrown value.
 *
 * @param error - The thrown value.
 * @returns The error message, or the value's string form.
 */
export function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Failure while loading an issuer JWKS used to verify a `jwtChain`.
 *
 * `schema` is the encryption schema that JWKS attests. `httpStatus` is set
 * when the issuer responded with a non-2xx status; the original error is
 * `cause`.
 */
export class UkycJwksError extends Error {
  readonly code: UkycJwksErrorCode;

  readonly source: UkycJwksSource;

  readonly schema: UkycEncryptionSchemaName;

  readonly httpStatus?: number;

  /**
   * Creates a JWKS fetch error.
   *
   * @param code - Machine-readable cause.
   * @param source - Issuer that should have served the JWKS.
   * @param message - Human-readable description.
   * @param options - Optional cause and HTTP status.
   * @param options.cause - The underlying failure.
   * @param options.httpStatus - HTTP status when the issuer responded.
   */
  constructor(
    code: UkycJwksErrorCode,
    source: UkycJwksSource,
    message: string,
    options?: { cause?: unknown; httpStatus?: number },
  ) {
    super(message, options);
    this.name = 'UkycJwksError';
    this.code = code;
    this.source = source;
    this.schema = UKYC_JWKS_SCHEMA_BY_SOURCE[source];
    this.httpStatus = options?.httpStatus;
  }
}

/**
 * Failure while verifying an encryption-schema `jwtChain`.
 *
 * `schema` is set when verification is attempted for a specific encryption
 * schema. Decode and signature-library failures are reported as this error
 * (with the original error as `cause`) rather than left as raw exceptions.
 */
export class UkycJwtVerificationError extends Error {
  readonly code: UkycJwtErrorCode;

  readonly schema?: UkycEncryptionSchemaName;

  /**
   * Creates a JWT verification error.
   *
   * @param code - Machine-readable cause.
   * @param message - Human-readable description.
   * @param options - Optional cause and encryption schema.
   * @param options.cause - The underlying failure.
   * @param options.schema - Schema whose `jwtChain` failed verification.
   */
  constructor(
    code: UkycJwtErrorCode,
    message: string,
    options?: { cause?: unknown; schema?: UkycEncryptionSchemaName },
  ) {
    super(message, options);
    this.name = 'UkycJwtVerificationError';
    this.code = code;
    this.schema = options?.schema;
  }
}
