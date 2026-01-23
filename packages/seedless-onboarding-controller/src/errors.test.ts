import { TOPRFErrorCode } from '@metamask/toprf-secure-backup';

import { SeedlessOnboardingControllerErrorMessage } from './constants';
import {
  getErrorMessageFromTOPRFErrorCode,
  SeedlessOnboardingError,
} from './errors';

describe('getErrorMessageFromTOPRFErrorCode', () => {
  it('returns TooManyLoginAttempts for RateLimitExceeded', () => {
    expect(
      getErrorMessageFromTOPRFErrorCode(
        TOPRFErrorCode.RateLimitExceeded,
        'default',
      ),
    ).toBe(SeedlessOnboardingControllerErrorMessage.TooManyLoginAttempts);
  });

  it('returns IncorrectPassword for CouldNotDeriveEncryptionKey', () => {
    expect(
      getErrorMessageFromTOPRFErrorCode(
        TOPRFErrorCode.CouldNotDeriveEncryptionKey,
        'default',
      ),
    ).toBe(SeedlessOnboardingControllerErrorMessage.IncorrectPassword);
  });

  it('returns CouldNotRecoverPassword for CouldNotFetchPassword', () => {
    expect(
      getErrorMessageFromTOPRFErrorCode(
        TOPRFErrorCode.CouldNotFetchPassword,
        'default',
      ),
    ).toBe(SeedlessOnboardingControllerErrorMessage.CouldNotRecoverPassword);
  });

  it('returns InsufficientAuthToken for AuthTokenExpired', () => {
    expect(
      getErrorMessageFromTOPRFErrorCode(
        TOPRFErrorCode.AuthTokenExpired,
        'default',
      ),
    ).toBe(SeedlessOnboardingControllerErrorMessage.InsufficientAuthToken);
  });

  it('returns defaultMessage for unknown code', () => {
    expect(
      getErrorMessageFromTOPRFErrorCode(
        9999 as unknown as TOPRFErrorCode,
        'fallback',
      ),
    ).toBe('fallback');
  });
});

describe('SeedlessOnboardingError', () => {
  describe('constructor', () => {
    it('creates an error with just a message', () => {
      const error = new SeedlessOnboardingError('Test error message');

      expect(error.message).toBe('Test error message');
      expect(error.name).toBe('SeedlessOnboardingControllerError');
      expect(error.details).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it('creates an error with a message from SeedlessOnboardingControllerErrorMessage enum', () => {
      const error = new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.AuthenticationError,
      );

      expect(error.message).toBe(
        SeedlessOnboardingControllerErrorMessage.AuthenticationError,
      );
      expect(error.name).toBe('SeedlessOnboardingControllerError');
    });

    it('creates an error with message and details', () => {
      const error = new SeedlessOnboardingError('Test error', {
        details: 'Additional context for debugging',
      });

      expect(error.message).toBe('Test error');
      expect(error.details).toBe('Additional context for debugging');
      expect(error.cause).toBeUndefined();
    });

    it('creates an error with an Error instance as cause', () => {
      const originalError = new Error('Original error');
      const error = new SeedlessOnboardingError('Wrapped error', {
        cause: originalError,
      });

      expect(error.message).toBe('Wrapped error');
      expect(error.cause).toBe(originalError);
    });

    it('creates an error with a string as cause', () => {
      const error = new SeedlessOnboardingError('Test error', {
        cause: 'String cause message',
      });

      expect(error.cause).toBeInstanceOf(Error);
      expect(error.cause?.message).toBe('String cause message');
    });

    it('creates an error with an object as cause (JSON serializable)', () => {
      const causeObject = { code: 500, reason: 'Internal error' };
      const error = new SeedlessOnboardingError('Test error', {
        cause: causeObject,
      });

      expect(error.cause).toBeInstanceOf(Error);
      expect(error.cause?.message).toBe(JSON.stringify(causeObject));
    });

    it('handles circular object as cause by using fallback message', () => {
      const circularObject: Record<string, unknown> = { name: 'circular' };
      circularObject.self = circularObject;

      const error = new SeedlessOnboardingError('Test error', {
        cause: circularObject,
      });

      expect(error.cause).toBeInstanceOf(Error);
      expect(error.cause?.message).toBe('Unknown error');
    });

    it('creates an error with both details and cause', () => {
      const originalError = new Error('Original');
      const error = new SeedlessOnboardingError('Test error', {
        details: 'Some details',
        cause: originalError,
      });

      expect(error.message).toBe('Test error');
      expect(error.details).toBe('Some details');
      expect(error.cause).toBe(originalError);
    });
  });

  describe('toJSON', () => {
    it('serializes error with all properties', () => {
      const originalError = new Error('Original error');
      const error = new SeedlessOnboardingError('Test error', {
        details: 'Debug info',
        cause: originalError,
      });

      const json = error.toJSON();

      expect(json.name).toBe('SeedlessOnboardingControllerError');
      expect(json.message).toBe('Test error');
      expect(json.details).toBe('Debug info');
      expect(json.cause).toStrictEqual({
        name: 'Error',
        message: 'Original error',
      });
      expect(json.stack).toBeDefined();
    });

    it('serializes error without optional properties', () => {
      const error = new SeedlessOnboardingError('Simple error');

      const json = error.toJSON();

      expect(json.name).toBe('SeedlessOnboardingControllerError');
      expect(json.message).toBe('Simple error');
      expect(json.details).toBeUndefined();
      expect(json.cause).toBeUndefined();
      expect(json.stack).toBeDefined();
    });

    it('serializes error with custom error type as cause', () => {
      class CustomError extends Error {
        constructor() {
          super('Custom error message');
          this.name = 'CustomError';
        }
      }
      const customError = new CustomError();
      const error = new SeedlessOnboardingError('Wrapper', {
        cause: customError,
      });

      const json = error.toJSON();

      expect(json.cause).toStrictEqual({
        name: 'CustomError',
        message: 'Custom error message',
      });
    });
  });

  describe('inheritance', () => {
    it('is an instance of Error', () => {
      const error = new SeedlessOnboardingError('Test');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SeedlessOnboardingError);
    });

    it('has a proper stack trace', () => {
      const error = new SeedlessOnboardingError('Test');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('SeedlessOnboardingError');
    });
  });
});
