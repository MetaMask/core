import type { PerpsMarketData } from '../../../src/types';
import {
  getMarketTypeFilter,
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
    ] as const)('matches marketType %s for filter %s', (marketType, filter) => {
      expect(matchesCategory(market({ marketType }), filter)).toBe(true);
    });

    it('keeps stock-like categories distinct (stock !== etf filter)', () => {
      expect(matchesCategory(market({ marketType: 'stock' }), 'etfs')).toBe(
        false,
      );
      expect(matchesCategory(market({ marketType: 'etf' }), 'stocks')).toBe(
        false,
      );
    });
  });

  describe('getMarketTypeFilter', () => {
    // HIP-3 markets carry a marketType; main-DEX crypto does not.
    it.each([
      ['stock', 'stocks'],
      ['pre-ipo', 'pre-ipo'],
      ['index', 'indices'],
      ['etf', 'etfs'],
      ['commodity', 'commodities'],
      ['forex', 'forex'],
    ] as const)(
      'resolves HIP-3 marketType %s to the %s filter',
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

    it('falls back to all for uncategorized HIP-3 markets', () => {
      expect(
        getMarketTypeFilter(
          market({ marketType: undefined, isHip3: true, isNewMarket: false }),
        ),
      ).toBe('all');
    });

    it('falls back to all for new markets without a marketType', () => {
      expect(
        getMarketTypeFilter(
          market({ marketType: undefined, isHip3: true, isNewMarket: true }),
        ),
      ).toBe('all');
    });

    it('is the inverse of matchesCategory for the resolved filter', () => {
      const etfMarket = market({ marketType: 'etf', isHip3: true });
      const filter = getMarketTypeFilter(etfMarket);
      expect(filter).toBe('etfs');
      expect(matchesCategory(etfMarket, filter)).toBe(true);
    });
  });
});
