import type { AddApprovalRequest } from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import {
  ChainId,
  NetworksTicker,
  NetworkType,
  toChecksumHexAddress,
  toHex,
} from '@metamask/controller-utils';
import type {
  NetworkClientId,
  NetworkController,
  NetworkState,
} from '@metamask/network-controller';
import { defaultState as defaultNetworkState } from '@metamask/network-controller';
import type { AutoManagedNetworkClient } from '@metamask/network-controller/src/create-auto-managed-network-client';
import type { CustomNetworkClientConfiguration } from '@metamask/network-controller/src/types';
import {
  getDefaultPreferencesState,
  type PreferencesState,
} from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';
import { add0x } from '@metamask/utils';
import nock from 'nock';
import { useFakeTimers } from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import { TOKEN_PRICES_BATCH_SIZE } from './assetsUtil';
import type {
  AbstractTokenPricesService,
  TokenPrice,
  TokenPricesByTokenAddress,
} from './token-prices-service/abstract-token-prices-service';
import {
  controllerName,
  getDefaultTokenRatesControllerState,
  TokenRatesController,
} from './TokenRatesController';
import type {
  AllowedActions,
  AllowedEvents,
  Token,
  TokenRatesControllerMessenger,
} from './TokenRatesController';
import type { TokensState } from './TokensController';
import { getDefaultTokensState } from './TokensController';

