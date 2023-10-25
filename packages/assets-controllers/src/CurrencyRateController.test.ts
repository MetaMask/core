import { ControllerMessenger } from '@metamask/base-controller';
import {
  ChainId,
  NetworkType,
  NetworksTicker,
  toHex,
} from '@metamask/controller-utils';
import type { NetworkControllerGetNetworkClientByIdAction } from '@metamask/network-controller';
import nock from 'nock';

import type {
  CurrencyRateStateChange,
  GetCurrencyRateState,
} from './CurrencyRateController';
import { CurrencyRateController } from './CurrencyRateController';

const name = 'CurrencyRateController' as const;

/**
 * Constructs a restricted controller messenger.
 *
 * @returns A restricted controller messenger.
 */
function getRestrictedMessenger() {
  const controllerMessenger = new ControllerMessenger<
    GetCurrencyRateState | NetworkControllerGetNetworkClientByIdAction,
    CurrencyRateStateChange
  >();
  controllerMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    jest.fn().mockImplementation((networkClientId) => {
      switch (networkClientId) {
        case 'mainnet':
          return {
            configuration: {
              type: NetworkType.mainnet,
              chainId: ChainId.mainnet,
              ticker: NetworksTicker.mainnet,
            },
          };
        case 'sepolia':
          return {
            configuration: {
              type: NetworkType.sepolia,
              chainId: ChainId.sepolia,
              ticker: NetworksTicker.sepolia,
            },
          };
        case 'binance-network-client-id':
          return {
            configuration: {
              type: NetworkType.rpc,
              chainId: toHex(56),
              ticker: 'BTC',
            },
          };
        default:
          throw new Error('Invalid networkClientId');
      }
    }),
  );
  const messenger = controllerMessenger.getRestricted<
    typeof name,
    NetworkControllerGetNetworkClientByIdAction['type'],
    never
  >({
    name,
    allowedActions: ['NetworkController:getNetworkClientById'],
  });
  return messenger;
}

/**
 * Resolve all pending promises.
 * This method is used for async tests that use fake timers.
 * See https://stackoverflow.com/a/58716087 and https://jestjs.io/docs/timer-mocks.
 */
function flushPromises(): Promise<unknown> {
  return new Promise(jest.requireActual('timers').setImmediate);
}

