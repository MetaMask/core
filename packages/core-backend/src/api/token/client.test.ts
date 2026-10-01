/**
 * Token API Client Tests - token.api.cx.metamask.io
 */

import type { ApiPlatformClient } from '../ApiPlatformClient.js';
import { API_URLS } from '../shared-types.js';
import {
  mockFetch,
  createMockResponse,
  setupTestEnvironment,
} from '../test-utils.js';
import type {
  MemeToken,
  NetworkInfo,
  TokenMetadata,
  TokenSearchResponse,
  TokenV2SupportedNetworksResponse,
  V1TokenDescriptionResponse,
  V1Asset,
  V1RwasResponse,
  V1TokenSecurityDataResponse,
  V1TokensSparklineResponse,
  V2Asset,
  V3MemeTokensResponse,
} from './types.js';

/**
 * Returns the URL of the first fetch call as a `URL` for query-param assertions.
 *
 * @returns The URL passed to the first `fetch` call.
 */
function getFirstCalledUrl(): URL {
  const [url] = mockFetch.mock.calls[0] as [string];
  return new URL(url);
}

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
    it('fetches v2 supported networks from the Token API host', async () => {
      const mockResponse: TokenV2SupportedNetworksResponse = {
        fullSupport: ['eip155:1', 'eip155:59144'],
        partialSupport: ['eip155:4326'],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchV2SupportedNetworks();

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URLS.TOKEN}/v2/supportedNetworks`,
        expect.any(Object),
      );
    });

    it('caches v2 supported networks under the token namespace', async () => {
      const mockResponse: TokenV2SupportedNetworksResponse = {
        fullSupport: ['eip155:1'],
        partialSupport: [],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.token.fetchV2SupportedNetworks();
      await client.token.fetchV2SupportedNetworks();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(
        client.getCachedData(['token', 'v2SupportedNetworks']),
      ).toStrictEqual(mockResponse);
    });

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

    it('fetches token list with occurrenceFloor, includeNativeAssets and includeRwaData', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse([]));

      await client.token.fetchTokenList(1, {
        occurrenceFloor: 3,
        includeNativeAssets: false,
        includeRwaData: true,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URLS.TOKEN}/tokens/1?occurrenceFloor=3&includeNativeAssets=false&includeRwaData=true`,
        expect.any(Object),
      );
    });

    it('fetches token list with useSuggestedOccurrenceFloor, includeDuplicateSymbolAssets, includeLabels and includeTokenSecurityData', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse([]));

      await client.token.fetchTokenList(1, {
        useSuggestedOccurrenceFloor: true,
        includeDuplicateSymbolAssets: false,
        includeLabels: true,
        includeTokenSecurityData: true,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URLS.TOKEN}/tokens/1?useSuggestedOccurrenceFloor=true&includeDuplicateSymbolAssets=false&includeLabels=true&includeTokenSecurityData=true`,
        expect.any(Object),
      );
    });
  });

  describe('Token Search', () => {
    const mockResponse: TokenSearchResponse = {
      data: [
        {
          assetId: 'eip155:1/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
          symbol: 'UNI',
          decimals: 18,
          name: 'Uniswap',
          wssSupport: true,
        },
      ],
      count: 1,
      totalCount: 403,
      pageInfo: { hasNextPage: true, endCursor: 'MQ==' },
    };

    it('searches tokens by query', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchTokenSearch('uni');

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URLS.TOKEN}/tokens/search?query=uni`,
        expect.any(Object),
      );
    });

    it('passes networks, pagination and include flags as query params', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.token.fetchTokenSearch('uni', {
        networks: ['eip155:1', 'eip155:137'],
        first: 2,
        after: 'MQ==',
        defaultAssetIds: ['eip155:1/slip44:60'],
        excludeAssetIds: ['eip155:1/erc20:0xdead'],
        includeWssSupportField: true,
        blockRegion: 'us',
      });

      const calledUrl = getFirstCalledUrl();
      expect(calledUrl.pathname).toBe('/tokens/search');
      expect(calledUrl.searchParams.get('query')).toBe('uni');
      expect(calledUrl.searchParams.get('networks')).toBe(
        'eip155:1,eip155:137',
      );
      expect(calledUrl.searchParams.get('first')).toBe('2');
      expect(calledUrl.searchParams.get('after')).toBe('MQ==');
      expect(calledUrl.searchParams.get('defaultAssetIds')).toBe(
        'eip155:1/slip44:60',
      );
      expect(calledUrl.searchParams.get('excludeAssetIds')).toBe(
        'eip155:1/erc20:0xdead',
      );
      expect(calledUrl.searchParams.get('includeWssSupportField')).toBe('true');
      expect(calledUrl.searchParams.get('blockRegion')).toBe('us');
    });

    it('caches search results regardless of network order', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.token.fetchTokenSearch('uni', {
        networks: ['eip155:137', 'eip155:1'],
      });
      await client.token.fetchTokenSearch('uni', {
        networks: ['eip155:1', 'eip155:137'],
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Token Security Data', () => {
    it('fetches summary security data keyed by asset ID', async () => {
      const mockResponse: V1TokenSecurityDataResponse = {
        'eip155:1/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': {
          maliciousScore: '0.0',
          resultType: 'Verified',
        },
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchV1TokenSecurityData([
        'eip155:1/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      ]);

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URLS.TOKEN}/v1/tokens/security-data?assetIds=eip155%3A1%2Ferc20%3A0x1f9840a85d5af5bf1d1762f925bdaddc4201f984`,
        expect.any(Object),
      );
    });

    it('passes includeExtendedData and joins asset IDs', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await client.token.fetchV1TokenSecurityData(
        ['eip155:1/slip44:60', 'eip155:1/erc20:0xabc'],
        { includeExtendedData: true },
      );

      const calledUrl = getFirstCalledUrl();
      expect(calledUrl.searchParams.get('assetIds')).toBe(
        'eip155:1/slip44:60,eip155:1/erc20:0xabc',
      );
      expect(calledUrl.searchParams.get('includeExtendedData')).toBe('true');
    });

    it('returns an empty object without fetching when no asset IDs are given', async () => {
      const result = await client.token.fetchV1TokenSecurityData([]);

      expect(result).toStrictEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns an empty object from the query function when no asset IDs are given', async () => {
      const queryOptions = client.token.getV1TokenSecurityDataQueryOptions([]);

      const result = await client.queryClient.fetchQuery(queryOptions);

      expect(result).toStrictEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Assets', () => {
    const assetIds = [
      'eip155:1/slip44:60',
      'eip155:1/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    ];

    it('fetches v1 assets by asset IDs', async () => {
      const mockResponse: V1Asset[] = [
        {
          assetId: 'eip155:1/slip44:60',
          symbol: 'ETH',
          name: 'Ether',
          decimals: 18,
          occurrences: 100,
        },
      ];
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchV1Assets(assetIds, {
        includeOccurrences: true,
        includeMarketData: true,
      });

      expect(result).toStrictEqual(mockResponse);
      const calledUrl = getFirstCalledUrl();
      expect(calledUrl.pathname).toBe('/assets');
      expect(calledUrl.searchParams.get('assetIds')).toBe(assetIds.join(','));
      expect(calledUrl.searchParams.get('includeOccurrences')).toBe('true');
      expect(calledUrl.searchParams.get('includeMarketData')).toBe('true');
    });

    it('fetches v2 assets by asset IDs', async () => {
      const mockResponse: V2Asset[] = [
        {
          assetId: 'eip155:1/slip44:60',
          symbol: 'ETH',
          name: 'Ether',
          decimals: 18,
          rwaData: null,
          marketData: {
            marketCap: 330286670264,
            totalVolume: 15240136540,
            price: '2705.05',
            pricePercentChange1d: '0.39',
            pricePercentChange1h: null,
            liquidity: null,
            dilutedMarketCap: 330286670264,
            circulatingSupply: 122095846.23,
          },
        },
      ];
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchV2Assets(assetIds, {
        includeRwaData: true,
        includeMarketData: true,
      });

      expect(result).toStrictEqual(mockResponse);
      const calledUrl = getFirstCalledUrl();
      expect(calledUrl.pathname).toBe('/v2/assets');
      expect(calledUrl.searchParams.get('assetIds')).toBe(assetIds.join(','));
      expect(calledUrl.searchParams.get('includeRwaData')).toBe('true');
    });

    it('returns an empty array without fetching when no asset IDs are given', async () => {
      expect(await client.token.fetchV1Assets([])).toStrictEqual([]);
      expect(await client.token.fetchV2Assets([])).toStrictEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns an empty array from the query functions when no asset IDs are given', async () => {
      expect(
        await client.queryClient.fetchQuery(
          client.token.getV1AssetsQueryOptions([]),
        ),
      ).toStrictEqual([]);
      expect(
        await client.queryClient.fetchQuery(
          client.token.getV2AssetsQueryOptions([]),
        ),
      ).toStrictEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('caches v1 and v2 assets under separate keys', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse([]))
        .mockResolvedValueOnce(createMockResponse([]));

      await client.token.fetchV1Assets(assetIds);
      await client.token.fetchV2Assets(assetIds);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(
        client.getCachedData([
          'token',
          'v1Assets',
          { assetIds: [...assetIds].sort(), options: undefined },
        ]),
      ).toStrictEqual([]);
      expect(
        client.getCachedData([
          'token',
          'v2Assets',
          { assetIds: [...assetIds].sort(), options: undefined },
        ]),
      ).toStrictEqual([]);
    });
  });

  describe('Real World Assets', () => {
    const mockResponse: V1RwasResponse = {
      data: [],
      count: 0,
      totalCount: 0,
      pageInfo: { nextCursor: null, hasNextPage: false },
    };

    it('fetches rwas without filters', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchV1Rwas();

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URLS.TOKEN}/v1/rwas`,
        expect.any(Object),
      );
    });

    it('passes filters, pagination and sorting as query params', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.token.fetchV1Rwas({
        chainIds: ['eip155:1', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
        active: true,
        custodian: 'ondo',
        type: 'stock',
        industry: 'technology',
        limit: 25,
        after: 'jwt-cursor',
        query: 'MSFT',
        sortBy: 'market_cap_desc',
        includeTokenSecurityData: true,
      });

      const calledUrl = getFirstCalledUrl();
      expect(calledUrl.pathname).toBe('/v1/rwas');
      expect(calledUrl.searchParams.get('chainIds')).toBe(
        'eip155:1,solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      );
      expect(calledUrl.searchParams.get('active')).toBe('true');
      expect(calledUrl.searchParams.get('custodian')).toBe('ondo');
      expect(calledUrl.searchParams.get('type')).toBe('stock');
      expect(calledUrl.searchParams.get('industry')).toBe('technology');
      expect(calledUrl.searchParams.get('limit')).toBe('25');
      expect(calledUrl.searchParams.get('after')).toBe('jwt-cursor');
      expect(calledUrl.searchParams.get('query')).toBe('MSFT');
      expect(calledUrl.searchParams.get('sortBy')).toBe('market_cap_desc');
      expect(calledUrl.searchParams.get('includeTokenSecurityData')).toBe(
        'true',
      );
    });
  });

  describe('Token Metadata', () => {
    it('passes includeTokenSecurityData when fetching v1 token metadata', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          address: '0xtoken',
          symbol: 'TKN',
          decimals: 18,
          name: 'Test Token',
        }),
      );

      await client.token.fetchV1TokenMetadata(1, '0xtoken', {
        includeTokenSecurityData: true,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URLS.TOKEN}/token/1?address=0xtoken&includeTokenSecurityData=true`,
        expect.any(Object),
      );
    });

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
      const mockResponse: V1TokenDescriptionResponse = {
        en: 'A test token for testing',
        de: 'Ein Testtoken',
      };
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

    it('maps sortBy to the sort param and passes filter and include options for v3 trending tokens', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse([]));

      await client.token.fetchV3TrendingTokens(['eip155:1', 'eip155:137'], {
        sortBy: 'h1_trending',
        blockRegion: 'global',
        minLiquidity: 1000,
        maxMarketCap: 5000000,
        includeLabels: true,
        includeRwaData: true,
        includeWssSupportField: true,
        excludeLabels: ['stablecoin', 'blue_chip'],
        excludeCommonAssets: true,
        filterWarning: true,
        filterPriceGainOutliers: false,
        vsCurrency: 'eur',
      });

      const calledUrl = getFirstCalledUrl();
      expect(calledUrl.pathname).toBe('/v3/tokens/trending');
      expect(calledUrl.searchParams.get('chainIds')).toBe(
        'eip155:1,eip155:137',
      );
      expect(calledUrl.searchParams.get('sort')).toBe('h1_trending');
      expect(calledUrl.searchParams.has('sortBy')).toBe(false);
      expect(calledUrl.searchParams.get('blockRegion')).toBe('global');
      expect(calledUrl.searchParams.get('minLiquidity')).toBe('1000');
      expect(calledUrl.searchParams.get('maxMarketCap')).toBe('5000000');
      expect(calledUrl.searchParams.get('includeLabels')).toBe('true');
      expect(calledUrl.searchParams.get('includeRwaData')).toBe('true');
      expect(calledUrl.searchParams.get('includeWssSupportField')).toBe('true');
      expect(calledUrl.searchParams.get('excludeLabels')).toBe(
        'stablecoin,blue_chip',
      );
      expect(calledUrl.searchParams.get('excludeCommonAssets')).toBe('true');
      expect(calledUrl.searchParams.get('filterWarning')).toBe('true');
      expect(calledUrl.searchParams.get('filterPriceGainOutliers')).toBe(
        'false',
      );
      expect(calledUrl.searchParams.get('vsCurrency')).toBe('eur');
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

    it('passes include and exclude options for v3 top gainers', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse([]));

      await client.token.fetchV3TopGainers(['eip155:1'], {
        sort: 'h6_price_change_percentage_asc',
        includeTokenSecurityData: true,
        includeWssSupportField: true,
        excludeLabels: ['meme'],
        filterWarning: true,
      });

      const calledUrl = getFirstCalledUrl();
      expect(calledUrl.searchParams.get('sort')).toBe(
        'h6_price_change_percentage_asc',
      );
      expect(calledUrl.searchParams.get('includeTokenSecurityData')).toBe(
        'true',
      );
      expect(calledUrl.searchParams.get('includeWssSupportField')).toBe('true');
      expect(calledUrl.searchParams.get('excludeLabels')).toBe('meme');
      expect(calledUrl.searchParams.get('filterWarning')).toBe('true');
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

    it('passes sort, default and excluded asset IDs for v3 popular tokens', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse([]));

      await client.token.fetchV3PopularTokens(['eip155:1'], {
        sort: 'h24_tx_count_desc',
        defaultAssetIds: ['eip155:1/slip44:60', 'eip155:1/erc20:0xabc'],
        excludeAssetIds: ['eip155:1/erc20:0xdead'],
        includeLabels: true,
      });

      const calledUrl = getFirstCalledUrl();
      expect(calledUrl.searchParams.get('sort')).toBe('h24_tx_count_desc');
      expect(calledUrl.searchParams.get('defaultAssetIds')).toBe(
        'eip155:1/slip44:60,eip155:1/erc20:0xabc',
      );
      expect(calledUrl.searchParams.get('excludeAssetIds')).toBe(
        'eip155:1/erc20:0xdead',
      );
      expect(calledUrl.searchParams.get('includeLabels')).toBe('true');
    });
  });

  describe('Meme Tokens', () => {
    it('fetches v3 meme tokens', async () => {
      const mockResponse: V3MemeTokensResponse = {
        data: [],
        pageInfo: { nextCursor: null, hasNextPage: false },
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchV3MemeTokens();

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URLS.TOKEN}/v3/tokens/meme`,
        expect.any(Object),
      );
    });

    it('passes filters, search and pagination for v3 meme tokens', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          data: [],
          pageInfo: { nextCursor: null, hasNextPage: false },
        }),
      );

      await client.token.fetchV3MemeTokens({
        chainIds: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'eip155:56'],
        launchpads: ['flap', 'pumpfun'],
        assetIds: ['eip155:4663/erc20:0xfa01'],
        addresses: ['0xfa01', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'],
        search: 'yuno',
        limit: 20,
        after: 'jwt-cursor',
        includeTokenSecurityData: true,
      });

      const calledUrl = getFirstCalledUrl();
      expect(calledUrl.pathname).toBe('/v3/tokens/meme');
      expect(calledUrl.searchParams.get('chainIds')).toBe(
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp,eip155:56',
      );
      expect(calledUrl.searchParams.get('launchpads')).toBe('flap,pumpfun');
      expect(calledUrl.searchParams.get('assetIds')).toBe(
        'eip155:4663/erc20:0xfa01',
      );
      expect(calledUrl.searchParams.get('addresses')).toBe(
        '0xfa01,DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      );
      expect(calledUrl.searchParams.get('search')).toBe('yuno');
      expect(calledUrl.searchParams.get('limit')).toBe('20');
      expect(calledUrl.searchParams.get('after')).toBe('jwt-cursor');
      expect(calledUrl.searchParams.get('includeTokenSecurityData')).toBe(
        'true',
      );
    });

    it('fetches v3 trending meme tokens', async () => {
      const mockResponse: MemeToken[] = [
        {
          assetId: 'eip155:56/erc20:0xeccbb861c0dda7efd964010085488b69317e4444',
          name: 'Lobster',
          symbol: 'LOB',
          decimals: 18,
          price: '0.0845',
          priceChangePct: { h24: '48.070' },
          aggregatedUsdVolume: 75263191,
          marketCap: 84412543,
          liquidity: 1448282.85,
          iconUrl: 'https://example.com/lobster.png',
          riskData: {
            holders: 90512,
            top10HoldersPercent: 54.71,
            sniperHeldPercentage: 0,
            bundlerHeldPercentage: 0,
          },
        },
      ];
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchV3TrendingMemeTokens(
        ['eip155:56', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
        {
          timeframe: '1h',
          sort: 'volume',
          limit: 50,
          minLiquidity: 50000,
          minMarketCap: 100000,
          maxMarketCap: 1000000000,
          includeRiskData: true,
          excludeLabels: ['stablecoin'],
        },
      );

      expect(result).toStrictEqual(mockResponse);
      expect(result[0].riskData?.holders).toBe(90512);
      const calledUrl = getFirstCalledUrl();
      expect(calledUrl.pathname).toBe('/v3/tokens/meme/trending');
      expect(calledUrl.searchParams.get('chainIds')).toBe(
        'eip155:56,solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      );
      expect(calledUrl.searchParams.get('timeframe')).toBe('1h');
      expect(calledUrl.searchParams.get('sort')).toBe('volume');
      expect(calledUrl.searchParams.get('limit')).toBe('50');
      expect(calledUrl.searchParams.get('minLiquidity')).toBe('50000');
      expect(calledUrl.searchParams.get('minMarketCap')).toBe('100000');
      expect(calledUrl.searchParams.get('maxMarketCap')).toBe('1000000000');
      expect(calledUrl.searchParams.get('includeRiskData')).toBe('true');
      expect(calledUrl.searchParams.get('excludeLabels')).toBe('stablecoin');
    });
  });

  describe('Sparkline', () => {
    const mockResponse: V1TokensSparklineResponse = {
      data: {
        'eip155:1/slip44:60': {
          sparkline: [
            [1714435200000, 3000.12],
            [1714438800000, 3010.45],
          ],
          name: 'Ethereum',
          symbol: 'ETH',
          pricePercentChange1d: 1.234,
        },
        'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
          sparkline: null,
          name: 'USD Coin',
          symbol: 'USDC',
          pricePercentChange1d: 0.01,
        },
      },
      pageInfo: { nextCursor: 'jwt-cursor', hasNextPage: true },
    };

    it('fetches sparklines with default options', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.token.fetchV1TokensSparkline();

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URLS.TOKEN}/v1/tokens/sparkline`,
        expect.any(Object),
      );
    });

    it('passes category, cursor, time period and sort as query params', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.token.fetchV1TokensSparkline({
        category: 'topGainers',
        cursor: 'jwt-cursor',
        timePeriod: '7d',
        sort: 'price_change_desc',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URLS.TOKEN}/v1/tokens/sparkline?category=topGainers&cursor=jwt-cursor&timePeriod=7d&sort=price_change_desc`,
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
