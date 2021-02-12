import 'isomorphic-fetch';
import { stub } from 'sinon';
import * as nock from 'nock';
import CurrencyRateController from '../src/assets/CurrencyRateController';

describe('CurrencyRateController', () => {
  beforeEach(() => {
    nock(/.+/u)
      .get(/XYZ,USD/u)
      .reply(200, { XYZ: 123, USD: 456 })
      .get(/DEF,USD/u)
      .reply(200, { DEF: 123 })
      .get(/.+/u)
      .reply(200, { USD: 1337 })
      .persist();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should set default state', () => {
    const controller = new CurrencyRateController();
    expect(controller.state).toEqual({
      conversionDate: 0,
      conversionRate: 0,
      currentCurrency: 'usd',
      nativeCurrency: 'ETH',
      usdConversionRate: 0,
    });
  });

  it('should initialize with the default config', () => {
    const controller = new CurrencyRateController();
    expect(controller.config).toEqual({
      currentCurrency: 'usd',
      disabled: false,
      interval: 180000,
      nativeCurrency: 'ETH',
      includeUSDRate: false,
    });
  });

  it('should initialize with the currency in state', () => {
    const existingState = { currentCurrency: 'rep' };
    const controller = new CurrencyRateController({}, existingState);
    expect(controller.config).toEqual({
      currentCurrency: 'rep',
      disabled: false,
      interval: 180000,
      nativeCurrency: 'ETH',
      includeUSDRate: false,
    });
  });

  it('should poll and update rate in the right interval', () => {
    return new Promise((resolve) => {
      const controller = new CurrencyRateController({ interval: 100 });
      const mock = stub(controller, 'fetchExchangeRate').resolves({});
      setTimeout(() => {
        expect(mock.called).toBe(true);
        expect(mock.calledTwice).toBe(false);
      }, 1);
      setTimeout(() => {
        expect(mock.calledTwice).toBe(true);
        mock.restore();
        resolve();
      }, 150);
    });
  });

  it('should not update rates if disabled', async () => {
    const controller = new CurrencyRateController({
      interval: 10,
    });
    controller.fetchExchangeRate = stub().resolves({});
    controller.disabled = true;
    await controller.updateExchangeRate();
    expect((controller.fetchExchangeRate as any).called).toBe(false);
  });

  it('should clear previous interval', () => {
    const mock = stub(global, 'clearTimeout');
    const controller = new CurrencyRateController({ interval: 1337 });
    return new Promise((resolve) => {
      setTimeout(() => {
        controller.poll(1338);
        expect(mock.called).toBe(true);
        mock.restore();
        resolve();
      }, 100);
    });
  });

  it('should update currency', async () => {
    const controller = new CurrencyRateController({ interval: 10 });
    expect(controller.state.conversionRate).toEqual(0);
    await controller.updateExchangeRate();
    expect(controller.state.conversionRate).toBeGreaterThan(0);
  });

  it('should add usd rate to state when includeUSDRate is configured true', async () => {
    const controller = new CurrencyRateController({ includeUSDRate: true, currentCurrency: 'xyz' });
    expect(controller.state.usdConversionRate).toEqual(0);
    await controller.updateExchangeRate();
    expect(controller.state.usdConversionRate).toEqual(456);
  });

  it('should add usd rate to state fetches when configured', async () => {
    const controller = new CurrencyRateController({ includeUSDRate: true });
    const result = await controller.fetchExchangeRate('xyz', 'FOO', true);
    expect(result.usdConversionRate).toEqual(456);
    expect(result.conversionRate).toEqual(123);
  });

  it('should throw correctly when configured to return usd but receives an invalid response for currentCurrency rate', async () => {
    const controller = new CurrencyRateController({ includeUSDRate: true });
    await expect(controller.fetchExchangeRate('abc', 'FOO', true)).rejects.toThrow(
      'Invalid response for ABC: undefined',
    );
  });

  it('should throw correctly when configured to return usd but receives an invalid response for usdConversionRate', async () => {
    const controller = new CurrencyRateController({ includeUSDRate: true });
    await expect(controller.fetchExchangeRate('def', 'FOO', true)).rejects.toThrow(
      'Invalid response for usdConversionRate: undefined',
    );
  });

  describe('#fetchExchangeRate', () => {
    it('should handle a valid symbol in the API response', async () => {
      const controller = new CurrencyRateController({ nativeCurrency: 'usd' });
      const response = await controller.fetchExchangeRate('usd');
      expect(response.conversionRate).toEqual(1337);
    });

    it('should handle a missing symbol in the API response', async () => {
      const controller = new CurrencyRateController({ nativeCurrency: 'usd' });
      await expect(controller.fetchExchangeRate('foo')).rejects.toThrow('Invalid response for FOO: undefined');
    });
  });
});
