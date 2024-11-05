import { ControllerMessenger } from '@metamask/base-controller';
import {
  ChainId,
  NetworkType,
  NetworksTicker,
} from '@metamask/controller-utils';
import type { NetworkControllerGetNetworkClientByIdAction } from '@metamask/network-controller';
import nock from 'nock';
import { useFakeTimers } from 'sinon';

import { advanceTime } from '../../../tests/helpers';
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
        default:
          throw new Error('Invalid networkClientId');
      }
    }),
  );
  const messenger = controllerMessenger.getRestricted<
    typeof name,
    NetworkControllerGetNetworkClientByIdAction['type']
  >({
    name,
    allowedActions: ['NetworkController:getNetworkClientById'],
    allowedEvents: [],
  });
  return messenger;
}

const getStubbedDate = () => {
  return new Date('2019-04-07T10:20:30Z').getTime();
};

describe('CurrencyRateController', () => {
  let clock: sinon.SinonFakeTimers;
  beforeEach(() => {
    clock = useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
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
          usdConversionRate: null,
        },
      },
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
          usdConversionRate: null,
        },
      },
    });

    controller.destroy();
  });

  it('should not poll before being started', async () => {
    const fetchMultiExchangeRateStub = jest.fn();
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 100,
      fetchMultiExchangeRate: fetchMultiExchangeRateStub,
      messenger,
    });

    await advanceTime({ clock, duration: 200 });

    expect(fetchMultiExchangeRateStub).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('should poll and update state in the right interval', async () => {
    const currentCurrency = 'cad';

    jest
      .spyOn(global.Date, 'now')
      .mockReturnValueOnce(10000)
      .mockReturnValueOnce(20000);
    const fetchMultiExchangeRateStub = jest
      .fn()
      .mockResolvedValueOnce({
        eth: { [currentCurrency]: 1, usd: 11 },
      })
      .mockResolvedValueOnce({
        eth: {
          [currentCurrency]: 2,
          usd: 22,
        },
      });
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 100,
      fetchMultiExchangeRate: fetchMultiExchangeRateStub,
      messenger,
      state: { currentCurrency },
    });

    controller.startPolling({ nativeCurrencies: ['ETH'] });
    await advanceTime({ clock, duration: 0 });
    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(1);
    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: 10,
        conversionRate: 1,
        usdConversionRate: 11,
      },
    });
    await advanceTime({ clock, duration: 99 });

    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(1);

    await advanceTime({ clock, duration: 1 });

    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(2);
    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: 20,
        conversionRate: 2,
        usdConversionRate: 22,
      },
    });

    controller.destroy();
  });

  it('should not poll after being stopped', async () => {
    const fetchMultiExchangeRateStub = jest.fn();
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 100,
      fetchMultiExchangeRate: fetchMultiExchangeRateStub,
      messenger,
    });

    controller.startPolling({ nativeCurrencies: ['ETH'] });

    await advanceTime({ clock, duration: 0 });

    controller.stopAllPolling();

    // called once upon initial start
    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(1);

    await advanceTime({ clock, duration: 150, stepSize: 50 });

    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('should poll correctly after being started, stopped, and started again', async () => {
    const fetchMultiExchangeRateStub = jest.fn();

    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 100,
      fetchMultiExchangeRate: fetchMultiExchangeRateStub,
      messenger,
    });
    controller.startPolling({ nativeCurrencies: ['ETH'] });
    await advanceTime({ clock, duration: 0 });

    controller.stopAllPolling();

    // called once upon initial start
    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(1);

    controller.startPolling({ nativeCurrencies: ['ETH'] });
    await advanceTime({ clock, duration: 0 });

    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(2);

    await advanceTime({ clock, duration: 100 });

    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(3);
  });

  it('should update exchange rate', async () => {
    const currentCurrency = 'cad';

    jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());
    const fetchMultiExchangeRateStub = jest
      .fn()
      .mockResolvedValue({ eth: { [currentCurrency]: 10, usd: 111 } });
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 10,
      fetchMultiExchangeRate: fetchMultiExchangeRateStub,
      messenger,
      state: { currentCurrency },
    });

    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: 0,
        conversionRate: 0,
        usdConversionRate: null,
      },
    });

    await controller.updateExchangeRate(['ETH']);

    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: getStubbedDate() / 1000,
        conversionRate: 10,
        usdConversionRate: 111,
      },
    });

    controller.destroy();
  });

  it('should use the exchange rate for ETH when native currency is testnet ETH', async () => {
    const currentCurrency = 'cad';

    jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());
    const fetchMultiExchangeRateStub = jest
      .fn()
      .mockImplementation((_, cryptocurrencies) => {
        const nativeCurrency = cryptocurrencies[0];
        if (nativeCurrency === 'ETH') {
          return {
            [nativeCurrency.toLowerCase()]: {
              [currentCurrency.toLowerCase()]: 10,
              usd: 110,
            },
          };
        }
        return {
          [nativeCurrency.toLowerCase()]: {
            [currentCurrency.toLowerCase()]: 0,
            usd: 100,
          },
        };
      });
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      fetchMultiExchangeRate: fetchMultiExchangeRateStub,
      messenger,
      state: { currentCurrency },
    });

    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: 0,
        conversionRate: 0,
        usdConversionRate: null,
      },
    });

    await controller.updateExchangeRate(['SepoliaETH']);

    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: 0,
        conversionRate: 0,
        usdConversionRate: null,
      },
      SepoliaETH: {
        conversionDate: getStubbedDate() / 1000,
        conversionRate: 10,
        usdConversionRate: 110,
      },
    });

    controller.destroy();
  });

  it('should update current currency then clear and refetch rates', async () => {
    const currentCurrency = 'cad';
    jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());
    const fetchMultiExchangeRateStub = jest.fn().mockResolvedValue({
      eth: { [currentCurrency]: 10, usd: 11 },
      btc: { [currentCurrency]: 10, usd: 11 },
    });
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      interval: 10,
      fetchMultiExchangeRate: fetchMultiExchangeRateStub,
      messenger,
      state: {
        currencyRates: {
          ETH: {
            conversionDate: 123,
            conversionRate: 123,
            usdConversionRate: 123,
          },
          BTC: {
            conversionDate: 100,
            conversionRate: 200,
            usdConversionRate: 300,
          },
        },
      },
    });

    await controller.setCurrentCurrency(currentCurrency);

    expect(controller.state).toStrictEqual({
      currentCurrency,
      currencyRates: {
        ETH: {
          conversionDate: 0,
          conversionRate: 0,
          usdConversionRate: null,
        },
      },
    });

    await advanceTime({ clock, duration: 0 });

    expect(controller.state).toStrictEqual({
      currentCurrency,
      currencyRates: {
        ETH: {
          conversionDate: getStubbedDate() / 1000,
          conversionRate: 10,
          usdConversionRate: 11,
        },
        BTC: {
          conversionDate: getStubbedDate() / 1000,
          conversionRate: 10,
          usdConversionRate: 11,
        },
      },
    });

    controller.destroy();
  });

  it('should add usd rate to state when includeUsdRate is configured true', async () => {
    const fetchMultiExchangeRateStub = jest.fn().mockResolvedValue({});
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      includeUsdRate: true,
      fetchMultiExchangeRate: fetchMultiExchangeRateStub,
      messenger,
      state: { currentCurrency: 'xyz' },
    });
    await controller.updateExchangeRate(['SepoliaETH']);

    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(1);
    expect(fetchMultiExchangeRateStub.mock.calls).toMatchObject([
      ['xyz', ['ETH'], true],
    ]);

    controller.destroy();
  });

  it('should default to fetching exchange rate from crypto-compare', async () => {
    jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());
    const cryptoCompareHost = 'https://min-api.cryptocompare.com';
    nock(cryptoCompareHost)
      .get('/data/pricemulti?fsyms=ETH&tsyms=xyz')
      .reply(200, { ETH: { XYZ: 2000.42 } })
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      messenger,
      state: { currentCurrency: 'xyz' },
    });

    await controller.updateExchangeRate(['ETH']);

    expect(controller.state).toStrictEqual({
      currentCurrency: 'xyz',
      currencyRates: {
        ETH: {
          conversionDate: getStubbedDate() / 1000,
          conversionRate: 2000.42,
          usdConversionRate: null,
        },
      },
    });

    controller.destroy();
  });

  it('should throw unexpected errors', async () => {
    const cryptoCompareHost = 'https://min-api.cryptocompare.com';
    nock(cryptoCompareHost)
      .get('/data/pricemulti?fsyms=ETH&tsyms=xyz')
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

    await expect(controller.updateExchangeRate(['ETH'])).rejects.toThrow(
      'this method has been deprecated',
    );

    controller.destroy();
  });

  it('should not update state on unexpected / transient errors', async () => {
    const cryptoCompareHost = 'https://min-api.cryptocompare.com';
    nock(cryptoCompareHost)
      .get('/data/pricemulti?fsyms=ETH&tsyms=xyz')
      .reply(500) // HTTP 500 transient error
      .persist();

    const state = {
      currentCurrency: 'xyz',
      currencyRates: {
        ETH: {
          conversionDate: 123,
          conversionRate: 123,
          usdConversionRate: 123,
        },
      },
    };
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({ messenger, state });

    // Error should still be thrown
    await expect(controller.updateExchangeRate(['ETH'])).rejects.toThrow(
      `Fetch failed with status '500' for request 'https://min-api.cryptocompare.com/data/pricemulti?fsyms=ETH&tsyms=xyz'`,
    );

    // But state should not be changed
    expect(controller.state).toStrictEqual(state);

    controller.destroy();
  });

  it('fetches exchange rates for multiple native currencies', async () => {
    jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());
    const cryptoCompareHost = 'https://min-api.cryptocompare.com';
    nock(cryptoCompareHost)
      .get('/data/pricemulti?fsyms=ETH,POL,BNB&tsyms=xyz')
      .reply(200, {
        BNB: { XYZ: 500.1 },
        ETH: { XYZ: 4000.42 },
        POL: { XYZ: 0.3 },
      })
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new CurrencyRateController({
      messenger,
      state: { currentCurrency: 'xyz' },
    });

    await controller.updateExchangeRate(['ETH', 'POL', 'BNB']);

    const conversionDate = getStubbedDate() / 1000;
    expect(controller.state).toStrictEqual({
      currentCurrency: 'xyz',
      currencyRates: {
        BNB: {
          conversionDate,
          conversionRate: 500.1,
          usdConversionRate: null,
        },
        ETH: {
          conversionDate,
          conversionRate: 4000.42,
          usdConversionRate: null,
        },
        POL: {
          conversionDate,
          conversionRate: 0.3,
          usdConversionRate: null,
        },
      },
    });

    controller.destroy();
  });
});
