import { TOPRFErrorCode } from '@metamask/toprf-secure-backup';

import { SeedlessOnboardingControllerErrorMessage } from './constants';
import { getErrorMessageFromTOPRFErrorCode } from './errors';

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
