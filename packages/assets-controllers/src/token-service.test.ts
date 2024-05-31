import { toHex } from '@metamask/controller-utils';
import nock from 'nock';

import {
  fetchTokenListByChainId,
  fetchTokenMetadata,
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

const sampleDecimalChainId = 1;
const sampleChainId = toHex(sampleDecimalChainId);

describe('Token service', () => {
  describe('fetchTokenListByChainId', () => {
    it('should call the tokens api and return the list of tokens', async () => {
      const { signal } = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(
          `/tokens/${sampleDecimalChainId}?occurrenceFloor=3&includeNativeAssets=false&includeDuplicateSymbolAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false`,
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
          `/tokens/${lineaChainId}?occurrenceFloor=1&includeNativeAssets=false&includeDuplicateSymbolAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false`,
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
          `/tokens/${sampleDecimalChainId}?occurrenceFloor=3&includeNativeAssets=false&includeDuplicateSymbolAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false`,
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
          `/tokens/${sampleDecimalChainId}?occurrenceFloor=3&includeNativeAssets=false&includeDuplicateSymbolAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false`,
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
          `/tokens/${sampleDecimalChainId}?occurrenceFloor=3&includeNativeAssets=false&includeDuplicateSymbolAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false`,
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
          `/tokens/${sampleDecimalChainId}?occurrenceFloor=3&includeNativeAssets=false&includeDuplicateSymbolAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false`,
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
});
