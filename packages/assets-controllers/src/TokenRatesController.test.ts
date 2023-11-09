import { NetworksTicker, toHex } from '@metamask/controller-utils';
import nock from 'nock';
import { useFakeTimers } from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import { TokenRatesController } from './TokenRatesController';

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const COINGECKO_ETH_PATH = '/simple/token_price/ethereum';
const COINGECKO_MATIC_PATH = '/simple/token_price/polygon-pos-network';
const COINGECKO_ASSETS_PATH = '/asset_platforms';
const COINGECKO_SUPPORTED_CURRENCIES = '/simple/supported_vs_currencies';
const ADDRESS = '0x01';

const defaultSelectedAddress = '0x0000000000000000000000000000000000000001';

describe('TokenRatesController', () => {
  beforeEach(() => {
    nock(COINGECKO_API)
      .get(COINGECKO_SUPPORTED_CURRENCIES)
      .reply(200, ['eth', 'usd', 'dai'])
      .get(COINGECKO_ASSETS_PATH)
      .reply(200, [
        {
          id: 'binance-smart-chain',
          chain_identifier: 56,
          name: 'Binance Smart Chain',
          shortname: 'BSC',
        },
        {
          id: 'ethereum',
          chain_identifier: 1,
          name: 'Ethereum',
          shortname: '',
        },
        {
          id: 'polygon-pos-network',
          chain_identifier: 137,
          name: 'Polygon',
          shortname: 'MATIC',
        },
      ]);

    nock('https://min-api.cryptocompare.com')
      .get('/data/price?fsym=ETH&tsyms=ETH')
      .reply(200, { ETH: 1 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = useFakeTimers({ now: Date.now() });
    });

    afterEach(() => {
      clock.restore();
    });

    it('should set default state', () => {
      const controller = new TokenRatesController({
        getNetworkClientById: jest.fn(),
        chainId: '0x1',
        ticker: NetworksTicker.mainnet,
        selectedAddress: defaultSelectedAddress,
        onPreferencesStateChange: jest.fn(),
        onTokensStateChange: jest.fn(),
        onNetworkStateChange: jest.fn(),
      });
      expect(controller.state).toStrictEqual({
        contractExchangeRates: {},
        contractExchangeRatesByChainId: {},
      });
    });

    it('should initialize with the default config', () => {
      const controller = new TokenRatesController({
        getNetworkClientById: jest.fn(),
        chainId: '0x1',
        ticker: NetworksTicker.mainnet,
        selectedAddress: defaultSelectedAddress,
        onPreferencesStateChange: jest.fn(),
        onTokensStateChange: jest.fn(),
        onNetworkStateChange: jest.fn(),
      });
      expect(controller.config).toStrictEqual({
        interval: 180000,
        threshold: 21600000,
        allDetectedTokens: {},
        allTokens: {},
        disabled: false,
        nativeCurrency: NetworksTicker.mainnet,
        chainId: '0x1',
        selectedAddress: defaultSelectedAddress,
      });
    });

    it('should not poll by default', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch');
      new TokenRatesController({
        interval: 100,
        getNetworkClientById: jest.fn(),
        chainId: '0x1',
        ticker: NetworksTicker.mainnet,
        selectedAddress: defaultSelectedAddress,
        onPreferencesStateChange: jest.fn(),
        onTokensStateChange: jest.fn(),
        onNetworkStateChange: jest.fn(),
      });

      await advanceTime({ clock, duration: 500 });

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('TokensController::stateChange', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = useFakeTimers({ now: Date.now() });
    });

    afterEach(() => {
      clock.restore();
    });

    describe('when polling is active', () => {
      it('should update exchange rates when tokens change', async () => {
        let tokenStateChangeListener: (state: any) => Promise<void>;
        const onTokensStateChange = jest.fn().mockImplementation((listener) => {
          tokenStateChangeListener = listener;
        });
        const controller = new TokenRatesController(
          {
            interval: 100,
            getNetworkClientById: jest.fn(),
            chainId: '0x1',
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: jest.fn(),
            onTokensStateChange,
            onNetworkStateChange: jest.fn(),
          },
          {
            allTokens: {
              '0x1': {
                [defaultSelectedAddress]: [
                  { address: 'bar', decimals: 0, symbol: '', aggregators: [] },
                ],
              },
            },
          },
        );
        await controller.start();
        const updateExchangeRatesSpy = jest
          .spyOn(controller, 'updateExchangeRates')
          .mockResolvedValue();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await tokenStateChangeListener!({
          allDetectedTokens: {},
          allTokens: {
            '0x1': {
              [defaultSelectedAddress]: [
                { address: 'foo', decimals: 0, symbol: '', aggregators: [] },
              ],
            },
          },
        });

        expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
      });

      it('should not update exchange rates when token state changes without "all tokens" or "all detected tokens" changing', async () => {
        let tokenStateChangeListener: (state: any) => Promise<void>;
        const onTokensStateChange = jest.fn().mockImplementation((listener) => {
          tokenStateChangeListener = listener;
        });

        const allTokens = {
          '0x1': {
            [defaultSelectedAddress]: [
              { address: 'foo', decimals: 0, symbol: '', aggregators: [] },
            ],
          },
        };
        const allDetectedTokens = {};

        const controller = new TokenRatesController(
          {
            interval: 100,
            getNetworkClientById: jest.fn(),
            chainId: '0x1',
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: jest.fn(),
            onTokensStateChange,
            onNetworkStateChange: jest.fn(),
          },
          {
            allDetectedTokens,
            allTokens,
          },
        );

        await controller.start();
        const updateExchangeRatesSpy = jest
          .spyOn(controller, 'updateExchangeRates')
          .mockResolvedValue();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await tokenStateChangeListener!({
          allDetectedTokens,
          allTokens,
          tokens: [
            { address: 'bar', decimals: 0, symbol: '', aggregators: [] },
          ],
        });

        expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
      });
    });

    describe('when polling is inactive', () => {
      it('should not update exchange rates when tokens change', async () => {
        let tokenStateChangeListener: (state: any) => Promise<void>;
        const onTokensStateChange = jest.fn().mockImplementation((listener) => {
          tokenStateChangeListener = listener;
        });
        const controller = new TokenRatesController(
          {
            interval: 100,
            getNetworkClientById: jest.fn(),
            chainId: '0x1',
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: jest.fn(),
            onTokensStateChange,
            onNetworkStateChange: jest.fn(),
          },
          {
            allTokens: {
              '0x1': {
                [defaultSelectedAddress]: [
                  { address: 'bar', decimals: 0, symbol: '', aggregators: [] },
                ],
              },
            },
          },
        );
        const updateExchangeRatesSpy = jest
          .spyOn(controller, 'updateExchangeRates')
          .mockResolvedValue();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await tokenStateChangeListener!({
          allDetectedTokens: {},
          allTokens: {
            '0x1': {
              [defaultSelectedAddress]: [
                { address: 'foo', decimals: 0, symbol: '', aggregators: [] },
              ],
            },
          },
        });

        expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
      });

      it('should not update exchange rates when detectedtokens change', async () => {
        let tokenStateChangeListener: (state: any) => Promise<void>;
        const onTokensStateChange = jest.fn().mockImplementation((listener) => {
          tokenStateChangeListener = listener;
        });
        const controller = new TokenRatesController(
          {
            interval: 100,
            getNetworkClientById: jest.fn(),
            chainId: '0x1',
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: jest.fn(),
            onTokensStateChange,
            onNetworkStateChange: jest.fn(),
          },
          {
            allDetectedTokens: {
              [toHex(1)]: {
                [defaultSelectedAddress]: [
                  { address: 'bar', decimals: 0, symbol: '', aggregators: [] },
                ],
              },
            },
            allTokens: {},
          },
        );
        const updateExchangeRatesSpy = jest
          .spyOn(controller, 'updateExchangeRates')
          .mockResolvedValue();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await tokenStateChangeListener!({
          allDetectedTokens: {
            [toHex(1)]: {
              [defaultSelectedAddress]: [
                { address: 'foo', decimals: 0, symbol: '', aggregators: [] },
              ],
            },
          },
          allTokens: {},
        });

        expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('NetworkController::stateChange', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = useFakeTimers({ now: Date.now() });
    });

    afterEach(() => {
      clock.restore();
    });

    describe('when polling is active', () => {
      it('should update exchange rates when ticker changes', async () => {
        let networkStateChangeListener: (state: any) => Promise<void>;
        const onNetworkStateChange = jest
          .fn()
          .mockImplementation((listener) => {
            networkStateChangeListener = listener;
          });
        const controller = new TokenRatesController({
          interval: 100,
          getNetworkClientById: jest.fn(),
          chainId: toHex(1337),
          ticker: 'TEST',
          selectedAddress: defaultSelectedAddress,
          onPreferencesStateChange: jest.fn(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange,
        });
        await controller.start();
        const updateExchangeRatesSpy = jest
          .spyOn(controller, 'updateExchangeRates')
          .mockResolvedValue();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await networkStateChangeListener!({
          providerConfig: { chainId: toHex(1337), ticker: 'NEW' },
        });

        expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
      });

      it('should update exchange rates when chain ID changes', async () => {
        let networkStateChangeListener: (state: any) => Promise<void>;
        const onNetworkStateChange = jest
          .fn()
          .mockImplementation((listener) => {
            networkStateChangeListener = listener;
          });
        const controller = new TokenRatesController({
          interval: 100,
          getNetworkClientById: jest.fn(),
          chainId: toHex(1337),
          ticker: 'TEST',
          selectedAddress: defaultSelectedAddress,
          onPreferencesStateChange: jest.fn(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange,
        });
        await controller.start();
        const updateExchangeRatesSpy = jest
          .spyOn(controller, 'updateExchangeRates')
          .mockResolvedValue();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await networkStateChangeListener!({
          providerConfig: { chainId: toHex(1338), ticker: 'TEST' },
        });

        expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
      });

      it('should clear contractExchangeRates state when ticker changes', async () => {
        let networkStateChangeListener: (state: any) => Promise<void>;
        const onNetworkStateChange = jest
          .fn()
          .mockImplementation((listener) => {
            networkStateChangeListener = listener;
          });
        const controller = new TokenRatesController({
          interval: 100,
          getNetworkClientById: jest.fn(),
          chainId: toHex(1337),
          ticker: 'TEST',
          selectedAddress: defaultSelectedAddress,
          onPreferencesStateChange: jest.fn(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange,
        });
        await controller.start();
        jest.spyOn(controller, 'updateExchangeRates').mockResolvedValue();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await networkStateChangeListener!({
          providerConfig: { chainId: toHex(1337), ticker: 'NEW' },
        });

        expect(controller.state.contractExchangeRates).toStrictEqual({});
      });

      it('should clear contractExchangeRates state when chain ID changes', async () => {
        let networkStateChangeListener: (state: any) => Promise<void>;
        const onNetworkStateChange = jest
          .fn()
          .mockImplementation((listener) => {
            networkStateChangeListener = listener;
          });
        const controller = new TokenRatesController({
          interval: 100,
          getNetworkClientById: jest.fn(),
          chainId: toHex(1337),
          ticker: 'TEST',
          selectedAddress: defaultSelectedAddress,
          onPreferencesStateChange: jest.fn(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange,
        });
        await controller.start();
        jest.spyOn(controller, 'updateExchangeRates').mockResolvedValue();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await networkStateChangeListener!({
          providerConfig: { chainId: toHex(1338), ticker: 'TEST' },
        });

        expect(controller.state.contractExchangeRates).toStrictEqual({});
      });

      it('should not update exchange rates when network state changes without a ticker/chain id change', async () => {
        let networkStateChangeListener: (state: any) => Promise<void>;
        const onNetworkStateChange = jest
          .fn()
          .mockImplementation((listener) => {
            networkStateChangeListener = listener;
          });
        const controller = new TokenRatesController({
          interval: 100,
          getNetworkClientById: jest.fn(),
          chainId: toHex(1337),
          ticker: 'TEST',
          selectedAddress: defaultSelectedAddress,
          onPreferencesStateChange: jest.fn(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange,
        });
        await controller.start();
        const updateExchangeRatesSpy = jest
          .spyOn(controller, 'updateExchangeRates')
          .mockResolvedValue();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await networkStateChangeListener!({
          providerConfig: { chainId: toHex(1337), ticker: 'TEST' },
        });

        expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
      });
    });

    describe('when polling is inactive', () => {
      it('should not update exchange rates when ticker changes', async () => {
        let networkStateChangeListener: (state: any) => Promise<void>;
        const onNetworkStateChange = jest
          .fn()
          .mockImplementation((listener) => {
            networkStateChangeListener = listener;
          });
        const controller = new TokenRatesController({
          interval: 100,
          getNetworkClientById: jest.fn(),
          chainId: toHex(1337),
          ticker: 'TEST',
          selectedAddress: defaultSelectedAddress,
          onPreferencesStateChange: jest.fn(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange,
        });
        const updateExchangeRatesSpy = jest
          .spyOn(controller, 'updateExchangeRates')
          .mockResolvedValue();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await networkStateChangeListener!({
          providerConfig: { chainId: toHex(1337), ticker: 'NEW' },
        });

        expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
      });

      it('should not update exchange rates when chain ID changes', async () => {
        let networkStateChangeListener: (state: any) => Promise<void>;
        const onNetworkStateChange = jest
          .fn()
          .mockImplementation((listener) => {
            networkStateChangeListener = listener;
          });
        const controller = new TokenRatesController({
          interval: 100,
          getNetworkClientById: jest.fn(),
          chainId: toHex(1337),
          ticker: 'TEST',
          selectedAddress: defaultSelectedAddress,
          onPreferencesStateChange: jest.fn(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange,
        });
        const updateExchangeRatesSpy = jest
          .spyOn(controller, 'updateExchangeRates')
          .mockResolvedValue();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await networkStateChangeListener!({
          providerConfig: { chainId: toHex(1338), ticker: 'TEST' },
        });

        expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
      });

      it('should clear contractExchangeRates state when ticker changes', async () => {
        let networkStateChangeListener: (state: any) => Promise<void>;
        const onNetworkStateChange = jest
          .fn()
          .mockImplementation((listener) => {
            networkStateChangeListener = listener;
          });
        const controller = new TokenRatesController({
          interval: 100,
          getNetworkClientById: jest.fn(),
          chainId: toHex(1337),
          ticker: 'TEST',
          selectedAddress: defaultSelectedAddress,
          onPreferencesStateChange: jest.fn(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange,
        });
        jest.spyOn(controller, 'updateExchangeRates').mockResolvedValue();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await networkStateChangeListener!({
          providerConfig: { chainId: toHex(1337), ticker: 'NEW' },
        });

        expect(controller.state.contractExchangeRates).toStrictEqual({});
      });

      it('should clear contractExchangeRates state when chain ID changes', async () => {
        let networkStateChangeListener: (state: any) => Promise<void>;
        const onNetworkStateChange = jest
          .fn()
          .mockImplementation((listener) => {
            networkStateChangeListener = listener;
          });
        const controller = new TokenRatesController({
          interval: 100,
          getNetworkClientById: jest.fn(),
          chainId: toHex(1337),
          ticker: 'TEST',
          selectedAddress: defaultSelectedAddress,
          onPreferencesStateChange: jest.fn(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange,
        });
        jest.spyOn(controller, 'updateExchangeRates').mockResolvedValue();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await networkStateChangeListener!({
          providerConfig: { chainId: toHex(1338), ticker: 'TEST' },
        });

        expect(controller.state.contractExchangeRates).toStrictEqual({});
      });
    });
  });

  describe('PreferencesController::stateChange', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = useFakeTimers({ now: Date.now() });
    });

    afterEach(() => {
      clock.restore();
    });

    describe('when polling is active', () => {
      it('should update exchange rates when selected address changes', async () => {
        let preferencesStateChangeListener: (state: any) => Promise<void>;
        const onPreferencesStateChange = jest
          .fn()
          .mockImplementation((listener) => {
            preferencesStateChangeListener = listener;
          });
        const alternateSelectedAddress =
          '0x0000000000000000000000000000000000000002';
        const controller = new TokenRatesController(
          {
            interval: 100,
            getNetworkClientById: jest.fn(),
            chainId: '0x1',
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange,
            onTokensStateChange: jest.fn(),
            onNetworkStateChange: jest.fn(),
          },
          {
            allTokens: {
              '0x1': {
                [alternateSelectedAddress]: [
                  { address: '0x02', decimals: 0, symbol: '', aggregators: [] },
                  { address: '0x03', decimals: 0, symbol: '', aggregators: [] },
                ],
              },
            },
          },
        );
        await controller.start();
        const updateExchangeRatesSpy = jest
          .spyOn(controller, 'updateExchangeRates')
          .mockResolvedValue();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await preferencesStateChangeListener!({
          selectedAddress: alternateSelectedAddress,
        });

        expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
      });

      it('should not update exchange rates when preferences state changes without selected address changing', async () => {
        let preferencesStateChangeListener: (state: any) => Promise<void>;
        const onPreferencesStateChange = jest
          .fn()
          .mockImplementation((listener) => {
            preferencesStateChangeListener = listener;
          });
        const controller = new TokenRatesController(
          {
            interval: 100,
            getNetworkClientById: jest.fn(),
            chainId: '0x1',
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange,
            onTokensStateChange: jest.fn(),
            onNetworkStateChange: jest.fn(),
          },
          {
            allTokens: {
              '0x1': {
                [defaultSelectedAddress]: [
                  { address: '0x02', decimals: 0, symbol: '', aggregators: [] },
                  { address: '0x03', decimals: 0, symbol: '', aggregators: [] },
                ],
              },
            },
          },
        );
        await controller.start();
        const updateExchangeRatesSpy = jest
          .spyOn(controller, 'updateExchangeRates')
          .mockResolvedValue();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await preferencesStateChangeListener!({
          selectedAddress: defaultSelectedAddress,
          exampleConfig: 'exampleValue',
        });

        expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
      });
    });

    describe('when polling is inactive', () => {
      it('should not update exchange rates when selected address changes', async () => {
        let preferencesStateChangeListener: (state: any) => Promise<void>;
        const onPreferencesStateChange = jest
          .fn()
          .mockImplementation((listener) => {
            preferencesStateChangeListener = listener;
          });
        const alternateSelectedAddress =
          '0x0000000000000000000000000000000000000002';
        const controller = new TokenRatesController(
          {
            interval: 100,
            getNetworkClientById: jest.fn(),
            chainId: '0x1',
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange,
            onTokensStateChange: jest.fn(),
            onNetworkStateChange: jest.fn(),
          },
          {
            allTokens: {
              '0x1': {
                [alternateSelectedAddress]: [
                  { address: '0x02', decimals: 0, symbol: '', aggregators: [] },
                  { address: '0x03', decimals: 0, symbol: '', aggregators: [] },
                ],
              },
            },
          },
        );
        const updateExchangeRatesSpy = jest
          .spyOn(controller, 'updateExchangeRates')
          .mockResolvedValue();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await preferencesStateChangeListener!({
          selectedAddress: alternateSelectedAddress,
        });

        expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('legacy polling', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = useFakeTimers({ now: Date.now() });
    });

    afterEach(() => {
      clock.restore();
    });

    describe('start', () => {
      it('should poll and update rate in the right interval', async () => {
        const fetchSpy = jest
          .spyOn(globalThis, 'fetch')
          .mockImplementation(() => {
            throw new Error('Network error');
          });
        const interval = 100;
        const controller = new TokenRatesController(
          {
            interval,
            getNetworkClientById: jest.fn(),
            chainId: '0x1',
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: jest.fn(),
            onTokensStateChange: jest.fn(),
            onNetworkStateChange: jest.fn(),
          },
          {
            allTokens: {
              '0x1': {
                [defaultSelectedAddress]: [
                  { address: 'bar', decimals: 0, symbol: '', aggregators: [] },
                ],
              },
            },
          },
        );

        await controller.start();
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        await advanceTime({ clock, duration: interval });
        expect(fetchSpy).toHaveBeenCalledTimes(2);

        await advanceTime({ clock, duration: interval });
        expect(fetchSpy).toHaveBeenCalledTimes(3);
      });
    });

    describe('stop', () => {
      it('should stop polling', async () => {
        const fetchSpy = jest
          .spyOn(globalThis, 'fetch')
          .mockImplementation(() => {
            throw new Error('Network error');
          });
        const interval = 100;
        const controller = new TokenRatesController(
          {
            interval,
            getNetworkClientById: jest.fn(),
            chainId: '0x1',
            ticker: NetworksTicker.mainnet,
            selectedAddress: defaultSelectedAddress,
            onPreferencesStateChange: jest.fn(),
            onTokensStateChange: jest.fn(),
            onNetworkStateChange: jest.fn(),
          },
          {
            allTokens: {
              '0x1': {
                [defaultSelectedAddress]: [
                  { address: 'bar', decimals: 0, symbol: '', aggregators: [] },
                ],
              },
            },
          },
        );

        await controller.start();
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        controller.stop();

        await advanceTime({ clock, duration: interval });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('polling by networkClientId', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = useFakeTimers({ now: Date.now() });
    });

    afterEach(() => {
      clock.restore();
    });

    it('should poll on the right interval', async () => {
      const interval = 100;
      const controller = new TokenRatesController({
        interval,
        chainId: '0x2',
        ticker: 'ticker',
        selectedAddress: '0xdeadbeef',
        onPreferencesStateChange: jest.fn(),
        onTokensStateChange: jest.fn(),
        onNetworkStateChange: jest.fn(),
        getNetworkClientById: jest.fn().mockReturnValue({
          configuration: {
            chainId: '0x1',
            ticker: NetworksTicker.mainnet,
          },
        }),
      });
      const updateExchangeRatesByChainIdSpy = jest
        .spyOn(controller, 'updateExchangeRatesByChainId')
        .mockResolvedValue();

      controller.startPollingByNetworkClientId('mainnet', {
        tokenAddresses: ['0x0'],
      });
      await advanceTime({ clock, duration: 0 });
      expect(updateExchangeRatesByChainIdSpy).toHaveBeenCalledTimes(1);

      await advanceTime({ clock, duration: interval });
      expect(updateExchangeRatesByChainIdSpy).toHaveBeenCalledTimes(2);

      await advanceTime({ clock, duration: interval });
      expect(updateExchangeRatesByChainIdSpy).toHaveBeenCalledTimes(3);
    });

    it('should update state on poll', async () => {
      const interval = 100;
      const controller = new TokenRatesController({
        interval,
        chainId: '0x2',
        ticker: 'ticker',
        selectedAddress: '0xdeadbeef',
        onPreferencesStateChange: jest.fn(),
        onTokensStateChange: jest.fn(),
        onNetworkStateChange: jest.fn(),
        getNetworkClientById: jest.fn().mockReturnValue({
          configuration: {
            chainId: '0x1',
            ticker: NetworksTicker.mainnet,
          },
        }),
      });
      jest.spyOn(controller, 'getChainSlug').mockResolvedValue('ethereum');
      jest.spyOn(controller, 'fetchAndMapExchangeRates').mockResolvedValue({
        '0x02': 0.001,
        '0x03': 0.002,
      });

      controller.startPollingByNetworkClientId('mainnet', {
        tokenAddresses: ['0x02', '0x03'],
      });
      await advanceTime({ clock, duration: 0 });

      expect(controller.state.contractExchangeRatesByChainId).toStrictEqual({
        '0x1': {
          ETH: {
            '0x02': 0.001,
            '0x03': 0.002,
          },
        },
      });
    });

    it('should stop polling', async () => {
      const interval = 100;
      const controller = new TokenRatesController({
        interval,
        chainId: '0x2',
        ticker: 'ticker',
        selectedAddress: '0xdeadbeef',
        onPreferencesStateChange: jest.fn(),
        onTokensStateChange: jest.fn(),
        onNetworkStateChange: jest.fn(),
        getNetworkClientById: jest.fn().mockReturnValue({
          configuration: {
            chainId: '0x1',
            ticker: NetworksTicker.mainnet,
          },
        }),
      });
      const updateExchangeRatesByChainIdSpy = jest
        .spyOn(controller, 'updateExchangeRatesByChainId')
        .mockResolvedValue();

      const pollingToken = controller.startPollingByNetworkClientId('mainnet', {
        tokenAddresses: ['0x0'],
      });
      await advanceTime({ clock, duration: 0 });
      expect(updateExchangeRatesByChainIdSpy).toHaveBeenCalledTimes(1);

      controller.stopPollingByPollingToken(pollingToken);

      await advanceTime({ clock, duration: interval });
      expect(updateExchangeRatesByChainIdSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateExchangeRates', () => {
    it('should not update exchange rates if legacy polling is disabled', async () => {
      const controller = new TokenRatesController({
        chainId: '0x1',
        ticker: NetworksTicker.mainnet,
        selectedAddress: defaultSelectedAddress,
        onPreferencesStateChange: jest.fn(),
        onTokensStateChange: jest.fn(),
        onNetworkStateChange: jest.fn(),
        getNetworkClientById: jest.fn(),
      });
      controller.disabled = true;

      const updateExchangeRatesByChainIdSpy = jest
        .spyOn(controller, 'updateExchangeRatesByChainId')
        .mockResolvedValue();

      await controller.updateExchangeRates();
      expect(updateExchangeRatesByChainIdSpy).not.toHaveBeenCalled();
    });

    it('should update legacy state after updateExchangeRatesByChainId', async () => {
      const controller = new TokenRatesController(
        {
          chainId: '0x1',
          ticker: NetworksTicker.mainnet,
          selectedAddress: defaultSelectedAddress,
          onPreferencesStateChange: jest.fn(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange: jest.fn(),
          getNetworkClientById: jest.fn(),
        },
        {
          allTokens: {
            '0x1': {
              [defaultSelectedAddress]: [
                {
                  address: '0x123',
                  decimals: 18,
                  symbol: 'DAI',
                  aggregators: [],
                },
                { address: ADDRESS, decimals: 0, symbol: '', aggregators: [] },
              ],
            },
          },
        },
      );

      const updateExchangeRatesByChainIdSpy = jest
        .spyOn(controller, 'updateExchangeRatesByChainId')
        .mockResolvedValue();

      // Setting mock state as if updateExchangeRatesByChainId updated it
      controller.state.contractExchangeRatesByChainId = {
        '0x1': {
          [NetworksTicker.mainnet]: {
            '0x123': 123,
            '0x01': 100,
          },
        },
      };

      await controller.updateExchangeRates();

      expect(updateExchangeRatesByChainIdSpy).toHaveBeenCalledWith({
        chainId: '0x1',
        nativeCurrency: NetworksTicker.mainnet,
        tokenAddresses: ['0x123', ADDRESS],
      });

      expect(controller.state.contractExchangeRates).toStrictEqual({
        '0x123': 123,
        '0x01': 100,
      });
    });
  });

  describe('updateExchangeRatesByChainId', () => {
    it('should not update state if no tokenAddresses are provided', async () => {
      const controller = new TokenRatesController({
        interval: 100,
        chainId: '0x2',
        ticker: 'ticker',
        selectedAddress: '0xdeadbeef',
        onPreferencesStateChange: jest.fn(),
        onTokensStateChange: jest.fn(),
        onNetworkStateChange: jest.fn(),
        getNetworkClientById: jest.fn(),
      });

      expect(controller.state.contractExchangeRates).toStrictEqual({});
      await controller.updateExchangeRatesByChainId({
        chainId: '0x1',
        nativeCurrency: 'ETH',
        tokenAddresses: [],
      });
      expect(controller.state.contractExchangeRatesByChainId).toStrictEqual({});
    });

    it('should update all rates', async () => {
      const tokenAddress = '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359';
      nock(COINGECKO_API)
        .get(
          `${COINGECKO_ETH_PATH}?contract_addresses=${tokenAddress}&vs_currencies=eth`,
        )
        .reply(200, {
          '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359': { eth: 0.00561045 },
        });
      const controller = new TokenRatesController({
        interval: 100,
        chainId: '0x2',
        ticker: 'ticker',
        selectedAddress: '0xdeadbeef',
        onPreferencesStateChange: jest.fn(),
        onTokensStateChange: jest.fn(),
        onNetworkStateChange: jest.fn(),
        getNetworkClientById: jest.fn(),
      });

      expect(controller.state.contractExchangeRates).toStrictEqual({});
      await controller.updateExchangeRatesByChainId({
        chainId: '0x1',
        nativeCurrency: 'ETH',
        tokenAddresses: [tokenAddress],
      });
      expect(
        Object.keys(controller.state.contractExchangeRatesByChainId['0x1'].ETH),
      ).toContain(tokenAddress);
      expect(
        controller.state.contractExchangeRatesByChainId['0x1'].ETH[
          tokenAddress
        ],
      ).toBeGreaterThan(0);
    });

    it('should handle balance not found in API', async () => {
      const controller = new TokenRatesController({
        chainId: '0x2',
        ticker: 'ticker',
        selectedAddress: '0xdeadbeef',
        onPreferencesStateChange: jest.fn(),
        onTokensStateChange: jest.fn(),
        onNetworkStateChange: jest.fn(),
        getNetworkClientById: jest.fn(),
      });
      expect(controller.state.contractExchangeRates).toStrictEqual({});
      jest.spyOn(controller, 'fetchExchangeRate').mockRejectedValue({
        error: 'Not Found',
        message: 'Not Found',
      });

      const result = controller.updateExchangeRatesByChainId({
        chainId: '0x1',
        nativeCurrency: 'ETH',
        tokenAddresses: ['0x0'],
      });

      await expect(result).rejects.not.toThrow();
    });

    it('should update exchange rates when native currency is not supported by coingecko', async () => {
      nock(COINGECKO_API)
        .get(`${COINGECKO_MATIC_PATH}`)
        .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
        .reply(200, {
          '0x02': {
            eth: 0.001, // token value in terms of ETH
          },
          '0x03': {
            eth: 0.002,
          },
        });

      nock('https://min-api.cryptocompare.com')
        .get('/data/price?fsym=ETH&tsyms=MATIC')
        .reply(200, { MATIC: 0.5 }); // .5 eth to 1 matic

      const controller = new TokenRatesController({
        chainId: '0x2',
        ticker: 'ticker',
        selectedAddress: '0xdeadbeef',
        onPreferencesStateChange: jest.fn(),
        onTokensStateChange: jest.fn(),
        onNetworkStateChange: jest.fn(),
        getNetworkClientById: jest.fn(),
      });

      await controller.updateExchangeRatesByChainId({
        chainId: toHex(137),
        nativeCurrency: 'MATIC',
        tokenAddresses: ['0x02', '0x03'],
      });

      expect(controller.state.contractExchangeRatesByChainId).toStrictEqual({
        [toHex(137)]: {
          MATIC: {
            '0x02': 0.0005, // token value in terms of matic = (token value in eth) * (eth value in matic) = .001 * .5
            '0x03': 0.001,
          },
        },
      });
    });

    it('should update exchange rates with undefined when chain is not supported by coingecko', async () => {
      const controller = new TokenRatesController({
        chainId: '0x2',
        ticker: 'ticker',
        selectedAddress: '0xdeadbeef',
        onPreferencesStateChange: jest.fn(),
        onTokensStateChange: jest.fn(),
        onNetworkStateChange: jest.fn(),
        getNetworkClientById: jest.fn(),
      });
      jest.spyOn(controller, 'getChainSlug').mockResolvedValue('');

      await controller.updateExchangeRatesByChainId({
        chainId: toHex(137),
        nativeCurrency: 'MATIC',
        tokenAddresses: ['0x02', '0x03'],
      });

      expect(controller.state.contractExchangeRatesByChainId).toStrictEqual({
        [toHex(137)]: {
          MATIC: {
            '0x02': undefined,
            '0x03': undefined,
          },
        },
      });
    });
  });

  describe('getChainSlug', () => {
    it('returns the chain slug for the chain id', async () => {
      const controller = new TokenRatesController({
        chainId: '0x2',
        ticker: 'ticker',
        selectedAddress: '0xdeadbeef',
        onPreferencesStateChange: jest.fn(),
        onTokensStateChange: jest.fn(),
        onNetworkStateChange: jest.fn(),
        getNetworkClientById: jest.fn(),
      });

      expect(await controller.getChainSlug('0x1')).toBe('ethereum');
      expect(await controller.getChainSlug(toHex(56))).toBe(
        'binance-smart-chain',
      );
      expect(await controller.getChainSlug(toHex(137))).toBe(
        'polygon-pos-network',
      );
    });

    it('returns null if there is no chain slug for the chain id', async () => {
      const controller = new TokenRatesController({
        chainId: '0x2',
        ticker: 'ticker',
        selectedAddress: '0xdeadbeef',
        onPreferencesStateChange: jest.fn(),
        onTokensStateChange: jest.fn(),
        onNetworkStateChange: jest.fn(),
        getNetworkClientById: jest.fn(),
      });

      expect(await controller.getChainSlug('0x2')).toBeNull();
    });
  });

  describe('fetchAndMapExchangeRates', () => {
    describe('native currency is supported', () => {
      it('returns the exchange rates directly', async () => {
        nock(COINGECKO_API)
          .get(`${COINGECKO_ETH_PATH}`)
          .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
          .reply(200, {
            '0x02': {
              eth: 0.001,
            },
            '0x03': {
              eth: 0.002,
            },
          });

        const controller = new TokenRatesController({
          chainId: '0x2',
          ticker: 'ticker',
          selectedAddress: '0xdeadbeef',
          onPreferencesStateChange: jest.fn(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange: jest.fn(),
          getNetworkClientById: jest.fn(),
        });

        const contractExchangeRates = await controller.fetchAndMapExchangeRates(
          'ETH',
          'ethereum',
          ['0x02', '0x03'],
        );

        expect(contractExchangeRates).toStrictEqual({
          '0x02': 0.001,
          '0x03': 0.002,
        });
      });
    });

    describe('native currency is not supported', () => {
      it('returns the exchange rates using ETH as a fallback currency', async () => {
        nock(COINGECKO_API)
          .get(`${COINGECKO_ETH_PATH}`)
          .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
          .reply(200, {
            '0x02': {
              eth: 0.001,
            },
            '0x03': {
              eth: 0.002,
            },
          });

        nock('https://min-api.cryptocompare.com')
          .get('/data/price?fsym=ETH&tsyms=LOL')
          .reply(200, { LOL: 0.5 });

        const controller = new TokenRatesController({
          chainId: '0x2',
          ticker: 'ticker',
          selectedAddress: '0xdeadbeef',
          onPreferencesStateChange: jest.fn(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange: jest.fn(),
          getNetworkClientById: jest.fn(),
        });

        const contractExchangeRates = await controller.fetchAndMapExchangeRates(
          'LOL',
          'ethereum',
          ['0x02', '0x03'],
        );

        expect(contractExchangeRates).toStrictEqual({
          '0x02': 0.0005,
          '0x03': 0.001,
        });
      });

      it('returns the an empty object when market does not exist for pair', async () => {
        nock(COINGECKO_API)
          .get(`${COINGECKO_ETH_PATH}`)
          .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
          .reply(200, {
            '0x02': {
              eth: 0.001,
            },
            '0x03': {
              eth: 0.002,
            },
          });

        const controller = new TokenRatesController({
          chainId: '0x2',
          ticker: 'ticker',
          selectedAddress: '0xdeadbeef',
          onPreferencesStateChange: jest.fn(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange: jest.fn(),
          getNetworkClientById: jest.fn(),
        });
        jest
          .spyOn(controller, 'fetchExchangeRate')
          .mockRejectedValue(
            new Error('market does not exist for this coin pair'),
          );
        const contractExchangeRates = await controller.fetchAndMapExchangeRates(
          'LOL',
          'ethereum',
          ['0x02', '0x03'],
        );

        expect(contractExchangeRates).toStrictEqual({});
      });
    });
  });
});
