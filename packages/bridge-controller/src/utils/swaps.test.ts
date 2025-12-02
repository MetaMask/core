import type { Hex } from '@metamask/utils';

import {
  API_BASE_URL,
  fetchTokens,
  getSwapsContractAddress,
  isValidSwapsContractAddress,
  type SwapsToken,
} from './swaps';
import { CHAIN_IDS } from '../constants/chains';
import {
  ALLOWED_CONTRACT_ADDRESSES,
  SWAPS_CONTRACT_ADDRESSES,
} from '../constants/swaps';
import {
  DEFAULT_TOKEN_ADDRESS,
  SWAPS_CHAINID_DEFAULT_TOKEN_MAP,
} from '../constants/tokens';
import type { FetchFunction } from '../types';

describe('Swaps utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isValidSwapsContractAddress', () => {
    it('returns true for valid swaps contract address', () => {
      const contract = SWAPS_CONTRACT_ADDRESSES[CHAIN_IDS.MAINNET];
      expect(isValidSwapsContractAddress(CHAIN_IDS.MAINNET, contract)).toBe(
        true,
      );
    });

    it('returns true for any allowed contract address', () => {
      const allowedAddresses = ALLOWED_CONTRACT_ADDRESSES[CHAIN_IDS.MAINNET];
      allowedAddresses.forEach((address) => {
        expect(isValidSwapsContractAddress(CHAIN_IDS.MAINNET, address)).toBe(
          true,
        );
      });
    });

    it('returns true for contract address with different case', () => {
      const contract = SWAPS_CONTRACT_ADDRESSES[CHAIN_IDS.MAINNET];
      const upperCaseContract = contract.toUpperCase() as Hex;
      const mixedCaseContract =
        '0x881D40237659C251811CEC9C364EF91DC08D300C' as Hex;

      expect(
        isValidSwapsContractAddress(CHAIN_IDS.MAINNET, upperCaseContract),
      ).toBe(true);
      expect(
        isValidSwapsContractAddress(CHAIN_IDS.MAINNET, mixedCaseContract),
      ).toBe(true);
    });

    it('returns false for invalid contract address', () => {
      const invalidContract =
        '0x1234567890123456789012345678901234567890' as Hex;
      expect(
        isValidSwapsContractAddress(CHAIN_IDS.MAINNET, invalidContract),
      ).toBe(false);
    });

    it('returns false when contract is undefined', () => {
      expect(isValidSwapsContractAddress(CHAIN_IDS.MAINNET, undefined)).toBe(
        false,
      );
    });

    it('returns false for unsupported chain ID', () => {
      const contract = SWAPS_CONTRACT_ADDRESSES[CHAIN_IDS.MAINNET];
      const unsupportedChainId = '0x999' as Hex;
      expect(isValidSwapsContractAddress(unsupportedChainId, contract)).toBe(
        false,
      );
    });

    it('returns false when chain ID is not in ALLOWED_CONTRACT_ADDRESSES', () => {
      const contract = '0x881d40237659c251811cec9c364ef91dc08d300c' as Hex;
      const unknownChainId = '0xabc' as Hex;
      expect(isValidSwapsContractAddress(unknownChainId, contract)).toBe(false);
    });

    it('returns false for empty contract address', () => {
      expect(isValidSwapsContractAddress(CHAIN_IDS.MAINNET, '' as Hex)).toBe(
        false,
      );
    });

    it('returns false for contract address on wrong chain', () => {
      const mainnetContract = SWAPS_CONTRACT_ADDRESSES[CHAIN_IDS.MAINNET];
      expect(isValidSwapsContractAddress(CHAIN_IDS.BSC, mainnetContract)).toBe(
        false,
      );
    });

    it('validates all wrapped token addresses', () => {
      // Test that wrapped token addresses are also in the allowed list
      Object.keys(ALLOWED_CONTRACT_ADDRESSES).forEach((chainId) => {
        const allowedAddresses = ALLOWED_CONTRACT_ADDRESSES[chainId as Hex];
        // Each chain should have at least the swaps contract and wrapped token
        expect(allowedAddresses.length).toBeGreaterThanOrEqual(2);

        // Verify each allowed address validates correctly
        allowedAddresses.forEach((address) => {
          expect(isValidSwapsContractAddress(chainId as Hex, address)).toBe(
            true,
          );
        });
      });
    });
  });

  describe('getSwapsContractAddress', () => {
    it('returns correct swaps contract address', () => {
      expect(getSwapsContractAddress(CHAIN_IDS.MAINNET)).toBe(
        '0x881d40237659c251811cec9c364ef91dc08d300c',
      );
    });

    it('returns undefined for unsupported chain ID', () => {
      const unsupportedChainId = '0x999' as Hex;
      expect(getSwapsContractAddress(unsupportedChainId)).toBeUndefined();
    });

    it('returns addresses that match the SWAPS_CONTRACT_ADDRESSES constant', () => {
      Object.keys(SWAPS_CONTRACT_ADDRESSES).forEach((chainId) => {
        const address = getSwapsContractAddress(chainId as Hex);
        expect(address).toBe(SWAPS_CONTRACT_ADDRESSES[chainId as Hex]);
      });
    });
  });

  describe('fetchTokens', () => {
    const mockTokens: SwapsToken[] = [
      {
        address: DEFAULT_TOKEN_ADDRESS,
        symbol: 'ETH',
        name: 'Ether',
        decimals: 18,
        iconUrl: 'https://example.com/eth.png',
      },
      {
        address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        iconUrl: 'https://example.com/usdc.png',
      },
      {
        address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        symbol: 'USDT',
        name: 'Tether USD',
        decimals: 6,
        iconUrl: 'https://example.com/usdt.png',
      },
    ];

    it('fetches and returns tokens with native token', async () => {
      const mockFetchFn = jest.fn().mockResolvedValue(mockTokens);

      const result = await fetchTokens(
        CHAIN_IDS.MAINNET,
        mockFetchFn as unknown as FetchFunction,
      );

      expect(mockFetchFn).toHaveBeenCalledWith(
        `${API_BASE_URL}/networks/1/tokens`,
        {
          headers: undefined,
        },
      );

      // Should filter out the default token address and add native token
      expect(result).toHaveLength(3);
      expect(result[0].address).toBe(
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      );
      expect(result[1].address).toBe(
        '0xdac17f958d2ee523a2206206994597c13d831ec7',
      );
      expect(result[2]).toStrictEqual(
        SWAPS_CHAINID_DEFAULT_TOKEN_MAP[CHAIN_IDS.MAINNET],
      );
    });

    it('includes client ID header when provided', async () => {
      const mockFetchFn = jest.fn().mockResolvedValue(mockTokens);
      const clientId = 'test-client-id';

      await fetchTokens(
        CHAIN_IDS.MAINNET,
        mockFetchFn as unknown as FetchFunction,
        clientId,
      );

      expect(mockFetchFn).toHaveBeenCalledWith(
        `${API_BASE_URL}/networks/1/tokens`,
        {
          headers: { 'X-Client-Id': clientId },
        },
      );
    });

    it('does not include client ID header when not provided', async () => {
      const mockFetchFn = jest.fn().mockResolvedValue(mockTokens);

      await fetchTokens(
        CHAIN_IDS.MAINNET,
        mockFetchFn as unknown as FetchFunction,
      );

      expect(mockFetchFn).toHaveBeenCalledWith(
        `${API_BASE_URL}/networks/1/tokens`,
        {
          headers: undefined,
        },
      );
    });

    it('propagates fetch errors', async () => {
      const mockError = new Error('Network error');
      const mockFetchFn = jest.fn().mockRejectedValue(mockError);

      await expect(
        fetchTokens(CHAIN_IDS.MAINNET, mockFetchFn as unknown as FetchFunction),
      ).rejects.toThrow('Network error');
    });
  });
});
