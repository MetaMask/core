import { assertIsValidVaultData } from './assertions';
import { SeedlessOnboardingControllerErrorMessage } from './constants';

describe('assertIsValidVaultData', () => {
  /**
   * Helper function to create valid vault data for testing
   *
   * @returns The valid vault data.
   */
  const createValidVaultData = () => ({
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
      }).toThrow(SeedlessOnboardingControllerErrorMessage.VaultDataError);
      expect(() => {
        assertIsValidVaultData(undefined);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.VaultDataError);
    });

    it('should throw when toprfEncryptionKey is missing or not a string', () => {
      const invalidData = createValidVaultData();
      delete (invalidData as Record<string, unknown>).toprfEncryptionKey;

      expect(() => {
        assertIsValidVaultData(invalidData);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.VaultDataError);
      const invalidData2 = {
        ...createValidVaultData(),
        toprfEncryptionKey: 123,
      };

      expect(() => {
        assertIsValidVaultData(invalidData2);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.VaultDataError);
    });

    it('should throw when toprfPwEncryptionKey is missing or not a string', () => {
      const invalidData = createValidVaultData();
      delete (invalidData as Record<string, unknown>).toprfPwEncryptionKey;

      expect(() => {
        assertIsValidVaultData(invalidData);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.VaultDataError);

      const invalidData2 = {
        ...createValidVaultData(),
        toprfPwEncryptionKey: 456,
      };

      expect(() => {
        assertIsValidVaultData(invalidData2);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.VaultDataError);
    });

    it('should throw when toprfAuthKeyPair is missing or not a string', () => {
      const invalidData = createValidVaultData();
      delete (invalidData as Record<string, unknown>).toprfAuthKeyPair;

      expect(() => {
        assertIsValidVaultData(invalidData);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.VaultDataError);

      const invalidData2 = {
        ...createValidVaultData(),
        toprfAuthKeyPair: [],
      };

      expect(() => {
        assertIsValidVaultData(invalidData2);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.VaultDataError);
    });

    it('should throw when revokeToken exists but is not a string or undefined', () => {
      const invalidData = {
        ...createValidVaultData(),
        revokeToken: 789,
      };

      expect(() => {
        assertIsValidVaultData(invalidData);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.VaultDataError);

      const invalidData2 = {
        ...createValidVaultData(),
        revokeToken: null,
      };

      expect(() => {
        assertIsValidVaultData(invalidData2);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.VaultDataError);

      const invalidData3 = {
        ...createValidVaultData(),
        revokeToken: {},
      };

      expect(() => {
        assertIsValidVaultData(invalidData3);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.VaultDataError);
    });

    it('should throw when accessToken is missing or not a string', () => {
      const invalidData = createValidVaultData();
      delete (invalidData as Record<string, unknown>).accessToken;

      expect(() => {
        assertIsValidVaultData(invalidData);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.VaultDataError);

      const invalidData2 = {
        ...createValidVaultData(),
        accessToken: 999,
      };

      expect(() => {
        assertIsValidVaultData(invalidData2);
      }).toThrow(SeedlessOnboardingControllerErrorMessage.VaultDataError);
    });
  });

  describe('should NOT throw for valid data', () => {
    it('should not throw when all required fields are valid strings', () => {
      const validData = createValidVaultData();

      expect(() => {
        assertIsValidVaultData(validData);
      }).not.toThrow();
    });

    it('should not throw when revokeToken is undefined', () => {
      const validData = {
        ...createValidVaultData(),
        revokeToken: undefined,
      };

      expect(() => {
        assertIsValidVaultData(validData);
      }).not.toThrow();
    });

    it('should not throw when revokeToken is a valid string', () => {
      const validData = {
        ...createValidVaultData(),
        revokeToken: 'valid_revoke_token',
      };

      expect(() => {
        assertIsValidVaultData(validData);
      }).not.toThrow();
    });

    it('should not throw when revokeToken property is missing entirely', () => {
      const validData = createValidVaultData();
      delete (validData as Record<string, unknown>).revokeToken;

      expect(() => {
        assertIsValidVaultData(validData);
      }).not.toThrow();
    });

    it('should not throw with minimal valid vault data', () => {
      const minimalValidData = {
        toprfEncryptionKey: 'key1',
        toprfPwEncryptionKey: 'key2',
        toprfAuthKeyPair: 'keyPair',
        accessToken: 'token',
      };

      expect(() => {
        assertIsValidVaultData(minimalValidData);
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
