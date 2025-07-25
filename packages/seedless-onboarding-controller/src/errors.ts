import {
  type RateLimitErrorData,
  TOPRFError,
  TOPRFErrorCode,
} from '@metamask/toprf-secure-backup';

import { SeedlessOnboardingControllerErrorMessage } from './constants';
import type { RecoveryErrorData } from './types';

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
  if (
    error.meta && // error metadata must be present
    error.code === TOPRFErrorCode.RateLimitExceeded &&
    typeof error.meta.rateLimitDetails === 'object' &&
    error.meta.rateLimitDetails !== null &&
    'remainingTime' in error.meta.rateLimitDetails &&
    typeof error.meta.rateLimitDetails.remainingTime === 'number' &&
    'message' in error.meta.rateLimitDetails &&
    typeof error.meta.rateLimitDetails.message === 'string' &&
    'lockTime' in error.meta.rateLimitDetails &&
    typeof error.meta.rateLimitDetails.lockTime === 'number' &&
    'guessCount' in error.meta.rateLimitDetails &&
    typeof error.meta.rateLimitDetails.guessCount === 'number'
  ) {
    return {
      remainingTime: error.meta.rateLimitDetails.remainingTime,
      message: error.meta.rateLimitDetails.message,
      lockTime: error.meta.rateLimitDetails.lockTime,
      guessCount: error.meta.rateLimitDetails.guessCount,
    };
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
