import { toHex } from '@metamask/controller-utils';
import type { CaipChainId } from '@metamask/utils';
import { clone } from 'lodash';
import nock from 'nock';

import {
  MOCK_ETHEREUM_TOKENS_METADATA,
  MOCK_LINEA_TOKENS_METADATA,
  MOCK_SINGLE_TOKEN_METADATA,
} from './__fixtures__/tokens-api-mocks';
import type { EVMTokenMetadata, SortTrendingBy } from './token-service';
import {
  fetchTokenListByChainId,
  fetchTokenMetadata,
  getTrendingTokens,
  searchTokens,
  TOKEN_END_POINT_API,
  TOKEN_METADATA_NO_SUPPORT_ERROR,
  TOKENS_END_POINT_API,
} from './token-service';

const ONE_MILLISECOND = 1;
const ONE_SECOND_IN_MILLISECONDS = 1_000;

const sampleSearchResults = [
  {
    address: '0xa0b86a33e6c166428cf041c73490a6b448b7f2c2',
    symbol: 'USDC',
    decimals: 6,
    name: 'USD Coin',
    occurrences: 12,
    aggregators: [
      'paraswap',
      'pmm',
      'airswapLight',
      'zeroEx',
      'bancor',
      'coinGecko',
      'zapper',
      'kleros',
      'zerion',
      'cmc',
      'oneInch',
      'uniswap',
    ],
  },
  {
    address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    symbol: 'USDT',
    decimals: 6,
    name: 'Tether USD',
    occurrences: 11,
    aggregators: [
      'paraswap',
      'pmm',
      'airswapLight',
      'zeroEx',
      'bancor',
      'coinGecko',
      'zapper',
      'kleros',
      'zerion',
      'cmc',
      'oneInch',
    ],
  },
];

const sampleDecimalChainId = 1;
const sampleChainId = toHex(sampleDecimalChainId);
const sampleCaipChainId: CaipChainId = 'eip155:1';
const polygonCaipChainId: CaipChainId = 'eip155:137';

