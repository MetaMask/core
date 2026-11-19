export type FindLowOccurrenceSpamAssetIdsOptions = {
  /** CAIP-19 asset IDs to judge. */
  assetIds: string[];
  /**
   * Returns true for assets that must never be classified as spam (custom
   * assets, balance heals, allow-listed tokens, ...).
   */
  isExempt?: (assetId: string) => boolean;
  /** Returns the asset's aggregator occurrence count, if the API reported one. */
  getOccurrences: (assetId: string) => number | undefined;
  /** Returns the minimum occurrences an asset on its chain needs to be kept. */
  getOccurrenceFloor: (assetId: string) => number;
  /**
   * Returns the lower-cased IDs, among those passed in, that are launchpad
   * tokens safe to keep. Only called for assets below the floor. Callers own
   * the failure policy: swallow errors to keep the filter (fail-closed on
   * the asset) or let them propagate to abort the whole classification.
   */
  findLaunchpadAssetIds: (assetIds: string[]) => Promise<Set<string>>;
};

/**
 * Classifies assets as low-occurrence spam.
 *
 * An asset is spam when it is not exempt, its occurrences (missing counts as
 * zero) are below its chain's floor, and it is not a launchpad token.
 * Launchpad tokens have few aggregator listings by nature, so the launchpad
 * lookup is the last check and runs only for assets that would otherwise be
 * removed.
 *
 * @param options - Options.
 * @param options.assetIds - CAIP-19 asset IDs to judge.
 * @param options.isExempt - Assets that bypass the filter.
 * @param options.getOccurrences - Occurrence count lookup.
 * @param options.getOccurrenceFloor - Per-asset floor lookup.
 * @param options.findLaunchpadAssetIds - Launchpad lookup for below-floor assets.
 * @returns The subset of `assetIds` classified as spam, as passed in.
 */
export async function findLowOccurrenceSpamAssetIds({
  assetIds,
  isExempt,
  getOccurrences,
  getOccurrenceFloor,
  findLaunchpadAssetIds,
}: FindLowOccurrenceSpamAssetIdsOptions): Promise<string[]> {
  const belowFloorAssetIds = assetIds.filter((assetId) => {
    if (isExempt?.(assetId)) {
      return false;
    }
    return (getOccurrences(assetId) ?? 0) < getOccurrenceFloor(assetId);
  });

  if (belowFloorAssetIds.length === 0) {
    return [];
  }

  const launchpadAssetIds = await findLaunchpadAssetIds(belowFloorAssetIds);
  return belowFloorAssetIds.filter(
    (assetId) => !launchpadAssetIds.has(assetId.toLowerCase()),
  );
}
