import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { strict as assert } from 'assert';
import nock, { cleanAll, isDone, pendingMocks } from 'nock';

import {
  ListNames,
  METAMASK_HOTLIST_DIFF_FILE,
  METAMASK_STALELIST_FILE,
  PhishingController,
  PHISHING_CONFIG_BASE_URL,
  CLIENT_SIDE_DETECION_BASE_URL,
  C2_DOMAIN_BLOCKLIST_ENDPOINT,
  PHISHING_DETECTION_BASE_URL,
  PHISHING_DETECTION_SCAN_ENDPOINT,
  PHISHING_DETECTION_BULK_SCAN_ENDPOINT,
  SECURITY_ALERTS_BASE_URL,
  ADDRESS_SCAN_ENDPOINT,
  APPROVALS_ENDPOINT,
} from './PhishingController';
import type {
  PhishingControllerOptions,
  BulkPhishingDetectionScanResponse,
  PhishingControllerMessenger,
} from './PhishingController';
import {
  createMockStateChangePayload,
  createMockTransaction,
  formatHostnameToUrl,
  TEST_ADDRESSES,
} from './tests/utils';
import type { PhishingDetectionScanResult, AddressScanResult } from './types';
import {
  PhishingDetectorResultType,
  RecommendedAction,
  AddressScanResultType,
} from './types';
import { getHostnameFromUrl } from './utils';

const controllerName = 'PhishingController';

type AllPhishingControllerActions =
  MessengerActions<PhishingControllerMessenger>;

type AllPhishingControllerEvents = MessengerEvents<PhishingControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllPhishingControllerActions,
  AllPhishingControllerEvents,
  RootMessenger
>;

/**
 * Creates and returns a root messenger for testing
 *
 * @returns A messenger instance
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
}

/**
 * Constructs a messenger for use in PhishingController tests.
 *
 * @returns A messenger and the root messenger.
 */
function setupMessenger(): {
  messenger: PhishingControllerMessenger;
  rootMessenger: RootMessenger;
} {
  const rootMessenger = getRootMessenger();

  const messenger = new Messenger<
    typeof controllerName,
    AllPhishingControllerActions,
    AllPhishingControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    actions: [],
    events: ['TransactionController:stateChange'],
    messenger,
  });

  return {
    messenger,
    rootMessenger,
  };
}

/**
 * Construct a Phishing Controller with the given options if any.
 *
 * @param options - The Phishing Controller options.
 * @returns The constructed Phishing Controller.
 */
function getPhishingController(options?: Partial<PhishingControllerOptions>) {
  const { messenger } = setupMessenger();
  return new PhishingController({
    messenger,
    ...options,
  });
}