describe('Token service', () => {
  describe('fetchTokenListByChainId', () => {
    const createNockEndpoint = (
      chainId: number,
      opts?: {
        nockIntercept?: (
          intercept: nock.Interceptor,
        ) => nock.Interceptor | nock.Scope;
        queryParams?: Record<string, string>;
        response?: unknown;
      },
    ): nock.Scope => {
      const nockPartial = nock(TOKENS_END_POINT_API)
        .get(`/tokens/${chainId}`)
        .query({
          occurrenceFloor: '3',
          includeTokenFees: 'false',
          includeAssetType: 'false',
          includeERC20Permit: 'false',
          includeStorage: 'false',
          includeAggregators: 'true',
          includeOccurrences: 'true',
          includeIconUrl: 'true',
          includeRwaData: 'true',
          first: '3000',
          ...opts?.queryParams,
        });

      const finalNock = opts?.nockIntercept?.(nockPartial) ?? nockPartial;

      return 'isDone' in finalNock
        ? finalNock
        : finalNock
            .reply(200, opts?.response ?? MOCK_ETHEREUM_TOKENS_METADATA)
            .persist();
    };

    it('should call the tokens api and return the list of tokens', async () => {
      const { signal } = new AbortController();
      const endpoint = createNockEndpoint(sampleDecimalChainId);

      const tokens = await fetchTokenListByChainId(sampleChainId, signal);

      expect(endpoint.isDone()).toBe(true);
      expect(tokens).toStrictEqual(MOCK_ETHEREUM_TOKENS_METADATA.data);
    });

    it('should call the tokens api and return the list of tokens on linea mainnet', async () => {
      const { signal } = new AbortController();
      const lineaChainId = 59144;
      const lineaHexChain = toHex(lineaChainId);
      const endpoint = createNockEndpoint(lineaChainId, {
        response: MOCK_LINEA_TOKENS_METADATA,
        queryParams: {
          occurrenceFloor: '1',
        },
      });

      const tokens = await fetchTokenListByChainId(lineaHexChain, signal);

      expect(endpoint.isDone()).toBe(true);
      expect(tokens).toStrictEqual(MOCK_LINEA_TOKENS_METADATA.data);
    });

    it('should return undefined if the fetch is aborted', async () => {
      const abortController = new AbortController();
      const endpoint = createNockEndpoint(sampleDecimalChainId, {
        nockIntercept: (intercept) =>
          intercept.delay(ONE_SECOND_IN_MILLISECONDS),
      });

      const fetchPromise = fetchTokenListByChainId(
        sampleChainId,
        abortController.signal,
      );
      abortController.abort();

      const result = await fetchPromise;
      expect(result).toStrictEqual([]);
      expect(endpoint.isDone()).toBe(false);
    });

    it('should return undefined if the fetch fails with a network error', async () => {
      const { signal } = new AbortController();

      const endpoint = createNockEndpoint(sampleDecimalChainId, {
        nockIntercept: (intercept) =>
          intercept.replyWithError('Example network error'),
      });

      const result = await fetchTokenListByChainId(sampleChainId, signal);

      expect(endpoint.isDone()).toBe(true);
      expect(result).toStrictEqual([]);
    });

    it('should return undefined if the fetch fails with an unsuccessful status code', async () => {
      const { signal } = new AbortController();
      const endpoint = createNockEndpoint(sampleDecimalChainId, {
        nockIntercept: (intercept) => intercept.reply(500),
      });

      const result = await fetchTokenListByChainId(sampleChainId, signal);

      expect(endpoint.isDone()).toBe(true);
      expect(result).toStrictEqual([]);
    });

    it('should return undefined if the fetch fails with a timeout', async () => {
      const { signal } = new AbortController();
      const endpoint = createNockEndpoint(sampleDecimalChainId, {
        nockIntercept: (intercept) =>
          intercept.delay(ONE_SECOND_IN_MILLISECONDS),
      });

      const result = await fetchTokenListByChainId(sampleChainId, signal, {
        timeout: ONE_MILLISECOND,
      });

      expect(endpoint.isDone()).toBe(true);
      expect(result).toStrictEqual([]);
    });

    it('should paginate through tokens until reaches end', async () => {
      const response1 = clone(MOCK_ETHEREUM_TOKENS_METADATA);
      response1.pageInfo.hasNextPage = true;
      response1.pageInfo.endCursor = 'Mjk5OQ==';
      const endpoint1 = createNockEndpoint(sampleDecimalChainId, {
        response: response1,
      });

      const response2 = clone(MOCK_ETHEREUM_TOKENS_METADATA);
      response2.pageInfo.hasNextPage = false;
      response2.pageInfo.endCursor = '';
      const endpoint2 = createNockEndpoint(sampleDecimalChainId, {
        queryParams: {
          after: 'Mjk5OQ==',
        },
        response: response2,
      });

      const { signal } = new AbortController();
      const result = await fetchTokenListByChainId(sampleChainId, signal);

      expect(endpoint1.isDone()).toBe(true);
      expect(endpoint2.isDone()).toBe(true);
      expect(result).toHaveLength(
        response1.data.length + response2.data.length,
      );
    });

    it('should force stop pagination after 10 pages', async () => {
      // 20 pages
      const nockEndpoints = Array.from({ length: 20 }, (_, index) => {
        const mockResponse = clone(MOCK_ETHEREUM_TOKENS_METADATA);
        mockResponse.pageInfo.hasNextPage = true;
        mockResponse.pageInfo.endCursor = `Mjk5OQ==${index}`;
        return createNockEndpoint(sampleDecimalChainId, {
          queryParams:
            index === 0
              ? undefined
              : {
                  after: `Mjk5OQ==${index - 1}`,
                },
          response: clone(MOCK_ETHEREUM_TOKENS_METADATA),
        });
      });

      const { signal } = new AbortController();
      const result = await fetchTokenListByChainId(sampleChainId, signal);

      // Assert first and last endpoint calls
      expect(nockEndpoints[0].isDone()).toBe(true); // page 1 is called
      expect(nockEndpoints[19].isDone()).toBe(false); // page 20 is never called

      // Assert all endpoints calls
      nockEndpoints.forEach((endpoint, index) => {
        const isDone = index < 10;
        expect(endpoint.isDone()).toBe(isDone);
      });

      // Assert result length (first 10 pages)
      expect(result).toHaveLength(
        10 * MOCK_ETHEREUM_TOKENS_METADATA.data.length,
      );
    });
  });

  describe('fetchTokenMetadata', () => {
    const createNockEndpoint = (
      chainId: number,
      tokenAddress: string,
      opts?: {
        nockIntercept?: (
          intercept: nock.Interceptor,
        ) => nock.Interceptor | nock.Scope;
        queryParams?: Record<string, string>;
        response?: unknown;
      },
    ): nock.Scope => {
      const nockPartial = nock(TOKENS_END_POINT_API)
        .get(`/v3/assets`)
        .query({
          assetIds: `eip155:${chainId}/erc20:${tokenAddress}`,
          includeAggregators: 'true',
          includeOccurrences: 'true',
          includeIconUrl: 'true',
          includeMetadata: 'true',
          includeRwaData: 'true',
          ...opts?.queryParams,
        });

      const finalNock = opts?.nockIntercept?.(nockPartial) ?? nockPartial;

      return 'isDone' in finalNock
        ? finalNock
        : finalNock
            .reply(200, opts?.response ?? MOCK_SINGLE_TOKEN_METADATA)
            .persist();
    };

    it('should call the api to return the token metadata for eth address provided', async () => {
      const { signal } = new AbortController();
      const endpoint = createNockEndpoint(
        sampleDecimalChainId,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
      );

      const token = await fetchTokenMetadata(
        sampleChainId,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        signal,
      );

      const expectedOutput: EVMTokenMetadata = {
        address: '0x514910771af9ca656af840dff83e8264ecf986ca',
        name: 'Tesla (Ondo Tokenized)',
        symbol: 'TSLAON',
        decimals: 18,
        aggregators: ['coinGecko', 'liFi', 'rango', 'ondo'],
        occurrences: 4,
        iconUrl: expect.any(String),
        rwaData: {
          market: {
            nextOpen: expect.any(String),
            nextClose: expect.any(String),
          },
          nextPause: {
            start: expect.any(String),
            end: expect.any(String),
          },
          ticker: 'TSLA',
          instrumentType: 'stock',
        },
      };

      expect(endpoint.isDone()).toBe(true);
      expect(token).toStrictEqual(expectedOutput);
    });

    it('should return undefined if the fetch is aborted', async () => {
      const abortController = new AbortController();
      const endpoint = createNockEndpoint(
        sampleDecimalChainId,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        {
          nockIntercept: (intercept) =>
            intercept.delay(ONE_SECOND_IN_MILLISECONDS),
        },
      );

      const fetchPromise = fetchTokenMetadata(
        sampleChainId,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        abortController.signal,
      );
      abortController.abort();

      expect(await fetchPromise).toBeUndefined();
      expect(endpoint.isDone()).toBe(false);
    });

    it('should return undefined if the fetch fails with a network error', async () => {
      const { signal } = new AbortController();
      const endpoint = createNockEndpoint(
        sampleDecimalChainId,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        {
          nockIntercept: (intercept) =>
            intercept.replyWithError('Example network error'),
        },
      );

      const tokenMetadata = await fetchTokenMetadata(
        sampleChainId,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        signal,
      );

      expect(endpoint.isDone()).toBe(true);
      expect(tokenMetadata).toBeUndefined();
    });

    it('should return undefined if the fetch fails with an unsuccessful status code', async () => {
      const { signal } = new AbortController();
      const endpoint = createNockEndpoint(
        sampleDecimalChainId,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        {
          nockIntercept: (intercept) => intercept.reply(500),
        },
      );

      const tokenMetadata = await fetchTokenMetadata(
        sampleChainId,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        signal,
      );

      expect(endpoint.isDone()).toBe(true);
      expect(tokenMetadata).toBeUndefined();
    });

    it('should return undefined if the fetch fails with a timeout', async () => {
      const { signal } = new AbortController();
      const endpoint = createNockEndpoint(
        sampleDecimalChainId,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        {
          nockIntercept: (intercept) =>
            intercept.delay(ONE_SECOND_IN_MILLISECONDS),
        },
      );

      const tokenMetadata = await fetchTokenMetadata(
        sampleChainId,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        signal,
        { timeout: ONE_MILLISECOND },
      );

      expect(tokenMetadata).toBeUndefined();
      expect(endpoint.isDone()).toBe(true); // called, but response is timed out
    });

    it('should throw error if fetching from non supported network', async () => {
      const { signal } = new AbortController();
      const endpoint = createNockEndpoint(
        5,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
      );

      await expect(
        fetchTokenMetadata(
          toHex(5),
          '0x514910771af9ca656af840dff83e8264ecf986ca',
          signal,
        ),
      ).rejects.toThrow(TOKEN_METADATA_NO_SUPPORT_ERROR);
      expect(endpoint.isDone()).toBe(false); // endpoint is never called since we capture it as unsupported
    });
  });

  describe('searchTokens', () => {
    it('should call the search api and return the list of matching tokens for single chain', async () => {
      const searchQuery = 'USD';
      const mockResponse = {
        count: sampleSearchResults.length,
        data: sampleSearchResults,
        pageInfo: { hasNextPage: false, endCursor: null },
      };

      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&limit=10&includeMarketData=false`,
        )
        .reply(200, mockResponse)
        .persist();

      const results = await searchTokens([sampleCaipChainId], searchQuery);

      expect(results).toStrictEqual({
        count: sampleSearchResults.length,
        data: sampleSearchResults,
      });
    });

    it('should call the search api with custom limit parameter', async () => {
      const searchQuery = 'USDC';
      const customLimit = 5;
      const mockResponse = {
        count: 1,
        data: [sampleSearchResults[0]],
        pageInfo: { hasNextPage: false, endCursor: null },
      };

      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&limit=${customLimit}&includeMarketData=false`,
        )
        .reply(200, mockResponse)
        .persist();

      const results = await searchTokens([sampleCaipChainId], searchQuery, {
        limit: customLimit,
      });

      expect(results).toStrictEqual({
        count: 1,
        data: [sampleSearchResults[0]],
      });
    });

    it('should properly encode search queries with special characters', async () => {
      const searchQuery = 'USD Coin & Token';
      const encodedQuery = 'USD%20Coin%20%26%20Token';
      const mockResponse = {
        count: sampleSearchResults.length,
        data: sampleSearchResults,
        pageInfo: { hasNextPage: false, endCursor: null },
      };

      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${encodedQuery}&limit=10&includeMarketData=false`,
        )
        .reply(200, mockResponse)
        .persist();

      const results = await searchTokens([sampleCaipChainId], searchQuery);

      expect(results).toStrictEqual({
        count: sampleSearchResults.length,
        data: sampleSearchResults,
      });
    });

    it('should search across multiple chains in a single request', async () => {
      const searchQuery = 'USD';
      const encodedChainIds = [sampleCaipChainId, polygonCaipChainId]
        .map((id) => encodeURIComponent(id))
        .join(',');
      const mockResponse = {
        count: sampleSearchResults.length,
        data: sampleSearchResults,
        pageInfo: { hasNextPage: false, endCursor: null },
      };

      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodedChainIds}&query=${searchQuery}&limit=10&includeMarketData=false`,
        )
        .reply(200, mockResponse)
        .persist();

      const results = await searchTokens(
        [sampleCaipChainId, polygonCaipChainId],
        searchQuery,
      );

      expect(results).toStrictEqual({
        count: sampleSearchResults.length,
        data: sampleSearchResults,
      });
    });

    it('should return empty array if the fetch fails with a network error', async () => {
      const searchQuery = 'USD';
      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&limit=10&includeMarketData=false`,
        )
        .replyWithError('Example network error')
        .persist();

      const result = await searchTokens([sampleCaipChainId], searchQuery);

      expect(result).toStrictEqual({ count: 0, data: [] });
    });

    it('should return empty array if the fetch fails with 400 error', async () => {
      const searchQuery = 'USD';
      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&limit=10&includeMarketData=false`,
        )
        .reply(400, { error: 'Bad Request' })
        .persist();

      const result = await searchTokens([sampleCaipChainId], searchQuery);

      expect(result).toStrictEqual({ count: 0, data: [] });
    });

    it('should return empty array if the fetch fails with 500 error', async () => {
      const searchQuery = 'USD';
      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&limit=10&includeMarketData=false`,
        )
        .reply(500)
        .persist();

      const result = await searchTokens([sampleCaipChainId], searchQuery);

      expect(result).toStrictEqual({ count: 0, data: [] });
    });

    it('should handle empty search results', async () => {
      const searchQuery = 'NONEXISTENT';
      const mockResponse = {
        count: 0,
        data: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      };

      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&limit=10&includeMarketData=false`,
        )
        .reply(200, mockResponse)
        .persist();

      const results = await searchTokens([sampleCaipChainId], searchQuery);

      expect(results).toStrictEqual({ count: 0, data: [] });
    });

    it('should return empty array when no chainIds are provided', async () => {
      const searchQuery = 'USD';
      const mockResponse = {
        count: 0,
        data: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      };

      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=&query=${searchQuery}&limit=10&includeMarketData=false`,
        )
        .reply(200, mockResponse)
        .persist();

      const results = await searchTokens([], searchQuery);

      expect(results).toStrictEqual({ count: 0, data: [] });
    });

    it('should handle API error responses in JSON format', async () => {
      const searchQuery = 'USD';
      const errorResponse = { error: 'Invalid search query' };
      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&limit=10&includeMarketData=false`,
        )
        .reply(200, errorResponse)
        .persist();

      const result = await searchTokens([sampleCaipChainId], searchQuery);

      // Non-array responses should be converted to empty object with count 0
      expect(result).toStrictEqual({ count: 0, data: [] });
    });

    it('should handle supported CAIP format chain IDs', async () => {
      const searchQuery = 'USD';
      const solanaChainId: CaipChainId =
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
      const tronChainId: CaipChainId = 'tron:728126428';

      const multiChainIds: CaipChainId[] = [
        sampleCaipChainId,
        solanaChainId,
        tronChainId,
      ];
      const encodedChainIds = multiChainIds
        .map((id) => encodeURIComponent(id))
        .join(',');
      const mockResponse = {
        count: sampleSearchResults.length,
        data: sampleSearchResults,
        pageInfo: { hasNextPage: false, endCursor: null },
      };

      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodedChainIds}&query=${searchQuery}&limit=10&includeMarketData=false`,
        )
        .reply(200, mockResponse)
        .persist();

      const result = await searchTokens(multiChainIds, searchQuery);

      expect(result).toStrictEqual({
        count: sampleSearchResults.length,
        data: sampleSearchResults,
      });
    });

    it('should include market data when includeMarketData is true', async () => {
      const searchQuery = 'USD';
      const mockResponse = {
        count: sampleSearchResults.length,
        data: sampleSearchResults,
        pageInfo: { hasNextPage: false, endCursor: null },
      };

      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&limit=10&includeMarketData=true`,
        )
        .reply(200, mockResponse)
        .persist();

      const results = await searchTokens([sampleCaipChainId], searchQuery, {
        includeMarketData: true,
      });

      expect(results).toStrictEqual({
        count: sampleSearchResults.length,
        data: sampleSearchResults,
      });
    });
  });

  describe('getTrendingTokens', () => {
    const sampleTrendingTokens = [
      {
        assetId: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        name: 'USDC',
        symbol: 'USDC',
        decimals: 6,
        price: '1.00294333595976',
        aggregatedUsdVolume: 455616484.38,
        marketCap: 75877371441.07,
      },
      {
        assetId: 'eip155:1/erc20:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        name: 'Wrapped Ether',
        symbol: 'WETH',
        decimals: 18,
        price: '3406.01599421582',
        aggregatedUsdVolume: 358982988.74,
        marketCap: 7610628690.4,
      },
    ];
    it('returns empty array if no chains are provided', async () => {
      const result = await getTrendingTokens({ chainIds: [] });
      expect(result).toStrictEqual([]);
    });

    it('returns empty array if api returns non-array response', async () => {
      nock(TOKEN_END_POINT_API)
        .get(
          `/v3/tokens/trending?chainIds=${encodeURIComponent(sampleCaipChainId)}`,
        )
        .reply(200, { error: 'Invalid response' })
        .persist();

      const result = await getTrendingTokens({ chainIds: [sampleCaipChainId] });
      expect(result).toStrictEqual([]);
    });

    it('returns empty array if the fetch fails', async () => {
      nock(TOKEN_END_POINT_API)
        .get(
          `/v3/tokens/trending?chainIds=${encodeURIComponent(sampleCaipChainId)}`,
        )
        .reply(500)
        .persist();

      const result = await getTrendingTokens({ chainIds: [sampleCaipChainId] });
      expect(result).toStrictEqual([]);
    });

    it('returns the list of trending tokens if the fetch succeeds', async () => {
      const testChainId = 'eip155:1';
      const sortBy: SortTrendingBy = 'm5_trending';
      const testMinLiquidity = 1000000;
      const testMinVolume24hUsd = 1000000;
      const testMaxVolume24hUsd = 1000000;
      const testMinMarketCap = 1000000;
      const testMaxMarketCap = 1000000;
      nock(TOKEN_END_POINT_API)
        .get(
          `/v3/tokens/trending?chainIds=${encodeURIComponent(testChainId)}&sort=${sortBy}&minLiquidity=${testMinLiquidity}&minVolume24hUsd=${testMinVolume24hUsd}&maxVolume24hUsd=${testMaxVolume24hUsd}&minMarketCap=${testMinMarketCap}&maxMarketCap=${testMaxMarketCap}`,
        )
        .reply(200, sampleTrendingTokens)
        .persist();

      const result = await getTrendingTokens({
        chainIds: [testChainId],
        sortBy,
        minLiquidity: testMinLiquidity,
        minVolume24hUsd: testMinVolume24hUsd,
        maxVolume24hUsd: testMaxVolume24hUsd,
        minMarketCap: testMinMarketCap,
        maxMarketCap: testMaxMarketCap,
      });
      expect(result).toStrictEqual(sampleTrendingTokens);
    });

    it('returns the list of trending tokens if the fetch succeeds with no query params', async () => {
      const testChainId = 'eip155:1';

      nock(TOKEN_END_POINT_API)
        .get(`/v3/tokens/trending?chainIds=${encodeURIComponent(testChainId)}`)
        .reply(200, sampleTrendingTokens)
        .persist();

      const result = await getTrendingTokens({
        chainIds: [testChainId],
      });
      expect(result).toStrictEqual(sampleTrendingTokens);
    });

    it('returns the list of trending tokens with excludeLabels', async () => {
      const testChainId = 'eip155:1';
      const testExcludeLabels = ['stable_coin', 'blue_chip'];

      nock(TOKEN_END_POINT_API)
        .get(
          `/v3/tokens/trending?chainIds=${encodeURIComponent(testChainId)}&excludeLabels=${testExcludeLabels.join(',')}`,
        )
        .reply(200, sampleTrendingTokens)
        .persist();

      const result = await getTrendingTokens({
        chainIds: [testChainId],
        excludeLabels: testExcludeLabels,
      });
      expect(result).toStrictEqual(sampleTrendingTokens);
    });
  });
});
