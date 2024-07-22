import type { LoginResponse } from '../authentication';
import { validateLoginResponse } from './validate-login-response';

describe('validateLoginResponse() tests', () => {
  it('validates if a shape is of type LoginResponse', () => {
    const input: LoginResponse = {
      profile: {
        identifierId: '',
        metaMetricsId: '',
        profileId: '',
      },
      token: {
        accessToken: '',
        expiresIn: 3600,
        obtainedAt: Date.now(),
      },
    };

    expect(validateLoginResponse(input)).toBe(true);
  });

  it('returns false if a shape is invalid', () => {
    const assertInvalid = (input: unknown) => {
      expect(validateLoginResponse(input)).toBe(false);
    };

    assertInvalid(null);
    assertInvalid({});
    assertInvalid({ profile: {} });
    assertInvalid({ token: {} });
  });
});
