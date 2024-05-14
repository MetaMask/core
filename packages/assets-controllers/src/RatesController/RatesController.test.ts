import { ControllerMessenger } from '@metamask/base-controller';
import { useFakeTimers } from 'sinon';

import { advanceTime } from '../../../../tests/helpers';
import type { fetchMultiExchangeRate as defaultFetchExchangeRate } from '../crypto-compare-service';
import {
  RatesController,
  name as ratesControllerName,
} from './RatesController';
import type {
  RatesControllerActions,
  RatesControllerEvents,
  RatesMessenger,
  RatesControllerState,
} from './types';

const MOCK_TIMESTAMP = 1709983353;

/**
 * Returns a stubbed date based on a predefined timestamp.
 * @returns The stubbed date in milliseconds.
 */
const getStubbedDate = () => {
  return new Date(MOCK_TIMESTAMP * 1000).getTime();
};

/**
 * Builds a new ControllerMessenger instance for RatesController.
 * @returns A new ControllerMessenger instance.
 */
function buildMessenger(): ControllerMessenger<
  RatesControllerActions,
  RatesControllerEvents
> {
  return new ControllerMessenger<
    RatesControllerActions,
    RatesControllerEvents
  >();
}

/**
 * Builds a restricted messenger for the RatesController.
 * @param messenger - The base messenger instance.
 * @returns A restricted messenger for the RatesController.
 */
function buildRatesControllerMessenger(
  messenger: ControllerMessenger<RatesControllerActions, RatesControllerEvents>,
): RatesMessenger {
  return messenger.getRestricted({
    name: ratesControllerName,
    allowedEvents: [],
    allowedActions: [],
  });
}

/**
 * Sets up and returns a new instance of RatesController with the provided configuration.
 * @param config - The configuration object for the RatesController.
 * @param config.initialState - Initial state of the controller.
 * @param config.messenger - ControllerMessenger instance.
 * @param config.includeUsdRate - Indicates if the USD rate should be included.
 * @param config.fetchMultiExchangeRate - Callback to fetch rates data.
 * @returns A new instance of RatesController.
 */
function setupRatesController({
  initialState,
  messenger,
  includeUsdRate,
  fetchMultiExchangeRate,
}: {
  initialState: Partial<RatesControllerState>;
  messenger: ControllerMessenger<RatesControllerActions, RatesControllerEvents>;
  includeUsdRate?: boolean;
  fetchMultiExchangeRate: typeof defaultFetchExchangeRate;
}) {
  const ratesControllerMessenger = buildRatesControllerMessenger(messenger);
  return new RatesController({
    interval: 150,
    messenger: ratesControllerMessenger,
    state: initialState,
    includeUsdRate,
    fetchMultiExchangeRate,
  });
}

