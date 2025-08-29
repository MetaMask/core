import * as sinon from 'sinon';

import { ListKeys, ListNames } from './PhishingController';
import {
  applyDiffs,
  doesURLPathExist,
  domainToParts,
  fetchTimeNow,
  generateParentDomains,
  getHostnameFromUrl,
  getHostnameFromWebUrl,
  matchPartsAgainstList,
  processConfigs,
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
  blocklistPaths: {
    'url1.com/path1': {},
    'url2.com/path': {
      path2: {},
    },
    'url3.com/path1': {
      path2: {
        path3: [],
      },
    },
    'url4.com/path1': {
      path21: {
        path31: ['path41', 'path42'],
        path32: [],
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

  describe('blocklistPaths handling', () => {
    const newAddDiff = (url: string) => ({
      targetList: 'eth_phishing_detect_config.blocklist' as const,
      url,
      timestamp: 1000000000,
    });

    const newRemoveDiff = (url: string, timestampOffset = 1) => ({
      targetList: 'eth_phishing_detect_config.blocklist' as const,
      url,
      timestamp: 1000000000 + timestampOffset, // Higher timestamp to ensure it's processed after additions
      isRemoval: true,
    });

    describe('adding URLs to blocklistPaths', () => {
      describe('when blocklistPaths is empty', () => {
        const emptyListState = {
          ...exampleListState,
          blocklistPaths: {},
        };

        it.each([
          [
            'adds a URL with 1 path component',
            'example.com/path1',
            {
              'example.com/path1': {},
            },
          ],
          [
            'adds a URL with 2 path components',
            'example.com/path1/path2',
            {
              'example.com/path1': {
                path2: {},
              },
            },
          ],
          [
            'adds a URL with 3 path components',
            'example.com/path1/path2/path3',
            {
              'example.com/path1': {
                path2: {
                  path3: [],
                },
              },
            },
          ],
          [
            'adds a URL with 4 path components',
            'example.com/path1/path2/path3/path4',
            {
              'example.com/path1': {
                path2: {
                  path3: ['path4'],
                },
              },
            },
          ],
        ])('%s', (_name, url, expectedBlocklistPaths) => {
          const result = applyDiffs(
            emptyListState,
            [newAddDiff(url)],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual(expectedBlocklistPaths);
        });
      });

      describe('when blocklistPaths has a 1-level entry and the URL shares the hostname/path1', () => {
        const listStateWithOneLevel = {
          ...exampleListState,
          blocklistPaths: {
            'example.com/path1': {},
          },
        };
        it('does not add a URL with 2 path components', () => {
          const result = applyDiffs(
            listStateWithOneLevel,
            [newAddDiff('example.com/path1/path2')],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual(
            listStateWithOneLevel.blocklistPaths,
          );
        });

        it('does not add a URL with 3 path components', () => {
          const result = applyDiffs(
            listStateWithOneLevel,
            [newAddDiff('example.com/path1/path2/path3')],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual(
            listStateWithOneLevel.blocklistPaths,
          );
        });
      });

      describe('when blocklistPaths has a 2-level entry and the URL shares the hostname/path1/path2', () => {
        const listStateWithTwoLevels = {
          ...exampleListState,
          blocklistPaths: {
            'example.com/path1': {
              path2: {},
            },
          },
        };
        it('does not add a URL with 3 path components', () => {
          const result = applyDiffs(
            listStateWithTwoLevels,
            [newAddDiff('example.com/path1/path2/path3')],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual(
            listStateWithTwoLevels.blocklistPaths,
          );
        });

        it('does not duplicate the path2 entry', () => {
          const result = applyDiffs(
            listStateWithTwoLevels,
            [newAddDiff('example.com/path1/path2')],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual(
            listStateWithTwoLevels.blocklistPaths,
          );
        });
      });

      describe('when blocklistPaths has a 3-level entry and the URL shares the hostname/path1/path2/path3', () => {
        const listStateWithThreeLevels = {
          ...exampleListState,
          blocklistPaths: {
            'example.com/path1': {
              path2: {
                path3: [],
              },
            },
          },
        };
        it('does not add a URL with 3 path components when level 3 already blocks everything', () => {
          const result = applyDiffs(
            listStateWithThreeLevels,
            [newAddDiff('example.com/path1/path2/path3')],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual(
            listStateWithThreeLevels.blocklistPaths,
          );
        });

        it('does not add a URL with 4 path components when level 3 already blocks everything', () => {
          const result = applyDiffs(
            listStateWithThreeLevels,
            [newAddDiff('example.com/path1/path2/path3/path4')],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual(
            listStateWithThreeLevels.blocklistPaths,
          );
        });
      });

      describe('when blocklistPaths has 4-level entries and the URL shares the hostname/path1/path2/path3', () => {
        const listStateWithFourLevels = {
          ...exampleListState,
          blocklistPaths: {
            'example.com/path1': {
              path2: {
                path3: ['path41'],
              },
            },
          },
        };
        it('adds a new remaining path to the hostname/path1/path2/path3 array', () => {
          const result = applyDiffs(
            listStateWithFourLevels,
            [newAddDiff('example.com/path1/path2/path3/path42')],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual({
            'example.com/path1': {
              path2: {
                path3: ['path41', 'path42'],
              },
            },
          });
        });
        it('does not add a remaining path if it already exists', () => {
          const result = applyDiffs(
            listStateWithFourLevels,
            [newAddDiff('example.com/path1/path2/path3/path41')],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual(
            listStateWithFourLevels.blocklistPaths,
          );
        });
      });

      it('properly handles URLs with 4+ path components by storing remaining segments', () => {
        const result = applyDiffs(
          exampleListState,
          [newAddDiff('example.com/path1/path2/path3/path4/path5')],
          ListKeys.EthPhishingDetectConfig,
        );
        expect(result.blocklistPaths).toStrictEqual({
          ...exampleListState.blocklistPaths,
          'example.com/path1': {
            path2: {
              path3: ['path4/path5'],
            },
          },
        });
      });

      it('does not add a URL with no path', () => {
        const result = applyDiffs(
          exampleListState,
          [newAddDiff('example.com')],
          ListKeys.EthPhishingDetectConfig,
        );
        expect(result.blocklistPaths).toStrictEqual(
          exampleListState.blocklistPaths,
        );
      });
    });
    describe('removing URLs from blocklistPaths', () => {
      it('removing a non-existent URL does nothing', () => {
        const result = applyDiffs(
          exampleListState,
          [newRemoveDiff('nonexistenturl.com/path1')],
          ListKeys.EthPhishingDetectConfig,
        );
        expect(result.blocklistPaths).toStrictEqual(
          exampleListState.blocklistPaths,
        );
      });

      describe('when blocklistPaths has a level-1 entry', () => {
        const listStateWithOneLevel = {
          ...exampleListState,
          blocklistPaths: {
            'example.com/path1': {},
          },
        };

        it('removes the level-1 entry completely', () => {
          const result = applyDiffs(
            listStateWithOneLevel,
            [newRemoveDiff('example.com/path1')],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual({});
        });

        it('attempting to remove a level-2 path above a level-1 entry does nothing', () => {
          const result = applyDiffs(
            listStateWithOneLevel,
            [newRemoveDiff('example.com/path1/path2')],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual(
            listStateWithOneLevel.blocklistPaths,
          );
        });
      });

      describe('when blocklistPaths has a level-2 entry', () => {
        const listStateWithTwoLevels = {
          ...exampleListState,
          blocklistPaths: {
            'example.com/path1': { path21: {}, path22: {} },
            'url.com/path1': { path2: {} },
          },
        };

        it('removes a specific level-2 entry', () => {
          const result = applyDiffs(
            listStateWithTwoLevels,
            [newRemoveDiff('example.com/path1/path21')],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual({
            'example.com/path1': { path22: {} },
            'url.com/path1': { path2: {} },
          });
        });

        it('removes the entire level-1 entry when removing the last level-2 entry', () => {
          const result = applyDiffs(
            listStateWithTwoLevels,
            [newRemoveDiff('url.com/path1/path2')],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual({
            'example.com/path1': { path21: {}, path22: {} },
          });
        });

        it('attempting to remove a level-3 path above a level-2 entry does nothing', () => {
          const result = applyDiffs(
            listStateWithTwoLevels,
            [newRemoveDiff('example.com/path1/path21/path3')],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual(
            listStateWithTwoLevels.blocklistPaths,
          );
        });

        it('attempting to remove a level-1 path that has a level-2 entry does nothing', () => {
          const result = applyDiffs(
            listStateWithTwoLevels,
            [newRemoveDiff('example.com/path1')],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual(
            listStateWithTwoLevels.blocklistPaths,
          );
        });
      });

      describe('when blocklistPaths has a level-3 entry', () => {
        const listStateWithThreeLevels = {
          ...exampleListState,
          blocklistPaths: {
            'example.com/path1': {
              path2: { path3: [] },
              path5: { path6: [] },
            },
            'other.com/path1': {
              path2: { path3: [] },
            },
          },
        };

        it('removes a specific level-3 entry', () => {
          const result = applyDiffs(
            listStateWithThreeLevels,
            [newRemoveDiff('example.com/path1/path2/path3')],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual({
            'example.com/path1': {
              path5: { path6: [] },
            },
            'other.com/path1': {
              path2: { path3: [] },
            },
          });
        });

        it('removes the level-2 entry when removing the last level-3 entry', () => {
          const result = applyDiffs(
            listStateWithThreeLevels,
            [newRemoveDiff('example.com/path1/path5/path6')],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual({
            'example.com/path1': {
              path2: { path3: [] },
            },
            'other.com/path1': {
              path2: { path3: [] },
            },
          });
        });

        it('removes the entire level-1 entry when removing all level-3 entries', () => {
          const result = applyDiffs(
            listStateWithThreeLevels,
            [newRemoveDiff('other.com/path1/path2/path3')],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual({
            'example.com/path1': {
              path2: { path3: [] },
              path5: { path6: [] },
            },
          });
        });

        it('removing a non-existent level-3 entry does nothing', () => {
          const result = applyDiffs(
            listStateWithThreeLevels,
            [newRemoveDiff('example.com/path1/path2/nonexistent')],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual(
            listStateWithThreeLevels.blocklistPaths,
          );
        });
      });

      it(
        'if we add 2 URLs with the same hostname/path1/path2/path3 but different remaining paths, ' +
          'they should be stored as separate entries and can be removed independently',
        () => {
          const emptyListState = {
            ...exampleListState,
            blocklistPaths: {},
          };
          const result = applyDiffs(
            emptyListState,
            [
              newAddDiff('example.com/path1/path2/path3/path41'),
              newAddDiff('example.com/path1/path2/path3/path42'),
            ],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result.blocklistPaths).toStrictEqual({
            'example.com/path1': {
              path2: {
                path3: ['path41', 'path42'],
              },
            },
          });
          const result2 = applyDiffs(
            result,
            [newRemoveDiff('example.com/path1/path2/path3/path41', 1)],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result2.blocklistPaths).toStrictEqual({
            'example.com/path1': {
              path2: {
                path3: ['path42'],
              },
            },
          });
          const result3 = applyDiffs(
            result2,
            [newRemoveDiff('example.com/path1/path2/path3/path42', 2)],
            ListKeys.EthPhishingDetectConfig,
          );
          expect(result3.blocklistPaths).toStrictEqual({});
        },
      );
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

describe('doesURLPathExist', () => {
  const blocklistPaths: Record<
    string,
    Record<string, Record<string, string[]>>
  > = {
    'blocklist.has4paths.com/path1': { path2: { path3: ['path4'] } }, // explicit fourth-level blocklist
    'blocklist.has3paths.com/path1': { path2: { path3: [] } }, // blocks everything under /path1/path2/path3
    'blocklist.has2paths.com/path1': { path2: {} }, // blocks everything under /path1/path2
    'blocklist.has1path.com/path1': {}, // blocks everything under /path1
  };

  // each testcase is [name, input, expected]
  describe('input has 3 path components', () => {
    it.each([
      [
        'matches when the 3rd path component blocks everything (level 3 blocking)',
        'https://blocklist.has3paths.com/path1/path2/path3',
        true,
      ],
      [
        'matches when the first path component has no children (level 1 blocking)',
        'https://blocklist.has1path.com/path1/path2/path3',
        true,
      ],
      [
        'matches when the first two path components have no children (level 2 blocking)',
        'https://blocklist.has2paths.com/path1/path2/path3',
        true,
      ],
      [
        'does not match when the 3rd path component is not in the blocklist',
        'https://example.com/path1/path2/path3',
        false,
      ],
    ])('should %s', (_name, input, expected) => {
      expect(doesURLPathExist(input, blocklistPaths)).toBe(expected);
    });
  });

  describe('input has 2 path components', () => {
    it.each([
      [
        'matches when the 2nd path component blocks everything (level 2 blocking)',
        'https://blocklist.has2paths.com/path1/path2',
        true,
      ],
      [
        'matches when the 1st path component blocks everything (level 1 blocking)',
        'https://blocklist.has1path.com/path1/path2',
        true,
      ],
      [
        'does not match when the 2nd path component is not in the list',
        'https://blocklist.has2paths.com/path1/path3',
        false,
      ],
      [
        'does not match when the 1st path component is not in the list',
        'https://blocklist.has2paths.com/path2/path2',
        false,
      ],
      [
        'does not match when the 2nd path component has specific level 3 children',
        'https://blocklist.has3paths.com/path1/path2',
        false,
      ],
    ])('should %s', (_name, input, expected) => {
      expect(doesURLPathExist(input, blocklistPaths)).toBe(expected);
    });
  });

  describe('input has 1 path component', () => {
    it.each([
      [
        'matches when the 1st path component has no children',
        'https://blocklist.has1path.com/path1',
        true,
      ],
      [
        'does not match when the 1st path component is not in the list',
        'https://blocklist.has1path.com/path2',
        false,
      ],
      [
        'does not match when the 1st path component has children',
        'https://blocklist.has2paths.com/path1',
        false,
      ],
    ])('should %s', (_name, input, expected) => {
      expect(doesURLPathExist(input, blocklistPaths)).toBe(expected);
    });
  });

  describe('input has 4 path components', () => {
    it.each([
      [
        'matches when the 4th path component is explicitly in the list',
        'https://blocklist.has4paths.com/path1/path2/path3/path4',
        true,
      ],
      [
        'matches when the 3rd path component blocks everything (level 3 blocking)',
        'https://blocklist.has3paths.com/path1/path2/path3/path4',
        true,
      ],
      [
        'matches when the 2nd path component blocks everything (level 2 blocking)',
        'https://blocklist.has2paths.com/path1/path2/path3/path4',
        true,
      ],
      [
        'matches when the 1st path component blocks everything (level 1 blocking)',
        'https://blocklist.has1path.com/path1/path2/path3/path4',
        true,
      ],
      [
        'does not match when the 4th path component is not in the list',
        'https://blocklist.has4paths.com/path1/path2/path3/path5',
        false,
      ],
      [
        'does not match when the domain is not in the blocklist',
        'https://example.com/path1/path2/path3/path4',
        false,
      ],
    ])('should %s', (_name, input, expected) => {
      expect(doesURLPathExist(input, blocklistPaths)).toBe(expected);
    });
  });

  it.each([
    [
      'does not match when the input has no path',
      'https://blocklist.has1path.com',
      false,
    ],
    [
      'matches with trailing slash',
      'https://blocklist.has1path.com/path1/',
      true,
    ],
  ])('should %s', (_name, input, expected) => {
    expect(doesURLPathExist(input, blocklistPaths)).toBe(expected);
  });
});
