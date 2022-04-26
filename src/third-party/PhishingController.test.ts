import { strict as assert } from 'assert';
import sinon from 'sinon';
import nock from 'nock';
import { EthPhishingDetectResult, PhishingController } from './PhishingController';

describe('PhishingController', () => {
  afterEach(() => {
    nock.cleanAll();
    sinon.restore();
  });

  it('should set default state', () => {
    const controller = new PhishingController();
    controller.state.phishing.forEach((i) => {
      expect(i).toHaveProperty('allowlist');
      expect(i).toHaveProperty('blocklist');
      expect(i).toHaveProperty('fuzzylist');
      expect(i).toHaveProperty('tolerance');
      expect(i).toHaveProperty('name');
      expect(i).toHaveProperty('version');
    });
  });

  it('should set default config', () => {
    const controller = new PhishingController();
    expect(controller.config).toStrictEqual({ interval: 3_600_000 });
  });

  it('should poll and update rate in the right interval', async () => {
    await new Promise<void>((resolve) => {
      const mock = sinon.stub(
        PhishingController.prototype,
        'updatePhishingLists',
      );
      new PhishingController({ interval: 10 });
      expect(mock.called).toBe(true);
      expect(mock.calledTwice).toBe(false);
      setTimeout(() => {
        expect(mock.calledTwice).toBe(true);
        resolve();
      }, 15);
    });
  });

  it('should clear previous interval', async () => {
    const mock = sinon.stub(global, 'clearTimeout');
    const controller = new PhishingController({ interval: 1337 });
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        controller.poll(1338);
        expect(mock.called).toBe(true);
        resolve();
      }, 100);
    });
  });

  it('should update lists', async () => {
    const controller = new PhishingController();
    controller.update({}, true);
    await controller.updatePhishingLists();
    controller.state.phishing.forEach((config) => {
      expect(config).toHaveProperty('allowlist');
      expect(config).toHaveProperty('blocklist');
      expect(config).toHaveProperty('fuzzylist');
      expect(config).toHaveProperty('tolerance');
      expect(config).toHaveProperty('name');
      expect(config).toHaveProperty('version');
    });
  });

  it('should not update infura rate if disabled', async () => {
    const controller = new PhishingController({ disabled: true });
    controller.update({}, true);
    await controller.updatePhishingLists();
    expect(controller.state.phishing).toBeUndefined();
  });

  it('should not update rates if disabled', async () => {
    nock('https://cdn.jsdelivr.net')
      .get('/gh/MetaMask/eth-phishing-detect@master/src/config.json')
      .replyWithError('Network error')
      .persist();
    const controller = new PhishingController({
      disabled: true,
      interval: 10,
    });

    expect(async () => await controller.updatePhishingLists()).not.toThrow();
  });

  it('should return negative result for safe domain from default config', () => {
    const controller = new PhishingController();
    expect(controller.test('metamask.io')).toMatchObject<EthPhishingDetectResult>({
      result: false,
      type: 'allowlist',
      name: 'MetaMask',
    });
  });

  it('should return negative result for safe unicode domain from default config', () => {
    const controller = new PhishingController();
    expect(controller.test('i❤.ws')).toMatchObject<EthPhishingDetectResult>({
      result: false,
      type: 'all',
    });
  });

  it('should return negative result for safe punycode domain from default config', () => {
    const controller = new PhishingController();
    expect(controller.test('xn--i-7iq.ws')).toMatchObject<EthPhishingDetectResult>({
      result: false,
      type: 'all',
    });
  });

  it('should return positive result for unsafe domain from default config', () => {
    const controller = new PhishingController();
    expect(controller.test('etnerscan.io')).toMatchObject<EthPhishingDetectResult>({
      result: true,
      type: 'blocklist',
      name: 'MetaMask',
    });
  });

  it('should return positive result for unsafe unicode domain from default config', () => {
    const controller = new PhishingController();
    expect(controller.test('myetherẉalletṭ.com')).toMatchObject<EthPhishingDetectResult>({
      result: true,
      type: 'blocklist',
      name: 'MetaMask',
    });
  });

  it('should return positive result for unsafe punycode domain from default config', () => {
    const controller = new PhishingController();
    expect(controller.test('xn--myetherallet-4k5fwn.com')).toMatchObject<EthPhishingDetectResult>({
      result: true,
      type: 'blocklist',
      name: `MetaMask`,
    });
  });

  it('should return negative result for safe domain from MetaMask config', async () => {
    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('metamask.io')).toMatchObject<EthPhishingDetectResult>({
      result: false,
      type: 'allowlist',
      name: 'MetaMask',
    });
  });

  it('should return negative result for safe unicode domain from MetaMask config', async () => {
    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('i❤.ws')).toMatchObject<EthPhishingDetectResult>({
      result: false,
      type: 'all',
    });
  });

  it('should return negative result for safe punycode domain from MetaMask config', async () => {
    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('xn--i-7iq.ws')).toMatchObject<EthPhishingDetectResult>({
      result: false,
      type: 'all',
    });
  });

  it('should return positive result for unsafe domain from MetaMask config', async () => {
    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('etnerscan.io')).toMatchObject<EthPhishingDetectResult>({
      result: true,
      type: 'blocklist',
      name: 'MetaMask',
    });
  });

  it('should return positive result for unsafe unicode domain from MetaMask config', async () => {
    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('myetherẉalletṭ.com')).toMatchObject<EthPhishingDetectResult>({
      result: true,
      type: 'blocklist',
      name: 'MetaMask',
    });
  });

  it('should return negative result for unsafe unicode domain if the MetaMask config returns 500', async () => {
    nock('https://cdn.jsdelivr.net', { allowUnmocked: true })
      .get('/gh/MetaMask/eth-phishing-detect@master/src/config.json')
      .reply(500)
      .persist();
    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('myetherẉalletṭ.com')).toMatchObject<EthPhishingDetectResult>({
      result: false,
      type: 'all',
    });
  });

  it('should return positive result for unsafe punycode domain from MetaMask config', async () => {
    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('xn--myetherallet-4k5fwn.com')).toMatchObject<EthPhishingDetectResult>({
      result: true,
      type: 'blocklist',
      name: 'MetaMask',
    });
  });

  it('should return positive result for unsafe unicode domain from the PhishFort hotlist (blocklist)', async () => {
    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('e4d600ab9141b7a9859511c77e63b9b3.com')).toMatchObject<EthPhishingDetectResult>({
      result: true,
      type: 'blocklist',
      name: 'PhishFort',
    });
  });

  it('should return negative result for unsafe unicode domain if the PhishFort hotlist (blocklist) returns 500', async () => {
    nock('https://cdn.jsdelivr.net', { allowUnmocked: true })
      .get('/gh/phishfort/phishfort-lists@master/blacklists/hotlist.json')
      .reply(500)
      .persist();
    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('e4d600ab9141b7a9859511c77e63b9b3.com')).toMatchObject<EthPhishingDetectResult>({
      result: false,
      type: 'all',
    });
  });

  it('should return negative result for safe fuzzylist domain from MetaMask config', async () => {
    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('opensea.io')).toMatchObject<EthPhishingDetectResult>({
      result: false,
      type: 'allowlist',
      name: 'MetaMask',
    });
  });

  it('should return positive result for domain very close to fuzzylist from MetaMask config', async () => {
    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('ohpensea.io')).toMatchObject<EthPhishingDetectResult>({
      result: true,
      type: 'fuzzy',
      name: 'MetaMask',
    });
  });

  it('should return negative result for domain very close to fuzzylist if MetaMask config returns 500', async () => {
    nock('https://cdn.jsdelivr.net', { allowUnmocked: true })
      .get('/gh/MetaMask/eth-phishing-detect@master/src/config.json')
      .reply(500)
      .persist();

    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('ohpensea.io')).toMatchObject<EthPhishingDetectResult>({
      result: false,
      type: 'all',
    });
  });

  it('should return negative result for domain not very close to fuzzylist from MetaMask config', async () => {
    const controller = new PhishingController();
    await controller.updatePhishingLists();
    expect(controller.test('this-is-the-official-website-of-opensea.io')).toMatchObject<EthPhishingDetectResult>({
      result: false,
      type: 'all',
    });
  });

  it('should bypass a given domain, and return a negative result', () => {
    const controller = new PhishingController();
    const unsafeDomain = 'electrum.mx';
    assert.equal(
      controller.test(unsafeDomain).result,
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(unsafeDomain);
    expect(controller.test(unsafeDomain)).toMatchObject<EthPhishingDetectResult>({
      result: false,
      type: 'all',
    });
  });

  it('should ignore second attempt to bypass a domain, and still return a negative result', () => {
    const controller = new PhishingController();
    const unsafeDomain = 'electrum.mx';
    assert.equal(
      controller.test(unsafeDomain).result,
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(unsafeDomain);
    controller.bypass(unsafeDomain);
    expect(controller.test(unsafeDomain)).toMatchObject<EthPhishingDetectResult>({
      result: false,
      type: 'all',
    });
  });

  it('should bypass a given unicode domain, and return a negative result', () => {
    const controller = new PhishingController();
    const unsafeDomain = 'myetherẉalletṭ.com';
    assert.equal(
      controller.test(unsafeDomain).result,
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(unsafeDomain);
    expect(controller.test(unsafeDomain)).toMatchObject<EthPhishingDetectResult>({
      result: false,
      type: 'all',
    });
  });

  it('should bypass a given punycode domain, and return a negative result', () => {
    const controller = new PhishingController();
    const unsafeDomain = 'xn--myetherallet-4k5fwn.com';
    assert.equal(
      controller.test(unsafeDomain).result,
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(unsafeDomain);
    expect(controller.test(unsafeDomain)).toMatchObject<EthPhishingDetectResult>({
      result: false,
      type: 'all',
    });
  });

  it('should not update phishing lists if fetch returns 304', async () => {
    nock('https://cdn.jsdelivr.net', { allowUnmocked: true })
      .get('/gh/MetaMask/eth-phishing-detect@master/src/config.json')
      .reply(304)
      .get('/gh/phishfort/phishfort-lists@master/blacklists/hotlist.json')
      .reply(304)
      .persist();
    const controller = new PhishingController();
    const oldState = controller.state.phishing;

    await controller.updatePhishingLists();

    expect(controller.state.phishing).toBe(oldState);
  });

  it('should not update phishing lists if fetch returns 500', async () => {
    nock('https://cdn.jsdelivr.net', { allowUnmocked: true })
      .get('/gh/MetaMask/eth-phishing-detect@master/src/config.json')
      .reply(500)
      .get('/gh/phishfort/phishfort-lists@master/blacklists/hotlist.json')
      .reply(500)
      .persist();

    const controller = new PhishingController();
    const oldState = controller.state.phishing;

    await controller.updatePhishingLists();

    expect(controller.state.phishing).toBe(oldState);
  });
});
