import { formatExchangeRatesForBridge } from './formatExchangeRatesForBridge';
import type { AssetPrice } from '../types';

/**
 * Builds minimal AssetPrice for tests (lastUpdated required by BaseAssetPrice).
 *
 * @param overrides - Price fields; must include price.
 * @returns AssetPrice suitable for formatExchangeRatesForBridge input.
 */
function price(overrides: Partial<AssetPrice> & { price: number }): AssetPrice {
  return { lastUpdated: 0, ...overrides } as AssetPrice;
}

describe('formatExchangeRatesForBridge', () => {
  it('returns empty conversionRates, currencyRates, marketData when assetsPrice is empty', () => {
    const result = formatExchangeRatesForBridge({
      assetsPrice: {},
      selectedCurrency: 'usd',
    });

    expect(result.conversionRates).toStrictEqual({});
    expect(result.currencyRates).toStrictEqual({});
    expect(result.marketData).toStrictEqual({});
    expect(result.currentCurrency).toBe('usd');
  });

  it('includes non-EVM asset in conversionRates with currency from selectedCurrency (usd)', () => {
    const bitcoinAssetId = 'bip122:000000000019d6689c085ae165831e93/slip44:0';
    const result = formatExchangeRatesForBridge({
      assetsPrice: {
        [bitcoinAssetId]: price({ price: 50000, lastUpdated: 1000000 }),
      },
      selectedCurrency: 'usd',
    });

    expect(result.conversionRates[bitcoinAssetId]).toBeDefined();
    const entry = result.conversionRates[bitcoinAssetId];
    expect(entry.rate).toBe('50000');
    expect(entry.currency).toBe('swift:0/iso4217:USD');
    expect(entry.conversionTime).toBe(1000000);
    expect(entry.expirationTime).toBe(1000000 + 60);
    expect(result.currentCurrency).toBe('usd');
  });

  it('uses selectedCurrency eur for conversionRates currency', () => {
    const solanaAssetId = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501';
    const result = formatExchangeRatesForBridge({
      assetsPrice: {
        [solanaAssetId]: price({ price: 100 }),
      },
      selectedCurrency: 'eur',
    });

    expect(result.conversionRates[solanaAssetId]).toBeDefined();
    expect(result.conversionRates[solanaAssetId].currency).toBe(
      'swift:0/iso4217:EUR',
    );
    expect(result.currentCurrency).toBe('eur');
  });

  it('falls back to USD when selectedCurrency is not in MAP_CAIP_CURRENCIES', () => {
    const assetId = 'bip122:000000000019d6689c085ae165831e93/slip44:0';
    const result = formatExchangeRatesForBridge({
      assetsPrice: { [assetId]: price({ price: 1 }) },
      selectedCurrency: 'unknown-currency',
    });

    expect(result.conversionRates[assetId].currency).toBe(
      'swift:0/iso4217:USD',
    );
  });

  it('does not include EVM assets in conversionRates', () => {
    const ethNativeId = 'eip155:1/slip44:60';
    const result = formatExchangeRatesForBridge({
      assetsPrice: {
        [ethNativeId]: price({ price: 2000 }),
      },
      selectedCurrency: 'usd',
    });

    expect(result.conversionRates[ethNativeId]).toBeUndefined();
    expect(Object.keys(result.conversionRates)).toHaveLength(0);
  });

  it('includes EVM native asset in marketData and currencyRates', () => {
    const ethNativeId = 'eip155:1/slip44:60';
    const result = formatExchangeRatesForBridge({
      assetsPrice: {
        [ethNativeId]: price({
          price: 2000,
          id: 'ethereum',
          marketCap: 240_000_000_000,
          lastUpdated: 1_700_000_000_000,
        }),
      },
      selectedCurrency: 'usd',
    });

    expect(result.currencyRates.ETH).toStrictEqual({
      conversionDate: 1_700_000_000,
      conversionRate: 2000,
      usdConversionRate: 2000,
    });

    const chainData = result.marketData['0x1'];
    expect(chainData).toBeDefined();
    const nativeAddress = '0x0000000000000000000000000000000000000000';
    const nativeEntry = chainData[nativeAddress];
    expect(nativeEntry).toBeDefined();
    expect(nativeEntry.price).toBe(1);
    expect(nativeEntry.currency).toBe('ETH');
    expect(nativeEntry.assetId).toBe(ethNativeId);
    expect(nativeEntry.chainId).toBe('0x1');
    expect(nativeEntry.tokenAddress).toBe(nativeAddress);
    expect(nativeEntry.id).toBe('ethereum');
    expect(nativeEntry.marketCap).toBe(240_000_000_000);
  });

  it('includes EVM ERC20 in marketData with priceInNative and full market data', () => {
    const ethNativeId = 'eip155:1/slip44:60';
    const usdcId = 'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const result = formatExchangeRatesForBridge({
      assetsPrice: {
        [ethNativeId]: price({ price: 2000 }),
        [usdcId]: price({
          price: 1,
          id: 'usd-coin',
          marketCap: 50_000_000_000,
          allTimeHigh: 1.05,
          allTimeLow: 0.95,
          totalVolume: 1_000_000,
          high1d: 1.01,
          low1d: 0.99,
          lastUpdated: 1_700_000_000_000,
        }),
      },
      selectedCurrency: 'usd',
    });

    const chainData = result.marketData['0x1'];
    expect(chainData).toBeDefined();
    const usdcEntry = chainData[usdcAddress];
    expect(usdcEntry).toBeDefined();
    expect(usdcEntry.price).toBe(1 / 2000);
    expect(usdcEntry.currency).toBe('ETH');
    expect(usdcEntry.assetId).toBe(usdcId);
    expect(usdcEntry.chainId).toBe('0x1');
    expect(usdcEntry.tokenAddress).toBe(usdcAddress);
    expect(usdcEntry.id).toBe('usd-coin');
    expect(usdcEntry.marketCap).toBe(50_000_000_000);
    expect(usdcEntry.allTimeHigh).toBe(1.05);
    expect(usdcEntry.allTimeLow).toBe(0.95);
    expect(usdcEntry.totalVolume).toBe(1_000_000);
    expect(usdcEntry.high1d).toBe(1.01);
    expect(usdcEntry.low1d).toBe(0.99);
  });

  it('skips entries with invalid or negative price', () => {
    const validId = 'bip122:000000000019d6689c085ae165831e93/slip44:0';
    const result = formatExchangeRatesForBridge({
      assetsPrice: {
        [validId]: price({ price: 100 }),
        'eip155:1/slip44:60': price({ price: -1 }),
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501':
          {} as unknown as AssetPrice,
      },
      selectedCurrency: 'usd',
    });

    expect(result.conversionRates[validId]).toBeDefined();
    expect(Object.keys(result.conversionRates)).toHaveLength(1);
    expect(result.currencyRates.ETH).toBeUndefined();
    const nativeAddress = '0x0000000000000000000000000000000000000000';
    expect(result.marketData['0x1']?.[nativeAddress]).toBeUndefined();
  });

  it('includes conversionRates entry marketData from priceData for non-EVM', () => {
    const bitcoinAssetId = 'bip122:000000000019d6689c085ae165831e93/slip44:0';
    const result = formatExchangeRatesForBridge({
      assetsPrice: {
        [bitcoinAssetId]: price({
          price: 50000,
          id: 'bitcoin',
          marketCap: 1_000_000_000_000,
          lastUpdated: 1_600_000_000,
        }),
      },
      selectedCurrency: 'usd',
    });

    const entry = result.conversionRates[bitcoinAssetId];
    expect(entry.marketData).toStrictEqual(
      expect.objectContaining({
        price: 50000,
        id: 'bitcoin',
        marketCap: 1_000_000_000_000,
        lastUpdated: 1_600_000_000,
      }),
    );
  });

  it('handles lastUpdated in milliseconds (conversionTime in seconds)', () => {
    const assetId = 'bip122:000000000019d6689c085ae165831e93/slip44:0';
    const lastUpdatedMs = 1_700_000_000_000;
    const result = formatExchangeRatesForBridge({
      assetsPrice: {
        [assetId]: price({ price: 1, lastUpdated: lastUpdatedMs }),
      },
      selectedCurrency: 'usd',
    });

    const entry = result.conversionRates[assetId];
    expect(entry.conversionTime).toBe(1_700_000_000);
    expect(entry.expirationTime).toBe(1_700_000_000 + 60);
  });

  it('includes multiple EVM chains in marketData', () => {
    const mainnetNative = 'eip155:1/slip44:60';
    const optimismNative = 'eip155:10/slip44:60';
    const result = formatExchangeRatesForBridge({
      assetsPrice: {
        [mainnetNative]: price({ price: 2000 }),
        [optimismNative]: price({ price: 1998 }),
      },
      selectedCurrency: 'usd',
    });

    const nativeAddress = '0x0000000000000000000000000000000000000000';
    expect(result.marketData['0x1']?.[nativeAddress]).toBeDefined();
    expect(result.marketData['0xa']?.[nativeAddress]).toBeDefined();
    expect(result.currencyRates.ETH).toBeDefined();
    expect(typeof result.currencyRates.ETH.conversionRate).toBe('number');
    expect(typeof result.currencyRates.ETH.usdConversionRate).toBe('number');
  });

  it('sets currentCurrency to selectedCurrency', () => {
    const result = formatExchangeRatesForBridge({
      assetsPrice: {
        'bip122:000000000019d6689c085ae165831e93/slip44:0': price({
          price: 1,
        }),
      },
      selectedCurrency: 'gbp',
    });

    expect(result.currentCurrency).toBe('gbp');
  });

  it('uses lowercase selectedCurrency for MAP_CAIP_CURRENCIES lookup', () => {
    const assetId = 'bip122:000000000019d6689c085ae165831e93/slip44:0';
    const result = formatExchangeRatesForBridge({
      assetsPrice: { [assetId]: price({ price: 1 }) },
      selectedCurrency: 'USD',
    });

    expect(result.conversionRates[assetId].currency).toBe(
      'swift:0/iso4217:USD',
    );
  });
});
