import { describe, expect, it, vi } from 'vitest';

import { findLaunchpadAssetIds } from './findLaunchpadAssetIds.js';

const ASSET_A = 'eip155:56/erc20:0xAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ASSET_B = 'eip155:56/erc20:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function createApiClient(
  fetchV2Assets: ReturnType<typeof vi.fn>,
): Parameters<typeof findLaunchpadAssetIds>[0]['apiClient'] {
  return { token: { fetchV2Assets } } as never;
}

describe('findLaunchpadAssetIds', () => {
  it('returns an empty set without fetching when there are no assets', async () => {
    const fetchV2Assets = vi.fn();

    const result = await findLaunchpadAssetIds({
      assetIds: [],
      apiClient: createApiClient(fetchV2Assets),
      timeoutMs: 1000,
    });

    expect(result.size).toBe(0);
    expect(fetchV2Assets).not.toHaveBeenCalled();
  });

  it('returns lower-cased IDs of non-malicious launchpad tokens', async () => {
    const fetchV2Assets = vi.fn().mockResolvedValue([
      { assetId: ASSET_A, launchpad: 'flap' },
      { assetId: ASSET_B, launchpadData: { protocol: null } },
      { assetId: 'eip155:56/erc20:0xcc', launchpad: null },
    ]);

    const result = await findLaunchpadAssetIds({
      assetIds: [ASSET_A, ASSET_B],
      apiClient: createApiClient(fetchV2Assets),
      timeoutMs: 1000,
    });

    expect([...result].sort()).toStrictEqual(
      [ASSET_A.toLowerCase(), ASSET_B].sort(),
    );
  });

  it('excludes launchpad tokens classified as malicious', async () => {
    const fetchV2Assets = vi.fn().mockResolvedValue([
      {
        assetId: ASSET_A,
        launchpad: 'flap',
        securityData: { resultType: 'Malicious' },
      },
    ]);

    const result = await findLaunchpadAssetIds({
      assetIds: [ASSET_A],
      apiClient: createApiClient(fetchV2Assets),
      timeoutMs: 1000,
    });

    expect(result.size).toBe(0);
  });

  it('batches requests in groups of 50', async () => {
    const fetchV2Assets = vi.fn().mockResolvedValue([]);
    const assetIds = Array.from(
      { length: 51 },
      (_, i) => `eip155:56/erc20:0x${i}`,
    );

    await findLaunchpadAssetIds({
      assetIds,
      apiClient: createApiClient(fetchV2Assets),
      timeoutMs: 1000,
    });

    expect(fetchV2Assets).toHaveBeenCalledTimes(2);
    expect(fetchV2Assets.mock.calls[0][0]).toHaveLength(50);
  });

  it('propagates request errors', async () => {
    const fetchV2Assets = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(
      findLaunchpadAssetIds({
        assetIds: [ASSET_A],
        apiClient: createApiClient(fetchV2Assets),
        timeoutMs: 1000,
      }),
    ).rejects.toThrow('boom');
  });
});
