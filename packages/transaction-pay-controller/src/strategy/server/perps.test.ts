import type { TransactionMeta } from '@metamask/transaction-controller';
import { describe, expect, it } from 'vitest';

import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_HYPERCORE,
} from '../../constants.js';
import type { QuoteRequest } from '../../types.js';
import {
  SERVER_HYPERCORE_USDC_PERPS_ADDRESS,
  normalizeServerPerpsRequest,
} from './perps.js';

const BRIDGE_ADDRESS_LOWER = '0x2df1c51e09aecf9cacb7bc98cb1742757f163df7';

// transfer(HL bridge, 1000000)
const BRIDGE_TRANSFER_DATA =
  '0xa9059cbb0000000000000000000000002df1c51e09aecf9cacb7bc98cb1742757f163df700000000000000000000000000000000000000000000000000000000000f4240';

const baseRequest: QuoteRequest = {
  from: '0x97e298b35d580c080f4a59f1f0fabd09b5add715',
  sourceAccountId: 'eip155:1:0x97e298b35d580c080f4a59f1f0fabd09b5add715',
  sourceAssetId: 'eip155:1/erc20:0x0000000000000000000000000000000000000001',
  sourceBalanceRaw: '0',
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

const innocuousTransaction = {
  txParams: {
    from: '0x97e298b35d580c080f4a59f1f0fabd09b5add715',
    to: '0x1111111111111111111111111111111111111111',
    data: '0xa9059cbb000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000000f4240',
  },
} as unknown as TransactionMeta;

const bridgeTransferTransaction = {
  txParams: {
    from: '0x97e298b35d580c080f4a59f1f0fabd09b5add715',
    to: ARBITRUM_USDC_ADDRESS,
    data: BRIDGE_TRANSFER_DATA,
  },
} as unknown as TransactionMeta;

describe('strategy/server/perps', () => {
  describe('normalizeServerPerpsRequest', () => {
    it('rewrites target chain, token, and amount when the bridge is referenced', () => {
      const result = normalizeServerPerpsRequest(
        baseRequest,
        bridgeTransaction,
      );

      expect(result.targetChainId).toBe(CHAIN_ID_HYPERCORE);
      expect(result.targetTokenAddress).toBe(
        SERVER_HYPERCORE_USDC_PERPS_ADDRESS,
      );
      expect(result.targetAmountMinimum).toBe('100000000');
    });

    it('rewrites target chain, token, and amount for a token transfer to the bridge', () => {
      const result = normalizeServerPerpsRequest(
        baseRequest,
        bridgeTransferTransaction,
      );

      expect(result.targetChainId).toBe(CHAIN_ID_HYPERCORE);
      expect(result.targetTokenAddress).toBe(
        SERVER_HYPERCORE_USDC_PERPS_ADDRESS,
      );
      expect(result.targetAmountMinimum).toBe('100000000');
    });

    it('returns the original request when the bridge is not referenced', () => {
      const result = normalizeServerPerpsRequest(
        baseRequest,
        innocuousTransaction,
      );

      expect(result).toBe(baseRequest);
    });

    it('rewrites source chain, token, and amount when isHyperliquidSource is true', () => {
      const withdrawRequest: QuoteRequest = {
        ...baseRequest,
        isHyperliquidSource: true,
        sourceAssetId: `eip155:42161/erc20:${ARBITRUM_USDC_ADDRESS}`,
        sourceTokenAmount: '1000000',
      };

      const result = normalizeServerPerpsRequest(
        withdrawRequest,
        innocuousTransaction,
      );

      expect(result.sourceAssetId).toBe(
        `eip155:1337/erc20:${SERVER_HYPERCORE_USDC_PERPS_ADDRESS}`,
      );
      expect(result.sourceTokenAmount).toBe('100000000');
    });
  });
});
