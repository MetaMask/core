import { toHex } from '@metamask/controller-utils';
import type { CaipChainId } from '@metamask/utils';
import nock from 'nock';

import type { SortTrendingBy } from './token-service';
import {
  fetchTokenListByChainId,
  fetchTokenMetadata,
  getTrendingTokens,
  searchTokens,
  TOKEN_END_POINT_API,
  TOKEN_METADATA_NO_SUPPORT_ERROR,
} from './token-service';

const ONE_MILLISECOND = 1;
const ONE_SECOND_IN_MILLISECONDS = 1_000;

const sampleTokenList = [
  {
    address: '0xbbbbca6a901c926f240b89eacb641d8aec7aeafd',
    symbol: 'LRC',
    decimals: 18,
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
  {
    address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
    symbol: 'SNX',
    decimals: 18,
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
    name: 'Synthetix',
  },
  {
    address: '0x408e41876cccdc0f92210600ef50372656052a38',
    symbol: 'REN',
    decimals: 18,
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
  {
    address: '0x514910771af9ca656af840dff83e8264ecf986ca',
    symbol: 'LINK',
    decimals: 18,
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
    name: 'Chainlink',
  },
  {
    address: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c',
    symbol: 'BNT',
    decimals: 18,
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
    name: 'Bancor',
  },
];

const sampleTokenListLinea = [
  {
    address: '0xbbbbca6a901c926f240b89eacb641d8aec7aeafd',
    symbol: 'LRC',
    decimals: 18,
    occurrences: 11,
    aggregators: [
      'lineaTeam',
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
  {
    address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
    symbol: 'SNX',
    decimals: 18,
    occurrences: 11,
    aggregators: [
      'lineaTeam',
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
    name: 'Synthetix',
  },
  {
    address: '0x408e41876cccdc0f92210600ef50372656052a38',
    symbol: 'REN',
    decimals: 18,
    occurrences: 11,
    aggregators: [
      'lineaTeam',
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
  {
    address: '0x514910771af9ca656af840dff83e8264ecf986ca',
    symbol: 'LINK',
    decimals: 18,
    occurrences: 11,
    aggregators: [
      'lineaTeam',
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
    name: 'Chainlink',
  },
  {
    address: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c',
    symbol: 'BNT',
    decimals: 18,
    occurrences: 11,
    aggregators: [
      'lineaTeam',
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
    name: 'Bancor',
  },
];

const sampleToken = {
  address: '0x514910771af9ca656af840dff83e8264ecf986ca',
  symbol: 'LINK',
  decimals: 18,
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
  name: 'Chainlink',
};

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
    it('should call the tokens api and return the list of tokens', async () => {
      const { signal } = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/${sampleDecimalChainId}?occurrenceFloor=3&includeNativeAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false&includeRwaData=true`,
        )
        .reply(200, sampleTokenList)
        .persist();

      const tokens = await fetchTokenListByChainId(sampleChainId, signal);

      expect(tokens).toStrictEqual(sampleTokenList);
    });

    it('should call the tokens api and return the list of tokens on linea mainnet', async () => {
      const { signal } = new AbortController();
      const lineaChainId = 59144;
      const lineaHexChain = toHex(lineaChainId);

      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/${lineaChainId}?occurrenceFloor=1&includeNativeAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false&includeRwaData=true`,
        )
        .reply(200, sampleTokenListLinea)
        .persist();

      const tokens = await fetchTokenListByChainId(lineaHexChain, signal);

      expect(tokens).toStrictEqual(sampleTokenListLinea);
    });

    it('should correctly filter linea tokens: include if has lineaTeam OR >= 3 aggregators', async () => {
      const { signal } = new AbortController();
      const lineaChainId = 59144;
      const lineaHexChain = toHex(lineaChainId);

      const mixedTokens = [
        {
          // Should be included (has lineaTeam)
          address: '0x1',
          symbol: 'T1',
          decimals: 18,
          aggregators: ['lineaTeam', 'other'],
        },
        {
          // Should be included (no lineaTeam, but 3 aggregators)
          address: '0x2',
          symbol: 'T2',
          decimals: 18,
          aggregators: ['a1', 'a2', 'a3'],
        },
        {
          // Should be excluded (no lineaTeam, only 2 aggregators)
          address: '0x3',
          symbol: 'T3',
          decimals: 18,
          aggregators: ['a1', 'a2'],
        },
      ];

      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/${lineaChainId}?occurrenceFloor=1&includeNativeAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false&includeRwaData=true`,
        )
        .reply(200, mixedTokens)
        .persist();

      const tokens = (await fetchTokenListByChainId(lineaHexChain, signal)) as {
        address: string;
      }[];

      expect(tokens).toHaveLength(2);
      expect(tokens.find((token) => token.address === '0x1')).toBeDefined();
      expect(tokens.find((token) => token.address === '0x2')).toBeDefined();
      expect(tokens.find((token) => token.address === '0x3')).toBeUndefined();
    });

    it('should return undefined if the fetch is aborted', async () => {
      const abortController = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/${sampleDecimalChainId}?occurrenceFloor=3&includeNativeAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false&includeRwaData=true`,
        )
        // well beyond time it will take to abort
        .delay(ONE_SECOND_IN_MILLISECONDS)
        .reply(200, sampleTokenList)
        .persist();

      const fetchPromise = fetchTokenListByChainId(
        sampleChainId,
        abortController.signal,
      );
      abortController.abort();

      expect(await fetchPromise).toBeUndefined();
    });

    it('should return undefined if the fetch fails with a network error', async () => {
      const { signal } = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/${sampleDecimalChainId}?occurrenceFloor=3&includeNativeAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false&includeRwaData=true`,
        )
        .replyWithError('Example network error')
        .persist();

      const result = await fetchTokenListByChainId(sampleChainId, signal);

      expect(result).toBeUndefined();
    });

    it('should return undefined if the fetch fails with an unsuccessful status code', async () => {
      const { signal } = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/${sampleDecimalChainId}?occurrenceFloor=3&includeNativeAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false&includeRwaData=true`,
        )
        .reply(500)
        .persist();

      const result = await fetchTokenListByChainId(sampleChainId, signal);

      expect(result).toBeUndefined();
    });

    it('should return undefined if the fetch fails with a timeout', async () => {
      const { signal } = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/${sampleDecimalChainId}?occurrenceFloor=3&includeNativeAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false&includeRwaData=true`,
        )
        // well beyond timeout
        .delay(ONE_SECOND_IN_MILLISECONDS)
        .reply(200, sampleTokenList)
        .persist();

      const result = await fetchTokenListByChainId(sampleChainId, signal, {
        timeout: ONE_MILLISECOND,
      });

      expect(result).toBeUndefined();
    });
  });

  describe('fetchTokenMetadata', () => {
    it('should call the api to return the token metadata for eth address provided', async () => {
      const { signal } = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(
          `/token/${sampleDecimalChainId}?address=0x514910771af9ca656af840dff83e8264ecf986ca&includeRwaData=true`,
        )
        .reply(200, sampleToken)
        .persist();

      const token = await fetchTokenMetadata(
        sampleChainId,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        signal,
      );

      expect(token).toStrictEqual(sampleToken);
    });

    it('should return undefined if the fetch is aborted', async () => {
      const abortController = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(`/tokens/${sampleDecimalChainId}`)
        // well beyond time it will take to abort
        .delay(ONE_SECOND_IN_MILLISECONDS)
        .reply(200, sampleTokenList)
        .persist();

      const fetchPromise = fetchTokenMetadata(
        sampleChainId,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        abortController.signal,
      );
      abortController.abort();

      expect(await fetchPromise).toBeUndefined();
    });

    it('should return undefined if the fetch fails with a network error', async () => {
      const { signal } = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(`/tokens/${sampleDecimalChainId}`)
        .replyWithError('Example network error')
        .persist();

      const tokenMetadata = await fetchTokenMetadata(
        sampleChainId,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        signal,
      );

      expect(tokenMetadata).toBeUndefined();
    });

    it('should return undefined if the fetch fails with an unsuccessful status code', async () => {
      const { signal } = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(`/tokens/${sampleDecimalChainId}`)
        .reply(500)
        .persist();

      const tokenMetadata = await fetchTokenMetadata(
        sampleChainId,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        signal,
      );

      expect(tokenMetadata).toBeUndefined();
    });

    it('should return undefined if the fetch fails with a timeout', async () => {
      const { signal } = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(`/tokens/${sampleDecimalChainId}`)
        // well beyond timeout
        .delay(ONE_SECOND_IN_MILLISECONDS)
        .reply(200, sampleTokenList)
        .persist();

      const tokenMetadata = await fetchTokenMetadata(
        sampleChainId,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        signal,
        { timeout: ONE_MILLISECOND },
      );

      expect(tokenMetadata).toBeUndefined();
    });

    it('should throw error if fetching from non supported network', async () => {
      const { signal } = new AbortController();
      await expect(
        fetchTokenMetadata(
          toHex(5),
          '0x514910771af9ca656af840dff83e8264ecf986ca',
          signal,
        ),
      ).rejects.toThrow(TOKEN_METADATA_NO_SUPPORT_ERROR);
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
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&first=10&includeMarketData=false&includeRwaData=true`,
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
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&first=${customLimit}&includeMarketData=false&includeRwaData=true`,
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
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${encodedQuery}&first=10&includeMarketData=false&includeRwaData=true`,
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
          `/tokens/search?networks=${encodedChainIds}&query=${searchQuery}&first=10&includeMarketData=false&includeRwaData=true`,
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

    it('should return empty array with error if the fetch fails with a network error', async () => {
      const searchQuery = 'USD';
      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&first=10&includeMarketData=false&includeRwaData=true`,
        )
        .replyWithError('Example network error')
        .persist();

      const result = await searchTokens([sampleCaipChainId], searchQuery);

      expect(result).toStrictEqual({
        count: 0,
        data: [],
        error: expect.stringContaining('Example network error'),
      });
    });

    it('should return empty array with error if the fetch fails with 400 error', async () => {
      const searchQuery = 'USD';
      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&first=10&includeMarketData=false&includeRwaData=true`,
        )
        .reply(400, { error: 'Bad Request' })
        .persist();

      const result = await searchTokens([sampleCaipChainId], searchQuery);

      expect(result).toStrictEqual({
        count: 0,
        data: [],
        error: expect.stringContaining("Fetch failed with status '400'"),
      });
    });

    it('should return empty array with error if the fetch fails with 500 error', async () => {
      const searchQuery = 'USD';
      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&first=10&includeMarketData=false&includeRwaData=true`,
        )
        .reply(500)
        .persist();

      const result = await searchTokens([sampleCaipChainId], searchQuery);

      expect(result).toStrictEqual({
        count: 0,
        data: [],
        error: expect.stringContaining("Fetch failed with status '500'"),
      });
    });

    it('should return error for malformed API response', async () => {
      const searchQuery = 'USD';
      const malformedResponse = {
        count: 5,
        // Missing 'data' array - this is malformed
        someOtherField: 'value',
      };

      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&first=10&includeMarketData=false&includeRwaData=true`,
        )
        .reply(200, malformedResponse)
        .persist();

      const result = await searchTokens([sampleCaipChainId], searchQuery);

      expect(result).toStrictEqual({
        count: 0,
        data: [],
        error: 'Unexpected API response format',
      });
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
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&first=10&includeMarketData=false&includeRwaData=true`,
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
          `/tokens/search?networks=&query=${searchQuery}&first=10&includeMarketData=false&includeRwaData=true`,
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
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&first=10&includeMarketData=false&includeRwaData=true`,
        )
        .reply(200, errorResponse)
        .persist();

      const result = await searchTokens([sampleCaipChainId], searchQuery);

      // Non-array responses should be converted to empty object with count 0 and error message
      expect(result).toStrictEqual({
        count: 0,
        data: [],
        error: 'Unexpected API response format',
      });
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
          `/tokens/search?networks=${encodedChainIds}&query=${searchQuery}&first=10&includeMarketData=false&includeRwaData=true`,
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
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&first=10&includeMarketData=true&includeRwaData=true`,
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

    it('should clamp limit to 50 for regular queries', async () => {
      const searchQuery = 'USD';
      const largeLimit = 100;
      const mockResponse = {
        count: sampleSearchResults.length,
        data: sampleSearchResults,
        pageInfo: { hasNextPage: false, endCursor: null },
      };

      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&first=50&includeMarketData=false&includeRwaData=true`,
        )
        .reply(200, mockResponse)
        .persist();

      const results = await searchTokens([sampleCaipChainId], searchQuery, {
        limit: largeLimit,
      });

      expect(results).toStrictEqual({
        count: sampleSearchResults.length,
        data: sampleSearchResults,
      });
    });

    it('should allow larger limits for Ondo queries up to 500', async () => {
      const searchQuery = 'Ondo Finance Token';
      const ondoLimit = 200;
      const mockResponse = {
        count: sampleSearchResults.length,
        data: sampleSearchResults,
        pageInfo: { hasNextPage: false, endCursor: null },
      };

      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${encodeURIComponent(searchQuery)}&first=${ondoLimit}&includeMarketData=false&includeRwaData=true`,
        )
        .reply(200, mockResponse)
        .persist();

      const results = await searchTokens([sampleCaipChainId], searchQuery, {
        limit: ondoLimit,
      });

      expect(results).toStrictEqual({
        count: sampleSearchResults.length,
        data: sampleSearchResults,
      });
    });

    it('should clamp very large limits to 50 even for Ondo queries', async () => {
      const searchQuery = 'Ondo Token';
      const veryLargeLimit = 1000;
      const mockResponse = {
        count: sampleSearchResults.length,
        data: sampleSearchResults,
        pageInfo: { hasNextPage: false, endCursor: null },
      };

      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${encodeURIComponent(searchQuery)}&first=50&includeMarketData=false&includeRwaData=true`,
        )
        .reply(200, mockResponse)
        .persist();

      const results = await searchTokens([sampleCaipChainId], searchQuery, {
        limit: veryLargeLimit,
      });

      expect(results).toStrictEqual({
        count: sampleSearchResults.length,
        data: sampleSearchResults,
      });
    });

    it('should use default limit of 10 when limit is not provided', async () => {
      const searchQuery = 'USD';
      const mockResponse = {
        count: sampleSearchResults.length,
        data: sampleSearchResults,
        pageInfo: { hasNextPage: false, endCursor: null },
      };

      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&first=10&includeMarketData=false&includeRwaData=true`,
        )
        .reply(200, mockResponse)
        .persist();

      const results = await searchTokens([sampleCaipChainId], searchQuery);

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
          `/v3/tokens/trending?chainIds=${encodeURIComponent(testChainId)}&sort=${sortBy}&minLiquidity=${testMinLiquidity}&minVolume24hUsd=${testMinVolume24hUsd}&maxVolume24hUsd=${testMaxVolume24hUsd}&minMarketCap=${testMinMarketCap}&maxMarketCap=${testMaxMarketCap}&includeRwaData=true&usePriceApiData=true`,
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
        .get(
          `/v3/tokens/trending?chainIds=${encodeURIComponent(testChainId)}&includeRwaData=true&usePriceApiData=true`,
        )
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
          `/v3/tokens/trending?chainIds=${encodeURIComponent(testChainId)}&excludeLabels=${testExcludeLabels.join(',')}&includeRwaData=true&usePriceApiData=true`,
        )
        .reply(200, sampleTrendingTokens)
        .persist();

      const result = await getTrendingTokens({
        chainIds: [testChainId],
        excludeLabels: testExcludeLabels,
      });
      expect(result).toStrictEqual(sampleTrendingTokens);
    });

    it('returns the list of trending tokens with includeRwaData', async () => {
      const testChainId = 'eip155:1';

      nock(TOKEN_END_POINT_API)
        .get(
          `/v3/tokens/trending?chainIds=${encodeURIComponent(testChainId)}&includeRwaData=true&usePriceApiData=true`,
        )
        .reply(200, sampleTrendingTokens)
        .persist();

      const result = await getTrendingTokens({
        chainIds: [testChainId],
        includeRwaData: true,
      });
      expect(result).toStrictEqual(sampleTrendingTokens);
    });
  });
});
