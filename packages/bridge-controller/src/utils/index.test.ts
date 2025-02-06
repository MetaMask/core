import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { Hex } from '@metamask/utils';
import { Contract } from 'ethers';

import {
  getEthUsdtResetData,
  isEthUsdt,
  isSwapsDefaultTokenAddress,
  isSwapsDefaultTokenSymbol,
  sumHexes,
} from '.';
import { ETH_USDT_ADDRESS, METABRIDGE_ETHEREUM_ADDRESS } from '../constants';
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
      const defaultToken =
        SWAPS_CHAINID_DEFAULT_TOKEN_MAP[
          chainId as keyof typeof SWAPS_CHAINID_DEFAULT_TOKEN_MAP
        ];

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
      const defaultToken =
        SWAPS_CHAINID_DEFAULT_TOKEN_MAP[
          chainId as keyof typeof SWAPS_CHAINID_DEFAULT_TOKEN_MAP
        ];

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
});
