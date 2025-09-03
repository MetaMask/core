import { AddressZero } from '@ethersproject/constants';
import { BtcScope, SolScope } from '@metamask/keyring-api';

import {
  formatChainIdToCaip,
  formatChainIdToDec,
  formatChainIdToHex,
  formatAddressToCaipReference,
  formatAddressToAssetId,
} from './caip-formatters';
import { CHAIN_IDS } from '../constants/chains';
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

    it('should convert Bitcoin chainId to BtcScope.Mainnet', () => {
      expect(formatChainIdToCaip(ChainId.BTC)).toBe(BtcScope.Mainnet);
      expect(formatChainIdToCaip(BtcScope.Mainnet)).toBe(BtcScope.Mainnet);
    });

    it('should convert Bitcoin numeric chainId to BtcScope.Mainnet', () => {
      expect(formatChainIdToCaip(20000000000001)).toBe(BtcScope.Mainnet);
      expect(formatChainIdToCaip('20000000000001')).toBe(BtcScope.Mainnet);
    });

    it('should convert number to CAIP format', () => {
      expect(formatChainIdToCaip(1)).toBe('eip155:1');
    });

    it('should convert Tron chainId to CAIP format', () => {
      expect(formatChainIdToCaip(ChainId.TRON)).toBe('tron:0x2b6653dc');
      expect(formatChainIdToCaip('728126428')).toBe('tron:0x2b6653dc');
      expect(formatChainIdToCaip(728126428)).toBe('tron:0x2b6653dc');
    });
  });

  describe('formatChainIdToDec', () => {
    it('should convert hex chainId to decimal', () => {
      expect(formatChainIdToDec('0x1')).toBe(1);
    });

    it('should handle Solana mainnet', () => {
      expect(formatChainIdToDec(SolScope.Mainnet)).toBe(ChainId.SOLANA);
    });

    it('should handle Bitcoin mainnet', () => {
      expect(formatChainIdToDec(BtcScope.Mainnet)).toBe(ChainId.BTC);
    });

    it('should handle Bitcoin numeric chainId', () => {
      expect(formatChainIdToDec(20000000000001)).toBe(20000000000001);
      expect(formatChainIdToDec('20000000000001')).toBe(20000000000001);
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

    it('should handle Tron mainnet', () => {
      expect(formatChainIdToDec('tron:0x2b6653dc')).toBe(ChainId.TRON);
      expect(formatChainIdToDec(ChainId.TRON)).toBe(ChainId.TRON);
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

    it('should throw error for Bitcoin chainId (non-EVM)', () => {
      expect(() => formatChainIdToHex(BtcScope.Mainnet)).toThrow(
        `Invalid cross-chain swaps chainId: ${BtcScope.Mainnet}`,
      );
    });

    it('should throw error for Solana chainId (non-EVM)', () => {
      expect(() => formatChainIdToHex(SolScope.Mainnet)).toThrow(
        `Invalid cross-chain swaps chainId: ${SolScope.Mainnet}`,
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
      expect(
        formatAddressToCaipReference(`${BtcScope.Mainnet}/slip44:0`),
      ).toStrictEqual(AddressZero);
    });

    it('should extract address from CAIP format', () => {
      expect(
        formatAddressToCaipReference(
          'eip155:1:0x1234567890123456789012345678901234567890',
        ),
      ).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should handle Bitcoin addresses without prefix', () => {
      const btcAddress = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
      expect(formatAddressToCaipReference(btcAddress)).toBe(btcAddress);
    });

    it('should extract Bitcoin address from CAIP format', () => {
      const btcAddress = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
      expect(
        formatAddressToCaipReference(
          `bip122:000000000019d6689c085ae165831e93:${btcAddress}`,
        ),
      ).toBe(btcAddress);
    });

    it('should throw error for invalid address', () => {
      expect(() => formatAddressToCaipReference('test:')).toThrow(
        'Invalid address',
      );
    });
  });

  describe('formatAddressToAssetId', () => {
    it('should return the same value if already CAIP asset type', () => {
      const caipAssetType =
        'eip155:1/erc20:0x1234567890123456789012345678901234567890';
      expect(formatAddressToAssetId(caipAssetType, 'eip155:1')).toBe(
        caipAssetType,
      );
    });

    it('should return native asset for chainId when address is native (AddressZero)', () => {
      const result = formatAddressToAssetId(AddressZero, CHAIN_IDS.MAINNET);
      expect(result).toBe('eip155:1/slip44:60');
    });

    it('should return native asset for chainId when address is empty string', () => {
      const result = formatAddressToAssetId('', CHAIN_IDS.MAINNET);
      expect(result).toBe('eip155:1/slip44:60');
    });

    it('should return native asset for chainId when address is Solana native asset', () => {
      const result = formatAddressToAssetId('501', SolScope.Mainnet);
      expect(result).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501');
    });

    it('should return native asset for chainId when address is Bitcoin native asset', () => {
      const result = formatAddressToAssetId('0', BtcScope.Mainnet);
      expect(result).toBe('bip122:000000000019d6689c085ae165831e93/slip44:0');
    });

    it('should return native asset for chainId when address is BSC native asset', () => {
      const result = formatAddressToAssetId('714', '0x38');
      expect(result).toBe('eip155:56/slip44:714');
    });

    it('should return native asset for chainId when address is BSC native assetId', () => {
      const result = formatAddressToAssetId('slip44:714', 56);
      expect(result).toBe('eip155:56/slip44:714');
    });

    it('should return native asset for chainId=BSC when address is zero address', () => {
      const result = formatAddressToAssetId(AddressZero, 56);
      expect(result).toBe('eip155:56/slip44:714');
    });

    it('should create Solana token asset type when chainId is Solana', () => {
      const tokenAddress = '7dHbWXmci3dT8UF5YZ5ppK9w4ppCH654F4H1Fp16m6Fn';
      const expectedAssetType = `${SolScope.Mainnet}/token:${tokenAddress}`;

      expect(formatAddressToAssetId(tokenAddress, SolScope.Mainnet)).toBe(
        expectedAssetType,
      );
    });

    it('should return undefined for non-hex EVM addresses', () => {
      expect(
        formatAddressToAssetId('invalid-address', CHAIN_IDS.MAINNET),
      ).toBeUndefined();
    });

    it('should create EVM ERC20 asset type for valid hex addresses', () => {
      const tokenAddress = '0x1234567890123456789012345678901234567890';
      const expectedAssetType = `eip155:1/erc20:${tokenAddress}`;

      expect(formatAddressToAssetId(tokenAddress, CHAIN_IDS.MAINNET)).toBe(
        expectedAssetType,
      );
    });

    it('should create EVM ERC20 asset type for valid hex addresses with numeric chainId', () => {
      const tokenAddress = '0x1234567890123456789012345678901234567890';
      const expectedAssetType = `eip155:1/erc20:${tokenAddress}`;

      expect(formatAddressToAssetId(tokenAddress, 1)).toBe(expectedAssetType);
    });

    it('should create EVM ERC20 asset type for valid hex addresses with CAIP chainId', () => {
      const tokenAddress = '0x1234567890123456789012345678901234567890';
      const expectedAssetType = `eip155:1/erc20:${tokenAddress}`;

      expect(formatAddressToAssetId(tokenAddress, 'eip155:1')).toBe(
        expectedAssetType,
      );
    });

    it('should handle different chain IDs correctly', () => {
      const tokenAddress = '0x1234567890123456789012345678901234567890';

      // Test with Polygon
      expect(formatAddressToAssetId(tokenAddress, CHAIN_IDS.POLYGON)).toBe(
        `eip155:137/erc20:${tokenAddress}`,
      );

      // Test with BSC
      expect(formatAddressToAssetId(tokenAddress, CHAIN_IDS.BSC)).toBe(
        `eip155:56/erc20:${tokenAddress}`,
      );

      // Test with Avalanche
      expect(formatAddressToAssetId(tokenAddress, CHAIN_IDS.AVALANCHE)).toBe(
        `eip155:43114/erc20:${tokenAddress}`,
      );
    });
  });
});
