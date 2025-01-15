import { ControllerMessenger } from '@metamask/base-controller';
import {
  getDefaultTokenSearchDiscoveryControllerState,
  TokenSearchDiscoveryController,
} from './token-search-discovery-controller';
import type { TokenSearchDiscoveryControllerMessenger } from './token-search-discovery-controller';
import type { TokenSearchResponseItem } from './types';
import { AbstractTokenSearchApiService } from './token-search-api-service/abstract-token-search-api-service';

const controllerName = 'TokenSearchDiscoveryController';

/**
 * Helper function to get a restricted messenger for testing
 * @returns A restricted messenger for the TokenSearchDiscoveryController
 */
function getRestrictedMessenger() {
  const controllerMessenger = new ControllerMessenger<never, never>();
  return controllerMessenger.getRestricted({
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

  class MockTokenSearchService extends AbstractTokenSearchApiService {
    async searchTokens(): Promise<TokenSearchResponseItem[]> {
      return mockSearchResults;
    }
  }

  describe('constructor', () => {
    it('should initialize with default state', () => {
      const controller = new TokenSearchDiscoveryController({
        tokenSearchService: new MockTokenSearchService(),
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
        state: initialState,
        messenger: getRestrictedMessenger(),
      });

      expect(controller.state).toStrictEqual(initialState);
    });

    it('should merge to complete state', () => {
      const partialState = {
        recentSearches: mockSearchResults,
      };

      const controller = new TokenSearchDiscoveryController({
        tokenSearchService: new MockTokenSearchService(),
        state: partialState,
        messenger: getRestrictedMessenger(),
      });

      expect(controller.state).toStrictEqual({
        ...getDefaultTokenSearchDiscoveryControllerState(),
        ...partialState,
      });
    });
  });

  describe('searchTokens', () => {
    it('should update state with search results', async () => {
      const mockService = new MockTokenSearchService();
      const controller = new TokenSearchDiscoveryController({
        tokenSearchService: mockService,
        messenger: getRestrictedMessenger(),
      });

      const response = await controller.searchTokens({
        chains: ['1'],
        name: 'Test',
      });

      expect(response).toStrictEqual(mockSearchResults);
      expect(controller.state.recentSearches).toStrictEqual(mockSearchResults);
      expect(controller.state.lastSearchTimestamp).toBeDefined();
    });
  });
});
