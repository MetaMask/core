import type {
  Hotlist,
  ListKeys,
  PhishingListState,
} from './PhishingController';
import { phishingListKeyNameMap } from './PhishingController';
import type {
  PhishingDetectorList,
  PhishingDetectorConfiguration,
} from './PhishingDetector';

const DEFAULT_TOLERANCE = 3;

/**
 * Fetches current epoch time in seconds.
 *
 * @returns the Date.now() time in seconds instead of miliseconds. backend files rely on timestamps in seconds since epoch.
 */
export const fetchTimeNow = (): number => Math.round(Date.now() / 1000);

/**
 * Split a string into two pieces, using the first period as the delimiter.
 *
 * @param stringToSplit - The string to split.
 * @returns An array of length two containing the beginning and end of the string.
 */
const splitStringByPeriod = <Start extends string, End extends string>(
  stringToSplit: `${Start}.${End}`,
): [Start, End] => {
  const periodIndex = stringToSplit.indexOf('.');
  return [
    stringToSplit.slice(0, periodIndex) as Start,
    stringToSplit.slice(periodIndex + 1) as End,
  ];
};

/**
 * Determines which diffs are applicable to the listState, then applies those diffs.
 *
 * @param listState - the stalelist or the existing liststate that diffs will be applied to.
 * @param hotlistDiffs - the diffs to apply to the listState if valid.
 * @param listKey - the key associated with the input/output phishing list state.
 * @returns the new list state
 */
export const applyDiffs = (
  listState: PhishingListState,
  hotlistDiffs: Hotlist,
  listKey: ListKeys,
): PhishingListState => {
  // filter to remove diffs that were added before the lastUpdate time.
  // filter to remove diffs that aren't applicable to the specified list (by listKey).
  const diffsToApply = hotlistDiffs.filter(
    ({ timestamp, targetList }) =>
      timestamp > listState.lastUpdated &&
      splitStringByPeriod(targetList)[0] === listKey,
  );

  // the reason behind using latestDiffTimestamp as the lastUpdated time
  // is so that we can benefit server-side from memoization due to end client's
  // `GET /v1/diffSince/:timestamp` requests lining up with
  // our periodic updates (which create diffs at specific timestamps).
  let latestDiffTimestamp = listState.lastUpdated;

  const listSets = {
    allowlist: new Set(listState.allowlist),
    blocklist: new Set(listState.blocklist),
    fuzzylist: new Set(listState.fuzzylist),
  };
  for (const { isRemoval, targetList, url, timestamp } of diffsToApply) {
    const targetListType = splitStringByPeriod(targetList)[1];
    if (timestamp > latestDiffTimestamp) {
      latestDiffTimestamp = timestamp;
    }
    if (isRemoval) {
      listSets[targetListType].delete(url);
    } else {
      listSets[targetListType].add(url);
    }
  }

  return {
    allowlist: Array.from(listSets.allowlist),
    blocklist: Array.from(listSets.blocklist),
    fuzzylist: Array.from(listSets.fuzzylist),
    version: listState.version,
    name: phishingListKeyNameMap[listKey],
    tolerance: listState.tolerance,
    lastUpdated: latestDiffTimestamp,
  };
};

/**
 * Validates the configuration object for the phishing detector.
 *
 * @param config - the configuration object to validate.
 * @throws an error if the configuration is invalid.
 */
export function validateConfig(
  config: unknown,
): asserts config is PhishingListState {
  if (config === null || typeof config !== 'object') {
    throw new Error('Invalid config');
  }

  if ('tolerance' in config && !('fuzzylist' in config)) {
    throw new Error('Fuzzylist tolerance provided without fuzzylist');
  }

  if (
    'name' in config &&
    (typeof config.name !== 'string' || config.name === '')
  ) {
    throw new Error("Invalid config parameter: 'name'");
  }

  if (
    'version' in config &&
    (!['number', 'string'].includes(typeof config.version) ||
      config.version === '')
  ) {
    throw new Error("Invalid config parameter: 'version'");
  }
}

/**
 * Converts a domain string to a list of domain parts.
 *
 * @param domain - the domain string to convert.
 * @returns the list of domain parts.
 */
export const domainToParts = (domain: string) => {
  try {
    return domain.split('.').reverse();
  } catch (e) {
    throw new Error(JSON.stringify(domain));
  }
};

/**
 * Converts a list of domain strings to a list of domain parts.
 *
 * @param list - the list of domain strings to convert.
 * @returns the list of domain parts.
 */
export const processDomainList = (list: string[]) => {
  return list.map(domainToParts);
};

/**
 * Gets the default phishing detector configuration.
 *
 * @param override - the optional override for the configuration.
 * @param override.allowlist - the optional allowlist to override.
 * @param override.blocklist - the optional blocklist to override.
 * @param override.fuzzylist - the optional fuzzylist to override.
 * @param override.tolerance - the optional tolerance to override.
 * @returns the default phishing detector configuration.
 */
export const getDefaultPhishingDetectorConfig = ({
  allowlist = [],
  blocklist = [],
  fuzzylist = [],
  tolerance = DEFAULT_TOLERANCE,
}: {
  allowlist?: string[];
  blocklist?: string[];
  fuzzylist?: string[];
  tolerance?: number;
}): PhishingDetectorConfiguration => ({
  allowlist: processDomainList(allowlist),
  blocklist: processDomainList(blocklist),
  fuzzylist: processDomainList(fuzzylist),
  tolerance,
});

/**
 * Processes the configurations for the phishing detector.
 *
 * @param configs - the configurations to process.
 * @returns the processed configurations.
 */
export const processConfigs = (configs: PhishingDetectorList[] = []) => {
  return configs.map((config: PhishingDetectorList) => {
    validateConfig(config);
    return { ...config, ...getDefaultPhishingDetectorConfig(config) };
  });
};

/**
 * Converts a list of domain parts to a domain string.
 *
 * @param domainParts - the list of domain parts.
 * @returns the domain string.
 */
export const domainPartsToDomain = (domainParts: string[]) => {
  return domainParts.slice().reverse().join('.');
};

/**
 * Converts a list of domain parts to a fuzzy form.
 *
 * @param domainParts - the list of domain parts.
 * @returns the fuzzy form of the domain.
 */
export const domainPartsToFuzzyForm = (domainParts: string[]) => {
  return domainParts.slice(1).reverse().join('.');
};

/**
 * Matches the target parts, ignoring extra subdomains on source.
 *
 * @param source - the source domain parts.
 * @param list - the list of domain parts to match against.
 * @returns the parts for the first found matching entry.
 */
export const matchPartsAgainstList = (source: string[], list: string[][]) => {
  return list.find((target) => {
    // target domain has more parts than source, fail
    if (target.length > source.length) {
      return false;
    }
    // source matches target or (is deeper subdomain)
    return target.every((part, index) => source[index] === part);
  });
};
