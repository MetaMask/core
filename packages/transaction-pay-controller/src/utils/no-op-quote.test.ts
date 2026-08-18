import type { Hex } from '@metamask/utils';

import { TransactionPayStrategy } from '../constants.js';
import type { TransactionPaymentToken } from '../types.js';
import { buildNoOpQuote } from './no-op-quote.js';

const FROM_MOCK = '0xabc' as Hex;

const PAYMENT_TOKEN_MOCK = {
  address: '0x123' as Hex,
  balanceRaw: '2000000',
  chainId: '0x89' as Hex,
  decimals: 6,
  symbol: 'pUSD',
} as TransactionPaymentToken;

describe('No-Op Quote Utils', () => {
  describe('buildNoOpQuote', () => {
    it('builds quote with none strategy', () => {
      const quote = buildNoOpQuote(FROM_MOCK, PAYMENT_TOKEN_MOCK);

      expect(quote.strategy).toBe(TransactionPayStrategy.None);
    });

    it('builds quote with zero fees and amounts', () => {
      const quote = buildNoOpQuote(FROM_MOCK, PAYMENT_TOKEN_MOCK);

      expect(quote.estimatedDuration).toBe(0);
      expect(quote.dust).toStrictEqual({ fiat: '0', usd: '0' });
      expect(quote.targetAmount).toStrictEqual({ fiat: '0', usd: '0' });
      expect(quote.sourceAmount).toStrictEqual({
        fiat: '0',
        usd: '0',
        human: '0',
        raw: '0',
      });
      expect(quote.fees).toStrictEqual({
        metaMask: { fiat: '0', usd: '0' },
        provider: { fiat: '0', usd: '0' },
        sourceNetwork: {
          estimate: { fiat: '0', usd: '0', human: '0', raw: '0' },
          max: { fiat: '0', usd: '0', human: '0', raw: '0' },
        },
        targetNetwork: { fiat: '0', usd: '0' },
      });
    });

    it('builds request targeting the payment token', () => {
      const quote = buildNoOpQuote(FROM_MOCK, PAYMENT_TOKEN_MOCK);

      expect(quote.request).toStrictEqual({
        from: FROM_MOCK,
        sourceBalanceRaw: PAYMENT_TOKEN_MOCK.balanceRaw,
        sourceChainId: PAYMENT_TOKEN_MOCK.chainId,
        sourceTokenAddress: PAYMENT_TOKEN_MOCK.address,
        sourceTokenAmount: '0',
        targetAmountMinimum: '0',
        targetChainId: PAYMENT_TOKEN_MOCK.chainId,
        targetTokenAddress: PAYMENT_TOKEN_MOCK.address,
      });
    });
  });
});
