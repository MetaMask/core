import { base64ToBytes, bytesToBase64, bytesToString } from '@metamask/utils';
import { utf8ToBytes } from '@noble/ciphers/utils';
import { describe, expect, it } from 'vitest';

import { SeedlessOnboardingControllerErrorMessage } from '../constants.js';
import { DecodedBaseJWTToken, VaultData } from '../types.js';
import {
  assertIdTokenMatchesUserId,
  assertIdentityUnchanged,
  assertIsEncryptedKeyringEncryptionKeySet,
  assertIsEncryptedSeedlessEncryptionKeySet,
  assertIsPasswordOutdatedCacheValid,
  assertIsValidPassword,
  assertIsValidVaultData,
} from './assertions.js';

describe('assertIsValidPassword', () => {
  it('should throw when password is not a string', () => {
    expect(() => {
      assertIsValidPassword(null);
    }).toThrow(SeedlessOnboardingControllerErrorMessage.WrongPasswordType);

    expect(() => {
      assertIsValidPassword(undefined);
    }).toThrow(SeedlessOnboardingControllerErrorMessage.WrongPasswordType);

    expect(() => {
      assertIsValidPassword(123);
    }).toThrow(SeedlessOnboardingControllerErrorMessage.WrongPasswordType);

    expect(() => {
      assertIsValidPassword({});
    }).toThrow(SeedlessOnboardingControllerErrorMessage.WrongPasswordType);

    expect(() => {
      assertIsValidPassword([]);
    }).toThrow(SeedlessOnboardingControllerErrorMessage.WrongPasswordType);
  });

  it('should throw when password is an empty string', () => {
    expect(() => {
      assertIsValidPassword('');
    }).toThrow(SeedlessOnboardingControllerErrorMessage.InvalidEmptyPassword);
  });

  it('should not throw for valid non-empty string', () => {
    expect(() => {
      assertIsValidPassword('password123');
    }).not.toThrow();
  });
});

