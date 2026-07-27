import { TOPRFError, TOPRFErrorCode } from '@metamask/toprf-secure-backup';
import type { RateLimitErrorData } from '@metamask/toprf-secure-backup';

import { SeedlessOnboardingControllerErrorMessage } from './constants';
import type { SecretMetadata } from './SecretMetadata';
import type {
  InvalidPrimarySecretDataTypeErrorData,
  RecoveryErrorData,
} from './types';
import { getInvalidPrimarySecretDataTypeErrorData } from './utils';

/**
 * Get the error message from the TOPRF error code.
 *
 * @param errorCode - The TOPRF error code.
 * @param defaultMessage - The default error message if the error code is not found.
 * @returns The error message.
 */
export function getErrorMessageFromTOPRFErrorCode(
  errorCode: TOPRFErrorCode,
  defaultMessage: string,
): string {
  switch (errorCode) {
    case TOPRFErrorCode.RateLimitExceeded:
      return SeedlessOnboardingControllerErrorMessage.TooManyLoginAttempts;
    case TOPRFErrorCode.CouldNotDeriveEncryptionKey:
      return SeedlessOnboardingControllerErrorMessage.IncorrectPassword;
    case TOPRFErrorCode.CouldNotFetchPassword:
      return SeedlessOnboardingControllerErrorMessage.CouldNotRecoverPassword;
    case TOPRFErrorCode.AuthTokenExpired:
      return SeedlessOnboardingControllerErrorMessage.InsufficientAuthToken;
    default:
      return defaultMessage;
  }
}

/**
 * Check if the provided error is a rate limit error triggered by too many login attempts.
 *
 * Return a new TooManyLoginAttemptsError if the error is a rate limit error, otherwise undefined.
 *
 * @param error - The error to check.
 * @returns The rate limit error if the error is a rate limit error, otherwise undefined.
 */
function getRateLimitErrorData(
  error: TOPRFError,
): RateLimitErrorData | undefined {
  const rateLimitDetails = error.meta?.rateLimitDetails;
  if (
    error.meta && // error metadata must be present
    error.code === TOPRFErrorCode.RateLimitExceeded &&
    typeof rateLimitDetails === 'object' &&
    rateLimitDetails !== null
  ) {
    const details = rateLimitDetails as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(details, 'remainingTime') &&
      typeof details.remainingTime === 'number' &&
      Object.prototype.hasOwnProperty.call(details, 'message') &&
      typeof details.message === 'string' &&
      Object.prototype.hasOwnProperty.call(details, 'lockTime') &&
      typeof details.lockTime === 'number' &&
      Object.prototype.hasOwnProperty.call(details, 'guessCount') &&
      typeof details.guessCount === 'number'
    ) {
      return {
        remainingTime: details.remainingTime,
        message: details.message,
        lockTime: details.lockTime,
        guessCount: details.guessCount,
      };
    }
  }
  return undefined;
}

/**
 * The PasswordSyncError class is used to handle errors that occur during the password sync process.
 */
export class PasswordSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedlessOnboardingController - PasswordSyncError';
  }

  /**
   * Get an instance of the PasswordSyncError class.
   *
   * @param error - The error to get the instance of.
   * @returns The instance of the PasswordSyncError class.
   */
  static getInstance(error: unknown): PasswordSyncError {
    if (error instanceof TOPRFError) {
      const errorMessage = getErrorMessageFromTOPRFErrorCode(
        error.code,
        SeedlessOnboardingControllerErrorMessage.CouldNotRecoverPassword,
      );
      return new PasswordSyncError(errorMessage);
    }
    return new PasswordSyncError(
      SeedlessOnboardingControllerErrorMessage.CouldNotRecoverPassword,
    );
  }
}

/**
 * The RecoveryError class is used to handle errors that occur during the recover encryption key process from the passwrord.
 * It extends the Error class and includes a data property that can be used to store additional information.
 */
export class RecoveryError extends Error {
  data: RecoveryErrorData | undefined;

  constructor(message: string, data?: RecoveryErrorData) {
    super(message);
    this.data = data;
    this.name = 'SeedlessOnboardingController - RecoveryError';
  }

