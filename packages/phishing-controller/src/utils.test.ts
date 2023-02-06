import sinon from 'sinon';
import { applyDiffs, fetchTimeNow } from './utils';
import { HotlistDiff } from './PhishingController';

const exampleBlockedUrl = 'https://example-blocked-website.com';
const exampleBlockedUrlOne = 'https://another-example-blocked-website.com';
const exampleBlockedUrlTwo = 'https://final-example-blocked-website.com';
const exampleBlocklist = [exampleBlockedUrl, exampleBlockedUrlOne];

const exampleAllowUrl = 'https://example-allowlist-item.com';
const exampleFuzzyUrl = 'https://example-fuzzylist-item.com';
const exampleAllowlist = [exampleAllowUrl];
const exampleFuzzylist = [exampleFuzzyUrl];
const exampleListState = {
  blocklist: exampleBlocklist,
  fuzzylist: exampleFuzzylist,
  tolerance: 2,
  allowlist: exampleAllowlist,
  version: 0,
  name: 'MetaMask',
  lastUpdated: 0,
};

const exampleAddDiff = {
  targetList: 'blocklist',
  url: exampleBlockedUrlTwo,
  timestamp: 1000000000,
} as HotlistDiff;

const exampleRemoveDiff = {
  targetList: 'blocklist',
  url: exampleBlockedUrlTwo,
  timestamp: 1000000000,
  isRemoval: true,
} as HotlistDiff;

describe('fetchTimeNow', () => {
  it('correctly converts time from milliseconds to seconds', () => {
    const testTime = 1674773005000;
    sinon.useFakeTimers(testTime);
    const result = fetchTimeNow();
    expect(result).toBe(1674773005);
  });
});

describe('applyDiffs', () => {
  it('adds a valid addition diff to the state', () => {
    const testTime = 1674773005000;
    sinon.useFakeTimers(testTime);
    const result = applyDiffs(exampleListState, [exampleAddDiff]);
    expect(result).toStrictEqual({
      ...exampleListState,
      blocklist: [...exampleListState.blocklist, exampleBlockedUrlTwo],
      lastUpdated: 1674773005,
    });
  });

  it('removes a valid removal diff to the state', () => {
    const testTime = 1674773005000;
    sinon.useFakeTimers(testTime);
    const result = applyDiffs(exampleListState, [
      exampleAddDiff,
      exampleRemoveDiff,
    ]);
    expect(result).toStrictEqual({
      ...exampleListState,
      lastUpdated: 1674773005,
    });
  });

  it('does not add an addition diff to the state if it is older than the state.lastUpdated time.', () => {
    const testTime = 1674773005000;
    sinon.useFakeTimers(testTime);
    const testExistingState = { ...exampleListState, lastUpdated: 1674773005 };
    const result = applyDiffs(testExistingState, [exampleAddDiff]);
    expect(result).toStrictEqual(testExistingState);
  });

  it('does not remove a url from the state if the removal diff is older than the state.lastUpdated time.', () => {
    const testTime = 1674773005000;
    sinon.useFakeTimers(testTime);
    const testExistingState = {
      ...exampleListState,
      lastUpdated: 1674773005,
    };
    const result = applyDiffs(testExistingState, [
      { ...exampleAddDiff, timestamp: 1674773009 },
      { ...exampleRemoveDiff, timestamp: 1674773004 },
    ]);
    expect(result).toStrictEqual({
      ...exampleListState,
      blocklist: [...exampleListState.blocklist, exampleBlockedUrlTwo],
      lastUpdated: 1674773005,
    });
  });
});
