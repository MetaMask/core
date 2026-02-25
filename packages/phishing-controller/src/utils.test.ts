import { ListKeys, ListNames } from './PhishingController';
import type { PhishingListState } from './PhishingController';
import type { TokenScanResultType } from './types';
import {
  applyDiffs,
  buildCacheKey,
  domainToParts,
  fetchTimeNow,
  generateParentDomains,
  getHostnameAndPathComponents,
  getHostnameFromUrl,
  getHostnameFromWebUrl,
  matchPartsAgainstList,
  processConfigs,
  processDomainList,
  resolveChainName,
  roundToNearestMinute,
  sha256Hash,
  splitCacheHits,
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
  blocklistPaths: {
    'url1.com': {},
    'url2.com': {
      path2: {},
    },
    'url3.com': {
      path2: {
        path3: {},
      },
    },
    'url4.com': {
      path21: {
        path31: {
          path41: {},
          path42: {},
        },
        path32: {},
      },
      path22: {},
    },
  },
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
  afterEach(() => {
    jest.useRealTimers();
  });

  it('correctly converts time from milliseconds to seconds', () => {
    const testTime = 1674773005000;
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'queueMicrotask'],
      now: testTime,
    });
    const result = fetchTimeNow();
    expect(result).toBe(1674773005);
  });
});

