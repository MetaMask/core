import { toHex } from '@metamask/controller-utils';
import type { CaipChainId } from '@metamask/utils';
import type { CaipAssetType } from '@metamask/utils';
import nock from 'nock';

import type { SortTrendingBy } from './token-service';
import {
  fetchTokenAssets,
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

    const sampleTrendingTokensWithSecurityData = [
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
              featureId: 'EXTERNAL_FUNCTIONS',
              type: 'Info',
              description:
                'External calls make this token contract highly dependent on other contracts',
            },
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
              {
                label: 'contract',
                name: null,
                address: '0x2f0b23f53734252bda2277357e97e1517d6b042a',
                holdingPercentage: 11.953,
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
              {
                marketType: 'AMM',
                marketName: 'uniswap_v3',
                pairName: 'WETH / USDT',
                reserveUSD: 57330581.2498,
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
      {
        assetId: 'eip155:1/erc20:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
        name: 'Wrapped Bitcoin',
        symbol: 'WBTC',
        decimals: 8,
        price: '71179.754177197',
        aggregatedUsdVolume: 133023037.36,
        marketCap: 8533496716,
        priceChangePct: {
          m5: '0.13',
          m15: '0.035',
          m30: '0.702',
          h1: '2.67',
          h6: '5.53',
          h24: '7.15',
        },
        securityData: {
          resultType: 'Verified',
          maliciousScore: '0.0',
          fees: {
            transfer: 0,
            transferFeeMaxAmount: null,
            buy: 0,
            sell: null,
          },
          features: [
            {
              featureId: 'IS_MINTABLE',
              type: 'Info',
              description: 'Token is mintable',
            },
            {
              featureId: 'HIGH_REPUTATION_TOKEN',
              type: 'Benign',
              description: 'Token with verified high reputation',
            },
            {
              featureId: 'TRANSFER_PAUSEABLE',
              type: 'Info',
              description:
                'The token owner has the authority to suspend or freeze trading, rendering the token non-tradable and preventing buying or selling',
            },
            {
              featureId: 'VERIFIED_CONTRACT',
              type: 'Info',
              description: 'The token contract is verified',
            },
          ],
          financialStats: {
            supply: 11995665562622,
            topHolders: [
              {
                label: 'contract',
                name: null,
                address: '0x5ee5bf7ae06d1be5997a1a72006fe6c607ec6de8',
                holdingPercentage: 33.806,
              },
            ],
            holdersCount: 147805,
            tradeVolume24h: 164416843,
            lockedLiquidityPct: 0,
            markets: [
              {
                marketType: 'UNKNOWN',
                marketName: 'curve',
                pairName: 'crvUSD / WBTC',
                reserveUSD: 94306532.7221,
              },
            ],
          },
          metadata: {
            externalLinks: {
              homepage: 'https://www.wbtc.network/',
              twitterPage: 'WrappedBTC',
              telegramChannelId: 'wbtc_community',
            },
          },
          created: '2018-11-24T21:45:52',
        },
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

    it('includes includeTokenSecurityData param in the URL and returns securityData', async () => {
      const testChainId = 'eip155:1';

      nock(TOKEN_END_POINT_API)
        .get(
          `/v3/tokens/trending?chainIds=${encodeURIComponent(testChainId)}&includeRwaData=true&usePriceApiData=true&includeTokenSecurityData=true`,
        )
        .reply(200, sampleTrendingTokensWithSecurityData)
        .persist();

      const result = await getTrendingTokens({
        chainIds: [testChainId],
        includeTokenSecurityData: true,
      });

      expect(result).toStrictEqual(sampleTrendingTokensWithSecurityData);
      expect(result[0].securityData?.resultType).toBe('Verified');
      expect(result[0].securityData?.maliciousScore).toBe('0.0');
      expect(result[0].securityData?.features).toHaveLength(3);
      expect(result[0].securityData?.financialStats.holdersCount).toBe(2877494);
      expect(result[0].securityData?.financialStats.topHolders).toHaveLength(2);
      expect(result[1].securityData?.fees.sell).toBeNull();
    });

    it('does not include includeTokenSecurityData param when not provided', async () => {
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

    it('combines includeTokenSecurityData with other query params', async () => {
      const testChainId = 'eip155:1';
      const testMinLiquidity = 200000;
      const testMinVolume = 1000000;

      nock(TOKEN_END_POINT_API)
        .get(
          `/v3/tokens/trending?chainIds=${encodeURIComponent(testChainId)}&sort=h6_trending&minLiquidity=${testMinLiquidity}&minVolume24hUsd=${testMinVolume}&includeRwaData=false&usePriceApiData=true&includeTokenSecurityData=true`,
        )
        .reply(200, sampleTrendingTokensWithSecurityData)
        .persist();

      const result = await getTrendingTokens({
        chainIds: [testChainId],
        sortBy: 'h6_trending',
        minLiquidity: testMinLiquidity,
        minVolume24hUsd: testMinVolume,
        includeRwaData: false,
        includeTokenSecurityData: true,
      });
      expect(result).toStrictEqual(sampleTrendingTokensWithSecurityData);
    });
  });

  describe('searchTokens with includeTokenSecurityData', () => {
    const sampleSearchResultsWithSecurityData = [
      {
        assetId: 'eip155:1/erc20:0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce',
        symbol: 'SHIB',
        decimals: 18,
        name: 'SHIBA INU',
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
              featureId: 'LISTED_ON_CENTRALIZED_EXCHANGE',
              type: 'Benign',
              description:
                'The token is listed on a leading, well-known centralized exchange',
            },
            {
              featureId: 'VERIFIED_CONTRACT',
              type: 'Info',
              description: 'The token contract is verified',
            },
          ],
          financialStats: {
            supply: 9.99982335599866e32,
            topHolders: [
              {
                label: 'wallet',
                name: null,
                address: '0xdead000000000000000042069420694206942069',
                holdingPercentage: 41.044,
              },
              {
                label: 'wallet',
                name: null,
                address: '0x02e2201576fbbefb52812f2ee7f08eb4774b481e',
                holdingPercentage: 5.955,
              },
            ],
            holdersCount: 1557078,
            tradeVolume24h: 107499,
            lockedLiquidityPct: null,
            markets: [
              {
                marketType: 'UNKNOWN',
                marketName: 'shibaswap',
                pairName: 'SHIB / WETH',
                reserveUSD: 2671998.6275,
              },
              {
                marketType: 'AMM',
                marketName: 'uniswap_v2',
                pairName: 'SHIB / WETH',
                reserveUSD: 540915.3049,
              },
            ],
          },
          metadata: {
            externalLinks: {
              homepage: 'https://shibatoken.com/',
              twitterPage: 'shibarium_',
              telegramChannelId: 'ShibaInu_Dogecoinkiller',
            },
          },
          created: '2020-07-31T18:32:43',
        },
      },
    ];

    it('includes includeTokenSecurityData param in the URL and returns securityData', async () => {
      const searchQuery = 'shiba';
      const mockResponse = {
        count: sampleSearchResultsWithSecurityData.length,
        data: sampleSearchResultsWithSecurityData,
        pageInfo: { hasNextPage: false, endCursor: null },
      };

      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&first=10&includeMarketData=false&includeRwaData=true&includeTokenSecurityData=true`,
        )
        .reply(200, mockResponse)
        .persist();

      const results = await searchTokens([sampleCaipChainId], searchQuery, {
        includeTokenSecurityData: true,
      });

      expect(results).toStrictEqual({
        count: sampleSearchResultsWithSecurityData.length,
        data: sampleSearchResultsWithSecurityData,
      });
      expect(results.data[0].securityData?.resultType).toBe('Verified');
      expect(results.data[0].securityData?.maliciousScore).toBe('0.0');
      expect(results.data[0].securityData?.features).toHaveLength(3);
      expect(results.data[0].securityData?.financialStats.holdersCount).toBe(
        1557078,
      );
      expect(
        results.data[0].securityData?.financialStats.topHolders[0]?.address,
      ).toBe('0xdead000000000000000042069420694206942069');
      expect(
        results.data[0].securityData?.metadata.externalLinks.homepage,
      ).toBe('https://shibatoken.com/');
    });

    it('does not include includeTokenSecurityData param when not provided', async () => {
      const searchQuery = 'shiba';
      const mockResponse = {
        count: 1,
        data: [
          {
            assetId:
              'eip155:1/erc20:0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce',
            symbol: 'SHIB',
            decimals: 18,
            name: 'SHIBA INU',
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      };

      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?networks=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&first=10&includeMarketData=false&includeRwaData=true`,
        )
        .reply(200, mockResponse)
        .persist();

      const results = await searchTokens([sampleCaipChainId], searchQuery);

      expect(results.data[0].securityData).toBeUndefined();
    });
  });

  describe('fetchTokenAssets', () => {
    const oneInchAssetId: CaipAssetType =
      'eip155:1/erc20:0x111111111117dc0aa78b770fa6a738034120c302';
    const wethAssetId: CaipAssetType =
      'eip155:1/erc20:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

    const sampleTokenAssets = [
      {
        assetId: oneInchAssetId,
        symbol: '1INCH',
        name: '1INCH Token',
        decimals: 18,
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
              featureId: 'LISTED_ON_CENTRALIZED_EXCHANGE',
              type: 'Benign',
              description:
                'The token is listed on a leading, well-known centralized exchange',
            },
            {
              featureId: 'HIGH_REPUTATION_TOKEN',
              type: 'Benign',
              description: 'Token with verified high reputation',
            },
            {
              featureId: 'EXTERNAL_FUNCTIONS',
              type: 'Info',
              description:
                'External calls make this token contract highly dependent on other contracts',
            },
            {
              featureId: 'OWNERSHIP_RENOUNCED',
              type: 'Info',
              description:
                'The token owner has renounced ownership, meaning the token is no longer controlled by any entity',
            },
            {
              featureId: 'IS_MINTABLE',
              type: 'Info',
              description: 'Token is mintable',
            },
            {
              featureId: 'VERIFIED_CONTRACT',
              type: 'Info',
              description: 'The token contract is verified',
            },
          ],
          financialStats: {
            supply: 1.499999999997e27,
            topHolders: [
              {
                label: 'contract',
                name: null,
                address: '0x9a0c8ff858d273f57072d714bca7411d717501d7',
                holdingPercentage: 16.613,
              },
              {
                label: 'contract',
                name: null,
                address: '0x225d3822de44e58ee935440e0c0b829c4232086e',
                holdingPercentage: 9.62,
              },
              {
                label: 'wallet',
                name: null,
                address: '0x6630444cdbd42a024da079615f3bbce8edd5a7ba',
                holdingPercentage: 8.266,
              },
            ],
            holdersCount: 110817,
            tradeVolume24h: 632418,
            lockedLiquidityPct: 0,
            markets: [
              {
                marketType: 'AMM',
                marketName: 'uniswap-v4-ethereum',
                pairName: '1INCH / wstETH',
                reserveUSD: 6630065.1876,
              },
              {
                marketType: 'AMM',
                marketName: 'uniswap-v4-ethereum',
                pairName: '1INCH / WBTC',
                reserveUSD: 3368702.9552,
              },
            ],
          },
          metadata: {
            externalLinks: {
              homepage: 'https://1inch.com/',
              twitterPage: '1inch',
              telegramChannelId: 'OneInchNetwork',
            },
          },
          created: '2020-12-23T18:13:31',
        },
      },
    ];

    it('returns empty array if no asset IDs are provided', async () => {
      const result = await fetchTokenAssets([]);
      expect(result).toStrictEqual([]);
    });

    it('fetches a single asset by ID', async () => {
      nock(TOKEN_END_POINT_API)
        .get(`/assets?assetIds=${encodeURIComponent(oneInchAssetId)}`)
        .reply(200, sampleTokenAssets)
        .persist();

      const result = await fetchTokenAssets([oneInchAssetId]);
      expect(result).toStrictEqual(sampleTokenAssets);
    });

    it('fetches multiple assets by ID', async () => {
      const multipleAssets = [
        ...sampleTokenAssets,
        {
          assetId: wethAssetId,
          symbol: 'WETH',
          name: 'Wrapped Ether',
          decimals: 18,
        },
      ];
      const encodedIds = [oneInchAssetId, wethAssetId]
        .map(encodeURIComponent)
        .join(',');

      nock(TOKEN_END_POINT_API)
        .get(`/assets?assetIds=${encodedIds}`)
        .reply(200, multipleAssets)
        .persist();

      const result = await fetchTokenAssets([oneInchAssetId, wethAssetId]);
      expect(result).toStrictEqual(multipleAssets);
      expect(result).toHaveLength(2);
    });

    it('includes includeTokenSecurityData param in the URL and returns securityData', async () => {
      nock(TOKEN_END_POINT_API)
        .get(
          `/assets?assetIds=${encodeURIComponent(oneInchAssetId)}&includeTokenSecurityData=true`,
        )
        .reply(200, sampleTokenAssets)
        .persist();

      const result = await fetchTokenAssets([oneInchAssetId], {
        includeTokenSecurityData: true,
      });

      expect(result).toStrictEqual(sampleTokenAssets);
      expect(result[0].securityData?.resultType).toBe('Verified');
      expect(result[0].securityData?.maliciousScore).toBe('0.0');
      expect(result[0].securityData?.features).toHaveLength(6);
      expect(result[0].securityData?.financialStats.holdersCount).toBe(110817);
      expect(result[0].securityData?.financialStats.topHolders).toHaveLength(3);
      expect(result[0].securityData?.metadata.externalLinks.homepage).toBe(
        'https://1inch.com/',
      );
      expect(result[0].securityData?.metadata.externalLinks.twitterPage).toBe(
        '1inch',
      );
    });

    it('includes multiple optional flags in the request URL', async () => {
      nock(TOKEN_END_POINT_API)
        .get(
          `/assets?assetIds=${encodeURIComponent(oneInchAssetId)}&includeAggregators=true&includeCoingeckoId=true&includeLabels=true&includeMarketData=true&includeOccurrences=true&includeTokenSecurityData=true&includeRwaData=true`,
        )
        .reply(200, sampleTokenAssets)
        .persist();

      const result = await fetchTokenAssets([oneInchAssetId], {
        includeAggregators: true,
        includeCoingeckoId: true,
        includeLabels: true,
        includeMarketData: true,
        includeOccurrences: true,
        includeTokenSecurityData: true,
        includeRwaData: true,
      });
      expect(result).toStrictEqual(sampleTokenAssets);
    });

    it('does not append params for undefined options', async () => {
      nock(TOKEN_END_POINT_API)
        .get(
          `/assets?assetIds=${encodeURIComponent(oneInchAssetId)}&includeRwaData=true`,
        )
        .reply(200, sampleTokenAssets)
        .persist();

      const result = await fetchTokenAssets([oneInchAssetId], {
        includeRwaData: true,
      });
      expect(result).toStrictEqual(sampleTokenAssets);
    });

    it.each([
      [
        'non-array response',
        (): nock.Scope =>
          nock(TOKEN_END_POINT_API)
            .get(`/assets?assetIds=${encodeURIComponent(oneInchAssetId)}`)
            .reply(200, { error: 'Invalid request' }),
      ],
      [
        'network error',
        (): nock.Scope =>
          nock(TOKEN_END_POINT_API)
            .get(`/assets?assetIds=${encodeURIComponent(oneInchAssetId)}`)
            .replyWithError('Example network error'),
      ],
      [
        '500 error',
        (): nock.Scope =>
          nock(TOKEN_END_POINT_API)
            .get(`/assets?assetIds=${encodeURIComponent(oneInchAssetId)}`)
            .reply(500),
      ],
    ])('returns empty array on %s', async (_label, setupNock) => {
      setupNock();
      const result = await fetchTokenAssets([oneInchAssetId]);
      expect(result).toStrictEqual([]);
    });
  });
});
