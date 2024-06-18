import type { AddApprovalRequest } from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import {
  ChainId,
  InfuraNetworkType,
  NetworksTicker,
  toChecksumHexAddress,
  toHex,
} from '@metamask/controller-utils';
import type {
  NetworkClientId,
  NetworkState,
} from '@metamask/network-controller';
import { defaultState as defaultNetworkState } from '@metamask/network-controller';
import type { NetworkClientConfiguration } from '@metamask/network-controller/src/types';
import {
  getDefaultPreferencesState,
  type PreferencesState,
} from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';
import { add0x } from '@metamask/utils';
import assert from 'assert';
import nock from 'nock';
import { useFakeTimers } from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import {
  buildCustomNetworkClientConfiguration,
  buildMockGetNetworkClientById,
} from '../../network-controller/tests/helpers';
import { TOKEN_PRICES_BATCH_SIZE } from './assetsUtil';
import type {
  AbstractTokenPricesService,
  TokenPrice,
  TokenPricesByTokenAddress,
} from './token-prices-service/abstract-token-prices-service';
import { controllerName, TokenRatesController } from './TokenRatesController';
import type {
  AllowedActions,
  AllowedEvents,
  Token,
  TokenRatesControllerMessenger,
} from './TokenRatesController';
import { getDefaultTokensState } from './TokensController';
import type { TokensControllerState } from './TokensController';

const defaultSelectedAddress = '0x0000000000000000000000000000000000000001';
const mockTokenAddress = '0x0000000000000000000000000000000000000010';

const defaultSelectedNetworkClientId = 'AAAA-BBBB-CCCC-DDDD';

type MainControllerMessenger = ControllerMessenger<
  AllowedActions | AddApprovalRequest,
  AllowedEvents
>;

/**
 * Builds a messenger that `TokenRatesController` can use to communicate with other controllers.
 * @param controllerMessenger - The main controller messenger.
 * @returns The restricted messenger.
 */
