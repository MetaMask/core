/**
 * Token API Client Tests - token.api.cx.metamask.io
 */

import type { NetworkInfo, TokenMetadata } from './types';
import type { ApiPlatformClient } from '../ApiPlatformClient';
import { API_URLS } from '../shared-types';
import {
  mockFetch,
  createMockResponse,
  setupTestEnvironment,
} from '../test-utils';

describe('TokenApiClient', () => {
  let client: ApiPlatformClient;

  beforeEach(() => {
    ({ client } = setupTestEnvironment());
  });

  describe('Cache Management', () => {
    it('invalidates token API cache', async () => {
      const queryKey = ['token', 'networks'];
      client.setCachedData(queryKey, []);

      await client.token.invalidateToken();

      const queryState = client.queryClient.getQueryState(queryKey);
      expect(queryState?.isInvalidated).toBe(true);
    });

    it('does not invalidate tokens API cache', async () => {
      const tokenKey = ['token', 'networks'];
      const tokensKey = ['tokens', 'v1SupportedNetworks'];
      client.setCachedData(tokenKey, []);
      client.setCachedData(tokensKey, {});

      await client.token.invalidateToken();

      // Token API cache should be invalidated
      expect(client.queryClient.getQueryState(tokenKey)?.isInvalidated).toBe(
        true,
      );
      // Tokens API cache should NOT be invalidated
      expect(client.queryClient.getQueryState(tokensKey)?.isInvalidated).toBe(
        false,
      );
    });
  });

  describe('Networks', () => {
    it('fetches all networks', async () => {
      const mockResponse: NetworkInfo[] = [
        {
          active: true,
          chainId: 1,
          chainName: 'Ethereum',
          nativeCurrency: {
            name: 'Ether',
            symbol: 'ETH',
            decimals: 18,
            address: '0x0',
          },
        },
      ];
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchNetworks();

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URLS.TOKEN}/networks`,
        expect.any(Object),
      );
    });

    it('fetches network by chain ID', async () => {
      const mockResponse: NetworkInfo = {
        active: true,
        chainId: 1,
        chainName: 'Ethereum',
        nativeCurrency: {
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18,
          address: '0x0',
        },
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchNetworkByChainId(1);

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URLS.TOKEN}/networks/1`,
        expect.any(Object),
      );
    });
  });

  describe('Token List', () => {
    it('fetches token list for chain', async () => {
      const mockResponse: TokenMetadata[] = [
        {
          address: '0xtoken',
          symbol: 'TKN',
          decimals: 18,
          name: 'Test Token',
        },
      ];
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchTokenList(1);

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tokens/1'),
        expect.any(Object),
      );
    });

    it('fetches token list with include options', async () => {
      const mockResponse: TokenMetadata[] = [];
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.token.fetchTokenList(1, {
        includeIconUrl: true,
        includeOccurrences: true,
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('includeIconUrl=true');
      expect(calledUrl).toContain('includeOccurrences=true');
    });
  });

  describe('Token Metadata', () => {
    it('fetches v1 token metadata', async () => {
      const mockResponse: TokenMetadata = {
        address: '0xtoken',
        symbol: 'TKN',
        decimals: 18,
        name: 'Test Token',
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchV1TokenMetadata(1, '0xtoken');

      expect(result).toStrictEqual(mockResponse);
    });

    it('returns undefined on token metadata error', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: 'Not found' }, 404, 'Not Found'),
      );

      const result = await client.token.fetchV1TokenMetadata(1, '0xtoken');

      expect(result).toBeUndefined();
    });

    it('fetches token description', async () => {
      const mockResponse = { description: 'A test token for testing' };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchTokenDescription(1, '0xtoken');

      expect(result).toStrictEqual(mockResponse);
    });

    it('returns undefined on token description error', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: 'Not found' }, 404, 'Not Found'),
      );

      const result = await client.token.fetchTokenDescription(1, '0xtoken');

      expect(result).toBeUndefined();
    });
  });

  describe('Trending & Top Tokens', () => {
    it('fetches v3 trending tokens', async () => {
      const mockResponse = [
        { address: '0xtrending', symbol: 'TRD', chainId: 1 },
      ];
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchV3TrendingTokens(['1', '137']);

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/tokens/trending'),
        expect.any(Object),
      );
    });

    it('fetches v3 top gainers', async () => {
      const mockResponse = [
        { address: '0xgainer', symbol: 'GAIN', chainId: 1 },
      ];
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchV3TopGainers(['1'], {
        sort: 'h24_price_change_percentage_desc',
      });

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/tokens/top-gainers'),
        expect.any(Object),
      );
    });

    it('fetches v3 popular tokens', async () => {
      const mockResponse = [
        { address: '0xpopular', symbol: 'POP', chainId: 1 },
      ];
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchV3PopularTokens(['1']);

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/tokens/popular'),
        expect.any(Object),
      );
    });
  });

  describe('Top Assets', () => {
    it('fetches top assets for chain', async () => {
      const mockResponse = [
        { address: '0xtop', symbol: 'TOP' },
        { address: '0x2nd', symbol: 'SEC' },
      ];
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchTopAssets(1);

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/topAssets/1'),
        expect.any(Object),
      );
    });
  });

  describe('Utility', () => {
    it('fetches suggested occurrence floors', async () => {
      const mockResponse = { '1': 3, '137': 2, '56': 2 };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchV1SuggestedOccurrenceFloors();

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/suggestedOccurrenceFloors'),
        expect.any(Object),
      );
    });
  });
});
