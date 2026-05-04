import {
  assertIsSeedlessOnboardingUserAuthenticated,
  assertIsPasswordOutdatedCacheValid,
  assertIsValidPassword,
  assertIsValidVaultData,
} from './assertions';
import { AuthConnection, SeedlessOnboardingControllerErrorMessage } from './constants';
import { AuthenticatedUserDetails, VaultData } from './types';

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

describe('assertIsSeedlessOnboardingUserAuthenticated', () => {
  const createValidAuthenticatedUser = (): AuthenticatedUserDetails => ({
    authConnection: AuthConnection.Google,
    authConnectionId: 'seedless-onboarding',
    userId: 'user@example.com',
    socialLoginEmail: 'user@example.com',
    nodeAuthTokens: [
      {
        authToken: 'auth-token-1',
        nodeIndex: 1,
        nodePubKey: 'node-pub-key-1',
      },
      {
        authToken: 'auth-token-2',
        nodeIndex: 2,
        nodePubKey: 'node-pub-key-2',
      },
      {
        authToken: 'auth-token-3',
        nodeIndex: 3,
        nodePubKey: 'node-pub-key-3',
      },
    ],
    refreshToken: 'refresh-token',
    metadataAccessToken: 'metadata-access-token',
    revokeToken: 'revoke-token',
  });

  it.each([
    [
      'authConnectionId is missing',
      (): AuthenticatedUserDetails => {
        const invalidUser = createValidAuthenticatedUser();
        delete (invalidUser as Record<string, unknown>).authConnectionId;
        return invalidUser;
      },
    ],
    [
      'userId is not a string',
      (): AuthenticatedUserDetails => ({
        ...createValidAuthenticatedUser(),
        // @ts-expect-error - invalid type for testing
        userId: 123,
      }),
    ],
  ])('should throw MissingAuthUserInfo when %s', (_caseName, buildValue) => {
    expect(() => {
      assertIsSeedlessOnboardingUserAuthenticated(buildValue());
    }).toThrow(SeedlessOnboardingControllerErrorMessage.MissingAuthUserInfo);
  });

  it.each([
    [
      'nodeAuthTokens is missing',
      (): AuthenticatedUserDetails => {
        const invalidUser = createValidAuthenticatedUser();
        delete (invalidUser as Record<string, unknown>).nodeAuthTokens;
        return invalidUser;
      },
    ],
    [
      'nodeAuthTokens is not an array',
      (): AuthenticatedUserDetails   => ({
        ...createValidAuthenticatedUser(),
        // @ts-expect-error - invalid type for testing
        nodeAuthTokens: 'invalid',
      }),
    ],
    [
      'nodeAuthTokens does not meet the minimum threshold',
      (): AuthenticatedUserDetails => ({
        ...createValidAuthenticatedUser(),
        nodeAuthTokens: [createValidAuthenticatedUser().nodeAuthTokens[0]],
      }),
    ],
  ])(
    'should throw InsufficientAuthToken when %s',
    (_caseName, buildValue) => {
      expect(() => {
        assertIsSeedlessOnboardingUserAuthenticated(buildValue());
      }).toThrow(SeedlessOnboardingControllerErrorMessage.InsufficientAuthToken);
    },
  );

  it('should throw InvalidRefreshToken when refreshToken is missing', () => {
    const invalidUser = createValidAuthenticatedUser();
    delete (invalidUser as Record<string, unknown>).refreshToken;

    expect(() => {
      assertIsSeedlessOnboardingUserAuthenticated(invalidUser);
    }).toThrow(SeedlessOnboardingControllerErrorMessage.InvalidRefreshToken);
  });

  it('should throw InvalidMetadataAccessToken when metadataAccessToken is invalid', () => {
    expect(() => {
      assertIsSeedlessOnboardingUserAuthenticated({
        ...createValidAuthenticatedUser(),
        metadataAccessToken: 123,
      });
    }).toThrow(
      SeedlessOnboardingControllerErrorMessage.InvalidMetadataAccessToken,
    );
  });

  it('should throw InvalidProfilePairingToken for Telegram users when profilePairingToken is missing', () => {
    expect(() => {
      assertIsSeedlessOnboardingUserAuthenticated({
        ...createValidAuthenticatedUser(),
        authConnection: AuthConnection.Telegram,
      });
    }).toThrow(
      SeedlessOnboardingControllerErrorMessage.InvalidProfilePairingToken,
    );
  });

  it('should not throw for Telegram users when profilePairingToken is present', () => {
    expect(() => {
      assertIsSeedlessOnboardingUserAuthenticated({
        ...createValidAuthenticatedUser(),
        authConnection: AuthConnection.Telegram,
        profilePairingToken: 'profile-pairing-token',
      });
    }).not.toThrow();
  });

  it('should not throw for a valid authenticated user', () => {
    expect(() => {
      assertIsSeedlessOnboardingUserAuthenticated(
        createValidAuthenticatedUser(),
      );
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
    profilePairingToken: 'mock_profile_pairing_token',
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

    it('should throw when profilePairingToken is present but not a string', () => {
      expect(() => {
        assertIsValidVaultData({
          ...createValidVaultData(),
          profilePairingToken: 123,
        });
      }).toThrow(
        SeedlessOnboardingControllerErrorMessage.InvalidProfilePairingToken,
      );
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

    it('should not throw when profilePairingToken is omitted', () => {
      const validDataWithoutProfilePairingToken = createValidVaultData();
      delete validDataWithoutProfilePairingToken.profilePairingToken;

      expect(() => {
        assertIsValidVaultData(validDataWithoutProfilePairingToken);
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
