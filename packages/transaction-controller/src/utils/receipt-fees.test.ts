import type { TransactionReceipt } from '../types';
import {
  getLayer1FeeFromReceipt,
  getOperatorFeeFromReceipt,
} from './receipt-fees';

describe('receipt-fees', () => {
  // Values from a live Mantle mainnet receipt.
  const MANTLE_RECEIPT: TransactionReceipt = {
    gasUsed: '0xceaf',
    l1Fee: '0x9173c910a1ac',
    operatorFeeConstant: '0x0',
    operatorFeeScalar: '0x5f5e100',
    tokenRatio: '0x120c',
  };

  describe('getOperatorFeeFromReceipt', () => {
    it('computes Mantle Arsia operator fee from receipt fields', () => {
      // gasUsed (52911) * scalar (100000000) * 100 + constant (0)
      // Odd-length hex is padded to even length.
      expect(getOperatorFeeFromReceipt(MANTLE_RECEIPT)).toBe('0x01e1390598dc00');
    });

    it('returns undefined when operator fee fields are missing', () => {
      expect(
        getOperatorFeeFromReceipt({
          gasUsed: '0xceaf',
          l1Fee: '0x9173c910a1ac',
        }),
      ).toBeUndefined();
    });

    it('returns undefined when gasUsed is missing', () => {
      expect(
        getOperatorFeeFromReceipt({
          operatorFeeScalar: '0x5f5e100',
          operatorFeeConstant: '0x0',
        }),
      ).toBeUndefined();
    });

    it('includes a non-zero operatorFeeConstant', () => {
      expect(
        getOperatorFeeFromReceipt({
          gasUsed: '0x1',
          operatorFeeScalar: '0x1',
          operatorFeeConstant: '0xa',
        }),
      ).toBe('0x6e'); // 1 * 1 * 100 + 10 = 110
    });
  });

  describe('getLayer1FeeFromReceipt', () => {
    it('sums Mantle receipt l1Fee and operator fee', () => {
      const operatorFee = BigInt('0xceaf') * BigInt('0x5f5e100') * 100n;
      const l1Fee = BigInt('0x9173c910a1ac');
      // padHexToEvenLength prefixes a 0 when the hex length is odd
      expect(getLayer1FeeFromReceipt(MANTLE_RECEIPT)).toBe(
        `0x0${(l1Fee + operatorFee).toString(16)}`,
      );
    });

    it('returns l1Fee only for Optimism-style receipts without operator fields', () => {
      expect(
        getLayer1FeeFromReceipt({
          gasUsed: '0xb496',
          l1Fee: '0x5f5e100',
        }),
      ).toBe('0x05f5e100');
    });

    it('returns operator fee only when l1Fee is absent', () => {
      expect(
        getLayer1FeeFromReceipt({
          gasUsed: '0x1',
          operatorFeeScalar: '0x1',
          operatorFeeConstant: '0x0',
        }),
      ).toBe('0x64'); // 100
    });

    it('returns undefined when neither l1Fee nor operator fields are present', () => {
      expect(
        getLayer1FeeFromReceipt({
          gasUsed: '0xceaf',
        }),
      ).toBeUndefined();
    });

    it('returns 0x00 when both components are present and zero', () => {
      expect(
        getLayer1FeeFromReceipt({
          gasUsed: '0x1',
          l1Fee: '0x0',
          operatorFeeScalar: '0x0',
          operatorFeeConstant: '0x0',
        }),
      ).toBe('0x00');
    });

    it('does not multiply l1Fee by tokenRatio', () => {
      const withoutRatio = getLayer1FeeFromReceipt({
        gasUsed: MANTLE_RECEIPT.gasUsed,
        l1Fee: MANTLE_RECEIPT.l1Fee,
        operatorFeeScalar: MANTLE_RECEIPT.operatorFeeScalar,
        operatorFeeConstant: MANTLE_RECEIPT.operatorFeeConstant,
      });
      const withRatio = getLayer1FeeFromReceipt(MANTLE_RECEIPT);

      expect(withRatio).toBe(withoutRatio);
    });
  });
});
