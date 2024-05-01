import {
  NetworksTicker,
  toChecksumHexAddress,
  toHex,
} from '@metamask/controller-utils';
import type { NetworkState } from '@metamask/network-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';
import { add0x } from '@metamask/utils';
import nock from 'nock';
import { useFakeTimers } from 'sinon';

import { advanceTime, flushPromises } from '../../../tests/helpers';
import { TOKEN_PRICES_BATCH_SIZE } from './assetsUtil';
import type {
  AbstractTokenPricesService,
  TokenPrice,
  TokenPricesByTokenAddress,
} from './token-prices-service/abstract-token-prices-service';
import { TokenRatesController } from './TokenRatesController';
import type {
  TokenRatesConfig,
  Token,
  TokenRatesState,
} from './TokenRatesController';
import type { TokensState } from './TokensController';

const defaultSelectedAddress = '0x0000000000000000000000000000000000000001';
const mockTokenAddress = '0x0000000000000000000000000000000000000010';

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

    describe('when legacy polling is active', () => {
      it('should update exchange rates when any of the addresses in the "all tokens" collection change', async () => {
        const chainId = '0xC';
        const selectedAddress = '0xA';
        const tokenAddresses = ['0xE1', '0xE2'];
        await withController(
          {
            options: {
              chainId,
              selectedAddress,
            },
            config: {
              allTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: tokenAddresses[0],
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
              allDetectedTokens: {},
            },
          },
          async ({ controller, controllerEvents }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();

            // @ts-expect-error Intentionally incomplete state
            controllerEvents.tokensStateChange({
              allTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: tokenAddresses[1],
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
              allDetectedTokens: {},
            });

            // Once when starting, and another when tokens state changes
            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(2);
          },
        );
      });

      it('should update exchange rates when any of the addresses in the "all detected tokens" collection change', async () => {
        const chainId = '0xC';
        const selectedAddress = '0xA';
        const tokenAddresses = ['0xE1', '0xE2'];
        await withController(
          {
            options: {
              chainId,
              selectedAddress,
            },
            config: {
              allTokens: {},
              allDetectedTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: tokenAddresses[0],
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
            },
          },
          async ({ controller, controllerEvents }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();

            // @ts-expect-error Intentionally incomplete state
            controllerEvents.tokensStateChange({
              allTokens: {},
              allDetectedTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: tokenAddresses[1],
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
            });

            // Once when starting, and another when tokens state changes
            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(2);
          },
        );
      });

      it('should not update exchange rates if both the "all tokens" or "all detected tokens" are exactly the same', async () => {
        const chainId = '0xC';
        const selectedAddress = '0xA';
        const tokensState = {
          allTokens: {
            [chainId]: {
              [selectedAddress]: [
                {
                  address: mockTokenAddress,
                  decimals: 0,
                  symbol: '',
                  aggregators: [],
                },
              ],
            },
          },
          allDetectedTokens: {},
        };
        await withController(
          {
            options: {
              chainId,
              selectedAddress,
            },
            config: tokensState,
          },
          async ({ controller, controllerEvents }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();

            // @ts-expect-error Intentionally incomplete state
            controllerEvents.tokensStateChange(tokensState);

            // Once when starting, and that's it
            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should not update exchange rates if all of the tokens in "all tokens" just move to "all detected tokens"', async () => {
        const chainId = '0xC';
        const selectedAddress = '0xA';
        const tokens = {
          [chainId]: {
            [selectedAddress]: [
              {
                address: mockTokenAddress,
                decimals: 0,
                symbol: '',
                aggregators: [],
              },
            ],
          },
        };
        await withController(
          {
            options: {
              chainId,
              selectedAddress,
            },
            config: {
              allTokens: tokens,
              allDetectedTokens: {},
            },
          },
          async ({ controller, controllerEvents }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();

            // @ts-expect-error Intentionally incomplete state
            controllerEvents.tokensStateChange({
              allTokens: {},
              allDetectedTokens: tokens,
            });

            // Once when starting, and that's it
            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should not update exchange rates if a new token is added to "all detected tokens" but is already present in "all tokens"', async () => {
        const chainId = '0xC';
        const selectedAddress = '0xA';
        await withController(
          {
            options: {
              chainId,
              selectedAddress,
            },
            config: {
              allTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: mockTokenAddress,
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
              allDetectedTokens: {},
            },
          },
          async ({ controller, controllerEvents }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();

            // @ts-expect-error Intentionally incomplete state
            controllerEvents.tokensStateChange({
              allTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: mockTokenAddress,
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
              allDetectedTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: mockTokenAddress,
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
            });

            // Once when starting, and that's it
            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should not update exchange rates if a new token is added to "all tokens" but is already present in "all detected tokens"', async () => {
        const chainId = '0xC';
        const selectedAddress = '0xA';
        await withController(
          {
            options: {
              chainId,
              selectedAddress,
            },
            config: {
              allTokens: {},
              allDetectedTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: mockTokenAddress,
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
            },
          },
          async ({ controller, controllerEvents }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();

            // @ts-expect-error Intentionally incomplete state
            controllerEvents.tokensStateChange({
              allTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: mockTokenAddress,
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
              allDetectedTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: mockTokenAddress,
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
            });

            // Once when starting, and that's it
            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should not update exchange rates if none of the addresses in "all tokens" or "all detected tokens" change, even if other parts of the token change', async () => {
        const chainId = '0xC';
        const selectedAddress = '0xA';
        await withController(
          {
            options: {
              chainId,
              selectedAddress,
            },
            config: {
              allTokens: {},
              allDetectedTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: mockTokenAddress,
                      decimals: 3,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
            },
          },
          async ({ controller, controllerEvents }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();

            // @ts-expect-error Intentionally incomplete state
            controllerEvents.tokensStateChange({
              allTokens: {},
              allDetectedTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: mockTokenAddress,
                      decimals: 7,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
            });

            // Once when starting, and that's it
            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should not update exchange rates if none of the addresses in "all tokens" or "all detected tokens" change, when normalized to checksum addresses', async () => {
        const chainId = '0xC';
        const selectedAddress = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
        await withController(
          {
            options: {
              chainId,
              selectedAddress,
            },
            config: {
              allTokens: {},
              allDetectedTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: '0x0EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE2',
                      decimals: 3,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
            },
          },
          async ({ controller, controllerEvents }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();

            // @ts-expect-error Intentionally incomplete state
            controllerEvents.tokensStateChange({
              allTokens: {},
              allDetectedTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: '0x0eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee2',
                      decimals: 7,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
            });

            // Once when starting, and that's it
            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should not update exchange rates if any of the addresses in "all tokens" or "all detected tokens" merely change order', async () => {
        const chainId = '0xC';
        const selectedAddress = '0xA';
        await withController(
          {
            options: {
              chainId,
              selectedAddress,
            },
            config: {
              allTokens: {},
              allDetectedTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: '0xE1',
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                    {
                      address: '0xE2',
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
            },
          },
          async ({ controller, controllerEvents }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();

            // @ts-expect-error Intentionally incomplete state
            controllerEvents.tokensStateChange({
              allTokens: {},
              allDetectedTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: '0xE2',
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                    {
                      address: '0xE1',
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
            });

            // Once when starting, and that's it
            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
          },
        );
      });
    });

    describe('when legacy polling is inactive', () => {
      it('should not update exchange rates when any of the addresses in the "all tokens" collection change', async () => {
        const chainId = '0xC';
        const selectedAddress = '0xA';
        const tokenAddresses = ['0xE1', '0xE2'];
        await withController(
          {
            options: {
              chainId,
              selectedAddress,
            },
            config: {
              allTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: tokenAddresses[0],
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
              allDetectedTokens: {},
            },
          },
          async ({ controller, controllerEvents }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();

            // @ts-expect-error Intentionally incomplete state
            controllerEvents.tokensStateChange({
              allTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: tokenAddresses[1],
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
              allDetectedTokens: {},
            });

            expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
          },
        );
      });

      it('should not update exchange rates when any of the addresses in the "all detected tokens" collection change', async () => {
        const chainId = '0xC';
        const selectedAddress = '0xA';
        const tokenAddresses = ['0xE1', '0xE2'];
        await withController(
          {
            options: {
              chainId,
              selectedAddress,
            },
            config: {
              allTokens: {},
              allDetectedTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: tokenAddresses[0],
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
            },
          },
          async ({ controller, controllerEvents }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();

            // @ts-expect-error Intentionally incomplete state
            controllerEvents.tokensStateChange({
              allTokens: {},
              allDetectedTokens: {
                [chainId]: {
                  [selectedAddress]: [
                    {
                      address: tokenAddresses[1],
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
            });

            expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
          },
        );
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                  {
                    address: mockTokenAddress,
                    decimals: 0,
                    symbol: '',
                    aggregators: [],
                  },
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
                  {
                    address: mockTokenAddress,
                    decimals: 0,
                    symbol: '',
                    aggregators: [],
                  },
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
      const controller = new TokenRatesController(
        {
          interval,
          chainId: '0x2',
          ticker: 'ticker',
          selectedAddress: defaultSelectedAddress,
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
        },
        {
          allTokens: {
            '0x1': {
              [defaultSelectedAddress]: [
                {
                  address: mockTokenAddress,
                  decimals: 0,
                  symbol: '',
                  aggregators: [],
                },
              ],
            },
          },
        },
      );

      controller.startPollingByNetworkClientId('mainnet');
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
          const controller = new TokenRatesController(
            {
              chainId: '0x2',
              ticker: 'ticker',
              selectedAddress: defaultSelectedAddress,
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
            },
            {
              allTokens: {
                '0x1': {
                  [defaultSelectedAddress]: [
                    {
                      address: '0x02',
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                    {
                      address: '0x03',
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
            },
          );

          controller.startPollingByNetworkClientId('mainnet');
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
          const controller = new TokenRatesController(
            {
              chainId: '0x2',
              ticker: 'ticker',
              selectedAddress: defaultSelectedAddress,
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
            },
            {
              allTokens: {
                '0x1': {
                  [defaultSelectedAddress]: [
                    {
                      address: '0x02',
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                    {
                      address: '0x03',
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
            },
          );

          controller.startPollingByNetworkClientId('mainnet');
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
          const controller = new TokenRatesController(
            {
              chainId: '0x2',
              ticker: 'ETH',
              selectedAddress: defaultSelectedAddress,
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
            },
            {
              allTokens: {
                '0x1': {
                  [defaultSelectedAddress]: [
                    {
                      address: '0x02',
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                    {
                      address: '0x03',
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
            },
          );

          controller.startPollingByNetworkClientId('mainnet');
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
      const controller = new TokenRatesController(
        {
          interval,
          chainId: '0x2',
          ticker: 'ticker',
          selectedAddress: defaultSelectedAddress,
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
        },
        {
          allTokens: {
            '0x1': {
              [defaultSelectedAddress]: [
                {
                  address: mockTokenAddress,
                  decimals: 0,
                  symbol: '',
                  aggregators: [],
                },
              ],
            },
          },
        },
      );

      const pollingToken = controller.startPollingByNetworkClientId('mainnet');
      await advanceTime({ clock, duration: 0 });
      expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);

      controller.stopPollingByPollingToken(pollingToken);

      await advanceTime({ clock, duration: interval });
      expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);
    });
  });

  // The TokenRatesController has two methods for updating exchange rates:
  // `updateExchangeRates` and `updateExchangeRatesByChainId`. They are the same
  // except in how the inputs are specified. `updateExchangeRates` gets the
  // inputs from controller configuration, whereas `updateExchangeRatesByChainId`
  // accepts the inputs as parameters.
  //
  // Here we test both of these methods using the same test cases. The
  // differences between them are abstracted away by the helper function
  // `callUpdateExchangeRatesMethod`.
  describe.each([
    'updateExchangeRates' as const,
    'updateExchangeRatesByChainId' as const,
  ])('%s', (method) => {
    it('does not update state when disabled', async () => {
      await withController(
        { config: { disabled: true } },
        async ({ controller, controllerEvents }) => {
          const tokenAddress = '0x0000000000000000000000000000000000000001';

          await callUpdateExchangeRatesMethod({
            allTokens: {
              [toHex(1)]: {
                [controller.config.selectedAddress]: [
                  {
                    address: tokenAddress,
                    decimals: 18,
                    symbol: 'TST',
                    aggregators: [],
                  },
                ],
              },
            },
            chainId: toHex(1),
            controller,
            controllerEvents,
            method,
            nativeCurrency: 'ETH',
          });

          expect(controller.state.contractExchangeRates).toStrictEqual({});
          expect(controller.state.contractExchangeRatesByChainId).toStrictEqual(
            {},
          );
        },
      );
    });

    it('does not update state if there are no tokens for the given chain and address', async () => {
      await withController(async ({ controller, controllerEvents }) => {
        const tokenAddress = '0x0000000000000000000000000000000000000001';
        const differentAccount = '0x1000000000000000000000000000000000000000';

        await callUpdateExchangeRatesMethod({
          allTokens: {
            // These tokens are for the right chain but wrong account
            [toHex(1)]: {
              [differentAccount]: [
                {
                  address: tokenAddress,
                  decimals: 18,
                  symbol: 'TST',
                  aggregators: [],
                },
              ],
            },
            // These tokens are for the right account but wrong chain
            [toHex(2)]: {
              [controller.config.selectedAddress]: [
                {
                  address: tokenAddress,
                  decimals: 18,
                  symbol: 'TST',
                  aggregators: [],
                },
              ],
            },
          },
          chainId: toHex(1),
          controller,
          controllerEvents,
          method,
          nativeCurrency: 'ETH',
        });

        expect(controller.state.contractExchangeRates).toStrictEqual({});
        expect(controller.state.contractExchangeRatesByChainId).toStrictEqual(
          {},
        );
      });
    });

    it('does not update state if the price update fails', async () => {
      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: jest
          .fn()
          .mockRejectedValue(new Error('Failed to fetch')),
      });
      await withController(
        { options: { tokenPricesService } },
        async ({ controller, controllerEvents }) => {
          const tokenAddress = '0x0000000000000000000000000000000000000001';

          await expect(
            async () =>
              await callUpdateExchangeRatesMethod({
                allTokens: {
                  [toHex(1)]: {
                    [controller.config.selectedAddress]: [
                      {
                        address: tokenAddress,
                        decimals: 18,
                        symbol: 'TST',
                        aggregators: [],
                      },
                    ],
                  },
                },
                chainId: toHex(1),
                controller,
                controllerEvents,
                method,
                nativeCurrency: 'ETH',
              }),
          ).rejects.toThrow('Failed to fetch');
          expect(controller.state.contractExchangeRates).toStrictEqual({});
          expect(controller.state.contractExchangeRatesByChainId).toStrictEqual(
            {},
          );
        },
      );
    });

    it('fetches rates for all tokens in batches', async () => {
      const chainId = toHex(1);
      const ticker = 'ETH';
      const tokenAddresses = [...new Array(200).keys()]
        .map(buildAddress)
        .sort();
      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: fetchTokenPricesWithIncreasingPriceForEachToken,
      });
      const fetchTokenPricesSpy = jest.spyOn(
        tokenPricesService,
        'fetchTokenPrices',
      );
      const tokens = tokenAddresses.map((tokenAddress) => {
        return buildToken({ address: tokenAddress });
      });
      await withController(
        {
          options: {
            ticker,
            tokenPricesService,
          },
        },
        async ({ controller, controllerEvents }) => {
          await callUpdateExchangeRatesMethod({
            allTokens: {
              [chainId]: {
                [controller.config.selectedAddress]: tokens,
              },
            },
            chainId,
            controller,
            controllerEvents,
            method,
            nativeCurrency: ticker,
          });

          const numBatches = Math.ceil(
            tokenAddresses.length / TOKEN_PRICES_BATCH_SIZE,
          );
          expect(fetchTokenPricesSpy).toHaveBeenCalledTimes(numBatches);

          for (let i = 1; i <= numBatches; i++) {
            expect(fetchTokenPricesSpy).toHaveBeenNthCalledWith(i, {
              chainId,
              tokenAddresses: tokenAddresses.slice(
                (i - 1) * TOKEN_PRICES_BATCH_SIZE,
                i * TOKEN_PRICES_BATCH_SIZE,
              ),
              currency: ticker,
            });
          }
        },
      );
    });

    it('updates all rates', async () => {
      const tokenAddresses = [
        '0x0000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000002',
      ];
      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: jest.fn().mockResolvedValue({
          [tokenAddresses[0]]: {
            currency: 'ETH',
            tokenAddress: tokenAddresses[0],
            value: 0.001,
          },
          [tokenAddresses[1]]: {
            currency: 'ETH',
            tokenAddress: tokenAddresses[1],
            value: 0.002,
          },
        }),
      });
      await withController(
        { options: { tokenPricesService } },
        async ({ controller, controllerEvents }) => {
          await callUpdateExchangeRatesMethod({
            allTokens: {
              [toHex(1)]: {
                [controller.config.selectedAddress]: [
                  {
                    address: tokenAddresses[0],
                    decimals: 18,
                    symbol: 'TST1',
                    aggregators: [],
                  },
                  {
                    address: tokenAddresses[1],
                    decimals: 18,
                    symbol: 'TST2',
                    aggregators: [],
                  },
                ],
              },
            },
            chainId: toHex(1),
            controller,
            controllerEvents,
            method,
            nativeCurrency: 'ETH',
          });

          expect(controller.state).toMatchInlineSnapshot(`
            Object {
              "contractExchangeRates": Object {
                "0x0000000000000000000000000000000000000001": 0.001,
                "0x0000000000000000000000000000000000000002": 0.002,
              },
              "contractExchangeRatesByChainId": Object {
                "0x1": Object {
                  "ETH": Object {
                    "0x0000000000000000000000000000000000000001": 0.001,
                    "0x0000000000000000000000000000000000000002": 0.002,
                  },
                },
              },
            }
        `);
        },
      );
    });

    if (method === 'updateExchangeRatesByChainId') {
      it('updates rates only for a non-selected chain', async () => {
        const tokenAddresses = [
          '0x0000000000000000000000000000000000000001',
          '0x0000000000000000000000000000000000000002',
        ];
        const tokenPricesService = buildMockTokenPricesService({
          fetchTokenPrices: jest.fn().mockResolvedValue({
            [tokenAddresses[0]]: {
              currency: 'ETH',
              tokenAddress: tokenAddresses[0],
              value: 0.001,
            },
            [tokenAddresses[1]]: {
              currency: 'ETH',
              tokenAddress: tokenAddresses[1],
              value: 0.002,
            },
          }),
        });
        await withController(
          { options: { tokenPricesService } },
          async ({ controller, controllerEvents }) => {
            await callUpdateExchangeRatesMethod({
              allTokens: {
                [toHex(2)]: {
                  [controller.config.selectedAddress]: [
                    {
                      address: tokenAddresses[0],
                      decimals: 18,
                      symbol: 'TST1',
                      aggregators: [],
                    },
                    {
                      address: tokenAddresses[1],
                      decimals: 18,
                      symbol: 'TST2',
                      aggregators: [],
                    },
                  ],
                },
              },
              chainId: toHex(2),
              controller,
              controllerEvents,
              method,
              nativeCurrency: 'ETH',
              setChainAsCurrent: false,
            });

            expect(controller.state).toMatchInlineSnapshot(`
              Object {
                "contractExchangeRates": Object {},
                "contractExchangeRatesByChainId": Object {
                  "0x2": Object {
                    "ETH": Object {
                      "0x0000000000000000000000000000000000000001": 0.001,
                      "0x0000000000000000000000000000000000000002": 0.002,
                    },
                  },
                },
              }
          `);
          },
        );
      });
    }

    it('updates exchange rates when native currency is not supported by the Price API', async () => {
      const tokenAddresses = [
        '0x0000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000002',
      ];
      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: jest.fn().mockResolvedValue({
          [tokenAddresses[0]]: {
            currency: 'ETH',
            tokenAddress: tokenAddresses[0],
            value: 0.001,
          },
          [tokenAddresses[1]]: {
            currency: 'ETH',
            tokenAddress: tokenAddresses[1],
            value: 0.002,
          },
        }),
        validateCurrencySupported: jest.fn().mockReturnValue(
          false,
          // Cast used because this method has an assertion in the return
          // value that I don't know how to type properly with Jest's mock.
        ) as unknown as AbstractTokenPricesService['validateCurrencySupported'],
      });
      nock('https://min-api.cryptocompare.com')
        .get('/data/price')
        .query({
          fsym: 'ETH',
          tsyms: 'UNSUPPORTED',
        })
        .reply(200, { UNSUPPORTED: 0.5 }); // .5 eth to 1 matic

      await withController(
        { options: { tokenPricesService } },
        async ({ controller, controllerEvents }) => {
          await callUpdateExchangeRatesMethod({
            allTokens: {
              [toHex(137)]: {
                [controller.config.selectedAddress]: [
                  {
                    address: tokenAddresses[0],
                    decimals: 18,
                    symbol: 'TST1',
                    aggregators: [],
                  },
                  {
                    address: tokenAddresses[1],
                    decimals: 18,
                    symbol: 'TST2',
                    aggregators: [],
                  },
                ],
              },
            },
            chainId: toHex(137),
            controller,
            controllerEvents,
            method,
            nativeCurrency: 'UNSUPPORTED',
          });

          // token value in terms of matic should be (token value in eth) * (eth value in matic)
          expect(controller.state).toMatchInlineSnapshot(`
            Object {
              "contractExchangeRates": Object {
                "0x0000000000000000000000000000000000000001": 0.0005,
                "0x0000000000000000000000000000000000000002": 0.001,
              },
              "contractExchangeRatesByChainId": Object {
                "0x89": Object {
                  "UNSUPPORTED": Object {
                    "0x0000000000000000000000000000000000000001": 0.0005,
                    "0x0000000000000000000000000000000000000002": 0.001,
                  },
                },
              },
            }
        `);
        },
      );
    });

    it('fetches rates for all tokens in batches when native currency is not supported by the Price API', async () => {
      const chainId = toHex(1);
      const ticker = 'UNSUPPORTED';
      const tokenAddresses = [...new Array(200).keys()]
        .map(buildAddress)
        .sort();
      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: fetchTokenPricesWithIncreasingPriceForEachToken,
        validateCurrencySupported: (currency: unknown): currency is string => {
          return currency !== ticker;
        },
      });
      const fetchTokenPricesSpy = jest.spyOn(
        tokenPricesService,
        'fetchTokenPrices',
      );
      const tokens = tokenAddresses.map((tokenAddress) => {
        return buildToken({ address: tokenAddress });
      });
      nock('https://min-api.cryptocompare.com')
        .get('/data/price')
        .query({
          fsym: 'ETH',
          tsyms: ticker,
        })
        .reply(200, { [ticker]: 0.5 });
      await withController(
        {
          options: {
            ticker,
            tokenPricesService,
          },
        },
        async ({ controller, controllerEvents }) => {
          await callUpdateExchangeRatesMethod({
            allTokens: {
              [chainId]: {
                [controller.config.selectedAddress]: tokens,
              },
            },
            chainId,
            controller,
            controllerEvents,
            method,
            nativeCurrency: ticker,
          });

          const numBatches = Math.ceil(
            tokenAddresses.length / TOKEN_PRICES_BATCH_SIZE,
          );
          expect(fetchTokenPricesSpy).toHaveBeenCalledTimes(numBatches);

          for (let i = 1; i <= numBatches; i++) {
            expect(fetchTokenPricesSpy).toHaveBeenNthCalledWith(i, {
              chainId,
              tokenAddresses: tokenAddresses.slice(
                (i - 1) * TOKEN_PRICES_BATCH_SIZE,
                i * TOKEN_PRICES_BATCH_SIZE,
              ),
              currency: 'ETH',
            });
          }
        },
      );
    });

    it('sets rates to undefined when chain is not supported by the Price API', async () => {
      const tokenAddresses = [
        '0x0000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000002',
      ];
      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: jest.fn().mockResolvedValue({
          [tokenAddresses[0]]: {
            currency: 'ETH',
            tokenAddress: tokenAddresses[0],
            value: 0.001,
          },
          [tokenAddresses[1]]: {
            currency: 'ETH',
            tokenAddress: tokenAddresses[1],
            value: 0.002,
          },
        }),
        validateChainIdSupported: jest.fn().mockReturnValue(
          false,
          // Cast used because this method has an assertion in the return
          // value that I don't know how to type properly with Jest's mock.
        ) as unknown as AbstractTokenPricesService['validateChainIdSupported'],
      });
      await withController(
        { options: { tokenPricesService } },
        async ({ controller, controllerEvents }) => {
          await callUpdateExchangeRatesMethod({
            allTokens: {
              [toHex(999)]: {
                [controller.config.selectedAddress]: [
                  {
                    address: tokenAddresses[0],
                    decimals: 18,
                    symbol: 'TST1',
                    aggregators: [],
                  },
                  {
                    address: tokenAddresses[1],
                    decimals: 18,
                    symbol: 'TST2',
                    aggregators: [],
                  },
                ],
              },
            },
            chainId: toHex(999),
            controller,
            controllerEvents,
            method,
            nativeCurrency: 'TST',
          });

          expect(controller.state).toMatchInlineSnapshot(`
            Object {
              "contractExchangeRates": Object {
                "0x0000000000000000000000000000000000000001": undefined,
                "0x0000000000000000000000000000000000000002": undefined,
              },
              "contractExchangeRatesByChainId": Object {
                "0x3e7": Object {
                  "TST": Object {
                    "0x0000000000000000000000000000000000000001": undefined,
                    "0x0000000000000000000000000000000000000002": undefined,
                  },
                },
              },
            }
          `);
        },
      );
    });

    it('only updates rates once when called twice', async () => {
      const tokenAddresses = [
        '0x0000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000002',
      ];
      const fetchTokenPricesMock = jest.fn().mockResolvedValue({
        [tokenAddresses[0]]: {
          currency: 'ETH',
          tokenAddress: tokenAddresses[0],
          value: 0.001,
        },
        [tokenAddresses[1]]: {
          currency: 'ETH',
          tokenAddress: tokenAddresses[1],
          value: 0.002,
        },
      });
      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: fetchTokenPricesMock,
      });
      await withController(
        { options: { tokenPricesService } },
        async ({ controller, controllerEvents }) => {
          const updateExchangeRates = async () =>
            await callUpdateExchangeRatesMethod({
              allTokens: {
                [toHex(1)]: {
                  [controller.config.selectedAddress]: [
                    {
                      address: tokenAddresses[0],
                      decimals: 18,
                      symbol: 'TST1',
                      aggregators: [],
                    },
                    {
                      address: tokenAddresses[1],
                      decimals: 18,
                      symbol: 'TST2',
                      aggregators: [],
                    },
                  ],
                },
              },
              chainId: toHex(1),
              controller,
              controllerEvents,
              method,
              nativeCurrency: 'ETH',
            });

          await Promise.all([updateExchangeRates(), updateExchangeRates()]);

          expect(fetchTokenPricesMock).toHaveBeenCalledTimes(1);
          expect(controller.state).toMatchInlineSnapshot(`
            Object {
              "contractExchangeRates": Object {
                "0x0000000000000000000000000000000000000001": 0.001,
                "0x0000000000000000000000000000000000000002": 0.002,
              },
              "contractExchangeRatesByChainId": Object {
                "0x1": Object {
                  "ETH": Object {
                    "0x0000000000000000000000000000000000000001": 0.001,
                    "0x0000000000000000000000000000000000000002": 0.002,
                  },
                },
              },
            }
        `);
        },
      );
    });
  });
});

/**
 * A collection of mock external controller events.
 */
type ControllerEvents = {
  networkStateChange: (state: NetworkState) => void;
  preferencesStateChange: (state: PreferencesState) => void;
  tokensStateChange: (state: TokensState) => void;
};

/**
 * A callback for the `withController` helper function.
 *
 * @param args - The arguments.
 * @param args.controller - The controller that the test helper created.
 * @param args.controllerEvents - A collection of methods for dispatching mock
 * events from external controllers.
 */
type WithControllerCallback<ReturnValue> = ({
  controller,
  controllerEvents,
}: {
  controller: TokenRatesController;
  controllerEvents: ControllerEvents;
}) => Promise<ReturnValue> | ReturnValue;

type PartialConstructorParameters = {
  options?: Partial<ConstructorParameters<typeof TokenRatesController>[0]>;
  config?: Partial<TokenRatesConfig>;
  state?: Partial<TokenRatesState>;
};

type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [PartialConstructorParameters, WithControllerCallback<ReturnValue>];

/**
 * Builds a controller based on the given options, and calls the given function
 * with that controller.
 *
 * @param args - Either a function, or a set of partial constructor parameters
 * plus a function. The function will be called with the built controller and a
 * collection of controller event handlers.
 * @returns Whatever the callback returns.
 */
async function withController<ReturnValue>(
  ...args: WithControllerArgs<ReturnValue>
) {
  const [{ options, config, state }, testFunction] =
    args.length === 2
      ? args
      : [{ options: undefined, config: undefined, state: undefined }, args[0]];

  // explit cast used here because we know the `on____` functions are always
  // set in the constructor.
  const controllerEvents = {} as ControllerEvents;

  const controllerOptions: ConstructorParameters<
    typeof TokenRatesController
  >[0] = {
    chainId: toHex(1),
    getNetworkClientById: jest.fn(),
    onNetworkStateChange: (listener) => {
      controllerEvents.networkStateChange = listener;
    },
    onPreferencesStateChange: (listener) => {
      controllerEvents.preferencesStateChange = listener;
    },
    onTokensStateChange: (listener) => {
      controllerEvents.tokensStateChange = listener;
    },
    selectedAddress: defaultSelectedAddress,
    ticker: NetworksTicker.mainnet,
    tokenPricesService: buildMockTokenPricesService(),
    ...options,
  };

  const controller = new TokenRatesController(controllerOptions, config, state);
  try {
    return await testFunction({
      controller,
      controllerEvents,
    });
  } finally {
    controller.stop();
    await flushPromises();
  }
}

/**
 * Call an "update exchange rates" method with the given parameters.
 *
 * The TokenRatesController has two methods for updating exchange rates:
 * `updateExchangeRates` and `updateExchangeRatesByChainId`. They are the same
 * except in how the inputs are specified. `updateExchangeRates` gets the
 * inputs from controller configuration, whereas `updateExchangeRatesByChainId`
 * accepts the inputs as parameters.
 *
 * This helper function normalizes between these two functions, so that we can
 * test them the same way.
 *
 * @param args - The arguments.
 * @param args.allTokens - The `allTokens` state (from the TokensController)
 * @param args.chainId - The chain ID of the chain we want to update the
 * exchange rates for.
 * @param args.controller - The controller to call the method with.
 * @param args.controllerEvents - Controller event handlers, used to
 * update controller configuration.
 * @param args.method - The "update exchange rates" method to call.
 * @param args.nativeCurrency - The symbol for the native currency of the
 * network we're getting updated exchange rates for.
 * @param args.setChainAsCurrent - When calling `updateExchangeRatesByChainId`,
 * this determines whether to set the chain as the globally selected chain.
 */
async function callUpdateExchangeRatesMethod({
  allTokens,
  chainId,
  controller,
  controllerEvents,
  method,
  nativeCurrency,
  setChainAsCurrent = true,
}: {
  allTokens: TokenRatesConfig['allTokens'];
  chainId: TokenRatesConfig['chainId'];
  controller: TokenRatesController;
  controllerEvents: ControllerEvents;
  method: 'updateExchangeRates' | 'updateExchangeRatesByChainId';
  nativeCurrency: TokenRatesConfig['nativeCurrency'];
  setChainAsCurrent?: boolean;
}) {
  if (method === 'updateExchangeRates' && !setChainAsCurrent) {
    throw new Error(
      'The "setChainAsCurrent" flag cannot be enabled when calling the "updateExchangeRates" method',
    );
  }
  // Note that the state given here is intentionally incomplete because the
  // controller only uses these two properties, and the tests are written to
  // only consider these two. We want this to break if we start relying on
  // more, as we'd need to update the tests accordingly.
  // @ts-expect-error Intentionally incomplete state
  controllerEvents.tokensStateChange({ allDetectedTokens: {}, allTokens });

  if (setChainAsCurrent) {
    // We're using controller events here instead of calling `configure`
    // because `configure` does not update internal controller state correctly.
    // As with many BaseControllerV1-based controllers, runtime config
    // modification is allowed by the API but not supported in practice.
    controllerEvents.networkStateChange({
      // Note that the state given here is intentionally incomplete because the
      // controller only uses these two properties, and the tests are written to
      // only consider these two. We want this to break if we start relying on
      // more, as we'd need to update the tests accordingly.
      // @ts-expect-error Intentionally incomplete state
      providerConfig: { chainId, ticker: nativeCurrency },
    });
  }

  if (method === 'updateExchangeRates') {
    await controller.updateExchangeRates();
  } else {
    await controller.updateExchangeRatesByChainId({
      chainId,
      nativeCurrency,
    });
  }
}

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
 * @param args.tokenAddresses - The token addresses.
 * @param args.currency - The currency.
 * @returns The token prices.
 */
async function fetchTokenPricesWithIncreasingPriceForEachToken<
  TokenAddress extends Hex,
  Currency extends string,
>({
  tokenAddresses,
  currency,
}: {
  tokenAddresses: TokenAddress[];
  currency: Currency;
}) {
  return tokenAddresses.reduce<
    Partial<TokenPricesByTokenAddress<TokenAddress, Currency>>
  >((obj, tokenAddress, i) => {
    const tokenPrice: TokenPrice<TokenAddress, Currency> = {
      tokenAddress,
      value: (i + 1) / 1000,
      currency,
    };
    return {
      ...obj,
      [tokenAddress]: tokenPrice,
    };
  }, {}) as TokenPricesByTokenAddress<TokenAddress, Currency>;
}

/**
 * Constructs a checksum Ethereum address.
 *
 * @param number - The address as a decimal number.
 * @returns The address as an 0x-prefixed ERC-55 mixed-case checksum address in
 * hexadecimal format.
 */
function buildAddress(number: number) {
  return toChecksumHexAddress(add0x(number.toString(16).padStart(40, '0')));
}

/**
 * Constructs an object that satisfies the Token interface, filling in missing
 * properties with defaults. This makes it possible to only specify properties
 * that the test cares about.
 *
 * @param overrides - The properties that should be assigned to the new token.
 * @returns The constructed token.
 */
function buildToken(overrides: Partial<Token> = {}) {
  return {
    address: buildAddress(1),
    decimals: 0,
    symbol: '',
    aggregators: [],
    ...overrides,
  };
}
