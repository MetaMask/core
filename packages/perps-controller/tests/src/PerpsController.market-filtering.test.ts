import { jest } from '@jest/globals';
/**
 * Tests for PerpsController market filtering, sorting, and pagination:
 * - getMarketCategories()
 * - getMarketDataWithPrices({ categories, sortBy, direction, limit })
 */
/* eslint-disable */

import {
  PerpsController,
  getDefaultPerpsControllerState,
  InitializationState,
} from '../../src/PerpsController';
import { HyperLiquidProvider } from '../../src/providers/HyperLiquidProvider';
import type {
  PerpsProvider,
  PerpsProviderType,
  PerpsPlatformDependencies,
  PerpsMarketData,
} from '../../src/types';
import { MARKET_CATEGORIES, MarketCategory } from '../../src/types';
import { createMockHyperLiquidProvider } from '../helpers/providerMocks';
import {
  createMockInfrastructure,
  createMockMessenger,
} from '../helpers/serviceMocks';

jest.mock('@nktkas/hyperliquid', () => ({}));
jest.mock('@myx-trade/sdk', () => ({
  MyxClient: jest.fn(),
  OrderStatusEnum: { Successful: 9 },
}));

jest.mock(
  '../../../core/Engine',
  () => ({
    __esModule: true,
    default: {
      context: {
        RewardsController: { getPerpsDiscountForAccount: jest.fn() },
        NetworkController: {
          getNetworkClientById: jest.fn().mockReturnValue({
            configuration: { chainId: '0x1' },
          }),
        },
        AccountTreeController: {
          getAccountsFromSelectedAccountGroup: jest.fn().mockReturnValue([]),
        },
        TransactionController: {
          estimateGasFee: jest.fn(),
          estimateGas: jest.fn(),
        },
        AccountTrackerController: {
          state: { accountsByChainId: {} },
        },
      },
    },
  }),
  { virtual: true },
);

jest.mock('../../src/providers/HyperLiquidProvider');
jest.mock('../../src/providers/MYXProvider');

jest.mock('../../src/utils/wait', () => ({
  wait: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/EligibilityService', () => ({
  EligibilityService: jest.fn().mockImplementation(() => ({
    checkAndUpdateEligibility: jest
      .fn()
      .mockResolvedValue({ isEligible: true }),
    isCurrentlyEligible: jest.fn().mockReturnValue(true),
    subscribeToEligibilityChanges: jest.fn().mockReturnValue(() => undefined),
  })),
}));

/** Expose protected methods for testing. */
class TestablePerpsController extends PerpsController {
  public testMarkInitialized() {
    this.isInitialized = true;
    this.update((state) => {
      state.initializationState = InitializationState.Initialized;
    });
  }

  public testSetProviders(providers: Map<PerpsProviderType, PerpsProvider>) {
    this.providers = providers;
    const firstProvider = providers.values().next().value;
    if (firstProvider) {
      this.activeProviderInstance = firstProvider;
    }
  }
}

/** Build a minimal PerpsMarketData object. */
function buildMarket(
  overrides: Partial<PerpsMarketData> = {},
): PerpsMarketData {
  return {
    symbol: 'TEST',
    name: 'Test Market',
    maxLeverage: '10x',
    price: '$100.00',
    change24h: '$0.00',
    change24hPercent: '0%',
    volume: '$1M',
    ...overrides,
  };
}

