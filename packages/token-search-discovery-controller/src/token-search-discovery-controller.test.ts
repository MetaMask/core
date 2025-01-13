import { ControllerMessenger } from '@metamask/base-controller';
import {
  TokenSearchDiscoveryController,
  TOKENSEARCH_EVENTS,
  TokenSearchDiscoveryControllerMessenger,
} from './token-search-discovery-controller';
import type { TokenSearchResponseItem } from './types';

const name = 'TokenSearchDiscoveryController';

type Events = {
  type: (typeof TOKENSEARCH_EVENTS)[keyof typeof TOKENSEARCH_EVENTS];
  payload: [TokenSearchResponseItem[]];
};

function getRestrictedMessenger() {
  const controllerMessenger = new ControllerMessenger<never, Events>();
  return controllerMessenger.getRestricted({
    name,
    allowedActions: [],
    allowedEvents: [TOKENSEARCH_EVENTS.SEARCH_COMPLETED],
  }) as TokenSearchDiscoveryControllerMessenger;
}

describe('TokenSearchDiscoveryController', () => {
  const mockPortfolioApiUrl = 'https://portfolio.dev-api.cx.metamask.io';
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

  beforeEach(() => {
    global.fetch = jest.fn();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default state', () => {
      const controller = new TokenSearchDiscoveryController({
        portfolioApiUrl: mockPortfolioApiUrl,
        messenger: getRestrictedMessenger(),
      });

      expect(controller.state).toStrictEqual({
        recentSearches: [],
        lastSearchTimestamp: null,
      });
    });

    it('should throw if portfolioApiUrl is not provided', () => {
      expect(
        () =>
          new TokenSearchDiscoveryController({
            portfolioApiUrl: '',
            messenger: getRestrictedMessenger(),
          }),
      ).toThrow('Portfolio API URL is not set');
    });

    it('should initialize with initial state', () => {
      const initialState = {
        recentSearches: mockSearchResults,
        lastSearchTimestamp: 123,
      };

      const controller = new TokenSearchDiscoveryController({
        portfolioApiUrl: mockPortfolioApiUrl,
        initialState,
        messenger: getRestrictedMessenger(),
      });

      expect(controller.state).toStrictEqual(initialState);
    });
  });

  describe('searchTokens', () => {
    it('should fetch tokens and update state', async () => {
      const controller = new TokenSearchDiscoveryController({
        portfolioApiUrl: mockPortfolioApiUrl,
        messenger: getRestrictedMessenger(),
      });

      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResults),
        }),
      );

      const timestamp = Date.now();
      jest.setSystemTime(timestamp);

      const results = await controller.searchTokens(['1'], 'TEST', '10');

      expect(results).toEqual(mockSearchResults);
      expect(controller.state).toStrictEqual({
        recentSearches: mockSearchResults,
        lastSearchTimestamp: timestamp,
      });
      expect(fetch).toHaveBeenCalledWith(
        `${mockPortfolioApiUrl}/tokens-search/name?chains=1&name=TEST&limit=10`,
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      );
    });

    it('should handle empty parameters', async () => {
      const controller = new TokenSearchDiscoveryController({
        portfolioApiUrl: mockPortfolioApiUrl,
        messenger: getRestrictedMessenger(),
      });

      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResults),
        }),
      );

      await controller.searchTokens();

      expect(fetch).toHaveBeenCalledWith(
        `${mockPortfolioApiUrl}/tokens-search/name?`,
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      );
    });

    it('should handle API errors', async () => {
      const controller = new TokenSearchDiscoveryController({
        portfolioApiUrl: mockPortfolioApiUrl,
        messenger: getRestrictedMessenger(),
      });

      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 500,
        }),
      );

      await expect(controller.searchTokens()).rejects.toThrow(
        'Portfolio API request failed with status: 500',
      );
      expect(controller.state.recentSearches).toEqual([]);
    });
  });

  describe('clearRecentSearches', () => {
    it('should clear recent searches from state', () => {
      const controller = new TokenSearchDiscoveryController({
        portfolioApiUrl: mockPortfolioApiUrl,
        initialState: {
          recentSearches: mockSearchResults,
          lastSearchTimestamp: 123,
        },
        messenger: getRestrictedMessenger(),
      });

      controller.clearRecentSearches();

      expect(controller.state).toStrictEqual({
        recentSearches: [],
        lastSearchTimestamp: null,
      });
    });
  });
});
