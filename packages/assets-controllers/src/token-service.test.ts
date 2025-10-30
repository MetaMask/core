import { toHex } from '@metamask/controller-utils';
import type { CaipChainId } from '@metamask/utils';
import nock from 'nock';

import {
  fetchTokenListByChainId,
  fetchTokenMetadata,
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
          `/tokens/${sampleDecimalChainId}?occurrenceFloor=3&includeNativeAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false`,
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
          `/tokens/${lineaChainId}?occurrenceFloor=1&includeNativeAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false`,
        )
        .reply(200, sampleTokenListLinea)
        .persist();

      const tokens = await fetchTokenListByChainId(lineaHexChain, signal);

      expect(tokens).toStrictEqual(sampleTokenListLinea);
    });

    it('should return undefined if the fetch is aborted', async () => {
      const abortController = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/${sampleDecimalChainId}?occurrenceFloor=3&includeNativeAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false`,
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
          `/tokens/${sampleDecimalChainId}?occurrenceFloor=3&includeNativeAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false`,
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
          `/tokens/${sampleDecimalChainId}?occurrenceFloor=3&includeNativeAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false`,
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
          `/tokens/${sampleDecimalChainId}?occurrenceFloor=3&includeNativeAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false`,
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
          `/token/${sampleDecimalChainId}?address=0x514910771af9ca656af840dff83e8264ecf986ca`,
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
          `/tokens/search?chainIds=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&limit=10`,
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
          `/tokens/search?chainIds=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&limit=${customLimit}`,
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
          `/tokens/search?chainIds=${encodeURIComponent(sampleCaipChainId)}&query=${encodedQuery}&limit=10`,
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
          `/tokens/search?chainIds=${encodedChainIds}&query=${searchQuery}&limit=10`,
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
          `/tokens/search?chainIds=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&limit=10`,
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
          `/tokens/search?chainIds=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&limit=10`,
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
          `/tokens/search?chainIds=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&limit=10`,
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
          `/tokens/search?chainIds=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&limit=10`,
        )
        .reply(200, mockResponse)
        .persist();

      const results = await searchTokens([sampleCaipChainId], searchQuery);

      expect(results).toStrictEqual({ count: 0, data: [] });
    });

    it('should return empty array when no chainIds are provided', async () => {
      const searchQuery = 'USD';
      const results = await searchTokens([], searchQuery);

      expect(results).toStrictEqual({ count: 0, data: [] });
    });

    it('should handle API error responses in JSON format', async () => {
      const searchQuery = 'USD';
      const errorResponse = { error: 'Invalid search query' };
      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/search?chainIds=${encodeURIComponent(sampleCaipChainId)}&query=${searchQuery}&limit=10`,
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
          `/tokens/search?chainIds=${encodedChainIds}&query=${searchQuery}&limit=10`,
        )
        .reply(200, mockResponse)
        .persist();

      const result = await searchTokens(multiChainIds, searchQuery);

      expect(result).toStrictEqual({
        count: sampleSearchResults.length,
        data: sampleSearchResults,
      });
    });
  });
});
