import { strict as assert } from 'assert';
import sinon from 'sinon';
import nock from 'nock';
import DEFAULT_PHISHING_RESPONSE from 'eth-phishing-detect/src/config.json';
import {
  METAMASK_CONFIG_FILE,
  PHISHFORT_HOTLIST_FILE,
  PhishingController,
  PHISHING_CONFIG_BASE_URL,
} from './PhishingController';

const defaultRefreshInterval = 3600000;

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

  it('should set default state to the package phishing configuration', () => {
    const controller = new PhishingController();
    expect(controller.state.phishing).toStrictEqual([
      {
        allowlist: DEFAULT_PHISHING_RESPONSE.whitelist,
        blocklist: DEFAULT_PHISHING_RESPONSE.blacklist,
        fuzzylist: DEFAULT_PHISHING_RESPONSE.fuzzylist,
        tolerance: DEFAULT_PHISHING_RESPONSE.tolerance,
        name: `MetaMask`,
        version: DEFAULT_PHISHING_RESPONSE.version,
      },
    ]);
  });

  it('should default to an empty whitelist', () => {
    const controller = new PhishingController();
    expect(controller.state.whitelist).toStrictEqual([]);
  });

  it('should use default refresh interval', () => {
    const controller = new PhishingController();
    expect(controller.config).toStrictEqual({
      refreshInterval: defaultRefreshInterval,
    });
  });

  it('does not call updatePhishingList upon construction', async () => {
    const nockScope = nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(200, {
        blacklist: [],
        fuzzylist: [],
        tolerance: 0,
        whitelist: [],
        version: 0,
      })
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(200, []);

    new PhishingController({});

    expect(nockScope.isDone()).toBe(false);
  });

  describe('isOutOfDate', () => {
    it('should not be out of date upon construction', () => {
      sinon.useFakeTimers();
      const controller = new PhishingController({ refreshInterval: 10 });

      expect(controller.isOutOfDate()).toBe(false);
    });

    it('should not be out of date after some of the refresh interval has passed', () => {
      const clock = sinon.useFakeTimers();
      const controller = new PhishingController({ refreshInterval: 10 });
      clock.tick(5);

      expect(controller.isOutOfDate()).toBe(false);
    });

    it('should be out of date after the refresh interval has passed', () => {
      const clock = sinon.useFakeTimers();
      const controller = new PhishingController({ refreshInterval: 10 });
      clock.tick(10);

      expect(controller.isOutOfDate()).toBe(true);
    });

    it('should be out of date if the refresh interval has passed and an update is in progress', async () => {
      const clock = sinon.useFakeTimers();
      const controller = new PhishingController({ refreshInterval: 10 });
      clock.tick(10);
      const pendingUpdate = controller.updatePhishingLists();

      expect(controller.isOutOfDate()).toBe(true);

      // Cleanup pending operations
      await pendingUpdate;
    });

    it('should not be out of date if the configuration was just updated', async () => {
      sinon.useFakeTimers();
      const controller = new PhishingController({ refreshInterval: 10 });
      await controller.updatePhishingLists();

      expect(controller.isOutOfDate()).toBe(false);
    });

    it('should not be out of date if the configuration was recently updated', async () => {
      const clock = sinon.useFakeTimers();
      const controller = new PhishingController({ refreshInterval: 10 });
      await controller.updatePhishingLists();
      await clock.tick(5);

      expect(controller.isOutOfDate()).toBe(false);
    });

    it('should be out of date if the time elapsed since the last update equals the refresh interval', async () => {
      const clock = sinon.useFakeTimers();
      const controller = new PhishingController({ refreshInterval: 10 });
      await controller.updatePhishingLists();
      clock.tick(10);

      expect(controller.isOutOfDate()).toBe(true);
    });
  });

  it('should be able to change the refreshInterval', async () => {
    sinon.useFakeTimers();
    const controller = new PhishingController({ refreshInterval: 10 });
    controller.setRefreshInterval(0);

    expect(controller.isOutOfDate()).toBe(true);
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
      .get(METAMASK_CONFIG_FILE)
      .reply(200, {
        blacklist: [],
        fuzzylist: [],
        tolerance: 0,
        whitelist: ['metamask.io'],
        version: 0,
      })
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('metamask.io')).toMatchObject({
      result: false,
      type: 'allowlist',
      name: 'MetaMask',
    });
  });

  it('should return negative result for safe unicode domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(200, {
        blacklist: [],
        fuzzylist: [],
        tolerance: 0,
        whitelist: [],
        version: 0,
      })
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('i❤.ws')).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should return negative result for safe punycode domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(200, {
        blacklist: [],
        fuzzylist: [],
        tolerance: 0,
        whitelist: [],
        version: 0,
      })
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('xn--i-7iq.ws')).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should return positive result for unsafe domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(200, {
        blacklist: ['etnerscan.io'],
        fuzzylist: [],
        tolerance: 0,
        whitelist: [],
        version: 0,
      })
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('etnerscan.io')).toMatchObject({
      result: true,
      type: 'blocklist',
      name: 'MetaMask',
    });
  });

  it('should return positive result for unsafe unicode domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(200, {
        blacklist: ['xn--myetherallet-4k5fwn.com'],
        fuzzylist: [],
        tolerance: 0,
        whitelist: [],
        version: 0,
      })
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('myetherẉalletṭ.com')).toMatchObject({
      result: true,
      type: 'blocklist',
      name: 'MetaMask',
    });
  });

  it('should return negative result for unsafe unicode domain if the MetaMask config returns 500', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(500)
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('myetherẉalletṭ.com')).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should return positive result for unsafe punycode domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(200, {
        blacklist: ['xn--myetherallet-4k5fwn.com'],
        fuzzylist: [],
        tolerance: 0,
        whitelist: [],
        version: 0,
      })
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('xn--myetherallet-4k5fwn.com')).toMatchObject({
      result: true,
      type: 'blocklist',
      name: 'MetaMask',
    });
  });

  it('should return positive result for unsafe unicode domain from the PhishFort hotlist (blocklist)', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(200, {
        blacklist: [],
        fuzzylist: [],
        tolerance: 0,
        whitelist: [],
        version: 0,
      })
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(200, ['e4d600ab9141b7a9859511c77e63b9b3.com']);

    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(
      controller.test('e4d600ab9141b7a9859511c77e63b9b3.com'),
    ).toMatchObject({
      result: true,
      type: 'blocklist',
      name: 'PhishFort',
    });
  });

  it('should return negative result for unsafe unicode domain if the PhishFort hotlist (blocklist) returns 500', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(200, {
        blacklist: [],
        fuzzylist: [],
        tolerance: 0,
        whitelist: [],
        version: 0,
      })
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(500);

    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(
      controller.test('e4d600ab9141b7a9859511c77e63b9b3.com'),
    ).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should return negative result for safe fuzzylist domain from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(200, {
        blacklist: [],
        fuzzylist: [],
        tolerance: 0,
        whitelist: ['opensea.io'],
        version: 0,
      })
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('opensea.io')).toMatchObject({
      result: false,
      type: 'allowlist',
      name: 'MetaMask',
    });
  });

  it('should return positive result for domain very close to fuzzylist from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(200, {
        blacklist: [],
        fuzzylist: ['opensea.io'],
        tolerance: 2,
        whitelist: ['opensea.io'],
        version: 0,
      })
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('ohpensea.io')).toMatchObject({
      result: true,
      type: 'fuzzy',
      name: 'MetaMask',
    });
  });

  it('should return negative result for domain very close to fuzzylist if MetaMask config returns 500', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(500)
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('ohpensea.io')).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should return negative result for domain not very close to fuzzylist from MetaMask config', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(200, {
        blacklist: [],
        fuzzylist: ['opensea.io'],
        tolerance: 2,
        whitelist: ['opensea.io'],
        version: 0,
      })
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(
      controller.test('this-is-the-official-website-of-opensea.io'),
    ).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should bypass a given domain, and return a negative result', () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(200, {
        blacklist: ['electrum.mx'],
        fuzzylist: [],
        tolerance: 2,
        whitelist: [],
        version: 0,
      })
      .get(PHISHFORT_HOTLIST_FILE)
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
      .get(METAMASK_CONFIG_FILE)
      .reply(200, {
        blacklist: ['electrum.mx'],
        fuzzylist: [],
        tolerance: 2,
        whitelist: [],
        version: 0,
      })
      .get(PHISHFORT_HOTLIST_FILE)
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
      .get(METAMASK_CONFIG_FILE)
      .reply(200, {
        blacklist: ['xn--myetherallet-4k5fwn.com'],
        fuzzylist: [],
        tolerance: 2,
        whitelist: [],
        version: 0,
      })
      .get(PHISHFORT_HOTLIST_FILE)
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
      .get(METAMASK_CONFIG_FILE)
      .reply(200, {
        blacklist: ['xn--myetherallet-4k5fwn.com'],
        fuzzylist: [],
        tolerance: 2,
        whitelist: [],
        version: 0,
      })
      .get(PHISHFORT_HOTLIST_FILE)
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

  describe('updatePhishingLists', () => {
    it('should update lists', async () => {
      const mockPhishingBlocklist = ['https://example-blocked-website.com'];
      const phishfortHotlist = ['https://another-example-blocked-website.com'];
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_CONFIG_FILE)
        .reply(200, {
          blacklist: mockPhishingBlocklist,
          fuzzylist: [],
          tolerance: 0,
          whitelist: [],
          version: 0,
        })
        .get(PHISHFORT_HOTLIST_FILE)
        .reply(200, phishfortHotlist);

      const controller = new PhishingController();
      await controller.updatePhishingLists();

      expect(controller.state.phishing).toStrictEqual([
        {
          allowlist: [],
          blocklist: mockPhishingBlocklist,
          fuzzylist: [],
          tolerance: 0,
          name: 'MetaMask',
          version: 0,
        },
        {
          allowlist: [],
          blocklist: phishfortHotlist,
          fuzzylist: [],
          tolerance: 0,
          name: 'PhishFort',
          version: 1,
        },
      ]);
    });

    it('should not update phishing configuration if disabled', async () => {
      const controller = new PhishingController({ disabled: true });
      await controller.updatePhishingLists();

      expect(controller.state.phishing).toStrictEqual([
        {
          allowlist: DEFAULT_PHISHING_RESPONSE.whitelist,
          blocklist: DEFAULT_PHISHING_RESPONSE.blacklist,
          fuzzylist: DEFAULT_PHISHING_RESPONSE.fuzzylist,
          tolerance: DEFAULT_PHISHING_RESPONSE.tolerance,
          name: `MetaMask`,
          version: DEFAULT_PHISHING_RESPONSE.version,
        },
      ]);
    });

    it('should not update phishing lists if fetch returns 304', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_CONFIG_FILE)
        .reply(304)
        .get(PHISHFORT_HOTLIST_FILE)
        .reply(304);

      const controller = new PhishingController();
      await controller.updatePhishingLists();

      expect(controller.state.phishing).toStrictEqual([
        {
          allowlist: DEFAULT_PHISHING_RESPONSE.whitelist,
          blocklist: DEFAULT_PHISHING_RESPONSE.blacklist,
          fuzzylist: DEFAULT_PHISHING_RESPONSE.fuzzylist,
          tolerance: DEFAULT_PHISHING_RESPONSE.tolerance,
          name: `MetaMask`,
          version: DEFAULT_PHISHING_RESPONSE.version,
        },
      ]);
    });

    it('should not update phishing lists if fetch returns 500', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_CONFIG_FILE)
        .reply(500)
        .get(PHISHFORT_HOTLIST_FILE)
        .reply(500);

      const controller = new PhishingController();
      await controller.updatePhishingLists();

      expect(controller.state.phishing).toStrictEqual([
        {
          allowlist: DEFAULT_PHISHING_RESPONSE.whitelist,
          blocklist: DEFAULT_PHISHING_RESPONSE.blacklist,
          fuzzylist: DEFAULT_PHISHING_RESPONSE.fuzzylist,
          tolerance: DEFAULT_PHISHING_RESPONSE.tolerance,
          name: `MetaMask`,
          version: DEFAULT_PHISHING_RESPONSE.version,
        },
      ]);
    });

    it('should not throw when there is a network error', async () => {
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_CONFIG_FILE)
        .replyWithError('network error')
        .get(PHISHFORT_HOTLIST_FILE)
        .replyWithError('network error');

      const controller = new PhishingController();

      expect(await controller.updatePhishingLists()).toBeUndefined();
    });

    describe('an update is in progress', () => {
      it('should not fetch configuration again', async () => {
        const clock = sinon.useFakeTimers();
        const nockScope = nock(PHISHING_CONFIG_BASE_URL)
          .get(METAMASK_CONFIG_FILE)
          .delay(100)
          .reply(200, {
            blacklist: [],
            fuzzylist: [],
            tolerance: 0,
            whitelist: [],
            version: 0,
          })
          .get(PHISHFORT_HOTLIST_FILE)
          .delay(100)
          .reply(200, []);

        const controller = new PhishingController();
        const firstPromise = controller.updatePhishingLists();
        const secondPromise = controller.updatePhishingLists();

        clock.tick(100);

        await firstPromise;
        await secondPromise;

        // This second update would throw if it fetched, because the
        // nock interceptor was not persisted.
        expect(nockScope.isDone()).toBe(true);
      });

      it('should wait until the in-progress update has completed', async () => {
        const clock = sinon.useFakeTimers();
        nock(PHISHING_CONFIG_BASE_URL)
          .get(METAMASK_CONFIG_FILE)
          .delay(100)
          .reply(200, {
            blacklist: [],
            fuzzylist: [],
            tolerance: 0,
            whitelist: [],
            version: 0,
          })
          .get(PHISHFORT_HOTLIST_FILE)
          .delay(100)
          .reply(200, []);

        const controller = new PhishingController();
        const firstPromise = controller.updatePhishingLists();
        const secondPromise = controller.updatePhishingLists();
        clock.tick(99);

        await expect(secondPromise).toNeverResolve();

        // Cleanup pending operations
        await firstPromise;
        await secondPromise;
      });
    });
  });
});
