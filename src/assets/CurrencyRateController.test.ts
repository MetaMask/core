import { stub } from 'sinon';
import type { Patch } from 'immer';
import nock from 'nock';
import { ControllerMessenger } from '../ControllerMessenger';
import {
  CurrencyRateController,
  CurrencyRateStateChange,
  GetCurrencyRateState,
} from './CurrencyRateController';

const name = 'CurrencyRateController';

type OtherStateChange = {
  type: `OtherController:stateChange`;
  payload: [{ stuff: string }, Patch[]];
};

type GetOtherState = {
  type: `OtherController:getState`;
  handler: () => { stuff: string };
};

function getRestrictedMessenger() {
  // The 'Other' types are included to demonstrate that this all works with a
  // controller messenger that includes types from other controllers.
  const controllerMessenger = new ControllerMessenger<
    GetCurrencyRateState | GetOtherState,
    CurrencyRateStateChange | OtherStateChange
  >();
  const messenger = controllerMessenger.getRestricted<
    'CurrencyRateController',
    never,
    never
  >({
    name,
  });
  return messenger;
}

describe('CurrencyRateController', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('should set default state', () => {
    const fetchExchangeRateStub = stub();
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      fetchExchangeRate: fetchExchangeRateStub,
      messenger,
    });
    expect(controller.state).toStrictEqual({
      conversionDate: 0,
      conversionRate: 0,
      currentCurrency: 'usd',
      nativeCurrency: 'ETH',
      pendingCurrentCurrency: null,
      pendingNativeCurrency: null,
      usdConversionRate: null,
    });

    controller.destroy();
  });

  it('should initialize with initial state', () => {
    const fetchExchangeRateStub = stub();
    const messenger = getRestrictedMessenger();
    const existingState = { currentCurrency: 'rep' };
    const controller = new CurrencyRateController({
      fetchExchangeRate: fetchExchangeRateStub,
      messenger,
      state: existingState,
    });
    expect(controller.state).toStrictEqual({
      conversionDate: 0,
      conversionRate: 0,
      currentCurrency: 'rep',
      nativeCurrency: 'ETH',
      pendingCurrentCurrency: null,
      pendingNativeCurrency: null,
      usdConversionRate: null,
    });

    controller.destroy();
  });

  it('should not poll before being started', async () => {
    const fetchExchangeRateStub = stub();
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 100,
      fetchExchangeRate: fetchExchangeRateStub,
      messenger,
    });

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(fetchExchangeRateStub.called).toBe(false);

    controller.destroy();
  });

  it('should poll and update rate in the right interval', async () => {
    const fetchExchangeRateStub = stub();
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 100,
      fetchExchangeRate: fetchExchangeRateStub,
      messenger,
    });
    await controller.start();

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 1));
    expect(fetchExchangeRateStub.called).toBe(true);
    expect(fetchExchangeRateStub.calledTwice).toBe(false);
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(fetchExchangeRateStub.calledTwice).toBe(true);

    controller.destroy();
  });

  it('should not poll after being stopped', async () => {
    const fetchExchangeRateStub = stub();
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 100,
      fetchExchangeRate: fetchExchangeRateStub,
      messenger,
    });
    await controller.start();
    controller.stop();

    // called once upon initial start
    expect(fetchExchangeRateStub.called).toBe(true);
    expect(fetchExchangeRateStub.calledTwice).toBe(false);

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(fetchExchangeRateStub.calledTwice).toBe(false);

    controller.destroy();
  });

  it('should poll correctly after being started, stopped, and started again', async () => {
    const fetchExchangeRateStub = stub();
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 100,
      fetchExchangeRate: fetchExchangeRateStub,
      messenger,
    });
    await controller.start();
    controller.stop();

    // called once upon initial start
    expect(fetchExchangeRateStub.called).toBe(true);
    expect(fetchExchangeRateStub.calledTwice).toBe(false);

    controller.start();

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 1));
    expect(fetchExchangeRateStub.calledTwice).toBe(true);
    expect(fetchExchangeRateStub.calledThrice).toBe(false);
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(fetchExchangeRateStub.calledThrice).toBe(true);
  });

  it('should update exchange rate', async () => {
    const fetchExchangeRateStub = stub().resolves({ conversionRate: 10 });
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 10,
      fetchExchangeRate: fetchExchangeRateStub,
      messenger,
    });
    expect(controller.state.conversionRate).toStrictEqual(0);
    await controller.updateExchangeRate();
    expect(controller.state.conversionRate).toStrictEqual(10);

    controller.destroy();
  });

  it('should update current currency', async () => {
    const fetchExchangeRateStub = stub().resolves({ conversionRate: 10 });
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 10,
      fetchExchangeRate: fetchExchangeRateStub,
      messenger,
    });
    expect(controller.state.conversionRate).toStrictEqual(0);
    await controller.setCurrentCurrency('CAD');
    expect(controller.state.conversionRate).toStrictEqual(10);

    controller.destroy();
  });

  it('should update native currency', async () => {
    const fetchExchangeRateStub = stub().resolves({ conversionRate: 10 });
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 10,
      fetchExchangeRate: fetchExchangeRateStub,
      messenger,
    });
    expect(controller.state.conversionRate).toStrictEqual(0);
    await controller.setNativeCurrency('xDAI');
    expect(controller.state.conversionRate).toStrictEqual(10);

    controller.destroy();
  });

  it('should add usd rate to state when includeUsdRate is configured true', async () => {
    const fetchExchangeRateStub = stub().resolves({});
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      includeUsdRate: true,
      fetchExchangeRate: fetchExchangeRateStub,
      messenger,
      state: { currentCurrency: 'xyz' },
    });

    await controller.updateExchangeRate();

    expect(
      fetchExchangeRateStub.alwaysCalledWithExactly('xyz', 'ETH', true),
    ).toBe(true);

    controller.destroy();
  });

  it('should default to fetching exchange rate from crypto-compare', async () => {
    const cryptoCompareHost = 'https://min-api.cryptocompare.com';
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=XYZ')
      .reply(200, { XYZ: 2000.42 })
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      messenger,
      state: { currentCurrency: 'xyz' },
    });

    await controller.updateExchangeRate();

    expect(controller.state.conversionRate).toStrictEqual(2000.42);

    controller.destroy();
  });
});
