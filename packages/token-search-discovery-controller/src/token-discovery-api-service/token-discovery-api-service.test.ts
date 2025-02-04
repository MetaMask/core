import nock, { cleanAll } from 'nock';

import { TokenDiscoveryApiService } from './token-discovery-api-service';
import { TEST_API_URLS } from '../test/constants';
import type { TokenTrendingResponseItem } from '../types';

describe('TokenDiscoveryApiService', () => {
  let service: TokenDiscoveryApiService;
  const mockTrendingResponse: TokenTrendingResponseItem[] = [
    {
      chain_id: '1',
      token_address: '0x123',
      token_logo: 'https://example.com/logo.png',
      token_name: 'Test Token',
      token_symbol: 'TEST',
      price_usd: 100,
      token_age_in_days: 365,
      on_chain_strength_index: 85,
      security_score: 90,
      market_cap: 1000000,
      fully_diluted_valuation: 2000000,
      twitter_followers: 50000,
      holders_change: {
        '1h': 10,
        '1d': 100,
        '1w': 1000,
        '1M': 10000,
      },
      liquidity_change_usd: {
        '1h': 1000,
        '1d': 10000,
        '1w': 100000,
        '1M': 1000000,
      },
      experienced_net_buyers_change: {
        '1h': 5,
        '1d': 50,
        '1w': 500,
        '1M': 5000,
      },
      volume_change_usd: {
        '1h': 10000,
        '1d': 100000,
        '1w': 1000000,
        '1M': 10000000,
      },
      net_volume_change_usd: {
        '1h': 5000,
        '1d': 50000,
        '1w': 500000,
        '1M': 5000000,
      },
      price_percent_change_usd: {
        '1h': 1,
        '1d': 10,
        '1w': 20,
        '1M': 30,
      },
    },
  ];

  beforeEach(() => {
    service = new TokenDiscoveryApiService(TEST_API_URLS.PORTFOLIO_API);
  });

  afterEach(() => {
    cleanAll();
  });

  describe('constructor', () => {
    it('should throw if baseUrl is empty', () => {
      expect(() => new TokenDiscoveryApiService('')).toThrow(
        'Portfolio API URL is not set',
      );
    });
  });

  describe('getTrendingTokensByChains', () => {
    it.each([
      {
        params: { chains: ['1'], limit: '5' },
        expectedPath: '/tokens-search/trending-by-chains?chains=1&limit=5',
      },
      {
        params: { chains: ['1', '137'] },
        expectedPath: '/tokens-search/trending-by-chains?chains=1,137',
      },
      {
        params: { limit: '10' },
        expectedPath: '/tokens-search/trending-by-chains?limit=10',
      },
      {
        params: {},
        expectedPath: '/tokens-search/trending-by-chains',
      },
    ])(
      'should construct correct URL for params: $params',
      async ({ params, expectedPath }) => {
        nock(TEST_API_URLS.PORTFOLIO_API)
          .get(expectedPath)
          .reply(200, mockTrendingResponse);

        const result = await service.getTrendingTokensByChains(params);
        expect(result).toStrictEqual(mockTrendingResponse);
      },
    );

    it('should handle API errors', async () => {
      nock(TEST_API_URLS.PORTFOLIO_API)
        .get('/tokens-search/trending-by-chains')
        .reply(500, 'Server Error');

      await expect(service.getTrendingTokensByChains({})).rejects.toThrow(
        'Portfolio API request failed with status: 500',
      );
    });

    it('should return trending results', async () => {
      nock(TEST_API_URLS.PORTFOLIO_API)
        .get('/tokens-search/trending-by-chains')
        .reply(200, mockTrendingResponse);

      const results = await service.getTrendingTokensByChains({});
      expect(results).toStrictEqual(mockTrendingResponse);
    });
  });
});