describe('PhishingController', () => {
  afterEach(() => {
    jest.useRealTimers();
    cleanAll();
  });

  it('should have no default phishing lists', () => {
    const controller = getPhishingController();
    expect(controller.state.phishingLists).toStrictEqual([]);
  });

  it('should default to an empty whitelist', () => {
    const controller = getPhishingController();
    expect(controller.state.whitelist).toStrictEqual([]);
  });
  it('should return false if the hostname is in the whitelist', async () => {
    const whitelistedHostname = 'example.com';

    const controller = getPhishingController();
    controller.bypass(formatHostnameToUrl(whitelistedHostname));
    const result = controller.test(whitelistedHostname);

    expect(result).toMatchObject({
      result: false,
      type: PhishingDetectorResultType.All,
    });
  });
  it('should return false if the URL is in the whitelist', async () => {
    const whitelistedHostname = 'example.com';

    const controller = getPhishingController();
    controller.bypass(formatHostnameToUrl(whitelistedHostname));
    const result = controller.test(`https://${whitelistedHostname}/path`);

    expect(result).toMatchObject({
      result: false,
      type: PhishingDetectorResultType.All,
    });
  });

  it('returns false if the URL is in the whitelistPaths', async () => {
    const whitelistedURL = 'https://example.com/path';

    const controller = getPhishingController();
    controller.bypass(whitelistedURL);
    const result = controller.test(whitelistedURL);
    expect(result).toMatchObject({
      result: false,
      type: PhishingDetectorResultType.All,
    });
  });

  it('should return false if the URL is in the allowlist', async () => {
    const allowlistedHostname = 'example.com';

    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          allowlist: [allowlistedHostname],
          blocklist: [],
          blocklistPaths: [],
          fuzzylist: [],
          tolerance: 0,
          version: 0,
          lastUpdated: 1,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(200, { data: [] });

    nock(CLIENT_SIDE_DETECION_BASE_URL)
      .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
      .reply(200, {
        recentlyAdded: [],
        recentlyRemoved: [],
        lastFetchedAt: 1,
      });

    const controller = getPhishingController();
    await controller.updateStalelist();
    const result = controller.test(`https://${allowlistedHostname}/path`);

    expect(result).toMatchObject({
      result: false,
      type: PhishingDetectorResultType.Allowlist,
    });
  });

  it('does not call update stalelist or hotlist upon construction', async () => {
    const nockScope = nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          blocklist: [],
          blocklistPaths: [],
          fuzzylist: [],
          allowlist: [],
          tolerance: 0,
          version: 0,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(200, { data: [] });

    getPhishingController();

    expect(nockScope.isDone()).toBe(false);
  });

  it('should not re-request when an update is in progress', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
    const nockScope = nock(PHISHING_CONFIG_BASE_URL)
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .delay(500) // delay promise resolution to generate "pending" state that lasts long enough to test.
      .reply(200, {
        data: [
          {
            url: 'this-should-not-be-in-default-blocklist.com',
            timestamp: 1,
            isRemoval: true,
            targetList: 'eth_phishing_detect_config.blocklist',
          },
          {
            url: 'this-should-not-be-in-default-blocklist.com',
            timestamp: 2,
            targetList: 'eth_phishing_detect_config.blocklist',
          },
        ],
      });

    const controller = getPhishingController({
      hotlistRefreshInterval: 10,
      state: {
        phishingLists: [
          {
            allowlist: [],
            blocklist: [],
            c2DomainBlocklist: [],
            blocklistPaths: {},
            fuzzylist: [],
            tolerance: 0,
            lastUpdated: 1,
            name: ListNames.MetaMask,
            version: 0,
          },
        ],
      },
    });
    jest.advanceTimersByTime(1000 * 10);
    const pendingUpdate = controller.updateHotlist();

    expect(controller.isHotlistOutOfDate()).toBe(true);
    const pendingUpdateTwo = controller.updateHotlist();
    expect(nockScope.activeMocks()).toHaveLength(1);

    // Cleanup pending operations
    await pendingUpdate;
    await pendingUpdateTwo;
  });

  describe('maybeUpdateState', () => {
    let nockScope: nock.Scope;
    beforeEach(() => {
      nockScope = nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(200, {
          data: {
            blocklist: ['this-should-not-be-in-default-blocklist.com'],
            blocklistPaths: [],
            fuzzylist: [],
            allowlist: ['this-should-not-be-in-default-allowlist.com'],
            tolerance: 0,
            version: 0,
            lastUpdated: 1,
          },
        })
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
        .reply(200, {
          data: [
            {
              url: 'this-should-not-be-in-default-blocklist.com',
              timestamp: 2,
              isRemoval: true,
              targetList: 'eth_phishing_detect_config.blocklist',
            },
            {
              url: 'this-should-not-be-in-default-blocklist.com',
              timestamp: 3,
              targetList: 'eth_phishing_detect_config.blocklist',
            },
          ],
        });

      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
        .reply(200, {
          recentlyAdded: [],
          recentlyRemoved: [],
          lastFetchedAt: 1,
        });
    });

    it('should not have stalelist be out of date immediately after maybeUpdateState is called', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      jest.advanceTimersByTime(1000 * 10);
      expect(controller.isStalelistOutOfDate()).toBe(true);
      await controller.maybeUpdateState();
      expect(controller.isStalelistOutOfDate()).toBe(false);
      expect(nockScope.isDone()).toBe(true);
    });

    it('should not be out of date after maybeUpdateStalelist is called but before refresh interval has passed', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      jest.advanceTimersByTime(1000 * 10);
      expect(controller.isStalelistOutOfDate()).toBe(true);
      await controller.maybeUpdateState();
      jest.advanceTimersByTime(1000 * 5);
      expect(controller.isStalelistOutOfDate()).toBe(false);
      expect(nockScope.isDone()).toBe(true);
    });

    it('should still be out of date while update is in progress', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      jest.advanceTimersByTime(1000 * 10);
      // do not wait
      const maybeUpdatePhisingListPromise = controller.maybeUpdateState();
      expect(controller.isStalelistOutOfDate()).toBe(true);
      await maybeUpdatePhisingListPromise;
      expect(controller.isStalelistOutOfDate()).toBe(false);
      jest.advanceTimersByTime(1000 * 10);
      expect(controller.isStalelistOutOfDate()).toBe(true);
      expect(nockScope.isDone()).toBe(true);
    });

    it('should call update only if it is out of date, otherwise it should not call update', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      expect(controller.isStalelistOutOfDate()).toBe(false);
      await controller.maybeUpdateState();
      expect(
        controller.test(
          formatHostnameToUrl('this-should-not-be-in-default-blocklist.com'),
        ),
      ).toMatchObject({
        result: false,
        type: PhishingDetectorResultType.All,
      });

      expect(
        controller.test(
          formatHostnameToUrl('this-should-not-be-in-default-allowlist.com'),
        ),
      ).toMatchObject({
        result: false,
        type: PhishingDetectorResultType.All,
      });

      jest.advanceTimersByTime(1000 * 10);
      await controller.maybeUpdateState();

      expect(
        controller.test(
          formatHostnameToUrl('this-should-not-be-in-default-blocklist.com'),
        ),
      ).toMatchObject({
        result: true,
        type: PhishingDetectorResultType.Blocklist,
      });

      expect(
        controller.test(
          formatHostnameToUrl('this-should-not-be-in-default-allowlist.com'),
        ),
      ).toMatchObject({
        result: false,
        type: PhishingDetectorResultType.Allowlist,
      });

      expect(nockScope.isDone()).toBe(true);
    });

    it('should not have hotlist be out of date immediately after maybeUpdateState is called', async () => {
      nockScope = nock(PHISHING_CONFIG_BASE_URL)
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
        .reply(200, {
          data: [
            {
              url: 'this-should-not-be-in-default-blocklist.com',
              timestamp: 1,
              isRemoval: true,
              targetList: 'eth_phishing_detect_config.blocklist',
            },
            {
              url: 'this-should-not-be-in-default-blocklist.com',
              timestamp: 2,
              targetList: 'eth_phishing_detect_config.blocklist',
            },
          ],
        });
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'queueMicrotask'],
        now: 50,
      });
      const controller = getPhishingController({
        hotlistRefreshInterval: 10,
        stalelistRefreshInterval: 50,
      });
      jest.advanceTimersByTime(1000 * 10);
      expect(controller.isHotlistOutOfDate()).toBe(true);
      await controller.maybeUpdateState();
      expect(controller.isHotlistOutOfDate()).toBe(false);
    });

    it('should not have c2DomainBlocklist be out of date immediately after maybeUpdateState is called', async () => {
      nockScope = nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
        .reply(200, {
          recentlyAdded: [],
          recentlyRemoved: [],
          lastFetchedAt: 1,
        });
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        c2DomainBlocklistRefreshInterval: 10,
      });
      jest.advanceTimersByTime(1000 * 10);
      expect(controller.isC2DomainBlocklistOutOfDate()).toBe(true);
      await controller.maybeUpdateState();
      expect(controller.isC2DomainBlocklistOutOfDate()).toBe(false);
    });

    it('replaces existing phishing lists with completely new list from phishing detection API', async () => {
      const { messenger } = setupMessenger();
      const controller = new PhishingController({
        messenger,
        stalelistRefreshInterval: 10,
        state: {
          phishingLists: [
            {
              allowlist: ['initial-safe-site.com'],
              blocklist: ['new-phishing-site.com'],
              blocklistPaths: {},
              c2DomainBlocklist: [],
              fuzzylist: ['new-fuzzy-site.com'],
              tolerance: 2,
              version: 1,
              lastUpdated: 1,
              name: ListNames.MetaMask,
            },
          ],
          whitelist: [],
          whitelistPaths: {},
          hotlistLastFetched: 0,
          stalelistLastFetched: 0,
          c2DomainBlocklistLastFetched: 0,
          urlScanCache: {},
        },
      });

      cleanAll();
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(200, {
          data: {
            blocklist: [],
            blocklistPaths: ['example.com/path'],
            fuzzylist: ['new-fuzzy-site.com'],
            allowlist: ['new-safe-site.com'],
            tolerance: 2,
            version: 2,
            lastUpdated: 2,
          },
        })
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/${2}`)
        .reply(200, {
          data: [],
        });
      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
        .reply(200, {
          recentlyAdded: [],
          recentlyRemoved: [],
          lastFetchedAt: 2,
        });

      // Force the stalelist to be out of date and trigger update
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      jest.advanceTimersByTime(1000 * 10);

      await controller.maybeUpdateState();

      expect(controller.state.phishingLists).toStrictEqual([
        {
          allowlist: ['new-safe-site.com'],
          blocklist: [],
          blocklistPaths: {
            'example.com': {
              path: {},
            },
          },
          c2DomainBlocklist: [],
          fuzzylist: ['new-fuzzy-site.com'],
          tolerance: 2,
          version: 2,
          lastUpdated: 2,
          name: ListNames.MetaMask,
        },
      ]);

      jest.useRealTimers();
    });
  });

  describe('isStalelistOutOfDate', () => {
    it('should not be out of date upon construction', () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });

      expect(controller.isStalelistOutOfDate()).toBe(false);
    });

    it('should not be out of date after some of the refresh interval has passed', () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      jest.advanceTimersByTime(1000 * 5);

      expect(controller.isStalelistOutOfDate()).toBe(false);
    });

    it('should be out of date after the refresh interval has passed', () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      jest.advanceTimersByTime(1000 * 10);

      expect(controller.isStalelistOutOfDate()).toBe(true);
    });

    it('should be out of date if the refresh interval has passed and an update is in progress', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      jest.advanceTimersByTime(1000 * 10);
      const pendingUpdate = controller.updateStalelist();

      expect(controller.isStalelistOutOfDate()).toBe(true);

      // Cleanup pending operations
      await pendingUpdate;
    });

    it('should not be out of date if the phishing lists were just updated', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      await controller.updateStalelist();

      expect(controller.isStalelistOutOfDate()).toBe(false);
    });

    it('should not be out of date if the phishing lists were recently updated', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      await controller.updateStalelist();
      jest.advanceTimersByTime(1000 * 5);

      expect(controller.isStalelistOutOfDate()).toBe(false);
    });

    it('should be out of date if the time elapsed since the last update equals the refresh interval', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      await controller.updateStalelist();
      jest.advanceTimersByTime(1000 * 10);

      expect(controller.isStalelistOutOfDate()).toBe(true);
    });
  });

  describe('isHotlistOutOfDate', () => {
    it('should not be out of date upon construction', () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        hotlistRefreshInterval: 10,
      });

      expect(controller.isHotlistOutOfDate()).toBe(false);
    });

    it('should not be out of date after some of the refresh interval has passed', () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        hotlistRefreshInterval: 10,
      });
      jest.advanceTimersByTime(1000 * 5);

      expect(controller.isHotlistOutOfDate()).toBe(false);
    });

    it('should be out of date after the refresh interval has passed', () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        hotlistRefreshInterval: 10,
      });
      jest.advanceTimersByTime(1000 * 10);

      expect(controller.isHotlistOutOfDate()).toBe(true);
    });

    it('should be out of date if the refresh interval has passed and an update is in progress', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        hotlistRefreshInterval: 10,
        state: {
          phishingLists: [
            {
              allowlist: [],
              blocklist: [],
              c2DomainBlocklist: [],
              blocklistPaths: {},
              fuzzylist: [],
              tolerance: 0,
              lastUpdated: 1,
              name: ListNames.MetaMask,
              version: 0,
            },
          ],
        },
      });
      jest.advanceTimersByTime(1000 * 10);
      const pendingUpdate = controller.updateHotlist();

      expect(controller.isHotlistOutOfDate()).toBe(true);

      // Cleanup pending operations
      await pendingUpdate;
    });

    it('should not be out of date if the phishing lists were just updated', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        hotlistRefreshInterval: 10,
      });
      await controller.updateHotlist();

      expect(controller.isHotlistOutOfDate()).toBe(false);
    });

    it('should not be out of date if the phishing lists were recently updated', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        hotlistRefreshInterval: 10,
      });
      await controller.updateHotlist();
      jest.advanceTimersByTime(1000 * 5);

      expect(controller.isHotlistOutOfDate()).toBe(false);
    });

    it('should be out of date if the time elapsed since the last update equals the refresh interval', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        hotlistRefreshInterval: 10,
      });
      await controller.updateHotlist();
      jest.advanceTimersByTime(1000 * 10);

      expect(controller.isHotlistOutOfDate()).toBe(true);
    });
  });

  describe('isC2DomainBlocklistOutOfDate', () => {
    it('should not be out of date upon construction', () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        c2DomainBlocklistRefreshInterval: 10,
      });

      expect(controller.isC2DomainBlocklistOutOfDate()).toBe(false);
    });

    it('should not be out of date after some of the refresh interval has passed', () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        c2DomainBlocklistRefreshInterval: 10,
      });
      jest.advanceTimersByTime(1000 * 5);

      expect(controller.isC2DomainBlocklistOutOfDate()).toBe(false);
    });

    it('should be out of date after the refresh interval has passed', () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        c2DomainBlocklistRefreshInterval: 10,
      });
      jest.advanceTimersByTime(1000 * 10);

      expect(controller.isC2DomainBlocklistOutOfDate()).toBe(true);
    });

    it('should be out of date if the refresh interval has passed and an update is in progress', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        c2DomainBlocklistRefreshInterval: 10,
      });
      jest.advanceTimersByTime(1000 * 10);
      const pendingUpdate = controller.updateC2DomainBlocklist();

      expect(controller.isC2DomainBlocklistOutOfDate()).toBe(true);

      // Cleanup pending operations
      await pendingUpdate;
    });

    it('should not be out of date if the C2 domain blocklist was just updated', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        c2DomainBlocklistRefreshInterval: 10,
      });
      await controller.updateC2DomainBlocklist();

      expect(controller.isC2DomainBlocklistOutOfDate()).toBe(false);
    });

    it('should not be out of date if the C2 domain blocklist was recently updated', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        c2DomainBlocklistRefreshInterval: 10,
      });
      await controller.updateC2DomainBlocklist();
      jest.advanceTimersByTime(1000 * 5);

      expect(controller.isC2DomainBlocklistOutOfDate()).toBe(false);
    });

    it('should be out of date if the time elapsed since the last update equals the refresh interval', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
      const controller = getPhishingController({
        c2DomainBlocklistRefreshInterval: 10,
      });
      await controller.updateC2DomainBlocklist();
      jest.advanceTimersByTime(1000 * 10);

      expect(controller.isC2DomainBlocklistOutOfDate()).toBe(true);
    });
  });

  it('should be able to change the stalelistRefreshInterval', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
    const controller = getPhishingController({ stalelistRefreshInterval: 10 });
    controller.setStalelistRefreshInterval(0);

    expect(controller.isStalelistOutOfDate()).toBe(true);
  });

  it('should be able to change the hotlistRefreshInterval', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
    const controller = getPhishingController({
      hotlistRefreshInterval: 10,
    });
    controller.setHotlistRefreshInterval(0);

    expect(controller.isHotlistOutOfDate()).toBe(true);
  });

  it('should be able to change the c2DomainBlocklistRefreshInterval', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
    const controller = getPhishingController({
      c2DomainBlocklistRefreshInterval: 10,
    });
    controller.setC2DomainBlocklistRefreshInterval(0);

    expect(controller.isC2DomainBlocklistOutOfDate()).toBe(true);
  });

  it('should return negative result for safe domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          allowlist: ['metamask.io'],
          blocklist: [],
          blocklistPaths: [],
          fuzzylist: [],
          tolerance: 0,
          version: 0,
          lastUpdated: 1,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(200, { data: [] });

    nock(CLIENT_SIDE_DETECION_BASE_URL)
      .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
      .reply(200, {
        recentlyAdded: [],
        recentlyRemoved: [],
        lastFetchedAt: 1,
      });

    const controller = getPhishingController();
    await controller.updateStalelist();
    expect(controller.test(formatHostnameToUrl('metamask.io'))).toMatchObject({
      result: false,
      type: PhishingDetectorResultType.Allowlist,
      name: ListNames.MetaMask,
    });
  });

  it('should return negative result for safe unicode domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          allowlist: [],
          blocklist: [],
          blocklistPaths: [],
          fuzzylist: [],
          tolerance: 0,
          version: 0,
          lastUpdated: 1,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(200, { data: [] });

    const controller = getPhishingController();
    await controller.updateStalelist();
    expect(controller.test(formatHostnameToUrl('i❤.ws'))).toMatchObject({
      result: false,
      type: PhishingDetectorResultType.All,
    });
  });

  it('should return negative result for safe punycode domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          allowlist: [],
          blocklist: [],
          blocklistPaths: [],
          fuzzylist: [],
          tolerance: 0,
          version: 0,
          lastUpdated: 1,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(200, { data: [] });

    const controller = getPhishingController();
    await controller.updateStalelist();
    expect(controller.test(formatHostnameToUrl('xn--i-7iq.ws'))).toMatchObject({
      result: false,
      type: PhishingDetectorResultType.All,
    });
  });

  it('should return positive result for unsafe domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          allowlist: [],
          blocklist: ['etnerscan.io'],
          blocklistPaths: [],
          fuzzylist: [],
          tolerance: 0,
          version: 0,
          lastUpdated: 1,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(200, { data: [] });

    nock(CLIENT_SIDE_DETECION_BASE_URL)
      .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
      .reply(200, {
        recentlyAdded: [],
        recentlyRemoved: [],
        lastFetchedAt: 1,
      });

    const controller = getPhishingController();
    await controller.updateStalelist();
    expect(controller.test(formatHostnameToUrl('etnerscan.io'))).toMatchObject({
      result: true,
      type: PhishingDetectorResultType.Blocklist,
      name: ListNames.MetaMask,
    });
  });

  it('should return positive result for unsafe unicode domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          blocklist: ['xn--myetherallet-4k5fwn.com'],
          blocklistPaths: [],
          allowlist: [],
          fuzzylist: [],
          tolerance: 0,
          version: 0,
          lastUpdated: 1,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(200, { data: [] });

    nock(CLIENT_SIDE_DETECION_BASE_URL)
      .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
      .reply(200, {
        recentlyAdded: [],
        recentlyRemoved: [],
        lastFetchedAt: 1,
      });

    const controller = getPhishingController();
    await controller.updateStalelist();
    expect(
      controller.test(formatHostnameToUrl('myetherẉalletṭ.com')),
    ).toMatchObject({
      result: true,
      type: PhishingDetectorResultType.Blocklist,
      name: ListNames.MetaMask,
    });
  });

  it('should return positive result for unsafe punycode domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          allowlist: [],
          blocklist: ['xn--myetherallet-4k5fwn.com'],
          blocklistPaths: [],
          fuzzylist: [],
          tolerance: 0,
          version: 0,
          lastUpdated: 1,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(200, { data: [] });

    nock(CLIENT_SIDE_DETECION_BASE_URL)
      .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
      .reply(200, {
        recentlyAdded: [],
        recentlyRemoved: [],
        lastFetchedAt: 1,
      });

    const controller = getPhishingController();
    await controller.updateStalelist();
    expect(
      controller.test(formatHostnameToUrl('xn--myetherallet-4k5fwn.com')),
    ).toMatchObject({
      result: true,
      type: PhishingDetectorResultType.Blocklist,
      name: ListNames.MetaMask,
    });
  });

  it('should return positive result for unsafe unicode domain from the MetaMask hotlist (blocklist)', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          allowlist: [],
          blocklist: [],
          blocklistPaths: [],
          fuzzylist: [],
          tolerance: 0,
          version: 0,
          lastUpdated: 1,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(200, {
        data: [
          {
            url: 'e4d600ab9141b7a9859511c77e63b9b3.com',
            timestamp: 2,
            targetList: 'eth_phishing_detect_config.blocklist',
          },
        ],
      });

    nock(CLIENT_SIDE_DETECION_BASE_URL)
      .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
      .reply(200, {
        recentlyAdded: [],
        recentlyRemoved: [],
        lastFetchedAt: 1,
      });

    const controller = getPhishingController();
    await controller.updateStalelist();
    expect(
      controller.test(
        formatHostnameToUrl('e4d600ab9141b7a9859511c77e63b9b3.com'),
      ),
    ).toMatchObject({
      result: true,
      type: PhishingDetectorResultType.Blocklist,
      name: ListNames.MetaMask,
    });
  });

  it('should return negative result for unsafe unicode domain if the MetaMask hotlist (blocklist) returns 500', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          allowlist: [],
          blocklist: [],
          blocklistPaths: [],
          fuzzylist: [],
          tolerance: 0,
          version: 0,
          lastUpdated: 1,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(500);

    const controller = getPhishingController();
    await controller.updateStalelist();
    expect(
      controller.test(
        formatHostnameToUrl('e4d600ab9141b7a9859511c77e63b9b3.com'),
      ),
    ).toMatchObject({
      result: false,
      type: PhishingDetectorResultType.All,
    });
  });

  it('should return negative result for safe fuzzylist domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          allowlist: ['opensea.io'],
          blocklist: [],
          blocklistPaths: [],
          fuzzylist: [],
          tolerance: 0,
          version: 0,
          lastUpdated: 1,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(200, { data: [] });

    nock(CLIENT_SIDE_DETECION_BASE_URL)
      .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
      .reply(200, {
        recentlyAdded: [],
        recentlyRemoved: [],
        lastFetchedAt: 1,
      });

    const controller = getPhishingController();
    await controller.updateStalelist();
    expect(controller.test(formatHostnameToUrl('opensea.io'))).toMatchObject({
      result: false,
      type: PhishingDetectorResultType.Allowlist,
      name: ListNames.MetaMask,
    });
  });

  it('should return positive result for domain very close to fuzzylist from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          allowlist: ['opensea.io'],
          blocklist: [],
          blocklistPaths: [],
          fuzzylist: ['opensea.io'],
          tolerance: 2,
          version: 0,
          lastUpdated: 1,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(200, { data: [] });

    nock(CLIENT_SIDE_DETECION_BASE_URL)
      .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
      .reply(200, {
        recentlyAdded: [],
        recentlyRemoved: [],
        lastFetchedAt: 1,
      });

    const controller = getPhishingController();
    await controller.updateStalelist();
    expect(controller.test(formatHostnameToUrl('ohpensea.io'))).toMatchObject({
      result: true,
      type: PhishingDetectorResultType.Fuzzy,
      name: ListNames.MetaMask,
    });
  });

  it('should return negative result for domain not very close to fuzzylist from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          allowlist: ['opensea.io'],
          blocklist: [],
          blocklistPaths: [],
          fuzzylist: ['opensea.io'],
          tolerance: 0,
          version: 0,
          lastUpdated: 1,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(200, { data: [] });
    const controller = getPhishingController();
    await controller.updateStalelist();
    expect(
      controller.test(
        formatHostnameToUrl('this-is-the-official-website-of-opensea.io'),
      ),
    ).toMatchObject({
      result: false,
      type: PhishingDetectorResultType.All,
    });
  });

  it('should bypass a given domain, and return a negative result', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          allowlist: [],
          blocklist: ['electrum.mx'],
          blocklistPaths: [],
          fuzzylist: [],
          tolerance: 2,
          version: 0,
          lastUpdated: 1,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(200, { data: [] });

    nock(CLIENT_SIDE_DETECION_BASE_URL)
      .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
      .reply(200, {
        recentlyAdded: [],
        recentlyRemoved: [],
        lastFetchedAt: 1,
      });

    const controller = getPhishingController();
    await controller.updateStalelist();
    const unsafeDomain = 'electrum.mx';
    assert.equal(
      controller.test(formatHostnameToUrl(unsafeDomain)).result,
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(formatHostnameToUrl(unsafeDomain));
    expect(controller.test(formatHostnameToUrl(unsafeDomain))).toMatchObject({
      result: false,
      type: PhishingDetectorResultType.All,
    });
  });

  it('should ignore second attempt to bypass a domain, and still return a negative result', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          allowlist: [],
          blocklist: ['electrum.mx'],
          blocklistPaths: [],
          fuzzylist: [],
          tolerance: 0,
          version: 0,
          lastUpdated: 1,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(200, { data: [] });

    nock(CLIENT_SIDE_DETECION_BASE_URL)
      .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
      .reply(200, {
        recentlyAdded: [],
        recentlyRemoved: [],
        lastFetchedAt: 1,
      });

    const controller = getPhishingController();
    await controller.updateStalelist();
    const unsafeDomain = 'electrum.mx';
    assert.equal(
      controller.test(formatHostnameToUrl(unsafeDomain)).result,
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(formatHostnameToUrl(unsafeDomain));
    controller.bypass(formatHostnameToUrl(unsafeDomain));
    expect(controller.test(formatHostnameToUrl(unsafeDomain))).toMatchObject({
      result: false,
      type: PhishingDetectorResultType.All,
    });
  });

  it('should bypass a given unicode domain, and return a negative result', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          allowlist: [],
          blocklist: ['xn--myetherallet-4k5fwn.com'],
          blocklistPaths: [],
          fuzzylist: [],
          tolerance: 0,
          version: 0,
          lastUpdated: 1,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(200, { data: [] });

    nock(CLIENT_SIDE_DETECION_BASE_URL)
      .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
      .reply(200, {
        recentlyAdded: [],
        recentlyRemoved: [],
        lastFetchedAt: 1,
      });

    const controller = getPhishingController();
    await controller.updateStalelist();
    const unsafeDomain = 'myetherẉalletṭ.com';
    assert.equal(
      controller.test(formatHostnameToUrl(unsafeDomain)).result,
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(formatHostnameToUrl(unsafeDomain));
    expect(controller.test(formatHostnameToUrl(unsafeDomain))).toMatchObject({
      result: false,
      type: PhishingDetectorResultType.All,
    });
  });

  it('should bypass a given punycode domain, and return a negative result', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          allowlist: [],
          blocklist: ['xn--myetherallet-4k5fwn.com'],
          blocklistPaths: [],
          fuzzylist: [],
          tolerance: 0,
          version: 0,
          lastUpdated: 1,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(200, { data: [] });

    nock(CLIENT_SIDE_DETECION_BASE_URL)
      .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
      .reply(200, {
        recentlyAdded: [],
        recentlyRemoved: [],
        lastFetchedAt: 1,
      });

    const controller = getPhishingController();
    await controller.updateStalelist();
    const unsafeDomain = 'xn--myetherallet-4k5fwn.com';
    assert.equal(
      controller.test(formatHostnameToUrl(unsafeDomain)).result,
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(formatHostnameToUrl(unsafeDomain));
    expect(controller.test(formatHostnameToUrl(unsafeDomain))).toMatchObject({
      result: false,
      type: PhishingDetectorResultType.All,
    });
  });

  it('returns positive result for unsafe hostname+pathname from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          allowlist: [],
          blocklist: [],
          blocklistPaths: ['example.com/path'],
          fuzzylist: [],
          tolerance: 0,
          version: 0,
          lastUpdated: 1,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(200, { data: [] });

    nock(CLIENT_SIDE_DETECION_BASE_URL)
      .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
      .reply(200, {
        recentlyAdded: [],
        recentlyRemoved: [],
        lastFetchedAt: 1,
      });

    const controller = getPhishingController();
    await controller.updateStalelist();
    expect(controller.test('https://example.com/path')).toMatchObject({
      result: true,
      type: PhishingDetectorResultType.Blocklist,
    });
  });

  it('returns negative result if the hostname+pathname is in the whitelistPaths', async () => {
    const controller = getPhishingController({
      state: {
        phishingLists: [
          {
            allowlist: [],
            blocklist: [],
            c2DomainBlocklist: [],
            blocklistPaths: {
              'example.com': {
                path: {},
              },
            },
            fuzzylist: [],
            tolerance: 0,
            version: 0,
            lastUpdated: 0,
            name: ListNames.MetaMask,
          },
        ],
      },
    });
    controller.bypass('https://example.com/path');
    expect(controller.test('https://example.com/path')).toMatchObject({
      result: false,
      type: PhishingDetectorResultType.All,
    });
  });

  it('returns positive result even if the hostname+pathname contains percent encoding', async () => {
    const controller = getPhishingController({
      state: {
        phishingLists: [
          {
            allowlist: [],
            blocklist: [],
            blocklistPaths: {
              'example.com': {
                path: {},
              },
            },
            c2DomainBlocklist: [],
            fuzzylist: [],
            tolerance: 0,
            version: 0,
            lastUpdated: 0,
            name: ListNames.MetaMask,
          },
        ],
      },
    });

    expect(controller.test('https://example.com/%70%61%74%68')).toMatchObject({
      result: true,
      type: PhishingDetectorResultType.Blocklist,
    });
  });

  describe('updateStalelist', () => {
    it('should update lists with addition to hotlist', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 2 });
      const exampleBlockedUrl = 'example-blocked-website.com';
      const exampleRequestBlockedHash =
        '0415f1f12f07ddc4ef7e229da747c6c53a6a6474fbaf295a35d984ec0ece9455';
      const exampleBlockedUrlOne =
        'https://another-example-blocked-website.com';
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(200, {
          data: {
            allowlist: [],
            blocklist: [exampleBlockedUrl],
            blocklistPaths: [],
            fuzzylist: [],
            tolerance: 0,
            version: 0,
            lastUpdated: 1,
          },
        })
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
        .reply(200, {
          data: [
            {
              url: exampleBlockedUrlOne,
              timestamp: 2,
              targetList: 'eth_phishing_detect_config.blocklist',
            },
          ],
        });

      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
        .reply(200, {
          recentlyAdded: [exampleRequestBlockedHash],
          recentlyRemoved: [],
          lastFetchedAt: 1,
        });

      const controller = getPhishingController();
      await controller.updateStalelist();

      expect(controller.state.phishingLists).toStrictEqual([
        {
          allowlist: [],
          blocklist: [exampleBlockedUrl, exampleBlockedUrlOne],
          c2DomainBlocklist: [exampleRequestBlockedHash],
          blocklistPaths: {},
          fuzzylist: [],
          tolerance: 0,
          lastUpdated: 2,
          name: ListNames.MetaMask,
          version: 0,
        },
      ]);
    });

    it('should update lists with removal diff from hotlist', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 2 });
      const exampleBlockedUrl = 'example-blocked-website.com';
      const exampleRequestBlockedHash =
        '0415f1f12f07ddc4ef7e229da747c6c53a6a6474fbaf295a35d984ec0ece9455';
      const exampleBlockedUrlTwo = 'another-example-blocked-website.com';
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(200, {
          data: {
            allowlist: [],
            blocklist: [exampleBlockedUrl],
            blocklistPaths: [],
            fuzzylist: [],
            tolerance: 0,
            version: 0,
            lastUpdated: 1,
          },
        })
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
        .reply(200, {
          data: [
            {
              url: exampleBlockedUrlTwo,
              timestamp: 2,
              targetList: 'eth_phishing_detect_config.blocklist',
            },
            {
              url: exampleBlockedUrl,
              timestamp: 2,
              targetList: 'eth_phishing_detect_config.blocklist',
              isRemoval: true,
            },
          ],
        });

      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
        .reply(200, {
          recentlyAdded: [exampleRequestBlockedHash],
          recentlyRemoved: [],
          lastFetchedAt: 1,
        });

      const controller = getPhishingController();
      await controller.updateStalelist();

      expect(controller.state.phishingLists).toStrictEqual([
        {
          allowlist: [],
          blocklist: [exampleBlockedUrlTwo],
          c2DomainBlocklist: [exampleRequestBlockedHash],
          blocklistPaths: {},
          fuzzylist: [],
          tolerance: 0,
          version: 0,
          lastUpdated: 2,
          name: ListNames.MetaMask,
        },
      ]);
    });

    it('should correctly process blocklist entries with paths into blocklistPaths', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(200, {
          data: {
            allowlist: [],
            blocklist: ['example.com'],
            blocklistPaths: ['malicious.com/phishing'],
            fuzzylist: [],
            tolerance: 0,
            version: 0,
            lastUpdated: 1,
          },
        })
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
        .reply(200, { data: [] });

      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
        .reply(200, {
          recentlyAdded: [],
          recentlyRemoved: [],
          lastFetchedAt: 1,
        });

      const controller = getPhishingController();
      await controller.updateStalelist();
      expect(controller.state.phishingLists).toStrictEqual([
        {
          allowlist: [],
          blocklist: ['example.com'],
          c2DomainBlocklist: [],
          blocklistPaths: {
            'malicious.com': {
              phishing: {},
            },
          },
          fuzzylist: [],
          tolerance: 0,
          version: 0,
          lastUpdated: 1,
          name: ListNames.MetaMask,
        },
      ]);
    });

    it('should not update phishing lists if fetch returns 304', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(304)
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
        .reply(304);

      const controller = getPhishingController({
        state: {
          phishingLists: [
            {
              allowlist: [],
              blocklist: [],
              c2DomainBlocklist: [],
              blocklistPaths: {},
              fuzzylist: [],
              tolerance: 3,
              version: 1,
              name: ListNames.MetaMask,
              lastUpdated: 0,
            },
          ],
        },
      });
      await controller.updateStalelist();

      expect(controller.state.phishingLists).toStrictEqual([
        {
          allowlist: [],
          blocklist: [],
          c2DomainBlocklist: [],
          blocklistPaths: {},
          fuzzylist: [],
          tolerance: 3,
          version: 1,
          name: ListNames.MetaMask,
          lastUpdated: 0,
        },
      ]);
    });

    it('should not update phishing lists if fetch returns 500', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(500)
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
        .reply(500);

      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
        .reply(500);

      const controller = getPhishingController({
        state: {
          phishingLists: [
            {
              allowlist: [],
              blocklist: [],
              c2DomainBlocklist: [],
              blocklistPaths: {},
              fuzzylist: [],
              tolerance: 3,
              version: 1,
              name: ListNames.MetaMask,
              lastUpdated: 0,
            },
          ],
        },
      });
      await controller.updateStalelist();

      expect(controller.state.phishingLists).toStrictEqual([
        {
          allowlist: [],
          blocklist: [],
          c2DomainBlocklist: [],
          blocklistPaths: {},
          fuzzylist: [],
          tolerance: 3,
          version: 1,
          name: ListNames.MetaMask,
          lastUpdated: 0,
        },
      ]);
    });

    it('should not throw when there is a network error', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .replyWithError('network error')
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
        .replyWithError('network error');

      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
        .replyWithError('network error');

      const controller = getPhishingController();

      expect(await controller.updateStalelist()).toBeUndefined();
    });

    describe('an update is in progress', () => {
      it('should not fetch phishing lists again', async () => {
        jest.useFakeTimers({
          doNotFake: ['nextTick', 'queueMicrotask'],
          now: 0,
        });
        const nockScope = nock(PHISHING_CONFIG_BASE_URL)
          .get(METAMASK_STALELIST_FILE)
          .delay(100)
          .reply(200, {
            data: {
              allowlist: [],
              blocklist: [],
              fuzzylist: [],
              tolerance: 0,
              version: 0,
              lastUpdated: 1,
            },
          })
          .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
          .delay(100)
          .reply(200, { data: [] });

        const controller = getPhishingController();
        const firstPromise = controller.updateStalelist();
        const secondPromise = controller.updateStalelist();

        jest.advanceTimersByTime(1000 * 100);

        await firstPromise;
        await secondPromise;

        // This second update would throw if it fetched, because the
        // nock interceptor was not persisted.
        expect(nockScope.isDone()).toBe(true);
      });

      it('should wait until the in-progress update has completed', async () => {
        jest.useFakeTimers({
          doNotFake: ['nextTick', 'queueMicrotask'],
          now: 0,
        });
        nock(PHISHING_CONFIG_BASE_URL)
          .get(METAMASK_STALELIST_FILE)
          .delay(100)
          .reply(200, {
            data: {
              allowlist: [],
              blocklist: [],
              fuzzylist: [],
              tolerance: 0,
              version: 0,
              lastUpdated: 1,
            },
          })
          .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
          .delay(100)
          .reply(200, { data: [] });

        const controller = getPhishingController();
        const firstPromise = controller.updateStalelist();
        const secondPromise = controller.updateStalelist();
        jest.advanceTimersByTime(1000 * 99);

        await expect(secondPromise).toNeverResolve();

        // Cleanup pending operations
        await firstPromise;
        await secondPromise;
      });
    });
  });
  describe('updateHotlist', () => {
    it('should update phishing lists if hotlist fetch returns 200', async () => {
      const testBlockedDomain = 'some-test-blocked-url.com';
      nock(PHISHING_CONFIG_BASE_URL)
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/${0}`)
        .reply(200, {
          data: [
            {
              targetList: 'eth_phishing_detect_config.blocklist',
              url: testBlockedDomain,
              timestamp: 1,
            },
          ],
        });

      const controller = getPhishingController({
        state: {
          phishingLists: [
            {
              allowlist: [],
              blocklist: [],
              c2DomainBlocklist: [],
              blocklistPaths: {},
              fuzzylist: [],
              tolerance: 3,
              version: 1,
              name: ListNames.MetaMask,
              lastUpdated: 0,
            },
          ],
        },
      });
      await controller.updateHotlist();

      expect(controller.state.phishingLists).toStrictEqual([
        {
          allowlist: [],
          blocklist: [testBlockedDomain],
          c2DomainBlocklist: [],
          blocklistPaths: {},
          fuzzylist: [],
          tolerance: 3,
          name: ListNames.MetaMask,
          version: 1,
          lastUpdated: 1,
        },
      ]);
    });

    it('should not update phishing lists if hotlist fetch returns 404', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/${0}`)
        .reply(404);

      const controller = getPhishingController({
        state: {
          phishingLists: [
            {
              allowlist: [],
              blocklist: [],
              c2DomainBlocklist: [],
              blocklistPaths: {},
              fuzzylist: [],
              tolerance: 3,
              version: 1,
              name: ListNames.MetaMask,
              lastUpdated: 0,
            },
          ],
        },
      });
      await controller.updateHotlist();

      expect(controller.state.phishingLists).toStrictEqual([
        {
          ...controller.state.phishingLists[0],
          lastUpdated: 0,
        },
      ]);
    });

    it('should not make API calls to update hotlist when phishingLists array is empty', async () => {
      const testBlockedDomain = 'some-test-blocked-url.com';
      const hotlistNock = nock(PHISHING_CONFIG_BASE_URL)
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/${0}`)
        .reply(200, {
          data: [
            {
              targetList: 'eth_phishing_detect_config.blocklist',
              url: testBlockedDomain,
              timestamp: 1,
            },
          ],
        });

      const controller = getPhishingController({
        state: {
          phishingLists: [],
        },
      });
      await controller.updateHotlist();

      expect(hotlistNock.isDone()).toBe(false);
    });

    it('should handle empty hotlist and request blocklist responses gracefully', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/0`)
        .reply(200, { data: [] });

      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(`${C2_DOMAIN_BLOCKLIST_ENDPOINT}?timestamp=0`)
        .reply(200, {
          recentlyAdded: [],
          recentlyRemoved: [],
          lastFetchedAt: 1,
        });

      const controller = getPhishingController({
        state: {
          phishingLists: [
            {
              allowlist: [],
              blocklist: [],
              c2DomainBlocklist: [],
              blocklistPaths: {},
              fuzzylist: [],
              tolerance: 3,
              version: 1,
              name: ListNames.MetaMask,
              lastUpdated: 0,
            },
          ],
        },
      });
      await controller.updateHotlist();
      await controller.updateC2DomainBlocklist();

      expect(controller.state.phishingLists).toStrictEqual([
        {
          allowlist: [],
          blocklist: [],
          c2DomainBlocklist: [],
          blocklistPaths: {},
          fuzzylist: [],
          tolerance: 3,
          version: 1,
          name: ListNames.MetaMask,
          lastUpdated: 0,
        },
      ]);
    });

    it('should handle errors during hotlist fetching gracefully', async () => {
      const exampleRequestBlockedHash =
        '0415f1f12f07ddc4ef7e229da747c6c53a6a6474fbaf295a35d984ec0ece9455';

      nock(PHISHING_CONFIG_BASE_URL)
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/0`)
        .replyWithError('network error');

      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(`${C2_DOMAIN_BLOCKLIST_ENDPOINT}?timestamp=0`)
        .reply(200, {
          recentlyAdded: [exampleRequestBlockedHash],
          recentlyRemoved: [],
          lastFetchedAt: 1,
        });

      const controller = getPhishingController({
        state: {
          phishingLists: [
            {
              allowlist: [],
              blocklist: [],
              c2DomainBlocklist: [exampleRequestBlockedHash],
              blocklistPaths: {},
              fuzzylist: [],
              tolerance: 3,
              version: 1,
              name: ListNames.MetaMask,
              lastUpdated: 1,
            },
          ],
        },
      });

      await controller.updateHotlist();
      await controller.updateC2DomainBlocklist();

      expect(controller.state.phishingLists).toStrictEqual([
        {
          allowlist: [],
          blocklist: [],
          c2DomainBlocklist: [exampleRequestBlockedHash],
          blocklistPaths: {},
          fuzzylist: [],
          tolerance: 3,
          name: ListNames.MetaMask,
          version: 1,
          lastUpdated: 1,
        },
      ]);
    });
    it('should handle missing hotlist data and non-empty domain blocklist gracefully', async () => {
      const exampleRequestBlockedHash =
        '0415f1f12f07ddc4ef7e229da747c6c53a6a6474fbaf295a35d984ec0ece9455';

      nock(PHISHING_CONFIG_BASE_URL)
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/0`)
        .reply(500);

      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(`${C2_DOMAIN_BLOCKLIST_ENDPOINT}?timestamp=0`)
        .reply(200, {
          recentlyAdded: [exampleRequestBlockedHash],
          recentlyRemoved: [],
          lastFetchedAt: 1,
        });

      const controller = getPhishingController({
        state: {
          phishingLists: [
            {
              allowlist: [],
              blocklist: [],
              c2DomainBlocklist: [],
              blocklistPaths: {},
              fuzzylist: [],
              tolerance: 3,
              version: 1,
              name: ListNames.MetaMask,
              lastUpdated: 0,
            },
          ],
        },
      });

      await controller.updateHotlist();
      await controller.updateC2DomainBlocklist();

      expect(controller.state.phishingLists).toStrictEqual([
        {
          allowlist: [],
          blocklist: [],
          c2DomainBlocklist: [exampleRequestBlockedHash],
          blocklistPaths: {},
          fuzzylist: [],
          tolerance: 3,
          name: ListNames.MetaMask,
          version: 1,
          lastUpdated: 0,
        },
      ]);
    });
  });

  describe('updateC2DomainBlocklist', () => {
    it('should update the C2 domain blocklist if the fetch returns 200', async () => {
      const exampleRequestBlockedHash =
        '0415f1f12f07ddc4ef7e229da747c6c53a6a6474fbaf295a35d984ec0ece9455';

      // Mocking the request to the C2 domain blocklist endpoint
      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(`${C2_DOMAIN_BLOCKLIST_ENDPOINT}?timestamp=0`)
        .reply(200, {
          recentlyAdded: [exampleRequestBlockedHash],
          recentlyRemoved: [],
          lastFetchedAt: 1,
        });

      const controller = getPhishingController({
        state: {
          phishingLists: [
            {
              allowlist: [],
              blocklist: [],
              c2DomainBlocklist: [],
              blocklistPaths: {},
              fuzzylist: [],
              tolerance: 3,
              version: 1,
              name: ListNames.MetaMask,
              lastUpdated: 0,
            },
          ],
          c2DomainBlocklistLastFetched: 0,
        },
      });

      await controller.updateC2DomainBlocklist();

      expect(controller.state.phishingLists).toStrictEqual([
        {
          allowlist: [],
          blocklist: [],
          c2DomainBlocklist: [exampleRequestBlockedHash],
          blocklistPaths: {},
          fuzzylist: [],
          tolerance: 3,
          version: 1,
          name: ListNames.MetaMask,
          lastUpdated: 0,
        },
      ]);
      expect(controller.state.c2DomainBlocklistLastFetched).toBeGreaterThan(0);
    });

    it('should not update the C2 domain blocklist if the fetch returns 404', async () => {
      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(`${C2_DOMAIN_BLOCKLIST_ENDPOINT}?timestamp=0`)
        .reply(404);

      const controller = getPhishingController({
        state: {
          phishingLists: [
            {
              allowlist: [],
              blocklist: [],
              c2DomainBlocklist: [],
              blocklistPaths: {},
              fuzzylist: [],
              tolerance: 3,
              version: 1,
              name: ListNames.MetaMask,
              lastUpdated: 0,
            },
          ],
          c2DomainBlocklistLastFetched: 0,
        },
      });

      await controller.updateC2DomainBlocklist();

      expect(controller.state.phishingLists).toStrictEqual([
        {
          allowlist: [],
          blocklist: [],
          c2DomainBlocklist: [],
          blocklistPaths: {},
          fuzzylist: [],
          tolerance: 3,
          version: 1,
          name: ListNames.MetaMask,
          lastUpdated: 0,
        },
      ]);
      expect(controller.state.c2DomainBlocklistLastFetched).toBeGreaterThan(0);
    });

    it('should update request blocklist with additions and removals', async () => {
      const exampleRequestBlockedHash =
        '0415f1f12f07ddc4ef7e229da747c6c53a6a6474fbaf295a35d984ec0ece9455';
      const exampleRequestBlockedHashTwo = 'd3bkcslj57l47pamplifyapp';

      // Mock the request blocklist response with additions and removals
      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(`${C2_DOMAIN_BLOCKLIST_ENDPOINT}?timestamp=0`)
        .reply(200, {
          recentlyAdded: [exampleRequestBlockedHash],
          recentlyRemoved: [exampleRequestBlockedHashTwo],
          lastFetchedAt: 1,
        });

      // Initialize the controller with an existing state
      const controller = getPhishingController({
        state: {
          phishingLists: [
            {
              allowlist: [],
              blocklist: [],
              c2DomainBlocklist: [exampleRequestBlockedHashTwo],
              blocklistPaths: {},
              fuzzylist: [],
              tolerance: 3,
              version: 1,
              name: ListNames.MetaMask,
              lastUpdated: 0,
            },
          ],
        },
      });

      await controller.updateC2DomainBlocklist();

      // Check the updated state
      expect(controller.state.phishingLists).toStrictEqual([
        {
          allowlist: [],
          blocklist: [],
          c2DomainBlocklist: [exampleRequestBlockedHash],
          blocklistPaths: {},
          fuzzylist: [],
          tolerance: 3,
          name: ListNames.MetaMask,
          version: 1,
          lastUpdated: 0,
        },
      ]);
    });

    it('should handle an update that is already in progress', async () => {
      const exampleRequestBlockedHash =
        '0415f1f12f07ddc4ef7e229da747c6c53a6a6474fbaf295a35d984ec0ece9455';

      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(`${C2_DOMAIN_BLOCKLIST_ENDPOINT}?timestamp=0`)
        .reply(200, {
          recentlyAdded: [exampleRequestBlockedHash],
          recentlyRemoved: [],
          lastFetchedAt: 1,
        });

      const controller = getPhishingController({
        state: {
          phishingLists: [
            {
              allowlist: [],
              blocklist: [],
              c2DomainBlocklist: [],
              blocklistPaths: {},
              fuzzylist: [],
              tolerance: 3,
              version: 1,
              name: ListNames.MetaMask,
              lastUpdated: 0,
            },
          ],
          c2DomainBlocklistLastFetched: 0,
        },
      });

      const firstUpdatePromise = controller.updateC2DomainBlocklist();
      const secondUpdatePromise = controller.updateC2DomainBlocklist();

      await firstUpdatePromise;
      await secondUpdatePromise;

      expect(controller.state.phishingLists).toStrictEqual([
        {
          allowlist: [],
          blocklist: [],
          c2DomainBlocklist: [exampleRequestBlockedHash],
          blocklistPaths: {},
          fuzzylist: [],
          tolerance: 3,
          version: 1,
          name: ListNames.MetaMask,
          lastUpdated: 0,
        },
      ]);
      expect(controller.state.c2DomainBlocklistLastFetched).toBeGreaterThan(0);
    });

    it('should handle empty recentlyAdded and recentlyRemoved in the response', async () => {
      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(`${C2_DOMAIN_BLOCKLIST_ENDPOINT}?timestamp=0`)
        .reply(200, {
          recentlyAdded: [],
          recentlyRemoved: [],
          lastFetchedAt: 1,
        });

      const controller = getPhishingController({
        state: {
          phishingLists: [
            {
              allowlist: [],
              blocklist: [],
              c2DomainBlocklist: [],
              blocklistPaths: {},
              fuzzylist: [],
              tolerance: 3,
              version: 1,
              name: ListNames.MetaMask,
              lastUpdated: 0,
            },
          ],
          c2DomainBlocklistLastFetched: 0,
        },
      });

      await controller.updateC2DomainBlocklist();

      expect(controller.state.phishingLists).toStrictEqual([
        {
          allowlist: [],
          blocklist: [],
          c2DomainBlocklist: [],
          blocklistPaths: {},
          fuzzylist: [],
          tolerance: 3,
          version: 1,
          name: ListNames.MetaMask,
          lastUpdated: 0,
        },
      ]);
      expect(controller.state.c2DomainBlocklistLastFetched).toBeGreaterThan(0);
    });

    it('should handle errors during C2 domain blocklist fetching gracefully', async () => {
      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(`${C2_DOMAIN_BLOCKLIST_ENDPOINT}?timestamp=0`)
        .replyWithError('network error');

      const controller = getPhishingController({
        state: {
          phishingLists: [
            {
              allowlist: [],
              blocklist: [],
              c2DomainBlocklist: [],
              blocklistPaths: {},
              fuzzylist: [],
              tolerance: 3,
              version: 1,
              name: ListNames.MetaMask,
              lastUpdated: 0,
            },
          ],
          c2DomainBlocklistLastFetched: 0,
        },
      });

      await controller.updateC2DomainBlocklist();

      expect(controller.state.phishingLists).toStrictEqual([
        {
          allowlist: [],
          blocklist: [],
          c2DomainBlocklist: [],
          blocklistPaths: {},
          fuzzylist: [],
          tolerance: 3,
          version: 1,
          name: ListNames.MetaMask,
          lastUpdated: 0,
        },
      ]);
      expect(controller.state.c2DomainBlocklistLastFetched).toBeGreaterThan(0);
    });
  });

  describe('PhishingController - isBlockedRequest', () => {
    afterEach(() => {
      cleanAll();
    });

    it('should return false if c2DomainBlocklist is not defined or empty', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(200, {
          data: {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            tolerance: 0,
            version: 0,
            lastUpdated: 1,
          },
        })
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
        .reply(200, { data: [] });

      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
        .reply(200, {
          recentlyAdded: [],
          recentlyRemoved: [],
          lastFetchedAt: 1,
        });

      const controller = getPhishingController();
      await controller.updateStalelist();
      const result = controller.isBlockedRequest('https://example.com');
      expect(result).toMatchObject({
        result: false,
        type: PhishingDetectorResultType.C2DomainBlocklist,
      });
    });

    it('should return true if URL is in the c2DomainBlocklist', async () => {
      const exampleRequestBlockedHash =
        '0415f1f12f07ddc4ef7e229da747c6c53a6a6474fbaf295a35d984ec0ece9455';
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(200, {
          data: {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            tolerance: 0,
            version: 0,
            lastUpdated: 1,
          },
        })
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
        .reply(200, { data: [] });

      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
        .reply(200, {
          recentlyAdded: [exampleRequestBlockedHash],
          recentlyRemoved: [],
          lastFetchedAt: 1,
        });

      const controller = getPhishingController();
      await controller.updateStalelist();
      const result = controller.isBlockedRequest(
        'https://develop.d3bkcslj57l47p.amplifyapp.com',
      );
      expect(result).toMatchObject({
        name: ListNames.MetaMask,
        result: true,
        type: PhishingDetectorResultType.C2DomainBlocklist,
      });
    });

    it('should return false if URL is not in the c2DomainBlocklist', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(200, {
          data: {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            tolerance: 0,
            version: 0,
            lastUpdated: 1,
          },
        })
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
        .reply(200, { data: [] });

      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
        .reply(200, {
          recentlyAdded: [],
          recentlyRemoved: [],
          lastFetchedAt: 1,
        });

      const controller = getPhishingController();
      await controller.updateStalelist();
      const result = controller.isBlockedRequest('https://example.com');
      expect(result).toMatchObject({
        result: false,
        type: PhishingDetectorResultType.C2DomainBlocklist,
      });
    });

    it('should return false if URL is invalid', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(200, {
          data: {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            tolerance: 0,
            version: 0,
            lastUpdated: 1,
          },
        })
        .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
        .reply(200, { data: [] });

      nock(CLIENT_SIDE_DETECION_BASE_URL)
        .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
        .reply(200, {
          recentlyAdded: [],
          recentlyRemoved: [],
          lastFetchedAt: 1,
        });

      const controller = getPhishingController();
      await controller.updateStalelist();
      const result = controller.isBlockedRequest('#$@(%&@#$(%');
      expect(result).toMatchObject({
        result: false,
        type: PhishingDetectorResultType.C2DomainBlocklist,
      });
    });
  });
  it('isBlockedRequest - should return false if the URL is in the whitelist', async () => {
    const whitelistedHostname = 'example.com';

    const controller = getPhishingController();
    controller.bypass(formatHostnameToUrl(whitelistedHostname));
    const result = controller.isBlockedRequest(
      `https://${whitelistedHostname}/path`,
    );

    expect(result).toMatchObject({
      result: false,
      type: PhishingDetectorResultType.All,
    });
  });
  it('isBlockedRequest - should return false if the URL is in the allowlist', async () => {
    const allowlistedDomain = 'example.com';

    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          allowlist: [allowlistedDomain],
          blocklist: [],
          blocklistPaths: [],
          fuzzylist: [],
          tolerance: 0,
          version: 0,
          lastUpdated: 1,
        },
      })
      .get(`${METAMASK_HOTLIST_DIFF_FILE}/${1}`)
      .reply(200, { data: [] });

    nock(CLIENT_SIDE_DETECION_BASE_URL)
      .get(C2_DOMAIN_BLOCKLIST_ENDPOINT)
      .reply(200, {
        recentlyAdded: [],
        recentlyRemoved: [],
        lastFetchedAt: 1,
      });

    const controller = getPhishingController();
    await controller.updateStalelist();
    const result = controller.isBlockedRequest(
      `https://${allowlistedDomain}/path`,
    );

    expect(result).toMatchObject({
      result: false,
      type: PhishingDetectorResultType.Allowlist,
    });
  });
  describe('bypass', () => {
    let controller: PhishingController;

    beforeEach(() => {
      controller = getPhishingController({
        state: {
          phishingLists: [
            {
              allowlist: [],
              blocklist: [],
              c2DomainBlocklist: [],
              blocklistPaths: {
                'example.com': {
                  path: {},
                },
                'sub.example.com': {
                  path1: {
                    path2: {},
                  },
                },
              },
              fuzzylist: [],
              tolerance: 0,
              version: 0,
              lastUpdated: 0,
              name: ListNames.MetaMask,
            },
          ],
          whitelistPaths: {},
        },
      });
    });

    describe('whitelist', () => {
      it('should do nothing if the origin is already in the whitelist', () => {
        const origin = 'https://example.com';
        const hostname = getHostnameFromUrl(origin);

        // Call the bypass function
        controller.bypass(origin);
        controller.bypass(origin);

        // Verify that the whitelist has not changed
        expect(controller.state.whitelist).toContain(hostname);
        expect(controller.state.whitelist).toHaveLength(1); // No duplicates added
        expect(Object.keys(controller.state.whitelistPaths)).toHaveLength(0);
      });

      it('should add the origin to the whitelist if not already present', () => {
        const origin = 'https://newsite.com';
        const hostname = getHostnameFromUrl(origin);

        // Call the bypass function
        controller.bypass(origin);

        // Verify that the whitelist now includes the new origin
        expect(controller.state.whitelist).toContain(hostname);
        expect(controller.state.whitelist).toHaveLength(1);
        expect(Object.keys(controller.state.whitelistPaths)).toHaveLength(0);
      });

      it('should add punycode origins to the whitelist if not already present', () => {
        const punycodeOrigin = 'xn--fsq.com'; // Example punycode domain

        // Call the bypass function
        controller.bypass(punycodeOrigin);

        // Verify that the whitelist now includes the punycode origin
        expect(controller.state.whitelist).toContain(punycodeOrigin);
        expect(controller.state.whitelist).toHaveLength(1);
        expect(Object.keys(controller.state.whitelistPaths)).toHaveLength(0);
      });
    });

    describe('whitelistPaths', () => {
      it('adds the matched path prefix within blocklistPaths to the whitelistPaths', () => {
        const origin = 'https://sub.example.com/path1/path2/path3';
        controller.bypass(origin);

        expect(controller.state.whitelistPaths).toStrictEqual({
          'sub.example.com': {
            path1: {
              path2: {},
            },
          },
        });
        expect(controller.state.whitelist).toHaveLength(0);
      });

      it('does not add if a matched path prefix is not present', () => {
        const origin = 'https://sub.example.com/path1/path3';
        controller.bypass(origin);

        expect(controller.state.whitelistPaths).toStrictEqual({});
        expect(controller.state.whitelist).toStrictEqual(['sub.example.com']);
      });

      it('idempotent', () => {
        const origin = 'https://example.com/path';
        controller.bypass(origin);
        controller.bypass(origin);

        expect(controller.state.whitelistPaths).toStrictEqual({
          'example.com': {
            path: {},
          },
        });
        expect(controller.state.whitelist).toHaveLength(0);
      });

      it('if the pathname contains percent encoding, it is added decoded', () => {
        const origin = 'https://example.com/%70%61%74%68';
        controller.bypass(origin);

        expect(controller.state.whitelistPaths).toStrictEqual({
          'example.com': {
            path: {},
          },
        });
      });
    });
  });

  describe('scanUrl', () => {
    let controller: PhishingController;

    const testUrl: string = 'https://example.com';
    const mockResponse: PhishingDetectionScanResult = {
      hostname: 'example.com',
      recommendedAction: RecommendedAction.None,
    };

    beforeEach(() => {
      controller = getPhishingController();
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
    });

    it('should return the scan result', async () => {
      const scope = nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: 'example.com' })
        .reply(200, mockResponse);

      const response = await controller.scanUrl(testUrl);
      expect(response).toMatchObject(mockResponse);
      expect(scope.isDone()).toBe(true);
    });

    it.each([
      [400, 'Bad Request'],
      [401, 'Unauthorized'],
      [403, 'Forbidden'],
      [404, 'Not Found'],
      [500, 'Internal Server Error'],
      [502, 'Bad Gateway'],
      [503, 'Service Unavailable'],
      [504, 'Gateway Timeout'],
    ])(
      'should return a PhishingDetectionScanResult with a fetchError on %i status code',
      async (statusCode, statusText) => {
        const scope = nock(PHISHING_DETECTION_BASE_URL)
          .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
          .query({ url: 'example.com' })
          .reply(statusCode);

        const response = await controller.scanUrl(testUrl);
        expect(response).toMatchObject({
          hostname: '',
          recommendedAction: RecommendedAction.None,
          fetchError: `${statusCode} ${statusText}`,
        });
        expect(scope.isDone()).toBe(true);
      },
    );

    it('should return a PhishingDetectionScanResult with a fetchError on timeout', async () => {
      const scope = nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: testUrl })
        .delayConnection(10000)
        .reply(200, {});

      const promise = controller.scanUrl(testUrl);
      jest.advanceTimersByTime(8000);
      const response = await promise;
      expect(response).toMatchObject({
        hostname: '',
        recommendedAction: RecommendedAction.None,
        fetchError: 'timeout of 8000ms exceeded',
      });
      expect(scope.isDone()).toBe(false);
    });

    it('should only send hostname when URL contains query parameters', async () => {
      const urlWithQuery =
        'https://example.com/path?param1=value1&param2=value2';
      const expectedHostname = 'example.com';

      const scope = nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: expectedHostname })
        .reply(200, mockResponse);

      const response = await controller.scanUrl(urlWithQuery);
      expect(response).toMatchObject(mockResponse);
      expect(scope.isDone()).toBe(true);
    });

    it('should only send hostname when URL contains hash fragments', async () => {
      const urlWithHash = 'https://example.com/page#section1';
      const expectedHostname = 'example.com';

      const scope = nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: expectedHostname })
        .reply(200, mockResponse);

      const response = await controller.scanUrl(urlWithHash);
      expect(response).toMatchObject(mockResponse);
      expect(scope.isDone()).toBe(true);
    });

    it('should only send hostname for complex URLs with multiple parameters', async () => {
      const complexUrl =
        'https://sub.example.com:8080/path/to/page?q=search&utm_source=test#top';
      const expectedHostname = 'sub.example.com';

      const subdomainResponse = {
        ...mockResponse,
        hostname: 'sub.example.com',
      };

      const scope = nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: expectedHostname })
        .reply(200, subdomainResponse);

      const response = await controller.scanUrl(complexUrl);
      expect(response).toMatchObject(subdomainResponse);
      expect(scope.isDone()).toBe(true);
    });

    it('should return a PhishingDetectionScanResult with a fetchError on invalid URLs', async () => {
      const invalidUrls = [
        'not-a-url',
        'http://',
        'https://',
        'example',
        'http://.',
        'http://..',
        'http://../',
        'http://?',
        'http://??',
        'http://??/',
        'http://#',
        'http://##',
        'http://##/',
        'chrome://extensions',
        'file://some_file.pdf',
        'about:blank',
      ];

      for (const invalidUrl of invalidUrls) {
        const response = await controller.scanUrl(invalidUrl);
        expect(response).toMatchObject({
          hostname: '',
          recommendedAction: RecommendedAction.None,
          fetchError: 'url is not a valid web URL',
        });
      }
    });

    it('should handle URLs with authentication parameters correctly', async () => {
      const urlWithAuth = 'https://user:pass@example.com/secure';
      const expectedHostname = 'example.com';

      const scope = nock(PHISHING_DETECTION_BASE_URL)
        .get(`/${PHISHING_DETECTION_SCAN_ENDPOINT}`)
        .query({ url: expectedHostname })
        .reply(200, mockResponse);

      const response = await controller.scanUrl(urlWithAuth);
      expect(response).toMatchObject(mockResponse);
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('bulkScanUrls', () => {
    let controller: PhishingController;

    const testUrls: string[] = [
      'https://example1.com',
      'https://example2.com',
      'https://example3.com',
    ];
    const mockResponse: BulkPhishingDetectionScanResponse = {
      results: {
        'https://example1.com': {
          hostname: 'example1.com',
          recommendedAction: RecommendedAction.None,
        },
        'https://example2.com': {
          hostname: 'example2.com',
          recommendedAction: RecommendedAction.Block,
        },
        'https://example3.com': {
          hostname: 'example3.com',
          recommendedAction: RecommendedAction.None,
        },
      },
      errors: {},
    };

    beforeEach(() => {
      controller = getPhishingController();
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return the scan results for multiple URLs', async () => {
      const scope = nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`, {
          urls: testUrls,
        })
        .reply(200, mockResponse);

      const response = await controller.bulkScanUrls(testUrls);
      expect(response).toStrictEqual(mockResponse);
      expect(scope.isDone()).toBe(true);
    });

    it('should handle empty URL arrays', async () => {
      const response = await controller.bulkScanUrls([]);
      expect(response).toStrictEqual({
        results: {},
        errors: {},
      });
    });

    it('should enforce maximum URL limit', async () => {
      const tooManyUrls = Array(251).fill('https://example.com');
      const response = await controller.bulkScanUrls(tooManyUrls);
      expect(response).toStrictEqual({
        results: {},
        errors: {
          too_many_urls: ['Maximum of 250 URLs allowed per request'],
        },
      });
    });

    it('should validate URL length', async () => {
      const longUrl = `https://example.com/${'a'.repeat(2048)}`;
      const response = await controller.bulkScanUrls([longUrl]);
      expect(response).toStrictEqual({
        results: {},
        errors: {
          [longUrl]: ['URL length must not exceed 2048 characters'],
        },
      });
    });

    it.each([
      [400, 'Bad Request'],
      [401, 'Unauthorized'],
      [403, 'Forbidden'],
      [404, 'Not Found'],
      [500, 'Internal Server Error'],
      [502, 'Bad Gateway'],
      [503, 'Service Unavailable'],
      [504, 'Gateway Timeout'],
    ])(
      'should return an error response on %i status code',
      async (statusCode, statusText) => {
        const scope = nock(PHISHING_DETECTION_BASE_URL)
          .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`, {
            urls: testUrls,
          })
          .reply(statusCode);

        const response = await controller.bulkScanUrls(testUrls);
        expect(response).toStrictEqual({
          results: {},
          errors: {
            api_error: [`${statusCode} ${statusText}`],
          },
        });
        expect(scope.isDone()).toBe(true);
      },
    );

    it('should handle timeouts correctly', async () => {
      const scope = nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`, {
          urls: testUrls,
        })
        .delayConnection(20000)
        .reply(200, {});

      const promise = controller.bulkScanUrls(testUrls);
      jest.advanceTimersByTime(15000);
      const response = await promise;
      expect(response).toStrictEqual({
        results: {},
        errors: {
          network_error: ['timeout of 15000ms exceeded'],
        },
      });
      expect(scope.isDone()).toBe(false);
    });

    it('should process URLs in batches when more than 50 URLs are provided', async () => {
      const batchSize = 50;
      const totalUrls = 120;
      const manyUrls = Array(totalUrls)
        .fill(0)
        .map((_, i) => `https://example${i}.com`);

      // Expected batches
      const batch1 = manyUrls.slice(0, batchSize);
      const batch2 = manyUrls.slice(batchSize, 2 * batchSize);
      const batch3 = manyUrls.slice(2 * batchSize);

      // Mock responses for each batch
      const mockBatch1Response: BulkPhishingDetectionScanResponse = {
        results: batch1.reduce<Record<string, PhishingDetectionScanResult>>(
          (acc, url) => {
            acc[url] = {
              hostname: url.replace('https://', ''),
              recommendedAction: RecommendedAction.None,
            };
            return acc;
          },
          {},
        ),
        errors: {},
      };

      const mockBatch2Response: BulkPhishingDetectionScanResponse = {
        results: batch2.reduce<Record<string, PhishingDetectionScanResult>>(
          (acc, url) => {
            acc[url] = {
              hostname: url.replace('https://', ''),
              recommendedAction: RecommendedAction.None,
            };
            return acc;
          },
          {},
        ),
        errors: {},
      };

      const mockBatch3Response: BulkPhishingDetectionScanResponse = {
        results: batch3.reduce<Record<string, PhishingDetectionScanResult>>(
          (acc, url) => {
            acc[url] = {
              hostname: url.replace('https://', ''),
              recommendedAction: RecommendedAction.None,
            };
            return acc;
          },
          {},
        ),
        errors: {},
      };

      // Setup nock to handle all three batch requests
      const scope1 = nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`, {
          urls: batch1,
        })
        .reply(200, mockBatch1Response);

      const scope2 = nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`, {
          urls: batch2,
        })
        .reply(200, mockBatch2Response);

      const scope3 = nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`, {
          urls: batch3,
        })
        .reply(200, mockBatch3Response);

      const response = await controller.bulkScanUrls(manyUrls);

      // Verify all scopes were called
      expect(scope1.isDone()).toBe(true);
      expect(scope2.isDone()).toBe(true);
      expect(scope3.isDone()).toBe(true);

      // Check all results were merged correctly
      const combinedResults = {
        ...mockBatch1Response.results,
        ...mockBatch2Response.results,
        ...mockBatch3Response.results,
      };

      expect(Object.keys(response.results)).toHaveLength(totalUrls);
      expect(response.results).toStrictEqual(combinedResults);
    });

    it('should handle mixed results with both successful scans and errors', async () => {
      const mixedResponse: BulkPhishingDetectionScanResponse = {
        results: {
          'https://example1.com': {
            hostname: 'example1.com',
            recommendedAction: RecommendedAction.None,
          },
        },
        errors: {
          'https://example2.com': ['Failed to process URL'],
          'https://example3.com': ['Domain not found'],
        },
      };

      const scope = nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`, {
          urls: testUrls,
        })
        .reply(200, mixedResponse);

      const response = await controller.bulkScanUrls(testUrls);
      expect(response).toStrictEqual(mixedResponse);
      expect(scope.isDone()).toBe(true);
    });

    it('should have error merging issues when multiple batches return errors with the same key', async () => {
      // Create enough URLs to need two batches (over 50)
      const batchSize = 50;
      const totalUrls = 100;
      const manyUrls = Array(totalUrls)
        .fill(0)
        .map((_, i) => `https://example${i}.com`);

      // The URLs will be split into two batches
      const batch1 = manyUrls.slice(0, batchSize);
      const batch2 = manyUrls.slice(batchSize);

      // Setup nock to handle both batch requests with different error responses
      const scope1 = nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`, {
          urls: batch1,
        })
        .reply(404, { error: 'Not Found' });

      const scope2 = nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`, {
          urls: batch2,
        })
        .reply(500, { error: 'Internal Server Error' });

      const response = await controller.bulkScanUrls(manyUrls);

      expect(scope1.isDone()).toBe(true);
      expect(scope2.isDone()).toBe(true);

      // With the fixed implementation, we should now preserve all errors
      expect(response.errors).toHaveProperty('api_error');
      expect(response.errors.api_error).toHaveLength(2);
      expect(response.errors.api_error).toContain('404 Not Found');
      expect(response.errors.api_error).toContain('500 Internal Server Error');
    });

    it('should use cached results for previously scanned URLs and only fetch uncached URLs', async () => {
      const cachedUrl = 'https://cached-example.com';
      const uncachedUrl = 'https://uncached-example.com';
      const mixedUrls = [cachedUrl, uncachedUrl];

      // Set up the cache with a pre-existing result
      const cachedResult: PhishingDetectionScanResult = {
        hostname: 'cached-example.com',
        recommendedAction: RecommendedAction.None,
      };

      // First cache a result via scanUrl
      nock(PHISHING_DETECTION_BASE_URL)
        .get(
          `/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(
            'cached-example.com',
          )}`,
        )
        .reply(200, {
          recommendedAction: RecommendedAction.None,
        });

      await controller.scanUrl(cachedUrl);

      // Now set up the mock for the bulk API call with only the uncached URL
      const expectedPostBody = {
        urls: [uncachedUrl],
      };

      const bulkApiResponse: BulkPhishingDetectionScanResponse = {
        results: {
          [uncachedUrl]: {
            hostname: 'uncached-example.com',
            recommendedAction: RecommendedAction.Warn,
          },
        },
        errors: {},
      };

      const scope = nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`, expectedPostBody)
        .reply(200, bulkApiResponse);

      // Call bulkScanUrls with both URLs
      const response = await controller.bulkScanUrls(mixedUrls);

      // Verify that only the uncached URL was requested from the API
      expect(scope.isDone()).toBe(true);

      // Verify the combined results include both the cached and newly fetched results
      expect(response.results).toStrictEqual({
        [cachedUrl]: cachedResult,
        [uncachedUrl]: bulkApiResponse.results[uncachedUrl],
      });

      // Verify the newly fetched result is now in the cache
      const newlyCachedResult = await controller.scanUrl(uncachedUrl);
      expect(newlyCachedResult).toStrictEqual(
        bulkApiResponse.results[uncachedUrl],
      );

      // Should not make a new API call for the second scanUrl call
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.pendingMocks()).toHaveLength(0);
    });
    it('should handle invalid URLs properly when mixed with valid URLs and cache results correctly', async () => {
      const validUrl = 'https://valid-example.com';
      const invalidUrl = 'not-a-url';
      const mixedUrls = [validUrl, invalidUrl];

      const bulkApiResponse: BulkPhishingDetectionScanResponse = {
        results: {
          [validUrl]: {
            hostname: 'valid-example.com',
            recommendedAction: RecommendedAction.None,
          },
        },
        errors: {},
      };

      const scope = nock(PHISHING_DETECTION_BASE_URL)
        .post(`/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`, {
          urls: [validUrl],
        })
        .reply(200, bulkApiResponse);

      // Call bulkScanUrls with both URLs
      const response = await controller.bulkScanUrls(mixedUrls);

      // Verify that only the valid URL was requested from the API
      expect(scope.isDone()).toBe(true);

      // Verify the results include the valid URL result and an error for the invalid URL
      expect(response.results[validUrl]).toStrictEqual(
        bulkApiResponse.results[validUrl],
      );
      expect(response.errors[invalidUrl]).toContain(
        'url is not a valid web URL',
      );

      // Verify the valid result is now in the cache
      const cachedResult = await controller.scanUrl(validUrl);
      expect(cachedResult).toStrictEqual(bulkApiResponse.results[validUrl]);

      // Should not make a new API call for the cached URL
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.pendingMocks()).toHaveLength(0);
    });

    it('should use cache for all URLs if all are already cached', async () => {
      // First cache the results individually
      const cachedUrls = ['https://domain1.com', 'https://domain2.com'];
      const cachedResults = [
        {
          hostname: 'domain1.com',
          recommendedAction: RecommendedAction.None,
        },
        {
          hostname: 'domain2.com',
          recommendedAction: RecommendedAction.Block,
        },
      ];

      // Set up nock for individual caching
      nock(PHISHING_DETECTION_BASE_URL)
        .get(
          `/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(
            'domain1.com',
          )}`,
        )
        .reply(200, {
          recommendedAction: RecommendedAction.None,
        });

      nock(PHISHING_DETECTION_BASE_URL)
        .get(
          `/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(
            'domain2.com',
          )}`,
        )
        .reply(200, {
          recommendedAction: RecommendedAction.Block,
        });

      // Cache the results
      await controller.scanUrl(cachedUrls[0]);
      await controller.scanUrl(cachedUrls[1]);

      // No API call should be made for bulkScanUrls
      const response = await controller.bulkScanUrls(cachedUrls);

      // Verify we got the results from cache
      expect(response.results[cachedUrls[0]]).toStrictEqual(cachedResults[0]);
      expect(response.results[cachedUrls[1]]).toStrictEqual(cachedResults[1]);

      // Verify no API calls were made
      // eslint-disable-next-line import-x/no-named-as-default-member
      expect(nock.pendingMocks()).toHaveLength(0);
    });
  });

  describe('scanAddress', () => {
    let controller: PhishingController;

    const testChainId = '0x1';
    const testAddress = '0x1234567890123456789012345678901234567890';
    const mockResponse: AddressScanResult = {
      result_type: AddressScanResultType.Benign,
      label: '',
    };

    beforeEach(() => {
      controller = getPhishingController();
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('will return the scan result for a valid address', async () => {
      const scope = nock(SECURITY_ALERTS_BASE_URL)
        .post(ADDRESS_SCAN_ENDPOINT, {
          chain: 'ethereum',
          address: testAddress.toLowerCase(),
        })
        .reply(200, mockResponse);

      const response = await controller.scanAddress(testChainId, testAddress);
      expect(response).toMatchObject(mockResponse);
      expect(scope.isDone()).toBe(true);
    });

    it.each([
      [400, 'Bad Request'],
      [401, 'Unauthorized'],
      [403, 'Forbidden'],
      [404, 'Not Found'],
      [500, 'Internal Server Error'],
      [502, 'Bad Gateway'],
      [503, 'Service Unavailable'],
      [504, 'Gateway Timeout'],
    ])(
      'will return an AddressScanResult with an ErrorResult on %i status code',
      async (statusCode) => {
        const scope = nock(SECURITY_ALERTS_BASE_URL)
          .post(ADDRESS_SCAN_ENDPOINT, {
            chain: 'ethereum',
            address: testAddress.toLowerCase(),
          })
          .reply(statusCode);

        const response = await controller.scanAddress(testChainId, testAddress);
        expect(response).toMatchObject({
          result_type: AddressScanResultType.ErrorResult,
          label: '',
        });
        expect(scope.isDone()).toBe(true);
      },
    );

    it('will return an AddressScanResult with an ErrorResult on timeout', async () => {
      const scope = nock(SECURITY_ALERTS_BASE_URL)
        .post(ADDRESS_SCAN_ENDPOINT, {
          chain: 'ethereum',
          address: testAddress.toLowerCase(),
        })
        .delayConnection(10000)
        .reply(200, {});

      const promise = controller.scanAddress(testChainId, testAddress);
      jest.advanceTimersByTime(5000);
      const response = await promise;
      expect(response).toMatchObject({
        result_type: AddressScanResultType.ErrorResult,
        label: '',
      });
      expect(scope.isDone()).toBe(false);
    });

    it('will return an AddressScanResult with an ErrorResult when address is missing', async () => {
      const response = await controller.scanAddress(testChainId, '');
      expect(response).toMatchObject({
        result_type: AddressScanResultType.ErrorResult,
        label: '',
      });
    });

    it('will return an AddressScanResult with an ErrorResult when chain ID is unknown', async () => {
      const unknownChainId = '0x999999';
      const response = await controller.scanAddress(
        unknownChainId,
        testAddress,
      );
      expect(response).toMatchObject({
        result_type: AddressScanResultType.ErrorResult,
        label: '',
      });
    });

    it('will normalize address to lowercase', async () => {
      const mixedCaseAddress = '0xAbCdEf1234567890123456789012345678901234';
      const scope = nock(SECURITY_ALERTS_BASE_URL)
        .post(ADDRESS_SCAN_ENDPOINT, {
          chain: 'ethereum',
          address: mixedCaseAddress.toLowerCase(),
        })
        .reply(200, mockResponse);

      const response = await controller.scanAddress(
        testChainId,
        mixedCaseAddress,
      );
      expect(response).toMatchObject(mockResponse);
      expect(scope.isDone()).toBe(true);
    });

    it('will normalize chain ID to lowercase', async () => {
      const mixedCaseChainId = '0xA';
      const scope = nock(SECURITY_ALERTS_BASE_URL)
        .post(ADDRESS_SCAN_ENDPOINT, {
          chain: 'optimism',
          address: testAddress.toLowerCase(),
        })
        .reply(200, mockResponse);

      const response = await controller.scanAddress(
        mixedCaseChainId,
        testAddress,
      );
      expect(response).toMatchObject(mockResponse);
      expect(scope.isDone()).toBe(true);
    });

    it('will cache scan results and return them on subsequent calls', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');

      const scope = nock(SECURITY_ALERTS_BASE_URL)
        .post(ADDRESS_SCAN_ENDPOINT, {
          chain: 'ethereum',
          address: testAddress.toLowerCase(),
        })
        .reply(200, mockResponse);

      const result1 = await controller.scanAddress(testChainId, testAddress);
      expect(result1).toMatchObject(mockResponse);

      const result2 = await controller.scanAddress(testChainId, testAddress);
      expect(result2).toMatchObject(mockResponse);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(scope.isDone()).toBe(true);

      fetchSpy.mockRestore();
    });

    it('will cache addresses per chain ID', async () => {
      const chainId1 = '0x1';
      const chainId2 = '0x89';

      const mockResponse1: AddressScanResult = {
        result_type: AddressScanResultType.Benign,
        label: 'ethereum result',
      };

      const mockResponse2: AddressScanResult = {
        result_type: AddressScanResultType.Warning,
        label: 'polygon result',
      };

      const scope1 = nock(SECURITY_ALERTS_BASE_URL)
        .post(ADDRESS_SCAN_ENDPOINT, {
          chain: 'ethereum',
          address: testAddress.toLowerCase(),
        })
        .reply(200, mockResponse1);

      const scope2 = nock(SECURITY_ALERTS_BASE_URL)
        .post(ADDRESS_SCAN_ENDPOINT, {
          chain: 'polygon',
          address: testAddress.toLowerCase(),
        })
        .reply(200, mockResponse2);

      const result1 = await controller.scanAddress(chainId1, testAddress);
      const result2 = await controller.scanAddress(chainId2, testAddress);

      expect(result1).toMatchObject(mockResponse1);
      expect(result2).toMatchObject(mockResponse2);
      expect(scope1.isDone()).toBe(true);
      expect(scope2.isDone()).toBe(true);

      const cachedResult1 = await controller.scanAddress(chainId1, testAddress);
      const cachedResult2 = await controller.scanAddress(chainId2, testAddress);

      expect(cachedResult1).toMatchObject(mockResponse1);
      expect(cachedResult2).toMatchObject(mockResponse2);
    });
  });

  describe('getApprovals', () => {
    let controller: PhishingController;

    const testChainId = '0x1';
    const testAddress = '0x1234567890123456789012345678901234567890';
    const mockApproval = {
      allowance: { amount: '1000000', is_unlimited: false },
      asset: {
        address: '0xtoken',
        symbol: 'TKN',
        name: 'Token',
        decimals: 18,
      },
      exposure: { usd: 100 },
      spender: { address: '0xspender' },
      verdict: 'Benign',
    };
    const mockResponse = { approvals: [mockApproval] };

    beforeEach(() => {
      controller = getPhishingController();
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('will return approvals for a valid address and chain', async () => {
      const scope = nock(SECURITY_ALERTS_BASE_URL)
        .post(APPROVALS_ENDPOINT, {
          chain: 'ethereum',
          address: testAddress.toLowerCase(),
        })
        .reply(200, mockResponse);

      const response = await controller.getApprovals(testChainId, testAddress);
      expect(response).toStrictEqual(mockResponse);
      expect(scope.isDone()).toBe(true);
    });

    it('will return empty approvals when address is missing', async () => {
      const response = await controller.getApprovals(testChainId, '');
      expect(response).toStrictEqual({ approvals: [] });
    });

    it('will return empty approvals when chainId is missing', async () => {
      const response = await controller.getApprovals('', testAddress);
      expect(response).toStrictEqual({ approvals: [] });
    });

    it('will return empty approvals for unknown chain ID', async () => {
      const response = await controller.getApprovals('0x999999', testAddress);
      expect(response).toStrictEqual({ approvals: [] });
    });

    it.each([
      [400, 'Bad Request'],
      [500, 'Internal Server Error'],
    ])('will return empty approvals on %i HTTP error', async (statusCode) => {
      const scope = nock(SECURITY_ALERTS_BASE_URL)
        .post(APPROVALS_ENDPOINT, {
          chain: 'ethereum',
          address: testAddress.toLowerCase(),
        })
        .reply(statusCode);

      const response = await controller.getApprovals(testChainId, testAddress);
      expect(response).toStrictEqual({ approvals: [] });
      expect(scope.isDone()).toBe(true);
    });

    it('will return empty approvals on timeout', async () => {
      const scope = nock(SECURITY_ALERTS_BASE_URL)
        .post(APPROVALS_ENDPOINT, {
          chain: 'ethereum',
          address: testAddress.toLowerCase(),
        })
        .delayConnection(10000)
        .reply(200, mockResponse);

      const promise = controller.getApprovals(testChainId, testAddress);
      jest.advanceTimersByTime(5000);
      const response = await promise;
      expect(response).toStrictEqual({ approvals: [] });
      expect(scope.isDone()).toBe(false);
    });

    it('will normalize address to lowercase before API call', async () => {
      const mixedCaseAddress = '0xAbCdEf1234567890123456789012345678901234';
      const scope = nock(SECURITY_ALERTS_BASE_URL)
        .post(APPROVALS_ENDPOINT, {
          chain: 'ethereum',
          address: mixedCaseAddress.toLowerCase(),
        })
        .reply(200, mockResponse);

      const response = await controller.getApprovals(
        testChainId,
        mixedCaseAddress,
      );
      expect(response).toStrictEqual(mockResponse);
      expect(scope.isDone()).toBe(true);
    });

    it('will normalize chainId and resolve to chain name', async () => {
      const mixedCaseChainId = '0xA';
      const scope = nock(SECURITY_ALERTS_BASE_URL)
        .post(APPROVALS_ENDPOINT, {
          chain: 'optimism',
          address: testAddress.toLowerCase(),
        })
        .reply(200, mockResponse);

      const response = await controller.getApprovals(
        mixedCaseChainId,
        testAddress,
      );
      expect(response).toStrictEqual(mockResponse);
      expect(scope.isDone()).toBe(true);
    });
  });
});

describe('URL Scan Cache', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'], now: 0 });
  });
  afterEach(() => {
    jest.useRealTimers();
    cleanAll();
  });

  it('should cache scan results and return them on subsequent calls', async () => {
    const testDomain = 'example.com';

    // Spy on the fetch function to track calls
    const fetchSpy = jest.spyOn(global, 'fetch');

    nock(PHISHING_DETECTION_BASE_URL)
      .get(
        `/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(
          testDomain,
        )}`,
      )
      .reply(200, {
        recommendedAction: RecommendedAction.None,
      });

    const controller = getPhishingController();

    const result1 = await controller.scanUrl(`https://${testDomain}`);
    expect(result1).toStrictEqual({
      hostname: testDomain,
      recommendedAction: RecommendedAction.None,
    });

    const result2 = await controller.scanUrl(`https://${testDomain}`);
    expect(result2).toStrictEqual({
      hostname: testDomain,
      recommendedAction: RecommendedAction.None,
    });

    // Verify that fetch was called exactly once
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });

  it('should expire cache entries after TTL', async () => {
    const testDomain = 'example.com';
    const cacheTTL = 300; // 5 minutes

    nock(PHISHING_DETECTION_BASE_URL)
      .get(
        `/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(
          testDomain,
        )}`,
      )
      .reply(200, {
        recommendedAction: RecommendedAction.None,
      })
      .get(
        `/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(
          testDomain,
        )}`,
      )
      .reply(200, {
        recommendedAction: RecommendedAction.None,
      });

    const controller = getPhishingController({
      urlScanCacheTTL: cacheTTL,
    });

    await controller.scanUrl(`https://${testDomain}`);

    // Before TTL expires, should use cache
    jest.advanceTimersByTime((cacheTTL - 10) * 1000);
    await controller.scanUrl(`https://${testDomain}`);
    expect(pendingMocks()).toHaveLength(1); // One mock remaining

    // After TTL expires, should fetch again
    jest.advanceTimersByTime(11 * 1000);
    await controller.scanUrl(`https://${testDomain}`);
    expect(pendingMocks()).toHaveLength(0); // All mocks used
  });

  it('should evict oldest entries when cache exceeds max size', async () => {
    const maxCacheSize = 2;
    const domains = ['domain1.com', 'domain2.com', 'domain3.com'];

    // Setup nock to respond to all three domains
    domains.forEach((domain) => {
      nock(PHISHING_DETECTION_BASE_URL)
        .get(
          `/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(
            domain,
          )}`,
        )
        .reply(200, {
          recommendedAction: RecommendedAction.None,
        });
    });

    // Setup a second request for the first domain
    nock(PHISHING_DETECTION_BASE_URL)
      .get(
        `/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(
          domains[0],
        )}`,
      )
      .reply(200, {
        recommendedAction: RecommendedAction.Warn,
      });

    const controller = getPhishingController({
      urlScanCacheMaxSize: maxCacheSize,
    });

    // Fill the cache
    await controller.scanUrl(`https://${domains[0]}`);
    jest.advanceTimersByTime(1000); // Ensure different timestamps
    await controller.scanUrl(`https://${domains[1]}`);

    // This should evict the oldest entry (domain1)
    jest.advanceTimersByTime(1000);
    await controller.scanUrl(`https://${domains[2]}`);

    // Now domain1 should not be in cache and require a new fetch
    await controller.scanUrl(`https://${domains[0]}`);

    // All mocks should be used
    expect(isDone()).toBe(true);
  });

  it('should clear the cache when clearUrlScanCache is called', async () => {
    const testDomain = 'example.com';

    nock(PHISHING_DETECTION_BASE_URL)
      .get(
        `/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(
          testDomain,
        )}`,
      )
      .reply(200, {
        recommendedAction: RecommendedAction.None,
      })
      .get(
        `/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(
          testDomain,
        )}`,
      )
      .reply(200, {
        recommendedAction: RecommendedAction.None,
      });

    const controller = getPhishingController();

    // First call should fetch from API
    await controller.scanUrl(`https://${testDomain}`);

    // Clear the cache
    controller.clearUrlScanCache();

    // Should fetch again
    await controller.scanUrl(`https://${testDomain}`);

    // All mocks should be used
    expect(isDone()).toBe(true);
  });

  it('should allow changing the TTL', async () => {
    const testDomain = 'example.com';
    const initialTTL = 300; // 5 minutes
    const newTTL = 60; // 1 minute

    nock(PHISHING_DETECTION_BASE_URL)
      .get(
        `/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(
          testDomain,
        )}`,
      )
      .reply(200, {
        recommendedAction: RecommendedAction.None,
      })
      .get(
        `/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(
          testDomain,
        )}`,
      )
      .reply(200, {
        recommendedAction: RecommendedAction.None,
      });

    const controller = getPhishingController({
      urlScanCacheTTL: initialTTL,
    });

    // First call should fetch from API
    await controller.scanUrl(`https://${testDomain}`);

    // Change TTL
    controller.setUrlScanCacheTTL(newTTL);

    // Before new TTL expires, should use cache
    jest.advanceTimersByTime((newTTL - 10) * 1000);
    await controller.scanUrl(`https://${testDomain}`);
    expect(pendingMocks()).toHaveLength(1); // One mock remaining

    // After new TTL expires, should fetch again
    jest.advanceTimersByTime(11 * 1000);
    await controller.scanUrl(`https://${testDomain}`);
    expect(pendingMocks()).toHaveLength(0); // All mocks used
  });

  it('should allow changing the max cache size', async () => {
    const initialMaxSize = 3;
    const newMaxSize = 2;
    const domains = [
      'domain1.com',
      'domain2.com',
      'domain3.com',
      'domain4.com',
    ];

    // Setup nock to respond to all domains
    domains.forEach((domain) => {
      nock(PHISHING_DETECTION_BASE_URL)
        .get(
          `/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(
            domain,
          )}`,
        )
        .reply(200, {
          recommendedAction: RecommendedAction.None,
        });
    });

    const controller = getPhishingController({
      urlScanCacheMaxSize: initialMaxSize,
    });

    // Fill the cache to initial size
    await controller.scanUrl(`https://${domains[0]}`);
    jest.advanceTimersByTime(1000); // Ensure different timestamps
    await controller.scanUrl(`https://${domains[1]}`);
    jest.advanceTimersByTime(1000);
    await controller.scanUrl(`https://${domains[2]}`);

    // Verify initial cache size
    expect(Object.keys(controller.state.urlScanCache)).toHaveLength(
      initialMaxSize,
    );
    // Reduce the max size
    controller.setUrlScanCacheMaxSize(newMaxSize);

    // Add another entry which should trigger eviction
    await controller.scanUrl(`https://${domains[3]}`);

    // Verify the cache size doesn't exceed new max size
    expect(
      Object.keys(controller.state.urlScanCache).length,
    ).toBeLessThanOrEqual(newMaxSize);
  });

  it('should handle fetch errors and not cache them', async () => {
    const testDomain = 'example.com';

    nock(PHISHING_DETECTION_BASE_URL)
      .get(
        `/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(
          testDomain,
        )}`,
      )
      .reply(500, { error: 'Internal Server Error' })
      .get(
        `/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(
          testDomain,
        )}`,
      )
      .reply(200, {
        recommendedAction: RecommendedAction.None,
      });

    const controller = getPhishingController();

    // First call should result in an error response
    const result1 = await controller.scanUrl(`https://${testDomain}`);
    expect(result1.fetchError).toBeDefined();

    // Second call should try again (not use cache since errors aren't cached)
    const result2 = await controller.scanUrl(`https://${testDomain}`);
    expect(result2.fetchError).toBeUndefined();
    expect(result2.recommendedAction).toBe(RecommendedAction.None);

    // All mocks should be used
    expect(isDone()).toBe(true);
  });

  it('should handle timeout errors and not cache them', async () => {
    const testDomain = 'example.com';

    // First mock a timeout/error response
    nock(PHISHING_DETECTION_BASE_URL)
      .get(
        `/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(
          testDomain,
        )}`,
      )
      .replyWithError('connection timeout')
      .get(
        `/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(
          testDomain,
        )}`,
      )
      .reply(200, {
        recommendedAction: RecommendedAction.None,
      });

    const controller = getPhishingController();

    // First call should result in an error
    const result1 = await controller.scanUrl(`https://${testDomain}`);
    expect(result1.fetchError).toBeDefined();

    // Second call should succeed (not use cache since errors aren't cached)
    const result2 = await controller.scanUrl(`https://${testDomain}`);
    expect(result2.fetchError).toBeUndefined();
    expect(result2.recommendedAction).toBe(RecommendedAction.None);

    // All mocks should be used
    expect(isDone()).toBe(true);
  });

  it('should handle invalid URLs and not cache them', async () => {
    const invalidUrl = 'not-a-valid-url';

    const controller = getPhishingController();

    // First call should return an error for invalid URL
    const result1 = await controller.scanUrl(invalidUrl);
    expect(result1.fetchError).toBeDefined();

    // Second call should also return an error (not from cache)
    const result2 = await controller.scanUrl(invalidUrl);
    expect(result2.fetchError).toBeDefined();
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const controller = getPhishingController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('includes expected state in state logs', () => {
      const controller = getPhishingController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`
        {
          "c2DomainBlocklistLastFetched": 0,
          "hotlistLastFetched": 0,
          "stalelistLastFetched": 0,
        }
      `);
    });

    it('persists expected state', () => {
      const controller = getPhishingController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        {
          "addressScanCache": {},
          "c2DomainBlocklistLastFetched": 0,
          "hotlistLastFetched": 0,
          "phishingLists": [],
          "stalelistLastFetched": 0,
          "tokenScanCache": {},
          "urlScanCache": {},
          "whitelist": [],
          "whitelistPaths": {},
        }
      `);
    });

    it('includes expected state in UI', () => {
      const controller = getPhishingController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        {
          "addressScanCache": {},
          "tokenScanCache": {},
          "urlScanCache": {},
        }
      `);
    });
  });
});

