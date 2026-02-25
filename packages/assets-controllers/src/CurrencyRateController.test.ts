import { deriveStateFromMetadata } from '@metamask/base-controller';
import {
  ChainId,
  NetworkType,
  NetworksTicker,
} from '@metamask/controller-utils';
import { MOCK_ANY_NAMESPACE, Messenger } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import type { NetworkConfiguration } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import type { CurrencyRateMessenger } from './CurrencyRateController';
import { CurrencyRateController } from './CurrencyRateController';
import type { AbstractTokenPricesService } from './token-prices-service';
import { jestAdvanceTime } from '../../../tests/helpers';

const namespace = 'CurrencyRateController';

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
      return [];
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

/**
 * Constructs a messenger for CurrencyRateController with NetworkController:getState action.
 *
 * @param options - Options object
 * @param options.networkConfigurationsByChainId - Network configurations by chain ID
 * @returns A controller messenger.
 */
function getCurrencyRateControllerMessengerWithNetworkState({
  networkConfigurationsByChainId,
}: {
  networkConfigurationsByChainId: Record<string, NetworkConfiguration>;
}): CurrencyRateMessenger {
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
  messenger.registerActionHandler(
    'NetworkController:getState',
    jest.fn().mockReturnValue({ networkConfigurationsByChainId }),
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
    actions: [
      'NetworkController:getNetworkClientById',
      'NetworkController:getState',
    ],
  });
  return currencyRateControllerMessenger;
}

const getStubbedDate = () => {
  return new Date('2019-04-07T10:20:30Z').getTime();
};

