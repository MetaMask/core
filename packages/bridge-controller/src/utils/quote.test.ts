import { isValidQuoteRequest } from './quote';
import type { GenericQuoteRequest } from '../types';

describe('Quote Utils', () => {
  describe('isValidQuoteRequest', () => {
    const validRequest: GenericQuoteRequest = {
      srcTokenAddress: '0x123',
      destTokenAddress: '0x456',
      srcChainId: '1',
      destChainId: '137',
      walletAddress: '0x789',
      srcTokenAmount: '1000',
      slippage: 0.5,
    };

    it('should return true for valid request with all required fields', () => {
      expect(isValidQuoteRequest(validRequest)).toBe(true);
    });

    it('should return false if any required string field is missing', () => {
      const requiredFields = [
        'srcTokenAddress',
        'destTokenAddress',
        'srcChainId',
        'destChainId',
        'walletAddress',
        'srcTokenAmount',
      ];

      requiredFields.forEach((field) => {
        const invalidRequest = { ...validRequest };
        delete invalidRequest[field as keyof GenericQuoteRequest];
        expect(isValidQuoteRequest(invalidRequest)).toBe(false);
      });
    });

    it('should return false if any required string field is empty', () => {
      const requiredFields = [
        'srcTokenAddress',
        'destTokenAddress',
        'srcChainId',
        'destChainId',
        'walletAddress',
        'srcTokenAmount',
      ];

      requiredFields.forEach((field) => {
        const invalidRequest = {
          ...validRequest,
          [field]: '',
        };
        expect(isValidQuoteRequest(invalidRequest)).toBe(false);
      });
    });

    it('should return false if any required string field is null', () => {
      const invalidRequest = {
        ...validRequest,
        srcTokenAddress: null,
      };
      expect(isValidQuoteRequest(invalidRequest as never)).toBe(false);
    });

    it('should return false if srcTokenAmount is not a valid positive integer', () => {
      const invalidAmounts = ['0', '-1', '1.5', 'abc', '01'];
      invalidAmounts.forEach((amount) => {
        const invalidRequest = {
          ...validRequest,
          srcTokenAmount: amount,
        };
        expect(isValidQuoteRequest(invalidRequest)).toBe(false);
      });
    });

    it('should return true for valid srcTokenAmount values', () => {
      const validAmounts = ['1', '100', '999999'];
      validAmounts.forEach((amount) => {
        const validAmountRequest = {
          ...validRequest,
          srcTokenAmount: amount,
        };
        expect(isValidQuoteRequest(validAmountRequest)).toBe(true);
      });
    });

    it('should validate request without amount when requireAmount is false', () => {
      const { srcTokenAmount, ...requestWithoutAmount } = validRequest;
      expect(isValidQuoteRequest(requestWithoutAmount, false)).toBe(true);
    });

    describe('slippage validation', () => {
      it('should return true when slippage is a valid number', () => {
        const requestWithSlippage = {
          ...validRequest,
          slippage: 1.5,
        };
        expect(isValidQuoteRequest(requestWithSlippage)).toBe(true);
      });

      it('should return false when slippage is NaN', () => {
        const requestWithInvalidSlippage = {
          ...validRequest,
          slippage: NaN,
        };
        expect(isValidQuoteRequest(requestWithInvalidSlippage)).toBe(false);
      });

      it('should return false when slippage is null', () => {
        const requestWithInvalidSlippage = {
          ...validRequest,
          slippage: null,
        };
        expect(isValidQuoteRequest(requestWithInvalidSlippage as never)).toBe(
          false,
        );
      });

      it('should return true when slippage is undefined', () => {
        const requestWithoutSlippage = { ...validRequest };
        delete requestWithoutSlippage.slippage;
        expect(isValidQuoteRequest(requestWithoutSlippage)).toBe(true);
      });
    });
  });
});
