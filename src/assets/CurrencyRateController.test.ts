import 'isomorphic-fetch';
import { stub } from 'sinon';
import CurrencyRateController from './CurrencyRateController';

describe('CurrencyRateController', () => {
  it('should set default state', () => {
    const fetchExchangeRateStub = stub();
    const controller = new CurrencyRateController({}, {}, fetchExchangeRateStub);
    expect(controller.state).toStrictEqual({
      conversionDate: 0,
      conversionRate: 0,
      currentCurrency: 'usd',
      nativeCurrency: 'ETH',
      usdConversionRate: 0,
    });

    controller.disabled = true;
  });

  it('should initialize with the default config', () => {
    const fetchExchangeRateStub = stub();
    const controller = new CurrencyRateController({}, {}, fetchExchangeRateStub);
    expect(controller.config).toStrictEqual({
      currentCurrency: 'usd',
      disabled: false,
      interval: 180000,
      nativeCurrency: 'ETH',
      includeUSDRate: false,
    });

    controller.disabled = true;
  });

  it('should initialize with the currency in state', () => {
    const fetchExchangeRateStub = stub();
    const existingState = { currentCurrency: 'rep' };
    const controller = new CurrencyRateController({}, existingState, fetchExchangeRateStub);
    expect(controller.config).toStrictEqual({
      currentCurrency: 'rep',
      disabled: false,
      interval: 180000,
      nativeCurrency: 'ETH',
      includeUSDRate: false,
    });

    controller.disabled = true;
  });

  it('should throw when currentCurrency property is accessed', () => {
    const fetchExchangeRateStub = stub();
    const controller = new CurrencyRateController({}, {}, fetchExchangeRateStub);
    expect(() => console.log(controller.currentCurrency)).toThrow('Property only used for setting');
  });

  it('should throw when nativeCurrency property is accessed', () => {
    const fetchExchangeRateStub = stub();
    const controller = new CurrencyRateController({}, {}, fetchExchangeRateStub);
    expect(() => console.log(controller.nativeCurrency)).toThrow('Property only used for setting');
  });

  it('should poll and update rate in the right interval', async () => {
    const fetchExchangeRateStub = stub();
    const controller = new CurrencyRateController({ interval: 100 }, {}, fetchExchangeRateStub);

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 1));
    expect(fetchExchangeRateStub.called).toBe(true);
    expect(fetchExchangeRateStub.calledTwice).toBe(false);
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(fetchExchangeRateStub.calledTwice).toBe(true);

    controller.disabled = true;
  });

  it('should not update rates if disabled', async () => {
    const fetchExchangeRateStub = stub().resolves({});
    const controller = new CurrencyRateController({ interval: 10 }, {}, fetchExchangeRateStub);
    controller.disabled = true;

    await controller.updateExchangeRate();
    expect(fetchExchangeRateStub.called).toBe(false);
  });

  it('should clear previous interval', async () => {
    const fetchExchangeRateStub = stub();
    const mock = stub(global, 'clearTimeout');
    const controller = new CurrencyRateController({ interval: 1337 }, {}, fetchExchangeRateStub);
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        controller.poll(1338);
        expect(mock.called).toBe(true);
        mock.restore();

        controller.disabled = true;
        resolve();
      }, 100);
    });
  });

  it('should update currency', async () => {
    const fetchExchangeRateStub = stub().resolves({ conversionRate: 10 });
    const controller = new CurrencyRateController({ interval: 10 }, {}, fetchExchangeRateStub);
    expect(controller.state.conversionRate).toStrictEqual(0);
    await controller.updateExchangeRate();
    expect(controller.state.conversionRate).toStrictEqual(10);

    controller.disabled = true;
  });

  it('should add usd rate to state when includeUSDRate is configured true', async () => {
    const fetchExchangeRateStub = stub().resolves({});
    const controller = new CurrencyRateController(
      { includeUSDRate: true, currentCurrency: 'xyz' },
      {},
      fetchExchangeRateStub,
    );

    await controller.updateExchangeRate();

    expect(fetchExchangeRateStub.alwaysCalledWithExactly('xyz', 'ETH', true)).toBe(true);
  });
});