describe('CurrencyRateController', () => {
  beforeEach(() => {
    jest.useFakeTimers('legacy');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should set default state', () => {
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({ messenger });

    expect(controller.state).toStrictEqual({
      currentCurrency: 'usd',
      currencyRates: {
        ETH: {
          conversionDate: 0,
          conversionRate: 0,
        },
      },
      usdConversionRate: null,
    });

    controller.destroy();
  });

  it('should initialize with initial state', () => {
    const messenger = getRestrictedMessenger();
    const existingState = { currentCurrency: 'rep' };
    const controller = new CurrencyRateController({
      messenger,
      state: existingState,
    });

    expect(controller.state).toStrictEqual({
      currentCurrency: 'rep',
      currencyRates: {
        ETH: {
          conversionDate: 0,
          conversionRate: 0,
        },
      },
      usdConversionRate: null,
    });

    controller.destroy();
  });

  it('should not poll before being started', async () => {
    const fetchExchangeRateStub = jest.fn();
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 100,
      fetchExchangeRate: fetchExchangeRateStub,
      messenger,
    });

    jest.advanceTimersByTime(200);
    await flushPromises();

    expect(fetchExchangeRateStub).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('should poll and update rate in the right interval', async () => {
    const fetchExchangeRateStub = jest.fn();
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 100,
      fetchExchangeRate: fetchExchangeRateStub,
      messenger,
    });

    controller.startPollingByNetworkClientId('sepolia');
    await Promise.all([jest.advanceTimersByTime(0), flushPromises()]);
    expect(fetchExchangeRateStub).toHaveBeenCalledTimes(1);
    await Promise.all([jest.advanceTimersByTime(99), flushPromises()]);
    expect(fetchExchangeRateStub).toHaveBeenCalledTimes(1);
    await Promise.all([jest.advanceTimersByTime(1), flushPromises()]);
    expect(fetchExchangeRateStub).toHaveBeenCalledTimes(2);

    controller.destroy();
  });

  it('should not poll after being stopped', async () => {
    const fetchExchangeRateStub = jest.fn();
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 100,
      fetchExchangeRate: fetchExchangeRateStub,
      messenger,
    });

    controller.startPollingByNetworkClientId('sepolia');
    jest.advanceTimersByTime(0);
    await flushPromises();
    controller.stopAllPolling();

    // called once upon initial start
    expect(fetchExchangeRateStub).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(150);
    await flushPromises();

    expect(fetchExchangeRateStub).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('should poll correctly after being started, stopped, and started again', async () => {
    const fetchExchangeRateStub = jest.fn();

    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 100,
      fetchExchangeRate: fetchExchangeRateStub,
      messenger,
    });
    console.log('@@@@');
    controller.startPollingByNetworkClientId('sepolia');
    jest.advanceTimersByTime(0);
    await flushPromises();
    controller.stopAllPolling();

    // called once upon initial start
    expect(fetchExchangeRateStub).toHaveBeenCalledTimes(1);

    console.log('@@@@ 1');
    controller.startPollingByNetworkClientId('sepolia');

    jest.advanceTimersByTime(0);
    await flushPromises();
    expect(fetchExchangeRateStub).toHaveBeenCalledTimes(2);

    console.log('@@@@ 2');
    jest.advanceTimersByTime(100);
    await flushPromises();

    console.log('@@@@ back');
    expect(fetchExchangeRateStub).toHaveBeenCalledTimes(3);
  });

  it('should update exchange rate', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2020-01-01'));
    const fetchExchangeRateStub = jest
      .fn()
      .mockResolvedValue({ conversionRate: 10 });
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 10,
      fetchExchangeRate: fetchExchangeRateStub,
      messenger,
    });

    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: 0,
        conversionRate: 0,
      },
    });

    await controller.updateExchangeRate('ETH');

    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: new Date('2020-01-01').getTime() / 1000,
        conversionRate: 10,
      },
    });

    controller.destroy();
  });

  it('should update exchange rate to ETH conversion rate when native currency is testnet ETH', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2020-01-01'));
    const fetchExchangeRateStub = jest
      .fn()
      .mockImplementation((_, nativeCurrency) => {
        if (nativeCurrency === 'ETH') {
          return {
            conversionRate: 10,
          };
        } else if (nativeCurrency === 'DAI') {
          return {
            conversionRate: 1,
          };
        }
        return {
          conversionRate: 0,
        };
      });
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      fetchExchangeRate: fetchExchangeRateStub,
      messenger,
    });

    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: 0,
        conversionRate: 0,
      },
    });

    await controller.updateExchangeRate('SepoliaETH');

    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: 0,
        conversionRate: 0,
      },
      SepoliaETH: {
        conversionDate: new Date('2020-01-01').getTime() / 1000,
        conversionRate: 10,
      },
    });

    controller.destroy();
  });

  it('should update current currency', async () => {
    const fetchExchangeRateStub = jest
      .fn()
      .mockResolvedValue({ conversionRate: 10 });
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 10,
      fetchExchangeRate: fetchExchangeRateStub,
      messenger,
    });

    expect(controller.state.currentCurrency).toBe('usd');
    // check currencyRate state here

    await controller.setCurrentCurrency('CAD');

    expect(controller.state.currentCurrency).toBe('CAD');

    controller.destroy();
  });

  it('should add usd rate to state when includeUsdRate is configured true', async () => {
    const fetchExchangeRateStub = jest.fn().mockResolvedValue({});
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      includeUsdRate: true,
      fetchExchangeRate: fetchExchangeRateStub,
      messenger,
      state: { currentCurrency: 'xyz' },
    });
    await controller.updateExchangeRate('SepoliaETH');

    expect(fetchExchangeRateStub).toHaveBeenCalledTimes(1);
    expect(fetchExchangeRateStub.mock.calls).toMatchObject([
      ['xyz', 'ETH', true],
    ]);

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

    await controller.updateExchangeRate('ETH');

    expect(controller.state.currencyRates.ETH.conversionRate).toBe(2000.42);

    controller.destroy();
  });

  it('should throw unexpected errors', async () => {
    const cryptoCompareHost = 'https://min-api.cryptocompare.com';
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=XYZ')
      .reply(200, {
        Response: 'Error',
        Message: 'this method has been deprecated',
      })
      .persist();

    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      messenger,
      state: { currentCurrency: 'xyz' },
    });

    console.log('should throw @@');
    await expect(controller.updateExchangeRate('ETH')).rejects.toThrow(
      'this method has been deprecated',
    );

    controller.destroy();
  });

  it('should catch expected errors', async () => {
    const cryptoCompareHost = 'https://min-api.cryptocompare.com';
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=XYZ')
      .reply(200, {
        Response: 'Error',
        Message: 'market does not exist for this coin pair',
      })
      .persist();

    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      messenger,
      state: { currentCurrency: 'xyz' },
    });

    console.log('should catch expected');
    await controller.updateExchangeRate('ETH');

    console.log('should catch expected?');
    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: null,
        conversionRate: null,
      },
    });

    controller.destroy();
  });
});
