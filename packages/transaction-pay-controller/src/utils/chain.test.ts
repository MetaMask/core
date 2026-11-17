import { describe, expect, it } from 'vitest';

import type { QuoteRequest } from '../types.js';
import {
  assertEvmQuoteRequest,
  isEvmChainId,
  isEvmQuoteRequest,
} from './chain.js';

const SOLANA_CHAIN_ID_MOCK = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

const EVM_REQUEST_MOCK = {
  targetChainId: '0x1',
  targetTokenAddress: '0x1234567890123456789012345678901234567890',
} as QuoteRequest;

const SOLANA_REQUEST_MOCK = {
  targetChainId: SOLANA_CHAIN_ID_MOCK,
  targetTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
} as QuoteRequest;

describe('Chain Utils', () => {
  describe('isEvmChainId', () => {
    it('returns true for hexadecimal chain ID', () => {
      expect(isEvmChainId('0x1')).toBe(true);
    });

    it('returns false for CAIP-2 chain ID', () => {
      expect(isEvmChainId(SOLANA_CHAIN_ID_MOCK)).toBe(false);
    });
  });

  describe('isEvmQuoteRequest', () => {
    it('returns true if target chain is EVM', () => {
      expect(isEvmQuoteRequest(EVM_REQUEST_MOCK)).toBe(true);
    });

    it('returns false if target chain is non-EVM', () => {
      expect(isEvmQuoteRequest(SOLANA_REQUEST_MOCK)).toBe(false);
    });
  });

  describe('assertEvmQuoteRequest', () => {
    it('does not throw if target chain is EVM', () => {
      expect(() => assertEvmQuoteRequest(EVM_REQUEST_MOCK)).not.toThrow();
    });

    it('throws if target chain is non-EVM', () => {
      expect(() => assertEvmQuoteRequest(SOLANA_REQUEST_MOCK)).toThrow(
        `Unsupported non-EVM target chain: ${SOLANA_CHAIN_ID_MOCK}`,
      );
    });
  });
});
