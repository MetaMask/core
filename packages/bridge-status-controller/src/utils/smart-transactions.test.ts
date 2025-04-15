import { TransactionType } from '@metamask/transaction-controller';

import { isSmartTransactionsEnabled } from './smart-transactions';

describe('smart-transactions utils', () => {
  describe('isSmartTransactionsEnabled', () => {
    it('should return true when all conditions are met for bridge transactions', () => {
      const result = isSmartTransactionsEnabled(
        TransactionType.bridge,
        true, // defaultStxPreference
        true, // isStxEnabledOnClient
        true, // isUserOptedInToStx
      );

      expect(result).toBe(true);
    });

    it('should return false when transaction type is not bridge', () => {
      const result = isSmartTransactionsEnabled(
        TransactionType.simpleSend,
        true,
        true,
        true,
      );

      expect(result).toBe(false);
    });

    it('should return false when smart transactions are not enabled on client', () => {
      const result = isSmartTransactionsEnabled(
        TransactionType.bridge,
        true,
        false,
        true,
      );

      expect(result).toBe(false);
    });

    it('should return false when user has opted out and no default preference', () => {
      const result = isSmartTransactionsEnabled(
        TransactionType.bridge,
        false,
        true,
        false,
      );

      expect(result).toBe(false);
    });

    it('should use default preference when user opt-in status is undefined', () => {
      // Test with default preference true
      const resultWithDefaultTrue = isSmartTransactionsEnabled(
        TransactionType.bridge,
        true,
        true,
        undefined,
      );
      expect(resultWithDefaultTrue).toBe(true);

      // Test with default preference false
      const resultWithDefaultFalse = isSmartTransactionsEnabled(
        TransactionType.bridge,
        false,
        true,
        undefined,
      );
      expect(resultWithDefaultFalse).toBe(false);
    });

    it('should return false when any required condition is not met', () => {
      // Test all combinations where one condition is false
      const testCases = [
        {
          txType: TransactionType.simpleSend,
          defaultStxPreference: true,
          isStxEnabledOnClient: true,
          isUserOptedInToStx: true,
        },
        {
          txType: TransactionType.bridge,
          defaultStxPreference: true,
          isStxEnabledOnClient: false,
          isUserOptedInToStx: true,
        },
        {
          txType: TransactionType.bridge,
          defaultStxPreference: true,
          isStxEnabledOnClient: true,
          isUserOptedInToStx: false,
        },
      ];

      testCases.forEach(
        ({
          txType,
          defaultStxPreference,
          isStxEnabledOnClient,
          isUserOptedInToStx,
        }) => {
          const result = isSmartTransactionsEnabled(
            txType,
            defaultStxPreference,
            isStxEnabledOnClient,
            isUserOptedInToStx,
          );
          expect(result).toBe(false);
        },
      );
    });
  });
});