describe('CurrencyRateController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
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
    const tokenPricesService = buildMockTokenPricesService();
    const fetchExchangeRatesSpy = jest.spyOn(
      tokenPricesService,
      'fetchExchangeRates',
    );
    const messenger = getCurrencyRateControllerMessenger();
    const controller = new CurrencyRateController({
      interval: 100,
      messenger,
      tokenPricesService,
    });

    await jestAdvanceTime({ duration: 200 });

    expect(fetchExchangeRatesSpy).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('should poll and update state in the right interval', async () => {
    const currentCurrency = 'cad';

    jest
      .spyOn(global.Date, 'now')
      .mockReturnValueOnce(10000)
      .mockReturnValueOnce(20000);
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
      messenger,
      state: { currentCurrency },
      tokenPricesService,
    });

    controller.startPolling({ nativeCurrencies: ['ETH'] });
    await jestAdvanceTime({ duration: 0 });
    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);

    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: 10,
        conversionRate: 4149.764437074,
        usdConversionRate: null,
      },
    });
    await jestAdvanceTime({ duration: 99 });

    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);

    await jestAdvanceTime({ duration: 1 });

    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(2);
    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: 20,
        conversionRate: 4149.764437074,
        usdConversionRate: null,
      },
    });

    controller.destroy();
  });

  it('should not poll after being stopped', async () => {
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
      messenger,
      tokenPricesService,
    });

    controller.startPolling({ nativeCurrencies: ['ETH'] });

    await jestAdvanceTime({ duration: 0 });

    controller.stopAllPolling();

    // called once upon initial start
    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);

    await jestAdvanceTime({ duration: 150, stepSize: 50 });

    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('should poll correctly after being started, stopped, and started again', async () => {
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
      messenger,
      tokenPricesService,
    });
    controller.startPolling({ nativeCurrencies: ['ETH'] });
    await jestAdvanceTime({ duration: 0 });

    controller.stopAllPolling();

    // called once upon initial start
    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);

    controller.startPolling({ nativeCurrencies: ['ETH'] });
    await jestAdvanceTime({ duration: 0 });

    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(2);

    await jestAdvanceTime({ duration: 100 });

    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(3);
  });

  it('should update exchange rate from price api', async () => {
    const currentCurrency = 'cad';

    jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());
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
    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: getStubbedDate() / 1000,
        conversionRate: 4149.764437074,
        usdConversionRate: 0.009009009,
      },
    });

    controller.destroy();
  });

  it('should use the exchange rate for ETH when native currency is testnet ETH', async () => {
    const currentCurrency = 'cad';

    jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());

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
    expect(controller.state.currencyRates).toStrictEqual({
      ETH: {
        conversionDate: 0,
        conversionRate: 0,
        usdConversionRate: null,
      },
      SepoliaETH: {
        conversionDate: getStubbedDate() / 1000,
        conversionRate: 4149.764437074,
        usdConversionRate: 1000,
      },
    });

    controller.destroy();
  });

  it('should update current currency then clear and refetch rates', async () => {
    const currentCurrency = 'cad';
    jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());
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

    await jestAdvanceTime({ duration: 0 });

    expect(controller.state).toStrictEqual({
      currentCurrency,
      currencyRates: {
        ETH: {
          conversionDate: getStubbedDate() / 1000,
          conversionRate: 4149.764437074,
          usdConversionRate: 181.818181818,
        },
        BTC: {
          conversionDate: getStubbedDate() / 1000,
          conversionRate: 9636.6518,
          usdConversionRate: 454.545454545,
        },
      },
    });

    controller.destroy();
  });
  it('should add usd rate to state when includeUsdRate is configured true', async () => {
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
      messenger,
      state: { currentCurrency: 'xyz' },
      tokenPricesService,
    });
    await controller.updateExchangeRate(['SepoliaETH']);
    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);
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

  it('should return null state when price api fails', async () => {
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

    await controller.updateExchangeRate(['ETH']);

    expect(fetchExchangeRatesSpy).toHaveBeenCalledTimes(1);
    expect(controller.state).toStrictEqual({
      currentCurrency: 'xyz',
      currencyRates: {
        ETH: {
          conversionDate: null,
          conversionRate: null,
          usdConversionRate: null,
        },
      },
    });

    controller.destroy();
  });

  it('should update state with null values when price api fails', async () => {
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

    await controller.updateExchangeRate(['ETH']);

    // State should be updated with null values
    expect(controller.state).toStrictEqual({
      currentCurrency: 'xyz',
      currencyRates: {
        ETH: {
          conversionDate: null,
          conversionRate: null,
          usdConversionRate: null,
        },
      },
    });

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

  it('skips updating empty or undefined native currencies', async () => {
    jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());

    const messenger = getCurrencyRateControllerMessenger();

    const tokenPricesService = buildMockTokenPricesService();

    jest.spyOn(tokenPricesService, 'fetchExchangeRates').mockResolvedValue({
      eth: {
        name: 'Ethereum',
        ticker: 'eth',
        value: 0,
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

    // With new fallback logic, ETH with value: 0 triggers fallback attempt
    // When fallback also fails (no NetworkController:getState handler), null state is returned
    expect(controller.state).toStrictEqual({
      currentCurrency: 'xyz',
      currencyRates: {
        ETH: {
          conversionDate: null,
          conversionRate: null,
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

  describe('useExternalServices', () => {
    it('should not fetch exchange rates when useExternalServices is false', async () => {
      const messenger = getCurrencyRateControllerMessenger();
      const tokenPricesService = buildMockTokenPricesService();
      const controller = new CurrencyRateController({
        useExternalServices: () => false,
        messenger,
        state: { currentCurrency: 'usd' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH']);

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
      const messenger = getCurrencyRateControllerMessenger();
      const tokenPricesService = buildMockTokenPricesService();
      const fetchExchangeRatesSpy = jest.spyOn(
        tokenPricesService,
        'fetchExchangeRates',
      );
      const controller = new CurrencyRateController({
        useExternalServices: () => false,
        interval: 100,
        messenger,
        state: { currentCurrency: 'usd' },
        tokenPricesService,
      });

      controller.startPolling({ nativeCurrencies: ['ETH'] });
      await jestAdvanceTime({ duration: 0 });

      expect(fetchExchangeRatesSpy).not.toHaveBeenCalled();

      await jestAdvanceTime({ duration: 100 });

      expect(fetchExchangeRatesSpy).not.toHaveBeenCalled();

      controller.destroy();
    });

    it('should not fetch exchange rates when useExternalServices is false even with multiple currencies', async () => {
      const messenger = getCurrencyRateControllerMessenger();
      const tokenPricesService = buildMockTokenPricesService();
      const controller = new CurrencyRateController({
        useExternalServices: () => false,
        messenger,
        state: { currentCurrency: 'eur' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH', 'BTC', 'BNB']);

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
      const messenger = getCurrencyRateControllerMessenger();
      const tokenPricesService = buildMockTokenPricesService();
      const controller = new CurrencyRateController({
        useExternalServices: () => false,
        messenger,
        state: { currentCurrency: 'cad' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['SepoliaETH', 'GoerliETH']);

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
      const messenger = getCurrencyRateControllerMessenger();
      const tokenPricesService = buildMockTokenPricesService();
      const controller = new CurrencyRateController({
        useExternalServices: () => false,
        includeUsdRate: true,
        messenger,
        state: { currentCurrency: 'jpy' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH']);

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
        messenger,
        state: { currentCurrency: 'eur' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH']);

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
        messenger,
        state: { currentCurrency: 'gbp' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH']);

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
      const messenger = getCurrencyRateControllerMessenger();
      const tokenPricesService = buildMockTokenPricesService();
      const controller = new CurrencyRateController({
        useExternalServices: () => false,
        messenger,
        state: { currentCurrency: 'usd' },
        tokenPricesService,
      });

      // Should not throw an error
      expect(await controller.updateExchangeRate(['ETH'])).toBeUndefined();

      controller.destroy();
    });
  });

  describe('fallback to token prices service (lines 233-316)', () => {
    it('should fallback to fetchTokenPrices when fetchExchangeRates fails and crypto compare fallback also fails', async () => {
      jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());

      const messenger = getCurrencyRateControllerMessengerWithNetworkState({
        networkConfigurationsByChainId: {
          '0x1': {
            chainId: '0x1',
            nativeCurrency: 'ETH',
            name: 'Ethereum Mainnet',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
          '0x89': {
            chainId: '0x89',
            nativeCurrency: 'POL',
            name: 'Polygon',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
        },
      });

      const tokenPricesService = buildMockTokenPricesService();

      // Make fetchExchangeRates fail to trigger fallback
      jest
        .spyOn(tokenPricesService, 'fetchExchangeRates')
        .mockRejectedValue(new Error('Price API failed'));

      // Mock fetchTokenPrices to return token prices
      jest
        .spyOn(tokenPricesService, 'fetchTokenPrices')
        .mockImplementation(async ({ assets }) => {
          if (assets.some((asset) => asset.chainId === '0x1')) {
            return [
              {
                currency: 'usd',
                tokenAddress: '0x0000000000000000000000000000000000000000',
                chainId: assets[0].chainId,
                assetId: 'xx:yy/aa:bb',
                price: 2500.5,
                pricePercentChange1d: 0,
                priceChange1d: 0,
                allTimeHigh: 4000,
                allTimeLow: 900,
                circulatingSupply: 2000,
                dilutedMarketCap: 100,
                high1d: 200,
                low1d: 100,
                marketCap: 1000,
                marketCapPercentChange1d: 100,
                pricePercentChange14d: 100,
                pricePercentChange1h: 1,
                pricePercentChange1y: 200,
                pricePercentChange200d: 300,
                pricePercentChange30d: 200,
                pricePercentChange7d: 100,
                totalVolume: 100,
              },
            ];
          }

          if (assets.some((asset) => asset.chainId === '0x89')) {
            return [
              {
                currency: 'usd',
                tokenAddress: '0x0000000000000000000000000000000000001010',
                chainId: assets[0].chainId,
                assetId: 'xx:yy/aa:bb',
                price: 0.85,
                pricePercentChange1d: 0,
                priceChange1d: 0,
                allTimeHigh: 4000,
                allTimeLow: 900,
                circulatingSupply: 2000,
                dilutedMarketCap: 100,
                high1d: 200,
                low1d: 100,
                marketCap: 1000,
                marketCapPercentChange1d: 100,
                pricePercentChange14d: 100,
                pricePercentChange1h: 1,
                pricePercentChange1y: 200,
                pricePercentChange200d: 300,
                pricePercentChange30d: 200,
                pricePercentChange7d: 100,
                totalVolume: 100,
              },
            ];
          }
          return [];
        });

      // Make crypto compare also fail by not mocking it (no nock setup)
      const controller = new CurrencyRateController({
        messenger,
        state: { currentCurrency: 'usd' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH', 'POL']);

      const conversionDate = getStubbedDate() / 1000;
      expect(controller.state).toStrictEqual({
        currentCurrency: 'usd',
        currencyRates: {
          ETH: {
            conversionDate,
            conversionRate: 2500.5,
            usdConversionRate: null,
          },
          POL: {
            conversionDate,
            conversionRate: 0.85,
            usdConversionRate: null,
          },
        },
      });

      controller.destroy();
    });

    it('should map native currencies to correct chain IDs (lines 236-262)', async () => {
      jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());

      const messenger = getCurrencyRateControllerMessengerWithNetworkState({
        networkConfigurationsByChainId: {
          '0x1': {
            chainId: '0x1',
            nativeCurrency: 'ETH',
            name: 'Ethereum Mainnet',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
          '0xaa36a7': {
            chainId: '0xaa36a7',
            nativeCurrency: 'ETH', // Sepolia also uses ETH
            name: 'Sepolia',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
        },
      });

      const tokenPricesService = buildMockTokenPricesService();

      jest
        .spyOn(tokenPricesService, 'fetchExchangeRates')
        .mockRejectedValue(new Error('Price API failed'));

      const fetchTokenPricesSpy = jest
        .spyOn(tokenPricesService, 'fetchTokenPrices')
        .mockImplementation(async ({ assets }) => {
          if (
            assets.some(
              (asset) =>
                asset.chainId === '0x1' || asset.chainId === '0xaa36a7',
            )
          ) {
            return [
              {
                currency: 'usd',
                tokenAddress: '0x0000000000000000000000000000000000000000',
                chainId: assets[0].chainId,
                assetId: 'xx:yy/aa:bb',
                price: 2500.5,
                pricePercentChange1d: 0,
                priceChange1d: 0,
                allTimeHigh: 4000,
                allTimeLow: 900,
                circulatingSupply: 2000,
                dilutedMarketCap: 100,
                high1d: 200,
                low1d: 100,
                marketCap: 1000,
                marketCapPercentChange1d: 100,
                pricePercentChange14d: 100,
                pricePercentChange1h: 1,
                pricePercentChange1y: 200,
                pricePercentChange200d: 300,
                pricePercentChange30d: 200,
                pricePercentChange7d: 100,
                totalVolume: 100,
              },
            ];
          }
          return [];
        });

      const controller = new CurrencyRateController({
        messenger,
        state: { currentCurrency: 'usd' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH']);

      // Should only call fetchTokenPrices once, using first matching chainId (line 255)
      expect(fetchTokenPricesSpy).toHaveBeenCalledTimes(1);
      expect(fetchTokenPricesSpy).toHaveBeenCalledWith({
        assets: [
          {
            chainId: '0x1',
            tokenAddress: '0x0000000000000000000000000000000000000000',
          },
        ],
        currency: 'usd',
      });

      controller.destroy();
    });

    it('should handle errors when fetchTokenPrices fails for a specific chain (lines 285-296)', async () => {
      jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());

      const messenger = getCurrencyRateControllerMessengerWithNetworkState({
        networkConfigurationsByChainId: {
          '0x1': {
            chainId: '0x1',
            nativeCurrency: 'ETH',
            name: 'Ethereum Mainnet',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
          '0x89': {
            chainId: '0x89',
            nativeCurrency: 'POL',
            name: 'Polygon',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
        },
      });

      const tokenPricesService = buildMockTokenPricesService();

      jest
        .spyOn(tokenPricesService, 'fetchExchangeRates')
        .mockRejectedValue(new Error('Price API failed'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      jest
        .spyOn(tokenPricesService, 'fetchTokenPrices')
        .mockImplementation(async ({ assets }) => {
          if (assets.some((asset) => asset.chainId === '0x1')) {
            // ETH succeeds
            return [
              {
                currency: 'usd',
                tokenAddress: '0x0000000000000000000000000000000000000000',
                chainId: assets[0].chainId,
                assetId: 'xx:yy/aa:bb',
                price: 2500.5,
                pricePercentChange1d: 0,
                priceChange1d: 0,
                allTimeHigh: 4000,
                allTimeLow: 900,
                circulatingSupply: 2000,
                dilutedMarketCap: 100,
                high1d: 200,
                low1d: 100,
                marketCap: 1000,
                marketCapPercentChange1d: 100,
                pricePercentChange14d: 100,
                pricePercentChange1h: 1,
                pricePercentChange1y: 200,
                pricePercentChange200d: 300,
                pricePercentChange30d: 200,
                pricePercentChange7d: 100,
                totalVolume: 100,
              },
            ];
          }
          // POL fails
          throw new Error('Failed to fetch POL price');
        });

      const controller = new CurrencyRateController({
        messenger,
        state: { currentCurrency: 'usd' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH', 'POL']);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch token price for POL on chain 0x89',
        expect.any(Error),
      );

      const conversionDate = getStubbedDate() / 1000;
      expect(controller.state).toStrictEqual({
        currentCurrency: 'usd',
        currencyRates: {
          ETH: {
            conversionDate,
            conversionRate: 2500.5,
            usdConversionRate: null,
          },
          POL: {
            conversionDate: null,
            conversionRate: null,
            usdConversionRate: null,
          },
        },
      });

      consoleErrorSpy.mockRestore();
      controller.destroy();
    });

    it('should set conversionDate to null when token price is not found (line 281)', async () => {
      jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());

      const messenger = getCurrencyRateControllerMessengerWithNetworkState({
        networkConfigurationsByChainId: {
          '0x1': {
            chainId: '0x1',
            nativeCurrency: 'ETH',
            name: 'Ethereum Mainnet',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
        },
      });

      const tokenPricesService = buildMockTokenPricesService();

      jest
        .spyOn(tokenPricesService, 'fetchExchangeRates')
        .mockRejectedValue(new Error('Price API failed'));

      // Return empty object (no token price)
      jest.spyOn(tokenPricesService, 'fetchTokenPrices').mockResolvedValue([]);

      const controller = new CurrencyRateController({
        messenger,
        state: { currentCurrency: 'usd' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH']);

      expect(controller.state).toStrictEqual({
        currentCurrency: 'usd',
        currencyRates: {
          ETH: {
            conversionDate: null, // Line 281: tokenPrice is undefined
            conversionRate: null, // Line 282: tokenPrice?.price ?? null
            usdConversionRate: null,
          },
        },
      });

      controller.destroy();
    });

    it('should set null state for currencies not found in network configurations (lines 252-257)', async () => {
      jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());

      const messenger = getCurrencyRateControllerMessengerWithNetworkState({
        networkConfigurationsByChainId: {
          '0x1': {
            chainId: '0x1',
            nativeCurrency: 'ETH',
            name: 'Ethereum Mainnet',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
        },
      });

      const tokenPricesService = buildMockTokenPricesService();

      jest
        .spyOn(tokenPricesService, 'fetchExchangeRates')
        .mockRejectedValue(new Error('Price API failed'));

      const fetchTokenPricesSpy = jest
        .spyOn(tokenPricesService, 'fetchTokenPrices')
        .mockImplementation(async ({ assets }) => {
          if (assets.some((asset) => asset.chainId === '0x1')) {
            return [
              {
                currency: 'usd',
                tokenAddress: '0x0000000000000000000000000000000000000000',
                chainId: assets[0].chainId,
                price: 2500.5,
                pricePercentChange1d: 0,
                priceChange1d: 0,
                allTimeHigh: 4000,
                allTimeLow: 900,
                circulatingSupply: 2000,
                dilutedMarketCap: 100,
                high1d: 200,
                low1d: 100,
                marketCap: 1000,
                marketCapPercentChange1d: 100,
                pricePercentChange14d: 100,
                pricePercentChange1h: 1,
                pricePercentChange1y: 200,
                pricePercentChange200d: 300,
                pricePercentChange30d: 200,
                pricePercentChange7d: 100,
                totalVolume: 100,
              },
            ];
          }
          return [];
        });

      const controller = new CurrencyRateController({
        messenger,
        state: { currentCurrency: 'usd' },
        tokenPricesService,
      });

      // Request ETH (exists) and BNB (not in network configs)
      await controller.updateExchangeRate(['ETH', 'BNB']);

      // Should only call fetchTokenPrices for ETH, not BNB (line 252: if chainIds.length > 0)
      expect(fetchTokenPricesSpy).toHaveBeenCalledTimes(1);
      expect(fetchTokenPricesSpy).toHaveBeenCalledWith({
        assets: [
          {
            chainId: '0x1',
            tokenAddress: '0x0000000000000000000000000000000000000000',
          },
        ],
        currency: 'usd',
      });

      const conversionDate = getStubbedDate() / 1000;
      expect(controller.state).toStrictEqual({
        currentCurrency: 'usd',
        currencyRates: {
          ETH: {
            conversionDate,
            conversionRate: 2500.5,
            usdConversionRate: null,
          },
          // BNB has null state because it couldn't be found in network configurations
          BNB: {
            conversionDate: null,
            conversionRate: null,
            usdConversionRate: null,
          },
        },
      });

      controller.destroy();
    });

    it('should use correct native token address for Polygon (line 269)', async () => {
      jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());

      const messenger = getCurrencyRateControllerMessengerWithNetworkState({
        networkConfigurationsByChainId: {
          '0x89': {
            chainId: '0x89',
            nativeCurrency: 'POL',
            name: 'Polygon',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
        },
      });

      const tokenPricesService = buildMockTokenPricesService();

      jest
        .spyOn(tokenPricesService, 'fetchExchangeRates')
        .mockRejectedValue(new Error('Price API failed'));

      const fetchTokenPricesSpy = jest
        .spyOn(tokenPricesService, 'fetchTokenPrices')
        .mockResolvedValue([
          {
            currency: 'usd',
            tokenAddress: '0x0000000000000000000000000000000000001010',
            chainId: '0x89',
            price: 0.85,
            pricePercentChange1d: 0,
            priceChange1d: 0,
            allTimeHigh: 4000,
            allTimeLow: 900,
            circulatingSupply: 2000,
            dilutedMarketCap: 100,
            high1d: 200,
            low1d: 100,
            marketCap: 1000,
            marketCapPercentChange1d: 100,
            pricePercentChange14d: 100,
            pricePercentChange1h: 1,
            pricePercentChange1y: 200,
            pricePercentChange200d: 300,
            pricePercentChange30d: 200,
            pricePercentChange7d: 100,
            totalVolume: 100,
          },
        ]);

      const controller = new CurrencyRateController({
        messenger,
        state: { currentCurrency: 'usd' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['POL']);

      // Should use Polygon's native token address (line 269)
      expect(fetchTokenPricesSpy).toHaveBeenCalledWith({
        assets: [
          {
            chainId: '0x89',
            tokenAddress: '0x0000000000000000000000000000000000001010',
          },
        ],
        currency: 'usd',
      });

      controller.destroy();
    });
  });

  describe('partial success with fallback', () => {
    it('should fallback only for currencies that failed in Price API response (partial success)', async () => {
      jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());

      const messenger = getCurrencyRateControllerMessengerWithNetworkState({
        networkConfigurationsByChainId: {
          '0x1': {
            chainId: '0x1',
            nativeCurrency: 'ETH',
            name: 'Ethereum Mainnet',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
          '0x89': {
            chainId: '0x89',
            nativeCurrency: 'POL',
            name: 'Polygon',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
        },
      });

      const tokenPricesService = buildMockTokenPricesService();

      // Price API returns ETH but not POL (partial success)
      jest.spyOn(tokenPricesService, 'fetchExchangeRates').mockResolvedValue({
        eth: {
          name: 'Ether',
          ticker: 'eth',
          value: 1 / 2000,
          currencyType: 'crypto',
          usd: 1 / 2500,
        },
        // POL is missing - should trigger fallback
      });

      const fetchTokenPricesSpy = jest
        .spyOn(tokenPricesService, 'fetchTokenPrices')
        .mockResolvedValue([
          {
            currency: 'usd',
            tokenAddress: '0x0000000000000000000000000000000000001010',
            chainId: '0x89',
            price: 0.75,
            pricePercentChange1d: 0,
            priceChange1d: 0,
            allTimeHigh: 4000,
            allTimeLow: 900,
            circulatingSupply: 2000,
            dilutedMarketCap: 100,
            high1d: 200,
            low1d: 100,
            marketCap: 1000,
            marketCapPercentChange1d: 100,
            pricePercentChange14d: 100,
            pricePercentChange1h: 1,
            pricePercentChange1y: 200,
            pricePercentChange200d: 300,
            pricePercentChange30d: 200,
            pricePercentChange7d: 100,
            totalVolume: 100,
          },
        ]);

      const controller = new CurrencyRateController({
        messenger,
        state: { currentCurrency: 'usd' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH', 'POL']);

      // Should only call fetchTokenPrices for POL (ETH succeeded)
      expect(fetchTokenPricesSpy).toHaveBeenCalledTimes(1);
      expect(fetchTokenPricesSpy).toHaveBeenCalledWith({
        assets: [
          {
            chainId: '0x89',
            tokenAddress: '0x0000000000000000000000000000000000001010',
          },
        ],
        currency: 'usd',
      });

      const conversionDate = getStubbedDate() / 1000;
      expect(controller.state).toStrictEqual({
        currentCurrency: 'usd',
        currencyRates: {
          ETH: {
            conversionDate,
            conversionRate: 2000,
            usdConversionRate: 2500,
          },
          POL: {
            conversionDate,
            conversionRate: 0.75,
            usdConversionRate: null,
          },
        },
      });

      controller.destroy();
    });

    it('should not call fallback when all currencies succeed from Price API', async () => {
      jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());

      const messenger = getCurrencyRateControllerMessengerWithNetworkState({
        networkConfigurationsByChainId: {
          '0x1': {
            chainId: '0x1',
            nativeCurrency: 'ETH',
            name: 'Ethereum Mainnet',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
          '0x89': {
            chainId: '0x89',
            nativeCurrency: 'POL',
            name: 'Polygon',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
        },
      });

      const tokenPricesService = buildMockTokenPricesService();

      // Price API returns both ETH and POL (full success)
      jest.spyOn(tokenPricesService, 'fetchExchangeRates').mockResolvedValue({
        eth: {
          name: 'Ether',
          ticker: 'eth',
          value: 1 / 2000,
          currencyType: 'crypto',
          usd: 1 / 2500,
        },
        pol: {
          name: 'Polygon',
          ticker: 'pol',
          value: 1 / 0.8,
          currencyType: 'crypto',
          usd: 1 / 1,
        },
      });

      const fetchTokenPricesSpy = jest.spyOn(
        tokenPricesService,
        'fetchTokenPrices',
      );

      const controller = new CurrencyRateController({
        messenger,
        state: { currentCurrency: 'usd' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH', 'POL']);

      // Should NOT call fetchTokenPrices since all currencies succeeded
      expect(fetchTokenPricesSpy).not.toHaveBeenCalled();

      const conversionDate = getStubbedDate() / 1000;
      expect(controller.state).toStrictEqual({
        currentCurrency: 'usd',
        currencyRates: {
          ETH: {
            conversionDate,
            conversionRate: 2000,
            usdConversionRate: 2500,
          },
          POL: {
            conversionDate,
            conversionRate: 0.8,
            usdConversionRate: 1,
          },
        },
      });

      controller.destroy();
    });

    it('should preserve successful Price API rates even when fallback fails', async () => {
      jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());

      const messenger = getCurrencyRateControllerMessengerWithNetworkState({
        networkConfigurationsByChainId: {
          '0x1': {
            chainId: '0x1',
            nativeCurrency: 'ETH',
            name: 'Ethereum Mainnet',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
          '0x89': {
            chainId: '0x89',
            nativeCurrency: 'POL',
            name: 'Polygon',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
        },
      });

      const tokenPricesService = buildMockTokenPricesService();

      // Price API returns ETH but not POL
      jest.spyOn(tokenPricesService, 'fetchExchangeRates').mockResolvedValue({
        eth: {
          name: 'Ether',
          ticker: 'eth',
          value: 1 / 2000,
          currencyType: 'crypto',
          usd: 1 / 2500,
        },
      });

      // Fallback also fails for POL
      jest
        .spyOn(tokenPricesService, 'fetchTokenPrices')
        .mockRejectedValue(new Error('Token prices service failed'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const controller = new CurrencyRateController({
        messenger,
        state: { currentCurrency: 'usd' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH', 'POL']);

      const conversionDate = getStubbedDate() / 1000;
      expect(controller.state).toStrictEqual({
        currentCurrency: 'usd',
        currencyRates: {
          // ETH should still have valid data from Price API
          ETH: {
            conversionDate,
            conversionRate: 2000,
            usdConversionRate: 2500,
          },
          // POL should have null values since both approaches failed
          POL: {
            conversionDate: null,
            conversionRate: null,
            usdConversionRate: null,
          },
        },
      });

      consoleErrorSpy.mockRestore();
      controller.destroy();
    });

    it('should handle multiple partial failures with mixed fallback results', async () => {
      jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());

      const messenger = getCurrencyRateControllerMessengerWithNetworkState({
        networkConfigurationsByChainId: {
          '0x1': {
            chainId: '0x1',
            nativeCurrency: 'ETH',
            name: 'Ethereum Mainnet',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
          '0x89': {
            chainId: '0x89',
            nativeCurrency: 'POL',
            name: 'Polygon',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
          '0x38': {
            chainId: '0x38',
            nativeCurrency: 'BNB',
            name: 'BSC',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
        },
      });

      const tokenPricesService = buildMockTokenPricesService();

      // Price API returns only ETH
      jest.spyOn(tokenPricesService, 'fetchExchangeRates').mockResolvedValue({
        eth: {
          name: 'Ether',
          ticker: 'eth',
          value: 1 / 2000,
          currencyType: 'crypto',
        },
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Fallback succeeds for POL but fails for BNB
      jest
        .spyOn(tokenPricesService, 'fetchTokenPrices')
        .mockImplementation(async ({ assets }) => {
          if (assets.some((asset) => asset.chainId === '0x89')) {
            return [
              {
                currency: 'usd',
                tokenAddress: '0x0000000000000000000000000000000000001010',
                chainId: '0x89',
                price: 0.75,
                pricePercentChange1d: 0,
                priceChange1d: 0,
                allTimeHigh: 4000,
                allTimeLow: 900,
                circulatingSupply: 2000,
                dilutedMarketCap: 100,
                high1d: 200,
                low1d: 100,
                marketCap: 1000,
                marketCapPercentChange1d: 100,
                pricePercentChange14d: 100,
                pricePercentChange1h: 1,
                pricePercentChange1y: 200,
                pricePercentChange200d: 300,
                pricePercentChange30d: 200,
                pricePercentChange7d: 100,
                totalVolume: 100,
              },
            ];
          }
          throw new Error('Token prices service failed for BNB');
        });

      const controller = new CurrencyRateController({
        messenger,
        state: { currentCurrency: 'usd' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH', 'POL', 'BNB']);

      const conversionDate = getStubbedDate() / 1000;
      expect(controller.state).toStrictEqual({
        currentCurrency: 'usd',
        currencyRates: {
          // ETH from Price API
          ETH: {
            conversionDate,
            conversionRate: 2000,
            usdConversionRate: null,
          },
          // POL from fallback
          POL: {
            conversionDate,
            conversionRate: 0.75,
            usdConversionRate: null,
          },
          // BNB failed both approaches
          BNB: {
            conversionDate: null,
            conversionRate: null,
            usdConversionRate: null,
          },
        },
      });

      consoleErrorSpy.mockRestore();
      controller.destroy();
    });

    it('should handle Price API returning rate with no value (undefined rate)', async () => {
      jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());

      const messenger = getCurrencyRateControllerMessengerWithNetworkState({
        networkConfigurationsByChainId: {
          '0x1': {
            chainId: '0x1',
            nativeCurrency: 'ETH',
            name: 'Ethereum Mainnet',
            rpcEndpoints: [],
            blockExplorerUrls: [],
            defaultRpcEndpointIndex: 0,
          },
        },
      });

      const tokenPricesService = buildMockTokenPricesService();

      // Price API returns ETH but with value: 0 (falsy)
      jest.spyOn(tokenPricesService, 'fetchExchangeRates').mockResolvedValue({
        eth: {
          name: 'Ether',
          ticker: 'eth',
          value: 0, // Falsy value should trigger fallback
          currencyType: 'crypto',
        },
      });

      jest.spyOn(tokenPricesService, 'fetchTokenPrices').mockResolvedValue([
        {
          currency: 'usd',
          tokenAddress: '0x0000000000000000000000000000000000000000',
          chainId: '0x1',
          price: 1800,
          pricePercentChange1d: 0,
          priceChange1d: 0,
          allTimeHigh: 4000,
          allTimeLow: 900,
          circulatingSupply: 2000,
          dilutedMarketCap: 100,
          high1d: 200,
          low1d: 100,
          marketCap: 1000,
          marketCapPercentChange1d: 100,
          pricePercentChange14d: 100,
          pricePercentChange1h: 1,
          pricePercentChange1y: 200,
          pricePercentChange200d: 300,
          pricePercentChange30d: 200,
          pricePercentChange7d: 100,
          totalVolume: 100,
        },
      ]);

      const controller = new CurrencyRateController({
        messenger,
        state: { currentCurrency: 'usd' },
        tokenPricesService,
      });

      await controller.updateExchangeRate(['ETH']);

      const conversionDate = getStubbedDate() / 1000;
      expect(controller.state).toStrictEqual({
        currentCurrency: 'usd',
        currencyRates: {
          ETH: {
            conversionDate,
            conversionRate: 1800,
            usdConversionRate: null,
          },
        },
      });

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
        {
          "currencyRates": {
            "ETH": {
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
        {
          "currencyRates": {
            "ETH": {
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
        {
          "currencyRates": {
            "ETH": {
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
        {
          "currencyRates": {
            "ETH": {
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
