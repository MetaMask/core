import { describe, expect, it } from 'vitest';

import {
  groupMarketsByMarketKey,
  resolveSavedPerpsMarkets,
} from '../../../src/index.js';
import type { PerpsMarketData } from '../../../src/types/index.js';
import {
  getMarketTypeFilter,
  getPerpsWatchlistReferences,
  isHip3Market,
  matchesCategory,
} from '../../../src/utils/marketUtils.js';

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

describe('groupMarketsByMarketKey', () => {
  const hyperliquid = market({
    symbol: 'xyz:TSLA',
    providerId: 'hyperliquid',
    marketKey: 'xyz:TSLA',
    priceScale: 1,
  });
  const lighter = market({
    symbol: 'TSLA',
    providerId: 'lighter',
    marketKey: 'xyz:TSLA',
    priceScale: 1,
    price: '510',
  });

  it('keeps the default venue’s data first and retains both venue symbols', () => {
    expect(
      groupMarketsByMarketKey([hyperliquid, lighter], 'lighter'),
    ).toStrictEqual([
      {
        ...lighter,
        rowId: 'market:xyz:TSLA',
        venues: [lighter, hyperliquid],
      },
    ]);
  });

  it('keeps missing keys and scaled prices separate even when keys would match', () => {
    const unmapped = market({ symbol: 'xyz:TSLA', providerId: 'hyperliquid' });
    const scaled = market({
      ...hyperliquid,
      symbol: '1000TSLA',
      priceScale: 1000,
    });
    const lighterFallback = market({ symbol: 'TSLA', providerId: 'lighter' });
    expect(
      groupMarketsByMarketKey(
        [unmapped, scaled, lighter, lighterFallback],
        'lighter',
      ),
    ).toStrictEqual([
      {
        ...unmapped,
        marketKey: 'xyz:TSLA',
        rowId: 'venue:hyperliquid:xyz:TSLA',
        venues: [unmapped],
      },
      {
        ...scaled,
        marketKey: '1000TSLA',
        rowId: 'venue:hyperliquid:1000TSLA',
        venues: [scaled],
      },
      { ...lighter, rowId: 'market:xyz:TSLA', venues: [lighter] },
      {
        ...lighterFallback,
        marketKey: 'lighter:TSLA',
        rowId: 'venue:lighter:TSLA',
        venues: [lighterFallback],
      },
    ]);
  });

  it('resolves legacy symbols to their original venue and new keys to the preferred venue', () => {
    const lighterOnly = market({ symbol: 'OPENAI', providerId: 'lighter' });
    const renamed = market({
      ...lighter,
      symbol: 'XAU',
      marketKey: 'xyz:GOLD',
    });
    expect(
      resolveSavedPerpsMarkets(
        ['xyz:TSLA', 'market-key:xyz:GOLD', 'UNKNOWN'],
        [lighter, hyperliquid, lighterOnly, renamed],
        'lighter',
      ),
    ).toStrictEqual([hyperliquid, renamed]);
    expect(
      resolveSavedPerpsMarkets(
        ['OPENAI'],
        [lighterOnly],
        'hyperliquid',
        'lighter',
      ),
    ).toStrictEqual([lighterOnly]);
  });

  it('keeps a keyed row with unknown scale out of both grouping and key resolution', () => {
    const unknown = market({ ...lighter, priceScale: undefined });

    expect(
      groupMarketsByMarketKey([hyperliquid, unknown], 'lighter'),
    ).toStrictEqual([
      { ...hyperliquid, rowId: 'market:xyz:TSLA', venues: [hyperliquid] },
      {
        ...unknown,
        marketKey: 'lighter:TSLA',
        rowId: 'venue:lighter:TSLA',
        venues: [unknown],
      },
    ]);
    expect(
      resolveSavedPerpsMarkets(
        ['market-key:xyz:TSLA'],
        [unknown, hyperliquid],
        'lighter',
      ),
    ).toStrictEqual([hyperliquid]);
    expect(
      resolveSavedPerpsMarkets(
        ['market-key:xyz:TSLA'],
        [{ ...hyperliquid, priceScale: undefined }],
        'hyperliquid',
      ),
    ).toStrictEqual([]);
  });

  it('leaves a legacy favorite unresolved when only a different venue has the symbol', () => {
    const lighterBtc = market({
      symbol: 'BTC',
      providerId: 'lighter',
      marketKey: 'BTC',
      priceScale: 1,
    });
    expect(
      resolveSavedPerpsMarkets(['BTC'], [lighterBtc], 'lighter', 'hyperliquid'),
    ).toStrictEqual([]);
  });

  it('requires actual HyperLiquid provenance for a legacy alias even with HyperLiquid preferred', () => {
    const [group] = groupMarketsByMarketKey(
      [{ ...lighter, providerId: undefined }],
      'hyperliquid',
    );
    expect(group.venues[0].providerId).toBeUndefined();
    expect(
      getPerpsWatchlistReferences(group.symbol, group.marketKey, group.venues),
    ).toStrictEqual(['market-key:xyz:TSLA']);
  });

  it('does not interpret a legacy symbol as an unrelated backend key', () => {
    const unrelated = market({
      symbol: 'X',
      providerId: 'hyperliquid',
      marketKey: 'BTC',
      priceScale: 1,
    });
    expect(
      resolveSavedPerpsMarkets(['BTC'], [unrelated], 'hyperliquid'),
    ).toStrictEqual([]);
  });
});

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

    it('honors the explicit stock category on a non-HIP3 Lighter market', () => {
      const stock = market({ providerId: 'lighter', marketType: 'stock' });
      expect(matchesCategory(stock, 'stock')).toBe(true);
      expect(matchesCategory(stock, 'crypto')).toBe(false);
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

    describe("'memecoin' filter", () => {
      it('matches a crypto market carrying the memecoin tag', () => {
        expect(
          matchesCategory(
            market({ marketType: 'crypto', tags: ['memecoin'] }),
            'memecoin',
          ),
        ).toBe(true);
      });

      it('matches a main-DEX market with unset marketType and the memecoin tag', () => {
        // Common provider-sourced shape: main-DEX markets often have
        // marketType undefined until Terminal enrichment applies it. The
        // memecoin filter must still surface them, mirroring the 'crypto'
        // case above.
        expect(
          matchesCategory(
            market({
              isHip3: false,
              marketType: undefined,
              tags: ['memecoin'],
            }),
            'memecoin',
          ),
        ).toBe(true);
      });

      it('still matches crypto for a memecoin (overlapping by design)', () => {
        expect(
          matchesCategory(
            market({ marketType: 'crypto', tags: ['memecoin'] }),
            'crypto',
          ),
        ).toBe(true);
      });

      it('does not match crypto without the memecoin tag', () => {
        expect(
          matchesCategory(
            market({ marketType: 'crypto', tags: ['top-100'] }),
            'memecoin',
          ),
        ).toBe(false);
      });

      it('does not match a crypto market with no tags', () => {
        expect(
          matchesCategory(market({ marketType: 'crypto' }), 'memecoin'),
        ).toBe(false);
      });

      it('does not match non-crypto HIP-3 markets even with the memecoin tag', () => {
        expect(
          matchesCategory(
            market({
              isHip3: true,
              marketType: 'stock',
              tags: ['memecoin'],
            }),
            'memecoin',
          ),
        ).toBe(false);
      });

      it('does not match a marketSource-only HIP-3 market with the memecoin tag', () => {
        // isHip3Market also treats markets with only a marketSource DEX id
        // as HIP-3, so those shouldn't leak into the memecoin filter
        // either.
        expect(
          matchesCategory(
            market({
              isHip3: undefined,
              marketSource: 'xyz',
              tags: ['memecoin'],
            }),
            'memecoin',
          ),
        ).toBe(false);
      });
    });
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
