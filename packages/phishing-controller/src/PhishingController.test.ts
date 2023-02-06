import { strict as assert } from 'assert';
import * as sinon from 'sinon';
import nock from 'nock';
import DEFAULT_PHISHING_RESPONSE from 'eth-phishing-detect/src/config.json';
import {
  METAMASK_HOTLIST_DIFF_FILE,
  METAMASK_STALELIST_FILE,
  PhishingController,
  PHISHING_CONFIG_BASE_URL,
} from './PhishingController';

const defaultHotlistRefreshInterval = 30 * 60;
const defaultStalelistRefreshInterval = 4 * 24 * 60 * 60;

describe('PhishingController', () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    sinon.restore();
  });

  it('should set default state to the package phishing list', () => {
    const controller = new PhishingController();
    expect(controller.state.listState).toStrictEqual({
      allowlist: DEFAULT_PHISHING_RESPONSE.whitelist,
      blocklist: DEFAULT_PHISHING_RESPONSE.blacklist,
      fuzzylist: DEFAULT_PHISHING_RESPONSE.fuzzylist,
      tolerance: DEFAULT_PHISHING_RESPONSE.tolerance,
      name: `MetaMask`,
      version: DEFAULT_PHISHING_RESPONSE.version,
      lastUpdated: 0,
    });
  });

  it('should default to an empty whitelist', () => {
    const controller = new PhishingController();
    expect(controller.state.whitelist).toStrictEqual([]);
  });

  it('should use default stalelist & hotlist refresh intervals', () => {
    const controller = new PhishingController();
    expect(controller.config).toStrictEqual({
      stalelistRefreshInterval: defaultStalelistRefreshInterval,
      hotlistRefreshInterval: defaultHotlistRefreshInterval,
    });
  });

  it('does not call update stalelist or hotlist upon construction', async () => {
    const nockScope = nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        blocklist: [],
        fuzzylist: [],
        tolerance: 0,
        allowlist: [],
        version: 0,
      })
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .reply(200, []);

    new PhishingController({});

    expect(nockScope.isDone()).toBe(false);
  });

  it('should not re-request when an update is in progress', async () => {
    const clock = sinon.useFakeTimers();
    const nockScope = nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .delay(500) // delay promise resolution to generate "pending" state that lasts long enough to test.
      .reply(200, [
        {
          url: 'this-should-not-be-in-default-blocklist.com',
          timestamp: 1,
          isRemoval: true,
          targetList: 'blocklist',
        },
        {
          url: 'this-should-not-be-in-default-blocklist.com',
          timestamp: 2,
          targetList: 'blocklist',
        },
      ]);

    const controller = new PhishingController({
      hotlistRefreshInterval: 10,
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
          blocklist: ['this-should-not-be-in-default-blocklist.com'],
          fuzzylist: [],
          tolerance: 0,
          allowlist: ['this-should-not-be-in-default-allowlist.com'],
          version: 0,
        })
        .get(METAMASK_HOTLIST_DIFF_FILE)
        .reply(200, [
          {
            url: 'this-should-not-be-in-default-blocklist.com',
            timestamp: 1,
            isRemoval: true,
            targetList: 'blocklist',
          },
          {
            url: 'this-should-not-be-in-default-blocklist.com',
            timestamp: 2,
            targetList: 'blocklist',
          },
        ]);
    });

    it('should not have stalelist be out of date immediately after maybeUpdateState is called', async () => {
      const clock = sinon.useFakeTimers();
      const controller = new PhishingController({
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
      const controller = new PhishingController({
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
      const controller = new PhishingController({
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
      const controller = new PhishingController({
        stalelistRefreshInterval: 10,
      });
      expect(controller.isStalelistOutOfDate()).toBe(false);
      await controller.maybeUpdateState();
      expect(
        controller.test('this-should-not-be-in-default-blocklist.com'),
      ).toMatchObject({
        result: false,
        type: 'all',
      });

      expect(
        controller.test('this-should-not-be-in-default-allowlist.com'),
      ).toMatchObject({
        result: false,
        type: 'all',
      });

      clock.tick(1000 * 10);
      await controller.maybeUpdateState();

      expect(
        controller.test('this-should-not-be-in-default-blocklist.com'),
      ).toMatchObject({
        result: true,
        type: 'blocklist',
      });

      expect(
        controller.test('this-should-not-be-in-default-allowlist.com'),
      ).toMatchObject({
        result: false,
        type: 'allowlist',
      });

      expect(nockScope.isDone()).toBe(true);
    });

    it('should not have hotlist be out of date immediately after maybeUpdateState is called', async () => {
      nockScope = nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_HOTLIST_DIFF_FILE)
        .reply(200, [
          {
            url: 'this-should-not-be-in-default-blocklist.com',
            timestamp: 1,
            isRemoval: true,
            targetList: 'blocklist',
          },
          {
            url: 'this-should-not-be-in-default-blocklist.com',
            timestamp: 2,
            targetList: 'blocklist',
          },
        ]);
      const clock = sinon.useFakeTimers(50);
      const controller = new PhishingController({
        hotlistRefreshInterval: 10,
        stalelistRefreshInterval: 50,
      });
      clock.tick(1000 * 10);
      expect(controller.isHotlistOutOfDate()).toBe(true);
      await controller.maybeUpdateState();
      expect(controller.isHotlistOutOfDate()).toBe(false);
    });
  });

  describe('isStalelistOutOfDate', () => {
    it('should not be out of date upon construction', () => {
      sinon.useFakeTimers();
      const controller = new PhishingController({
        stalelistRefreshInterval: 10,
      });

      expect(controller.isStalelistOutOfDate()).toBe(false);
    });

    it('should not be out of date after some of the refresh interval has passed', () => {
      const clock = sinon.useFakeTimers();
      const controller = new PhishingController({
        stalelistRefreshInterval: 10,
      });
      clock.tick(1000 * 5);

      expect(controller.isStalelistOutOfDate()).toBe(false);
    });

    it('should be out of date after the refresh interval has passed', () => {
      const clock = sinon.useFakeTimers();
      const controller = new PhishingController({
        stalelistRefreshInterval: 10,
      });
      clock.tick(1000 * 10);

      expect(controller.isStalelistOutOfDate()).toBe(true);
    });

    it('should be out of date if the refresh interval has passed and an update is in progress', async () => {
      const clock = sinon.useFakeTimers();
      const controller = new PhishingController({
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
      const controller = new PhishingController({
        stalelistRefreshInterval: 10,
      });
      await controller.updateStalelist();

      expect(controller.isStalelistOutOfDate()).toBe(false);
    });

    it('should not be out of date if the phishing lists were recently updated', async () => {
      const clock = sinon.useFakeTimers();
      const controller = new PhishingController({
        stalelistRefreshInterval: 10,
      });
      await controller.updateStalelist();
      await clock.tick(1000 * 5);

      expect(controller.isStalelistOutOfDate()).toBe(false);
    });

    it('should be out of date if the time elapsed since the last update equals the refresh interval', async () => {
      const clock = sinon.useFakeTimers();
      const controller = new PhishingController({
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
      const controller = new PhishingController({
        hotlistRefreshInterval: 10,
      });

      expect(controller.isHotlistOutOfDate()).toBe(false);
    });

    it('should not be out of date after some of the refresh interval has passed', () => {
      const clock = sinon.useFakeTimers();
      const controller = new PhishingController({
        hotlistRefreshInterval: 10,
      });
      clock.tick(1000 * 5);

      expect(controller.isHotlistOutOfDate()).toBe(false);
    });

    it('should be out of date after the refresh interval has passed', () => {
      const clock = sinon.useFakeTimers();
      const controller = new PhishingController({
        hotlistRefreshInterval: 10,
      });
      clock.tick(1000 * 10);

      expect(controller.isHotlistOutOfDate()).toBe(true);
    });

    it('should be out of date if the refresh interval has passed and an update is in progress', async () => {
      const clock = sinon.useFakeTimers();
      const controller = new PhishingController({
        hotlistRefreshInterval: 10,
      });
      clock.tick(1000 * 10);
      const pendingUpdate = controller.updateHotlist();

      expect(controller.isHotlistOutOfDate()).toBe(true);

      // Cleanup pending operations
      await pendingUpdate;
    });

    it('should not be out of date if the phishing lists were just updated', async () => {
      sinon.useFakeTimers();
      const controller = new PhishingController({
        hotlistRefreshInterval: 10,
      });
      await controller.updateHotlist();

      expect(controller.isHotlistOutOfDate()).toBe(false);
    });

    it('should not be out of date if the phishing lists were recently updated', async () => {
      const clock = sinon.useFakeTimers();
      const controller = new PhishingController({
        hotlistRefreshInterval: 10,
      });
      await controller.updateHotlist();
      await clock.tick(1000 * 5);

      expect(controller.isHotlistOutOfDate()).toBe(false);
    });

    it('should be out of date if the time elapsed since the last update equals the refresh interval', async () => {
      const clock = sinon.useFakeTimers();
      const controller = new PhishingController({
        hotlistRefreshInterval: 10,
      });
      await controller.updateHotlist();
      clock.tick(1000 * 10);

      expect(controller.isHotlistOutOfDate()).toBe(true);
    });
  });

  it('should be able to change the stalelistRefreshInterval', async () => {
    sinon.useFakeTimers();
    const controller = new PhishingController({ stalelistRefreshInterval: 10 });
    controller.setStalelistRefreshInterval(0);

    expect(controller.isStalelistOutOfDate()).toBe(true);
  });

  it('should be able to change the hotlistRefreshInterval', async () => {
    sinon.useFakeTimers();
    const controller = new PhishingController({
      hotlistRefreshInterval: 10,
    });
    controller.setHotlistRefreshInterval(0);

    expect(controller.isHotlistOutOfDate()).toBe(true);
  });

  it('should return negative result for safe domain from default config', () => {
    const controller = new PhishingController();
    expect(controller.test('metamask.io')).toMatchObject({
      result: false,
      type: 'allowlist',
      name: 'MetaMask',
    });
  });

  it('should return negative result for safe unicode domain from default config', () => {
    const controller = new PhishingController();
    expect(controller.test('i❤.ws')).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should return negative result for safe punycode domain from default config', () => {
    const controller = new PhishingController();
    expect(controller.test('xn--i-7iq.ws')).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should return positive result for unsafe domain from default config', () => {
    const controller = new PhishingController();
    expect(controller.test('etnerscan.io')).toMatchObject({
      result: true,
      type: 'blocklist',
      name: 'MetaMask',
    });
  });

  it('should return positive result for unsafe unicode domain from default config', () => {
    const controller = new PhishingController();
    expect(controller.test('myetherẉalletṭ.com')).toMatchObject({
      result: true,
      type: 'blocklist',
      name: 'MetaMask',
    });
  });

  it('should return positive result for unsafe punycode domain from default config', () => {
    const controller = new PhishingController();
    expect(controller.test('xn--myetherallet-4k5fwn.com')).toMatchObject({
      result: true,
      type: 'blocklist',
      name: `MetaMask`,
    });
  });

  it('should return negative result for safe domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        blocklist: [],
        fuzzylist: [],
        tolerance: 0,
        allowlist: ['metamask.io'],
        version: 0,
        lastUpdated: 0,
      })
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updateStalelist();
    expect(controller.test('metamask.io')).toMatchObject({
      result: false,
      type: 'allowlist',
      name: 'MetaMask',
    });
  });

  it('should return negative result for safe unicode domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        blocklist: [],
        fuzzylist: [],
        tolerance: 0,
        allowlist: [],
        version: 0,
        lastUpdated: 0,
      })
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updateStalelist();
    expect(controller.test('i❤.ws')).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should return negative result for safe punycode domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        blocklist: [],
        fuzzylist: [],
        tolerance: 0,
        allowlist: [],
        version: 0,
        lastUpdated: 0,
      })
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updateStalelist();
    expect(controller.test('xn--i-7iq.ws')).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should return positive result for unsafe domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        blocklist: ['etnerscan.io'],
        fuzzylist: [],
        tolerance: 0,
        allowlist: [],
        version: 0,
        lastUpdated: 0,
      })
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updateStalelist();
    expect(controller.test('etnerscan.io')).toMatchObject({
      result: true,
      type: 'blocklist',
      name: 'MetaMask',
    });
  });

  it('should return positive result for unsafe unicode domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        blocklist: ['xn--myetherallet-4k5fwn.com'],
        fuzzylist: [],
        tolerance: 0,
        allowlist: [],
        version: 0,
        lastUpdated: 0,
      })
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updateStalelist();
    expect(controller.test('myetherẉalletṭ.com')).toMatchObject({
      result: true,
      type: 'blocklist',
      name: 'MetaMask',
    });
  });

  it('should return a blocklist result for unsafe unicode domain if the MetaMask config returns 500 - as it falls back to default config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(500)
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updateStalelist();
    expect(controller.test('myetherẉalletṭ.com')).toMatchObject({
      result: true,
      type: 'blocklist',
    });
  });

  it('should return positive result for unsafe punycode domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        blocklist: ['xn--myetherallet-4k5fwn.com'],
        fuzzylist: [],
        tolerance: 0,
        allowlist: [],
        version: 0,
        lastUpdated: 0,
      })
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updateStalelist();
    expect(controller.test('xn--myetherallet-4k5fwn.com')).toMatchObject({
      result: true,
      type: 'blocklist',
      name: 'MetaMask',
    });
  });

  it('should return positive result for unsafe unicode domain from the MetaMask hotlist (blocklist)', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        blocklist: [],
        fuzzylist: [],
        tolerance: 0,
        allowlist: [],
        version: 0,
        lastUpdated: 0,
      })
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .reply(200, [
        {
          url: 'e4d600ab9141b7a9859511c77e63b9b3.com',
          timestamp: 1,
          targetList: 'blocklist',
        },
      ]);

    const controller = new PhishingController();
    await controller.updateStalelist();
    expect(
      controller.test('e4d600ab9141b7a9859511c77e63b9b3.com'),
    ).toMatchObject({
      result: true,
      type: 'blocklist',
      name: 'MetaMask',
    });
  });

  it('should return negative result for unsafe unicode domain if the MetaMask hotlist (blocklist) returns 500', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        blocklist: [],
        fuzzylist: [],
        tolerance: 0,
        allowlist: [],
        version: 0,
        lastUpdated: 0,
      })
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .reply(500);

    const controller = new PhishingController();
    await controller.updateStalelist();
    expect(
      controller.test('e4d600ab9141b7a9859511c77e63b9b3.com'),
    ).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should return negative result for safe fuzzylist domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        blocklist: [],
        fuzzylist: [],
        tolerance: 0,
        allowlist: ['opensea.io'],
        version: 0,
        lastUpdated: 0,
      })
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updateStalelist();
    expect(controller.test('opensea.io')).toMatchObject({
      result: false,
      type: 'allowlist',
      name: 'MetaMask',
    });
  });

  it('should return positive result for domain very close to fuzzylist from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        blocklist: [],
        fuzzylist: ['opensea.io'],
        tolerance: 2,
        allowlist: ['opensea.io'],
        version: 0,
        lastUpdated: 0,
      })
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updateStalelist();
    expect(controller.test('ohpensea.io')).toMatchObject({
      result: true,
      type: 'fuzzy',
      name: 'MetaMask',
    });
  });

  it('should return fuzzylist result for domain very close to fuzzylist if MetaMask config returns 500 - as controller falls back to static config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(500)
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updateStalelist();
    expect(controller.test('ohpensea.io')).toMatchObject({
      result: true,
      type: 'fuzzy',
    });
  });

  it('should return negative result for domain not very close to fuzzylist from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        blocklist: [],
        fuzzylist: ['opensea.io'],
        tolerance: 2,
        allowlist: ['opensea.io'],
        version: 0,
        lastUpdated: 0,
      })
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updateStalelist();
    expect(
      controller.test('this-is-the-official-website-of-opensea.io'),
    ).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should bypass a given domain, and return a negative result', () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        blocklist: ['electrum.mx'],
        fuzzylist: [],
        tolerance: 2,
        allowlist: [],
        version: 0,
        lastUpdated: 0,
      })
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    const unsafeDomain = 'electrum.mx';
    assert.equal(
      controller.test(unsafeDomain).result,
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(unsafeDomain);
    expect(controller.test(unsafeDomain)).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should ignore second attempt to bypass a domain, and still return a negative result', () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        blocklist: ['electrum.mx'],
        fuzzylist: [],
        tolerance: 2,
        allowlist: [],
        version: 0,
        lastUpdated: 0,
      })
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    const unsafeDomain = 'electrum.mx';
    assert.equal(
      controller.test(unsafeDomain).result,
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(unsafeDomain);
    controller.bypass(unsafeDomain);
    expect(controller.test(unsafeDomain)).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should bypass a given unicode domain, and return a negative result', () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        blocklist: ['xn--myetherallet-4k5fwn.com'],
        fuzzylist: [],
        tolerance: 2,
        allowlist: [],
        version: 0,
        lastUpdated: 0,
      })
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    const unsafeDomain = 'myetherẉalletṭ.com';
    assert.equal(
      controller.test(unsafeDomain).result,
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(unsafeDomain);
    expect(controller.test(unsafeDomain)).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should bypass a given punycode domain, and return a negative result', () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_STALELIST_FILE)
      .reply(200, {
        blocklist: ['xn--myetherallet-4k5fwn.com'],
        fuzzylist: [],
        tolerance: 2,
        allowlist: [],
        version: 0,
        lastUpdated: 0,
      })
      .get(METAMASK_HOTLIST_DIFF_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    const unsafeDomain = 'xn--myetherallet-4k5fwn.com';
    assert.equal(
      controller.test(unsafeDomain).result,
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(unsafeDomain);
    expect(controller.test(unsafeDomain)).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  describe('updateStalelist', () => {
    it('should update lists with addition to hotlist', async () => {
      sinon.useFakeTimers(2);
      const exampleBlockedUrl = 'https://example-blocked-website.com';
      const exampleBlockedUrlOne =
        'https://another-example-blocked-website.com';
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(200, {
          blocklist: [exampleBlockedUrl],
          fuzzylist: [],
          tolerance: 0,
          allowlist: [],
          version: 0,
          lastUpdated: 0,
        })
        .get(METAMASK_HOTLIST_DIFF_FILE)
        .reply(200, [
          { url: exampleBlockedUrlOne, timestamp: 1, targetList: 'blocklist' },
        ]);

      const controller = new PhishingController();
      await controller.updateStalelist();

      expect(controller.state.listState).toStrictEqual({
        allowlist: [],
        blocklist: [exampleBlockedUrl, exampleBlockedUrlOne],
        fuzzylist: [],
        tolerance: 0,
        lastUpdated: 0,
        name: 'MetaMask',
        version: 0,
      });
    });

    it('should update lists with removal diff from hotlist', async () => {
      sinon.useFakeTimers(2);
      const exampleBlockedUrl = 'example-blocked-website.com';
      const exampleBlockedUrlTwo = 'another-example-blocked-website.com';
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(200, {
          blocklist: [exampleBlockedUrl],
          fuzzylist: [],
          tolerance: 0,
          allowlist: [],
          version: 0,
          lastUpdated: 0,
        })
        .get(METAMASK_HOTLIST_DIFF_FILE)
        .reply(200, [
          {
            url: exampleBlockedUrlTwo,
            timestamp: 1,
            targetList: 'blocklist',
          },
          {
            url: exampleBlockedUrl,
            timestamp: 1,
            targetList: 'blocklist',
            isRemoval: true,
          },
        ]);

      const controller = new PhishingController();
      await controller.updateStalelist();

      expect(controller.state.listState).toStrictEqual({
        allowlist: [],
        blocklist: [exampleBlockedUrlTwo],
        fuzzylist: [],
        tolerance: 0,
        lastUpdated: 0,
        name: 'MetaMask',
        version: 0,
      });
    });

    it('should not update stale list if disabled', async () => {
      const controller = new PhishingController({ disabled: true });
      await controller.updateStalelist();

      expect(controller.state.listState).toStrictEqual({
        allowlist: DEFAULT_PHISHING_RESPONSE.whitelist,
        blocklist: DEFAULT_PHISHING_RESPONSE.blacklist,
        fuzzylist: DEFAULT_PHISHING_RESPONSE.fuzzylist,
        tolerance: DEFAULT_PHISHING_RESPONSE.tolerance,
        name: `MetaMask`,
        version: DEFAULT_PHISHING_RESPONSE.version,
        lastUpdated: 0,
      });
    });

    it('should not update hotlist lists if disabled', async () => {
      const controller = new PhishingController({ disabled: true });
      await controller.updateHotlist();

      expect(controller.state.listState).toStrictEqual({
        allowlist: DEFAULT_PHISHING_RESPONSE.whitelist,
        blocklist: DEFAULT_PHISHING_RESPONSE.blacklist,
        fuzzylist: DEFAULT_PHISHING_RESPONSE.fuzzylist,
        tolerance: DEFAULT_PHISHING_RESPONSE.tolerance,
        name: `MetaMask`,
        version: DEFAULT_PHISHING_RESPONSE.version,
        lastUpdated: 0,
      });
    });

    it('should not update phishing lists if fetch returns 304', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(304)
        .get(METAMASK_HOTLIST_DIFF_FILE)
        .reply(304);

      const controller = new PhishingController();
      await controller.updateStalelist();

      expect(controller.state.listState).toStrictEqual({
        allowlist: DEFAULT_PHISHING_RESPONSE.whitelist,
        blocklist: DEFAULT_PHISHING_RESPONSE.blacklist,
        fuzzylist: DEFAULT_PHISHING_RESPONSE.fuzzylist,
        tolerance: DEFAULT_PHISHING_RESPONSE.tolerance,
        name: `MetaMask`,
        version: DEFAULT_PHISHING_RESPONSE.version,
        lastUpdated: 0,
      });
    });

    it('should not update phishing lists if fetch returns 500', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .reply(500)
        .get(METAMASK_HOTLIST_DIFF_FILE)
        .reply(500);

      const controller = new PhishingController();
      await controller.updateStalelist();

      expect(controller.state.listState).toStrictEqual({
        allowlist: DEFAULT_PHISHING_RESPONSE.whitelist,
        blocklist: DEFAULT_PHISHING_RESPONSE.blacklist,
        fuzzylist: DEFAULT_PHISHING_RESPONSE.fuzzylist,
        tolerance: DEFAULT_PHISHING_RESPONSE.tolerance,
        name: `MetaMask`,
        version: DEFAULT_PHISHING_RESPONSE.version,
        lastUpdated: 0,
      });
    });

    it('should not throw when there is a network error', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_STALELIST_FILE)
        .replyWithError('network error')
        .get(METAMASK_HOTLIST_DIFF_FILE)
        .replyWithError('network error');

      const controller = new PhishingController();

      expect(await controller.updateStalelist()).toBeUndefined();
    });

    describe('an update is in progress', () => {
      it('should not fetch phishing lists again', async () => {
        const clock = sinon.useFakeTimers();
        const nockScope = nock(PHISHING_CONFIG_BASE_URL)
          .get(METAMASK_STALELIST_FILE)
          .delay(100)
          .reply(200, {
            blocklist: [],
            fuzzylist: [],
            tolerance: 0,
            allowlist: [],
            version: 0,
            lastUpdated: 0,
          })
          .get(METAMASK_HOTLIST_DIFF_FILE)
          .delay(100)
          .reply(200, []);

        const controller = new PhishingController();
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
            blocklist: [],
            fuzzylist: [],
            tolerance: 0,
            allowlist: [],
            version: 0,
            lastUpdated: 0,
          })
          .get(METAMASK_HOTLIST_DIFF_FILE)
          .delay(100)
          .reply(200, []);

        const controller = new PhishingController();
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
});
