import {
  assertValidUserStorageWallet,
  assertValidUserStorageGroup,
  assertValidLegacyUserStorageAccount,
} from './validation';

describe('BackupAndSync - UserStorage - Validation', () => {
  describe('assertValidUserStorageWallet', () => {
    it('passes for valid wallet data', () => {
      const validWalletData = {
        name: { value: 'Test Wallet', lastUpdatedAt: 1234567890 },
      };

      expect(() => assertValidUserStorageWallet(validWalletData)).not.toThrow();
    });

    it('throws error for invalid wallet data with detailed message', () => {
      const invalidWalletData = {
        name: { value: 123, lastUpdatedAt: 'invalid' }, // value should be string, lastUpdatedAt should be number
      };

      expect(() => assertValidUserStorageWallet(invalidWalletData)).toThrow(
        /Invalid user storage wallet data:/u,
      );
    });

    it('throws error for completely invalid data structure', () => {
      const invalidData = 'not an object';

      expect(() => assertValidUserStorageWallet(invalidData)).toThrow(
        /Invalid user storage wallet data:/u,
      );
    });

    it('handles missing required fields', () => {
      const incompleteData = {};

      expect(() => assertValidUserStorageWallet(incompleteData)).not.toThrow();
    });

    it('handles null data', () => {
      expect(() => assertValidUserStorageWallet(null)).toThrow(
        /Invalid user storage wallet data:/u,
      );
    });

    it('handles undefined data', () => {
      expect(() => assertValidUserStorageWallet(undefined)).toThrow(
        /Invalid user storage wallet data:/u,
      );
    });
  });

  describe('assertValidUserStorageGroup', () => {
    it('passes for valid group data', () => {
      const validGroupData = {
        name: { value: 'Test Group', lastUpdatedAt: 1234567890 },
        pinned: { value: true, lastUpdatedAt: 1234567890 },
        hidden: { value: false, lastUpdatedAt: 1234567890 },
        groupIndex: 0,
      };

      expect(() => assertValidUserStorageGroup(validGroupData)).not.toThrow();
    });

    it('throws error for invalid group data with detailed message', () => {
      const invalidGroupData = {
        name: { value: 123, lastUpdatedAt: 'invalid' }, // value should be string, lastUpdatedAt should be number
        groupIndex: 'not a number', // should be number
      };

      expect(() => assertValidUserStorageGroup(invalidGroupData)).toThrow(
        /Invalid user storage group data:/u,
      );
    });

    it('throws error for completely invalid data structure', () => {
      const invalidData = null;

      expect(() => assertValidUserStorageGroup(invalidData)).toThrow(
        /Invalid user storage group data:/u,
      );
    });

    it('handles edge cases in validation failures', () => {
      // Test with nested path failures
      const dataWithNestedIssues = {
        name: {
          value: 'Valid Name',
          lastUpdatedAt: null, // This should cause a validation error
        },
        pinned: {
          value: 'not boolean', // This should cause a validation error
          lastUpdatedAt: 1234567890,
        },
      };

      expect(() => assertValidUserStorageGroup(dataWithNestedIssues)).toThrow(
        /Invalid user storage group data:/u,
      );
    });

    it('handles array input', () => {
      expect(() => assertValidUserStorageGroup([])).toThrow(
        /Invalid user storage group data:/u,
      );
    });

    it('handles string input', () => {
      expect(() => assertValidUserStorageGroup('invalid')).toThrow(
        /Invalid user storage group data:/u,
      );
    });

    it('handles number input', () => {
      expect(() => assertValidUserStorageGroup(123)).toThrow(
        /Invalid user storage group data:/u,
      );
    });

    it('handles boolean input', () => {
      expect(() => assertValidUserStorageGroup(true)).toThrow(
        /Invalid user storage group data:/u,
      );
    });
  });

  describe('assertValidLegacyUserStorageAccount', () => {
    it('passes for valid legacy account data', () => {
      const validAccountData = {
        v: '1.0',
        i: 'identifier123',
        a: '0x1234567890abcdef',
        n: 'My Account',
        nlu: 1234567890,
      };

      expect(() =>
        assertValidLegacyUserStorageAccount(validAccountData),
      ).not.toThrow();
    });

    it('passes for minimal legacy account data', () => {
      const minimalAccountData = {}; // All fields are optional

      expect(() =>
        assertValidLegacyUserStorageAccount(minimalAccountData),
      ).not.toThrow();
    });

    it('passes for partial legacy account data', () => {
      const partialAccountData = {
        a: '0x1234567890abcdef',
        n: 'My Account',
      };

      expect(() =>
        assertValidLegacyUserStorageAccount(partialAccountData),
      ).not.toThrow();
    });

    it('throws error for invalid legacy account data with detailed message', () => {
      const invalidAccountData = {
        v: 123, // should be string
        i: true, // should be string
        a: null, // should be string or undefined
        n: [], // should be string
        nlu: 'not a number', // should be number
      };

      expect(() =>
        assertValidLegacyUserStorageAccount(invalidAccountData),
      ).toThrow(/Invalid legacy user storage account data:/u);
    });

    it('throws error for null input', () => {
      expect(() => assertValidLegacyUserStorageAccount(null)).toThrow(
        /Invalid legacy user storage account data:/u,
      );
    });

    it('throws error for undefined input', () => {
      expect(() => assertValidLegacyUserStorageAccount(undefined)).toThrow(
        /Invalid legacy user storage account data:/u,
      );
    });

    it('throws error for string input', () => {
      expect(() => assertValidLegacyUserStorageAccount('invalid')).toThrow(
        /Invalid legacy user storage account data:/u,
      );
    });

    it('handles multiple validation failures', () => {
      const multipleFailuresData = {
        v: 123, // wrong type
        a: true, // wrong type
        n: {}, // wrong type
        nlu: 'string', // wrong type
      };

      let errorMessage = '';
      try {
        assertValidLegacyUserStorageAccount(multipleFailuresData);
      } catch (error) {
        // eslint-disable-next-line jest/no-conditional-in-test
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      expect(errorMessage).toMatch(
        /Invalid legacy user storage account data:/u,
      );
      // Should contain multiple validation failures
      expect(errorMessage).toContain('v');
      expect(errorMessage).toContain('a');
      expect(errorMessage).toContain('n');
      expect(errorMessage).toContain('nlu');
    });
  });
});
