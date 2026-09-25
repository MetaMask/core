import { fetchWithErrorHandling } from '@metamask/controller-utils';

import {
  buildNativeAssetsFromConstant,
  buildNativeAssetsFromApi,
  isNativeAssetId,
  NATIVE_ASSETS,
} from './native-assets.js';
import { normalizeAssetId } from './normalizeAssetId.js';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  fetchWithErrorHandling: jest.fn(),
}));

const fetchWithErrorHandlingMock = jest.mocked(fetchWithErrorHandling);

describe('buildNativeAssetsFromConstant', () => {
  it('includes a normalized entry for every NATIVE_ASSETS chain', () => {
    const result = buildNativeAssetsFromConstant();

    for (const [chainId, assetId] of Object.entries(NATIVE_ASSETS)) {
      expect(result[chainId]).toBe(normalizeAssetId(assetId));
    }

    expect(result['bip122:000000000019d6689c085ae165831e93']).toBe(
      'bip122:000000000019d6689c085ae165831e93/slip44:0',
    );
  });
});

describe('isNativeAssetId', () => {
  it('returns true for every NATIVE_ASSETS id', () => {
    for (const assetId of Object.values(NATIVE_ASSETS)) {
      expect(isNativeAssetId(assetId)).toBe(true);
    }
  });

  it('returns false for non-native tokens on a known chain', () => {
    expect(
      isNativeAssetId(
        'eip155:1/erc20:0x6B175474E89094C44Da98b954EedeAC495271d0F',
      ),
    ).toBe(false);
    expect(
      isNativeAssetId(
        'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      ),
    ).toBe(false);
  });
});

describe('buildNativeAssetsFromApi', () => {
  beforeEach(() => {
    fetchWithErrorHandlingMock.mockReset();
  });

  it('calls fetchWithErrorHandling with the chainid.network URL', async () => {
    fetchWithErrorHandlingMock.mockResolvedValue([]);

    await buildNativeAssetsFromApi();

    expect(fetchWithErrorHandlingMock).toHaveBeenCalledWith({
      url: 'https://chainid.network/chains.json',
      timeout: 10_000,
    });
  });

  it('returns only seed data when fetch returns an empty array', async () => {
    fetchWithErrorHandlingMock.mockResolvedValue([]);

    const result = await buildNativeAssetsFromApi();
    const seed = buildNativeAssetsFromConstant();

    expect(result).toStrictEqual(seed);
  });

  it('merges new chains from chainid.network into the seed map', async () => {
    fetchWithErrorHandlingMock.mockResolvedValue([
      { chainId: 999999, slip44: 123 },
    ]);

    const result = await buildNativeAssetsFromApi();

    expect(result['eip155:999999']).toBe('eip155:999999/slip44:123');
  });

  it('does not overwrite entries already in the seed map', async () => {
    fetchWithErrorHandlingMock.mockResolvedValue([
      { chainId: 1, slip44: 9999 },
    ]);

    const result = await buildNativeAssetsFromApi();

    expect(result['eip155:1']).toBe('eip155:1/slip44:60');
  });

  it('skips entries with missing chainId', async () => {
    fetchWithErrorHandlingMock.mockResolvedValue([{ slip44: 100 }]);

    const result = await buildNativeAssetsFromApi();
    const seed = buildNativeAssetsFromConstant();

    expect(result).toStrictEqual(seed);
  });

  it('skips entries with missing slip44', async () => {
    fetchWithErrorHandlingMock.mockResolvedValue([{ chainId: 999999 }]);

    const result = await buildNativeAssetsFromApi();

    expect(result['eip155:999999']).toBeUndefined();
  });

  it('skips entries with non-integer chainId', async () => {
    fetchWithErrorHandlingMock.mockResolvedValue([
      { chainId: 1.5, slip44: 100 },
    ]);

    const result = await buildNativeAssetsFromApi();
    const seed = buildNativeAssetsFromConstant();

    expect(result).toStrictEqual(seed);
  });

  it('skips entries with chainId less than 1', async () => {
    fetchWithErrorHandlingMock.mockResolvedValue([
      { chainId: 0, slip44: 100 },
      { chainId: -1, slip44: 100 },
    ]);

    const result = await buildNativeAssetsFromApi();
    const seed = buildNativeAssetsFromConstant();

    expect(result).toStrictEqual(seed);
  });

  it('skips entries with non-integer slip44', async () => {
    fetchWithErrorHandlingMock.mockResolvedValue([
      { chainId: 999999, slip44: 1.5 },
    ]);

    const result = await buildNativeAssetsFromApi();

    expect(result['eip155:999999']).toBeUndefined();
  });

  it('skips entries with negative slip44', async () => {
    fetchWithErrorHandlingMock.mockResolvedValue([
      { chainId: 999999, slip44: -1 },
    ]);

    const result = await buildNativeAssetsFromApi();

    expect(result['eip155:999999']).toBeUndefined();
  });

  it('falls back to seed data when fetch throws', async () => {
    fetchWithErrorHandlingMock.mockRejectedValue(new Error('Network error'));

    const result = await buildNativeAssetsFromApi();
    const seed = buildNativeAssetsFromConstant();

    expect(result).toStrictEqual(seed);
  });

  it('falls back to seed data when fetch returns undefined', async () => {
    fetchWithErrorHandlingMock.mockResolvedValue(undefined);

    const result = await buildNativeAssetsFromApi();
    const seed = buildNativeAssetsFromConstant();

    expect(result).toStrictEqual(seed);
  });

  it('falls back to seed data when fetch returns a non-array', async () => {
    fetchWithErrorHandlingMock.mockResolvedValue('not an array');

    const result = await buildNativeAssetsFromApi();
    const seed = buildNativeAssetsFromConstant();

    expect(result).toStrictEqual(seed);
  });
});
