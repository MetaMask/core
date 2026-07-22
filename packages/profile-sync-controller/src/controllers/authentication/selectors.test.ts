import type { LoginResponse } from '../../sdk';
import type { AuthenticationControllerState } from './AuthenticationController';
import { authenticationControllerSelectors } from './selectors';

const createLoginResponse = (
  overrides: Partial<LoginResponse['profile']> = {},
): LoginResponse => ({
  token: {
    accessToken: 'access-token',
    expiresIn: 3600,
    obtainedAt: Date.now(),
  },
  profile: {
    identifierId: 'identifier-id',
    profileId: 'profile-id',
    canonicalProfileId: 'canonical-profile-id',
    metaMetricsId: 'metametrics-id',
    ...overrides,
  },
});

describe('authenticationControllerSelectors', () => {
  describe('selectSrpSessionData', () => {
    it('returns undefined when srpSessionData is missing', () => {
      const state: AuthenticationControllerState = {
        isSignedIn: false,
      };

      expect(
        authenticationControllerSelectors.selectSrpSessionData(state),
      ).toBeUndefined();
    });

    it('returns the srpSessionData map when present', () => {
      const srpSessionData = {
        'entropy-1': createLoginResponse(),
      };
      const state: AuthenticationControllerState = {
        isSignedIn: true,
        srpSessionData,
      };

      expect(
        authenticationControllerSelectors.selectSrpSessionData(state),
      ).toBe(srpSessionData);
    });
  });

  describe('selectSessionData', () => {
    it('returns undefined when srpSessionData is missing', () => {
      const state: AuthenticationControllerState = {
        isSignedIn: false,
      };

      expect(
        authenticationControllerSelectors.selectSessionData(state),
      ).toBeUndefined();
    });

    it('returns undefined when srpSessionData is empty', () => {
      const state: AuthenticationControllerState = {
        isSignedIn: true,
        srpSessionData: {},
      };

      expect(
        authenticationControllerSelectors.selectSessionData(state),
      ).toBeUndefined();
    });

    it('returns the first session entry', () => {
      const primary = createLoginResponse({ profileId: 'primary-profile' });
      const secondary = createLoginResponse({ profileId: 'secondary-profile' });
      const state: AuthenticationControllerState = {
        isSignedIn: true,
        srpSessionData: {
          'entropy-1': primary,
          'entropy-2': secondary,
        },
      };

      expect(authenticationControllerSelectors.selectSessionData(state)).toBe(
        primary,
      );
    });
  });

  describe('selectCanonicalProfileId', () => {
    it('returns undefined when srpSessionData is missing', () => {
      const state: AuthenticationControllerState = {
        isSignedIn: false,
      };

      expect(
        authenticationControllerSelectors.selectCanonicalProfileId(state),
      ).toBeUndefined();
    });

    it('returns undefined when canonicalProfileId is an empty string', () => {
      const state: AuthenticationControllerState = {
        isSignedIn: true,
        srpSessionData: {
          'entropy-1': createLoginResponse({ canonicalProfileId: '' }),
        },
      };

      expect(
        authenticationControllerSelectors.selectCanonicalProfileId(state),
      ).toBeUndefined();
    });

    it('returns the canonical profile ID on the happy path', () => {
      const state: AuthenticationControllerState = {
        isSignedIn: true,
        srpSessionData: {
          'entropy-1': createLoginResponse({
            canonicalProfileId: 'canonical-profile-id',
          }),
        },
      };

      expect(
        authenticationControllerSelectors.selectCanonicalProfileId(state),
      ).toBe('canonical-profile-id');
    });

    it('returns the shared canonical when multiple SRP sessions are present after propagation', () => {
      const state: AuthenticationControllerState = {
        isSignedIn: true,
        srpSessionData: {
          'entropy-1': createLoginResponse({
            profileId: 'original-1',
            canonicalProfileId: 'shared-canonical',
          }),
          'entropy-2': createLoginResponse({
            profileId: 'original-2',
            canonicalProfileId: 'shared-canonical',
          }),
        },
      };

      expect(
        authenticationControllerSelectors.selectCanonicalProfileId(state),
      ).toBe('shared-canonical');
    });
  });
});
