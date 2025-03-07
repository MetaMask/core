import { Messenger } from '@metamask/base-controller';
import { strict as assert } from 'assert';
import nock from 'nock';
import sinon from 'sinon';

import {
  ListNames,
  METAMASK_HOTLIST_DIFF_FILE,
  METAMASK_STALELIST_FILE,
  PhishingController,
  PHISHING_CONFIG_BASE_URL,
  type PhishingControllerActions,
  type PhishingControllerOptions,
  CLIENT_SIDE_DETECION_BASE_URL,
  C2_DOMAIN_BLOCKLIST_ENDPOINT,
  PHISHING_DETECTION_BASE_URL,
  PHISHING_DETECTION_SCAN_ENDPOINT,
} from './PhishingController';
import { formatHostnameToUrl } from './tests/utils';
import type { PhishingDetectionScanResult } from './types';
import { PhishingDetectorResultType, RecommendedAction } from './types';
import { getHostnameFromUrl } from './utils';

const controllerName = 'PhishingController';

/**
 * Constructs a restricted messenger.
 *
 * @returns A restricted messenger.
 */
function getRestrictedMessenger() {
  const messenger = new Messenger<PhishingControllerActions, never>();

  return messenger.getRestricted({
    name: controllerName,
    allowedActions: [],
    allowedEvents: [],
  });
}

/**
 * Construct a Phishing Controller with the given options if any.
 *
 * @param options - The Phishing Controller options.
 * @returns The constructed Phishing Controller.
 */
function getPhishingController(options?: Partial<PhishingControllerOptions>) {
  return new PhishingController({
    messenger: getRestrictedMessenger(),
    ...options,
  });
}

