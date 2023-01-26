import { Hotlist, PhishingDetectState } from './PhishingController';

/**
 * Composes an object mapping from domain to it's inclusion in list state. This is used to initialize the
 * list state's domains in a map such that removals or further additions can be applied.
 *
 * @param list - a list of domains
 * @returns an object mapping between domain and whether or not that domain is to be included in new list state.
 */
export const buildListMap = (list: string[]): Record<string, true> =>
  list.reduce((acc, cur) => {
    acc[cur] = true;
    return acc;
  }, {} as Record<string, true>);

/**
 * Converts the listState into an object of objects defined by list type and specific domain to determine
 * whether a domain should be included in listState or not.
 *
 * @param map - an object mapping between domain and whether or not that domain is to be included in new list state.
 * @returns a list of domains that are included in new liststate
 */
export const convertMapToList = (map: Record<string, boolean>): string[] =>
  Object.entries(map).reduce<string[]>((acc, [domain, isIncluded]) => {
    if (isIncluded) {
      acc.push(domain);
    }
    return acc;
  }, []);

/**
 * Fetches current epoch time in seconds.
 *
 * @returns the Date.now() time in seconds instead of miliseconds. backend files rely on timestamps in seconds since epoch.
 */
export const fetchTimeNow = (): number => Math.round(Date.now() / 1000);

/**
 * Converts the listState into an object of objects defined by list type and specific domain to determine
 * whether a domain should be included in listState or not.
 *
 * @param listState - the stalelist or the existing liststate that diffs will be applied to.
 * @returns the domain inclusion map on a per-list-type basis
 */
export const convertListStateToMap = (listState: PhishingDetectState) => ({
  allowlist: buildListMap(listState.allowlist),
  fuzzylist: buildListMap(listState.fuzzylist),
  blocklist: buildListMap(listState.blocklist),
});

/**
 * Determines which diffs are applicable to the listState, then applies those diffs.
 *
 * @param listState - the stalelist or the existing liststate that diffs will be applied to.
 * @param hotlistDiffs - the diffs to apply to the listState if valid.
 * @returns the new list state
 */
export const applyDiffs = (
  listState: PhishingDetectState,
  hotlistDiffs: Hotlist,
): PhishingDetectState => {
  const diffsToApply = hotlistDiffs.filter(
    ({ timestamp }) => timestamp > listState.lastUpdated,
  );

  const map = convertListStateToMap(listState);
  const outputMap = diffsToApply.reduce((acc, currDiff) => {
    acc[currDiff.targetList][currDiff.url] = !currDiff.isRemoval;
    return acc;
  }, map as Record<'allowlist' | 'blocklist' | 'fuzzylist', Record<string, boolean>>);

  const now = fetchTimeNow();

  return {
    allowlist: convertMapToList(outputMap.allowlist),
    blocklist: convertMapToList(outputMap.blocklist),
    fuzzylist: convertMapToList(outputMap.fuzzylist),
    version: listState.version,
    tolerance: listState.tolerance,
    name: 'MetaMask',
    lastUpdated: now,
  };
};
