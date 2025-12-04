import {
  extractTradeData,
  isEvmTxData,
  isBitcoinTrade,
  isTronTrade,
} from './trade-utils';
import type { Trade } from './trade-utils';
import type { BitcoinTradeData, TronTradeData, TxData } from '../types';

describe('Trade utils', () => {
  describe('isEvmTxData', () => {
    it('returns true for EVM TxData object', () => {
      const evmTxData: TxData = {
        chainId: 1,
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        value: '0x0',
        data: '0x1234567890abcdef',
        gasLimit: null,
      };
      expect(isEvmTxData(evmTxData)).toBe(true);
    });

    it('returns true for EVM TxData with optional effectiveGas', () => {
      const evmTxData: TxData = {
        chainId: 1,
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        value: '0x0',
        data: '0x1234567890abcdef',
        gasLimit: 21000,
        effectiveGas: 20000,
      };
      expect(isEvmTxData(evmTxData)).toBe(true);
    });

    it('returns false for string trade', () => {
      const stringTrade = 'someTransactionString';
      expect(isEvmTxData(stringTrade)).toBe(false);
    });

    it('returns false for Bitcoin trade', () => {
      const bitcoinTrade = {
        unsignedPsbtBase64: 'cHNidP8BAH...',
        inputsToSign: null,
      };
      expect(isEvmTxData(bitcoinTrade)).toBe(false);
    });

    it('returns false for Tron trade', () => {
      const tronTrade = {
        raw_data_hex: '0a02...',
        visible: true,
      };
      expect(isEvmTxData(tronTrade)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isEvmTxData(null as unknown as Trade)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isEvmTxData({} as unknown as Trade)).toBe(false);
    });

    it('returns false for object with only data property', () => {
      expect(isEvmTxData({ data: '0x123' } as unknown as Trade)).toBe(false);
    });

    it('returns false for object with only chainId and to', () => {
      expect(isEvmTxData({ chainId: 1, to: '0x123' } as unknown as Trade)).toBe(
        false,
      );
    });
  });

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
      expect(isBitcoinTrade({} as unknown as Trade)).toBe(false);
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
      expect(isTronTrade(bitcoinTrade as unknown as Trade)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isTronTrade(null as unknown as Trade)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isTronTrade({} as unknown as Trade)).toBe(false);
    });
  });

  describe('extractTradeData', () => {
    it('returns string as-is for Solana trades', () => {
      const solanaTrade = 'base64EncodedSolanaTransaction';
      expect(extractTradeData(solanaTrade)).toBe(solanaTrade);
    });

    it('extracts data property from EVM TxData object', () => {
      const evmTxData: TxData = {
        chainId: 1,
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        value: '0x0',
        data: '0x1234567890abcdef',
        gasLimit: null,
      };
      expect(extractTradeData(evmTxData)).toBe('0x1234567890abcdef');
    });

    it('extracts data property from EVM TxData with gasLimit', () => {
      const evmTxData: TxData = {
        chainId: 137,
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        from: '0x1234567890abcdef1234567890abcdef12345678',
        value: '0x1234',
        data: '0xabcdef123456',
        gasLimit: 50000,
        effectiveGas: 48000,
      };
      expect(extractTradeData(evmTxData)).toBe('0xabcdef123456');
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
      expect(extractTradeData(unknownTrade as unknown as Trade)).toBe('');
    });

    it('returns empty string for empty object', () => {
      expect(extractTradeData({} as unknown as Trade)).toBe('');
    });
  });
});
