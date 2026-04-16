import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  NATIVE_TOKEN_ADDRESS,
} from '../../constants';
import type { QuoteRequest } from '../../types';
import {
  ACROSS_HYPERCORE_USDC_PERPS_ADDRESS,
  isSupportedAcrossPerpsDepositRequest,
  normalizeAcrossRequest,
} from './perps';

const REQUEST_MOCK: QuoteRequest = {
  from: '0x1234567890123456789012345678901234567890' as Hex,
  sourceBalanceRaw: '1000000',
  sourceChainId: '0x1' as Hex,
  sourceTokenAddress: '0x1111111111111111111111111111111111111111' as Hex,
  sourceTokenAmount: '1000000',
  targetAmountMinimum: '1000000',
  targetChainId: CHAIN_ID_ARBITRUM,
  targetTokenAddress: ARBITRUM_USDC_ADDRESS,
};

describe('perps', () => {
  describe('isSupportedAcrossPerpsDepositRequest', () => {
    it('returns true for direct deposit requests on Arbitrum USDC', () => {
      expect(
        isSupportedAcrossPerpsDepositRequest(
          {
            ...REQUEST_MOCK,
            targetTokenAddress: ARBITRUM_USDC_ADDRESS.toUpperCase() as Hex,
          },
          TransactionType.perpsDeposit,
        ),
      ).toBe(true);
    });

    it('returns true for Arbitrum native-token gas top-up requests', () => {
      expect(
        isSupportedAcrossPerpsDepositRequest(
          {
            ...REQUEST_MOCK,
            targetTokenAddress: NATIVE_TOKEN_ADDRESS,
          },
          TransactionType.perpsDeposit,
        ),
      ).toBe(true);
    });

    it('returns false for post-quote requests', () => {
      expect(
        isSupportedAcrossPerpsDepositRequest(
          {
            ...REQUEST_MOCK,
            isPostQuote: true,
          },
          TransactionType.perpsDeposit,
        ),
      ).toBe(false);
    });

    it('returns false for unsupported transaction types and tokens', () => {
      expect(
        isSupportedAcrossPerpsDepositRequest(
          REQUEST_MOCK,
          TransactionType.bridge,
        ),
      ).toBe(false);

      expect(
        isSupportedAcrossPerpsDepositRequest(
          {
            ...REQUEST_MOCK,
            targetChainId: '0x1' as Hex,
            targetTokenAddress:
              '0x2222222222222222222222222222222222222222' as Hex,
          },
          TransactionType.perpsDeposit,
        ),
      ).toBe(false);
    });
  });

  describe('normalizeAcrossRequest', () => {
    it('normalizes direct perps deposits to the Across HyperCore route', () => {
      expect(
        normalizeAcrossRequest(REQUEST_MOCK, TransactionType.perpsDeposit),
      ).toStrictEqual({
        ...REQUEST_MOCK,
        targetAmountMinimum: '100000000',
        targetChainId: '0x539',
        targetTokenAddress: ACROSS_HYPERCORE_USDC_PERPS_ADDRESS,
      });
    });

    it('does not normalize gas top-up requests', () => {
      const request = {
        ...REQUEST_MOCK,
        targetTokenAddress: NATIVE_TOKEN_ADDRESS,
      };

      expect(
        normalizeAcrossRequest(request, TransactionType.perpsDeposit),
      ).toBe(request);
    });

    it('does not normalize non-perps requests', () => {
      expect(normalizeAcrossRequest(REQUEST_MOCK, TransactionType.bridge)).toBe(
        REQUEST_MOCK,
      );
    });
  });
});
