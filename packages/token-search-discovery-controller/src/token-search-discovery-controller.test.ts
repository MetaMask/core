import { Messenger } from '@metamask/base-controller';

import { AbstractTokenDiscoveryApiService } from './token-discovery-api-service/abstract-token-discovery-api-service';
import { AbstractTokenSearchApiService } from './token-search-api-service/abstract-token-search-api-service';
import {
  getDefaultTokenSearchDiscoveryControllerState,
  TokenSearchDiscoveryController,
} from './token-search-discovery-controller';
import type { TokenSearchDiscoveryControllerMessenger } from './token-search-discovery-controller';
import type {
  TokenSearchResponseItem,
  MoralisTokenResponseItem,
} from './types';

const controllerName = 'TokenSearchDiscoveryController';

/**
 * Helper function to get a restricted messenger for testing
 *
 * @returns A restricted messenger for the TokenSearchDiscoveryController
 */
function getRestrictedMessenger() {
  const messenger = new Messenger<never, never>();
  return messenger.getRestricted({
    name: controllerName,
    allowedActions: [],
    allowedEvents: [],
  }) as TokenSearchDiscoveryControllerMessenger;
}

describe('TokenSearchDiscoveryController', () => {
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
    },
  ];

  const mockTrendingResults: MoralisTokenResponseItem[] = [
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

  class MockTokenSearchService extends AbstractTokenSearchApiService {
    async searchTokens(): Promise<TokenSearchResponseItem[]> {
      return mockSearchResults;
    }
  }

  class MockTokenDiscoveryService extends AbstractTokenDiscoveryApiService {
    async getTrendingTokensByChains(): Promise<MoralisTokenResponseItem[]> {
      return mockTrendingResults;
    }

    async getTopGainersByChains(): Promise<MoralisTokenResponseItem[]> {
      return mockTrendingResults;
    }

    async getTopLosersByChains(): Promise<MoralisTokenResponseItem[]> {
      return mockTrendingResults;
    }

    async getBlueChipTokensByChains(): Promise<MoralisTokenResponseItem[]> {
      return mockTrendingResults;
    }
  }

  let mainController: TokenSearchDiscoveryController;

  beforeEach(() => {
    mainController = new TokenSearchDiscoveryController({
      tokenSearchService: new MockTokenSearchService(),
      tokenDiscoveryService: new MockTokenDiscoveryService(),
      messenger: getRestrictedMessenger(),
    });
  });

  describe('constructor', () => {
    it('should initialize with default state', () => {
      const controller = new TokenSearchDiscoveryController({
        tokenSearchService: new MockTokenSearchService(),
        tokenDiscoveryService: new MockTokenDiscoveryService(),
        messenger: getRestrictedMessenger(),
      });

      expect(controller.state).toStrictEqual(
        getDefaultTokenSearchDiscoveryControllerState(),
      );
    });

    it('should initialize with initial state', () => {
      const initialState = {
        recentSearches: mockSearchResults,
        lastSearchTimestamp: 123,
      };

      const controller = new TokenSearchDiscoveryController({
        tokenSearchService: new MockTokenSearchService(),
        tokenDiscoveryService: new MockTokenDiscoveryService(),
        state: initialState,
        messenger: getRestrictedMessenger(),
      });

      expect(controller.state).toStrictEqual(initialState);
    });
  });

  describe('searchTokens', () => {
    it('should return search results', async () => {
      const results = await mainController.searchTokens({});
      expect(results).toStrictEqual(mockSearchResults);
    });
  });

  describe('getTrendingTokens', () => {
    it('should return trending results', async () => {
      const results = await mainController.getTrendingTokens({});
      expect(results).toStrictEqual(mockTrendingResults);
    });
  });

  describe('getTopGainers', () => {
    it('should return top gainers results', async () => {
      const results = await mainController.getTopGainers({});
      expect(results).toStrictEqual(mockTrendingResults);
    });
  });

  describe('getTopLosers', () => {
    it('should return top losers results', async () => {
      const results = await mainController.getTopLosers({});
      expect(results).toStrictEqual(mockTrendingResults);
    });
  });

  describe('getBlueChipTokens', () => {
    it('should return blue chip tokens results', async () => {
      const results = await mainController.getBlueChipTokens({});
      expect(results).toStrictEqual(mockTrendingResults);
    });
  });
  describe('error handling', () => {
    class ErrorTokenSearchService extends AbstractTokenSearchApiService {
      async searchTokens(): Promise<TokenSearchResponseItem[]> {
        return [];
      }
    }

    class ErrorTokenDiscoveryService extends AbstractTokenDiscoveryApiService {
      async getTrendingTokensByChains(): Promise<MoralisTokenResponseItem[]> {
        return [];
      }

      async getTopGainersByChains(): Promise<MoralisTokenResponseItem[]> {
        return [];
      }

      async getTopLosersByChains(): Promise<MoralisTokenResponseItem[]> {
        return [];
      }

      async getBlueChipTokensByChains(): Promise<MoralisTokenResponseItem[]> {
        return [];
      }
    }

    it('should handle search service errors', async () => {
      const errorController = new TokenSearchDiscoveryController({
        tokenSearchService: new ErrorTokenSearchService(),
        tokenDiscoveryService: new MockTokenDiscoveryService(),
        messenger: getRestrictedMessenger(),
      });

      const results = await errorController.searchTokens({});
      expect(results).toStrictEqual([]);
    });

    it('should handle discovery service errors', async () => {
      const errorController = new TokenSearchDiscoveryController({
        tokenSearchService: new MockTokenSearchService(),
        tokenDiscoveryService: new ErrorTokenDiscoveryService(),
        messenger: getRestrictedMessenger(),
      });

      const results = await errorController.getTrendingTokens({});
      expect(results).toStrictEqual([]);
    });
  });
});
