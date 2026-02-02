import {
  assertIsPasswordOutdatedCacheValid,
  assertIsValidVaultData,
} from './assertions';
import { SeedlessOnboardingControllerErrorMessage } from './constants';
import { VaultData } from './types';

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
