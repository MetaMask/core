import type { MarketType, PerpsMarketData } from '../../../src/types';
import {
  STOCK_LIKE_MARKET_TYPES,
  getMarketTypeFilter,
  isEquityAsset,
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

describe('marketUtils category helpers', () => {
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
    it.each(['stock', 'pre-ipo', 'index', 'etf'] as const)(
      'returns true for stock-like %s',
      (marketType) => {
        expect(isEquityAsset(marketType)).toBe(true);
      },
    );

    it.each(['crypto', 'commodity', 'forex'] as const)(
      'returns false for non-equity %s',
      (marketType) => {
        expect(isEquityAsset(marketType)).toBe(false);
      },
    );

    it('returns false for undefined marketType', () => {
      expect(isEquityAsset(undefined)).toBe(false);
    });

    it('returns false for an unknown marketType', () => {
      expect(isEquityAsset('bond')).toBe(false);
    });
  });

  describe('getMarketTypeFilter', () => {
    it('returns stocks for stock marketType', () => {
      expect(getMarketTypeFilter(market({ marketType: 'stock' }))).toBe(
        'stocks',
      );
    });

    it.each(['pre-ipo', 'index', 'etf'] as const)(
      'returns stocks for stock-like %s marketType',
      (marketType) => {
        expect(getMarketTypeFilter(market({ marketType }))).toBe('stocks');
      },
    );

    it('returns commodities for commodity marketType', () => {
      expect(getMarketTypeFilter(market({ marketType: 'commodity' }))).toBe(
        'commodities',
      );
    });

    it('returns forex for forex marketType', () => {
      expect(getMarketTypeFilter(market({ marketType: 'forex' }))).toBe(
        'forex',
      );
    });

    it('returns crypto for main-DEX markets without a marketType', () => {
      expect(
        getMarketTypeFilter(
          market({ marketType: undefined, isHip3: false, isNewMarket: false }),
        ),
      ).toBe('crypto');
    });

    it('returns crypto for explicit crypto marketType', () => {
      expect(getMarketTypeFilter(market({ marketType: 'crypto' }))).toBe(
        'crypto',
      );
    });

    it('returns all for new markets without a marketType', () => {
      expect(
        getMarketTypeFilter(
          market({ marketType: undefined, isNewMarket: true }),
        ),
      ).toBe('all');
    });

    it('returns all for uncategorized HIP-3 markets (not in the crypto pill)', () => {
      expect(
        getMarketTypeFilter(
          market({ marketType: undefined, isHip3: true, isNewMarket: false }),
        ),
      ).toBe('all');
    });

    it('returns all when only marketSource marks a HIP-3 market', () => {
      expect(
        getMarketTypeFilter(
          market({
            marketType: undefined,
            isHip3: undefined,
            isNewMarket: false,
            marketSource: 'xyz',
          }),
        ),
      ).toBe('all');
    });

    it('prioritizes marketType over the HIP-3 / new fallbacks', () => {
      expect(
        getMarketTypeFilter(
          market({ marketType: 'stock', isHip3: true, isNewMarket: true }),
        ),
      ).toBe('stocks');
    });

    it('treats an unknown HIP-3 category as all, never crypto', () => {
      expect(
        getMarketTypeFilter(
          market({ marketType: 'bond' as MarketType, isHip3: true }),
        ),
      ).toBe('all');
    });
  });
});