describe('RatesController', () => {
  let clock: sinon.SinonFakeTimers;

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('contruct', () => {
    it('constructs the RatesController with the correct values', () => {
      const fetchExchangeRateStub = jest.fn().mockResolvedValue({});
      const ratesController = setupRatesController({
        initialState: {},
        messenger: buildMessenger(),
        includeUsdRate: false,
        fetchMultiExchangeRate: fetchExchangeRateStub,
      });
      const { currency, rates, fromCurrencies } = ratesController.state;
      expect(ratesController).toBeDefined();
      expect(currency).toBe('usd');
      expect(Object.keys(rates)).toStrictEqual(['btc']);
      expect(fromCurrencies).toStrictEqual(['btc']);
    });
  });

  describe('start', () => {
    beforeEach(() => {
      clock = useFakeTimers();
    });

    afterEach(() => {
      clock.restore();
      jest.restoreAllMocks();
    });

    it('starts the polling process with default values', async () => {
      const messenger = buildMessenger();
      const publishActionSpy = jest.spyOn(messenger, 'publish');

      jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());
      const mockRateValue = 57715.42;
      const fetchExchangeRateStub = jest.fn(() => {
        return Promise.resolve({
          btc: {
            eur: mockRateValue,
          },
        });
      });
      const ratesController = setupRatesController({
        initialState: {
          currency: 'eur',
        },
        messenger,
        fetchMultiExchangeRate: fetchExchangeRateStub,
      });

      const ratesPreUpdate = ratesController.state.rates;

      expect(ratesPreUpdate).toStrictEqual({
        btc: {
          conversionDate: 0,
          conversionRate: 0,
          usdConversionRate: null,
        },
      });

      await ratesController.start();

      expect(publishActionSpy).toHaveBeenNthCalledWith(
        1,
        `${ratesControllerName}:startPolling`,
      );

      await advanceTime({ clock, duration: 200 });

      const ratesPosUpdate = ratesController.state.rates;

      // checks for the RatesController:stateChange event
      expect(publishActionSpy).toHaveBeenCalledTimes(2);
      expect(fetchExchangeRateStub).toHaveBeenCalled();
      expect(ratesPosUpdate).toStrictEqual({
        btc: {
          conversionDate: MOCK_TIMESTAMP,
          conversionRate: mockRateValue,
          usdConversionRate: null,
        },
      });

      await ratesController.start();

      // since the polling has already started
      // a second call to the start method should
      // return immediately and no extra logic is executed
      expect(publishActionSpy).not.toHaveBeenNthCalledWith(3);
    });

    it('starts the polling process with custom values', async () => {
      jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());
      const mockBtcUsdRateValue = 62235.48;
      const mockSolUsdRateValue = 148.41;
      const mockStrkUsdRateValue = 1.248;
      const mockBtcEurRateValue = 57715.42;
      const mockSolEurRateValue = 137.68;
      const mockStrkEurRateValue = 1.157;
      const fetchExchangeRateStub = jest.fn(() => {
        return Promise.resolve({
          btc: {
            usd: mockBtcUsdRateValue,
            eur: mockBtcEurRateValue,
          },
          sol: {
            usd: mockSolUsdRateValue,
            eur: mockSolEurRateValue,
          },
          strk: {
            usd: mockStrkUsdRateValue,
            eur: mockStrkEurRateValue,
          },
        });
      });

      const ratesController = setupRatesController({
        initialState: {
          fromCurrencies: ['btc', 'sol', 'strk'],
          currency: 'eur',
        },
        messenger: buildMessenger(),
        includeUsdRate: true,
        fetchMultiExchangeRate: fetchExchangeRateStub,
      });

      await ratesController.start();

      await advanceTime({ clock, duration: 200 });

      const { rates } = ratesController.state;
      expect(fetchExchangeRateStub).toHaveBeenCalled();
      expect(rates).toStrictEqual({
        btc: {
          conversionDate: MOCK_TIMESTAMP,
          conversionRate: mockBtcEurRateValue,
          usdConversionRate: mockBtcUsdRateValue,
        },
        sol: {
          conversionDate: MOCK_TIMESTAMP,
          conversionRate: mockSolEurRateValue,
          usdConversionRate: mockSolUsdRateValue,
        },
        strk: {
          conversionDate: MOCK_TIMESTAMP,
          conversionRate: mockStrkEurRateValue,
          usdConversionRate: mockStrkUsdRateValue,
        },
      });
    });
  });

  describe('stop', () => {
    beforeEach(() => {
      clock = useFakeTimers();
    });

    afterEach(() => {
      clock.restore();
      jest.restoreAllMocks();
    });

    it('stops the polling process', async () => {
      const messenger = buildMessenger();
      const publishActionSpy = jest.spyOn(messenger, 'publish');
      const fetchExchangeRateStub = jest.fn().mockResolvedValue({});
      const ratesController = setupRatesController({
        initialState: {},
        messenger,
        fetchMultiExchangeRate: fetchExchangeRateStub,
      });

      await ratesController.start();

      expect(publishActionSpy).toHaveBeenNthCalledWith(
        1,
        `${ratesControllerName}:startPolling`,
      );

      await advanceTime({ clock, duration: 200 });

      expect(fetchExchangeRateStub).toHaveBeenCalledTimes(1);

      await ratesController.stop();

      // check the 3rd call since the 2nd one is for the
      // event stateChange
      expect(publishActionSpy).toHaveBeenNthCalledWith(
        3,
        `${ratesControllerName}:stopPolling`,
      );

      await advanceTime({ clock, duration: 200 });

      expect(fetchExchangeRateStub).toHaveBeenCalledTimes(1);

      await ratesController.stop();

      // check if the stop method is called again, it returns early
      // and no extra logic is executed
      expect(publishActionSpy).not.toHaveBeenNthCalledWith(
        4,
        `${ratesControllerName}:stopPolling`,
      );
    });
  });

  describe('getCryptocurrencyList', () => {
    it('returns the current cryptocurrency list', () => {
      const fetchExchangeRateStub = jest.fn().mockResolvedValue({});
      const mockCryptocurrencyList = ['btc', 'sol', 'strk'];
      const ratesController = setupRatesController({
        initialState: {
          fromCurrencies: mockCryptocurrencyList,
        },
        messenger: buildMessenger(),
        fetchMultiExchangeRate: fetchExchangeRateStub,
      });

      const cryptocurrencyList = ratesController.getCryptocurrencyList();
      expect(cryptocurrencyList).toStrictEqual(mockCryptocurrencyList);
    });
  });

  describe('setCryptocurrencyList', () => {
    it('updates the cryptocurrency list', async () => {
      const fetchExchangeRateStub = jest.fn().mockResolvedValue({});
      const mockCryptocurrencyList = ['btc', 'sol', 'strk'];
      const ratesController = setupRatesController({
        initialState: {},
        messenger: buildMessenger(),
        fetchMultiExchangeRate: fetchExchangeRateStub,
      });

      const cryptocurrencyListPreUpdate =
        ratesController.getCryptocurrencyList();
      expect(cryptocurrencyListPreUpdate).toStrictEqual(['btc']);

      await ratesController.setCryptocurrencyList(mockCryptocurrencyList);
      const cryptocurrencyListPostUpdate =
        ratesController.getCryptocurrencyList();
      expect(cryptocurrencyListPostUpdate).toStrictEqual(
        mockCryptocurrencyList,
      );
    });
  });

  describe('setCurrentCurrency', () => {
    it('sets the currency to a new value', async () => {
      const fetchExchangeRateStub = jest.fn().mockResolvedValue({});
      const ratesController = setupRatesController({
        initialState: {},
        messenger: buildMessenger(),
        fetchMultiExchangeRate: fetchExchangeRateStub,
      });

      const currencyPreUpdate = ratesController.state.currency;
      expect(currencyPreUpdate).toBe('usd');

      await ratesController.setCurrency('eur');

      const currencyPostUpdate = ratesController.state.currency;
      expect(currencyPostUpdate).toBe('eur');
    });

    it('throws if input is an empty string', async () => {
      const fetchExchangeRateStub = jest.fn().mockResolvedValue({});
      const ratesController = setupRatesController({
        initialState: {},
        messenger: buildMessenger(),
        fetchMultiExchangeRate: fetchExchangeRateStub,
      });

      await expect(ratesController.setCurrency('')).rejects.toThrow(
        'The currency can not be an empty string',
      );
    });
  });
});
