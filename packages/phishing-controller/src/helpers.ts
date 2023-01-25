import { Hotlist, PhishingDetectState } from './PhishingController';

const buildListMap = (list: string[]): Record<string, true> =>
  list.reduce((acc, cur) => {
    acc[cur] = true;
    return acc;
  }, {} as Record<string, true>);

const convertMapToList = (map: Record<string, boolean>): string[] =>
  Object.entries(map).reduce<string[]>((acc, [domain, isIncluded]) => {
    if (isIncluded) {
      acc.push(domain);
    }
    return acc;
  }, []);

export const fetchTimeNow = (): number => Math.round(Date.now() / 1000);

export const convertStalelistToMap = (stalelist: PhishingDetectState) => {
  return {
    allowlist: buildListMap(stalelist.allowlist),
    fuzzylist: buildListMap(stalelist.fuzzylist),
    blocklist: buildListMap(stalelist.blocklist),
  };
};

export const applyDiffs = (
  stalelist: PhishingDetectState,
  hotlistDiffs: Hotlist,
) => {
  const diffsToApply = hotlistDiffs.filter(
    ({ timestamp }) => timestamp > stalelist.lastUpdated,
  );

  const map = convertStalelistToMap(stalelist);
  const outputMap = diffsToApply.reduce((acc, currDiff) => {
    acc[currDiff.targetList][currDiff.url] = !currDiff.isRemoval;
    return acc;
  }, map as Record<'allowlist' | 'blocklist' | 'fuzzylist', Record<string, boolean>>);

  const now = fetchTimeNow();

  return {
    allowlist: convertMapToList(outputMap.allowlist),
    blocklist: convertMapToList(outputMap.blocklist),
    fuzzylist: convertMapToList(outputMap.fuzzylist),
    version: stalelist.version,
    tolerance: stalelist.tolerance,
    name: 'MetaMask',
    lastUpdated: now,
  };
};
