import { bytesToHex } from '@noble/hashes/utils';
import { sha256 } from 'ethereum-cryptography/sha256';

import { deleteFromTrie, insertToTrie, deepCopyPathTrie } from './PathTrie';
import type { Hotlist, PhishingListState } from './PhishingController';
import { ListKeys, phishingListKeyNameMap } from './PhishingController';
import type {
  PhishingDetectorList,
  PhishingDetectorConfiguration,
} from './PhishingDetector';
import { DEFAULT_CHAIN_ID_TO_NAME } from './types';
import type { TokenScanCacheData, TokenScanResult } from './types';

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

export const getHostnameAndPathComponents = (
  url: string,
): { hostname: string; pathComponents: string[] } => {
  const urlWithProtocol = url.startsWith('http') ? url : `https://${url}`;
  try {
    const { hostname, pathname } = new URL(urlWithProtocol);
    return {
      hostname: hostname.toLowerCase(),
      pathComponents: pathname
        .split('/')
        .filter(Boolean)
        .map((component) => decodeURIComponent(component)),
    };
  } catch {
    return {
      hostname: '',
      pathComponents: [],
    };
  }
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

  // deep copy of blocklistPaths to avoid mutating the original
  const newBlocklistPaths = deepCopyPathTrie(listState.blocklistPaths);

  for (const { isRemoval, targetList, url, timestamp } of diffsToApply) {
    const targetListType = splitStringByPeriod(targetList)[1];
    if (timestamp > latestDiffTimestamp) {
      latestDiffTimestamp = timestamp;
    }

    if (isRemoval) {
      if (targetListType === 'blocklistPaths') {
        deleteFromTrie(url, newBlocklistPaths);
      } else {
        listSets[targetListType].delete(url);
      }
      continue;
    }

    if (targetListType === 'blocklistPaths') {
      insertToTrie(url, newBlocklistPaths);
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
    blocklistPaths: newBlocklistPaths,
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
  return domain.split('.').reverse();
};

/**
 * Converts a list of domain strings to a list of domain parts.
 *
 * @param list - the list of domain strings to convert.
 * @returns the list of domain parts.
 */
export const processDomainList = (list: string[]): string[][] => {
  return list.reduce<string[][]>((acc, domain) => {
    if (typeof domain !== 'string') {
      console.warn(`Invalid domain value in list: ${JSON.stringify(domain)}`);
      return acc;
    }
    acc.push(domainToParts(domain));
    return acc;
  }, []);
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
}): PhishingDetectorConfiguration => {
  return {
    allowlist: processDomainList(allowlist),
    // We can assume that blocklist is already separated into hostname-only entries
    // and hostname+path entries so we do not need to separate it again.
    blocklist: processDomainList(blocklist),
    fuzzylist: processDomainList(fuzzylist),
    tolerance,
  };
};

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

export const getPathnameFromUrl = (url: string): string => {
  try {
    const { pathname } = new URL(url);
    return pathname;
  } catch {
    return '';
  }
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

/**
 * Builds a cache key for a token scan result.
 *
 * @param chainId - The chain ID.
 * @param address - The token address.
 * @param caseSensitive - When `true`, the address is kept as-is (for chains
 * like Solana where addresses are case-sensitive). When `false` (default),
 * the address is lowercased (appropriate for EVM).
 * @returns The cache key.
 */
export const buildCacheKey = (
  chainId: string,
  address: string,
  caseSensitive = false,
) => {
  const normalizedAddress = caseSensitive ? address : address.toLowerCase();
  return `${chainId.toLowerCase()}:${normalizedAddress}`;
};

/**
 * Resolves the chain name from a chain ID.
 *
 * @param chainId - The chain ID.
 * @param mapping - The mapping of chain IDs to chain names.
 * @returns The chain name.
 */
export const resolveChainName = (
  chainId: string,
  mapping = DEFAULT_CHAIN_ID_TO_NAME,
): string | null => {
  return mapping[chainId.toLowerCase() as keyof typeof mapping] ?? null;
};

/**
 * Split tokens into cached results and tokens that need to be fetched.
 *
 * @param cache - Cache-like object with get method.
 * @param cache.get - Method to retrieve cached data by key.
 * @param chainId - The chain ID.
 * @param tokens - Array of token addresses.
 * @param caseSensitive - When `true`, token addresses are kept as-is (for
 * chains like Solana where addresses are case-sensitive). When `false`
 * (default), addresses are lowercased (appropriate for EVM).
 * @returns Object containing cached results and tokens to fetch.
 */
export const splitCacheHits = (
  cache: { get: (key: string) => TokenScanCacheData | undefined },
  chainId: string,
  tokens: string[],
  caseSensitive = false,
): {
  cachedResults: Record<string, TokenScanResult>;
  tokensToFetch: string[];
} => {
  const cachedResults: Record<string, TokenScanResult> = {};
  const tokensToFetch: string[] = [];

  for (const address of tokens) {
    const normalizedAddress = caseSensitive ? address : address.toLowerCase();
    const key = buildCacheKey(chainId, normalizedAddress, caseSensitive);
    const hit = cache.get(key);
    if (hit) {
      cachedResults[normalizedAddress] = {
        result_type: hit.result_type,
        chain: chainId,
        address: normalizedAddress,
      };
    } else {
      tokensToFetch.push(normalizedAddress);
    }
  }

  return { cachedResults, tokensToFetch };
};
