import type { PerpsMarketData } from '../../../src/types';
import {
  STOCK_LIKE_MARKET_TYPES,
  getMarketTypeFilter,
  isEquityAsset,
  matchesCategory,
} from '../../../src/utils/marketUtils';

const market = (overrides: Partial<PerpsMarketData>): PerpsMarketData =>
  ({
    name: 'BTC',
    symbol: 'BTC',
    price: '50000',
    volume: '$1M',
    openInterest: '$1M',
    change24hPercent: '+1.00%',
    fundingRate: 0,
    ...overrides,
  }) as PerpsMarketData;

describe('marketUtils category classification', () => {
  describe('STOCK_LIKE_MARKET_TYPES', () => {
    it('contains the four stock-like categories', () => {
      expect([...STOCK_LIKE_MARKET_TYPES].sort()).toStrictEqual([
        'etf',
        'index',
        'pre-ipo',
        'stock',
      ]);
    });
  });

  describe('isEquityAsset', () => {
    it.each(['stock', 'pre-ipo', 'index', 'etf'])(
      'returns true for stock-like %s',
      (marketType) => {
        expect(isEquityAsset(marketType)).toBe(true);
      },
    );

    it.each(['crypto', 'commodity', 'forex', 'bond', undefined])(
      'returns false for non-equity %s',
      (marketType) => {
        expect(isEquityAsset(marketType)).toBe(false);
      },
    );
  });

  describe('matchesCategory', () => {
    it("matches every market for 'all'", () => {
      expect(matchesCategory(market({ marketType: 'etf' }), 'all')).toBe(true);
    });

    it("matches only new markets for 'new'", () => {
      expect(matchesCategory(market({ isNewMarket: true }), 'new')).toBe(true);
      expect(matchesCategory(market({ isNewMarket: false }), 'new')).toBe(
        false,
      );
    });

    it("matches non-HIP3 markets for 'crypto'", () => {
      expect(matchesCategory(market({ isHip3: false }), 'crypto')).toBe(true);
    });

    it("matches HIP-3 markets explicitly typed crypto for 'crypto'", () => {
      expect(
        matchesCategory(
          market({ isHip3: true, marketType: 'crypto' }),
          'crypto',
        ),
      ).toBe(true);
    });

    it("excludes other HIP-3 markets from 'crypto'", () => {
      expect(
        matchesCategory(market({ isHip3: true, marketType: 'etf' }), 'crypto'),
      ).toBe(false);
    });

    it.each([
      ['stock', 'stocks'],
      ['pre-ipo', 'pre-ipo'],
      ['index', 'indices'],
      ['etf', 'etfs'],
      ['commodity', 'commodities'],
      ['forex', 'forex'],
    ] as const)(
      'matches marketType %s for the granular filter %s',
      (marketType, filter) => {
        expect(matchesCategory(market({ marketType }), filter)).toBe(true);
      },
    );

    it('keeps stock-like categories distinct in the granular model', () => {
      expect(matchesCategory(market({ marketType: 'etf' }), 'stocks')).toBe(
        false,
      );
    });
  });

  describe('getMarketTypeFilter', () => {
    // HIP-3 markets carry a marketType; main-DEX crypto does not. Stock-like
    // categories collapse into the single 'stocks' filter.
    it.each([
      ['stock', 'stocks'],
      ['pre-ipo', 'stocks'],
      ['index', 'stocks'],
      ['etf', 'stocks'],
      ['commodity', 'commodities'],
      ['forex', 'forex'],
    ] as const)(
      'collapses HIP-3 marketType %s to the %s filter',
      (marketType, expected) => {
        expect(getMarketTypeFilter(market({ marketType, isHip3: true }))).toBe(
          expected,
        );
      },
    );

    it('resolves an explicit crypto marketType to crypto', () => {
      expect(getMarketTypeFilter(market({ marketType: 'crypto' }))).toBe(
        'crypto',
      );
    });

    it('resolves a main-DEX market without a marketType to crypto', () => {
      expect(
        getMarketTypeFilter(market({ marketType: undefined, isHip3: false })),
      ).toBe('crypto');
    });

    it('resolves uncategorized HIP-3 markets to the new bucket', () => {
      expect(
        getMarketTypeFilter(market({ marketType: undefined, isHip3: true })),
      ).toBe('new');
    });

    it('treats a marketSource DEX id as HIP-3 (new, not crypto) when isHip3 is unset', () => {
      expect(
        getMarketTypeFilter(
          market({
            marketType: undefined,
            isHip3: undefined,
            marketSource: 'xyz',
          }),
        ),
      ).toBe('new');
    });

    it('never returns the all sentinel', () => {
      const samples = [
        market({ marketType: 'stock', isHip3: true }),
        market({ marketType: 'commodity', isHip3: true }),
        market({ marketType: undefined, isHip3: false }),
        market({ marketType: undefined, isHip3: true }),
      ];
      samples.forEach((sample) =>
        expect(getMarketTypeFilter(sample)).not.toBe('all'),
      );
    });
  });
});
