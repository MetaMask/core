import {
  Hotlist,
  PhishingListState,
  PhishingStalelist,
} from './PhishingController';
/**
 * Fetches current epoch time in seconds.
 *
 * @returns the Date.now() time in seconds instead of miliseconds. backend files rely on timestamps in seconds since epoch.
 */
export const fetchTimeNow = (): number => Math.round(Date.now() / 1000);

/**
 * Determines which diffs are applicable to the listState, then applies those diffs.
 *
 * @param listState - the stalelist or the existing liststate that diffs will be applied to.
 * @param hotlistDiffs - the diffs to apply to the listState if valid.
 * @returns the new list state
 */
export const applyDiffs = (
  listState: PhishingStalelist,
  hotlistDiffs: Hotlist,
): PhishingListState => {
  const diffsToApply = hotlistDiffs.filter(
    ({ timestamp }) => timestamp > listState.lastUpdated,
  );

  const listSets = {
    allowlist: new Set(listState.allowlist),
    blocklist: new Set(listState.blocklist),
    fuzzylist: new Set(listState.fuzzylist),
  };

  for (const { isRemoval, targetList, url } of diffsToApply) {
    if (isRemoval) {
      listSets[targetList].delete(url);
    } else {
      listSets[targetList].add(url);
    }
  }

  const now = fetchTimeNow();

  return {
    allowlist: Array.from(listSets.allowlist),
    blocklist: Array.from(listSets.blocklist),
    fuzzylist: Array.from(listSets.fuzzylist),
    version: listState.version,
    name: 'MetaMask',
    tolerance: listState.tolerance,
    lastUpdated: now,
  };
};
