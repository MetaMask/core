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

  it('fetches the first time test is used', async () => {
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

    const controller = new PhishingController({});
    await controller.test('metamask.io');

    expect(nockScope.isDone()).toBe(true);
  });

  it('does not call fetch twice if the second call is inside of the refreshInterval', async () => {
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

    const controller = new PhishingController({});
    await controller.test('metamask.io');

    expect(nockScope.isDone()).toBe(true);
    // The nock handlers were not created with `persist()`, so they will only
    // be used once. The next `fetch` will throw, so this expectation shows
    // that no `fetch` has occurred.
    expect(await controller.test('metamask.io')).toStrictEqual({
      result: false,
      type: 'all',
    });
  });

  it('should call fetch twice if the second call is outside the refreshInterval', async () => {
    const clock = sinon.useFakeTimers(Date.now());
    const nockScope = nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .times(2)
      .reply(200, {
        blacklist: [],
        fuzzylist: [],
        tolerance: 0,
        whitelist: [],
        version: 0,
      })
      .get(PHISHFORT_HOTLIST_FILE)
      .times(2)
      .reply(200, []);

    const controller = new PhishingController();
    await controller.test('metamask.io');
    await clock.tickAsync(defaultRefreshInterval);
    await controller.test('metamask.io');

    expect(nockScope.isDone()).toBe(true);
  });

  it('should be able to change the refreshInterval', async () => {
    const nockScope = nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .times(3)
      .reply(200, {
        blacklist: [],
        fuzzylist: [],
        tolerance: 0,
        whitelist: [],
        version: 0,
      })
      .get(PHISHFORT_HOTLIST_FILE)
      .times(3)
      .reply(200, []);

    const controller = new PhishingController({ refreshInterval: 1 });
    controller.setRefreshInterval(0);
    await controller.test('metamask.io');
    await controller.test('metamask.io');
    await controller.test('metamask.io');

    expect(nockScope.isDone()).toBe(true);
  });

  it('should not bubble up connection errors', async () => {
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .replyWithError({ code: 'ETIMEDOUT' })
      .get(PHISHFORT_HOTLIST_FILE)
      .replyWithError({ code: 'ETIMEDOUT' });

    const controller = new PhishingController();
    expect(await controller.test('metamask.io')).toMatchObject({
      result: false,
      type: 'allowlist',
      name: 'MetaMask',
    });
  });

  it('should return negative result for safe unicode domain from default config', async () => {
    // Return API failure to ensure default config is not overwritten
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(500)
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(500);

    const controller = new PhishingController();
    expect(await controller.test('i❤.ws')).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should return negative result for safe punycode domain from default config', async () => {
    // Return API failure to ensure default config is not overwritten
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(500)
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(500);

    const controller = new PhishingController();
    expect(await controller.test('xn--i-7iq.ws')).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should return positive result for unsafe domain from default config', async () => {
    // Return API failure to ensure default config is not overwritten
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(500)
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(500);

    const controller = new PhishingController();
    expect(await controller.test('etnerscan.io')).toMatchObject({
      result: true,
      type: 'blocklist',
      name: 'MetaMask',
    });
  });

  it('should return positive result for unsafe unicode domain from default config', async () => {
    // Return API failure to ensure default config is not overwritten
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(500)
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(500);

    const controller = new PhishingController();
    expect(await controller.test('myetherẉalletṭ.com')).toMatchObject({
      result: true,
      type: 'blocklist',
      name: 'MetaMask',
    });
  });

  it('should return positive result for unsafe punycode domain from default config', async () => {
    // Return API failure to ensure default config is not overwritten
    nock(PHISHING_CONFIG_BASE_URL)
      .get(METAMASK_CONFIG_FILE)
      .reply(500)
      .get(PHISHFORT_HOTLIST_FILE)
      .reply(500);

    const controller = new PhishingController();
    expect(await controller.test('xn--myetherallet-4k5fwn.com')).toMatchObject({
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
    expect(await controller.test('metamask.io')).toMatchObject({
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
    expect(await controller.test('i❤.ws')).toMatchObject({
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
    expect(await controller.test('xn--i-7iq.ws')).toMatchObject({
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
    expect(await controller.test('etnerscan.io')).toMatchObject({
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
    expect(await controller.test('myetherẉalletṭ.com')).toMatchObject({
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
    expect(await controller.test('myetherẉalletṭ.com')).toMatchObject({
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
    expect(await controller.test('xn--myetherallet-4k5fwn.com')).toMatchObject({
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
      await controller.test('e4d600ab9141b7a9859511c77e63b9b3.com'),
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
      await controller.test('e4d600ab9141b7a9859511c77e63b9b3.com'),
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
    expect(await controller.test('opensea.io')).toMatchObject({
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
    expect(await controller.test('ohpensea.io')).toMatchObject({
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
    expect(await controller.test('ohpensea.io')).toMatchObject({
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
      await controller.test('this-is-the-official-website-of-opensea.io'),
    ).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should bypass a given domain, and return a negative result', async () => {
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
      (await controller.test(unsafeDomain)).result,
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(unsafeDomain);
    expect(await controller.test(unsafeDomain)).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should ignore second attempt to bypass a domain, and still return a negative result', async () => {
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
      (await controller.test(unsafeDomain)).result,
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(unsafeDomain);
    controller.bypass(unsafeDomain);
    expect(await controller.test(unsafeDomain)).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should bypass a given unicode domain, and return a negative result', async () => {
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
      (await controller.test(unsafeDomain)).result,
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(unsafeDomain);
    expect(await controller.test(unsafeDomain)).toMatchObject({
      result: false,
      type: 'all',
    });
  });

  it('should bypass a given punycode domain, and return a negative result', async () => {
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
      (await controller.test(unsafeDomain)).result,
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(unsafeDomain);
    expect(await controller.test(unsafeDomain)).toMatchObject({
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

    it('should return negative result for safe domain from default config', async () => {
      // Return API failure to ensure default config is not overwritten
      nock(PHISHING_CONFIG_BASE_URL)
        .get(METAMASK_CONFIG_FILE)
        .reply(500)
        .get(PHISHFORT_HOTLIST_FILE)
        .reply(500);

      const controller = new PhishingController();
      expect(await controller.test('metamask.io')).toMatchObject({
        result: false,
        type: 'allowlist',
        name: 'MetaMask',
      });
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

        expect(secondPromise).toNeverResolve();

        await firstPromise;
        await secondPromise;
      });
    });
  });
});
