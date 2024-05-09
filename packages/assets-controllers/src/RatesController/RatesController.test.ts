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
  RatesState,
} from './types';

const MOCK_TIMESTAMP = 1709983353;

const getStubbedDate = () => {
  return new Date(MOCK_TIMESTAMP * 1000).getTime();
};

// eslint-disable-next-line jsdoc/require-jsdoc
function buildMessenger(): ControllerMessenger<
  RatesControllerActions,
  RatesControllerEvents
> {
  return new ControllerMessenger<
    RatesControllerActions,
    RatesControllerEvents
  >();
}

// eslint-disable-next-line jsdoc/require-jsdoc
function buildRatesControllerMessenger(
  messenger: ControllerMessenger<RatesControllerActions, RatesControllerEvents>,
): RatesMessenger {
  return messenger.getRestricted({
    name: ratesControllerName,
    allowedEvents: [],
    allowedActions: [],
  });
}

// eslint-disable-next-line jsdoc/require-jsdoc
function setupRatesController({
  initialState,
  messenger,
  includeUsdRate,
  fetchMultiExchangeRate,
  onStart,
  onStop,
}: {
  initialState: Partial<RatesState>;
  messenger: ControllerMessenger<RatesControllerActions, RatesControllerEvents>;
  includeUsdRate?: boolean;
  fetchMultiExchangeRate: typeof defaultFetchExchangeRate;
  onStart?: () => Promise<unknown>;
  onStop?: () => Promise<unknown>;
}) {
  const ratesControllerMessenger = buildRatesControllerMessenger(messenger);
  return new RatesController({
    interval: 150,
    messenger: ratesControllerMessenger,
    state: initialState,
    includeUsdRate,
    fetchMultiExchangeRate,
    onStart,
    onStop,
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
      const { currency, rates, cryptocurrencyList } = ratesController.state;
      expect(ratesController).toBeDefined();
      expect(currency).toBe('usd');
      expect(Object.keys(rates)).toStrictEqual(['btc']);
      expect(cryptocurrencyList).toStrictEqual(['btc']);
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
      jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());
      const mockRateValue = 62235.48;
      const fetchExchangeRateStub = jest.fn(() => {
        return Promise.resolve({
          btc: {
            usd: mockRateValue,
          },
        });
      });
      const ratesController = setupRatesController({
        initialState: {},
        messenger: buildMessenger(),
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

      await advanceTime({ clock, duration: 200 });

      const ratesPosUpdate = ratesController.state.rates;

      expect(fetchExchangeRateStub).toHaveBeenCalled();
      expect(ratesPosUpdate).toStrictEqual({
        btc: {
          conversionDate: MOCK_TIMESTAMP,
          conversionRate: mockRateValue,
          usdConversionRate: mockRateValue,
        },
      });
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
      const onStartStub = jest.fn().mockResolvedValue({});

      const ratesController = setupRatesController({
        initialState: {
          cryptocurrencyList: ['btc', 'sol', 'strk'],
          currency: 'eur',
        },
        messenger: buildMessenger(),
        includeUsdRate: true,
        fetchMultiExchangeRate: fetchExchangeRateStub,
        onStart: onStartStub,
      });

      await ratesController.start();

      await advanceTime({ clock, duration: 200 });

      const { rates } = ratesController.state;
      expect(fetchExchangeRateStub).toHaveBeenCalled();
      expect(onStartStub).toHaveBeenCalled();
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
      const fetchExchangeRateStub = jest.fn().mockResolvedValue({});
      const onStopStub = jest.fn().mockResolvedValue({});
      const ratesController = setupRatesController({
        initialState: {},
        messenger: buildMessenger(),
        fetchMultiExchangeRate: fetchExchangeRateStub,
        onStop: onStopStub,
      });

      await ratesController.start();

      await advanceTime({ clock, duration: 200 });

      expect(fetchExchangeRateStub).toHaveBeenCalledTimes(1);

      await ratesController.stop();

      expect(onStopStub).toHaveBeenCalled();

      await advanceTime({ clock, duration: 200 });

      expect(fetchExchangeRateStub).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCryptocurrencyList', () => {
    it('returns the current cryptocurrency list', () => {
      const fetchExchangeRateStub = jest.fn().mockResolvedValue({});
      const mockCryptocurrencyList = ['btc', 'sol', 'strk'];
      const ratesController = setupRatesController({
        initialState: {
          cryptocurrencyList: mockCryptocurrencyList,
        },
        messenger: buildMessenger(),
        fetchMultiExchangeRate: fetchExchangeRateStub,
      });

      const cryptocurrencyList = ratesController.getCryptocurrencyList();
      expect(cryptocurrencyList).toStrictEqual(mockCryptocurrencyList);
    });
  });

  describe('setCryptocurrencyList', () => {
    it('updates the cryptocurrency list', () => {
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

      ratesController.setCryptocurrencyList(mockCryptocurrencyList);
      const cryptocurrencyListPostUpdate =
        ratesController.getCryptocurrencyList();
      expect(cryptocurrencyListPostUpdate).toStrictEqual(
        mockCryptocurrencyList,
      );
    });
  });
});
