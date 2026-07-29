import { HIP3_ASSET_MARKET_TYPES } from '../../../src/constants/hyperLiquidConfig.js';
import { MarketCategory, MARKET_CATEGORIES } from '../../../src/types/index.js';
import type { MarketType, MarketTypeFilter } from '../../../src/types/index.js';

describe('HIP3_ASSET_MARKET_TYPES', () => {
  it('classifies known US stocks correctly', () => {
    expect(HIP3_ASSET_MARKET_TYPES['xyz:TSLA']).toBe('stock');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:NVDA']).toBe('stock');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:AAPL']).toBe('stock');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:GOOGL']).toBe('stock');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:AMZN']).toBe('stock');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:META']).toBe('stock');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:MSFT']).toBe('stock');
  });

  it('classifies newly added US stocks correctly', () => {
    expect(HIP3_ASSET_MARKET_TYPES['xyz:DKNG']).toBe('stock');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:BIRD']).toBe('stock');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:RKLB']).toBe('stock');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:MRVL']).toBe('stock');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:ZM']).toBe('stock');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:EBAY']).toBe('stock');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:PURRDAT']).toBe('stock');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:ARM']).toBe('stock');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:BX']).toBe('stock');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:LITE']).toBe('stock');
  });

  it('classifies USAR as stock (USA Rare Earth)', () => {
    expect(HIP3_ASSET_MARKET_TYPES['xyz:USAR']).toBe('stock');
  });

  it('classifies Korean stocks correctly', () => {
    expect(HIP3_ASSET_MARKET_TYPES['xyz:SKHX']).toBe('stock');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:SMSN']).toBe('stock');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:HYUNDAI']).toBe('stock');
  });

  it('classifies pre-IPO markets correctly', () => {
    expect(HIP3_ASSET_MARKET_TYPES['xyz:CBRS']).toBe('pre-ipo');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:SPCX']).toBe('pre-ipo');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:IPOP']).toBe('pre-ipo');
  });

  it('classifies known indices correctly', () => {
    expect(HIP3_ASSET_MARKET_TYPES['xyz:SP500']).toBe('index');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:XYZ100']).toBe('index');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:JP225']).toBe('index');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:KR200']).toBe('index');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:VIX']).toBe('index');
  });

  it('classifies known ETFs correctly', () => {
    expect(HIP3_ASSET_MARKET_TYPES['xyz:EWY']).toBe('etf');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:EWJ']).toBe('etf');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:EWT']).toBe('etf');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:EWZ']).toBe('etf');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:URNM']).toBe('etf');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:DRAM']).toBe('etf');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:XLE']).toBe('etf');
  });

  it('classifies known commodities correctly', () => {
    expect(HIP3_ASSET_MARKET_TYPES['xyz:GOLD']).toBe('commodity');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:SILVER']).toBe('commodity');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:CL']).toBe('commodity');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:WTIOIL']).toBe('commodity');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:COPPER']).toBe('commodity');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:URANIUM']).toBe('commodity');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:BRENTOIL']).toBe('commodity');
  });

  it('classifies known forex pairs correctly', () => {
    expect(HIP3_ASSET_MARKET_TYPES['xyz:EUR']).toBe('forex');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:JPY']).toBe('forex');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:GBP']).toBe('forex');
    expect(HIP3_ASSET_MARKET_TYPES['xyz:DXY']).toBe('forex');
  });

  it('derives unique market categories from config', () => {
    const categories: MarketType[] = [
      ...new Set(Object.values(HIP3_ASSET_MARKET_TYPES)),
    ];
    expect(categories).toContain('stock');
    expect(categories).toContain('pre-ipo');
    expect(categories).toContain('index');
    expect(categories).toContain('etf');
    expect(categories).toContain('commodity');
    expect(categories).toContain('forex');
    expect(categories).not.toContain('equity');
    expect(categories).not.toContain('crypto');
  });
});

describe('MarketCategory', () => {
  it('has string values for all 7 data-model categories', () => {
    expect(MarketCategory.CryptoCurrency).toBe('crypto');
    expect(MarketCategory.Stock).toBe('stock');
    expect(MarketCategory.PreIpo).toBe('pre-ipo');
    expect(MarketCategory.Index).toBe('index');
    expect(MarketCategory.Etf).toBe('etf');
    expect(MarketCategory.Commodity).toBe('commodity');
    expect(MarketCategory.Forex).toBe('forex');
  });

  it('has exactly 7 members', () => {
    const values = Object.values(MarketCategory);
    expect(values).toHaveLength(7);
  });
});

describe('MARKET_CATEGORIES', () => {
  it('has exactly 7 entries (one per data-model category)', () => {
    expect(MARKET_CATEGORIES).toHaveLength(7);
  });

  it('does not include the all or new sentinel values', () => {
    expect(MARKET_CATEGORIES).not.toContain('all');
    expect(MARKET_CATEGORIES).not.toContain('new');
  });

  it('includes all 7 MarketTypeFilter data categories', () => {
    const dataCategories: MarketTypeFilter[] = [
      'crypto',
      'stock',
      'pre-ipo',
      'index',
      'etf',
      'commodity',
      'forex',
    ];
    for (const category of dataCategories) {
      expect(MARKET_CATEGORIES).toContain(category);
    }
  });

  it('satisfies MarketTypeFilter[] so no unknown values exist', () => {
    // Compile-time guarantee: MARKET_CATEGORIES is typed as readonly MarketTypeFilter[]
    // The runtime check here mirrors that constraint.
    const validValues: readonly string[] = [
      'crypto',
      'stock',
      'pre-ipo',
      'index',
      'etf',
      'commodity',
      'forex',
    ];
    for (const entry of MARKET_CATEGORIES) {
      expect(validValues).toContain(entry);
    }
  });
});
