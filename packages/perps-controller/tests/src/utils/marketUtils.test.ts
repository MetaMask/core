import type { PerpsMarketData } from '../../../src/types';
import {
  getMarketTypeFilter,
  isHip3Market,
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
  describe('isHip3Market', () => {
    it('is true when isHip3 is set', () => {
      expect(isHip3Market(market({ isHip3: true }))).toBe(true);
    });

    it('is true when only marketSource is set', () => {
      expect(
        isHip3Market(market({ isHip3: undefined, marketSource: 'xyz' })),
      ).toBe(true);
    });

    it('is false for a main-DEX market', () => {
      expect(
        isHip3Market(market({ isHip3: false, marketSource: undefined })),
      ).toBe(false);
    });
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

    it("treats a marketSource-only partial market as 'new', not 'crypto'", () => {
      const partial = market({
        marketType: undefined,
        isHip3: undefined,
        isNewMarket: undefined,
        marketSource: 'xyz',
      });
      expect(matchesCategory(partial, 'crypto')).toBe(false);
      expect(matchesCategory(partial, 'new')).toBe(true);
    });

    it.each([
      ['stock', 'stock'],
      ['pre-ipo', 'pre-ipo'],
      ['index', 'index'],
      ['etf', 'etf'],
      ['commodity', 'commodity'],
      ['forex', 'forex'],
    ] as const)(
      'matches marketType %s for the aligned filter %s',
      (marketType, filter) => {
        expect(matchesCategory(market({ marketType }), filter)).toBe(true);
      },
    );
  });

  describe('getMarketTypeFilter', () => {
    // HIP-3 markets carry a marketType; main-DEX crypto does not.
    it.each([
      ['stock', 'stock'],
      ['pre-ipo', 'pre-ipo'],
      ['index', 'index'],
      ['etf', 'etf'],
      ['commodity', 'commodity'],
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

    // The resolved bucket must agree with matchesCategory.
    it.each([
      market({ marketType: 'stock', isHip3: true }),
      market({ marketType: 'pre-ipo', isHip3: true }),
      market({ marketType: 'index', isHip3: true }),
      market({ marketType: 'etf', isHip3: true }),
      market({ marketType: 'commodity', isHip3: true }),
      market({ marketType: 'forex', isHip3: true }),
      market({ marketType: undefined, isHip3: false }),
      market({ marketType: undefined, isHip3: true }),
      market({ marketType: undefined, marketSource: 'xyz' }),
    ])('is consistent with matchesCategory for %o', (sample) => {
      expect(matchesCategory(sample, getMarketTypeFilter(sample))).toBe(true);
    });
  });
});
