import nock from 'nock';
import { ControllerMessenger } from '../ControllerMessenger';
import { TESTNET_TICKER_SYMBOLS } from '../constants';
import {
  CurrencyRateController,
  CurrencyRateStateChange,
  GetCurrencyRateState,
} from './CurrencyRateController';

const name = 'CurrencyRateController';

/**
 * Constructs a restricted controller messenger.
 *
 * @returns A restricted controller messenger.
 */
function getRestrictedMessenger() {
  const controllerMessenger = new ControllerMessenger<
    GetCurrencyRateState,
    CurrencyRateStateChange
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

const getStubbedDate = () => {
  return new Date('2019-04-07T10:20:30Z').getTime();
};

/**
 * Setup a test CurrencyRateController instance.
 *
 * @param options - the options object for setupping up the CurrencyRateController for testing.
 * @param options.state - the initial state for the CurrencyRateController.
 * @param options.state.nativeCurrency - the initial nativeCurrency at time of instantiation.
 * @param options.state.currentCurrency - the initial currentCurrency at time of instantiation.
 * @param options.interval - the interval at which to poll for updated exchange rates.
 * @param options.conversionRate - the conversionRate to set for the fetchExchangeRateStub.
 * @param options.includeUsdRate - a boolean indicating whether or not to fetch/return a usdConversion rate.
 * @param options.usdConversionRate - the usdConversionRate to set for the fetchExchangeRateStub.
 * @param options.fetchExchangeRateStub - a full stub of the fetchExchangeRate method used by the Currency rate.
 * @returns an object containing the setup CurrencyRateController and the fetchExchangeRateStub.
 */
function setupController(
  {
    state,
    interval,
    conversionRate,
    includeUsdRate,
    usdConversionRate,
    fetchExchangeRateStub,
  }: {
    conversionRate?: number;
    usdConversionRate?: number;
    interval?: number;
    state?: { nativeCurrency?: string; currentCurrency?: string };
    includeUsdRate?: boolean;
    fetchExchangeRateStub?:
      | ((
          currency: string,
          nativeCurrency: string,
          includeUSDRate?: boolean | undefined,
        ) => Promise<{ conversionRate: number; usdConversionRate: number }>)
      | undefined;
  } = {
    conversionRate: 1,
    usdConversionRate: 2,
    interval: 100,
    state: { nativeCurrency: 'ETH' },
    includeUsdRate: false,
  },
) {
  let fetchExchangeRate;
  if (fetchExchangeRateStub) {
    fetchExchangeRate = fetchExchangeRateStub;
  } else if (conversionRate || usdConversionRate) {
    fetchExchangeRate = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve({ conversionRate, usdConversionRate }),
      );
  }
  const controller = new CurrencyRateController({
    fetchExchangeRate,
    messenger: getRestrictedMessenger(),
    interval,
    state,
    includeUsdRate,
  });

  return { controller, fetchExchangeRate };
}