describe('PerpsController — market categories & filtering', () => {
  let controller: TestablePerpsController;
  let mockProvider: jest.Mocked<HyperLiquidProvider>;
  let mockInfrastructure: jest.Mocked<PerpsPlatformDependencies>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockProvider = createMockHyperLiquidProvider();
    mockInfrastructure = createMockInfrastructure();

    const mockCall = jest.fn().mockReturnValue(undefined);

    controller = new TestablePerpsController({
      messenger: createMockMessenger({ call: mockCall }),
      state: getDefaultPerpsControllerState(),
      infrastructure: mockInfrastructure,
    });

    controller.testSetProviders(
      new Map([['hyperliquid', mockProvider as unknown as PerpsProvider]]),
    );
    controller.testMarkInitialized();
  });

  // ============================================================================
  // getMarketCategories
  // ============================================================================

  describe('getMarketCategories', () => {
    it('returns the MARKET_CATEGORIES constant', () => {
      expect(controller.getMarketCategories()).toStrictEqual(MARKET_CATEGORIES);
    });

    it('does not include the all or new sentinel values', () => {
      const categories = controller.getMarketCategories();
      expect(categories).not.toContain('all');
      expect(categories).not.toContain('new');
    });

    it('includes all 7 data categories', () => {
      const categories = controller.getMarketCategories();
      expect(categories).toContain('crypto');
      expect(categories).toContain('stock');
      expect(categories).toContain('pre-ipo');
      expect(categories).toContain('index');
      expect(categories).toContain('etf');
      expect(categories).toContain('commodity');
      expect(categories).toContain('forex');
    });
  });

  // ============================================================================
  // getMarketDataWithPrices — category filtering
  // ============================================================================

  describe('getMarketDataWithPrices — category filtering', () => {
    it('returns unfiltered results when no params are provided', async () => {
      const markets = [
        buildMarket({ symbol: 'BTC', isHip3: false }),
        buildMarket({
          symbol: 'xyz:TSLA',
          isHip3: true,
          marketType: MarketCategory.Stock,
        }),
      ];
      mockProvider.getMarketDataWithPrices.mockResolvedValue(markets);

      const result = await controller.getMarketDataWithPrices();

      expect(result).toHaveLength(2);
    });

    it('filters to only crypto markets when categories is ["crypto"]', async () => {
      const markets = [
        buildMarket({ symbol: 'BTC', isHip3: false }),
        buildMarket({ symbol: 'ETH', isHip3: false }),
        buildMarket({
          symbol: 'xyz:CRYPTO1',
          isHip3: true,
          marketType: MarketCategory.CryptoCurrency,
        }),
        buildMarket({
          symbol: 'xyz:TSLA',
          isHip3: true,
          marketType: MarketCategory.Stock,
        }),
      ];
      mockProvider.getMarketDataWithPrices.mockResolvedValue(markets);

      const result = await controller.getMarketDataWithPrices({
        categories: ['crypto'],
      });

      // Non-HIP3 markets + HIP-3 assets explicitly typed CryptoCurrency; excludes Stock
      expect(result).toHaveLength(3);
      const symbols = result.map((m) => m.symbol);
      expect(symbols).toContain('BTC');
      expect(symbols).toContain('ETH');
      expect(symbols).toContain('xyz:CRYPTO1');
      expect(symbols).not.toContain('xyz:TSLA');
    });

    it('filters to only stock markets when categories is ["stock"]', async () => {
      const markets = [
        buildMarket({ symbol: 'BTC', isHip3: false }),
        buildMarket({
          symbol: 'xyz:TSLA',
          isHip3: true,
          marketType: MarketCategory.Stock,
        }),
        buildMarket({
          symbol: 'xyz:NVDA',
          isHip3: true,
          marketType: MarketCategory.Stock,
        }),
        buildMarket({
          symbol: 'xyz:EUR',
          isHip3: true,
          marketType: MarketCategory.Forex,
        }),
      ];
      mockProvider.getMarketDataWithPrices.mockResolvedValue(markets);

      const result = await controller.getMarketDataWithPrices({
        categories: ['stock'],
      });

      expect(result).toHaveLength(2);
      expect(result.every((m) => m.marketType === MarketCategory.Stock)).toBe(
        true,
      );
    });

    it('returns the union of matched markets when multiple categories are given', async () => {
      const markets = [
        buildMarket({ symbol: 'BTC', isHip3: false }),
        buildMarket({
          symbol: 'xyz:TSLA',
          isHip3: true,
          marketType: MarketCategory.Stock,
        }),
        buildMarket({
          symbol: 'xyz:SPY',
          isHip3: true,
          marketType: MarketCategory.Etf,
        }),
        buildMarket({
          symbol: 'xyz:EUR',
          isHip3: true,
          marketType: MarketCategory.Forex,
        }),
      ];
      mockProvider.getMarketDataWithPrices.mockResolvedValue(markets);

      const result = await controller.getMarketDataWithPrices({
        categories: ['stock', 'etf'],
      });

      expect(result).toHaveLength(2);
      const symbols = result.map((m) => m.symbol);
      expect(symbols).toContain('xyz:TSLA');
      expect(symbols).toContain('xyz:SPY');
    });

    it('returns all markets when categories contains "all"', async () => {
      const markets = [
        buildMarket({ symbol: 'BTC', isHip3: false }),
        buildMarket({
          symbol: 'xyz:TSLA',
          isHip3: true,
          marketType: MarketCategory.Stock,
        }),
      ];
      mockProvider.getMarketDataWithPrices.mockResolvedValue(markets);

      const result = await controller.getMarketDataWithPrices({
        categories: ['all'],
      });

      expect(result).toHaveLength(2);
    });

    it('filters to isNewMarket markets when categories is ["new"]', async () => {
      const markets = [
        buildMarket({ symbol: 'BTC', isNewMarket: false }),
        buildMarket({
          symbol: 'xyz:NEWTOKEN',
          isHip3: true,
          isNewMarket: true,
        }),
      ];
      mockProvider.getMarketDataWithPrices.mockResolvedValue(markets);

      const result = await controller.getMarketDataWithPrices({
        categories: ['new'],
      });

      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('xyz:NEWTOKEN');
    });

    it('returns empty array when no markets match the given categories', async () => {
      const markets = [buildMarket({ symbol: 'BTC', isHip3: false })];
      mockProvider.getMarketDataWithPrices.mockResolvedValue(markets);

      const result = await controller.getMarketDataWithPrices({
        categories: ['forex'],
      });

      expect(result).toHaveLength(0);
    });
  });

  // ============================================================================
  // getMarketDataWithPrices — excludeSymbols
  // ============================================================================

  describe('getMarketDataWithPrices — excludeSymbols', () => {
    it('excludes a single symbol from results', async () => {
      const markets = [
        buildMarket({ symbol: 'BTC' }),
        buildMarket({ symbol: 'ETH' }),
        buildMarket({ symbol: 'SOL' }),
      ];
      mockProvider.getMarketDataWithPrices.mockResolvedValue(markets);

      const result = await controller.getMarketDataWithPrices({
        excludeSymbols: ['ETH'],
      });

      expect(result.map((m) => m.symbol)).toStrictEqual(['BTC', 'SOL']);
    });

    it('excludes multiple symbols from results', async () => {
      const markets = [
        buildMarket({ symbol: 'BTC' }),
        buildMarket({ symbol: 'ETH' }),
        buildMarket({ symbol: 'SOL' }),
        buildMarket({ symbol: 'AVAX' }),
      ];
      mockProvider.getMarketDataWithPrices.mockResolvedValue(markets);

      const result = await controller.getMarketDataWithPrices({
        excludeSymbols: ['ETH', 'SOL'],
      });

      expect(result.map((m) => m.symbol)).toStrictEqual(['BTC', 'AVAX']);
    });

    it('applies excludeSymbols after category filter and before limit', async () => {
      const markets = [
        buildMarket({ symbol: 'BTC', isHip3: false }),
        buildMarket({ symbol: 'ETH', isHip3: false }),
        buildMarket({ symbol: 'SOL', isHip3: false }),
        buildMarket({
          symbol: 'xyz:TSLA',
          isHip3: true,
          marketType: MarketCategory.Stock,
        }),
      ];
      mockProvider.getMarketDataWithPrices.mockResolvedValue(markets);

      const result = await controller.getMarketDataWithPrices({
        categories: ['crypto'],
        excludeSymbols: ['ETH'],
        limit: 10,
      });

      // Stock excluded by category, ETH excluded by excludeSymbols
      expect(result.map((m) => m.symbol)).toStrictEqual(['BTC', 'SOL']);
    });
  });

  // ============================================================================
  // getMarketDataWithPrices — sorting
  // ============================================================================

  describe('getMarketDataWithPrices — sorting', () => {
    it('sorts by openInterest descending when sortBy is "openInterest"', async () => {
      const markets = [
        buildMarket({ symbol: 'LOW', openInterest: '$1M' }),
        buildMarket({ symbol: 'HIGH', openInterest: '$5M' }),
        buildMarket({ symbol: 'MID', openInterest: '$3M' }),
      ];
      mockProvider.getMarketDataWithPrices.mockResolvedValue(markets);

      const result = await controller.getMarketDataWithPrices({
        sortBy: 'openInterest',
        direction: 'desc',
      });

      expect(result[0].symbol).toBe('HIGH');
      expect(result[1].symbol).toBe('MID');
      expect(result[2].symbol).toBe('LOW');
    });

    it('sorts by openInterest ascending when direction is "asc"', async () => {
      const markets = [
        buildMarket({ symbol: 'HIGH', openInterest: '$5M' }),
        buildMarket({ symbol: 'LOW', openInterest: '$1M' }),
      ];
      mockProvider.getMarketDataWithPrices.mockResolvedValue(markets);

      const result = await controller.getMarketDataWithPrices({
        sortBy: 'openInterest',
        direction: 'asc',
      });

      expect(result[0].symbol).toBe('LOW');
      expect(result[1].symbol).toBe('HIGH');
    });
  });

  // ============================================================================
  // getMarketDataWithPrices — limit
  // ============================================================================

  describe('getMarketDataWithPrices — limit', () => {
    it('returns at most `limit` markets', async () => {
      const markets = Array.from({ length: 10 }, (_, i) =>
        buildMarket({ symbol: `MARKET${i}` }),
      );
      mockProvider.getMarketDataWithPrices.mockResolvedValue(markets);

      const result = await controller.getMarketDataWithPrices({ limit: 3 });

      expect(result).toHaveLength(3);
    });

    it('returns all markets when limit exceeds total count', async () => {
      const markets = [
        buildMarket({ symbol: 'A' }),
        buildMarket({ symbol: 'B' }),
      ];
      mockProvider.getMarketDataWithPrices.mockResolvedValue(markets);

      const result = await controller.getMarketDataWithPrices({ limit: 100 });

      expect(result).toHaveLength(2);
    });
  });

  // ============================================================================
  // getMarketDataWithPrices — params compose together
  // ============================================================================

  describe('getMarketDataWithPrices — composed params', () => {
    it('applies categories filter, then sort, then limit in order', async () => {
      const markets = [
        buildMarket({
          symbol: 'xyz:TSLA',
          isHip3: true,
          marketType: MarketCategory.Stock,
          openInterest: '$5M',
        }),
        buildMarket({
          symbol: 'xyz:NVDA',
          isHip3: true,
          marketType: MarketCategory.Stock,
          openInterest: '$3M',
        }),
        buildMarket({
          symbol: 'xyz:AAPL',
          isHip3: true,
          marketType: MarketCategory.Stock,
          openInterest: '$8M',
        }),
        buildMarket({ symbol: 'BTC', isHip3: false, openInterest: '$100M' }),
      ];
      mockProvider.getMarketDataWithPrices.mockResolvedValue(markets);

      const result = await controller.getMarketDataWithPrices({
        categories: ['stock'],
        sortBy: 'openInterest',
        direction: 'desc',
        limit: 2,
      });

      // Only stocks, sorted by OI desc, top 2
      expect(result).toHaveLength(2);
      expect(result[0].symbol).toBe('xyz:AAPL'); // $8M
      expect(result[1].symbol).toBe('xyz:TSLA'); // $5M
    });
  });
});
