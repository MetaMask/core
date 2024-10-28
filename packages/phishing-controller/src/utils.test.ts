import * as sinon from 'sinon';

import { ListKeys, ListNames } from './PhishingController';
import {
  applyDiffs,
  domainToParts,
  fetchTimeNow,
  generateParentDomains,
  getHostnameFromUrl,
  matchPartsAgainstList,
  processConfigs,
  // processConfigs,
  processDomainList,
  roundToNearestMinute,
  sha256Hash,
  validateConfig,
} from './utils';

const exampleBlockedUrl = 'https://example-blocked-website.com';
const exampleBlockedUrlOne = 'https://another-example-blocked-website.com';
const exampleBlockedUrlTwo = 'https://final-example-blocked-website.com';
const examplec2DomainBlocklistHashOne =
  '0415f1f12f07ddc4ef7e229da747c6c53a6a6474fbaf295a35d984ec0ece9455';
const exampleBlocklist = [exampleBlockedUrl, exampleBlockedUrlOne];
const examplec2DomainBlocklist = [examplec2DomainBlocklistHashOne];

const exampleAllowUrl = 'https://example-allowlist-item.com';
const exampleFuzzyUrl = 'https://example-fuzzylist-item.com';
const exampleAllowlist = [exampleAllowUrl];
const exampleFuzzylist = [exampleFuzzyUrl];
const exampleListState = {
  blocklist: exampleBlocklist,
  c2DomainBlocklist: examplec2DomainBlocklist,
  fuzzylist: exampleFuzzylist,
  tolerance: 2,
  allowlist: exampleAllowlist,
  version: 0,
  name: ListNames.MetaMask,
  lastUpdated: 0,
};

const exampleAddDiff = {
  targetList: 'eth_phishing_detect_config.blocklist' as const,
  url: exampleBlockedUrlTwo,
  timestamp: 1000000000,
};

const exampleRemoveDiff = {
  targetList: 'eth_phishing_detect_config.blocklist' as const,
  url: exampleBlockedUrlTwo,
  timestamp: 1000000000,
  isRemoval: true,
};

describe('fetchTimeNow', () => {
  it('correctly converts time from milliseconds to seconds', () => {
    const testTime = 1674773005000;
    sinon.useFakeTimers(testTime);
    const result = fetchTimeNow();
    expect(result).toBe(1674773005);
  });
});

