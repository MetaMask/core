import { bytesToHex } from '@noble/hashes/utils';
import { sha256 } from 'ethereum-cryptography/sha256';

import type { Hotlist, PhishingListState } from './PhishingController';
import { ListKeys, phishingListKeyNameMap } from './PhishingController';
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
 * Rounds a Unix timestamp down to the nearest minute.
 *
 * @param unixTimestamp - The Unix timestamp to be rounded.
 * @returns The rounded Unix timestamp.
 */
export function roundToNearestMinute(unixTimestamp: number): number {
  return Math.floor(unixTimestamp / 60) * 60;
}

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

const isValidURL = (url: string): URL | null => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

const hasPath = (url: string): boolean => {
  const urlObj = isValidURL(url);
  if (!urlObj) {
    return false;
  }
  return urlObj.pathname.split('/').filter(Boolean).length > 0;
};

/**
 * Determines which diffs are applicable to the listState, then applies those diffs.
 *
 * @param listState - the stalelist or the existing liststate that diffs will be applied to.
 * @param hotlistDiffs - the diffs to apply to the listState if valid.
 * @param listKey - the key associated with the input/output phishing list state.
 * @param recentlyAddedC2Domains - list of hashed C2 domains to add to the local c2 domain blocklist
 * @param recentlyRemovedC2Domains - list of hashed C2 domains to remove from the local c2 domain blocklist
 * @returns the new list state
 */
export const applyDiffs = (
  listState: PhishingListState,
  hotlistDiffs: Hotlist,
  listKey: ListKeys,
  recentlyAddedC2Domains: string[] = [],
  recentlyRemovedC2Domains: string[] = [],
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
    c2DomainBlocklist: new Set(listState.c2DomainBlocklist),
  };
  const blocklistPaths = JSON.parse(JSON.stringify(listState.blocklistPaths));

  for (const { isRemoval, targetList, url, timestamp } of diffsToApply) {
    const targetListType = splitStringByPeriod(targetList)[1];
    if (timestamp > latestDiffTimestamp) {
      latestDiffTimestamp = timestamp;
    }

    if (targetListType === 'blocklist' && hasPath(url)) {
      if (isRemoval) {
        removeURLFromBlocklistPaths(url, blocklistPaths);
      } else {
        addURLToBlocklistPaths(url, blocklistPaths);
      }
      continue;
    }

    if (isRemoval) {
      listSets[targetListType].delete(url);
    } else {
      listSets[targetListType].add(url);
    }
  }

  if (listKey === ListKeys.EthPhishingDetectConfig) {
    for (const hash of recentlyAddedC2Domains) {
      listSets.c2DomainBlocklist.add(hash);
    }
    for (const hash of recentlyRemovedC2Domains) {
      listSets.c2DomainBlocklist.delete(hash);
    }
  }

  return {
    c2DomainBlocklist: Array.from(listSets.c2DomainBlocklist),
    allowlist: Array.from(listSets.allowlist),
    blocklist: Array.from(listSets.blocklist),
    fuzzylist: Array.from(listSets.fuzzylist),
    blocklistPaths,
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
 * @param override.c2DomainBlocklist - the optional c2DomainBlocklist to override.
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
  c2DomainBlocklist?: string[];
  fuzzylist?: string[];
  tolerance?: number;
}): PhishingDetectorConfiguration => ({
  allowlist: processDomainList(allowlist),
  blocklist: processDomainList(blocklist),
  fuzzylist: processDomainList(fuzzylist),
  tolerance,
});

/**
 * Processes the configurations for the phishing detector, filtering out any invalid configs.
 *
 * @param configs - The configurations to process.
 * @returns An array of processed and valid configurations.
 */
