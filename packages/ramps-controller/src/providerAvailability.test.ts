import {
  getProvidersServingAsset,
  isFiatDepositAvailable,
  providerServesAsset,
  regionHasProviderForAsset,
  resolveFiatDepositRoute,
} from './providerAvailability';
import type { Provider } from './RampsService';

const ASSET_ID = 'eip155:1/erc20:0xtoken';
const MUSD_ASSET_ID = 'eip155:143/erc20:0xmusd';
const ETH_ASSET_ID = 'eip155:1/slip44:60';

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
  it('returns false for an empty assetId regardless of scope', () => {
    const provider = buildProvider('native', 'native', { '': true });
    expect(
      regionHasProviderForAsset({
        providers: [provider],
        assetId: '',
        scope: 'all',
      }),
    ).toBe(false);
  });

  it('returns true when a native provider serves the asset, even under scope off', () => {
    const provider = buildProvider('native', 'native', { [ASSET_ID]: true });
    expect(
      regionHasProviderForAsset({
        providers: [provider],
        assetId: ASSET_ID,
        scope: 'off',
      }),
    ).toBe(true);
  });

  it('returns false under scope off when only an aggregator serves the asset', () => {
    const provider = buildProvider('moonpay', 'aggregator', {
      [ASSET_ID]: true,
    });
    expect(
      regionHasProviderForAsset({
        providers: [provider],
        assetId: ASSET_ID,
        scope: 'off',
      }),
    ).toBe(false);
  });

  it('returns true under scope in-app when an aggregator serves the asset', () => {
    const provider = buildProvider('moonpay', 'aggregator', {
      [ASSET_ID]: true,
    });
    expect(
      regionHasProviderForAsset({
        providers: [provider],
        assetId: ASSET_ID,
        scope: 'in-app',
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
        scope: 'all',
      }),
    ).toBe(false);
  });
});

describe('isFiatDepositAvailable', () => {
  it('returns true when a native provider is selected, even under scope off', () => {
    const selectedProvider = buildProvider('native', 'native');
    expect(
      isFiatDepositAvailable({
        providers: [],
        selectedProvider,
        scope: 'off',
      }),
    ).toBe(true);
  });

  it('returns false under scope off when the selected provider is not native', () => {
    const selectedProvider = buildProvider('moonpay', 'aggregator');
    expect(
      isFiatDepositAvailable({
        providers: [selectedProvider],
        selectedProvider,
        scope: 'off',
      }),
    ).toBe(false);
  });

  it('returns true under scope in-app when the region has any provider', () => {
    const provider = buildProvider('moonpay', 'aggregator');
    expect(
      isFiatDepositAvailable({
        providers: [provider],
        selectedProvider: null,
        scope: 'in-app',
      }),
    ).toBe(true);
  });

  it('returns false when widened but the region has no providers', () => {
    expect(
      isFiatDepositAvailable({
        providers: [],
        selectedProvider: null,
        scope: 'all',
      }),
    ).toBe(false);
  });
});

describe('resolveFiatDepositRoute', () => {
  it('buys the preferred asset directly when a provider serves it', () => {
    const musdProvider = buildProvider('moonpay', 'aggregator', {
      [MUSD_ASSET_ID]: true,
    });
    const ethProvider = buildProvider('banxa', 'aggregator', {
      [ETH_ASSET_ID]: true,
    });
    expect(
      resolveFiatDepositRoute({
        providers: [musdProvider, ethProvider],
        preferredAssetId: MUSD_ASSET_ID,
        fallbackAssetIds: [ETH_ASSET_ID],
        scope: 'in-app',
      }),
    ).toStrictEqual({ assetId: MUSD_ASSET_ID, isFallback: false });
  });

  it('falls back to a convertible asset when the preferred asset has no provider', () => {
    const ethProvider = buildProvider('banxa', 'aggregator', {
      [ETH_ASSET_ID]: true,
    });
    expect(
      resolveFiatDepositRoute({
        providers: [ethProvider],
        preferredAssetId: MUSD_ASSET_ID,
        fallbackAssetIds: [ETH_ASSET_ID],
        scope: 'in-app',
      }),
    ).toStrictEqual({ assetId: ETH_ASSET_ID, isFallback: true });
  });

  it('tries fallback assets in order and returns the first with a provider', () => {
    const secondFallback = 'eip155:1/erc20:0xusdc';
    const usdcProvider = buildProvider('banxa', 'aggregator', {
      [secondFallback]: true,
    });
    expect(
      resolveFiatDepositRoute({
        providers: [usdcProvider],
        preferredAssetId: MUSD_ASSET_ID,
        fallbackAssetIds: [ETH_ASSET_ID, secondFallback],
        scope: 'all',
      }),
    ).toStrictEqual({ assetId: secondFallback, isFallback: true });
  });

  it('returns undefined when neither preferred nor fallback assets have a provider', () => {
    const otherProvider = buildProvider('banxa', 'aggregator', {
      'eip155:1/erc20:0xother': true,
    });
    expect(
      resolveFiatDepositRoute({
        providers: [otherProvider],
        preferredAssetId: MUSD_ASSET_ID,
        fallbackAssetIds: [ETH_ASSET_ID],
        scope: 'all',
      }),
    ).toBeUndefined();
  });

  it('does not reach an aggregator-only fallback under scope off (native-only)', () => {
    const ethProvider = buildProvider('banxa', 'aggregator', {
      [ETH_ASSET_ID]: true,
    });
    expect(
      resolveFiatDepositRoute({
        providers: [ethProvider],
        preferredAssetId: MUSD_ASSET_ID,
        fallbackAssetIds: [ETH_ASSET_ID],
        scope: 'off',
      }),
    ).toBeUndefined();
  });

  it('reaches a native fallback provider under scope off', () => {
    const ethNativeProvider = buildProvider('native', 'native', {
      [ETH_ASSET_ID]: true,
    });
    expect(
      resolveFiatDepositRoute({
        providers: [ethNativeProvider],
        preferredAssetId: MUSD_ASSET_ID,
        fallbackAssetIds: [ETH_ASSET_ID],
        scope: 'off',
      }),
    ).toStrictEqual({ assetId: ETH_ASSET_ID, isFallback: true });
  });
});
