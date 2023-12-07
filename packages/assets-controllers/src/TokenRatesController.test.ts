import { NetworksTicker, toHex } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import nock from 'nock';
import { useFakeTimers } from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import type {
  AbstractTokenPricesService,
  TokenPrice,
  TokenPricesByTokenContractAddress,
} from './token-prices-service/abstract-token-prices-service';
import { TokenRatesController } from './TokenRatesController';

const defaultSelectedAddress = '0x0000000000000000000000000000000000000001';

describe('TokenRatesController', () => {
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
        tokenPricesService: buildMockTokenPricesService(),
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
        tokenPricesService: buildMockTokenPricesService(),
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
        tokenPricesService: buildMockTokenPricesService(),
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
            tokenPricesService: buildMockTokenPricesService(),
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
            tokenPricesService: buildMockTokenPricesService(),
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
            tokenPricesService: buildMockTokenPricesService(),
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
            tokenPricesService: buildMockTokenPricesService(),
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
          tokenPricesService: buildMockTokenPricesService(),
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
          tokenPricesService: buildMockTokenPricesService(),
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
          tokenPricesService: buildMockTokenPricesService(),
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
          tokenPricesService: buildMockTokenPricesService(),
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
          tokenPricesService: buildMockTokenPricesService(),
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
          tokenPricesService: buildMockTokenPricesService(),
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
          tokenPricesService: buildMockTokenPricesService(),
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
          tokenPricesService: buildMockTokenPricesService(),
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
          tokenPricesService: buildMockTokenPricesService(),
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
            tokenPricesService: buildMockTokenPricesService(),
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
            tokenPricesService: buildMockTokenPricesService(),
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
            tokenPricesService: buildMockTokenPricesService(),
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
        const interval = 100;
        const tokenPricesService = buildMockTokenPricesService();
        jest.spyOn(tokenPricesService, 'fetchTokenPrices');
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
            tokenPricesService,
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
        expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);

        await advanceTime({ clock, duration: interval });
        expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(2);

        await advanceTime({ clock, duration: interval });
        expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(3);
      });
    });

    describe('stop', () => {
      it('should stop polling', async () => {
        const interval = 100;
        const tokenPricesService = buildMockTokenPricesService();
        jest.spyOn(tokenPricesService, 'fetchTokenPrices');
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
            tokenPricesService,
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
        expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);

        controller.stop();

        await advanceTime({ clock, duration: interval });
        expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);
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
      const tokenPricesService = buildMockTokenPricesService();
      jest.spyOn(tokenPricesService, 'fetchTokenPrices');
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
        tokenPricesService,
      });

      controller.startPollingByNetworkClientId('mainnet', {
        tokenAddresses: ['0x0'],
      });
      await advanceTime({ clock, duration: 0 });
      expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);

      await advanceTime({ clock, duration: interval });
      expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(2);

      await advanceTime({ clock, duration: interval });
      expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(3);
    });

    describe('updating state on poll', () => {
      describe('when the native currency is supported', () => {
        it('returns the exchange rates directly', async () => {
          const tokenPricesService = buildMockTokenPricesService({
            fetchTokenPrices: fetchTokenPricesWithIncreasingPriceForEachToken,
            validateCurrencySupported(currency: unknown): currency is string {
              return currency === 'ETH';
            },
          });
          const controller = new TokenRatesController({
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
            tokenPricesService,
          });

          controller.startPollingByNetworkClientId('mainnet', {
            tokenAddresses: ['0x02', '0x03'],
          });
          await advanceTime({ clock, duration: 0 });

          expect(controller.state.contractExchangeRatesByChainId).toStrictEqual(
            {
              '0x1': {
                ETH: {
                  '0x02': 0.001,
                  '0x03': 0.002,
                },
              },
            },
          );
          controller.stopAllPolling();
        });
      });

      describe('when the native currency is not supported', () => {
        it('returns the exchange rates using ETH as a fallback currency', async () => {
          nock('https://min-api.cryptocompare.com')
            .get('/data/price?fsym=ETH&tsyms=LOL')
            .reply(200, { LOL: 0.5 });
          const tokenPricesService = buildMockTokenPricesService({
            fetchTokenPrices: fetchTokenPricesWithIncreasingPriceForEachToken,
            validateCurrencySupported(currency: unknown): currency is string {
              return currency !== 'LOL';
            },
          });
          const controller = new TokenRatesController({
            chainId: '0x2',
            ticker: 'ticker',
            selectedAddress: '0xdeadbeef',
            onPreferencesStateChange: jest.fn(),
            onTokensStateChange: jest.fn(),
            onNetworkStateChange: jest.fn(),
            getNetworkClientById: jest.fn().mockReturnValue({
              configuration: {
                chainId: '0x1',
                ticker: 'LOL',
              },
            }),
            tokenPricesService,
          });

          controller.startPollingByNetworkClientId('mainnet', {
            tokenAddresses: ['0x02', '0x03'],
          });
          // flush promises and advance setTimeouts they enqueue 3 times
          // needed because fetch() doesn't resolve immediately, so any
          // downstream promises aren't flushed until the next advanceTime loop
          await advanceTime({ clock, duration: 1, stepSize: 1 / 3 });

          expect(controller.state.contractExchangeRatesByChainId).toStrictEqual(
            {
              '0x1': {
                LOL: {
                  // token price in LOL = (token price in ETH) * (ETH value in LOL)
                  '0x02': 0.0005,
                  '0x03': 0.001,
                },
              },
            },
          );
          controller.stopAllPolling();
        });

        it('returns the an empty object when market does not exist for pair', async () => {
          nock('https://min-api.cryptocompare.com')
            .get('/data/price?fsym=ETH&tsyms=LOL')
            .replyWithError(
              new Error('market does not exist for this coin pair'),
            );

          const tokenPricesService = buildMockTokenPricesService();
          const controller = new TokenRatesController({
            chainId: '0x2',
            ticker: 'ETH',
            selectedAddress: '0xdeadbeef',
            onPreferencesStateChange: jest.fn(),
            onTokensStateChange: jest.fn(),
            onNetworkStateChange: jest.fn(),
            getNetworkClientById: jest.fn().mockReturnValue({
              configuration: {
                chainId: '0x1',
                ticker: 'LOL',
              },
            }),
            tokenPricesService,
          });

          controller.startPollingByNetworkClientId('mainnet', {
            tokenAddresses: ['0x02', '0x03'],
          });
          // flush promises and advance setTimeouts they enqueue 3 times
          // needed because fetch() doesn't resolve immediately, so any
          // downstream promises aren't flushed until the next advanceTime loop
          await advanceTime({ clock, duration: 1, stepSize: 1 / 3 });

          expect(controller.state.contractExchangeRatesByChainId).toStrictEqual(
            {
              '0x1': {
                LOL: {},
              },
            },
          );
          controller.stopAllPolling();
        });
      });
    });

    it('should stop polling', async () => {
      const interval = 100;
      const tokenPricesService = buildMockTokenPricesService();
      jest.spyOn(tokenPricesService, 'fetchTokenPrices');
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
        tokenPricesService,
      });

      const pollingToken = controller.startPollingByNetworkClientId('mainnet', {
        tokenAddresses: ['0x0'],
      });
      await advanceTime({ clock, duration: 0 });
      expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);

      controller.stopPollingByPollingToken(pollingToken);

      await advanceTime({ clock, duration: interval });
      expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateExchangeRates', () => {
    it('should not update exchange rates if legacy polling is disabled', async () => {
      const tokenPricesService = buildMockTokenPricesService();
      jest.spyOn(tokenPricesService, 'fetchTokenPrices');
      const controller = new TokenRatesController(
        {
          chainId: '0x1',
          ticker: NetworksTicker.mainnet,
          selectedAddress: defaultSelectedAddress,
          onPreferencesStateChange: jest.fn(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange: jest.fn(),
          getNetworkClientById: jest.fn(),
          tokenPricesService,
        },
        {
          disabled: true,
        },
      );

      await controller.updateExchangeRates();

      expect(tokenPricesService.fetchTokenPrices).not.toHaveBeenCalled();
    });
  });

  describe('updateExchangeRatesByChainId', () => {
    it('should not update state if no token contract addresses are provided', async () => {
      const controller = new TokenRatesController({
        interval: 100,
        chainId: '0x2',
        ticker: 'ticker',
        selectedAddress: '0xdeadbeef',
        onPreferencesStateChange: jest.fn(),
        onTokensStateChange: jest.fn(),
        onNetworkStateChange: jest.fn(),
        getNetworkClientById: jest.fn(),
        tokenPricesService: buildMockTokenPricesService(),
      });

      expect(controller.state.contractExchangeRates).toStrictEqual({});
      await controller.updateExchangeRatesByChainId({
        chainId: '0x1',
        nativeCurrency: 'ETH',
        tokenContractAddresses: [],
      });
      expect(controller.state.contractExchangeRatesByChainId).toStrictEqual({});
    });

    it('should not update state when disabled', async () => {
      const tokenContractAddress = '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359';
      const controller = new TokenRatesController(
        {
          interval: 100,
          chainId: '0x2',
          ticker: 'ticker',
          selectedAddress: '0xdeadbeef',
          onPreferencesStateChange: jest.fn(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange: jest.fn(),
          getNetworkClientById: jest.fn(),
          tokenPricesService: buildMockTokenPricesService(),
        },
        { disabled: true },
      );
      expect(controller.state.contractExchangeRatesByChainId).toStrictEqual({});

      await controller.updateExchangeRatesByChainId({
        chainId: '0x1',
        nativeCurrency: 'ETH',
        tokenContractAddresses: [tokenContractAddress],
      });

      expect(controller.state.contractExchangeRatesByChainId).toStrictEqual({});
    });

    it('should update exchange rates for the given token addresses to undefined when the given chain ID is not supported by the Price API', async () => {
      const controller = new TokenRatesController(
        {
          chainId: '0x2',
          ticker: 'ticker',
          selectedAddress: '0xdeadbeef',
          onPreferencesStateChange: jest.fn(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange: jest.fn(),
          getNetworkClientById: jest.fn(),
          tokenPricesService: buildMockTokenPricesService({
            validateChainIdSupported(chainId: unknown): chainId is Hex {
              return chainId !== '0x9999999999';
            },
          }),
        },
        {},
        {
          contractExchangeRatesByChainId: {
            '0x9999999999': {
              MATIC: {
                '0x02': 0.01,
                '0x03': 0.02,
                '0x04': 0.03,
              },
            },
          },
        },
      );

      await controller.updateExchangeRatesByChainId({
        chainId: '0x9999999999',
        nativeCurrency: 'MATIC',
        tokenContractAddresses: ['0x02', '0x03'],
      });

      expect(controller.state.contractExchangeRatesByChainId).toStrictEqual({
        '0x9999999999': {
          MATIC: {
            '0x02': undefined,
            '0x03': undefined,
            '0x04': 0.03,
          },
        },
      });
    });

    it('should update exchange rates when native currency is supported by the Price API', async () => {
      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: fetchTokenPricesWithIncreasingPriceForEachToken,
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
        tokenPricesService,
      });

      expect(controller.state.contractExchangeRates).toStrictEqual({});
      await controller.updateExchangeRatesByChainId({
        chainId: '0x1',
        nativeCurrency: 'ETH',
        tokenContractAddresses: ['0xAAA'],
      });
      expect(controller.state.contractExchangeRatesByChainId).toStrictEqual({
        '0x1': {
          ETH: {
            '0xAAA': 0.001,
          },
        },
      });
    });

    it('should update exchange rates when native currency is not supported by the Price API', async () => {
      nock('https://min-api.cryptocompare.com')
        .get('/data/price?fsym=ETH&tsyms=LOL')
        .reply(200, { LOL: 0.5 });
      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: fetchTokenPricesWithIncreasingPriceForEachToken,
        validateCurrencySupported(currency: unknown): currency is string {
          return currency !== 'LOL';
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
        tokenPricesService,
      });

      await controller.updateExchangeRatesByChainId({
        chainId: '0x1',
        nativeCurrency: 'LOL',
        tokenContractAddresses: ['0x02', '0x03'],
      });

      expect(controller.state.contractExchangeRatesByChainId).toStrictEqual({
        '0x1': {
          LOL: {
            // token price in LOL = (token price in ETH) * (ETH value in LOL)
            '0x02': 0.0005,
            '0x03': 0.001,
          },
        },
      });
    });

    it('should update legacy state to match keyed state if chainId matches globally selected chainId', async () => {
      const controller = new TokenRatesController(
        {
          chainId: '0x2',
          ticker: 'ticker',
          selectedAddress: '0xdeadbeef',
          onPreferencesStateChange: jest.fn(),
          onTokensStateChange: jest.fn(),
          onNetworkStateChange: jest.fn(),
          getNetworkClientById: jest.fn(),
          tokenPricesService: buildMockTokenPricesService({
            validateChainIdSupported(chainId: unknown): chainId is Hex {
              return chainId !== '0x2';
            },
          }),
        },
        {},
        {
          contractExchangeRates: {},
          contractExchangeRatesByChainId: {
            '0x2': {
              MATIC: {
                '0x03': 0.01,
                '0x04': 0.02,
              },
            },
          },
        },
      );

      await controller.updateExchangeRatesByChainId({
        chainId: '0x2',
        nativeCurrency: 'MATIC',
        tokenContractAddresses: ['0x03'],
      });

      expect(controller.state.contractExchangeRates).toStrictEqual({
        '0x03': undefined,
        '0x04': 0.02,
      });
    });
  });
});

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
 * A version of the token prices service `fetchTokenPrices` method where the
 * price of each given token is incremented by one.
 *
 * @param args - The arguments to this function.
 * @param args.tokenContractAddresses - The token contract addresses.
 * @param args.currency - The currency.
 * @returns The token prices.
 */
async function fetchTokenPricesWithIncreasingPriceForEachToken<
  TokenAddress extends Hex,
  Currency extends string,
>({
  tokenContractAddresses,
  currency,
}: {
  tokenContractAddresses: TokenAddress[];
  currency: Currency;
}) {
  return tokenContractAddresses.reduce<
    Partial<TokenPricesByTokenContractAddress<TokenAddress, Currency>>
  >((obj, tokenContractAddress, i) => {
    const tokenPrice: TokenPrice<TokenAddress, Currency> = {
      tokenContractAddress,
      value: (i + 1) / 1000,
      currency,
    };
    return {
      ...obj,
      [tokenContractAddress]: tokenPrice,
    };
  }, {}) as TokenPricesByTokenContractAddress<TokenAddress, Currency>;
}
