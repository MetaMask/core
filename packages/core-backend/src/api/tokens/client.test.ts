/**
 * Tokens API Client Tests - tokens.api.cx.metamask.io
 */

import type { ApiPlatformClient } from '../ApiPlatformClient';
import { API_URLS } from '../shared-types';
import {
  mockFetch,
  createMockResponse,
  setupTestEnvironment,
} from '../test-utils';

describe('TokensApiClient', () => {
  let client: ApiPlatformClient;

  beforeEach(() => {
    ({ client } = setupTestEnvironment());
  });

  describe('Cache Management', () => {
    it('invalidates tokens API cache', async () => {
      const queryKey = ['tokens', 'v1SupportedNetworks'];
      client.setCachedData(queryKey, {});

      await client.tokens.invalidateTokens();

      const queryState = client.queryClient.getQueryState(queryKey);
      expect(queryState?.isInvalidated).toBe(true);
    });

    it('does not invalidate token API cache', async () => {
      const tokensKey = ['tokens', 'v1SupportedNetworks'];
      const tokenKey = ['token', 'networks'];
      client.setCachedData(tokensKey, {});
      client.setCachedData(tokenKey, []);

      await client.tokens.invalidateTokens();

      // Tokens API cache should be invalidated
      expect(client.queryClient.getQueryState(tokensKey)?.isInvalidated).toBe(
        true,
      );
      // Token API cache should NOT be invalidated
      expect(client.queryClient.getQueryState(tokenKey)?.isInvalidated).toBe(
        false,
      );
    });
  });

  describe('Supported Networks', () => {
    it('fetches token v1 supported networks', async () => {
      const mockResponse = { fullSupport: ['0x1', '0x89'] };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.tokens.fetchTokenV1SupportedNetworks();

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URLS.TOKENS}/v1/supportedNetworks`,
        expect.any(Object),
      );
    });

    it('fetches token v2 supported networks', async () => {
      const mockResponse = {
        fullSupport: ['eip155:1'],
        partialSupport: ['eip155:56'],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.tokens.fetchTokenV2SupportedNetworks();

      expect(result).toStrictEqual(mockResponse);
    });
  });

  describe('V3 Assets', () => {
    it('fetches v3 assets by IDs', async () => {
      const mockResponse = [
        {
          assetId: 'eip155:1/erc20:0xtoken',
          name: 'Test Token',
          symbol: 'TKN',
          decimals: 18,
          address: '0xtoken',
          chainId: 1,
        },
      ];
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.tokens.fetchV3Assets([
        'eip155:1/erc20:0xtoken',
      ]);

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/assets'),
        expect.any(Object),
      );
    });
  });
});
