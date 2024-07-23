import * as sinon from 'sinon';

import { ListKeys, ListNames } from './PhishingController';
import {
  applyDiffs,
  domainToParts,
  fetchTimeNow,
  matchPartsAgainstList,
  processConfigs,
  processDomainList,
  sha256Hash,
  updateRequestBlocklist,
  validateConfig,
} from './utils';

const exampleBlockedUrl = 'https://example-blocked-website.com';
const exampleBlockedUrlOne = 'https://another-example-blocked-website.com';
const exampleBlockedUrlTwo = 'https://final-example-blocked-website.com';
const exampleRequestBlocklistHashOne =
  '0415f1f12f07ddc4ef7e229da747c6c53a6a6474fbaf295a35d984ec0ece9455';
const exampleBlocklist = [exampleBlockedUrl, exampleBlockedUrlOne];
const emaampleRequestBlocklist = [exampleRequestBlocklistHashOne];

const exampleAllowUrl = 'https://example-allowlist-item.com';
const exampleFuzzyUrl = 'https://example-fuzzylist-item.com';
const exampleAllowlist = [exampleAllowUrl];
const exampleFuzzylist = [exampleFuzzyUrl];
const exampleListState = {
  blocklist: exampleBlocklist,
  requestBlocklist: emaampleRequestBlocklist,
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
      ListKeys.PhishfortHotlist,
    );
    expect(result).toStrictEqual({
      ...testExistingState,
      name: ListNames.Phishfort,
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
        { ...exampleAddDiff, timestamp: 1674773009 },
        { ...exampleRemoveDiff, timestamp: 1674773004 },
      ],
      ListKeys.PhishfortHotlist,
    );
    expect(result).toStrictEqual({
      ...testExistingState,
      name: ListNames.Phishfort,
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

  it('throws an error if the domain string is invalid', () => {
    // @ts-expect-error testing invalid input
    expect(() => domainToParts(123)).toThrow('123');
  });
});

describe('processConfigs', () => {
  it('correctly converts a list of configs to a list of processed configs', () => {
    const configs = [
      {
        allowlist: ['example.com'],
        blocklist: ['sub.example.com'],
        fuzzylist: ['fuzzy.example.com'],
        tolerance: 2,
      },
    ];

    const result = processConfigs(configs);

    expect(result).toStrictEqual([
      {
        allowlist: [['com', 'example']],
        blocklist: [['com', 'example', 'sub']],
        fuzzylist: [['com', 'example', 'fuzzy']],
        tolerance: 2,
      },
    ]);
  });

  it('can be called with no arguments', () => {
    expect(processConfigs()).toStrictEqual([]);
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

describe('updateRequestBlocklist', () => {
  it('should add hashes to the current list', () => {
    const currentList = ['hash1', 'hash2'];
    const recentlyAdded = ['hash3', 'hash4'];
    const recentlyRemoved: string[] = [];
    const expectedList = ['hash1', 'hash2', 'hash3', 'hash4'];

    const result = updateRequestBlocklist(
      currentList,
      recentlyAdded,
      recentlyRemoved,
    );
    expect(result).toStrictEqual(expectedList);
  });

  it('should remove hashes from the current list', () => {
    const currentList = ['hash1', 'hash2', 'hash3'];
    const recentlyAdded: string[] = [];
    const recentlyRemoved = ['hash2'];
    const expectedList = ['hash1', 'hash3'];

    const result = updateRequestBlocklist(
      currentList,
      recentlyAdded,
      recentlyRemoved,
    );
    expect(result).toStrictEqual(expectedList);
  });

  it('should handle adding and removing hashes simultaneously', () => {
    const currentList = ['hash1', 'hash2'];
    const recentlyAdded = ['hash3'];
    const recentlyRemoved = ['hash2'];
    const expectedList = ['hash1', 'hash3'];

    const result = updateRequestBlocklist(
      currentList,
      recentlyAdded,
      recentlyRemoved,
    );
    expect(result).toStrictEqual(expectedList);
  });

  it('should not add duplicates', () => {
    const currentList = ['hash1', 'hash2'];
    const recentlyAdded = ['hash2', 'hash3'];
    const recentlyRemoved: string[] = [];
    const expectedList = ['hash1', 'hash2', 'hash3'];

    const result = updateRequestBlocklist(
      currentList,
      recentlyAdded,
      recentlyRemoved,
    );
    expect(result).toStrictEqual(expectedList);
  });

  it('should handle empty recently added and removed lists', () => {
    const currentList = ['hash1', 'hash2'];
    const recentlyAdded: string[] = [];
    const recentlyRemoved: string[] = [];
    const expectedList = ['hash1', 'hash2'];

    const result = updateRequestBlocklist(
      currentList,
      recentlyAdded,
      recentlyRemoved,
    );
    expect(result).toStrictEqual(expectedList);
  });

  it('should handle removing a non-existent hash', () => {
    const currentList = ['hash1', 'hash2'];
    const recentlyAdded: string[] = [];
    const recentlyRemoved = ['hash3'];
    const expectedList = ['hash1', 'hash2'];

    const result = updateRequestBlocklist(
      currentList,
      recentlyAdded,
      recentlyRemoved,
    );
    expect(result).toStrictEqual(expectedList);
  });
});