const defaultSelectedAddress = '0x0000000000000000000000000000000000000001';
const mockTokenAddress = '0x0000000000000000000000000000000000000010';

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
      await withController({}, async ({ controller }) => {
        expect(controller.state).toStrictEqual({
          contractExchangeRates: {},
          contractExchangeRatesByChainId: {},
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
            contractExchangeRates: {},
            contractExchangeRatesByChainId: {},
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
          {},
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
                      address: tokenAddresses[0],
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
              allDetectedTokens: {},
            });
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
              allDetectedTokens: {},
            });

            // Once when starting, and another when tokens state changes
            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(2);
          },
        );
      });

      it('should update exchange rates when any of the addresses in the "all detected tokens" collection change', async () => {
        const tokenAddresses = ['0xE1', '0xE2'];
        await withController(
          {},
          async ({ controller, triggerTokensStateChange }) => {
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allTokens: {},
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
            });
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            await controller.start();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allTokens: {},
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
          allDetectedTokens: {},
        };
        await withController(
          {},
          async ({ controller, triggerTokensStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              ...tokensState,
            });
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
          {},
          async ({ controller, triggerTokensStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allTokens: tokens,
              allDetectedTokens: {},
            });
            await controller.start();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allTokens: {},
              allDetectedTokens: tokens,
            });

            // Once when starting, and that's it
            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should not update exchange rates if a new token is added to "all detected tokens" but is already present in "all tokens"', async () => {
        await withController(
          {},
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
                      address: mockTokenAddress,
                      decimals: 0,
                      symbol: '',
                      aggregators: [],
                    },
                  ],
                },
              },
              allDetectedTokens: {},
            });
            await controller.start();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
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
              allDetectedTokens: {
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
            });

            // Once when starting, and that's it
            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should not update exchange rates if a new token is added to "all tokens" but is already present in "all detected tokens"', async () => {
        await withController(
          {},
          async ({ controller, triggerTokensStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allTokens: {},
              allDetectedTokens: {
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
            });
            await controller.start();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
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
              allDetectedTokens: {
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
            });

            // Once when starting, and that's it
            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should not update exchange rates if none of the addresses in "all tokens" or "all detected tokens" change, even if other parts of the token change', async () => {
        await withController(
          {},
          async ({ controller, triggerTokensStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allTokens: {},
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
            });
            await controller.start();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allTokens: {},
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
          {},
          async ({ controller, triggerTokensStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allTokens: {},
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
            });
            await controller.start();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allTokens: {},
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
          {},
          async ({ controller, triggerTokensStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allTokens: {},
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
            });
            await controller.start();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allTokens: {},
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
          {},
          async ({ controller, triggerTokensStateChange }) => {
            triggerTokensStateChange({
              ...getDefaultTokensState(),
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
              allDetectedTokens: {},
            });
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
              allDetectedTokens: {},
            });

            expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
          },
        );
      });

      it('should not update exchange rates when any of the addresses in the "all detected tokens" collection change', async () => {
        const tokenAddresses = ['0xE1', '0xE2'];
        await withController(
          {},
          async ({ controller, triggerTokensStateChange }) => {
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allTokens: {},
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
            });
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
              allTokens: {},
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
          },
          async ({ controller, triggerNetworkStateChange }) => {
            await controller.start();
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerNetworkStateChange({
              ...defaultNetworkState,
              providerConfig: {
                ...defaultNetworkState.providerConfig,
                chainId: ChainId.mainnet,
                ticker: 'NEW',
              },
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
          },
          async ({ controller, triggerNetworkStateChange }) => {
            await controller.start();
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerNetworkStateChange({
              ...defaultNetworkState,
              providerConfig: {
                ...defaultNetworkState.providerConfig,
                chainId: ChainId['linea-mainnet'],
                ticker: NetworksTicker.mainnet,
              },
            });

            expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should clear contractExchangeRates state when ticker changes', async () => {
        await withController(
          {
            options: {
              interval: 100,
              state: {
                ...getDefaultTokenRatesControllerState(),
                contractExchangeRates: {
                  '0x0000000000000000000000000000000000000001': 0.001,
                  '0x0000000000000000000000000000000000000002': 0.002,
                },
              },
            },
          },
          async ({ controller, triggerNetworkStateChange }) => {
            await controller.start();
            jest.spyOn(controller, 'updateExchangeRates').mockResolvedValue();
            triggerNetworkStateChange({
              ...defaultNetworkState,
              providerConfig: {
                ...defaultNetworkState.providerConfig,
                chainId: ChainId.mainnet,
                ticker: 'NEW',
              },
            });

            expect(controller.state.contractExchangeRates).toStrictEqual({});
          },
        );
      });

      it('should clear contractExchangeRates state when chain ID changes', async () => {
        await withController(
          {
            options: {
              interval: 100,
            },
          },
          async ({ controller, triggerNetworkStateChange }) => {
            await controller.start();
            jest.spyOn(controller, 'updateExchangeRates').mockResolvedValue();
            triggerNetworkStateChange({
              ...defaultNetworkState,
              providerConfig: {
                ...defaultNetworkState.providerConfig,
                chainId: ChainId['linea-mainnet'],
                ticker: NetworksTicker.mainnet,
              },
            });

            expect(controller.state.contractExchangeRates).toStrictEqual({});
          },
        );
      });

      it('should not update exchange rates when network state changes without a ticker/chain id change', async () => {
        await withController(
          {
            options: {
              interval: 100,
            },
          },
          async ({ controller, triggerNetworkStateChange }) => {
            await controller.start();
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerNetworkStateChange({
              ...defaultNetworkState,
              selectedNetworkClientId: NetworkType.mainnet,
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
          },
          async ({ controller, triggerNetworkStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerNetworkStateChange({
              ...defaultNetworkState,
              providerConfig: {
                ...defaultNetworkState.providerConfig,
                chainId: ChainId.mainnet,
                ticker: 'NEW',
              },
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
          },
          async ({ controller, triggerNetworkStateChange }) => {
            const updateExchangeRatesSpy = jest
              .spyOn(controller, 'updateExchangeRates')
              .mockResolvedValue();
            triggerNetworkStateChange({
              ...defaultNetworkState,
              providerConfig: {
                ...defaultNetworkState.providerConfig,
                chainId: ChainId['linea-mainnet'],
                ticker: NetworksTicker.mainnet,
              },
            });

            expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
          },
        );
      });

      it('should clear contractExchangeRates state when ticker changes', async () => {
        await withController(
          {
            options: {
              interval: 100,
              state: {
                ...getDefaultTokenRatesControllerState(),
                contractExchangeRates: {
                  '0x0000000000000000000000000000000000000001': 0.001,
                  '0x0000000000000000000000000000000000000002': 0.002,
                },
              },
            },
          },
          async ({ controller, triggerNetworkStateChange }) => {
            jest.spyOn(controller, 'updateExchangeRates').mockResolvedValue();
            triggerNetworkStateChange({
              ...defaultNetworkState,
              providerConfig: {
                ...defaultNetworkState.providerConfig,
                chainId: ChainId.mainnet,
                ticker: 'NEW',
              },
            });

            expect(controller.state.contractExchangeRates).toStrictEqual({});
          },
        );
      });

      it('should clear contractExchangeRates state when chain ID changes', async () => {
        await withController(
          {
            options: {
              interval: 100,
            },
          },
          async ({ controller, triggerNetworkStateChange }) => {
            jest.spyOn(controller, 'updateExchangeRates').mockResolvedValue();
            triggerNetworkStateChange({
              ...defaultNetworkState,
              providerConfig: {
                ...defaultNetworkState.providerConfig,
                chainId: ChainId['linea-mainnet'],
                ticker: NetworksTicker.mainnet,
              },
            });

            expect(controller.state.contractExchangeRates).toStrictEqual({});
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
          },
          async ({ controller, triggerTokensStateChange }) => {
            await controller.start();
            triggerTokensStateChange({
              ...getDefaultTokensState(),
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
            });

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
          },
          async ({ controller, triggerTokensStateChange }) => {
            triggerTokensStateChange({
              ...getDefaultTokensState(),
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
            });
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
        },
        async ({
          controller,
          mockGetNetworkClientById,
          triggerTokensStateChange,
        }) => {
          mockGetNetworkClientById(
            () =>
              ({
                configuration: {
                  chainId: [ChainId.mainnet],
                  ticker: NetworksTicker.mainnet,
                },
              } as unknown as AutoManagedNetworkClient<CustomNetworkClientConfiguration>),
          );
          triggerTokensStateChange({
            ...getDefaultTokensState(),
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
          });
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
            },
            async ({
              controller,
              triggerTokensStateChange,
              mockGetNetworkClientById,
            }) => {
              mockGetNetworkClientById(
                () =>
                  ({
                    configuration: {
                      chainId: [ChainId.mainnet],
                      ticker: NetworksTicker.mainnet,
                    },
                  } as unknown as AutoManagedNetworkClient<CustomNetworkClientConfiguration>),
              );
              triggerTokensStateChange({
                ...getDefaultTokensState(),
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
              });
              controller.startPollingByNetworkClientId('mainnet');
              await advanceTime({ clock, duration: 0 });

              expect(
                controller.state.contractExchangeRatesByChainId,
              ).toStrictEqual({
                [ChainId.mainnet]: {
                  ETH: {
                    '0x02': 0.001,
                    '0x03': 0.002,
                  },
                },
              });
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

          await withController(
            {
              options: {
                tokenPricesService,
              },
            },
            async ({
              controller,
              mockGetNetworkClientById,
              triggerTokensStateChange,
            }) => {
              mockGetNetworkClientById(
                () =>
                  ({
                    configuration: {
                      chainId: [ChainId.mainnet],
                      ticker: 'LOL',
                    },
                  } as unknown as AutoManagedNetworkClient<CustomNetworkClientConfiguration>),
              );
              triggerTokensStateChange({
                ...getDefaultTokensState(),
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
              });
              controller.startPollingByNetworkClientId('mainnet');
              // flush promises and advance setTimeouts they enqueue 3 times
              // needed because fetch() doesn't resolve immediately, so any
              // downstream promises aren't flushed until the next advanceTime loop
              await advanceTime({ clock, duration: 1, stepSize: 1 / 3 });

              expect(
                controller.state.contractExchangeRatesByChainId,
              ).toStrictEqual({
                [ChainId.mainnet]: {
                  LOL: {
                    // token price in LOL = (token price in ETH) * (ETH value in LOL)
                    '0x02': 0.0005,
                    '0x03': 0.001,
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
            },
            async ({
              controller,
              mockGetNetworkClientById,
              triggerTokensStateChange,
            }) => {
              mockGetNetworkClientById(
                () =>
                  ({
                    configuration: {
                      chainId: [ChainId.mainnet],
                      ticker: 'LOL',
                    },
                  } as unknown as AutoManagedNetworkClient<CustomNetworkClientConfiguration>),
              );
              triggerTokensStateChange({
                ...getDefaultTokensState(),
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
              });
              controller.startPollingByNetworkClientId('mainnet');
              // flush promises and advance setTimeouts they enqueue 3 times
              // needed because fetch() doesn't resolve immediately, so any
              // downstream promises aren't flushed until the next advanceTime loop
              await advanceTime({ clock, duration: 1, stepSize: 1 / 3 });

              expect(
                controller.state.contractExchangeRatesByChainId,
              ).toStrictEqual({
                [ChainId.mainnet]: {
                  LOL: {},
                },
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
        },
        async ({
          controller,
          triggerTokensStateChange,
          mockGetNetworkClientById,
        }) => {
          mockGetNetworkClientById(
            () =>
              ({
                configuration: {
                  chainId: [ChainId.mainnet],
                  ticker: NetworksTicker.mainnet,
                },
              } as unknown as AutoManagedNetworkClient<CustomNetworkClientConfiguration>),
          );
          triggerTokensStateChange({
            ...getDefaultTokensState(),
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
          });
          const pollingToken =
            controller.startPollingByNetworkClientId('mainnet');
          await advanceTime({ clock, duration: 0 });
          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);

          controller.stopPollingByPollingToken(pollingToken);

          await advanceTime({ clock, duration: interval });
          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);
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
              [toHex(1)]: {
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
            chainId: toHex(1),
            controller,
            triggerTokensStateChange,
            triggerNetworkStateChange,
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
      await withController(
        async ({
          controller,
          triggerTokensStateChange,
          triggerNetworkStateChange,
        }) => {
          const tokenAddress = '0x0000000000000000000000000000000000000001';
          const differentAccount = '0x1000000000000000000000000000000000000000';
          controller.enable();
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
            chainId: toHex(1),
            controller,
            triggerTokensStateChange,
            triggerNetworkStateChange,
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
                  [toHex(1)]: {
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
                chainId: toHex(1),
                controller,
                triggerTokensStateChange,
                triggerNetworkStateChange,
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
            chainId: toHex(1),
            controller,
            triggerTokensStateChange,
            triggerNetworkStateChange,
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
        async ({
          controller,
          triggerTokensStateChange,
          triggerNetworkStateChange,
        }) => {
          await callUpdateExchangeRatesMethod({
            allTokens: {
              [toHex(137)]: {
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
            chainId: toHex(137),
            controller,
            triggerTokensStateChange,
            triggerNetworkStateChange,
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
            chainId: toHex(999),
            controller,
            triggerTokensStateChange,
            triggerNetworkStateChange,
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
              chainId: toHex(1),
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
 * A callback for the `withController` helper function.
 *
 * @param args - The arguments.
 * @param args.controller - The controller that the test helper created.
 * @param args.controllerEvents - A collection of methods for dispatching mock
 * events from external controllers.
 */
type WithControllerCallback<ReturnValue> = ({
  controller,
  mockTokensGetState,
  mockGetNetworkClientById,
  mockNetworkState,
  mockPreferencesGetState,
  callActionSpy,
  triggerPreferencesStateChange,
  triggerTokensStateChange,
  triggerNetworkStateChange,
}: {
  controller: TokenRatesController;
  mockTokensGetState: (state: TokensState) => void;
  mockGetNetworkClientById: (
    handler: (
      networkClientId: NetworkClientId,
    ) => AutoManagedNetworkClient<CustomNetworkClientConfiguration>,
  ) => void;
  mockNetworkState: (state: NetworkState) => void;
  mockPreferencesGetState: (state: PreferencesState) => void;
  callActionSpy: jest.SpyInstance;
  triggerPreferencesStateChange: (state: PreferencesState) => void;
  triggerTokensStateChange: (state: TokensState) => void;
  triggerNetworkStateChange: (state: NetworkState) => void;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<ConstructorParameters<typeof TokenRatesController>[0]>;
  messenger?: ControllerMessenger<AllowedActions, AllowedEvents>;
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
  const { options, messenger } = rest;
  const controllerMessenger =
    messenger ?? new ControllerMessenger<AllowedActions, AllowedEvents>();

  const mockTokensState = jest.fn<TokensState, []>();
  controllerMessenger.registerActionHandler(
    'TokensController:getState',
    mockTokensState.mockReturnValue({ ...getDefaultTokensState() }),
  );

  const mockGetNetworkClientById = jest.fn<
    ReturnType<NetworkController['getNetworkClientById']>,
    Parameters<NetworkController['getNetworkClientById']>
  >();
  controllerMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    mockGetNetworkClientById.mockImplementation(() => {
      return {
        configuration: { chainId: [ChainId.mainnet] },
        provider: {},
        destroy: {},
        blockTracker: {},
      } as unknown as AutoManagedNetworkClient<CustomNetworkClientConfiguration>;
    }),
  );

  const mockNetworkState = jest.fn<NetworkState, []>();
  controllerMessenger.registerActionHandler(
    'NetworkController:getState',
    mockNetworkState.mockReturnValue({ ...defaultNetworkState }),
  );

  const mockPreferencesState = jest.fn<PreferencesState, []>();
  controllerMessenger.registerActionHandler(
    'PreferencesController:getState',
    mockPreferencesState.mockReturnValue({
      ...getDefaultPreferencesState(),
      selectedAddress: defaultSelectedAddress,
    }),
  );

  const callActionSpy = jest.spyOn(controllerMessenger, 'call');

  const controller = new TokenRatesController({
    tokenPricesService: buildMockTokenPricesService(),
    messenger: buildTokenRatesControllerMessenger(controllerMessenger),
    ...options,
  });
  try {
    return await fn({
      controller,
      mockTokensGetState: (state: TokensState) => {
        mockTokensState.mockReturnValue(state);
      },
      mockGetNetworkClientById: (
        handler: (
          networkClientId: NetworkClientId,
        ) => AutoManagedNetworkClient<CustomNetworkClientConfiguration>,
      ) => {
        mockGetNetworkClientById.mockImplementation(handler);
      },
      mockNetworkState: (state: NetworkState) => {
        mockNetworkState.mockReturnValue(state);
      },
      mockPreferencesGetState: (state: PreferencesState) => {
        mockPreferencesState.mockReturnValue(state);
      },
      callActionSpy,
      triggerPreferencesStateChange: (state: PreferencesState) => {
        controllerMessenger.publish(
          'PreferencesController:stateChange',
          state,
          [],
        );
      },
      triggerTokensStateChange: (state: TokensState) => {
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
 */
async function callUpdateExchangeRatesMethod({
  allTokens,
  chainId,
  controller,
  triggerTokensStateChange,
  triggerNetworkStateChange,
  method,
  nativeCurrency,
  setChainAsCurrent = true,
}: {
  allTokens: TokensState['allTokens'];
  chainId: Hex;
  controller: TokenRatesController;
  triggerTokensStateChange: (state: TokensState) => void;
  triggerNetworkStateChange: (state: NetworkState) => void;
  method: 'updateExchangeRates' | 'updateExchangeRatesByChainId';
  nativeCurrency: string;
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
  triggerTokensStateChange({
    ...getDefaultTokensState(),
    allDetectedTokens: {},
    allTokens,
  });

  if (setChainAsCurrent) {
    // We're using controller events here instead of calling `configure`
    // because `configure` does not update internal controller state correctly.
    // As with many BaseControllerV1-based controllers, runtime config
    // modification is allowed by the API but not supported in practice.
    triggerNetworkStateChange({
      ...defaultNetworkState,
      providerConfig: {
        ...defaultNetworkState.providerConfig,
        chainId,
        ticker: nativeCurrency,
      },
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
