import nock, { cleanAll } from 'nock';

import { TokenSearchApiService } from './token-search-api-service';
import { TEST_API_URLS } from '../test/constants';
import type {
  MoralisTokenResponseItem,
  TokenSearchResponseItem,
} from '../types';

describe('TokenSearchApiService', () => {
  let service: TokenSearchApiService;
  const mockSearchResults: TokenSearchResponseItem[] = [
    {
      name: 'Test Token',
      symbol: 'TEST',
      chainId: '1',
      tokenAddress: '0x123',
      usdPrice: 100,
      usdPricePercentChange: {
        oneDay: 10,
      },
      logoUrl: 'https://example.com/logo.png',
    },
    {
      name: 'Another Token',
      symbol: 'ANOT',
      chainId: '137',
      tokenAddress: '0x456',
      usdPrice: 50,
      usdPricePercentChange: {
        oneDay: -5,
      },
      // logoUrl intentionally omitted to match API behavior
    },
  ];

  const mockFormattedResults: MoralisTokenResponseItem[] = [
    {
      token_address: '0x123',
      token_name: 'Test Token',
      token_symbol: 'TEST',
      token_logo: 'https://example.com/logo.png',
      price_usd: 100,
      chain_id: '0x1',
      token_age_in_days: 10,
      on_chain_strength_index: 10,
      security_score: 10,
      market_cap: 1000000,
      fully_diluted_valuation: 1000000,
      twitter_followers: 1000,
      holders_change: {
        '1h': 10,
        '1d': 10,
        '1w': 10,
        '1M': 10,
      },
      liquidity_change_usd: {
        '1h': 10,
        '1d': 10,
        '1w': 10,
        '1M': 10,
      },
      experienced_net_buyers_change: {
        '1h': 10,
        '1d': 10,
        '1w': 10,
        '1M': 10,
      },
      volume_change_usd: {
        '1h': 10,
        '1d': 10,
        '1w': 10,
        '1M': 10,
      },
      net_volume_change_usd: {
        '1h': 10,
        '1d': 10,
        '1w': 10,
        '1M': 10,
      },
      price_percent_change_usd: {
        '1h': 10,
        '1d': 10,
        '1w': 10,
        '1M': 10,
      },
    },
  ];

  beforeEach(() => {
    service = new TokenSearchApiService(TEST_API_URLS.BASE_URL);
  });

  afterEach(() => {
    cleanAll();
  });

  describe('constructor', () => {
    it('should throw if baseUrl is empty', () => {
      expect(() => new TokenSearchApiService('')).toThrow(
        'Portfolio API URL is not set',
      );
    });
  });

  describe('searchTokens', () => {
    it('should return search results with all parameters', async () => {
      nock(TEST_API_URLS.BASE_URL)
        .get('/tokens-search')
        .query({
          query: 'TEST',
          chains: '1,137',
          limit: '10',
        })
        .reply(200, mockSearchResults);

      const results = await service.searchTokens({
        query: 'TEST',
        chains: ['1', '137'],
        limit: '10',
      });
      expect(results).toStrictEqual(mockSearchResults);
    });

    it('should filter results by chain when only chains parameter is provided', async () => {
      const chainSpecificResults = mockSearchResults.filter(
        (token) => token.chainId === '137',
      );

      nock(TEST_API_URLS.BASE_URL)
        .get('/tokens-search')
        .query({ chains: '137' })
        .reply(200, chainSpecificResults);

      const results = await service.searchTokens({ chains: ['137'] });
      expect(results).toStrictEqual(chainSpecificResults);
    });

    it('should handle API errors', async () => {
      nock(TEST_API_URLS.BASE_URL)
        .get('/tokens-search')
        .reply(500, 'Server Error');

      await expect(service.searchTokens({})).rejects.toThrow(
        'Portfolio API request failed with status: 500',
      );
    });

    it('should handle tokens with missing logoUrl', async () => {
      const tokenWithoutLogo = {
        name: 'No Logo Token',
        symbol: 'NOLOG',
        chainId: '1',
        tokenAddress: '0x789',
        usdPrice: 75,
        usdPricePercentChange: {
          oneDay: 2,
        },
        // logoUrl intentionally omitted to match API behavior
      };

      nock(TEST_API_URLS.BASE_URL)
        .get('/tokens-search')
        .query({ query: 'NOLOG' })
        .reply(200, [tokenWithoutLogo]);

      const results = await service.searchTokens({ query: 'NOLOG' });
      expect(results).toStrictEqual([tokenWithoutLogo]);
      expect(results[0].logoUrl).toBeUndefined();
    });
  });

  describe('searchSwappableTokens', () => {
    it('should return search results with all parameters', async () => {
      nock(TEST_API_URLS.BASE_URL)
        .get('/tokens-search/swappable')
        .query({ query: 'TEST', limit: '10' })
        .reply(200, mockSearchResults);

      const results = await service.searchSwappableTokens({
        query: 'TEST',
        limit: '10',
      });
      expect(results).toStrictEqual(mockSearchResults);
    });

    it('should handle API errors', async () => {
      nock(TEST_API_URLS.BASE_URL)
        .get('/tokens-search/swappable')
        .query({ query: 'TEST', limit: '10' })
        .reply(500, 'Server Error');

      await expect(
        service.searchSwappableTokens({
          query: 'TEST',
          limit: '10',
        }),
      ).rejects.toThrow('Portfolio API request failed with status: 500');
    });
  });

  describe('searchTokensFormatted', () => {
    it('should return formatted search results', async () => {
      nock(TEST_API_URLS.BASE_URL)
        .get('/tokens-search/formatted')
        .query({ query: 'TEST', limit: '10', swappable: 'true', chains: '0x1' })
        .reply(200, mockFormattedResults);

      const results = await service.searchTokensFormatted({
        query: 'TEST',
        limit: '10',
        swappable: true,
        chains: ['0x1'],
      });
      expect(results).toStrictEqual(mockFormattedResults);
    });

    it('should handle API errors', async () => {
      nock(TEST_API_URLS.BASE_URL)
        .get('/tokens-search/formatted')
        .query({ query: 'TEST', limit: '10' })
        .reply(500, 'Server Error');

      await expect(
        service.searchTokensFormatted({
          query: 'TEST',
          limit: '10',
        }),
      ).rejects.toThrow('Portfolio API request failed with status: 500');
    });
  });
});
