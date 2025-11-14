import { deriveStateFromMetadata } from '@metamask/base-controller';
import {
  ChainId,
  NetworkType,
  NetworksTicker,
} from '@metamask/controller-utils';
import {
  MOCK_ANY_NAMESPACE,
  Messenger,
  type MessengerActions,
  type MessengerEvents,
  type MockAnyNamespace,
} from '@metamask/messenger';
import type { Hex } from '@metamask/utils';
import nock from 'nock';
import { useFakeTimers } from 'sinon';

import type { CurrencyRateMessenger } from './CurrencyRateController';
import { CurrencyRateController } from './CurrencyRateController';
import type { AbstractTokenPricesService } from './token-prices-service';
import { advanceTime } from '../../../tests/helpers';

const namespace = 'CurrencyRateController' as const;

type AllCurrencyRateControllerActions = MessengerActions<CurrencyRateMessenger>;

type AllCurrencyRateControllerEvents = MessengerEvents<CurrencyRateMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllCurrencyRateControllerActions,
  AllCurrencyRateControllerEvents
>;

/**
 * Builds a mock token prices service.
 *
 * @param overrides - The properties of the token prices service you want to
 * provide explicitly.
 * @returns The built mock token prices service.
 */
function buildMockTokenPricesService(
  overrides: Partial<AbstractTokenPricesService> = {},
): AbstractTokenPricesService {
  return {
    async fetchTokenPrices() {
      return {};
    },
    async fetchExchangeRates() {
      return {};
    },
    validateChainIdSupported(_chainId: unknown): _chainId is Hex {
      return true;
    },
    validateCurrencySupported(_currency: unknown): _currency is string {
      return true;
    },
    ...overrides,
  };
}

/**
 * Constructs a messenger for CurrencyRateController.
 *
 * @returns A controller messenger.
 */