describe('PhishingController', () => {
  afterEach(() => {
    sinon.restore();
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
  it('should return false if the URL is in the allowlist', async () => {
    const allowlistedHostname = 'example.com';

    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        data: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          eth_phishing_detect_config: {
            allowlist: [allowlistedHostname],
            blocklist: [],
            fuzzylist: [],
          },
          // eslint-disable-next-line @typescript-eslint/naming-convention
          phishfort_hotlist: {
            blocklist: [],
          },
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
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          eth_phishing_detect_config: {
            blocklist: [],
            fuzzylist: [],
            allowlist: [],
          },
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          phishfort_hotlist: {
            blocklist: [],
          },
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
    const clock = sinon.useFakeTimers();
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
            fuzzylist: [],
            tolerance: 0,
            lastUpdated: 1,
            name: ListNames.MetaMask,
            version: 0,
          },
        ],
      },
    });
    clock.tick(1000 * 10);
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
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            eth_phishing_detect_config: {
              blocklist: ['this-should-not-be-in-default-blocklist.com'],
              fuzzylist: [],
              allowlist: ['this-should-not-be-in-default-allowlist.com'],
            },
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            phishfort_hotlist: {
              blocklist: [],
            },
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
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      clock.tick(1000 * 10);
      expect(controller.isStalelistOutOfDate()).toBe(true);
      await controller.maybeUpdateState();
      expect(controller.isStalelistOutOfDate()).toBe(false);
      expect(nockScope.isDone()).toBe(true);
    });

    it('should not be out of date after maybeUpdateStalelist is called but before refresh interval has passed', async () => {
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      clock.tick(1000 * 10);
      expect(controller.isStalelistOutOfDate()).toBe(true);
      await controller.maybeUpdateState();
      clock.tick(1000 * 5);
      expect(controller.isStalelistOutOfDate()).toBe(false);
      expect(nockScope.isDone()).toBe(true);
    });

    it('should still be out of date while update is in progress', async () => {
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      clock.tick(1000 * 10);
      // do not wait
      const maybeUpdatePhisingListPromise = controller.maybeUpdateState();
      expect(controller.isStalelistOutOfDate()).toBe(true);
      await maybeUpdatePhisingListPromise;
      expect(controller.isStalelistOutOfDate()).toBe(false);
      clock.tick(1000 * 10);
      expect(controller.isStalelistOutOfDate()).toBe(true);
      expect(nockScope.isDone()).toBe(true);
    });

    it('should call update only if it is out of date, otherwise it should not call update', async () => {
      const clock = sinon.useFakeTimers();
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

      clock.tick(1000 * 10);
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
      const clock = sinon.useFakeTimers(50);
      const controller = getPhishingController({
        hotlistRefreshInterval: 10,
        stalelistRefreshInterval: 50,
      });
      clock.tick(1000 * 10);
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
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        c2DomainBlocklistRefreshInterval: 10,
      });
      clock.tick(1000 * 10);
      expect(controller.isC2DomainBlocklistOutOfDate()).toBe(true);
      await controller.maybeUpdateState();
      expect(controller.isC2DomainBlocklistOutOfDate()).toBe(false);
    });
  });

  describe('isStalelistOutOfDate', () => {
    it('should not be out of date upon construction', () => {
      sinon.useFakeTimers();
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });

      expect(controller.isStalelistOutOfDate()).toBe(false);
    });

    it('should not be out of date after some of the refresh interval has passed', () => {
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      clock.tick(1000 * 5);

      expect(controller.isStalelistOutOfDate()).toBe(false);
    });

    it('should be out of date after the refresh interval has passed', () => {
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      clock.tick(1000 * 10);

      expect(controller.isStalelistOutOfDate()).toBe(true);
    });

    it('should be out of date if the refresh interval has passed and an update is in progress', async () => {
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      clock.tick(1000 * 10);
      const pendingUpdate = controller.updateStalelist();

      expect(controller.isStalelistOutOfDate()).toBe(true);

      // Cleanup pending operations
      await pendingUpdate;
    });

    it('should not be out of date if the phishing lists were just updated', async () => {
      sinon.useFakeTimers();
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      await controller.updateStalelist();

      expect(controller.isStalelistOutOfDate()).toBe(false);
    });

    it('should not be out of date if the phishing lists were recently updated', async () => {
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      await controller.updateStalelist();
      clock.tick(1000 * 5);

      expect(controller.isStalelistOutOfDate()).toBe(false);
    });

    it('should be out of date if the time elapsed since the last update equals the refresh interval', async () => {
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        stalelistRefreshInterval: 10,
      });
      await controller.updateStalelist();
      clock.tick(1000 * 10);

      expect(controller.isStalelistOutOfDate()).toBe(true);
    });
  });

  describe('isHotlistOutOfDate', () => {
    it('should not be out of date upon construction', () => {
      sinon.useFakeTimers();
      const controller = getPhishingController({
        hotlistRefreshInterval: 10,
      });

      expect(controller.isHotlistOutOfDate()).toBe(false);
    });

    it('should not be out of date after some of the refresh interval has passed', () => {
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        hotlistRefreshInterval: 10,
      });
      clock.tick(1000 * 5);

      expect(controller.isHotlistOutOfDate()).toBe(false);
    });

    it('should be out of date after the refresh interval has passed', () => {
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        hotlistRefreshInterval: 10,
      });
      clock.tick(1000 * 10);

      expect(controller.isHotlistOutOfDate()).toBe(true);
    });

    it('should be out of date if the refresh interval has passed and an update is in progress', async () => {
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        hotlistRefreshInterval: 10,
        state: {
          phishingLists: [
            {
              allowlist: [],
              blocklist: [],
              c2DomainBlocklist: [],
              fuzzylist: [],
              tolerance: 0,
              lastUpdated: 1,
              name: ListNames.MetaMask,
              version: 0,
            },
          ],
        },
      });
      clock.tick(1000 * 10);
      const pendingUpdate = controller.updateHotlist();

      expect(controller.isHotlistOutOfDate()).toBe(true);

      // Cleanup pending operations
      await pendingUpdate;
    });

    it('should not be out of date if the phishing lists were just updated', async () => {
      sinon.useFakeTimers();
      const controller = getPhishingController({
        hotlistRefreshInterval: 10,
      });
      await controller.updateHotlist();

      expect(controller.isHotlistOutOfDate()).toBe(false);
    });

    it('should not be out of date if the phishing lists were recently updated', async () => {
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        hotlistRefreshInterval: 10,
      });
      await controller.updateHotlist();
      clock.tick(1000 * 5);

      expect(controller.isHotlistOutOfDate()).toBe(false);
    });

    it('should be out of date if the time elapsed since the last update equals the refresh interval', async () => {
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        hotlistRefreshInterval: 10,
      });
      await controller.updateHotlist();
      clock.tick(1000 * 10);

      expect(controller.isHotlistOutOfDate()).toBe(true);
    });
  });

  describe('isC2DomainBlocklistOutOfDate', () => {
    it('should not be out of date upon construction', () => {
      sinon.useFakeTimers();
      const controller = getPhishingController({
        c2DomainBlocklistRefreshInterval: 10,
      });

      expect(controller.isC2DomainBlocklistOutOfDate()).toBe(false);
    });

    it('should not be out of date after some of the refresh interval has passed', () => {
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        c2DomainBlocklistRefreshInterval: 10,
      });
      clock.tick(1000 * 5);

      expect(controller.isC2DomainBlocklistOutOfDate()).toBe(false);
    });

    it('should be out of date after the refresh interval has passed', () => {
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        c2DomainBlocklistRefreshInterval: 10,
      });
      clock.tick(1000 * 10);

      expect(controller.isC2DomainBlocklistOutOfDate()).toBe(true);
    });

    it('should be out of date if the refresh interval has passed and an update is in progress', async () => {
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        c2DomainBlocklistRefreshInterval: 10,
      });
      clock.tick(1000 * 10);
      const pendingUpdate = controller.updateC2DomainBlocklist();

      expect(controller.isC2DomainBlocklistOutOfDate()).toBe(true);

      // Cleanup pending operations
      await pendingUpdate;
    });

    it('should not be out of date if the C2 domain blocklist was just updated', async () => {
      sinon.useFakeTimers();
      const controller = getPhishingController({
        c2DomainBlocklistRefreshInterval: 10,
      });
      await controller.updateC2DomainBlocklist();

      expect(controller.isC2DomainBlocklistOutOfDate()).toBe(false);
    });

    it('should not be out of date if the C2 domain blocklist was recently updated', async () => {
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        c2DomainBlocklistRefreshInterval: 10,
      });
      await controller.updateC2DomainBlocklist();
      clock.tick(1000 * 5);

      expect(controller.isC2DomainBlocklistOutOfDate()).toBe(false);
    });

    it('should be out of date if the time elapsed since the last update equals the refresh interval', async () => {
      const clock = sinon.useFakeTimers();
      const controller = getPhishingController({
        c2DomainBlocklistRefreshInterval: 10,
      });
      await controller.updateC2DomainBlocklist();
      clock.tick(1000 * 10);

      expect(controller.isC2DomainBlocklistOutOfDate()).toBe(true);
    });
  });

  it('should be able to change the stalelistRefreshInterval', async () => {
    sinon.useFakeTimers();
    const controller = getPhishingController({ stalelistRefreshInterval: 10 });
    controller.setStalelistRefreshInterval(0);

    expect(controller.isStalelistOutOfDate()).toBe(true);
  });

  it('should be able to change the hotlistRefreshInterval', async () => {
    sinon.useFakeTimers();
    const controller = getPhishingController({
      hotlistRefreshInterval: 10,
    });
    controller.setHotlistRefreshInterval(0);

    expect(controller.isHotlistOutOfDate()).toBe(true);
  });

  it('should be able to change the c2DomainBlocklistRefreshInterval', async () => {
    sinon.useFakeTimers();
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
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          eth_phishing_detect_config: {
            allowlist: ['metamask.io'],
            blocklist: [],
            fuzzylist: [],
          },
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          phishfort_hotlist: {
            blocklist: [],
          },
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
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          eth_phishing_detect_config: {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
          },
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          phishfort_hotlist: {
            blocklist: [],
          },
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
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          eth_phishing_detect_config: {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
          },
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          phishfort_hotlist: {
            blocklist: [],
          },
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
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          eth_phishing_detect_config: {
            allowlist: [],
            blocklist: ['etnerscan.io'],
            fuzzylist: [],
          },
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          phishfort_hotlist: {
            blocklist: [],
          },
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
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          eth_phishing_detect_config: {
            blocklist: ['xn--myetherallet-4k5fwn.com'],
            allowlist: [],
            fuzzylist: [],
          },
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          phishfort_hotlist: {
            blocklist: [],
          },
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
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          eth_phishing_detect_config: {
            allowlist: [],
            blocklist: ['xn--myetherallet-4k5fwn.com'],
            fuzzylist: [],
          },
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          phishfort_hotlist: {
            blocklist: [],
          },
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
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          eth_phishing_detect_config: {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
          },
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          phishfort_hotlist: {
            blocklist: [],
          },
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
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          eth_phishing_detect_config: {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
          },
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          phishfort_hotlist: {
            blocklist: [],
          },
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
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          eth_phishing_detect_config: {
            allowlist: ['opensea.io'],
            blocklist: [],
            fuzzylist: [],
          },
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          phishfort_hotlist: {
            blocklist: [],
          },
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
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          eth_phishing_detect_config: {
            allowlist: ['opensea.io'],
            blocklist: [],
            fuzzylist: ['opensea.io'],
          },
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          phishfort_hotlist: {
            blocklist: [],
          },
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
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          eth_phishing_detect_config: {
            allowlist: ['opensea.io'],
            blocklist: [],
            fuzzylist: ['opensea.io'],
          },
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          phishfort_hotlist: {
            blocklist: [],
          },
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
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          eth_phishing_detect_config: {
            allowlist: [],
            blocklist: ['electrum.mx'],
            fuzzylist: [],
          },
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          phishfort_hotlist: {
            blocklist: [],
          },
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
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          eth_phishing_detect_config: {
            allowlist: [],
            blocklist: ['electrum.mx'],
            fuzzylist: [],
          },
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          phishfort_hotlist: {
            blocklist: [],
          },
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
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          eth_phishing_detect_config: {
            allowlist: [],
            blocklist: ['xn--myetherallet-4k5fwn.com'],
            fuzzylist: [],
          },
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          phishfort_hotlist: {
            blocklist: [],
          },
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
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          eth_phishing_detect_config: {
            allowlist: [],
            blocklist: ['xn--myetherallet-4k5fwn.com'],
            fuzzylist: [],
          },
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          phishfort_hotlist: {
            blocklist: [],
          },
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

  describe('updateStalelist', () => {
    it('should update lists with addition to hotlist', async () => {
      sinon.useFakeTimers(2);
      const exampleBlockedUrl = 'https://example-blocked-website.com';
      const exampleRequestBlockedHash =
        '0415f1f12f07ddc4ef7e229da747c6c53a6a6474fbaf295a35d984ec0ece9455';
      const exampleBlockedUrlOne =
        'https://another-example-blocked-website.com';
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(200, {
          data: {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            eth_phishing_detect_config: {
              allowlist: [],
              blocklist: [exampleBlockedUrl],
              fuzzylist: [],
            },
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            phishfort_hotlist: {
              blocklist: [],
            },
            tolerance: 0,
            allowlist: [],
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
          fuzzylist: [],
          tolerance: 0,
          lastUpdated: 2,
          name: ListNames.MetaMask,
          version: 0,
        },
      ]);
    });

    it('should update lists with removal diff from hotlist', async () => {
      sinon.useFakeTimers(2);
      const exampleBlockedUrl = 'example-blocked-website.com';
      const exampleRequestBlockedHash =
        '0415f1f12f07ddc4ef7e229da747c6c53a6a6474fbaf295a35d984ec0ece9455';
      const exampleBlockedUrlTwo = 'another-example-blocked-website.com';
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(200, {
          data: {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            eth_phishing_detect_config: {
              allowlist: [],
              blocklist: [exampleBlockedUrl],
              fuzzylist: [],
            },
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            phishfort_hotlist: {
              blocklist: [],
            },
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
          fuzzylist: [],
          tolerance: 0,
          version: 0,
          lastUpdated: 2,
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
        const clock = sinon.useFakeTimers();
        const nockScope = nock(PHISHING_CONFIG_BASE_URL)
          .get(METAMASK_STALELIST_FILE)
          .delay(100)
          .reply(200, {
            data: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              eth_phishing_detect_config: {
                allowlist: [],
                blocklist: [],
                fuzzylist: [],
              },
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              phishfort_hotlist: {
                blocklist: [],
              },
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

        clock.tick(1000 * 100);

        await firstPromise;
        await secondPromise;

        // This second update would throw if it fetched, because the
        // nock interceptor was not persisted.
        expect(nockScope.isDone()).toBe(true);
      });

      it('should wait until the in-progress update has completed', async () => {
        const clock = sinon.useFakeTimers();
        nock(PHISHING_CONFIG_BASE_URL)
          .get(METAMASK_STALELIST_FILE)
          .delay(100)
          .reply(200, {
            data: {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              eth_phishing_detect_config: {
                allowlist: [],
                blocklist: [],
                fuzzylist: [],
              },
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              phishfort_hotlist: {
                blocklist: [],
              },
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
        clock.tick(1000 * 99);

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
      nock.cleanAll();
    });

    it('should return false if c2DomainBlocklist is not defined or empty', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(200, {
          data: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            eth_phishing_detect_config: {
              allowlist: [],
              blocklist: [],
              fuzzylist: [],
            },
            // eslint-disable-next-line @typescript-eslint/naming-convention
            phishfort_hotlist: {
              blocklist: [],
            },
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
            // eslint-disable-next-line @typescript-eslint/naming-convention
            eth_phishing_detect_config: {
              allowlist: [],
              blocklist: [],
              fuzzylist: [],
            },
            // eslint-disable-next-line @typescript-eslint/naming-convention
            phishfort_hotlist: {
              blocklist: [],
            },
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
            // eslint-disable-next-line @typescript-eslint/naming-convention
            eth_phishing_detect_config: {
              allowlist: [],
              blocklist: [],
              fuzzylist: [],
            },
            // eslint-disable-next-line @typescript-eslint/naming-convention
            phishfort_hotlist: {
              blocklist: [],
            },
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
            // eslint-disable-next-line @typescript-eslint/naming-convention
            eth_phishing_detect_config: {
              allowlist: [],
              blocklist: [],
              fuzzylist: [],
            },
            // eslint-disable-next-line @typescript-eslint/naming-convention
            phishfort_hotlist: {
              blocklist: [],
            },
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
          // eslint-disable-next-line @typescript-eslint/naming-convention
          eth_phishing_detect_config: {
            allowlist: [allowlistedDomain],
            blocklist: [],
            fuzzylist: [],
          },
          // eslint-disable-next-line @typescript-eslint/naming-convention
          phishfort_hotlist: {
            blocklist: [],
          },
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
  describe('PhishingController - bypass', () => {
    let controller: PhishingController;

    beforeEach(() => {
      controller = getPhishingController();
    });

    it('should do nothing if the origin is already in the whitelist', () => {
      const origin = 'https://example.com';
      const hostname = getHostnameFromUrl(origin);

      // Call the bypass function
      controller.bypass(origin);
      controller.bypass(origin);

      // Verify that the whitelist has not changed
      expect(controller.state.whitelist).toContain(hostname);
      expect(controller.state.whitelist).toHaveLength(1); // No duplicates added
    });

    it('should add the origin to the whitelist if not already present', () => {
      const origin = 'https://newsite.com';
      const hostname = getHostnameFromUrl(origin);

      // Call the bypass function
      controller.bypass(origin);

      // Verify that the whitelist now includes the new origin
      expect(controller.state.whitelist).toContain(hostname);
      expect(controller.state.whitelist).toHaveLength(1);
    });

    it('should add punycode origins to the whitelist if not already present', () => {
      const punycodeOrigin = 'xn--fsq.com'; // Example punycode domain

      // Call the bypass function
      controller.bypass(punycodeOrigin);

      // Verify that the whitelist now includes the punycode origin
      expect(controller.state.whitelist).toContain(punycodeOrigin);
      expect(controller.state.whitelist).toHaveLength(1);
    });
  });

  describe('scanUrl', () => {
    let controller: PhishingController;
    let clock: sinon.SinonFakeTimers;
    const testUrl: string = 'https://example.com';
    const mockResponse: PhishingDetectionScanResult = {
      domainName: 'example.com',
      recommendedAction: RecommendedAction.None,
    };

    beforeEach(() => {
      controller = getPhishingController();
      clock = sinon.useFakeTimers();
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
          domainName: '',
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
      clock.tick(8000);
      const response = await promise;
      expect(response).toMatchObject({
        domainName: '',
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
        domainName: 'sub.example.com',
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
          domainName: '',
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
});
