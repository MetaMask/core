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

    it('passes includeTokenSecurityData param when fetching v3 trending tokens', async () => {
      const mockResponse = [
        {
          assetId: 'eip155:1/erc20:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
          name: 'Wrapped Ether',
          symbol: 'WETH',
          decimals: 18,
          price: '2076.8761460147',
          aggregatedUsdVolume: 563290706.83,
          marketCap: 338433.56,
          labels: ['blue_chip'],
          priceChangePct: {
            m5: '0',
            m15: '0.195',
            m30: '0.706',
            h1: '3.39',
            h6: '6.26',
            h24: '6.7',
          },
          securityData: {
            resultType: 'Verified',
            maliciousScore: '0.0',
            fees: {
              transfer: 0,
              transferFeeMaxAmount: null,
              buy: 0,
              sell: 0,
            },
            features: [
              {
                featureId: 'HIGH_REPUTATION_TOKEN',
                type: 'Benign',
                description: 'Token with verified high reputation',
              },
              {
                featureId: 'VERIFIED_CONTRACT',
                type: 'Info',
                description: 'The token contract is verified',
              },
            ],
            financialStats: {
              supply: 2.0555493268851862e24,
              topHolders: [
                {
                  label: 'contract',
                  name: null,
                  address: '0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e',
                  holdingPercentage: 21.962,
                },
              ],
              holdersCount: 2877494,
              tradeVolume24h: 801557137,
              lockedLiquidityPct: 0,
              markets: [
                {
                  marketType: 'AMM',
                  marketName: 'uniswap_v3',
                  pairName: 'WETH / USDC',
                  reserveUSD: 94676995.1127,
                },
              ],
            },
            metadata: {
              externalLinks: {
                homepage: 'https://ethereum.org/en/wrapped-eth',
                twitterPage: null,
                telegramChannelId: null,
              },
            },
            created: '2017-12-12T11:17:35',
          },
        },
      ];
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchV3TrendingTokens(['eip155:1'], {
        includeTokenSecurityData: true,
      });

      expect(result).toStrictEqual(mockResponse);
      expect(result[0].securityData?.resultType).toBe('Verified');
      expect(result[0].securityData?.maliciousScore).toBe('0.0');
      expect(result[0].securityData?.financialStats.holdersCount).toBe(2877494);
      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('includeTokenSecurityData=true');
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