describe('CurrencyRateController', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('should set default state', () => {
    const { controller } = setupController();
    expect(controller.state).toStrictEqual({
      conversionDate: 0,
      conversionRate: 0,
      currentCurrency: 'usd',
      nativeCurrency: 'ETH',
      pendingCurrentCurrency: null,
      pendingNativeCurrency: null,
      usdConversionRate: null,
    });
  });

  it('should initialize with initial state', () => {
    const existingState = { currentCurrency: 'rep' };
    const { controller } = setupController({ state: existingState });
    expect(controller.state).toStrictEqual({
      conversionDate: 0,
      conversionRate: 0,
      currentCurrency: 'rep',
      nativeCurrency: 'ETH',
      pendingCurrentCurrency: null,
      pendingNativeCurrency: null,
      usdConversionRate: null,
    });
  });

  it('should not poll before being started', async () => {
    const { fetchExchangeRate } = setupController({
      interval: 100,
      conversionRate: 1,
    });

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(fetchExchangeRate).not.toHaveBeenCalled();
  });

  it('should poll and update rate in the right interval', async () => {
    const { controller, fetchExchangeRate } = setupController({
      interval: 100,
      conversionRate: 1,
    });

    await controller.start();

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 1));
    expect(fetchExchangeRate).toHaveBeenCalledTimes(1);
    expect(fetchExchangeRate).not.toHaveBeenCalledTimes(2);
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(fetchExchangeRate).toHaveBeenCalledTimes(2);
  });

  it('should not poll after being stopped', async () => {
    const { controller, fetchExchangeRate } = setupController({
      interval: 100,
      conversionRate: 1,
    });

    await controller.start();
    controller.stop();

    // called once upon initial start
    expect(fetchExchangeRate).toHaveBeenCalled();
    expect(fetchExchangeRate).not.toHaveBeenCalledTimes(2);

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(fetchExchangeRate).not.toHaveBeenCalledTimes(2);
  });

  it('should poll correctly after being started, stopped, and started again', async () => {
    const { controller, fetchExchangeRate } = setupController({
      interval: 100,
      conversionRate: 1,
    });
    await controller.start();
    controller.stop();

    // called once upon initial start
    expect(fetchExchangeRate).toHaveBeenCalled();
    expect(fetchExchangeRate).not.toHaveBeenCalledTimes(2);

    controller.start();

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 1));
    expect(fetchExchangeRate).toHaveBeenCalledTimes(2);
    expect(fetchExchangeRate).not.toHaveBeenCalledTimes(3);
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(fetchExchangeRate).toHaveBeenCalledTimes(3);
  });

  it('should update exchange rate', async () => {
    const { controller } = setupController({
      conversionRate: 10,
    });
    expect(controller.state.conversionRate).toStrictEqual(0);
    await controller.updateExchangeRate();
    expect(controller.state.conversionRate).toStrictEqual(10);
  });

  it('should update exchange rate to ETH conversion rate when native currency is testnet ETH', async () => {
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

    const { controller } = setupController({ fetchExchangeRateStub });

    await controller.setNativeCurrency('DAI');
    await controller.updateExchangeRate();
    expect(controller.state.conversionRate).toStrictEqual(1);
    await controller.updateExchangeRate();
    await controller.setNativeCurrency(TESTNET_TICKER_SYMBOLS.RINKEBY);
    expect(controller.state.conversionRate).toStrictEqual(10);
  });

  it('should update conversion rate when current currency is updated', async () => {
    const { controller } = setupController({
      conversionRate: 10,
    });
    expect(controller.state.conversionRate).toStrictEqual(0);
    await controller.setCurrentCurrency('CAD');
    expect(controller.state.conversionRate).toStrictEqual(10);
  });

  it('should update conversion rate when native currency is updated', async () => {
    const { controller } = setupController({
      conversionRate: 10,
    });
    expect(controller.state.conversionRate).toStrictEqual(0);
    await controller.setNativeCurrency('xDAI');
    expect(controller.state.conversionRate).toStrictEqual(10);
  });

  it('should add usd rate to state when includeUsdRate is configured true', async () => {
    const { controller } = setupController({
      includeUsdRate: true,
      state: { currentCurrency: 'xyz' },
      usdConversionRate: 2,
      conversionRate: 1,
    });

    expect(controller.state).toMatchObject({
      conversionRate: 0,
      usdConversionRate: null,
      currentCurrency: 'xyz',
      nativeCurrency: 'ETH',
    });

    await controller.updateExchangeRate();

    expect(controller.state).toMatchObject({
      conversionRate: 1,
      usdConversionRate: 2,
      currentCurrency: 'xyz',
      nativeCurrency: 'ETH',
    });
  });

  it('should default to fetching exchange rate from crypto-compare if no fetchExchangeRate function is passed to the controller constructor', async () => {
    const cryptoCompareHost = 'https://min-api.cryptocompare.com';
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=XYZ')
      .reply(200, { XYZ: 2000.42 })
      .persist();

    const { controller } = setupController({
      state: { currentCurrency: 'xyz' },
    });

    await controller.updateExchangeRate();

    expect(controller.state.conversionRate).toStrictEqual(2000.42);
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

    const { controller } = setupController({
      state: { currentCurrency: 'xyz' },
    });

    await expect(controller.updateExchangeRate()).rejects.toThrow(
      'this method has been deprecated',
    );
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

    const { controller } = setupController({
      state: { currentCurrency: 'xyz' },
    });

    await controller.updateExchangeRate();
    expect(controller.state.conversionRate).toBeNull();
  });

  it('should update conversionRates in state to null if either currentCurrency or nativeCurrency is null', async () => {
    jest.spyOn(global.Date, 'now').mockImplementation(() => getStubbedDate());
    const cryptoCompareHost = 'https://min-api.cryptocompare.com';
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=XYZ')
      .reply(200, { XYZ: 2000.42 })
      .persist();

    const { controller } = setupController({
      state: { currentCurrency: '', nativeCurrency: 'BNB' },
    });

    await controller.updateExchangeRate();

    expect(controller.state).toStrictEqual({
      conversionDate: null,
      conversionRate: null,
      currentCurrency: '',
      nativeCurrency: 'BNB',
      pendingCurrentCurrency: null,
      pendingNativeCurrency: null,
      usdConversionRate: null,
    });
  });
});
