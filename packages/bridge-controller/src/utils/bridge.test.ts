import { Contract } from '@ethersproject/contracts';
import { SolScope } from '@metamask/keyring-api';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { Hex } from '@metamask/utils';

import {
  getEthUsdtResetData,
  getNativeAssetForChainId,
  isCrossChainTx,
  isEthUsdt,
  isSolanaChainId,
  isSwapsDefaultTokenAddress,
  isSwapsDefaultTokenSymbol,
  sumHexes,
} from './bridge';
import {
  ETH_USDT_ADDRESS,
  METABRIDGE_ETHEREUM_ADDRESS,
} from '../constants/bridge';
import { CHAIN_IDS } from '../constants/chains';
import { SWAPS_CHAINID_DEFAULT_TOKEN_MAP } from '../constants/tokens';

describe('Bridge utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sumHexes', () => {
    it('returns 0x0 for empty input', () => {
      expect(sumHexes()).toBe('0x0');
    });

    it('returns same value for single input', () => {
      expect(sumHexes('0xff')).toBe('0xff');
      expect(sumHexes('0x0')).toBe('0x0');
      expect(sumHexes('0x1')).toBe('0x1');
    });

    it('correctly sums two hex values', () => {
      expect(sumHexes('0x1', '0x1')).toBe('0x2');
      expect(sumHexes('0xff', '0x1')).toBe('0x100');
      expect(sumHexes('0x0', '0xff')).toBe('0xff');
    });

    it('correctly sums multiple hex values', () => {
      expect(sumHexes('0x1', '0x2', '0x3')).toBe('0x6');
      expect(sumHexes('0xff', '0xff', '0x2')).toBe('0x200');
      expect(sumHexes('0x0', '0x0', '0x0')).toBe('0x0');
    });

    it('handles large numbers', () => {
      expect(sumHexes('0xffffffff', '0x1')).toBe('0x100000000');
      expect(sumHexes('0xffffffff', '0xffffffff')).toBe('0x1fffffffe');
    });

    it('throws for invalid hex strings', () => {
      expect(() => sumHexes('0xg')).toThrow('Cannot convert 0xg to a BigInt');
    });
  });

  describe('getEthUsdtResetData', () => {
    it('returns correct encoded function data for USDT approval reset', () => {
      const expectedInterface = new Contract(ETH_USDT_ADDRESS, abiERC20)
        .interface;
      const expectedData = expectedInterface.encodeFunctionData('approve', [
        METABRIDGE_ETHEREUM_ADDRESS,
        '0',
      ]);

      expect(getEthUsdtResetData()).toBe(expectedData);
    });
  });

  describe('isEthUsdt', () => {
    it('returns true for ETH USDT address on mainnet', () => {
      expect(isEthUsdt(CHAIN_IDS.MAINNET, ETH_USDT_ADDRESS)).toBe(true);
      expect(isEthUsdt(CHAIN_IDS.MAINNET, ETH_USDT_ADDRESS.toUpperCase())).toBe(
        true,
      );
    });

    it('returns false for non-mainnet chain', () => {
      expect(isEthUsdt(CHAIN_IDS.GOERLI, ETH_USDT_ADDRESS)).toBe(false);
    });

    it('returns false for different address on mainnet', () => {
      expect(isEthUsdt(CHAIN_IDS.MAINNET, METABRIDGE_ETHEREUM_ADDRESS)).toBe(
        false,
      );
    });
  });

  describe('isSwapsDefaultTokenAddress', () => {
    it('returns true for default token address of given chain', () => {
      const chainId = Object.keys(SWAPS_CHAINID_DEFAULT_TOKEN_MAP)[0] as Hex;
      const defaultToken = getNativeAssetForChainId(chainId);

      expect(isSwapsDefaultTokenAddress(defaultToken.address, chainId)).toBe(
        true,
      );
    });

    it('returns false for non-default token address', () => {
      const chainId = Object.keys(SWAPS_CHAINID_DEFAULT_TOKEN_MAP)[0] as Hex;
      expect(isSwapsDefaultTokenAddress('0x1234', chainId)).toBe(false);
    });

    it('returns false for invalid inputs', () => {
      const chainId = Object.keys(SWAPS_CHAINID_DEFAULT_TOKEN_MAP)[0] as Hex;
      expect(isSwapsDefaultTokenAddress('', chainId)).toBe(false);
      expect(isSwapsDefaultTokenAddress('0x1234', '' as Hex)).toBe(false);
    });
  });

  describe('isSwapsDefaultTokenSymbol', () => {
    it('returns true for default token symbol of given chain', () => {
      const chainId = Object.keys(SWAPS_CHAINID_DEFAULT_TOKEN_MAP)[0] as Hex;
      const defaultToken = getNativeAssetForChainId(chainId);

      expect(isSwapsDefaultTokenSymbol(defaultToken.symbol, chainId)).toBe(
        true,
      );
    });

    it('returns false for non-default token symbol', () => {
      const chainId = Object.keys(SWAPS_CHAINID_DEFAULT_TOKEN_MAP)[0] as Hex;
      expect(isSwapsDefaultTokenSymbol('FAKE', chainId)).toBe(false);
    });

    it('returns false for invalid inputs', () => {
      const chainId = Object.keys(SWAPS_CHAINID_DEFAULT_TOKEN_MAP)[0] as Hex;
      expect(isSwapsDefaultTokenSymbol('', chainId)).toBe(false);
      expect(isSwapsDefaultTokenSymbol('ETH', '' as Hex)).toBe(false);
    });
  });

  describe('isSolanaChainId', () => {
    it('returns true for ChainId.SOLANA', () => {
      expect(isSolanaChainId(1151111081099710)).toBe(true);
    });

    it('returns true for SolScope.Mainnet', () => {
      expect(isSolanaChainId(SolScope.Mainnet)).toBe(true);
    });

    it('returns false for other chainIds', () => {
      expect(isSolanaChainId(1)).toBe(false);
      expect(isSolanaChainId('0x0')).toBe(false);
    });
  });

  describe('getNativeAssetForChainId', () => {
    it('should return native asset for hex chainId', () => {
      const result = getNativeAssetForChainId('0x1');
      expect(result).toStrictEqual({
        ...SWAPS_CHAINID_DEFAULT_TOKEN_MAP['0x1'],
        chainId: 1,
        assetId: 'eip155:1/slip44:60',
      });
    });

    it('should return native asset for decimal chainId', () => {
      const result = getNativeAssetForChainId(137);
      expect(result).toStrictEqual({
        ...SWAPS_CHAINID_DEFAULT_TOKEN_MAP['0x89'],
        chainId: 137,
        assetId: 'eip155:137/slip44:966',
      });
    });

    it('should return native asset for CAIP chainId', () => {
      const result = getNativeAssetForChainId('eip155:1');
      expect(result).toStrictEqual({
        ...SWAPS_CHAINID_DEFAULT_TOKEN_MAP['0x1'],
        chainId: 1,
        assetId: 'eip155:1/slip44:60',
      });
    });

    it('should return native asset for Solana chainId', () => {
      const result = getNativeAssetForChainId(SolScope.Mainnet);
      expect(result).toStrictEqual({
        ...SWAPS_CHAINID_DEFAULT_TOKEN_MAP[SolScope.Mainnet],
        chainId: 1151111081099710,
        assetId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
      });
    });

    it('should throw error for unsupported chainId', () => {
      expect(() => getNativeAssetForChainId('999999')).toThrow(
        'No XChain Swaps native asset found for chainId: 999999',
      );
    });

    it('should handle different chainId formats for the same chain', () => {
      const hexResult = getNativeAssetForChainId('0x89');
      const decimalResult = getNativeAssetForChainId(137);
      const stringifiedDecimalResult = getNativeAssetForChainId('137');
      const caipResult = getNativeAssetForChainId('eip155:137');

      expect(hexResult).toStrictEqual(decimalResult);
      expect(decimalResult).toStrictEqual(caipResult);
      expect(decimalResult).toStrictEqual(stringifiedDecimalResult);
    });
  });

  describe('isCrossChainTx', () => {
    it('should return false when there is no destChainId', () => {
      const result = isCrossChainTx('0x1');
      expect(result).toBe(false);
    });

    it('should return false when srcChainId is invalid', () => {
      const result = isCrossChainTx('a', '0x1');
      expect(result).toBe(false);
    });

    it('should return false when destChainId is invalid', () => {
      const result = isCrossChainTx('0x1', 'a');
      expect(result).toBe(false);
    });
  })
});
