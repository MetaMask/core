import { strict as assert } from 'assert';
import { stub } from 'sinon';
import nock from 'nock';
import { PhishingController } from './PhishingController';

describe('PhishingController', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('should set default state', () => {
    const controller = new PhishingController();
    expect(controller.state.phishing).toHaveProperty('blacklist');
    expect(controller.state.phishing).toHaveProperty('fuzzylist');
    expect(controller.state.phishing).toHaveProperty('version');
    expect(controller.state.phishing).toHaveProperty('whitelist');
  });

  it('should set default config', () => {
    const controller = new PhishingController();
    expect(controller.config).toStrictEqual({ interval: 3_600_000 });
  });

  it('should poll and update rate in the right interval', async () => {
    await new Promise<void>((resolve) => {
      const mock = stub(PhishingController.prototype, 'updatePhishingLists');
      new PhishingController({ interval: 10 });
      expect(mock.called).toBe(true);
      expect(mock.calledTwice).toBe(false);
      setTimeout(() => {
        expect(mock.calledTwice).toBe(true);
        mock.restore();
        resolve();
      }, 15);
    });
  });

  it('should clear previous interval', async () => {
    const mock = stub(global, 'clearTimeout');
    const controller = new PhishingController({ interval: 1337 });
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        controller.poll(1338);
        expect(mock.called).toBe(true);
        mock.restore();
        resolve();
      }, 100);
    });
  });

  it('should update lists', async () => {
    const controller = new PhishingController();
    controller.update({}, true);
    await controller.updatePhishingLists();
    expect(controller.state.phishing).toHaveProperty('blacklist');
    expect(controller.state.phishing).toHaveProperty('fuzzylist');
    expect(controller.state.phishing).toHaveProperty('version');
    expect(controller.state.phishing).toHaveProperty('whitelist');
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

  it('should return negative result for safe domain', () => {
    const controller = new PhishingController();
    expect(controller.test('metamask.io')).toBe(false);
  });

  it('should return negative result for safe unicode domain', () => {
    const controller = new PhishingController();
    expect(controller.test('i❤.ws')).toBe(false);
  });

  it('should return negative result for safe punycode domain', () => {
    const controller = new PhishingController();
    expect(controller.test('xn--i-7iq.ws')).toBe(false);
  });

  it('should return positive result for unsafe domain', () => {
    const controller = new PhishingController();
    expect(controller.test('etnerscan.io')).toBe(true);
  });

  it('should return positive result for unsafe unicode domain', () => {
    const controller = new PhishingController();
    expect(controller.test('myetherẉalletṭ.com')).toBe(true);
  });

  it('should return positive result for unsafe punycode domain', () => {
    const controller = new PhishingController();
    expect(controller.test('xn--myetherallet-4k5fwn.com')).toBe(true);
  });

  it('should bypass a given domain', () => {
    const controller = new PhishingController();
    const unsafeDomain = 'electrum.mx';
    assert.equal(
      controller.test(unsafeDomain),
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(unsafeDomain);
    expect(controller.test(unsafeDomain)).toBe(false);
  });

  it('should ignore second attempt to bypass a domain', () => {
    const controller = new PhishingController();
    const unsafeDomain = 'electrum.mx';
    assert.equal(
      controller.test(unsafeDomain),
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(unsafeDomain);
    controller.bypass(unsafeDomain);
    expect(controller.test(unsafeDomain)).toBe(false);
  });

  it('should bypass a given unicode domain', () => {
    const controller = new PhishingController();
    const unsafeDomain = 'myetherẉalletṭ.com';
    assert.equal(
      controller.test(unsafeDomain),
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(unsafeDomain);
    expect(controller.test(unsafeDomain)).toBe(false);
  });

  it('should bypass a given punycode domain', () => {
    const controller = new PhishingController();
    const unsafeDomain = 'xn--myetherallet-4k5fwn.com';
    assert.equal(
      controller.test(unsafeDomain),
      true,
      'Example unsafe domain seems to be safe',
    );
    controller.bypass(unsafeDomain);
    expect(controller.test(unsafeDomain)).toBe(false);
  });

  it('should not update phishing lists if fetch returns 304', async () => {
    nock('https://cdn.jsdelivr.net')
      .get('/gh/MetaMask/eth-phishing-detect@master/src/config.json')
      .reply(304)
      .persist();
    const controller = new PhishingController();
    const oldState = controller.state.phishing;

    await controller.updatePhishingLists();

    expect(controller.state.phishing).toBe(oldState);
  });

  it('should not update phishing lists if fetch returns error', async () => {
    nock('https://cdn.jsdelivr.net')
      .get('/gh/MetaMask/eth-phishing-detect@master/src/config.json')
      .reply(500)
      .persist();

    const controller = new PhishingController();

    await expect(controller.updatePhishingLists()).rejects.toThrow(
      /Fetch failed with status '500'/u,
    );
  });
});
