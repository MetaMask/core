import { describe, expect, it, vi } from 'vitest';

import { findLowOccurrenceSpamAssetIds } from './findLowOccurrenceSpamAssetIds.js';

const LOW = 'eip155:1/erc20:0xLow';
const HIGH = 'eip155:1/erc20:0xHigh';
const EXEMPT = 'eip155:1/erc20:0xExempt';
const LAUNCHPAD = 'eip155:1/erc20:0xLaunchpad';

const OCCURRENCES: Record<string, number | undefined> = {
  [LOW]: 1,
  [HIGH]: 5,
  [EXEMPT]: 0,
  [LAUNCHPAD]: 0,
};

function run(
  overrides: Partial<Parameters<typeof findLowOccurrenceSpamAssetIds>[0]> = {},
): ReturnType<typeof findLowOccurrenceSpamAssetIds> {
  return findLowOccurrenceSpamAssetIds({
    assetIds: [LOW, HIGH, EXEMPT, LAUNCHPAD],
    isExempt: (id) => id === EXEMPT,
    getOccurrences: (id) => OCCURRENCES[id],
    getOccurrenceFloor: () => 3,
    findLaunchpadAssetIds: async () => new Set([LAUNCHPAD.toLowerCase()]),
    ...overrides,
  });
}

describe('findLowOccurrenceSpamAssetIds', () => {
  it('returns below-floor assets that are neither exempt nor launchpad', async () => {
    expect(await run()).toStrictEqual([LOW]);
  });

  it('only looks up launchpad status for non-exempt below-floor assets', async () => {
    const findLaunchpadAssetIds = vi.fn().mockResolvedValue(new Set());

    await run({ findLaunchpadAssetIds });

    expect(findLaunchpadAssetIds).toHaveBeenCalledWith([LOW, LAUNCHPAD]);
  });

  it('skips the launchpad lookup when nothing is below the floor', async () => {
    const findLaunchpadAssetIds = vi.fn();

    const result = await run({
      assetIds: [HIGH, EXEMPT],
      findLaunchpadAssetIds,
    });

    expect(result).toStrictEqual([]);
    expect(findLaunchpadAssetIds).not.toHaveBeenCalled();
  });

  it('treats missing occurrences as zero', async () => {
    expect(
      await run({
        assetIds: [LOW],
        getOccurrences: () => undefined,
        findLaunchpadAssetIds: async () => new Set(),
      }),
    ).toStrictEqual([LOW]);
  });

  it('works without an exemption callback', async () => {
    expect(
      await run({ assetIds: [EXEMPT], isExempt: undefined }),
    ).toStrictEqual([EXEMPT]);
  });

  it('propagates launchpad lookup errors', async () => {
    await expect(
      run({
        findLaunchpadAssetIds: async () => {
          throw new Error('boom');
        },
      }),
    ).rejects.toThrow('boom');
  });
});
