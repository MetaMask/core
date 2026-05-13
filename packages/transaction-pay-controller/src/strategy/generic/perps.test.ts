import type { TransactionMeta } from '@metamask/transaction-controller';

import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_HYPERCORE,
} from '../../constants';
import type { QuoteRequest } from '../../types';
import {
  GENERIC_HYPERCORE_USDC_PERPS_ADDRESS,
  isGenericPerpsDepositRequest,
  normalizeGenericPerpsRequest,
} from './perps';

const BRIDGE_ADDRESS_LOWER = '0x2df1c51e09aecf9cacb7bc98cb1742757f163df7';
const BRIDGE_FRAGMENT = BRIDGE_ADDRESS_LOWER.slice(2);

const baseRequest: QuoteRequest = {
  from: '0x97e298b35d580c080f4a59f1f0fabd09b5add715',
  sourceBalanceRaw: '0',
  sourceChainId: '0x1',
  sourceTokenAddress: '0x0000000000000000000000000000000000000001',
  sourceTokenAmount: '1000000',
  targetAmountMinimum: '1000000',
  targetChainId: CHAIN_ID_ARBITRUM,
  targetTokenAddress: ARBITRUM_USDC_ADDRESS,
};

const transferToBridgeData =
  `0xa9059cbb000000000000000000000000${BRIDGE_FRAGMENT}` +
  '00000000000000000000000000000000000000000000000000000000000f4240';

const bridgeTransaction = {
  txParams: {
    from: '0x97e298b35d580c080f4a59f1f0fabd09b5add715',
    to: ARBITRUM_USDC_ADDRESS,
    data: transferToBridgeData,
  },
} as unknown as TransactionMeta;

const innocuousTransaction = {
  txParams: {
    from: '0x97e298b35d580c080f4a59f1f0fabd09b5add715',
    to: '0x1111111111111111111111111111111111111111',
    data: '0xa9059cbb000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000000f4240',
  },
} as unknown as TransactionMeta;

describe('strategy/generic/perps', () => {
  describe('isGenericPerpsDepositRequest', () => {
    it('returns true when txParams.data references the Hyperliquid bridge', () => {
      expect(isGenericPerpsDepositRequest(baseRequest, bridgeTransaction)).toBe(
        true,
      );
    });

    it('returns true when a nested transaction targets the bridge directly', () => {
      const nestedTransaction = {
        txParams: {
          from: '0x97e298b35d580c080f4a59f1f0fabd09b5add715',
          to: ARBITRUM_USDC_ADDRESS,
          data: '0x',
        },
        nestedTransactions: [
          {
            to: BRIDGE_ADDRESS_LOWER,
            data: '0xdeadbeef',
          },
        ],
      } as unknown as TransactionMeta;

      expect(isGenericPerpsDepositRequest(baseRequest, nestedTransaction)).toBe(
        true,
      );
    });

    it('matches the bridge address case-insensitively in calldata', () => {
      const upperTransaction = {
        txParams: {
          to: ARBITRUM_USDC_ADDRESS,
          data:
            `0xa9059cbb000000000000000000000000${BRIDGE_FRAGMENT.toUpperCase()}` +
            '00000000000000000000000000000000000000000000000000000000000f4240',
        },
      } as unknown as TransactionMeta;

      expect(isGenericPerpsDepositRequest(baseRequest, upperTransaction)).toBe(
        true,
      );
    });

    it('returns false when transaction data does not reference the bridge', () => {
      expect(
        isGenericPerpsDepositRequest(baseRequest, innocuousTransaction),
      ).toBe(false);
    });

    it('returns false when target chain is not Arbitrum', () => {
      expect(
        isGenericPerpsDepositRequest(
          { ...baseRequest, targetChainId: '0x1' },
          bridgeTransaction,
        ),
      ).toBe(false);
    });

    it('returns false when target token is not Arbitrum USDC', () => {
      expect(
        isGenericPerpsDepositRequest(
          {
            ...baseRequest,
            targetTokenAddress: '0x0000000000000000000000000000000000000002',
          },
          bridgeTransaction,
        ),
      ).toBe(false);
    });

    it('returns false on post-quote requests', () => {
      expect(
        isGenericPerpsDepositRequest(
          { ...baseRequest, isPostQuote: true },
          bridgeTransaction,
        ),
      ).toBe(false);
    });
  });

  describe('normalizeGenericPerpsRequest', () => {
    it('rewrites target chain, token, and amount when the bridge is referenced', () => {
      const result = normalizeGenericPerpsRequest(
        baseRequest,
        bridgeTransaction,
      );

      expect(result.targetChainId).toBe(CHAIN_ID_HYPERCORE);
      expect(result.targetTokenAddress).toBe(
        GENERIC_HYPERCORE_USDC_PERPS_ADDRESS,
      );
      expect(result.targetAmountMinimum).toBe('100000000');
    });

    it('returns the original request when the bridge is not referenced', () => {
      const result = normalizeGenericPerpsRequest(
        baseRequest,
        innocuousTransaction,
      );

      expect(result).toBe(baseRequest);
    });
  });
});