function buildTokenRatesControllerMessenger(
  controllerMessenger: MainControllerMessenger = new ControllerMessenger(),
): TokenRatesControllerMessenger {
  return controllerMessenger.getRestricted({
    name: controllerName,
    allowedActions: [
      'TokensController:getState',
      'NetworkController:getNetworkClientById',
      'NetworkController:getState',
      'PreferencesController:getState',
    ],
    allowedEvents: [
      'PreferencesController:stateChange',
      'TokensController:stateChange',
      'NetworkController:stateChange',
    ],
  });
}

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

    it('should set default state', async () => {
      await withController(async ({ controller }) => {
        expect(controller.state).toStrictEqual({
          marketData: {},
        });
      });
    });

    it('should not poll by default', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch');
      await withController(
        {
          options: {
            interval: 100,
          },
        },
        async ({ controller }) => {
          expect(controller.state).toStrictEqual({
            marketData: {},
          });
        },
      );
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
        const tokenAddresses = ['0xE1', '0xE2'];
        await withController(
          {
            mockTokensControllerState: {
              allTokens: {
                [ChainId.mainnet]: {
                  [defaultSelectedAddress]: [
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
          async ({ controller, triggerTokensStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allTokens: {
                [ChainId.mainnet]: {
                  [defaultSelectedAddress]: [
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

      it('should update exchange rates when any of the addresses in the "all detected tokens" collection change', async () => {
        const tokenAddresses = ['0xE1', '0xE2'];
        await withController(
          {
            mockTokensControllerState: {
              allDetectedTokens: {
                [ChainId.mainnet]: {
                  [defaultSelectedAddress]: [
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
          async ({ controller, triggerTokensStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allDetectedTokens: {
                [ChainId.mainnet]: {
                  [defaultSelectedAddress]: [
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
        const tokensState = {
          allTokens: {
            [ChainId.mainnet]: {
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
        };
        await withController(
          {
            mockTokensControllerState: {
              ...tokensState,
            },
          },
          async ({ controller, triggerTokensStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              ...tokensState,
            });

            // Once when starting, and that's it
            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should not update exchange rates if all of the tokens in "all tokens" just move to "all detected tokens"', async () => {
        const tokens = {
          [ChainId.mainnet]: {
            [defaultSelectedAddress]: [
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
            mockTokensControllerState: {
              allTokens: tokens,
            },
          },
          async ({ controller, triggerTokensStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allDetectedTokens: tokens,
            });

            // Once when starting, and that's it
            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should not update exchange rates if a new token is added to "all detected tokens" but is already present in "all tokens"', async () => {
        const tokens = {
          [ChainId.mainnet]: {
            [defaultSelectedAddress]: [
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
            mockTokensControllerState: {
              allTokens: tokens,
            },
          },
          async ({ controller, triggerTokensStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allTokens: tokens,
              allDetectedTokens: tokens,
            });

            // Once when starting, and that's it
            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should not update exchange rates if a new token is added to "all tokens" but is already present in "all detected tokens"', async () => {
        const tokens = {
          [ChainId.mainnet]: {
            [defaultSelectedAddress]: [
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
            mockTokensControllerState: {
              allDetectedTokens: tokens,
            },
          },
          async ({ controller, triggerTokensStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allTokens: tokens,
              allDetectedTokens: tokens,
            });

            // Once when starting, and that's it
            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should not update exchange rates if none of the addresses in "all tokens" or "all detected tokens" change, even if other parts of the token change', async () => {
        await withController(
          {
            mockTokensControllerState: {
              ...getDefaultTokensState(),
              allDetectedTokens: {
                [ChainId.mainnet]: {
                  [defaultSelectedAddress]: [
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
          async ({ controller, triggerTokensStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allDetectedTokens: {
                [ChainId.mainnet]: {
                  [defaultSelectedAddress]: [
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
        await withController(
          {
            mockTokensControllerState: {
              allDetectedTokens: {
                [ChainId.mainnet]: {
                  [defaultSelectedAddress]: [
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
          async ({ controller, triggerTokensStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allDetectedTokens: {
                [ChainId.mainnet]: {
                  [defaultSelectedAddress]: [
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
        await withController(
          {
            mockTokensControllerState: {
              allDetectedTokens: {
                [ChainId.mainnet]: {
                  [defaultSelectedAddress]: [
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
          async ({ controller, triggerTokensStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allDetectedTokens: {
                [ChainId.mainnet]: {
                  [defaultSelectedAddress]: [
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
        const tokenAddresses = ['0xE1', '0xE2'];
        await withController(
          {
            mockTokensControllerState: {
              allTokens: {
                [ChainId.mainnet]: {
                  [defaultSelectedAddress]: [
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
          async ({ controller, triggerTokensStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allTokens: {
                [ChainId.mainnet]: {
                  [defaultSelectedAddress]: [
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

      it('should not update exchange rates when any of the addresses in the "all detected tokens" collection change', async () => {
        const tokenAddresses = ['0xE1', '0xE2'];
        await withController(
          {
            mockTokensControllerState: {
              allDetectedTokens: {
                [ChainId.mainnet]: {
                  [defaultSelectedAddress]: [
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
          async ({ controller, triggerTokensStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allDetectedTokens: {
                [ChainId.mainnet]: {
                  [defaultSelectedAddress]: [
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
        await withController(
          {
            options: {
              interval: 100,
            },
            mockNetworkClientConfigurationsByNetworkClientId: {
              'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
                chainId: toHex(1337),
                ticker: 'NEW',
              }),
            },
          },
          async ({ controller, triggerNetworkStateChange }) => {
            await controller.start();
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerNetworkStateChange({
              ...defaultNetworkState,
              selectedNetworkClientId: defaultSelectedNetworkClientId,
            });

            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should update exchange rates when chain ID changes', async () => {
        await withController(
          {
            options: {
              interval: 100,
            },
            mockNetworkClientConfigurationsByNetworkClientId: {
              'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
                chainId: toHex(1338),
                ticker: 'TEST',
              }),
            },
          },
          async ({ controller, triggerNetworkStateChange }) => {
            await controller.start();
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerNetworkStateChange({
              ...defaultNetworkState,
              selectedNetworkClientId: defaultSelectedNetworkClientId,
            });

            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should clear marketData in state when ticker changes', async () => {
        await withController(
          {
            options: {
              interval: 100,
              state: {
                marketData: {
                  [ChainId.mainnet]: {
                    '0x02': {
                      currency: 'ETH',
                      priceChange1d: 0,
                      pricePercentChange1d: 0,
                      tokenAddress: '0x02',
                      allTimeHigh: 4000,
                      allTimeLow: 900,
                      circulatingSupply: 2000,
                      dilutedMarketCap: 100,
                      high1d: 200,
                      low1d: 100,
                      marketCap: 1000,
                      marketCapPercentChange1d: 100,
                      price: 0.001,
                      pricePercentChange14d: 100,
                      pricePercentChange1h: 1,
                      pricePercentChange1y: 200,
                      pricePercentChange200d: 300,
                      pricePercentChange30d: 200,
                      pricePercentChange7d: 100,
                      totalVolume: 100,
                    },
                  },
                },
              },
            },
            mockNetworkClientConfigurationsByNetworkClientId: {
              'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
                chainId: toHex(1337),
                ticker: 'NEW',
              }),
            },
          },
          async ({ controller, triggerNetworkStateChange }) => {
            await controller.start();
            jest.spyOn(controller, 'updateExchangeRates').mockResolvedValue();
            triggerNetworkStateChange({
              ...defaultNetworkState,
              selectedNetworkClientId: defaultSelectedNetworkClientId,
            });

            expect(controller.state.marketData).toStrictEqual({});
          },
        );
      });

      it('should clear marketData state when chain ID changes', async () => {
        await withController(
          {
            options: {
              interval: 100,
              state: {
                marketData: {
                  [ChainId.mainnet]: {
                    '0x02': {
                      currency: 'ETH',
                      priceChange1d: 0,
                      pricePercentChange1d: 0,
                      tokenAddress: '0x02',
                      allTimeHigh: 4000,
                      allTimeLow: 900,
                      circulatingSupply: 2000,
                      dilutedMarketCap: 100,
                      high1d: 200,
                      low1d: 100,
                      marketCap: 1000,
                      marketCapPercentChange1d: 100,
                      price: 0.001,
                      pricePercentChange14d: 100,
                      pricePercentChange1h: 1,
                      pricePercentChange1y: 200,
                      pricePercentChange200d: 300,
                      pricePercentChange30d: 200,
                      pricePercentChange7d: 100,
                      totalVolume: 100,
                    },
                  },
                },
              },
            },
            mockNetworkClientConfigurationsByNetworkClientId: {
              'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
                chainId: toHex(1338),
                ticker: 'TEST',
              }),
            },
          },
          async ({ controller, triggerNetworkStateChange }) => {
            await controller.start();
            jest.spyOn(controller, 'updateExchangeRates').mockResolvedValue();
            triggerNetworkStateChange({
              ...defaultNetworkState,
              selectedNetworkClientId: defaultSelectedNetworkClientId,
            });

            expect(controller.state.marketData).toStrictEqual({});
          },
        );
      });

      it('should not update exchange rates when network state changes without a ticker/chain id change', async () => {
        await withController(
          {
            options: {
              interval: 100,
            },
            mockNetworkClientConfigurationsByNetworkClientId: {
              'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
                chainId: ChainId.mainnet,
                ticker: NetworksTicker.mainnet,
              }),
            },
          },
          async ({ controller, triggerNetworkStateChange }) => {
            await controller.start();
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerNetworkStateChange({
              ...defaultNetworkState,
              selectedNetworkClientId: defaultSelectedNetworkClientId,
            });

            expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
          },
        );
      });
    });

    describe('when polling is inactive', () => {
      it('should not update exchange rates when ticker changes', async () => {
        await withController(
          {
            options: {
              interval: 100,
            },
            mockNetworkClientConfigurationsByNetworkClientId: {
              'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
                chainId: toHex(1337),
                ticker: 'NEW',
              }),
            },
          },
          async ({ controller, triggerNetworkStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerNetworkStateChange({
              ...defaultNetworkState,
              selectedNetworkClientId: defaultSelectedNetworkClientId,
            });

            expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
          },
        );
      });

      it('should not update exchange rates when chain ID changes', async () => {
        await withController(
          {
            options: {
              interval: 100,
            },
            mockNetworkClientConfigurationsByNetworkClientId: {
              'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
                chainId: toHex(1338),
                ticker: 'TEST',
              }),
            },
          },
          async ({ controller, triggerNetworkStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerNetworkStateChange({
              ...defaultNetworkState,
              selectedNetworkClientId: defaultSelectedNetworkClientId,
            });

            expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
          },
        );
      });

      it('should clear marketData state when ticker changes', async () => {
        await withController(
          {
            options: {
              interval: 100,
              state: {
                marketData: {
                  [ChainId.mainnet]: {
                    '0x02': {
                      currency: 'ETH',
                      priceChange1d: 0,
                      pricePercentChange1d: 0,
                      tokenAddress: '0x02',
                      allTimeHigh: 4000,
                      allTimeLow: 900,
                      circulatingSupply: 2000,
                      dilutedMarketCap: 100,
                      high1d: 200,
                      low1d: 100,
                      marketCap: 1000,
                      marketCapPercentChange1d: 100,
                      price: 0.001,
                      pricePercentChange14d: 100,
                      pricePercentChange1h: 1,
                      pricePercentChange1y: 200,
                      pricePercentChange200d: 300,
                      pricePercentChange30d: 200,
                      pricePercentChange7d: 100,
                      totalVolume: 100,
                    },
                  },
                },
              },
            },
            mockNetworkClientConfigurationsByNetworkClientId: {
              'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
                chainId: toHex(1337),
                ticker: 'NEW',
              }),
            },
          },
          async ({ controller, triggerNetworkStateChange }) => {
            jest.spyOn(controller, 'updateExchangeRates').mockResolvedValue();
            triggerNetworkStateChange({
              ...defaultNetworkState,
              selectedNetworkClientId: defaultSelectedNetworkClientId,
            });

            expect(controller.state.marketData).toStrictEqual({});
          },
        );
      });

      it('should clear marketData state when chain ID changes', async () => {
        await withController(
          {
            options: {
              interval: 100,
              state: {
                marketData: {
                  [ChainId.mainnet]: {
                    '0x02': {
                      currency: 'ETH',
                      priceChange1d: 0,
                      pricePercentChange1d: 0,
                      tokenAddress: '0x02',
                      allTimeHigh: 4000,
                      allTimeLow: 900,
                      circulatingSupply: 2000,
                      dilutedMarketCap: 100,
                      high1d: 200,
                      low1d: 100,
                      marketCap: 1000,
                      marketCapPercentChange1d: 100,
                      price: 0.001,
                      pricePercentChange14d: 100,
                      pricePercentChange1h: 1,
                      pricePercentChange1y: 200,
                      pricePercentChange200d: 300,
                      pricePercentChange30d: 200,
                      pricePercentChange7d: 100,
                      totalVolume: 100,
                    },
                  },
                },
              },
            },
            mockNetworkClientConfigurationsByNetworkClientId: {
              'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
                chainId: toHex(1338),
                ticker: 'TEST',
              }),
            },
          },
          async ({ controller, triggerNetworkStateChange }) => {
            jest.spyOn(controller, 'updateExchangeRates').mockResolvedValue();
            triggerNetworkStateChange({
              ...defaultNetworkState,
              selectedNetworkClientId: defaultSelectedNetworkClientId,
            });

            expect(controller.state.marketData).toStrictEqual({});
          },
        );
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
        const alternateSelectedAddress =
          '0x0000000000000000000000000000000000000002';
        await withController(
          {
            options: {
              interval: 100,
            },
            mockTokensControllerState: {
              allTokens: {
                '0x1': {
                  [alternateSelectedAddress]: [
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
          },
          async ({ controller, triggerPreferencesStateChange }) => {
            await controller.start();
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              selectedAddress: alternateSelectedAddress,
            });

            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should not update exchange rates when preferences state changes without selected address changing', async () => {
        await withController(
          {
            options: {
              interval: 100,
            },
            mockTokensControllerState: {
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
          },
          async ({ controller, triggerPreferencesStateChange }) => {
            await controller.start();
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              selectedAddress: defaultSelectedAddress,
              openSeaEnabled: false,
            });

            expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
          },
        );
      });
    });

    describe('when polling is inactive', () => {
      it('should not update exchange rates when selected address changes', async () => {
        const alternateSelectedAddress =
          '0x0000000000000000000000000000000000000002';
        await withController(
          {
            options: {
              interval: 100,
            },
            mockTokensControllerState: {
              allTokens: {
                '0x1': {
                  [alternateSelectedAddress]: [
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
          },
          async ({ controller, triggerPreferencesStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              selectedAddress: alternateSelectedAddress,
            });

            expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
          },
        );
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
        await withController(
          {
            options: {
              interval,
              tokenPricesService,
            },
            mockTokensControllerState: {
              allTokens: {
                [ChainId.mainnet]: {
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
          },
          async ({ controller }) => {
            await controller.start();

            expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(
              1,
            );

            await advanceTime({ clock, duration: interval });
            expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(
              2,
            );

            await advanceTime({ clock, duration: interval });
            expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(
              3,
            );
          },
        );
      });
    });

    describe('stop', () => {
      it('should stop polling', async () => {
        const interval = 100;
        const tokenPricesService = buildMockTokenPricesService();
        jest.spyOn(tokenPricesService, 'fetchTokenPrices');
        await withController(
          {
            options: {
              interval,
              tokenPricesService,
            },
            mockTokensControllerState: {
              allTokens: {
                [ChainId.mainnet]: {
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
          },
          async ({ controller }) => {
            await controller.start();

            expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(
              1,
            );

            controller.stop();

            await advanceTime({ clock, duration: interval });
            expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(
              1,
            );
          },
        );
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
      await withController(
        {
          options: {
            interval,
            tokenPricesService,
          },
          mockTokensControllerState: {
            allTokens: {
              [ChainId.mainnet]: {
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
        },
        async ({ controller }) => {
          controller.startPollingByNetworkClientId('mainnet');

          await advanceTime({ clock, duration: 0 });
          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);

          await advanceTime({ clock, duration: interval });
          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(2);

          await advanceTime({ clock, duration: interval });
          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(3);
        },
      );
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
          const interval = 100;
          await withController(
            {
              options: {
                interval,
                tokenPricesService,
              },
              mockTokensControllerState: {
                allTokens: {
                  [ChainId.mainnet]: {
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
            },
            async ({ controller }) => {
              controller.startPollingByNetworkClientId('mainnet');
              await advanceTime({ clock, duration: 0 });

              expect(controller.state).toStrictEqual({
                marketData: {
                  [ChainId.mainnet]: {
                    '0x02': {
                      currency: 'ETH',
                      priceChange1d: 0,
                      pricePercentChange1d: 0,
                      tokenAddress: '0x02',
                      allTimeHigh: 4000,
                      allTimeLow: 900,
                      circulatingSupply: 2000,
                      dilutedMarketCap: 100,
                      high1d: 200,
                      low1d: 100,
                      marketCap: 1000,
                      marketCapPercentChange1d: 100,
                      price: 0.001,
                      pricePercentChange14d: 100,
                      pricePercentChange1h: 1,
                      pricePercentChange1y: 200,
                      pricePercentChange200d: 300,
                      pricePercentChange30d: 200,
                      pricePercentChange7d: 100,
                      totalVolume: 100,
                    },
                    '0x03': {
                      currency: 'ETH',
                      priceChange1d: 0,
                      pricePercentChange1d: 0,
                      tokenAddress: '0x03',
                      allTimeHigh: 4000,
                      allTimeLow: 900,
                      circulatingSupply: 2000,
                      dilutedMarketCap: 100,
                      high1d: 200,
                      low1d: 100,
                      marketCap: 1000,
                      marketCapPercentChange1d: 100,
                      price: 0.002,
                      pricePercentChange14d: 100,
                      pricePercentChange1h: 1,
                      pricePercentChange1y: 200,
                      pricePercentChange200d: 300,
                      pricePercentChange30d: 200,
                      pricePercentChange7d: 100,
                      totalVolume: 100,
                    },
                  },
                },
              });
            },
          );
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
            const selectedNetworkClientConfiguration =
              buildCustomNetworkClientConfiguration({
                chainId: ChainId.mainnet,
                ticker: 'LOL',
              });
            await withController(
              {
                options: {
                  tokenPricesService,
                },
                mockNetworkClientConfigurationsByNetworkClientId: {
                  mainnet: selectedNetworkClientConfiguration,
                },
                mockTokensControllerState: {
                  allTokens: {
                    [ChainId.mainnet]: {
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
              },
              async ({ controller }) => {
                controller.startPollingByNetworkClientId('mainnet');
                // flush promises and advance setTimeouts they enqueue 3 times
                // needed because fetch() doesn't resolve immediately, so any
                // downstream promises aren't flushed until the next advanceTime loop
                await advanceTime({ clock, duration: 1, stepSize: 1 / 3 });
                expect(controller.state.marketData).toStrictEqual({
                  [ChainId.mainnet]: {
                    // token price in LOL = (token price in ETH) * (ETH value in LOL)
                    '0x02': {
                      tokenAddress: '0x02',
                      currency: 'ETH',
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
                      price: 0.0005,
                      pricePercentChange14d: 100,
                      pricePercentChange1h: 1,
                      pricePercentChange1y: 200,
                      pricePercentChange200d: 300,
                      pricePercentChange30d: 200,
                      pricePercentChange7d: 100,
                      totalVolume: 100,
                    },
                    '0x03': {
                      tokenAddress: '0x03',
                      currency: 'ETH',
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
                      price: 0.001,
                      pricePercentChange14d: 100,
                      pricePercentChange1h: 1,
                      pricePercentChange1y: 200,
                      pricePercentChange200d: 300,
                      pricePercentChange30d: 200,
                      pricePercentChange7d: 100,
                      totalVolume: 100,
                    },
                  },
                });
                controller.stopAllPolling();
              },
            );
          });

          it('returns the an empty object when market does not exist for pair', async () => {
            nock('https://min-api.cryptocompare.com')
              .get('/data/price?fsym=ETH&tsyms=LOL')
              .replyWithError(
                new Error('market does not exist for this coin pair'),
              );

            const tokenPricesService = buildMockTokenPricesService();
            await withController(
              {
                options: {
                  tokenPricesService,
                },
                mockNetworkClientConfigurationsByNetworkClientId: {
                  'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
                    chainId: ChainId.mainnet,
                    ticker: 'LOL',
                  }),
                },
                mockTokensControllerState: {
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
              },
              async ({ controller }) => {
                controller.startPollingByNetworkClientId('mainnet');
                // flush promises and advance setTimeouts they enqueue 3 times
                // needed because fetch() doesn't resolve immediately, so any
                // downstream promises aren't flushed until the next advanceTime loop
                await advanceTime({ clock, duration: 1, stepSize: 1 / 3 });

                expect(controller.state.marketData).toStrictEqual({
                  [ChainId.mainnet]: {},
                });
                controller.stopAllPolling();
              },
            );
          });
        });
      });

      it('should stop polling', async () => {
        const interval = 100;
        const tokenPricesService = buildMockTokenPricesService();
        jest.spyOn(tokenPricesService, 'fetchTokenPrices');
        await withController(
          {
            options: {
              tokenPricesService,
            },
            mockTokensControllerState: {
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
          },
          async ({ controller }) => {
            const pollingToken =
              controller.startPollingByNetworkClientId('mainnet');
            await advanceTime({ clock, duration: 0 });
            expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(
              1,
            );

            controller.stopPollingByPollingToken(pollingToken);

            await advanceTime({ clock, duration: interval });
            expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(
              1,
            );
          },
        );
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
          {},
          async ({
            controller,
            triggerTokensStateChange,
            triggerNetworkStateChange,
          }) => {
            const tokenAddress = '0x0000000000000000000000000000000000000001';
            controller.disable();
            await callUpdateExchangeRatesMethod({
              allTokens: {
                [ChainId.mainnet]: {
                  [defaultSelectedAddress]: [
                    {
                      address: tokenAddress,
                      decimals: 18,
                      symbol: 'TST',
                      aggregators: [],
                    },
                  ],
                },
              },
              chainId: ChainId.mainnet,
              controller,
              triggerTokensStateChange,
              triggerNetworkStateChange,
              method,
              nativeCurrency: 'ETH',
              selectedNetworkClientId: InfuraNetworkType.mainnet,
            });

            expect(controller.state.marketData).toStrictEqual({});
          },
        );
      });

      it('does not update state if there are no tokens for the given chain and address', async () => {
        await withController(
          async ({
            controller,
            triggerTokensStateChange,
            triggerNetworkStateChange,
          }) => {
            const tokenAddress = '0x0000000000000000000000000000000000000001';
            const differentAccount =
              '0x1000000000000000000000000000000000000000';
            controller.enable();
            await callUpdateExchangeRatesMethod({
              allTokens: {
                // These tokens are for the right chain but wrong account
                [ChainId.mainnet]: {
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
                  [defaultSelectedAddress]: [
                    {
                      address: tokenAddress,
                      decimals: 18,
                      symbol: 'TST',
                      aggregators: [],
                    },
                  ],
                },
              },
              chainId: ChainId.mainnet,
              controller,
              triggerTokensStateChange,
              triggerNetworkStateChange,
              method,
              nativeCurrency: 'ETH',
              selectedNetworkClientId: InfuraNetworkType.mainnet,
            });

            expect(controller.state).toStrictEqual({
              marketData: {
                [ChainId.mainnet]: {
                  '0x0000000000000000000000000000000000000000': {
                    currency: 'ETH',
                  },
                },
              },
            });
          },
        );
      });

      it('does not update state if the price update fails', async () => {
        const tokenPricesService = buildMockTokenPricesService({
          fetchTokenPrices: jest
            .fn()
            .mockRejectedValue(new Error('Failed to fetch')),
        });
        await withController(
          { options: { tokenPricesService } },
          async ({
            controller,
            triggerTokensStateChange,
            triggerNetworkStateChange,
          }) => {
            const tokenAddress = '0x0000000000000000000000000000000000000001';

            await expect(
              async () =>
                await callUpdateExchangeRatesMethod({
                  allTokens: {
                    [ChainId.mainnet]: {
                      [defaultSelectedAddress]: [
                        {
                          address: tokenAddress,
                          decimals: 18,
                          symbol: 'TST',
                          aggregators: [],
                        },
                      ],
                    },
                  },
                  chainId: ChainId.mainnet,
                  controller,
                  triggerTokensStateChange,
                  triggerNetworkStateChange,
                  method,
                  nativeCurrency: 'ETH',
                  selectedNetworkClientId: InfuraNetworkType.mainnet,
                }),
            ).rejects.toThrow('Failed to fetch');
            expect(controller.state.marketData).toStrictEqual({});
          },
        );
      });

      it('fetches rates for all tokens in batches', async () => {
        const chainId = ChainId.mainnet;
        const ticker = NetworksTicker.mainnet;
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
              tokenPricesService,
            },
          },
          async ({
            controller,
            triggerTokensStateChange,
            triggerNetworkStateChange,
          }) => {
            await callUpdateExchangeRatesMethod({
              allTokens: {
                [chainId]: {
                  [defaultSelectedAddress]: tokens,
                },
              },
              chainId,
              controller,
              triggerTokensStateChange,
              triggerNetworkStateChange,
              method,
              nativeCurrency: ticker,
              selectedNetworkClientId: InfuraNetworkType.mainnet,
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
          async ({
            controller,
            triggerTokensStateChange,
            triggerNetworkStateChange,
          }) => {
            await callUpdateExchangeRatesMethod({
              allTokens: {
                [ChainId.mainnet]: {
                  [defaultSelectedAddress]: [
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
              chainId: ChainId.mainnet,
              controller,
              triggerTokensStateChange,
              triggerNetworkStateChange,
              method,
              nativeCurrency: 'ETH',
              selectedNetworkClientId: InfuraNetworkType.mainnet,
            });

            expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "marketData": Object {
              "0x1": Object {
                "0x0000000000000000000000000000000000000001": Object {
                  "currency": "ETH",
                  "tokenAddress": "0x0000000000000000000000000000000000000001",
                  "value": 0.001,
                },
                "0x0000000000000000000000000000000000000002": Object {
                  "currency": "ETH",
                  "tokenAddress": "0x0000000000000000000000000000000000000002",
                  "value": 0.002,
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
            async ({
              controller,
              triggerTokensStateChange,
              triggerNetworkStateChange,
            }) => {
              await callUpdateExchangeRatesMethod({
                allTokens: {
                  [toHex(2)]: {
                    [defaultSelectedAddress]: [
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
                triggerTokensStateChange,
                triggerNetworkStateChange,
                method,
                nativeCurrency: 'ETH',
                setChainAsCurrent: false,
              });

              expect(controller.state).toMatchInlineSnapshot(`
            Object {
              "marketData": Object {
                "0x2": Object {
                  "0x0000000000000000000000000000000000000001": Object {
                    "currency": "ETH",
                    "tokenAddress": "0x0000000000000000000000000000000000000001",
                    "value": 0.001,
                  },
                  "0x0000000000000000000000000000000000000002": Object {
                    "currency": "ETH",
                    "tokenAddress": "0x0000000000000000000000000000000000000002",
                    "value": 0.002,
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
        const selectedNetworkClientId = 'AAAA-BBBB-CCCC-DDDD';
        const selectedNetworkClientConfiguration =
          buildCustomNetworkClientConfiguration({
            chainId: toHex(137),
            ticker: 'UNSUPPORTED',
          });
        const tokenAddresses = [
          '0x0000000000000000000000000000000000000001',
          '0x0000000000000000000000000000000000000002',
        ];
        const tokenPricesService = buildMockTokenPricesService({
          fetchTokenPrices: jest.fn().mockResolvedValue({
            [tokenAddresses[0]]: {
              currency: 'ETH',
              tokenAddress: tokenAddresses[0],
              price: 0.001,
            },
            [tokenAddresses[1]]: {
              currency: 'ETH',
              tokenAddress: tokenAddresses[1],
              price: 0.002,
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
            tsyms: selectedNetworkClientConfiguration.ticker,
          })
          .reply(200, { [selectedNetworkClientConfiguration.ticker]: 0.5 }); // .5 eth to 1 matic

        await withController(
          {
            options: { tokenPricesService },
            mockNetworkClientConfigurationsByNetworkClientId: {
              [selectedNetworkClientId]: selectedNetworkClientConfiguration,
            },
          },
          async ({
            controller,
            triggerTokensStateChange,
            triggerNetworkStateChange,
          }) => {
            await callUpdateExchangeRatesMethod({
              allTokens: {
                [selectedNetworkClientConfiguration.chainId]: {
                  [defaultSelectedAddress]: [
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
              chainId: selectedNetworkClientConfiguration.chainId,
              controller,
              triggerTokensStateChange,
              triggerNetworkStateChange,
              method,
              nativeCurrency: selectedNetworkClientConfiguration.ticker,
              selectedNetworkClientId,
            });

            // token value in terms of matic should be (token value in eth) * (eth value in matic)
            expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "marketData": Object {
              "0x89": Object {
                "0x0000000000000000000000000000000000000001": Object {
                  "currency": "ETH",
                  "price": 0.0005,
                  "tokenAddress": "0x0000000000000000000000000000000000000001",
                },
                "0x0000000000000000000000000000000000000002": Object {
                  "currency": "ETH",
                  "price": 0.001,
                  "tokenAddress": "0x0000000000000000000000000000000000000002",
                },
              },
            },
          }
        `);
          },
        );
      });

      it('fetches rates for all tokens in batches when native currency is not supported by the Price API', async () => {
        const selectedNetworkClientId = 'AAAA-BBBB-CCCC-DDDD';
        const selectedNetworkClientConfiguration =
          buildCustomNetworkClientConfiguration({
            chainId: toHex(999),
            ticker: 'UNSUPPORTED',
          });
        const tokenAddresses = [...new Array(200).keys()]
          .map(buildAddress)
          .sort();
        const tokenPricesService = buildMockTokenPricesService({
          fetchTokenPrices: fetchTokenPricesWithIncreasingPriceForEachToken,
          validateCurrencySupported: (
            currency: unknown,
          ): currency is string => {
            return currency !== selectedNetworkClientConfiguration.ticker;
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
            tsyms: selectedNetworkClientConfiguration.ticker,
          })
          .reply(200, { [selectedNetworkClientConfiguration.ticker]: 0.5 });
        await withController(
          {
            options: {
              tokenPricesService,
            },
            mockNetworkClientConfigurationsByNetworkClientId: {
              [selectedNetworkClientId]: selectedNetworkClientConfiguration,
            },
          },
          async ({
            controller,
            triggerTokensStateChange,
            triggerNetworkStateChange,
          }) => {
            await callUpdateExchangeRatesMethod({
              allTokens: {
                [selectedNetworkClientConfiguration.chainId]: {
                  [defaultSelectedAddress]: tokens,
                },
              },
              chainId: selectedNetworkClientConfiguration.chainId,
              controller,
              triggerTokensStateChange,
              triggerNetworkStateChange,
              method,
              nativeCurrency: selectedNetworkClientConfiguration.ticker,
              selectedNetworkClientId,
            });

            const numBatches = Math.ceil(
              tokenAddresses.length / TOKEN_PRICES_BATCH_SIZE,
            );
            expect(fetchTokenPricesSpy).toHaveBeenCalledTimes(numBatches);

            for (let i = 1; i <= numBatches; i++) {
              expect(fetchTokenPricesSpy).toHaveBeenNthCalledWith(i, {
                chainId: selectedNetworkClientConfiguration.chainId,
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
        const selectedNetworkClientId = 'AAAA-BBBB-CCCC-DDDD';
        const selectedNetworkClientConfiguration =
          buildCustomNetworkClientConfiguration({
            chainId: toHex(999),
            ticker: 'TST',
          });
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
          {
            options: { tokenPricesService },
            mockNetworkClientConfigurationsByNetworkClientId: {
              [selectedNetworkClientId]: selectedNetworkClientConfiguration,
            },
          },
          async ({
            controller,
            triggerTokensStateChange,
            triggerNetworkStateChange,
          }) => {
            await callUpdateExchangeRatesMethod({
              allTokens: {
                [toHex(999)]: {
                  [defaultSelectedAddress]: [
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
              chainId: selectedNetworkClientConfiguration.chainId,
              controller,
              triggerTokensStateChange,
              triggerNetworkStateChange,
              method,
              nativeCurrency: selectedNetworkClientConfiguration.ticker,
              selectedNetworkClientId,
            });

            expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "marketData": Object {
              "0x3e7": Object {
                "0x0000000000000000000000000000000000000001": undefined,
                "0x0000000000000000000000000000000000000002": undefined,
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
          async ({
            controller,
            triggerTokensStateChange,
            triggerNetworkStateChange,
          }) => {
            const updateExchangeRates = async () =>
              await callUpdateExchangeRatesMethod({
                allTokens: {
                  [toHex(1)]: {
                    [defaultSelectedAddress]: [
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
                chainId: ChainId.mainnet,
                selectedNetworkClientId: InfuraNetworkType.mainnet,
                controller,
                triggerTokensStateChange,
                triggerNetworkStateChange,
                method,
                nativeCurrency: 'ETH',
              });

            await Promise.all([updateExchangeRates(), updateExchangeRates()]);

            expect(fetchTokenPricesMock).toHaveBeenCalledTimes(1);

            expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "marketData": Object {
              "0x1": Object {
                "0x0000000000000000000000000000000000000001": Object {
                  "currency": "ETH",
                  "tokenAddress": "0x0000000000000000000000000000000000000001",
                  "value": 0.001,
                },
                "0x0000000000000000000000000000000000000002": Object {
                  "currency": "ETH",
                  "tokenAddress": "0x0000000000000000000000000000000000000002",
                  "value": 0.002,
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
});
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
  triggerPreferencesStateChange,
  triggerTokensStateChange,
  triggerNetworkStateChange,
}: {
  controller: TokenRatesController;
  triggerPreferencesStateChange: (state: PreferencesState) => void;
  triggerTokensStateChange: (state: TokensControllerState) => void;
  triggerNetworkStateChange: (state: NetworkState) => void;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<ConstructorParameters<typeof TokenRatesController>[0]>;
  messenger?: ControllerMessenger<AllowedActions, AllowedEvents>;
  mockNetworkClientConfigurationsByNetworkClientId?: Record<
    NetworkClientId,
    NetworkClientConfiguration
  >;
  mockTokensControllerState?: Partial<TokensControllerState>;
  mockNetworkState?: Partial<NetworkState>;
};

type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];

/**
 * Builds a controller based on the given options, and calls the given function
 * with that controller.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag is equivalent to the controller options; the function will be called
 * with the built controller.
 * @returns Whatever the callback returns.
 */
async function withController<ReturnValue>(
  ...args: WithControllerArgs<ReturnValue>
): Promise<ReturnValue> {
  const [{ ...rest }, fn] = args.length === 2 ? args : [{}, args[0]];
  const {
    options,
    messenger,
    mockNetworkClientConfigurationsByNetworkClientId,
    mockTokensControllerState,
    mockNetworkState,
  } = rest;
  const controllerMessenger =
    messenger ?? new ControllerMessenger<AllowedActions, AllowedEvents>();

  const mockTokensState = jest.fn<TokensControllerState, []>();
  controllerMessenger.registerActionHandler(
    'TokensController:getState',
    mockTokensState.mockReturnValue({
      ...getDefaultTokensState(),
      ...mockTokensControllerState,
    }),
  );

  const getNetworkClientById = buildMockGetNetworkClientById(
    mockNetworkClientConfigurationsByNetworkClientId,
  );
  controllerMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    getNetworkClientById,
  );

  const networkStateMock = jest.fn<NetworkState, []>();
  controllerMessenger.registerActionHandler(
    'NetworkController:getState',
    networkStateMock.mockReturnValue({
      ...defaultNetworkState,
      ...mockNetworkState,
    }),
  );

  const mockPreferencesState = jest.fn<PreferencesState, []>();
  controllerMessenger.registerActionHandler(
    'PreferencesController:getState',
    mockPreferencesState.mockReturnValue({
      ...getDefaultPreferencesState(),
      selectedAddress: defaultSelectedAddress,
    }),
  );

  const controller = new TokenRatesController({
    tokenPricesService: buildMockTokenPricesService(),
    messenger: buildTokenRatesControllerMessenger(controllerMessenger),
    ...options,
  });
  try {
    return await fn({
      controller,
      triggerPreferencesStateChange: (state: PreferencesState) => {
        controllerMessenger.publish(
          'PreferencesController:stateChange',
          state,
          [],
        );
      },
      triggerTokensStateChange: (state: TokensControllerState) => {
        controllerMessenger.publish('TokensController:stateChange', state, []);
      },
      triggerNetworkStateChange: (state: NetworkState) => {
        controllerMessenger.publish('NetworkController:stateChange', state, []);
      },
    });
  } finally {
    controller.stop();
    controller.stopAllPolling();
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
 * @param args.triggerTokensStateChange - Controller event handlers, used to
 * update controller configuration.
 * @param args.triggerNetworkStateChange - Controller event handlers, used to
 * update controller configuration.
 * @param args.method - The "update exchange rates" method to call.
 * @param args.nativeCurrency - The symbol for the native currency of the
 * network we're getting updated exchange rates for.
 * @param args.setChainAsCurrent - When calling `updateExchangeRatesByChainId`,
 * this determines whether to set the chain as the globally selected chain.
 * @param args.selectedNetworkClientId - The network client ID to use if
 * `setChainAsCurrent` is true.
 */
async function callUpdateExchangeRatesMethod({
  allTokens,
  chainId,
  controller,
  triggerTokensStateChange,
  triggerNetworkStateChange,
  method,
  nativeCurrency,
  selectedNetworkClientId,
  setChainAsCurrent = true,
}: {
  allTokens: TokensControllerState['allTokens'];
  chainId: Hex;
  controller: TokenRatesController;
  triggerTokensStateChange: (state: TokensControllerState) => void;
  triggerNetworkStateChange: (state: NetworkState) => void;
  method: 'updateExchangeRates' | 'updateExchangeRatesByChainId';
  nativeCurrency: string;
  selectedNetworkClientId?: NetworkClientId;
  setChainAsCurrent?: boolean;
}) {
  if (method === 'updateExchangeRates' && !setChainAsCurrent) {
    throw new Error(
      'The "setChainAsCurrent" flag cannot be enabled when calling the "updateExchangeRates" method',
    );
  }

  triggerTokensStateChange({
    ...getDefaultTokensState(),
    allDetectedTokens: {},
    allTokens,
  });

  if (setChainAsCurrent) {
    assert(
      selectedNetworkClientId,
      'The "selectedNetworkClientId" option must be given if the "setChainAsCurrent" flag is also given',
    );

    // We're using controller events here instead of calling `configure`
    // because `configure` does not update internal controller state correctly.
    // As with many BaseControllerV1-based controllers, runtime config
    // modification is allowed by the API but not supported in practice.
    triggerNetworkStateChange({
      ...defaultNetworkState,
      selectedNetworkClientId,
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
      currency,
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
      price: (i + 1) / 1000,
      pricePercentChange14d: 100,
      pricePercentChange1h: 1,
      pricePercentChange1y: 200,
      pricePercentChange200d: 300,
      pricePercentChange30d: 200,
      pricePercentChange7d: 100,
      totalVolume: 100,
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
