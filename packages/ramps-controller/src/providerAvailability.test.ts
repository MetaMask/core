import {
  getProvidersServingAsset,
  isFiatDepositAvailable,
  providerServesAsset,
  regionHasProviderForAsset,
} from './providerAvailability.js';
import type { Provider } from './RampsService.js';

const ASSET_ID = 'eip155:1/erc20:0xtoken';

const buildProvider = (
  id: string,
  type: 'native' | 'aggregator',
  supportedCryptoCurrencies?: Provider['supportedCryptoCurrencies'],
): Provider => ({
  id,
  name: id,
  type,
  environmentType: 'STAGING',
  description: '',
  hqAddress: '',
  links: [],
  logos: { light: '', dark: '', height: 24, width: 77 },
  ...(supportedCryptoCurrencies ? { supportedCryptoCurrencies } : {}),
});

describe('providerServesAsset', () => {
  it('returns true when the provider lists the asset', () => {
    const provider = buildProvider('moonpay', 'aggregator', {
      [ASSET_ID]: true,
    });
    expect(providerServesAsset(provider, ASSET_ID)).toBe(true);
  });

  it('matches case-insensitively on both sides', () => {
    const provider = buildProvider('moonpay', 'aggregator', {
      'EIP155:1/ERC20:0xTOKEN': true,
    });
    expect(providerServesAsset(provider, ASSET_ID)).toBe(true);
  });

  it('returns false when the provider has no supported map', () => {
    const provider = buildProvider('moonpay', 'aggregator');
    expect(providerServesAsset(provider, ASSET_ID)).toBe(false);
  });

  it('returns false when the asset is not listed', () => {
    const provider = buildProvider('moonpay', 'aggregator', {
      'eip155:1/slip44:60': true,
    });
    expect(providerServesAsset(provider, ASSET_ID)).toBe(false);
  });
});

describe('getProvidersServingAsset', () => {
  it('keeps only providers serving the asset', () => {
    const serving = buildProvider('moonpay', 'aggregator', {
      [ASSET_ID]: true,
    });
    const other = buildProvider('banxa', 'aggregator', {
      'eip155:1/slip44:60': true,
    });
    expect(getProvidersServingAsset([serving, other], ASSET_ID)).toStrictEqual([
      serving,
    ]);
  });
});

describe('regionHasProviderForAsset', () => {
  it('returns false for an empty assetId even when all providers are enabled', () => {
    const provider = buildProvider('native', 'native', { '': true });
    expect(
      regionHasProviderForAsset({
        providers: [provider],
        assetId: '',
        allProvidersEnabled: true,
      }),
    ).toBe(false);
  });

  it('returns true when a native provider serves the asset, even with the flag disabled', () => {
    const provider = buildProvider('native', 'native', { [ASSET_ID]: true });
    expect(
      regionHasProviderForAsset({
        providers: [provider],
        assetId: ASSET_ID,
        allProvidersEnabled: false,
      }),
    ).toBe(true);
  });

  it('returns false with the flag disabled when only an aggregator serves the asset', () => {
    const provider = buildProvider('moonpay', 'aggregator', {
      [ASSET_ID]: true,
    });
    expect(
      regionHasProviderForAsset({
        providers: [provider],
        assetId: ASSET_ID,
        allProvidersEnabled: false,
      }),
    ).toBe(false);
  });

  it('returns true with the flag enabled when an aggregator serves the asset', () => {
    const provider = buildProvider('moonpay', 'aggregator', {
      [ASSET_ID]: true,
    });
    expect(
      regionHasProviderForAsset({
        providers: [provider],
        assetId: ASSET_ID,
        allProvidersEnabled: true,
      }),
    ).toBe(true);
  });

  it('returns false when no provider serves the asset, even when widened', () => {
    const provider = buildProvider('moonpay', 'aggregator', {
      'eip155:1/slip44:60': true,
    });
    expect(
      regionHasProviderForAsset({
        providers: [provider],
        assetId: ASSET_ID,
        allProvidersEnabled: true,
      }),
    ).toBe(false);
  });
});

describe('isFiatDepositAvailable', () => {
  it('returns true when a native provider is selected, even with the flag disabled', () => {
    const selectedProvider = buildProvider('native', 'native');
    expect(
      isFiatDepositAvailable({
        providers: [],
        selectedProvider,
        allProvidersEnabled: false,
      }),
    ).toBe(true);
  });

  it('returns false with the flag disabled when the selected provider is not native', () => {
    const selectedProvider = buildProvider('moonpay', 'aggregator');
    expect(
      isFiatDepositAvailable({
        providers: [selectedProvider],
        selectedProvider,
        allProvidersEnabled: false,
      }),
    ).toBe(false);
  });

  it('returns true with the flag enabled when the region has any provider', () => {
    const provider = buildProvider('moonpay', 'aggregator');
    expect(
      isFiatDepositAvailable({
        providers: [provider],
        selectedProvider: null,
        allProvidersEnabled: true,
      }),
    ).toBe(true);
  });

  it('returns false when widened but the region has no providers', () => {
    expect(
      isFiatDepositAvailable({
        providers: [],
        selectedProvider: null,
        allProvidersEnabled: true,
      }),
    ).toBe(false);
  });
});
