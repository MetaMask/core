import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_HYPERCORE,
} from '../constants.js';
import type { QuoteRequest } from '../types.js';
import {
  isPerpsDepositRequest,
  isPerpsDepositTransaction,
  normalizePerpsDepositRequest,
  normalizePerpsWithdrawRequest,
} from './perps.js';

const BRIDGE_ADDRESS_LOWER = '0x2df1c51e09aecf9cacb7bc98cb1742757f163df7';
const HYPERCORE_ADDRESS_MOCK =
  '0x2100000000000000000000000000000000000000' as Hex;

// transfer(HL bridge, 1000000)
const BRIDGE_TRANSFER_DATA =
  '0xa9059cbb0000000000000000000000002df1c51e09aecf9cacb7bc98cb1742757f163df700000000000000000000000000000000000000000000000000000000000f4240';

// approve(HL bridge, 1000000)
const BRIDGE_APPROVE_DATA =
  '0x095ea7b30000000000000000000000002df1c51e09aecf9cacb7bc98cb1742757f163df700000000000000000000000000000000000000000000000000000000000f4240';

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

const bridgeTransaction = {
  txParams: {
    from: '0x97e298b35d580c080f4a59f1f0fabd09b5add715',
    to: BRIDGE_ADDRESS_LOWER,
    data: '0x',
  },
} as unknown as TransactionMeta;

const bridgeTransferTransaction = {
  txParams: {
    from: '0x97e298b35d580c080f4a59f1f0fabd09b5add715',
    to: ARBITRUM_USDC_ADDRESS,
    data: BRIDGE_TRANSFER_DATA,
  },
} as unknown as TransactionMeta;

const innocuousTransaction = {
  txParams: {
    from: '0x97e298b35d580c080f4a59f1f0fabd09b5add715',
    to: '0x1111111111111111111111111111111111111111',
    data: '0xa9059cbb000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000000f4240',
  },
} as unknown as TransactionMeta;

describe('utils/perps', () => {
  describe('isPerpsDepositTransaction', () => {
    it('returns true when txParams.to is the Hyperliquid bridge', () => {
      expect(isPerpsDepositTransaction(bridgeTransaction)).toBe(true);
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

      expect(isPerpsDepositTransaction(nestedTransaction)).toBe(true);
    });

    it('returns true when txParams.data transfers tokens to the bridge', () => {
      expect(isPerpsDepositTransaction(bridgeTransferTransaction)).toBe(true);
    });

    it('returns true when a nested transaction transfers tokens to the bridge', () => {
      const nestedTransaction = {
        txParams: {
          from: '0x97e298b35d580c080f4a59f1f0fabd09b5add715',
          to: '0x1111111111111111111111111111111111111111',
          data: '0x',
        },
        nestedTransactions: [
          {
            to: ARBITRUM_USDC_ADDRESS,
            data: BRIDGE_TRANSFER_DATA,
          },
        ],
      } as unknown as TransactionMeta;

      expect(isPerpsDepositTransaction(nestedTransaction)).toBe(true);
    });

    it('returns false when calldata references the bridge but is not a transfer', () => {
      const approveTransaction = {
        txParams: {
          to: ARBITRUM_USDC_ADDRESS,
          data: BRIDGE_APPROVE_DATA,
        },
      } as unknown as TransactionMeta;

      expect(isPerpsDepositTransaction(approveTransaction)).toBe(false);
    });

    it('returns false when transaction params are missing', () => {
      expect(isPerpsDepositTransaction({} as TransactionMeta)).toBe(false);
    });

    it('returns false when transaction is undefined', () => {
      expect(isPerpsDepositTransaction(undefined)).toBe(false);
    });

    it('matches the bridge address case-insensitively in txParams.to', () => {
      const upperTransaction = {
        txParams: {
          to: BRIDGE_ADDRESS_LOWER.toUpperCase(),
          data: '0x',
        },
      } as unknown as TransactionMeta;

      expect(isPerpsDepositTransaction(upperTransaction)).toBe(true);
    });

    it('returns false when the transaction does not reference the bridge', () => {
      expect(isPerpsDepositTransaction(innocuousTransaction)).toBe(false);
    });
  });

  describe('isPerpsDepositRequest', () => {
    it('returns true when the transaction deposits into the bridge', () => {
      expect(
        isPerpsDepositRequest(baseRequest, bridgeTransferTransaction),
      ).toBe(true);
    });

    it('returns false when the transaction does not reference the bridge', () => {
      expect(isPerpsDepositRequest(baseRequest, innocuousTransaction)).toBe(
        false,
      );
    });

    it('returns false when target chain is not Arbitrum', () => {
      expect(
        isPerpsDepositRequest(
          { ...baseRequest, targetChainId: '0x1' },
          bridgeTransaction,
        ),
      ).toBe(false);
    });

    it('returns false when target token is not Arbitrum USDC', () => {
      expect(
        isPerpsDepositRequest(
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
        isPerpsDepositRequest(
          { ...baseRequest, isPostQuote: true },
          bridgeTransaction,
        ),
      ).toBe(false);
    });
  });

  describe('normalizePerpsDepositRequest', () => {
    it('rewrites target chain, token, and amount for a perps deposit', () => {
      const result = normalizePerpsDepositRequest(
        baseRequest,
        bridgeTransferTransaction,
        HYPERCORE_ADDRESS_MOCK,
      );

      expect(result).toStrictEqual({
        ...baseRequest,
        targetAmountMinimum: '100000000',
        targetChainId: CHAIN_ID_HYPERCORE,
        targetTokenAddress: HYPERCORE_ADDRESS_MOCK,
      });
    });

    it('returns the original request when not a perps deposit', () => {
      const result = normalizePerpsDepositRequest(
        baseRequest,
        innocuousTransaction,
        HYPERCORE_ADDRESS_MOCK,
      );

      expect(result).toBe(baseRequest);
    });
  });

  describe('normalizePerpsWithdrawRequest', () => {
    it('rewrites source chain, token, and amount when isHyperliquidSource is true', () => {
      const withdrawRequest: QuoteRequest = {
        ...baseRequest,
        isHyperliquidSource: true,
        sourceChainId: CHAIN_ID_ARBITRUM,
        sourceTokenAmount: '1000000',
      };

      const result = normalizePerpsWithdrawRequest(
        withdrawRequest,
        HYPERCORE_ADDRESS_MOCK,
      );

      expect(result).toStrictEqual({
        ...withdrawRequest,
        sourceChainId: CHAIN_ID_HYPERCORE,
        sourceTokenAddress: HYPERCORE_ADDRESS_MOCK,
        sourceTokenAmount: '100000000',
      });
    });

    it('preserves an empty source amount', () => {
      const result = normalizePerpsWithdrawRequest(
        { ...baseRequest, isHyperliquidSource: true, sourceTokenAmount: '' },
        HYPERCORE_ADDRESS_MOCK,
      );

      expect(result.sourceTokenAmount).toBe('');
    });

    it('returns the original request when isHyperliquidSource is not set', () => {
      const result = normalizePerpsWithdrawRequest(
        baseRequest,
        HYPERCORE_ADDRESS_MOCK,
      );

      expect(result).toBe(baseRequest);
    });
  });
});