describe('assertIsValidVaultData', () => {
  /**
   * Helper function to create valid vault data for testing
   *
   * @returns The valid vault data.
   */
  const createValidVaultData = (): VaultData => ({
    toprfEncryptionKey: 'mock_encryption_key',
    toprfPwEncryptionKey: 'mock_pw_encryption_key',
    toprfAuthKeyPair: 'mock_auth_key_pair',
    accessToken: 'mock_access_token',
    revokeToken: 'mock_revoke_token',
  });

  describe('should throw VaultDataError for invalid data', () => {
    it('should throw when value is null or undefined', () => {
      expect(() => {
        assertIsValidVaultData(null);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.InvalidVaultData);
      expect(() => {
        assertIsValidVaultData(undefined);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.InvalidVaultData);
    });

    it('should throw when toprfEncryptionKey is missing or not a string', () => {
      const invalidData = createValidVaultData();
      delete (invalidData as Record<string, unknown>).toprfEncryptionKey;

      expect(() => {
        assertIsValidVaultData(invalidData);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.InvalidVaultData);
      const invalidData2 = {
        ...createValidVaultData(),
        toprfEncryptionKey: 123,
      };

      expect(() => {
        assertIsValidVaultData(invalidData2);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.InvalidVaultData);
    });

    it('should throw when toprfPwEncryptionKey is missing or not a string', () => {
      const invalidData = createValidVaultData();
      delete (invalidData as Record<string, unknown>).toprfPwEncryptionKey;

      expect(() => {
        assertIsValidVaultData(invalidData);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.InvalidVaultData);

      const invalidData2 = {
        ...createValidVaultData(),
        toprfPwEncryptionKey: 456,
      };

      expect(() => {
        assertIsValidVaultData(invalidData2);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.InvalidVaultData);
    });

    it('should throw when toprfAuthKeyPair is missing or not a string', () => {
      const invalidData = createValidVaultData();
      delete (invalidData as Record<string, unknown>).toprfAuthKeyPair;

      expect(() => {
        assertIsValidVaultData(invalidData);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.InvalidVaultData);

      const invalidData2 = {
        ...createValidVaultData(),
        toprfAuthKeyPair: [],
      };

      expect(() => {
        assertIsValidVaultData(invalidData2);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.InvalidVaultData);
    });

    it('should throw when accessToken is missing or not a string', () => {
      const invalidData = createValidVaultData();
      delete (invalidData as Record<string, unknown>).accessToken;

      expect(() => {
        assertIsValidVaultData(invalidData);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.InvalidAccessToken);

      const invalidData2 = {
        ...createValidVaultData(),
        revokeToken: 'MOCK_REVOKE_TOKEN',
        accessToken: 999,
      };

      expect(() => {
        assertIsValidVaultData(invalidData2);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.InvalidAccessToken);
    });
  });

  describe('should NOT throw for valid data', () => {
    it('should not throw when all required fields are valid strings', () => {
      const validData = createValidVaultData();

      expect(() => {
        assertIsValidVaultData(validData);
      }).not.toThrow();
    });

    it('should not throw with extra properties in valid vault data', () => {
      const validDataWithExtras = {
        ...createValidVaultData(),
        extraProperty: 'extra_value',
        anotherExtra: 123,
      };

      expect(() => {
        assertIsValidVaultData(validDataWithExtras);
      }).not.toThrow();
    });
  });
});

describe('assertIsPasswordOutdatedCacheValid', () => {
  it('should throw when value is not a valid number', () => {
    expect(() => {
      assertIsPasswordOutdatedCacheValid(null);
    }).toThrow(
      SeedlessOnboardingControllerErrorMessage.InvalidPasswordOutdatedCache,
    );
  });

  it('should throw when value is a negative number', () => {
    expect(() => {
      assertIsPasswordOutdatedCacheValid(-1);
    }).toThrow(
      SeedlessOnboardingControllerErrorMessage.InvalidPasswordOutdatedCache,
    );
  });

  it('should not throw when value is a valid number', () => {
    expect(() => {
      assertIsPasswordOutdatedCacheValid(1000);
    }).not.toThrow();
  });

  it('should throw when value is NaN', () => {
    expect(() => {
      assertIsPasswordOutdatedCacheValid(NaN);
    }).toThrow(
      SeedlessOnboardingControllerErrorMessage.InvalidPasswordOutdatedCache,
    );
  });

  it('should throw when value is Infinity', () => {
    expect(() => {
      assertIsPasswordOutdatedCacheValid(Infinity);
    }).toThrow(
      SeedlessOnboardingControllerErrorMessage.InvalidPasswordOutdatedCache,
    );
  });

  it('should throw when value is -Infinity', () => {
    expect(() => {
      assertIsPasswordOutdatedCacheValid(-Infinity);
    }).toThrow(
      SeedlessOnboardingControllerErrorMessage.InvalidPasswordOutdatedCache,
    );
  });
});

describe('encrypted key assertions', () => {
  it('accepts non-empty encrypted key values', () => {
    expect(() => {
      assertIsEncryptedKeyringEncryptionKeySet('encrypted-keyring-key');
      assertIsEncryptedSeedlessEncryptionKeySet('encrypted-seedless-key');
    }).not.toThrow();
  });

  it('rejects missing encrypted key values', () => {
    expect(() => {
      assertIsEncryptedKeyringEncryptionKeySet(undefined);
    }).toThrow(
      SeedlessOnboardingControllerErrorMessage.EncryptedKeyringEncryptionKeyNotSet,
    );
    expect(() => {
      assertIsEncryptedSeedlessEncryptionKeySet('');
    }).toThrow(
      SeedlessOnboardingControllerErrorMessage.EncryptedSeedlessEncryptionKeyNotSet,
    );
  });
});

describe('assertIdTokenMatchesUserId', () => {
  /**
   * Creates a mock JWT idToken with the given payload claims.
   *
   * @param params - The payload claims for the token.
   * @returns The encoded JWT token (header.payload.signature).
   */
  const createMockIdToken = (
    params: Partial<DecodedBaseJWTToken> & { sub?: string } = {},
  ): string => {
    const defaultPayload: DecodedBaseJWTToken = {
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      aud: 'mock_audience',
      iss: 'mock_issuer',
      sub: 'mock_user_id',
    };
    const payload = { ...defaultPayload, ...params };
    const header = { alg: 'RS256', typ: 'JWT' };
    const encode = (value: Record<string, unknown>): string =>
      bytesToBase64(utf8ToBytes(JSON.stringify(value)));
    return `${encode(header)}.${encode(payload)}.${'mock_signature'}`;
  };

  it('should not throw when idToken sub matches the userId', () => {
    expect(() => {
      assertIdTokenMatchesUserId(
        [createMockIdToken({ sub: 'user-1' })],
        'user-1',
      );
    }).not.toThrow();
  });

  it('should throw IdentityMismatch when idToken sub does not match the userId', () => {
    expect(() => {
      assertIdTokenMatchesUserId(
        [createMockIdToken({ sub: 'user-A' })],
        'user-B',
      );
    }).toThrow(SeedlessOnboardingControllerErrorMessage.IdentityMismatch);
  });

  it('should only validate the first idToken', () => {
    expect(() => {
      assertIdTokenMatchesUserId(
        [
          createMockIdToken({ sub: 'user-1' }),
          createMockIdToken({ sub: 'other' }),
        ],
        'user-1',
      );
    }).not.toThrow();
  });

  it('should not throw when the idToken has no sub claim (defer to server-side validation)', () => {
    const tokenWithoutSub = createMockIdToken();
    // Rebuild payload without sub
    const header = { alg: 'RS256', typ: 'JWT' };
    const encode = (value: Record<string, unknown>): string =>
      bytesToBase64(utf8ToBytes(JSON.stringify(value)));
    const payload = JSON.parse(
      bytesToString(base64ToBytes(tokenWithoutSub.split('.')[1])),
    ) as Record<string, unknown>;
    delete payload.sub;
    const token = `${encode(header)}.${encode(payload)}.${'mock_signature'}`;

    expect(() => {
      assertIdTokenMatchesUserId([token], 'any-user');
    }).not.toThrow();
  });

  it('should not throw when the idToken cannot be decoded (defer to server-side validation)', () => {
    expect(() => {
      assertIdTokenMatchesUserId(['not-a-jwt'], 'user-1');
    }).not.toThrow();
  });
});

describe('assertIdentityUnchanged', () => {
  const identity = {
    userId: 'user-1',
    authConnectionId: 'auth-connection-1',
  };

  it('should not throw when the identity is unchanged', () => {
    expect(() => {
      assertIdentityUnchanged({ ...identity }, { ...identity });
    }).not.toThrow();
  });

  it('should not throw when both identities are fully cleared', () => {
    expect(() => {
      assertIdentityUnchanged(
        { userId: undefined, authConnectionId: undefined },
        { userId: undefined, authConnectionId: undefined },
      );
    }).not.toThrow();
  });

  it('should throw IdentityMismatch when the userId changed', () => {
    expect(() => {
      assertIdentityUnchanged(
        { ...identity, userId: 'user-2' },
        { ...identity },
      );
    }).toThrow(SeedlessOnboardingControllerErrorMessage.IdentityMismatch);
  });

  it('should throw IdentityMismatch when the identity was cleared', () => {
    expect(() => {
      assertIdentityUnchanged(
        { userId: undefined, authConnectionId: undefined },
        { ...identity },
      );
    }).toThrow(SeedlessOnboardingControllerErrorMessage.IdentityMismatch);
  });

  it('should throw IdentityMismatch when the authConnectionId changed', () => {
    expect(() => {
      assertIdentityUnchanged(
        { ...identity, authConnectionId: 'auth-connection-2' },
        { ...identity },
      );
    }).toThrow(SeedlessOnboardingControllerErrorMessage.IdentityMismatch);
  });
});
