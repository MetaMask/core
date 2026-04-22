import { SPOT_PRICES_SUPPORT_INFO } from '@metamask/assets-controllers';
import { fetchWithErrorHandling } from '@metamask/controller-utils';

import {
  buildNativeAssetsFromConstant,
  buildNativeAssetsFromApi,
} from './native-assets';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  fetchWithErrorHandling: jest.fn(),
}));

const fetchWithErrorHandlingMock = jest.mocked(fetchWithErrorHandling);

describe('buildNativeAssetsFromConstant', () => {
  it('includes an entry for every value in SPOT_PRICES_SUPPORT_INFO', () => {
    const result = buildNativeAssetsFromConstant();
    const supportInfoValues = Object.values(SPOT_PRICES_SUPPORT_INFO);

    for (const assetId of supportInfoValues) {
      expect(Object.values(result)).toContain(assetId);
    }
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