export const processConfigs = (
  configs: PhishingDetectorList[] = [],
): PhishingDetectorConfiguration[] => {
  return configs
    .filter((config) => {
      try {
        validateConfig(config);
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    })
    .map((config) => ({
      ...config,
      ...getDefaultPhishingDetectorConfig(config),
    }));
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

/**
 * Checks if the hostname and path exists within the list of paths.
 * If there are more than 3 path components, we return true if the first 3 path components exist.
 *
 * @param url - the url to check.
 * @param urlPaths - the paths to check.
 * @returns true if the hostname and path exists in the path list, false otherwise.
 */
export const doesURLPathExist = (
  url: string,
  urlPaths: Record<string, Record<string, string[]>>,
) => {
  const { hostname, pathname } = new URL(url);
  const [path1, path2, path3] = pathname.split('/').filter(Boolean);

  if (!path1) return false;

  const hostnamePath1 = urlPaths[`${hostname}/${path1}`];
  if (!hostnamePath1) return false;
  if (Object.keys(hostnamePath1).length === 0) return true;

  if (!path2) return false;

  const hostnamePath1Path2 = urlPaths[`${hostname}/${path1}`][path2];
  if (!hostnamePath1Path2) return false;
  if (hostnamePath1Path2.length === 0) return true;

  if (!path3) return false;

  return hostnamePath1Path2.includes(path3);
};

/**
 * Adds a URL to the blocklistPaths structure.
 * Parses the URL and adds the path components to the appropriate nested structure.
 *
 * @param url - The URL to add.
 * @param blocklistPaths - The blocklistPaths structure to modify.
 */
const addURLToBlocklistPaths = (
  url: string,
  blocklistPaths: Record<string, Record<string, string[]>>,
) => {
  const { hostname, pathname } = new URL(url);
  const [path1, path2, path3] = pathname.split('/').filter(Boolean);

  if (!path1) return;

  const hostnamePath1Key = `${hostname}/${path1}`;
  if (!blocklistPaths[hostnamePath1Key]) {
    blocklistPaths[hostnamePath1Key] = {};
  }
  if (!path2) {
    // As a URL entry with only one path component, that would take precedence over a URL entry with 2 path components
    // that has the same hostname and path1 component. Hence, we need to remove the values of the hostname/path1 key.
    blocklistPaths[hostnamePath1Key] = {};
    return;
  }

  if (!blocklistPaths[hostnamePath1Key][path2]) {
    blocklistPaths[hostnamePath1Key][path2] = [];
  }
  if (!path3) {
    // As a URL entry with only two path components, that would take precedence over a URL entry with 3 path components
    // that has the same hostname, path1, and path2 components. Hence, we need to remove the values of the hostname/path1/path2 key.
    blocklistPaths[hostnamePath1Key][path2] = [];
    return;
  }

  if (!blocklistPaths[hostnamePath1Key][path2].includes(path3)) {
    blocklistPaths[hostnamePath1Key][path2].push(path3);
  }
};

/**
 * Removes a URL from the blocklistPaths structure.
 * Parses the URL and removes the path components from the appropriate nested structure.
 * Cleans up empty nested objects/arrays.
 *
 * @param url - The URL to remove.
 * @param blocklistPaths - The blocklistPaths structure to modify.
 */
const removeURLFromBlocklistPaths = (
  url: string,
  blocklistPaths: Record<string, Record<string, string[]>>,
) => {
  const { hostname, pathname } = new URL(url);
  const [path1, path2, path3] = pathname.split('/').filter(Boolean);

  if (!path1) return;

  const hostnamePath1Key = `${hostname}/${path1}`;

  if (!blocklistPaths[hostnamePath1Key]) return;

  if (!path2) {
    // Remove the entire hostname/path1 entry
    delete blocklistPaths[hostnamePath1Key];
    return;
  }

  if (!blocklistPaths[hostnamePath1Key][path2]) return;

  if (!path3) {
    // Remove the entire path2 entry
    delete blocklistPaths[hostnamePath1Key][path2];
    if (Object.keys(blocklistPaths[hostnamePath1Key]).length === 0) {
      // If the hostname/path1 key has no values after removing the path2 value,
      // we must remove the hostname/path1 key as the path2 key would never
      // have been added as we do not add path2 keys if the path1 key already exists.
      delete blocklistPaths[hostnamePath1Key];
    }
    return;
  }

  const path3Index = blocklistPaths[hostnamePath1Key][path2].indexOf(path3);
  if (path3Index > -1) {
    blocklistPaths[hostnamePath1Key][path2].splice(path3Index, 1);

    if (blocklistPaths[hostnamePath1Key][path2].length === 0) {
      // Same as removing a hostname/path1 key, if the hostname/path1/path2 key has no values,
      // we must remove it as we do not add path3 value if the path2 key already exists.
      delete blocklistPaths[hostnamePath1Key][path2];
      if (Object.keys(blocklistPaths[hostnamePath1Key]).length === 0) {
        // This is removing the hostname/path1 key if the hostname/path1/path2 key has no values.
        delete blocklistPaths[hostnamePath1Key];
      }
    }
  }
};

/**
 * Generate the SHA-256 hash of a hostname.
 *
 * @param hostname - The hostname to hash.
 * @returns The SHA-256 hash of the hostname.
 */
export const sha256Hash = (hostname: string): string => {
  const hashBuffer = sha256(new TextEncoder().encode(hostname.toLowerCase()));
  return bytesToHex(hashBuffer);
};

/**
 * Extracts the hostname from a URL.
 *
 * @param url - The URL to extract the hostname from.
 * @returns The hostname extracted from the URL, or null if the URL is invalid.
 */
export const getHostnameFromUrl = (url: string): string | null => {
  let hostname;
  try {
    hostname = new URL(url).hostname;
    // above will not throw if 'http://.' is passed. in fact, any string with a dot will pass.
    if (!hostname || hostname.split('.').join('') === '') {
      return null;
    }
  } catch {
    return null;
  }
  return hostname;
};

/**
 * getHostnameFromWebUrl returns the hostname from a web URL.
 * It returns the hostname and a boolean indicating if the hostname is valid.
 *
 * @param url - The web URL to extract the hostname from.
 * @returns A tuple containing the extracted hostname and a boolean indicating if the hostname is valid.
 * @example
 * getHostnameFromWebUrl('https://example.com') // Returns: ['example.com', true]
 * getHostnameFromWebUrl('example.com') // Returns: ['', false]
 * getHostnameFromWebUrl('https://') // Returns: ['', false]
 * getHostnameFromWebUrl('') // Returns: ['', false]
 */
export const getHostnameFromWebUrl = (url: string): [string, boolean] => {
  if (
    !url.toLowerCase().startsWith('http://') &&
    !url.toLowerCase().startsWith('https://')
  ) {
    return ['', false];
  }

  const hostname = getHostnameFromUrl(url);
  return [hostname || '', Boolean(hostname)];
};

/**
 * Generates all possible parent domains up to a specified limit.
 *
 * @param sourceParts - The list of domain parts in normal order (e.g., ['evil', 'domain', 'co', 'uk']).
 * @param limit - The maximum number of parent domains to generate (default is 5).
 * @returns An array of parent domains starting from the base TLD to the most specific subdomain.
 * @example
 * generateParentDomains(['evil', 'domain', 'co', 'uk'], 5)
 * // Returns: ['co.uk', 'domain.co.uk', 'evil.domain.co.uk']
 *
 * generateParentDomains(['uk'], 5)
 * // Returns: ['uk']
 *
 * generateParentDomains(['sub', 'example', 'com'], 5)
 * // Returns: ['example.com', 'sub.example.com']
 */
export const generateParentDomains = (
  sourceParts: string[],
  limit = 5,
): string[] => {
  const domains: string[] = [];

  if (sourceParts.length === 0) {
    return domains;
  }

  if (sourceParts.length === 1) {
    // Single-segment hostname (e.g., 'uk')
    domains.push(sourceParts[0].toLowerCase());
  } else {
    // Start with the base domain or TLD (last two labels, e.g., 'co.uk' or 'example.com')
    const baseDomain = sourceParts.slice(-2).join('.');
    domains.push(baseDomain.toLowerCase());

    // Iteratively add one subdomain level at a time, up to the specified limit
    for (
      let i = sourceParts.length - 3;
      i >= 0 && domains.length < limit;
      i--
    ) {
      const domain = sourceParts.slice(i).join('.');
      domains.push(domain.toLowerCase());
    }
  }

  return domains;
};
