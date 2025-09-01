import {
  assertValidUserStorageWallet,
  assertValidUserStorageGroup,
} from './validation';

describe('BackupAndSync - UserStorage - Validation', () => {
  describe('assertValidUserStorageWallet', () => {
    it('should pass for valid wallet data', () => {
      const validWalletData = {
        name: { value: 'Test Wallet', lastUpdatedAt: 1234567890 },
      };

      expect(() => assertValidUserStorageWallet(validWalletData)).not.toThrow();
    });

    it('should throw error for invalid wallet data with detailed message', () => {
      const invalidWalletData = {
        name: { value: 123, lastUpdatedAt: 'invalid' }, // value should be string, lastUpdatedAt should be number
      };

      expect(() => assertValidUserStorageWallet(invalidWalletData)).toThrow(
        /Invalid user storage wallet data:/u,
      );
    });

    it('should throw error for completely invalid data structure', () => {
      const invalidData = 'not an object';

      expect(() => assertValidUserStorageWallet(invalidData)).toThrow(
        /Invalid user storage wallet data:/u,
      );
    });

    it('should handle missing required fields', () => {
      const incompleteData = {};

      expect(() => assertValidUserStorageWallet(incompleteData)).not.toThrow();
    });

    it('should handle null data', () => {
      expect(() => assertValidUserStorageWallet(null)).toThrow(
        /Invalid user storage wallet data:/u,
      );
    });

    it('should handle undefined data', () => {
      expect(() => assertValidUserStorageWallet(undefined)).toThrow(
        /Invalid user storage wallet data:/u,
      );
    });
  });

  describe('assertValidUserStorageGroup', () => {
    it('should pass for valid group data', () => {
      const validGroupData = {
        name: { value: 'Test Group', lastUpdatedAt: 1234567890 },
        pinned: { value: true, lastUpdatedAt: 1234567890 },
        hidden: { value: false, lastUpdatedAt: 1234567890 },
        groupIndex: 0,
      };

      expect(() => assertValidUserStorageGroup(validGroupData)).not.toThrow();
    });

    it('should throw error for invalid group data with detailed message', () => {
      const invalidGroupData = {
        name: { value: 123, lastUpdatedAt: 'invalid' }, // value should be string, lastUpdatedAt should be number
        groupIndex: 'not a number', // should be number
      };

      expect(() => assertValidUserStorageGroup(invalidGroupData)).toThrow(
        /Invalid user storage group data:/u,
      );
    });

    it('should throw error for completely invalid data structure', () => {
      const invalidData = null;

      expect(() => assertValidUserStorageGroup(invalidData)).toThrow(
        /Invalid user storage group data:/u,
      );
    });

    it('should handle edge cases in validation failures', () => {
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

    it('should handle array input', () => {
      expect(() => assertValidUserStorageGroup([])).toThrow(
        /Invalid user storage group data:/u,
      );
    });

    it('should handle string input', () => {
      expect(() => assertValidUserStorageGroup('invalid')).toThrow(
        /Invalid user storage group data:/u,
      );
    });

    it('should handle number input', () => {
      expect(() => assertValidUserStorageGroup(123)).toThrow(
        /Invalid user storage group data:/u,
      );
    });

    it('should handle boolean input', () => {
      expect(() => assertValidUserStorageGroup(true)).toThrow(
        /Invalid user storage group data:/u,
      );
    });
  });
});