function getCurrencyRateControllerMessenger(): CurrencyRateMessenger {
  const messenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  messenger.registerActionHandler(
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
  const currencyRateControllerMessenger = new Messenger<
    typeof namespace,
    AllCurrencyRateControllerActions,
    AllCurrencyRateControllerEvents,
    RootMessenger
  >({
    namespace,
  });
  messenger.delegate({
    messenger: currencyRateControllerMessenger,
    actions: ['NetworkController:getNetworkClientById'],
  });
  return currencyRateControllerMessenger;
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
    const messenger = getCurrencyRateControllerMessenger();
    const tokenPricesService = buildMockTokenPricesService();
    const controller = new CurrencyRateController({
      messenger,
      tokenPricesService,
    });

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
    const tokenPricesService = buildMockTokenPricesService();
    const messenger = getCurrencyRateControllerMessenger();
    const existingState = { currentCurrency: 'rep' };
    const controller = new CurrencyRateController({
      messenger,
      state: existingState,
      tokenPricesService,
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
    const tokenPricesService = buildMockTokenPricesService();
    const messenger = getCurrencyRateControllerMessenger();
    const controller = new CurrencyRateController({
      interval: 100,
      fetchMultiExchangeRate: fetchMultiExchangeRateStub,
      messenger,
      tokenPricesService,
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
    const tokenPricesService = buildMockTokenPricesService();

    const fetchExchangeRatesSpy = jest
      .spyOn(tokenPricesService, 'fetchExchangeRates')
      .mockResolvedValue({
        eth: {
          name: 'Ether',
          ticker: 'eth',
          value: 0.000240977533824818,
          currencyType: 'crypto',
        },
      });
    const messenger = getCurrencyRateControllerMessenger();
    const controller = new CurrencyRateController({
      interval: 100,
      fetchMultiExchangeRate: fetchMultiExchangeRateStub,
      messenger,
      state: { currentCurrency },
      tokenPricesService,
    });

    controller.startPolling({ nativeCurrencies: ['ETH'] });
    await advanceTime({ clock, duration: 0 });
    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(0);
    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);

    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: 10,
        conversionRate: 4149.76,
        usdConversionRate: null,
      },
    });
    await advanceTime({ clock, duration: 99 });

    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(0);
    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);

    await advanceTime({ clock, duration: 1 });

    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(0);
    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(2);
    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: 20,
        conversionRate: 4149.76,
        usdConversionRate: null,
      },
    });

    controller.destroy();
  });

  it('should not poll after being stopped', async () => {
    const fetchMultiExchangeRateStub = jest.fn();
    const tokenPricesService = buildMockTokenPricesService();

    const fetchExchangeRatesSpy = jest
      .spyOn(tokenPricesService, 'fetchExchangeRates')
      .mockResolvedValue({
        eth: {
          name: 'Ether',
          ticker: 'eth',
          value: 0.000240977533824818,
          currencyType: 'crypto',
        },
      });
    const messenger = getCurrencyRateControllerMessenger();
    const controller = new CurrencyRateController({
      interval: 100,
      fetchMultiExchangeRate: fetchMultiExchangeRateStub,
      messenger,
      tokenPricesService,
    });

    controller.startPolling({ nativeCurrencies: ['ETH'] });

    await advanceTime({ clock, duration: 0 });

    controller.stopAllPolling();

    // called once upon initial start
    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(0);
    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);

    await advanceTime({ clock, duration: 150, stepSize: 50 });

    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(0);
    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('should poll correctly after being started, stopped, and started again', async () => {
    const fetchMultiExchangeRateStub = jest.fn();

    const messenger = getCurrencyRateControllerMessenger();
    const tokenPricesService = buildMockTokenPricesService();

    const fetchExchangeRatesSpy = jest
      .spyOn(tokenPricesService, 'fetchExchangeRates')
      .mockResolvedValue({
        eth: {
          name: 'Ether',
          ticker: 'eth',
          value: 0.000240977533824818,
          currencyType: 'crypto',
        },
      });
    const controller = new CurrencyRateController({
      interval: 100,
      fetchMultiExchangeRate: fetchMultiExchangeRateStub,
      messenger,
      tokenPricesService,
    });
    controller.startPolling({ nativeCurrencies: ['ETH'] });
    await advanceTime({ clock, duration: 0 });

    controller.stopAllPolling();

    // called once upon initial start
    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(0);
    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);

    controller.startPolling({ nativeCurrencies: ['ETH'] });
    await advanceTime({ clock, duration: 0 });

    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(0);
    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(2);

    await advanceTime({ clock, duration: 100 });

    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(0);
    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(3);
  });

  it('should update exchange rate from price api', async () => {
    const currentCurrency = 'cad';

    jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());
    const fetchMultiExchangeRateStub = jest
      .fn()
      .mockResolvedValue({ eth: { [currentCurrency]: 10, usd: 111 } });
    const messenger = getCurrencyRateControllerMessenger();
    const tokenPricesService = buildMockTokenPricesService();
    const fetchExchangeRatesSpy = jest
      .spyOn(tokenPricesService, 'fetchExchangeRates')
      .mockResolvedValue({
        eth: {
          name: 'Ether',
          ticker: 'eth',
          value: 0.000240977533824818,
          currencyType: 'crypto',
          usd: 111,
        },
      });
    const controller = new CurrencyRateController({
      interval: 10,
      fetchMultiExchangeRate: fetchMultiExchangeRateStub,
      messenger,
      state: { currentCurrency },
      tokenPricesService,
    });

    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: 0,
        conversionRate: 0,
        usdConversionRate: null,
      },
    });

    await controller.updateExchangeRate(['ETH']);

    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);
    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(0);

    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: getStubbedDate() / 1000,
        conversionRate: 4149.76,
        usdConversionRate: 0.01,
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

    const messenger = getCurrencyRateControllerMessenger();
    const tokenPricesService = buildMockTokenPricesService();

    const fetchExchangeRatesSpy = jest
      .spyOn(tokenPricesService, 'fetchExchangeRates')
      .mockResolvedValue({
        eth: {
          name: 'Ether',
          ticker: 'eth',
          value: 0.000240977533824818,
          currencyType: 'crypto',
          usd: 0.001,
        },
      });
    const controller = new CurrencyRateController({
      fetchMultiExchangeRate: fetchMultiExchangeRateStub,
      messenger,
      state: { currentCurrency },
      tokenPricesService,
    });

    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: 0,
        conversionRate: 0,
        usdConversionRate: null,
      },
    });

    await controller.updateExchangeRate(['SepoliaETH']);

    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);
    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(0);

    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: 0,
        conversionRate: 0,
        usdConversionRate: null,
      },
      SepoliaETH: {
        conversionDate: getStubbedDate() / 1000,
        conversionRate: 4149.76,
        usdConversionRate: 1000,
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
    const messenger = getCurrencyRateControllerMessenger();
    const tokenPricesService = buildMockTokenPricesService();
    jest.spyOn(tokenPricesService, 'fetchExchangeRates').mockResolvedValue({
      eth: {
        name: 'Ether',
        ticker: 'eth',
        value: 0.000240977533824818,
        currencyType: 'crypto',
        usd: 0.0055,
      },
      btc: {
        name: 'Bitcoin',
        ticker: 'btc',
        value: 0.00010377048177666853,
        currencyType: 'crypto',
        usd: 0.0022,
      },
    });
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
      tokenPricesService,
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
          conversionRate: 4149.76,
          usdConversionRate: 181.82,
        },
        BTC: {
          conversionDate: getStubbedDate() / 1000,
          conversionRate: 9636.65,
          usdConversionRate: 454.55,
        },
      },
    });

    controller.destroy();
  });
  it('should add usd rate to state when includeUsdRate is configured true', async () => {
    const fetchMultiExchangeRateStub = jest.fn().mockResolvedValue({});
    const messenger = getCurrencyRateControllerMessenger();
    const tokenPricesService = buildMockTokenPricesService();
    const fetchExchangeRatesSpy = jest
      .spyOn(tokenPricesService, 'fetchExchangeRates')
      .mockResolvedValue({
        eth: {
          name: 'Ether',
          ticker: 'eth',
          value: 0.000240977533824818,
          currencyType: 'crypto',
          usd: 0.0055,
        },
      });
    const controller = new CurrencyRateController({
      includeUsdRate: true,
      fetchMultiExchangeRate: fetchMultiExchangeRateStub,
      messenger,
      state: { currentCurrency: 'xyz' },
      tokenPricesService,
    });
    await controller.updateExchangeRate(['SepoliaETH']);
    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);
    expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(0);
    expect(fetchExchangeRatesSpy.mock.calls).toMatchObject([
      [
        {
          baseCurrency: 'xyz',
          includeUsdRate: true,
          cryptocurrencies: ['ETH'],
        },
      ],
    ]);

    controller.destroy();
  });

  it('should default to fetching exchange rate from price api', async () => {
    jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());

    const messenger = getCurrencyRateControllerMessenger();
    const tokenPricesService = buildMockTokenPricesService();

    const fetchExchangeRatesSpy = jest
      .spyOn(tokenPricesService, 'fetchExchangeRates')
      .mockResolvedValue({
        eth: {
          name: 'Ether',
          ticker: 'eth',
          value: 1 / 2000.42,
          currencyType: 'crypto',
        },
      });
    const controller = new CurrencyRateController({
      messenger,
      state: { currentCurrency: 'xyz' },
      tokenPricesService,
    });

    await controller.updateExchangeRate(['ETH']);

    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);

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

  it('should throw unexpected errors when both price api and crypto-compare fail', async () => {
    const cryptoCompareHost = 'https://min-api.cryptocompare.com';
    nock(cryptoCompareHost)
      .get('/data/pricemulti?fsyms=ETH&tsyms=xyz')
      .reply(200, {
        Response: 'Error',
        Message: 'this method has been deprecated',
      })
      .persist();

    const messenger = getCurrencyRateControllerMessenger();
    const tokenPricesService = buildMockTokenPricesService();
    const fetchExchangeRatesSpy = jest
      .spyOn(tokenPricesService, 'fetchExchangeRates')
      .mockRejectedValue(new Error('Failed to fetch'));
    const controller = new CurrencyRateController({
      messenger,
      state: { currentCurrency: 'xyz' },
      tokenPricesService,
    });

    await expect(controller.updateExchangeRate(['ETH'])).rejects.toThrow(
      'this method has been deprecated',
    );

    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);

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
    const messenger = getCurrencyRateControllerMessenger();
    const tokenPricesService = buildMockTokenPricesService();
    jest
      .spyOn(tokenPricesService, 'fetchExchangeRates')
      .mockRejectedValue(new Error('Failed to fetch'));
    const controller = new CurrencyRateController({
      messenger,
      state,
      tokenPricesService,
    });

    // Error should still be thrown
    await expect(controller.updateExchangeRate(['ETH'])).rejects.toThrow(
      `Fetch failed with status '500' for request 'https://min-api.cryptocompare.com/data/pricemulti?fsyms=ETH&tsyms=xyz'`,
    );

    // But state should not be changed
    expect(controller.state).toStrictEqual(state);

    controller.destroy();
  });

  it('fetches exchange rates for multiple native currencies from price api', async () => {
    jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());

    const messenger = getCurrencyRateControllerMessenger();
    const tokenPricesService = buildMockTokenPricesService();

    const fetchExchangeRatesSpy = jest
      .spyOn(tokenPricesService, 'fetchExchangeRates')
      .mockResolvedValue({
        eth: {
          name: 'Ether',
          ticker: 'eth',
          value: 1 / 4000.42,
          currencyType: 'crypto',
        },
        pol: {
          name: 'Polkadot',
          ticker: 'pol',
          value: 1 / 0.3,
          currencyType: 'crypto',
        },
        bnb: {
          name: 'BNB',
          ticker: 'bnb',
          value: 1 / 500.1,
          currencyType: 'crypto',
        },
      });
    const controller = new CurrencyRateController({
      messenger,
      state: { currentCurrency: 'xyz' },
      tokenPricesService,
    });

    await controller.updateExchangeRate(['ETH', 'POL', 'BNB']);
    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);

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

  it('fallback to crypto compare when price api fails and fetches exchange rates for multiple native currencies', async () => {
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
    const messenger = getCurrencyRateControllerMessenger();
    const tokenPricesService = buildMockTokenPricesService();
    jest
      .spyOn(tokenPricesService, 'fetchExchangeRates')
      .mockRejectedValue(new Error('Failed to fetch'));
    const controller = new CurrencyRateController({
      messenger,
      state: { currentCurrency: 'xyz' },
      tokenPricesService,
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

  it('skips updating empty or undefined native currencies when calling crypto compare', async () => {
    jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());
    const cryptoCompareHost = 'https://min-api.cryptocompare.com';
    nock(cryptoCompareHost)
      .get('/data/pricemulti?fsyms=ETH&tsyms=xyz') // fsyms query only includes non-empty native currencies
      .reply(200, {
        ETH: { XYZ: 1000 },
      })
      .persist();

    const messenger = getCurrencyRateControllerMessenger();

    const tokenPricesService = buildMockTokenPricesService();

    jest
      .spyOn(tokenPricesService, 'fetchExchangeRates')
      .mockRejectedValue(new Error('Failed to fetch'));
    const controller = new CurrencyRateController({
      messenger,
      state: { currentCurrency: 'xyz' },
      tokenPricesService,
    });

    const nativeCurrencies = ['ETH', undefined, ''];

    await controller.updateExchangeRate(nativeCurrencies);

    const conversionDate = getStubbedDate() / 1000;
    expect(controller.state).toStrictEqual({
      currentCurrency: 'xyz',
      currencyRates: {
        ETH: {
          conversionDate,
          conversionRate: 1000,
          usdConversionRate: null,
        },
      },
    });

    controller.destroy();
  });

  it('skips updating empty or undefined native currencies when calling price api', async () => {
    jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());

    const messenger = getCurrencyRateControllerMessenger();

    const tokenPricesService = buildMockTokenPricesService();

    jest.spyOn(tokenPricesService, 'fetchExchangeRates').mockResolvedValue({
      eth: {
        name: 'Ether',
        ticker: 'eth',
        value: 1 / 1000,
        currencyType: 'crypto',
      },
    });
    const controller = new CurrencyRateController({
      messenger,
      state: { currentCurrency: 'xyz' },
      tokenPricesService,
    });

    const nativeCurrencies = ['ETH', undefined, ''];

    await controller.updateExchangeRate(nativeCurrencies);

    const conversionDate = getStubbedDate() / 1000;
    expect(controller.state).toStrictEqual({
      currentCurrency: 'xyz',
      currencyRates: {
        ETH: {
          conversionDate,
          conversionRate: 1000,
          usdConversionRate: null,
        },
      },
    });

    controller.destroy();
  });

  it('should set conversionDate to null when currency not found in price api response (lines 201-202)', async () => {
    jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());

    const messenger = getCurrencyRateControllerMessenger();

    const tokenPricesService = buildMockTokenPricesService();

    // Mock price API response where BNB is not included
    jest.spyOn(tokenPricesService, 'fetchExchangeRates').mockResolvedValue({
      eth: {
        name: 'Ether',
        ticker: 'eth',
        value: 1 / 1000,
        usd: 1 / 3000,
        currencyType: 'crypto',
      },
      // BNB is missing from the response
    });

    const controller = new CurrencyRateController({
      messenger,
      state: { currentCurrency: 'xyz' },
      tokenPricesService,
    });

    await controller.updateExchangeRate(['ETH', 'BNB']);

    const conversionDate = getStubbedDate() / 1000;
    expect(controller.state).toStrictEqual({
      currentCurrency: 'xyz',
      currencyRates: {
        ETH: {
          conversionDate,
          conversionRate: 1000,
          usdConversionRate: 3000,
        },
        BNB: {
          conversionDate: null, // Line 201: rate === undefined
          conversionRate: null, // Line 202
          usdConversionRate: null,
        },
      },
    });

    controller.destroy();
  });

  it('should set conversionDate to null when currency not found in crypto compare response (lines 231-232)', async () => {
    jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());
    const cryptoCompareHost = 'https://min-api.cryptocompare.com';
    nock(cryptoCompareHost)
      .get('/data/pricemulti?fsyms=ETH,BNB&tsyms=xyz')
      .reply(200, {
        ETH: { XYZ: 4000.42 },
        // BNB is missing from the response
      })
      .persist();

    const messenger = getCurrencyRateControllerMessenger();
    const tokenPricesService = buildMockTokenPricesService();

    // Make price API fail so it falls back to CryptoCompare
    jest
      .spyOn(tokenPricesService, 'fetchExchangeRates')
      .mockRejectedValue(new Error('Failed to fetch'));

    const controller = new CurrencyRateController({
      messenger,
      state: { currentCurrency: 'xyz' },
      tokenPricesService,
    });

    await controller.updateExchangeRate(['ETH', 'BNB']);

    const conversionDate = getStubbedDate() / 1000;
    expect(controller.state).toStrictEqual({
      currentCurrency: 'xyz',
      currencyRates: {
        ETH: {
          conversionDate,
          conversionRate: 4000.42,
          usdConversionRate: null,
        },
        BNB: {
          conversionDate: null, // Line 231: rate === undefined
          conversionRate: null, // Line 232
          usdConversionRate: null,
        },
      },
    });

    controller.destroy();
  });

  describe('useExternalServices', () => {
    it('should not fetch exchange rates when useExternalServices is false', async () => {
      const fetchMultiExchangeRateStub = jest.fn();
      const messenger = getCurrencyRateControllerMessenger();
      const tokenPricesService = buildMockTokenPricesService();
      const controller = new CurrencyRateController({
        useExternalServices: () => false,
        fetchMultiExchangeRate: fetchMultiExchangeRateStub,
        messenger,
        state: { currentCurrency: 'usd' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH']);

      expect(fetchMultiExchangeRateStub).not.toHaveBeenCalled();
      expect(controller.state.currencyRates).toStrictEqual({
        ETH: {
          conversionDate: 0,
          conversionRate: 0,
          usdConversionRate: null,
        },
      });

      controller.destroy();
    });

    it('should not poll when useExternalServices is false', async () => {
      const fetchMultiExchangeRateStub = jest.fn();
      const messenger = getCurrencyRateControllerMessenger();
      const tokenPricesService = buildMockTokenPricesService();
      const controller = new CurrencyRateController({
        useExternalServices: () => false,
        interval: 100,
        fetchMultiExchangeRate: fetchMultiExchangeRateStub,
        messenger,
        state: { currentCurrency: 'usd' },
        tokenPricesService,
      });

      controller.startPolling({ nativeCurrencies: ['ETH'] });
      await advanceTime({ clock, duration: 0 });

      expect(fetchMultiExchangeRateStub).not.toHaveBeenCalled();

      await advanceTime({ clock, duration: 100 });

      expect(fetchMultiExchangeRateStub).not.toHaveBeenCalled();

      controller.destroy();
    });

    it('should not fetch exchange rates when useExternalServices is false even with multiple currencies', async () => {
      const fetchMultiExchangeRateStub = jest.fn();
      const messenger = getCurrencyRateControllerMessenger();
      const tokenPricesService = buildMockTokenPricesService();
      const controller = new CurrencyRateController({
        useExternalServices: () => false,
        fetchMultiExchangeRate: fetchMultiExchangeRateStub,
        messenger,
        state: { currentCurrency: 'eur' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH', 'BTC', 'BNB']);

      expect(fetchMultiExchangeRateStub).not.toHaveBeenCalled();
      expect(controller.state.currencyRates).toStrictEqual({
        ETH: {
          conversionDate: 0,
          conversionRate: 0,
          usdConversionRate: null,
        },
      });

      controller.destroy();
    });

    it('should not fetch exchange rates when useExternalServices is false even with testnet currencies', async () => {
      const fetchMultiExchangeRateStub = jest.fn();
      const messenger = getCurrencyRateControllerMessenger();
      const tokenPricesService = buildMockTokenPricesService();
      const controller = new CurrencyRateController({
        useExternalServices: () => false,
        fetchMultiExchangeRate: fetchMultiExchangeRateStub,
        messenger,
        state: { currentCurrency: 'cad' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['SepoliaETH', 'GoerliETH']);

      expect(fetchMultiExchangeRateStub).not.toHaveBeenCalled();
      expect(controller.state.currencyRates).toStrictEqual({
        ETH: {
          conversionDate: 0,
          conversionRate: 0,
          usdConversionRate: null,
        },
      });

      controller.destroy();
    });

    it('should not fetch exchange rates when useExternalServices is false even with includeUsdRate true', async () => {
      const fetchMultiExchangeRateStub = jest.fn();
      const messenger = getCurrencyRateControllerMessenger();
      const tokenPricesService = buildMockTokenPricesService();
      const controller = new CurrencyRateController({
        useExternalServices: () => false,
        includeUsdRate: true,
        fetchMultiExchangeRate: fetchMultiExchangeRateStub,
        messenger,
        state: { currentCurrency: 'jpy' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH']);

      expect(fetchMultiExchangeRateStub).not.toHaveBeenCalled();
      expect(controller.state.currencyRates).toStrictEqual({
        ETH: {
          conversionDate: 0,
          conversionRate: 0,
          usdConversionRate: null,
        },
      });

      controller.destroy();
    });

    it('should fetch exchange rates when useExternalServices is true (default behavior)', async () => {
      jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());
      const fetchMultiExchangeRateStub = jest
        .fn()
        .mockResolvedValue({ eth: { usd: 2000, eur: 1800 } });
      const messenger = getCurrencyRateControllerMessenger();
      const tokenPricesService = buildMockTokenPricesService();
      const fetchExchangeRatesSpy = jest
        .spyOn(tokenPricesService, 'fetchExchangeRates')
        .mockResolvedValue({
          eth: {
            name: 'Ether',
            ticker: 'eth',
            value: 1 / 1800,
            currencyType: 'crypto',
            usd: 1 / 2000,
          },
        });
      const controller = new CurrencyRateController({
        useExternalServices: () => true,
        fetchMultiExchangeRate: fetchMultiExchangeRateStub,
        messenger,
        state: { currentCurrency: 'eur' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH']);

      expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(0);
      expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);
      expect(fetchExchangeRatesSpy).toHaveBeenCalledWith({
        baseCurrency: 'eur',
        includeUsdRate: false,
        cryptocurrencies: ['ETH'],
      });
      expect(controller.state.currencyRates).toStrictEqual({
        ETH: {
          conversionDate: getStubbedDate() / 1000,
          conversionRate: 1800,
          usdConversionRate: 2000,
        },
      });

      controller.destroy();
    });

    it('should default useExternalServices to true when not specified', async () => {
      jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());
      const fetchMultiExchangeRateStub = jest
        .fn()
        .mockResolvedValue({ eth: { usd: 2000, gbp: 1600 } });
      const messenger = getCurrencyRateControllerMessenger();
      const tokenPricesService = buildMockTokenPricesService();

      const fetchExchangeRatesSpy = jest
        .spyOn(tokenPricesService, 'fetchExchangeRates')
        .mockResolvedValue({
          eth: {
            name: 'Ether',
            ticker: 'eth',
            value: 1 / 1600,
            currencyType: 'crypto',
            usd: 1 / 2000,
          },
        });
      const controller = new CurrencyRateController({
        fetchMultiExchangeRate: fetchMultiExchangeRateStub,
        messenger,
        state: { currentCurrency: 'gbp' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH']);

      expect(fetchMultiExchangeRateStub).toHaveBeenCalledTimes(0);
      expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);
      expect(fetchExchangeRatesSpy).toHaveBeenCalledWith({
        baseCurrency: 'gbp',
        includeUsdRate: false,
        cryptocurrencies: ['ETH'],
      });
      expect(controller.state.currencyRates).toStrictEqual({
        ETH: {
          conversionDate: getStubbedDate() / 1000,
          conversionRate: 1600,
          usdConversionRate: 2000,
        },
      });

      controller.destroy();
    });

    it('should not throw errors when useExternalServices is false even if fetchMultiExchangeRate would fail', async () => {
      const fetchMultiExchangeRateStub = jest
        .fn()
        .mockRejectedValue(new Error('API Error'));
      const messenger = getCurrencyRateControllerMessenger();
      const tokenPricesService = buildMockTokenPricesService();
      const controller = new CurrencyRateController({
        useExternalServices: () => false,
        fetchMultiExchangeRate: fetchMultiExchangeRateStub,
        messenger,
        state: { currentCurrency: 'usd' },
        tokenPricesService,
      });

      // Should not throw an error
      expect(await controller.updateExchangeRate(['ETH'])).toBeUndefined();

      expect(fetchMultiExchangeRateStub).not.toHaveBeenCalled();

      controller.destroy();
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const tokenPricesService = buildMockTokenPricesService();
      const controller = new CurrencyRateController({
        messenger: getCurrencyRateControllerMessenger(),
        tokenPricesService,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "currencyRates": Object {
            "ETH": Object {
              "conversionDate": 0,
              "conversionRate": 0,
              "usdConversionRate": null,
            },
          },
          "currentCurrency": "usd",
        }
      `);
    });

    it('includes expected state in state logs', () => {
      const tokenPricesService = buildMockTokenPricesService();
      const controller = new CurrencyRateController({
        messenger: getCurrencyRateControllerMessenger(),
        tokenPricesService,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "currencyRates": Object {
            "ETH": Object {
              "conversionDate": 0,
              "conversionRate": 0,
              "usdConversionRate": null,
            },
          },
          "currentCurrency": "usd",
        }
      `);
    });

    it('persists expected state', () => {
      const tokenPricesService = buildMockTokenPricesService();
      const controller = new CurrencyRateController({
        messenger: getCurrencyRateControllerMessenger(),
        tokenPricesService,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "currencyRates": Object {
            "ETH": Object {
              "conversionDate": 0,
              "conversionRate": 0,
              "usdConversionRate": null,
            },
          },
          "currentCurrency": "usd",
        }
      `);
    });

    it('exposes expected state to UI', () => {
      const controller = new CurrencyRateController({
        messenger: getCurrencyRateControllerMessenger(),
        tokenPricesService: buildMockTokenPricesService(),
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "currencyRates": Object {
            "ETH": Object {
              "conversionDate": 0,
              "conversionRate": 0,
              "usdConversionRate": null,
            },
          },
          "currentCurrency": "usd",
        }
      `);
    });
  });
});
