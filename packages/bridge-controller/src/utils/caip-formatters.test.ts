import { AddressZero } from '@ethersproject/constants';
import { SolScope } from '@metamask/keyring-api';

import {
  formatChainIdToCaip,
  formatChainIdToDec,
  formatChainIdToHex,
  formatAddressToCaipReference,
} from './caip-formatters';
import { ChainId } from '../types';

describe('CAIP Formatters', () => {
  describe('formatChainIdToCaip', () => {
    it('should return the same value if already CAIP format', () => {
      expect(formatChainIdToCaip('eip155:1')).toBe('eip155:1');
    });

    it('should convert hex chainId to CAIP format', () => {
      expect(formatChainIdToCaip('0x1')).toBe('eip155:1');
    });

    it('should convert Solana chainId to SolScope.Mainnet', () => {
      expect(formatChainIdToCaip(ChainId.SOLANA)).toBe(SolScope.Mainnet);
      expect(formatChainIdToCaip(SolScope.Mainnet)).toBe(SolScope.Mainnet);
    });

    it('should convert number to CAIP format', () => {
      expect(formatChainIdToCaip(1)).toBe('eip155:1');
    });
  });

  describe('formatChainIdToDec', () => {
    it('should convert hex chainId to decimal', () => {
      expect(formatChainIdToDec('0x1')).toBe(1);
    });

    it('should handle Solana mainnet', () => {
      expect(formatChainIdToDec(SolScope.Mainnet)).toBe(ChainId.SOLANA);
    });

    it('should parse CAIP chainId to decimal', () => {
      expect(formatChainIdToDec('eip155:1')).toBe(1);
    });

    it('should handle numeric strings', () => {
      expect(formatChainIdToDec('1')).toBe(1);
    });

    it('should return same number if number provided', () => {
      expect(formatChainIdToDec(1)).toBe(1);
    });
  });

  describe('formatChainIdToHex', () => {
    it('should return same value if already hex', () => {
      expect(formatChainIdToHex('0x1')).toBe('0x1');
    });

    it('should convert number to hex', () => {
      expect(formatChainIdToHex(1)).toBe('0x1');
    });

    it('should convert CAIP chainId to hex', () => {
      expect(formatChainIdToHex('eip155:1')).toBe('0x1');
    });

    it('should throw error for invalid chainId', () => {
      expect(() => formatChainIdToHex('invalid')).toThrow(
        'Invalid cross-chain swaps chainId: invalid',
      );
    });
  });

  describe('formatAddressToCaipReference', () => {
    it('should checksum hex addresses', () => {
      expect(
        formatAddressToCaipReference(
          '0x1234567890123456789012345678901234567890',
        ),
      ).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should return zero address for native token addresses', () => {
      expect(formatAddressToCaipReference(AddressZero)).toStrictEqual(
        AddressZero,
      );
      expect(formatAddressToCaipReference('')).toStrictEqual(AddressZero);
      expect(
        formatAddressToCaipReference(`${SolScope.Mainnet}/slip44:501`),
      ).toStrictEqual(AddressZero);
    });

    it('should extract address from CAIP format', () => {
      expect(
        formatAddressToCaipReference(
          'eip155:1:0x1234567890123456789012345678901234567890',
        ),
      ).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should throw error for invalid address', () => {
      expect(() => formatAddressToCaipReference('test:')).toThrow(
        'Invalid address',
      );
    });
  });
});