describe('applyDiffs', () => {
  it('adds a valid addition diff to the state then sets lastUpdated to be the time of the latest diff', () => {
    const result = applyDiffs(
      exampleListState,
      [exampleAddDiff],
      ListKeys.EthPhishingDetectConfig,
    );
    expect(result).toStrictEqual({
      ...exampleListState,
      blocklist: [...exampleListState.blocklist, exampleBlockedUrlTwo],
      lastUpdated: exampleAddDiff.timestamp,
    });
  });

  it('removes a valid removal diff to the state then sets lastUpdated to be the time of the latest diff', () => {
    const result = applyDiffs(
      exampleListState,
      [exampleAddDiff, exampleRemoveDiff],
      ListKeys.EthPhishingDetectConfig,
    );
    expect(result).toStrictEqual({
      ...exampleListState,
      lastUpdated: exampleRemoveDiff.timestamp,
    });
  });

  it('does not add an addition diff to the state if it is older than the state.lastUpdated time.', () => {
    const testTime = 1674773005000;
    sinon.useFakeTimers(testTime);
    const testExistingState = { ...exampleListState, lastUpdated: 1674773005 };
    const result = applyDiffs(
      testExistingState,
      [exampleAddDiff],
      ListKeys.EthPhishingDetectConfig,
    );
    expect(result).toStrictEqual(testExistingState);
  });

  it('does not remove a url from the state if the removal diff is older than the state.lastUpdated time.', () => {
    const testTime = 1674773005000;
    sinon.useFakeTimers(testTime);
    const testExistingState = {
      ...exampleListState,
      lastUpdated: 1674773005,
    };
    const result = applyDiffs(
      testExistingState,
      [
        { ...exampleAddDiff, timestamp: 1674773009 },
        { ...exampleRemoveDiff, timestamp: 1674773004 },
      ],
      ListKeys.EthPhishingDetectConfig,
    );
    expect(result).toStrictEqual({
      ...exampleListState,
      blocklist: [...exampleListState.blocklist, exampleBlockedUrlTwo],
      lastUpdated: 1674773009,
    });
  });

  it('does not add an addition diff to the state if it does not contain the same targetlist listkey.', () => {
    const testTime = 1674773005000;
    sinon.useFakeTimers(testTime);
    const testExistingState = { ...exampleListState, lastUpdated: 1674773005 };
    const result = applyDiffs(
      testExistingState,
      [exampleAddDiff],
      ListKeys.EthPhishingDetectConfig,
    );
    expect(result).toStrictEqual({
      ...testExistingState,
      name: ListNames.MetaMask,
    });
  });

  it('does not remove a url from the state if it does not contain the same targetlist listkey.', () => {
    const testTime = 1674773005000;
    sinon.useFakeTimers(testTime);
    const testExistingState = {
      ...exampleListState,
      lastUpdated: 1674773005,
    };
    const result = applyDiffs(
      testExistingState,
      [
        { ...exampleAddDiff, timestamp: 1674773005 },
        { ...exampleRemoveDiff, timestamp: 1674773004 },
      ],
      ListKeys.EthPhishingDetectConfig,
    );
    expect(result).toStrictEqual({
      ...testExistingState,
      name: ListNames.MetaMask,
    });
  });
  // New tests for handling C2 domain blocklist
  it('should add hashes to the current C2 domain blocklist', () => {
    exampleListState.c2DomainBlocklist = ['hash1', 'hash2'];
    const result = applyDiffs(
      exampleListState,
      [],
      ListKeys.EthPhishingDetectConfig,
      ['hash3', 'hash4'],
      [],
    );
    expect(result.c2DomainBlocklist).toStrictEqual([
      ...exampleListState.c2DomainBlocklist,
      'hash3',
      'hash4',
    ]);
  });

  it('should remove hashes from the current C2 domain blocklist', () => {
    exampleListState.c2DomainBlocklist = ['hash1', 'hash2'];
    const result = applyDiffs(
      exampleListState,
      [],
      ListKeys.EthPhishingDetectConfig,
      [],
      ['hash2'],
    );
    expect(result.c2DomainBlocklist).toStrictEqual(['hash1']);
  });

  it('should handle adding and removing hashes simultaneously in C2 domain blocklist', () => {
    exampleListState.c2DomainBlocklist = ['hash1', 'hash2'];
    const result = applyDiffs(
      exampleListState,
      [],
      ListKeys.EthPhishingDetectConfig,
      ['hash3'],
      ['hash2'],
    );
    expect(result.c2DomainBlocklist).toStrictEqual(['hash1', 'hash3']);
  });

  it('should not add duplicates in C2 domain blocklist', () => {
    exampleListState.c2DomainBlocklist = ['hash1', 'hash2'];
    const result = applyDiffs(
      exampleListState,
      [],
      ListKeys.EthPhishingDetectConfig,
      ['hash2', 'hash3'],
      [],
    );
    expect(result.c2DomainBlocklist).toStrictEqual(['hash1', 'hash2', 'hash3']);
  });

  it('should handle empty recently added and removed lists for C2 domain blocklist', () => {
    exampleListState.c2DomainBlocklist = ['hash1', 'hash2'];
    const result = applyDiffs(
      exampleListState,
      [],
      ListKeys.EthPhishingDetectConfig,
      [],
      [],
    );
    expect(result.c2DomainBlocklist).toStrictEqual(['hash1', 'hash2']);
  });

  it('should handle removing a non-existent hash in C2 domain blocklist', () => {
    exampleListState.c2DomainBlocklist = ['hash1', 'hash2'];
    const result = applyDiffs(
      exampleListState,
      [],
      ListKeys.EthPhishingDetectConfig,
      [],
      ['hash3'],
    );
    expect(result.c2DomainBlocklist).toStrictEqual(['hash1', 'hash2']);
  });
});