describe('applyDiffs', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

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
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'queueMicrotask'],
      now: testTime,
    });
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
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'queueMicrotask'],
      now: testTime,
    });
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
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'queueMicrotask'],
      now: testTime,
    });
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
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'queueMicrotask'],
      now: testTime,
    });
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

  describe('blocklistPaths handling', () => {
    const newAddDiff = (url: string) => ({
      targetList: 'eth_phishing_detect_config.blocklistPaths' as const,
      url,
      timestamp: 1000000000,
    });

    const newRemoveDiff = (url: string) => ({
      targetList: 'eth_phishing_detect_config.blocklistPaths' as const,
      url,
      timestamp: 1000000001,
      isRemoval: true,
    });

    describe('adding URLs to blocklistPaths', () => {
      let listState: PhishingListState;

      beforeEach(() => {
        listState = {
          ...exampleListState,
          blocklistPaths: {},
        };
      });

      it('adds a URL to the path trie', () => {
        const result = applyDiffs(
          listState,
          [newAddDiff('example.com/path1/path2')],
          ListKeys.EthPhishingDetectConfig,
        );
        expect(result.blocklistPaths).toStrictEqual({
          'example.com': {
            path1: {
              path2: {},
            },
          },
        });
      });

      it('adds sibling paths', () => {
        const firstResult = applyDiffs(
          listState,
          [newAddDiff('example.com/path1')],
          ListKeys.EthPhishingDetectConfig,
        );
        const result = applyDiffs(
          firstResult,
          [{ ...newAddDiff('example.com/path2'), timestamp: 1000000001 }],
          ListKeys.EthPhishingDetectConfig,
        );
        expect(result.blocklistPaths).toStrictEqual({
          'example.com': {
            path1: {},
            path2: {},
          },
        });
      });

      it('is idempotent', () => {
        applyDiffs(
          listState,
          [newAddDiff('example.com/path1/path2')],
          ListKeys.EthPhishingDetectConfig,
        );
        const result = applyDiffs(
          listState,
          [newAddDiff('example.com/path1/path2')],
          ListKeys.EthPhishingDetectConfig,
        );
        expect(result.blocklistPaths).toStrictEqual({
          'example.com': {
            path1: {
              path2: {},
            },
          },
        });
      });

      it('prunes descendants when adding ancestor', () => {
        applyDiffs(
          listState,
          [newAddDiff('example.com/path1/path2/path3')],
          ListKeys.EthPhishingDetectConfig,
        );
        const result = applyDiffs(
          listState,
          [newAddDiff('example.com/path1')],
          ListKeys.EthPhishingDetectConfig,
        );
        expect(result.blocklistPaths).toStrictEqual({
          'example.com': {
            path1: {},
          },
        });
      });

      it('does not insert deeper path if ancestor exists', () => {
        const firstResult = applyDiffs(
          listState,
          [newAddDiff('example.com/path1')],
          ListKeys.EthPhishingDetectConfig,
        );
        const result = applyDiffs(
          firstResult,
          [newAddDiff('example.com/path1/path2')],
          ListKeys.EthPhishingDetectConfig,
        );
        expect(result.blocklistPaths).toStrictEqual({
          'example.com': {
            path1: {},
          },
        });
      });

      it('does not insert if no path is provided', () => {
        const result = applyDiffs(
          listState,
          [newAddDiff('example.com')],
          ListKeys.EthPhishingDetectConfig,
        );
        expect(result.blocklistPaths).toStrictEqual({});
      });
    });

    describe('removing URLs from blocklistPaths', () => {
      let listState: PhishingListState;

      beforeEach(() => {
        listState = {
          ...exampleListState,
          blocklistPaths: {
            'example.com': {
              path11: {
                path2: {},
              },
              path12: {},
            },
          },
        };
      });

      it('deletes a path', () => {
        const result = applyDiffs(
          listState,
          [newRemoveDiff('example.com/path11/path2')],
          ListKeys.EthPhishingDetectConfig,
        );
        expect(result.blocklistPaths).toStrictEqual({
          'example.com': {
            path12: {},
          },
        });
      });

      it('deletes all paths', () => {
        const firstResult = applyDiffs(
          listState,
          [newRemoveDiff('example.com/path11/path2')],
          ListKeys.EthPhishingDetectConfig,
        );
        const result = applyDiffs(
          firstResult,
          [{ ...newRemoveDiff('example.com/path12'), timestamp: 1000000002 }],
          ListKeys.EthPhishingDetectConfig,
        );
        expect(result.blocklistPaths).toStrictEqual({});
      });

      it('deletes descendants if the path is not terminal', () => {
        const result = applyDiffs(
          listState,
          [newRemoveDiff('example.com/path11')],
          ListKeys.EthPhishingDetectConfig,
        );
        expect(result.blocklistPaths).toStrictEqual({
          'example.com': {
            path12: {},
          },
        });
      });

      it('is idempotent', () => {
        applyDiffs(
          listState,
          [newRemoveDiff('example.com/path11/path2')],
          ListKeys.EthPhishingDetectConfig,
        );
        const result = applyDiffs(
          listState,
          [newRemoveDiff('example.com/path11/path2')],
          ListKeys.EthPhishingDetectConfig,
        );
        expect(result.blocklistPaths).toStrictEqual({
          'example.com': {
            path12: {},
          },
        });
      });

      it('does nothing if path does not exist', () => {
        const result = applyDiffs(
          listState,
          [newRemoveDiff('example.com/nonexistent')],
          ListKeys.EthPhishingDetectConfig,
        );
        expect(result.blocklistPaths).toStrictEqual(listState.blocklistPaths);
      });

      it('does nothing if hostname does not exist', () => {
        const result = applyDiffs(
          listState,
          [newRemoveDiff('nonexistent.com/path11/path2')],
          ListKeys.EthPhishingDetectConfig,
        );
        expect(result.blocklistPaths).toStrictEqual(listState.blocklistPaths);
      });

      it('does nothing if no path is provided', () => {
        const result = applyDiffs(
          listState,
          [newRemoveDiff('example.com')],
          ListKeys.EthPhishingDetectConfig,
        );
        expect(result.blocklistPaths).toStrictEqual(listState.blocklistPaths);
      });
    });
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
        blocklistPaths: {
          'malicious.com': {
            path: {},
          },
        },
        fuzzylist: ['fuzzy.example.com'],
        tolerance: 2,
        version: 1,
        name: 'MetaMask',
      },
    ];

    const result = processConfigs(configs);

    expect(result).toHaveLength(1);
    expect(result[0].blocklist).toStrictEqual(
      Array.of(['com', 'example', 'sub']),
    );
    expect(result[0].blocklistPaths).toStrictEqual({
      'malicious.com': {
        path: {},
      },
    });
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
  let consoleWarnMock: jest.SpyInstance;

  beforeEach(() => {
    consoleWarnMock = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleWarnMock.mockRestore();
  });

  it('correctly converts a list of domains to an array of parts', () => {
    const domainList = ['example.com', 'sub.example.com'];

    const result = processDomainList(domainList);

    expect(result).toStrictEqual([
      ['com', 'example'],
      ['com', 'example', 'sub'],
    ]);
  });

  it('filters out invalid values and logs warnings', () => {
    const domainList = [
      'example.com',
      123,
      'valid.com',
      null,
      undefined,
      -2342394,
    ];

    const result = processDomainList(domainList as unknown as string[]);

    expect(result).toStrictEqual([
      ['com', 'example'],
      ['com', 'valid'],
    ]);

    expect(consoleWarnMock).toHaveBeenCalledTimes(4);
    expect(consoleWarnMock).toHaveBeenCalledWith(
      'Invalid domain value in list: 123',
    );
    expect(consoleWarnMock).toHaveBeenCalledWith(
      'Invalid domain value in list: null',
    );
    expect(consoleWarnMock).toHaveBeenCalledWith(
      'Invalid domain value in list: undefined',
    );
    expect(consoleWarnMock).toHaveBeenCalledWith(
      'Invalid domain value in list: -2342394',
    );
  });

  it('returns empty array when all values are invalid', () => {
    const domainList = [123, null, {}];

    const result = processDomainList(domainList as unknown as string[]);

    expect(result).toStrictEqual([]);
    expect(consoleWarnMock).toHaveBeenCalledTimes(3);
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

describe('getHostnameFromURL', () => {
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
    let url = 'invalid-url';
    expect(getHostnameFromUrl(url)).toBeNull();

    url = 'http://.';
    expect(getHostnameFromUrl(url)).toBeNull();

    url = 'http://..';
    expect(getHostnameFromUrl(url)).toBeNull();

    url = 'about:blank';
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

describe('getHostnameFromWebUrl', () => {
  // each testcase is [input, expectedHostname, expectedValid]
  const testCases = [
    ['https://www.example.com/path?query=string', 'www.example.com', true],
    ['https://subdomain.example.com/path', 'subdomain.example.com', true],
    ['invalid-url', '', false],
    ['http://.', '', false],
    ['http://..', '', false],
    ['about:blank', '', false],
    ['www.example.com', '', false],
    ['', '', false],
    ['http://localhost:3000', 'localhost', true],
    ['http://192.168.1.1', '192.168.1.1', true],
    ['ftp://example.com/resource', '', false],
    ['www.example.com', '', false],
    [
      'https://www.example.com/path?query=string&another=param',
      'www.example.com',
      true,
    ],
    ['https://www.example.com/path#section', 'www.example.com', true],
  ] as const;

  it.each(testCases)(
    'for URL %s should return [%s, %s]',
    (input, expectedHostname, expectedValid) => {
      const [hostname, isValid] = getHostnameFromWebUrl(input);
      expect(hostname).toBe(expectedHostname);
      expect(isValid).toBe(expectedValid);
    },
  );
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

describe('buildCacheKey', () => {
  it('should create cache key with lowercase chainId and address', () => {
    const chainId = '0x1';
    const address = '0x1234ABCD';
    const result = buildCacheKey(chainId, address);
    expect(result).toBe('0x1:0x1234abcd');
  });

  it('should handle already lowercase inputs', () => {
    const chainId = '0xa';
    const address = '0xdeadbeef';
    const result = buildCacheKey(chainId, address);
    expect(result).toBe('0xa:0xdeadbeef');
  });

  it('should handle mixed case inputs', () => {
    const chainId = '0X89';
    const address = '0XaBcDeF123456';
    const result = buildCacheKey(chainId, address);
    expect(result).toBe('0x89:0xabcdef123456');
  });

  it('should preserve address casing when caseSensitive is true', () => {
    const chainId = 'solana';
    const address = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
    const result = buildCacheKey(chainId, address, true);
    expect(result).toBe('solana:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
  });

  it('should lowercase address when caseSensitive is false (default)', () => {
    const chainId = 'solana';
    const address = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
    const result = buildCacheKey(chainId, address);
    expect(result).toBe('solana:gh9zwemdlj8dsckntktqpbnwlnnbjuszag9vp2kgtkjr');
  });
});

describe('resolveChainName', () => {
  it('should resolve known chain IDs to chain names', () => {
    expect(resolveChainName('0x1')).toBe('ethereum');
    expect(resolveChainName('0x89')).toBe('polygon');
    expect(resolveChainName('0xa')).toBe('optimism');
  });

  it('should handle case insensitive chain IDs', () => {
    expect(resolveChainName('0X1')).toBe('ethereum');
    expect(resolveChainName('0X89')).toBe('polygon');
    expect(resolveChainName('0XA')).toBe('optimism');
  });

  it('should resolve non-EVM chain names', () => {
    expect(resolveChainName('solana')).toBe('solana');
  });

  it('should return null for unknown chain IDs', () => {
    expect(resolveChainName('0x999')).toBeNull();
    expect(resolveChainName('unknown')).toBeNull();
    expect(resolveChainName('')).toBeNull();
  });
});

describe('splitCacheHits', () => {
  const mockCache = {
    get: jest.fn(),
  };

  beforeEach(() => {
    mockCache.get.mockClear();
  });

  it('should split tokens correctly when some are cached', () => {
    const chainId = '0x1';
    const tokens = ['0xTOKEN1', '0xTOKEN2', '0xTOKEN3'];

    // Mock cache to return data for token1 only
    const mockResponses = new Map([
      ['0x1:0xtoken1', { result_type: 'Benign' as TokenScanResultType }],
    ]);
    mockCache.get.mockImplementation((key: string) => mockResponses.get(key));

    const result = splitCacheHits(mockCache, chainId, tokens);

    expect(result.cachedResults).toStrictEqual({
      '0xtoken1': {
        result_type: 'Benign',
        chain: '0x1',
        address: '0xtoken1',
      },
    });
    expect(result.tokensToFetch).toStrictEqual(['0xtoken2', '0xtoken3']);
  });

  it('should handle all tokens being cached', () => {
    const chainId = '0x89';
    const tokens = ['0xTOKEN1', '0xTOKEN2'];

    mockCache.get.mockReturnValue({
      result_type: 'Warning' as TokenScanResultType,
    });

    const result = splitCacheHits(mockCache, chainId, tokens);

    expect(result.cachedResults).toStrictEqual({
      '0xtoken1': {
        result_type: 'Warning',
        chain: '0x89',
        address: '0xtoken1',
      },
      '0xtoken2': {
        result_type: 'Warning',
        chain: '0x89',
        address: '0xtoken2',
      },
    });
    expect(result.tokensToFetch).toStrictEqual([]);
  });

  it('should handle no tokens being cached', () => {
    const chainId = '0xa';
    const tokens = ['0xTOKEN1', '0xTOKEN2'];

    mockCache.get.mockReturnValue(undefined);

    const result = splitCacheHits(mockCache, chainId, tokens);

    expect(result.cachedResults).toStrictEqual({});
    expect(result.tokensToFetch).toStrictEqual(['0xtoken1', '0xtoken2']);
  });

  it('should handle empty token list', () => {
    const chainId = '0x1';
    const tokens: string[] = [];

    const result = splitCacheHits(mockCache, chainId, tokens);

    expect(result.cachedResults).toStrictEqual({});
    expect(result.tokensToFetch).toStrictEqual([]);
    expect(mockCache.get).not.toHaveBeenCalled();
  });

  it('should normalize addresses to lowercase', () => {
    const chainId = '0X1';
    const tokens = ['0XTOKEN1'];

    mockCache.get.mockReturnValue({
      result_type: 'Malicious' as TokenScanResultType,
    });

    const result = splitCacheHits(mockCache, chainId, tokens);

    expect(mockCache.get).toHaveBeenCalledWith('0x1:0xtoken1');
    expect(result.cachedResults).toHaveProperty('0xtoken1');
    expect(result.cachedResults['0xtoken1'].address).toBe('0xtoken1');
  });

  it('should preserve address casing when caseSensitive is true', () => {
    const chainId = 'solana';
    const tokens = ['Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'];

    mockCache.get.mockReturnValue(undefined);

    const result = splitCacheHits(mockCache, chainId, tokens, true);

    // tokensToFetch should preserve original casing
    expect(result.tokensToFetch).toStrictEqual([
      'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
    ]);
  });

  it('should return cached result with preserved casing when caseSensitive is true', () => {
    const chainId = 'solana';
    const token = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';

    mockCache.get.mockReturnValue({
      result_type: 'Benign' as TokenScanResultType,
    });

    const result = splitCacheHits(mockCache, chainId, [token], true);

    expect(result.cachedResults[token]).toStrictEqual({
      result_type: 'Benign',
      chain: 'solana',
      address: token,
    });
    expect(result.tokensToFetch).toStrictEqual([]);
  });
});

describe('getHostnameAndPathComponents', () => {
  it.each([
    [
      'https://example.com/path1/path2',
      { hostname: 'example.com', pathComponents: ['path1', 'path2'] },
    ],
    [
      'example.com/path1/path2',
      { hostname: 'example.com', pathComponents: ['path1', 'path2'] },
    ],
    ['example.com', { hostname: 'example.com', pathComponents: [] }],
    [
      'EXAMPLE.COM/Path1/PATH2',
      { hostname: 'example.com', pathComponents: ['Path1', 'PATH2'] },
    ],
    ['', { hostname: '', pathComponents: [] }],
    [
      'example.sub.com/path1/path2',
      { hostname: 'example.sub.com', pathComponents: ['path1', 'path2'] },
    ],
    [
      'example.com/%70%61%74%68',
      { hostname: 'example.com', pathComponents: ['path'] },
    ],
  ])('parses %s correctly', (input, expected) => {
    const result = getHostnameAndPathComponents(input);
    expect(result).toStrictEqual(expected);
  });
});
