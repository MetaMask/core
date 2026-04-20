import type { FungibleAssetPrice } from '../types';
import { formatExchangeRatesForBridge } from './formatExchangeRatesForBridge';

/**
 * Builds minimal AssetPrice for tests. Defaults usdPrice to the same
 * value as price (convenient for USD-denominated tests).
 *
 * @param overrides - Price fields; must include price.
 * @returns AssetPrice suitable for formatExchangeRatesForBridge input.
 */
function price(
  overrides: Partial<FungibleAssetPrice> & { price: number },
): FungibleAssetPrice {
  return {
    assetPriceType: 'fungible',
    lastUpdated: 0,
    usdPrice: overrides.price,
    ...overrides,
  };
}

/** Minimal nativeAssetIdentifiers for EVM tests (from NetworkEnablementController shape). */
const EVM_NATIVE_IDS: Record<string, string> = {
  'eip155:1': 'eip155:1/slip44:60',
  'eip155:10': 'eip155:10/slip44:60',
};

/** Network configs for EVM tests (from NetworkController.networkConfigurationsByChainId shape). */
const EVM_NETWORK_CONFIGS: Record<string, { nativeCurrency: string }> = {
  '0x1': { nativeCurrency: 'ETH' },
  '0xa': { nativeCurrency: 'ETH' },
};

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
        [bitcoinAssetId]: price({ price: 50000, lastUpdated: 1000000000 }),
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

  it('omits EVM marketData and currencyRates when nativeAssetIdentifiers is empty', () => {
    const ethNativeId = 'eip155:1/slip44:60';
    const result = formatExchangeRatesForBridge({
      assetsPrice: {
        [ethNativeId]: price({ price: 2000 }),
      },
      selectedCurrency: 'usd',
      nativeAssetIdentifiers: {},
    });

    expect(result.currencyRates.ETH).toBeUndefined();
    expect(result.marketData['0x1']).toBeUndefined();
  });

  it('uses native currency symbol from networkConfigurationsByChainId', () => {
    const polNativeId = 'eip155:137/slip44:966';
    const result = formatExchangeRatesForBridge({
      assetsPrice: {
        [polNativeId]: price({ price: 0.5, lastUpdated: 1_700_000_000_000 }),
      },
      selectedCurrency: 'usd',
      nativeAssetIdentifiers: { 'eip155:137': polNativeId },
      networkConfigurationsByChainId: {
        '0x89': { nativeCurrency: 'POL' },
      },
    });

    expect(result.currencyRates.POL).toStrictEqual({
      conversionDate: 1_700_000_000,
      conversionRate: 0.5,
      usdConversionRate: 0.5,
    });
    const nativeAddress = '0x0000000000000000000000000000000000000000';
    expect(result.marketData['0x89']?.[nativeAddress]?.currency).toBe('POL');
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
      nativeAssetIdentifiers: { 'eip155:1': ethNativeId },
      networkConfigurationsByChainId: EVM_NETWORK_CONFIGS,
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
      nativeAssetIdentifiers: { 'eip155:1': ethNativeId },
      networkConfigurationsByChainId: EVM_NETWORK_CONFIGS,
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

  it('skips entries with negative price', () => {
    const validId = 'bip122:000000000019d6689c085ae165831e93/slip44:0';
    const result = formatExchangeRatesForBridge({
      assetsPrice: {
        [validId]: price({ price: 100 }),
        'eip155:1/slip44:60': price({ price: -1 }),
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
        fungible: true,
        marketCap: '1000000000000',
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
      nativeAssetIdentifiers: EVM_NATIVE_IDS,
      networkConfigurationsByChainId: EVM_NETWORK_CONFIGS,
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

  it('uses price for currencyRates conversionRate and usdPrice for usdConversionRate when selectedCurrency is not usd', () => {
    const ethNativeId = 'eip155:1/slip44:60';
    const result = formatExchangeRatesForBridge({
      assetsPrice: {
        [ethNativeId]: price({
          price: 1840,
          usdPrice: 2000,
          lastUpdated: 1_700_000_000_000,
        }),
      },
      selectedCurrency: 'eur',
      nativeAssetIdentifiers: { 'eip155:1': ethNativeId },
      networkConfigurationsByChainId: EVM_NETWORK_CONFIGS,
    });

    expect(result.currencyRates.ETH).toStrictEqual({
      conversionDate: 1_700_000_000,
      conversionRate: 1840,
      usdConversionRate: 2000,
    });
  });

  it('uses price directly for non-EVM conversionRates rate in selected currency', () => {
    const bitcoinAssetId = 'bip122:000000000019d6689c085ae165831e93/slip44:0';
    const result = formatExchangeRatesForBridge({
      assetsPrice: {
        [bitcoinAssetId]: price({ price: 46000, usdPrice: 50000 }),
      },
      selectedCurrency: 'eur',
    });

    expect(result.conversionRates[bitcoinAssetId].rate).toBe(String(46000));
    expect(result.conversionRates[bitcoinAssetId].currency).toBe(
      'swift:0/iso4217:EUR',
    );
  });
});