describe('Transaction Controller State Change Integration', () => {
  let controller: PhishingController;
  let globalMessenger: RootMessenger;
  let bulkScanTokensSpy: jest.SpyInstance;

  beforeEach(() => {
    const { messenger, rootMessenger } = setupMessenger();

    globalMessenger = rootMessenger;

    controller = new PhishingController({
      messenger,
    });

    bulkScanTokensSpy = jest
      .spyOn(controller, 'bulkScanTokens')
      .mockResolvedValue({});
  });

  afterEach(() => {
    bulkScanTokensSpy.mockRestore();
  });

  it('triggers bulk token scanning when transaction with token balance changes is added', async () => {
    const mockTransaction = createMockTransaction('test-tx-1', [
      TEST_ADDRESSES.USDC,
      TEST_ADDRESSES.MOCK_TOKEN_1,
    ]);
    const stateChangePayload = createMockStateChangePayload([mockTransaction]);

    globalMessenger.publish(
      'TransactionController:stateChange',
      stateChangePayload,
      [
        {
          op: 'add' as const,
          path: ['transactions', 0],
          value: mockTransaction,
        },
      ],
    );

    await new Promise(process.nextTick);

    expect(bulkScanTokensSpy).toHaveBeenCalledWith({
      chainId: mockTransaction.chainId.toLowerCase(),
      tokens: [
        TEST_ADDRESSES.USDC.toLowerCase(),
        TEST_ADDRESSES.MOCK_TOKEN_1.toLowerCase(),
      ],
    });
  });

  it('triggers bulk token scanning when patch path includes simulationData', async () => {
    const mockTransaction = createMockTransaction('test-tx-1', [
      TEST_ADDRESSES.USDC,
      TEST_ADDRESSES.MOCK_TOKEN_1,
    ]);
    const stateChangePayload = createMockStateChangePayload([mockTransaction]);

    globalMessenger.publish(
      'TransactionController:stateChange',
      stateChangePayload,
      [
        {
          op: 'add' as const,
          path: ['transactions', 0, 'simulationData'],
          value: mockTransaction.simulationData,
        },
      ],
    );
    await new Promise(process.nextTick);

    expect(bulkScanTokensSpy).toHaveBeenCalledWith({
      chainId: mockTransaction.chainId.toLowerCase(),
      tokens: [
        TEST_ADDRESSES.USDC.toLowerCase(),
        TEST_ADDRESSES.MOCK_TOKEN_1.toLowerCase(),
      ],
    });
  });

  it('skips processing when patch operation is remove', async () => {
    const mockTransaction = createMockTransaction('test-tx-1', [
      TEST_ADDRESSES.USDC,
    ]);

    const stateChangePayload = createMockStateChangePayload([]);

    globalMessenger.publish(
      'TransactionController:stateChange',
      stateChangePayload,
      [
        {
          op: 'remove' as const,
          path: ['transactions', 0],
          value: mockTransaction,
        },
      ],
    );

    await new Promise(process.nextTick);

    expect(bulkScanTokensSpy).not.toHaveBeenCalled();
  });

  it('does not trigger bulk token scanning when transaction has no token balance changes', async () => {
    const mockTransaction = createMockTransaction('test-tx-1', []);

    const stateChangePayload = createMockStateChangePayload([mockTransaction]);

    globalMessenger.publish(
      'TransactionController:stateChange',
      stateChangePayload,
      [
        {
          op: 'add' as const,
          path: ['transactions', 0],
          value: mockTransaction,
        },
      ],
    );

    await new Promise(process.nextTick);

    expect(bulkScanTokensSpy).not.toHaveBeenCalled();
  });

  it('does not trigger bulk token scanning when using default tokenAddresses parameter', async () => {
    const mockTransaction = createMockTransaction('test-tx-2');

    const stateChangePayload = createMockStateChangePayload([mockTransaction]);

    globalMessenger.publish(
      'TransactionController:stateChange',
      stateChangePayload,
      [
        {
          op: 'add' as const,
          path: ['transactions', 0],
          value: mockTransaction,
        },
      ],
    );

    await new Promise(process.nextTick);

    expect(bulkScanTokensSpy).not.toHaveBeenCalled();
  });

  it('handles errors in transaction state change processing', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const stateChangePayload = createMockStateChangePayload([]);

    globalMessenger.publish(
      'TransactionController:stateChange',
      stateChangePayload,
      [
        {
          op: 'add' as const,
          path: ['transactions', 0],
          value: null,
        },
      ],
    );

    await new Promise(process.nextTick);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error processing transaction state change:',
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });

  it('handles errors in bulk token scanning', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    bulkScanTokensSpy.mockRejectedValue(new Error('Scanning failed'));

    const mockTransaction = createMockTransaction('test-tx-1', [
      TEST_ADDRESSES.USDC,
    ]);

    const stateChangePayload = createMockStateChangePayload([mockTransaction]);

    globalMessenger.publish(
      'TransactionController:stateChange',
      stateChangePayload,
      [
        {
          op: 'add' as const,
          path: ['transactions', 0],
          value: mockTransaction,
        },
      ],
    );

    await new Promise(process.nextTick);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error scanning tokens for chain 0x1:',
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });
});
