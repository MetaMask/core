import type { BitcoinTradeData, TronTradeData } from '../types';
import {
  extractTradeData,
  isBitcoinTrade,
  isTronTrade,
  type Trade,
} from './trade-utils';

describe('Trade utils', () => {
  describe('isBitcoinTrade', () => {
    it('returns true for Bitcoin trade with unsignedPsbtBase64', () => {
      const bitcoinTrade: BitcoinTradeData = {
        unsignedPsbtBase64: 'cHNidP8BAH...',
        inputsToSign: null,
      };
      expect(isBitcoinTrade(bitcoinTrade)).toBe(true);
    });

    it('returns false for string trade', () => {
      const stringTrade = 'someTransactionString';
      expect(isBitcoinTrade(stringTrade)).toBe(false);
    });

    it('returns false for Tron trade', () => {
      const tronTrade = {
        raw_data_hex: '0a02...',
        visible: true,
      };
      expect(isBitcoinTrade(tronTrade)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isBitcoinTrade(null as unknown as Trade)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isBitcoinTrade({})).toBe(false);
    });
  });

  describe('isTronTrade', () => {
    it('returns true for Tron trade with raw_data_hex', () => {
      const tronTrade: TronTradeData = {
        raw_data_hex: '0a02...',
        visible: true,
        raw_data: {
          contract: [{ type: 'TransferContract' }],
        },
      };
      expect(isTronTrade(tronTrade)).toBe(true);
    });

    it('returns true for minimal Tron trade', () => {
      const tronTrade = {
        raw_data_hex: '0a02...',
      };
      expect(isTronTrade(tronTrade)).toBe(true);
    });

    it('returns false for string trade', () => {
      const stringTrade = 'someTransactionString';
      expect(isTronTrade(stringTrade)).toBe(false);
    });

    it('returns false for Bitcoin trade', () => {
      const bitcoinTrade = {
        unsignedPsbtBase64: 'cHNidP8BAH...',
      };
      expect(isTronTrade(bitcoinTrade)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isTronTrade(null as unknown as Trade)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isTronTrade({})).toBe(false);
    });
  });

  describe('extractTradeData', () => {
    it('returns string as-is for EVM/Solana trades', () => {
      const evmTrade = '0x1234567890abcdef';
      expect(extractTradeData(evmTrade)).toBe(evmTrade);

      const solanaTrade = 'base64EncodedSolanaTransaction';
      expect(extractTradeData(solanaTrade)).toBe(solanaTrade);
    });

    it('extracts unsignedPsbtBase64 from Bitcoin trade', () => {
      const bitcoinTrade: BitcoinTradeData = {
        unsignedPsbtBase64: 'cHNidP8BAH...',
        inputsToSign: null,
      };
      expect(extractTradeData(bitcoinTrade)).toBe('cHNidP8BAH...');
    });

    it('converts raw_data_hex to base64 for Tron trade', () => {
      const tronTrade: TronTradeData = {
        raw_data_hex: '68656c6c6f', // 'hello' in hex
        visible: true,
      };
      const result = extractTradeData(tronTrade);
      // Buffer.from('68656c6c6f', 'hex').toString('base64') === 'aGVsbG8='
      expect(result).toBe('aGVsbG8=');
    });

    it('handles Tron trade with complex raw_data', () => {
      const tronTrade: TronTradeData = {
        raw_data_hex: '0a0212',
        visible: false,
        raw_data: {
          contract: [{ type: 'TransferContract' }],
        },
      };
      const result = extractTradeData(tronTrade);
      // Buffer.from('0a0212', 'hex').toString('base64')
      expect(result).toBe('CgIS');
    });

    it('returns empty string for unrecognized trade format', () => {
      const unknownTrade = {
        someOtherField: 'value',
      };
      expect(extractTradeData(unknownTrade)).toBe('');
    });

    it('returns empty string for empty object', () => {
      expect(extractTradeData({})).toBe('');
    });
  });
});


