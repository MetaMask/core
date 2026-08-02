/**
 * Stable programmatic codes for {@link SecretEscrowError}.
 */
export const SecretEscrowErrorCode = {
  AlreadyRegistered: 'already_registered',
  NotRegistered: 'not_registered',
  UnknownFactor: 'unknown_factor',
  NoChallenge: 'no_challenge',
  AssertionFailed: 'assertion_failed',
  InvalidSecret: 'invalid_secret',
  InvalidFactor: 'invalid_factor',
} as const;

export type SecretEscrowErrorCode =
  (typeof SecretEscrowErrorCode)[keyof typeof SecretEscrowErrorCode];

/**
 * Human-readable messages for {@link SecretEscrowError}.
 */
export enum SecretEscrowErrorMessage {
  AlreadyRegistered = 'Secret escrow user is already registered',
  NotRegistered = 'Secret escrow user is not registered',
  UnknownFactor = 'Unknown escrow factor id',
  NoChallenge = 'No export challenge registered for user',
  AssertionFailed = 'Escrow factor assertion verification failed',
  InvalidSecret = 'Escrow secret must be a 32-byte Uint8Array',
  InvalidFactor = 'Invalid escrow factor',
}

/**
 * Options for creating a {@link SecretEscrowError}.
 */
export type SecretEscrowErrorOptions = {
  code: SecretEscrowErrorCode;
  cause?: Error;
};

/**
 * Error thrown by secret escrow client implementations.
 */
export class SecretEscrowError extends Error {
  readonly code: SecretEscrowErrorCode;

  cause?: Error;

  constructor(message: string, options: SecretEscrowErrorOptions) {
    super(message);
    this.name = 'SecretEscrowError';
    this.code = options.code;
    if (options.cause) {
      this.cause = options.cause;
    }
    Object.setPrototypeOf(this, SecretEscrowError.prototype);
  }
}