  /**
   * Get an instance of the RecoveryError class.
   *
   * @param error - The error to get the instance of.
   * @returns The instance of the RecoveryError class.
   */
  static getInstance(error: unknown): RecoveryError {
    if (!(error instanceof TOPRFError)) {
      return new RecoveryError(
        SeedlessOnboardingControllerErrorMessage.LoginFailedError,
      );
    }

    const rateLimitErrorData = getRateLimitErrorData(error);

    const recoveryErrorData = rateLimitErrorData
      ? {
          numberOfAttempts: rateLimitErrorData.guessCount,
          remainingTime: rateLimitErrorData.remainingTime,
        }
      : undefined;

    const errorMessage = getErrorMessageFromTOPRFErrorCode(
      error.code,
      SeedlessOnboardingControllerErrorMessage.LoginFailedError,
    );
    return new RecoveryError(errorMessage, recoveryErrorData);
  }
}

/**
 * Error thrown when fetched secret metadata does not include a primary mnemonic.
 */
export class InvalidPrimarySecretDataTypeError extends Error {
  /**
   * Non-sensitive type label for each secret metadata item, in fetch order.
   */
  data: InvalidPrimarySecretDataTypeErrorData;

  constructor(data: InvalidPrimarySecretDataTypeErrorData) {
    super(
      SeedlessOnboardingControllerErrorMessage.InvalidPrimarySecretDataType,
    );
    this.name =
      'SeedlessOnboardingController - InvalidPrimarySecretDataTypeError';
    this.data = data;
  }

  /**
   * Create an error from secret metadata items.
   *
   * @param secrets - The secret metadata items that failed validation.
   * @returns A new `InvalidPrimarySecretDataTypeError`.
   */
  static fromSecretMetadata(
    secrets: SecretMetadata<string | Uint8Array>[],
  ): InvalidPrimarySecretDataTypeError {
    return new InvalidPrimarySecretDataTypeError(
      getInvalidPrimarySecretDataTypeErrorData(secrets),
    );
  }
}

/**
 * Generic error class for SeedlessOnboardingController operations.
 *
 * Use this when you need to wrap an underlying error with additional context,
 * or when none of the more specific error classes (PasswordSyncError, RecoveryError) apply.
 *
 * @example
 * ```typescript
 * throw new SeedlessOnboardingError(
 *   SeedlessOnboardingControllerErrorMessage.FailedToEncryptAndStoreSecretData,
 *   { details: 'Encryption failed during backup', cause: originalError }
 * );
 * ```
 */
export class SeedlessOnboardingError extends Error {
  /**
   * Additional context about the error beyond the message.
   * Use this for human-readable details that help with debugging.
   */
  public details: string | undefined;

  /**
   * The underlying error that caused this error.
   */
  public cause: Error | undefined;

  constructor(
    message: string | SeedlessOnboardingControllerErrorMessage,
    options?: { details?: string; cause?: unknown },
  ) {
    super(message);
    this.name = 'SeedlessOnboardingControllerError';
    this.details = options?.details;
    if (options?.cause) {
      if (options.cause instanceof Error) {
        this.cause = options.cause;
      } else {
        let causeMessage: string;
        if (typeof options.cause === 'string') {
          causeMessage = options.cause;
        } else {
          try {
            causeMessage = JSON.stringify(options.cause);
          } catch {
            causeMessage = 'Unknown error';
          }
        }
        this.cause = new Error(causeMessage);
      }
    }
  }

  /**
   * Serializes the cause error for JSON output.
   *
   * @returns A JSON-serializable representation of the cause.
   */
  #serializeCause(): Record<string, unknown> | undefined {
    if (this.cause instanceof SeedlessOnboardingError) {
      return this.cause.toJSON();
    }
    if (this.cause instanceof Error) {
      return { name: this.cause.name, message: this.cause.message };
    }
    return undefined;
  }

  /**
   * Serializes the error for logging/transmission.
   * Ensures custom properties are included in JSON output.
   *
   * @returns A JSON-serializable representation of the error.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      details: this.details,
      cause: this.#serializeCause(),
      stack: this.stack,
    };
  }
}
