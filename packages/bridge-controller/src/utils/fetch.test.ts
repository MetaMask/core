import { AddressZero } from '@ethersproject/constants';

import {
  fetchBridgeFeatureFlags,
  fetchBridgeQuotes,
  fetchBridgeTokens,
} from './fetch';
import mockBridgeQuotesErc20Erc20 from '../../tests/mock-quotes-erc20-erc20.json';
import mockBridgeQuotesNativeErc20 from '../../tests/mock-quotes-native-erc20.json';
import { BridgeClientId, BRIDGE_PROD_API_BASE_URL } from '../constants/bridge';

const mockFetchFn = jest.fn();

describe('fetch', () => {
  describe('fetchBridgeFeatureFlags', () => {
    it('should fetch bridge feature flags successfully', async () => {
      const commonResponse = {
        refreshRate: 3,
        maxRefreshCount: 1,
        support: true,
        chains: {
          '1': {
            isActiveSrc: true,
            isActiveDest: true,
          },
          '10': {
            isActiveSrc: true,
            isActiveDest: false,
          },
          '59144': {
            isActiveSrc: true,
            isActiveDest: true,
          },
          '120': {
            isActiveSrc: true,
            isActiveDest: false,
          },
          '137': {
            isActiveSrc: false,
            isActiveDest: true,
          },
          '11111': {
            isActiveSrc: false,
            isActiveDest: true,
          },
          '1151111081099710': {
            isActiveSrc: true,
            isActiveDest: true,
          },
        },
      };
      const mockResponse = {
        'extension-config': commonResponse,
        'mobile-config': commonResponse,
      };

      mockFetchFn.mockResolvedValue(mockResponse);

      const result = await fetchBridgeFeatureFlags(
        BridgeClientId.EXTENSION,
        mockFetchFn,
        BRIDGE_PROD_API_BASE_URL,
      );

      expect(mockFetchFn).toHaveBeenCalledWith(
        'https://bridge.api.cx.metamask.io/getAllFeatureFlags',
        {
          headers: { 'X-Client-Id': 'extension' },
          cacheOptions: {
            cacheRefreshTime: 600000,
          },
          functionName: 'fetchBridgeFeatureFlags',
        },
      );

      const commonExpected = {
        maxRefreshCount: 1,
        refreshRate: 3,
        support: true,
        chains: {
          'eip155:1': {
            isActiveDest: true,
            isActiveSrc: true,
          },
          'eip155:10': {
            isActiveDest: false,
            isActiveSrc: true,
          },
          'eip155:11111': {
            isActiveDest: true,
            isActiveSrc: false,
          },
          'eip155:120': {
            isActiveDest: false,
            isActiveSrc: true,
          },
          'eip155:137': {
            isActiveDest: true,
            isActiveSrc: false,
          },
          'eip155:59144': {
            isActiveDest: true,
            isActiveSrc: true,
          },
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
            isActiveDest: true,
            isActiveSrc: true,
          },
        },
      };

      expect(result).toStrictEqual({
        extensionConfig: commonExpected,
        mobileConfig: commonExpected,
      });
    });

    it('should use fallback bridge feature flags if response is unexpected', async () => {
      const commonResponse = {
        refreshRate: 3,
        maxRefreshCount: 1,
        support: 25,
        chains: {
          a: {
            isActiveSrc: 1,
            isActiveDest: 'test',
          },
          '2': {
            isActiveSrc: 'test',
            isActiveDest: 2,
          },
        },
      };
      const mockResponse = {
        'extension-config': commonResponse,
        'mobile-config': commonResponse,
      };

      mockFetchFn.mockResolvedValue(mockResponse);

      const result = await fetchBridgeFeatureFlags(
        BridgeClientId.EXTENSION,
        mockFetchFn,
        BRIDGE_PROD_API_BASE_URL,
      );

      expect(mockFetchFn).toHaveBeenCalledWith(
        'https://bridge.api.cx.metamask.io/getAllFeatureFlags',
        {
          cacheOptions: {
            cacheRefreshTime: 600000,
          },
          functionName: 'fetchBridgeFeatureFlags',
          headers: { 'X-Client-Id': 'extension' },
        },
      );

      const commonExpected = {
        maxRefreshCount: 5,
        refreshRate: 30000,
        support: false,
        chains: {},
      };
      expect(result).toStrictEqual({
        extensionConfig: commonExpected,
        mobileConfig: commonExpected,
      });
    });

    it('should handle fetch error', async () => {
      const mockError = new Error('Failed to fetch');

      mockFetchFn.mockRejectedValue(mockError);

      await expect(
        fetchBridgeFeatureFlags(
          BridgeClientId.EXTENSION,
          mockFetchFn,
          BRIDGE_PROD_API_BASE_URL,
        ),
      ).rejects.toThrow(mockError);
    });
  });

  describe('fetchBridgeTokens', () => {
    it('should fetch bridge tokens successfully', async () => {
      const mockResponse = [
        {
          address: '0x0000000000000000000000000000000000000000',
          assetId: 'eip155:10/slip44:614',
          symbol: 'ETH',
          decimals: 18,
          name: 'Ether',
          coingeckoId: 'ethereum',
          aggregators: [],
          iconUrl:
            'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/10/native/614.png',
          metadata: {
            honeypotStatus: {},
            isContractVerified: false,
            erc20Permit: false,
            description: {},
            createdAt: '2023-10-31T22:16:37.494Z',
          },
          chainId: 10,
        },
        {
          address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
          assetId: 'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
          symbol: 'ABC',
          name: 'ABC',
          decimals: 16,
          chainId: 10,
        },
        {
          address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f985',
          assetId: 'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f985',
          decimals: 16,
          chainId: 10,
        },
        {
          address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f986',
          assetId: 'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f986',
          decimals: 16,
          symbol: 'DEF',
          name: 'DEF',
          aggregators: ['lifi'],
          chainId: 10,
        },
        {
          address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f987',
          assetId: 'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f987',
          symbol: 'DEF',
          chainId: 10,
        },
        {
          address: '0x124',
          assetId: 'eip155:10/erc20:0x0b2c639c533813f4aa9d7837caf62653d097ff85',
          symbol: 'JKL',
          decimals: 16,
          chainId: 10,
        },
      ];

      mockFetchFn.mockResolvedValue(mockResponse);

      const result = await fetchBridgeTokens(
        '0xa',
        BridgeClientId.EXTENSION,
        mockFetchFn,
        BRIDGE_PROD_API_BASE_URL,
      );

      expect(mockFetchFn).toHaveBeenCalledWith(
        'https://bridge.api.cx.metamask.io/getTokens?chainId=10',
        {
          cacheOptions: {
            cacheRefreshTime: 600000,
          },
          functionName: 'fetchBridgeTokens',
          headers: { 'X-Client-Id': 'extension' },
        },
      );

      expect(result).toStrictEqual({
        '0x0000000000000000000000000000000000000000': {
          address: '0x0000000000000000000000000000000000000000',
          aggregators: [],
          assetId: 'eip155:10/slip44:614',
          chainId: 10,
          coingeckoId: 'ethereum',
          decimals: 18,
          iconUrl:
            'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/10/native/614.png',
          metadata: {
            createdAt: '2023-10-31T22:16:37.494Z',
            description: {},
            erc20Permit: false,
            honeypotStatus: {},
            isContractVerified: false,
          },
          name: 'Ether',
          symbol: 'ETH',
        },
        '0x1f9840a85d5af5bf1d1762f925bdaddc4201f986': {
          address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f986',
          assetId: 'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f986',
          chainId: 10,
          decimals: 16,
          name: 'DEF',
          symbol: 'DEF',
          aggregators: ['lifi'],
        },
        '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': {
          address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
          assetId: 'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
          chainId: 10,
          decimals: 16,
          name: 'ABC',
          symbol: 'ABC',
        },
      });
    });

    it('should handle fetch error', async () => {
      const mockError = new Error('Failed to fetch');

      mockFetchFn.mockRejectedValue(mockError);

      await expect(
        fetchBridgeTokens(
          '0xa',
          BridgeClientId.EXTENSION,
          mockFetchFn,
          BRIDGE_PROD_API_BASE_URL,
        ),
      ).rejects.toThrow(mockError);
    });
  });

  describe('fetchBridgeQuotes', () => {
    it('should fetch bridge quotes successfully, no approvals', async () => {
      mockFetchFn.mockResolvedValue(mockBridgeQuotesNativeErc20);
      const { signal } = new AbortController();

      const result = await fetchBridgeQuotes(
        {
          walletAddress: '0x388c818ca8b9251b393131c08a736a67ccb19297',
          srcChainId: 1,
          destChainId: 10,
          srcTokenAddress: AddressZero,
          destTokenAddress: AddressZero,
          srcTokenAmount: '20000',
          slippage: 0.5,
        },
        signal,
        BridgeClientId.EXTENSION,
        mockFetchFn,
        BRIDGE_PROD_API_BASE_URL,
      );

      expect(mockFetchFn).toHaveBeenCalledWith(
        'https://bridge.api.cx.metamask.io/getQuote?walletAddress=0x388C818CA8B9251b393131C08a736A67ccB19297&destWalletAddress=0x388C818CA8B9251b393131C08a736A67ccB19297&srcChainId=1&destChainId=10&srcTokenAddress=0x0000000000000000000000000000000000000000&destTokenAddress=0x0000000000000000000000000000000000000000&srcTokenAmount=20000&insufficientBal=false&resetApproval=false&slippage=0.5',
        {
          cacheOptions: {
            cacheRefreshTime: 0,
          },
          functionName: 'fetchBridgeQuotes',
          headers: { 'X-Client-Id': 'extension' },
          signal,
        },
      );

      expect(result).toStrictEqual(mockBridgeQuotesNativeErc20);
    });

    it('should fetch bridge quotes successfully, with approvals', async () => {
      mockFetchFn.mockResolvedValue([
        ...mockBridgeQuotesErc20Erc20,
        { ...mockBridgeQuotesErc20Erc20[0], approval: null },
        { ...mockBridgeQuotesErc20Erc20[0], trade: null },
      ]);
      const { signal } = new AbortController();

      const result = await fetchBridgeQuotes(
        {
          walletAddress: '0x388c818ca8b9251b393131c08a736a67ccb19297',
          srcChainId: 1,
          destChainId: 10,
          srcTokenAddress: AddressZero,
          destTokenAddress: AddressZero,
          srcTokenAmount: '20000',
          slippage: 0.5,
        },
        signal,
        BridgeClientId.EXTENSION,
        mockFetchFn,
        BRIDGE_PROD_API_BASE_URL,
      );

      expect(mockFetchFn).toHaveBeenCalledWith(
        'https://bridge.api.cx.metamask.io/getQuote?walletAddress=0x388C818CA8B9251b393131C08a736A67ccB19297&destWalletAddress=0x388C818CA8B9251b393131C08a736A67ccB19297&srcChainId=1&destChainId=10&srcTokenAddress=0x0000000000000000000000000000000000000000&destTokenAddress=0x0000000000000000000000000000000000000000&srcTokenAmount=20000&insufficientBal=false&resetApproval=false&slippage=0.5',
        {
          cacheOptions: {
            cacheRefreshTime: 0,
          },
          functionName: 'fetchBridgeQuotes',
          headers: { 'X-Client-Id': 'extension' },
          signal,
        },
      );

      expect(result).toStrictEqual(mockBridgeQuotesErc20Erc20);
    });

    it('should filter out malformed bridge quotes', async () => {
      mockFetchFn.mockResolvedValue([
        ...mockBridgeQuotesErc20Erc20,
        ...mockBridgeQuotesErc20Erc20.map(
          ({ quote, ...restOfQuote }) => restOfQuote,
        ),
        {
          ...mockBridgeQuotesErc20Erc20[0],
          quote: {
            srcAsset: {
              ...mockBridgeQuotesErc20Erc20[0].quote.srcAsset,
              decimals: undefined,
            },
          },
        },
        {
          ...mockBridgeQuotesErc20Erc20[1],
          quote: {
            srcAsset: {
              ...mockBridgeQuotesErc20Erc20[1].quote.destAsset,
              address: undefined,
            },
          },
        },
      ]);
      const { signal } = new AbortController();

      const result = await fetchBridgeQuotes(
        {
          walletAddress: '0x388c818ca8b9251b393131c08a736a67ccb19297',
          srcChainId: 1,
          destChainId: 10,
          srcTokenAddress: AddressZero,
          destTokenAddress: AddressZero,
          srcTokenAmount: '20000',
          slippage: 0.5,
        },
        signal,
        BridgeClientId.EXTENSION,
        mockFetchFn,
        BRIDGE_PROD_API_BASE_URL,
      );

      expect(mockFetchFn).toHaveBeenCalledWith(
        'https://bridge.api.cx.metamask.io/getQuote?walletAddress=0x388C818CA8B9251b393131C08a736A67ccB19297&destWalletAddress=0x388C818CA8B9251b393131C08a736A67ccB19297&srcChainId=1&destChainId=10&srcTokenAddress=0x0000000000000000000000000000000000000000&destTokenAddress=0x0000000000000000000000000000000000000000&srcTokenAmount=20000&insufficientBal=false&resetApproval=false&slippage=0.5',
        {
          cacheOptions: {
            cacheRefreshTime: 0,
          },
          functionName: 'fetchBridgeQuotes',
          headers: { 'X-Client-Id': 'extension' },
          signal,
        },
      );

      expect(result).toStrictEqual(mockBridgeQuotesErc20Erc20);
    });
  });
});