describe('validateConfig', () => {
  it('correctly validates a valid config', () => {
    expect(() =>
      validateConfig({
        allowlist: ['example.com'],
        blocklist: ['sub.example.com'],
        fuzzylist: ['fuzzy.example.com'],
        tolerance: 2,
      }),
    ).not.toThrow();
  });

  it('throws an error if the config is not an object', () => {
    expect(() => validateConfig(null)).toThrow('Invalid config');
  });

  it('throws an error if the config contains a tolerance without a fuzzylist', () => {
    expect(() => validateConfig({ tolerance: 2 })).toThrow(
      'Fuzzylist tolerance provided without fuzzylist',
    );
  });

  it('throws an error if the config contains an invalid name', () => {
    expect(() => validateConfig({ name: 123 })).toThrow(
      "Invalid config parameter: 'name'",
    );
  });

  it('throws an error if the config contains an invalid version', () => {
    expect(() => validateConfig({ version: { foo: 'bar' } })).toThrow(
      "Invalid config parameter: 'version'",
    );
  });
});

describe('domainToParts', () => {
  it('correctly converts a domain string to an array of parts', () => {
    const domain = 'example.com';
    const result = domainToParts(domain);
    expect(result).toStrictEqual(['com', 'example']);
  });

  it('correctly converts a domain string with subdomains to an array of parts', () => {
    const domain = 'sub.example.com';
    const result = domainToParts(domain);
    expect(result).toStrictEqual(['com', 'example', 'sub']);
  });

  it('throws an error if the domain string is invalid', () => {
    // @ts-expect-error testing invalid input
    expect(() => domainToParts(123)).toThrow('123');
  });
});

describe('processConfigs', () => {
  let consoleErrorMock: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorMock = jest.spyOn(console, 'error');
  });

  afterEach(() => {
    consoleErrorMock.mockRestore();
  });

  it('correctly processes a list of valid configs', () => {
    const configs = [
      {
        allowlist: ['example.com'],
        blocklist: ['sub.example.com'],
        fuzzylist: ['fuzzy.example.com'],
        tolerance: 2,
        version: 1,
        name: 'MetaMask',
      },
    ];

    const result = processConfigs(configs);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('MetaMask');

    expect(console.error).not.toHaveBeenCalled();
  });

  it('filters out invalid configs and logs errors', () => {
    const configs = [
      {
        allowlist: ['example.com'],
        blocklist: ['sub.example.com'],
        fuzzylist: [],
        tolerance: 2,
        version: 1,
        name: 'MetaMask',
      },
      {
        allowlist: [],
        version: 1,
        name: undefined,
      },
    ];

    const result = processConfigs(configs);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('MetaMask');

    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('returns an empty array when called with no arguments', () => {
    const result = processConfigs();
    expect(result).toStrictEqual([]);
  });

  it('filters out invalid configs and logs errors with multiple configs', () => {
    const configs = [
      {
        allowlist: ['example.com'],
        blocklist: ['sub.example.com'],
        fuzzylist: [],
        tolerance: 2,
        version: 1,
        name: 'MetaMask',
      },
      {
        allowlist: [],
        version: 1,
        name: undefined,
      },
      {
        allowlist: ['example.com'],
        blocklist: ['sub.example.com'],
        fuzzylist: [],
        tolerance: 2,
        version: 1,
        name: 'name',
      },
      {
        allowlist: [],
        version: 1,
        name: '',
      },
    ];

    const result = processConfigs(configs);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('MetaMask');
    expect(result[1].name).toBe('name');

    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it('returns an empty array when all configs are invalid', () => {
    const configs = [
      {
        allowlist: [],
        version: 1,
        name: undefined,
      },
      {
        blocklist: [],
        fuzzylist: [],
        tolerance: 2,
        version: null,
        name: '',
      },
    ];

    // @ts-expect-error testing invalid input
    const result = processConfigs(configs);

    expect(result).toStrictEqual([]);

    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it('logs errors for invalid tolerance or version types', () => {
    const configs = [
      {
        allowlist: ['example.com'],
        blocklist: ['sub.example.com'],
        tolerance: 'invalid',
        version: 1,
      },
      {
        allowlist: ['example.com'],
        blocklist: ['sub.example.com'],
        tolerance: 2,
        version: {},
      },
    ];

    // @ts-expect-error testing invalid input
    const result = processConfigs(configs);

    expect(result).toStrictEqual([]);

    expect(console.error).toHaveBeenCalledTimes(2);
  });
});

describe('processDomainList', () => {
  it('correctly converts a list of domains to an array of parts', () => {
    const domainList = ['example.com', 'sub.example.com'];

    const result = processDomainList(domainList);

    expect(result).toStrictEqual([
      ['com', 'example'],
      ['com', 'example', 'sub'],
    ]);
  });
});

describe('matchPartsAgainstList', () => {
  it('matches a domain against a list of parts', () => {
    const domainParts = ['com', 'example'];
    const list = [
      ['com', 'example', 'sub'],
      ['com', 'example'],
    ];

    const result = matchPartsAgainstList(domainParts, list);

    expect(result).toStrictEqual(['com', 'example']);
  });

  it('returns undefined if there is no match', () => {
    const domainParts = ['com', 'examplea'];
    const list = [['com', 'exampleb']];

    const result = matchPartsAgainstList(domainParts, list);

    expect(result).toBeUndefined();
  });
});

describe('sha256Hash', () => {
  it('should generate the correct SHA-256 hash for a given domain', async () => {
    const hostname = 'develop.d3bkcslj57l47p.amplifyapp.com';
    const expectedHash =
      '0415f1f12f07ddc4ef7e229da747c6c53a6a6474fbaf295a35d984ec0ece9455';
    const hash = sha256Hash(hostname);
    expect(hash).toBe(expectedHash);
  });

  it('should generate the correct SHA-256 hash for a domain with uppercase letters', async () => {
    const hostname = 'develop.d3bkcslj57l47p.Amplifyapp.com';
    const expectedHash =
      '0415f1f12f07ddc4ef7e229da747c6c53a6a6474fbaf295a35d984ec0ece9455';
    const hash = sha256Hash(hostname);
    expect(hash).toBe(expectedHash);
  });
});

describe('roundToNearestMinute', () => {
  it('should round down to the nearest minute for a typical Unix timestamp with seconds', () => {
    const timestamp = 1622548192; // Represents some time with extra seconds
    const expected = 1622548140; // Expected result after rounding down to the nearest minute
    expect(roundToNearestMinute(timestamp)).toBe(expected);
  });

  it('should return the same timestamp if it is already rounded to the nearest minute', () => {
    const timestamp = 1622548140; // Represents a time already at the exact minute
    const expected = 1622548140;
    expect(roundToNearestMinute(timestamp)).toBe(expected);
  });

  it('should handle Unix timestamp 0 correctly', () => {
    const timestamp = 0; // Edge case: the start of Unix time
    const expected = 0;
    expect(roundToNearestMinute(timestamp)).toBe(expected);
  });

  it('should correctly round down for timestamps very close to the next minute', () => {
    const timestamp = 1622548199; // One second before the next minute
    const expected = 1622548140; // Should still round down to the previous minute
    expect(roundToNearestMinute(timestamp)).toBe(expected);
  });

  it('should handle very large Unix timestamps correctly', () => {
    const timestamp = 1893456000; // A far future Unix timestamp
    const expected = 1893456000; // Expected result after rounding down (already rounded)
    expect(roundToNearestMinute(timestamp)).toBe(expected);
  });

  it('should handle very small Unix timestamps (close to zero)', () => {
    const timestamp = 59; // 59 seconds past the Unix epoch
    const expected = 0; // Should round down to the start of Unix time
    expect(roundToNearestMinute(timestamp)).toBe(expected);
  });

  it('should handle timestamps exactly at the boundary of a minute', () => {
    const timestamp = 1622548200; // Exact boundary of a minute
    const expected = 1622548200; // Should return the same timestamp
    expect(roundToNearestMinute(timestamp)).toBe(expected);
  });

  it('should handle negative Unix timestamps (dates before 1970)', () => {
    const timestamp = -1622548192; // Represents a time before Unix epoch
    const expected = -1622548200; // Expected result after rounding down to the nearest minute
    expect(roundToNearestMinute(timestamp)).toBe(expected);
  });
});

describe('getHostname', () => {
  it('should extract the hostname from a valid URL', () => {
    const url = 'https://www.example.com/path?query=string';
    const expectedHostname = 'www.example.com';
    expect(getHostnameFromUrl(url)).toBe(expectedHostname);
  });

  it('should handle URLs with subdomains correctly', () => {
    const url = 'https://subdomain.example.com/path';
    const expectedHostname = 'subdomain.example.com';
    expect(getHostnameFromUrl(url)).toBe(expectedHostname);
  });

  it('should return null for an invalid URL', () => {
    const url = 'invalid-url';
    expect(getHostnameFromUrl(url)).toBeNull();
  });

  it('should return null for a hostname', () => {
    const url = 'www.example.com';
    expect(getHostnameFromUrl(url)).toBeNull();
  });

  it('should return null for an empty input', () => {
    const url = '';
    expect(getHostnameFromUrl(url)).toBeNull();
  });

  it('should handle URLs with unusual ports correctly', () => {
    const url = 'http://localhost:3000';
    const expectedHostname = 'localhost';
    expect(getHostnameFromUrl(url)).toBe(expectedHostname);
  });

  it('should handle URLs with IP addresses', () => {
    const url = 'http://192.168.1.1';
    const expectedHostname = '192.168.1.1';
    expect(getHostnameFromUrl(url)).toBe(expectedHostname);
  });

  it('should handle URLs with protocols other than HTTP/HTTPS', () => {
    const url = 'ftp://example.com/resource';
    const expectedHostname = 'example.com';
    expect(getHostnameFromUrl(url)).toBe(expectedHostname);
  });

  it('should return null for a URL missing a protocol', () => {
    const url = 'www.example.com';
    expect(getHostnameFromUrl(url)).toBeNull();
  });

  it('should return the correct hostname for URLs with complex query strings', () => {
    const url = 'https://www.example.com/path?query=string&another=param';
    const expectedHostname = 'www.example.com';
    expect(getHostnameFromUrl(url)).toBe(expectedHostname);
  });

  it('should handle URLs with fragments correctly', () => {
    const url = 'https://www.example.com/path#section';
    const expectedHostname = 'www.example.com';
    expect(getHostnameFromUrl(url)).toBe(expectedHostname);
  });
});

/**
 * Extracts the domain name (e.g., example.com) from a given hostname.
 *
 * @param hostname - The full hostname to extract the domain from.
 * @returns The extracted domain name.
 */
const extractDomainName = (hostname: string): string => {
  const parts = domainToParts(hostname.toLowerCase());
  if (parts.length < 2) {
    return hostname;
  }
  const domainParts = parts.slice(0, 2).reverse();
  return domainParts.join('.');
};

describe('extractDomainName', () => {
  it('should extract the primary domain from a standard hostname', () => {
    const hostname = 'www.example.com';
    const expected = 'example.com';
    const result = extractDomainName(hostname);
    expect(result).toBe(expected);
  });

  it('should extract the primary domain from a hostname with multiple subdomains', () => {
    const hostname = 'a.b.c.example.com';
    const expected = 'example.com';
    const result = extractDomainName(hostname);
    expect(result).toBe(expected);
  });

  it('should return single-segment hostnames as-is', () => {
    const hostname = 'localhost';
    const expected = 'localhost';
    const result = extractDomainName(hostname);
    expect(result).toBe(expected);
  });

  it('should extract the last two segments from a hostname with a multi-level TLD', () => {
    const hostname = 'sub.example.co.uk';
    const expected = 'co.uk';
    const result = extractDomainName(hostname);
    expect(result).toBe(expected);
  });

  it('should handle hostnames with uppercase letters correctly', () => {
    const hostname = 'ExAmPlE.CoM';
    const expected = 'example.com';
    const result = extractDomainName(hostname);
    expect(result).toBe(expected);
  });

  it('should return an empty string when given an empty hostname', () => {
    const hostname = '';
    const expected = '';
    const result = extractDomainName(hostname);
    expect(result).toBe(expected);
  });
});

describe('generateParentDomains', () => {
  it('should return an empty array when sourceParts is empty', () => {
    expect(generateParentDomains([], 5)).toStrictEqual([]);
  });

  it('should handle single-segment hostname correctly', () => {
    const sourceParts = ['uk'];
    const expected = ['uk'];
    expect(generateParentDomains(sourceParts)).toStrictEqual(expected);
  });

  it('should handle two-segment hostname correctly', () => {
    const sourceParts = ['co', 'uk'];
    const expected = ['co.uk'];
    expect(generateParentDomains(sourceParts)).toStrictEqual(expected);
  });

  it('should handle three-segment hostname correctly', () => {
    const sourceParts = ['domain', 'co', 'uk'];
    const expected = ['co.uk', 'domain.co.uk'];
    expect(generateParentDomains(sourceParts)).toStrictEqual(expected);
  });

  it('should handle four-segment hostname within limit', () => {
    const sourceParts = ['evil', 'domain', 'co', 'uk'];
    const expected = ['co.uk', 'domain.co.uk', 'evil.domain.co.uk'];
    expect(generateParentDomains(sourceParts)).toStrictEqual(expected);
  });

  it('should handle five-segment hostname within limit', () => {
    const sourceParts = ['fifth', 'evil', 'domain', 'co', 'uk'];
    const expected = [
      'co.uk',
      'domain.co.uk',
      'evil.domain.co.uk',
      'fifth.evil.domain.co.uk',
    ];
    expect(generateParentDomains(sourceParts, 5)).toStrictEqual(expected);
  });

  it('should handle hostnames exceeding the limit', () => {
    const sourceParts = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const limit = 5;
    const expected = ['f.g', 'e.f.g', 'd.e.f.g', 'c.d.e.f.g', 'b.c.d.e.f.g'];
    expect(generateParentDomains(sourceParts, limit)).toStrictEqual(expected);
  });

  it('should lowercase all domain parts', () => {
    const sourceParts = ['Evil', 'Domain', 'Co', 'Uk'];
    const expected = ['co.uk', 'domain.co.uk', 'evil.domain.co.uk'];
    expect(generateParentDomains(sourceParts)).toStrictEqual(expected);
  });

  it('should handle hostnames with empty labels correctly', () => {
    const sourceParts = ['a', '', 'b', 'example', 'com'];
    // Assuming that empty strings are already filtered out before calling the function
    // Thus, sourceParts should be ['a', 'b', 'example', 'com']
    const filteredSourceParts = sourceParts.filter(Boolean);
    const expected = ['example.com', 'b.example.com', 'a.b.example.com'];
    expect(generateParentDomains(filteredSourceParts)).toStrictEqual(expected);
  });

  it('should handle numeric labels correctly', () => {
    const sourceParts = ['123', 'example', 'com'];
    const expected = ['example.com', '123.example.com'];
    expect(generateParentDomains(sourceParts)).toStrictEqual(expected);
  });

  it('should handle special characters in labels correctly', () => {
    const sourceParts = ['sub-domain', 'example', 'com'];
    const expected = ['example.com', 'sub-domain.example.com'];
    expect(generateParentDomains(sourceParts)).toStrictEqual(expected);
  });

  it('should handle mixed case and empty labels correctly', () => {
    const sourceParts = ['A', '', 'B', 'Example', 'Com'];
    // After filtering: ['A', 'B', 'Example', 'Com']
    const filteredSourceParts = sourceParts.filter(Boolean);
    const expected = ['example.com', 'b.example.com', 'a.b.example.com'];
    expect(generateParentDomains(filteredSourceParts)).toStrictEqual(expected);
  });

  it('should handle trailing empty labels correctly', () => {
    const sourceParts = ['a', 'b', 'c', ''];
    // After filtering: ['a', 'b', 'c']
    const filteredSourceParts = sourceParts.filter(Boolean);
    const expected = ['b.c', 'a.b.c'];
    expect(generateParentDomains(filteredSourceParts)).toStrictEqual(expected);
  });
});
