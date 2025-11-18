import { deriveStateFromMetadata } from '@metamask/base-controller';
import {
  ChainId,
  InfuraNetworkType,
  NetworksTicker,
  toChecksumHexAddress,
  toHex,
} from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MessengerActions,
  type MessengerEvents,
  type MockAnyNamespace,
} from '@metamask/messenger';
import type {
  NetworkClientConfiguration,
  NetworkClientId,
  NetworkState,
} from '@metamask/network-controller';
import { getDefaultNetworkControllerState } from '@metamask/network-controller';
import type { CaipAssetType, Hex } from '@metamask/utils';
import { add0x, KnownCaipNamespace } from '@metamask/utils';
import assert from 'assert';
import type { Patch } from 'immer';
import nock from 'nock';
import { useFakeTimers } from 'sinon';

import { TOKEN_PRICES_BATCH_SIZE } from './assetsUtil';
import type {
  AbstractTokenPricesService,
  EvmAssetWithMarketData,
} from './token-prices-service/abstract-token-prices-service';
import { ZERO_ADDRESS } from './token-prices-service/codefi-v2';
import { controllerName, TokenRatesController } from './TokenRatesController';
import type {
  Token,
  TokenRatesControllerMessenger,
  TokenRatesControllerState,
} from './TokenRatesController';
import { getDefaultTokensState } from './TokensController';
import type { TokensControllerState } from './TokensController';
import { advanceTime, flushPromises } from '../../../tests/helpers';
import { createMockInternalAccount } from '../../accounts-controller/src/tests/mocks';
import {
  buildCustomNetworkClientConfiguration,
  buildMockGetNetworkClientById,
} from '../../network-controller/tests/helpers';

const defaultSelectedAddress = '0x1111111111111111111111111111111111111111';
const defaultSelectedAccount = createMockInternalAccount({
  address: defaultSelectedAddress,
});
const mockTokenAddress = '0x0000000000000000000000000000000000000010';

type AllTokenRatesControllerActions =
  MessengerActions<TokenRatesControllerMessenger>;

type AllTokenRatesControllerEvents =
  MessengerEvents<TokenRatesControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllTokenRatesControllerActions,
  AllTokenRatesControllerEvents
>;

/**
 * Builds a messenger that `TokenRatesController` can use to communicate with other controllers.
 *
 * @param messenger - The root messenger.
 * @returns The controller messenger.
 */
function buildTokenRatesControllerMessenger(
  messenger: RootMessenger = new Messenger({ namespace: MOCK_ANY_NAMESPACE }),
): TokenRatesControllerMessenger {
  const tokenRatesControllerMessenger = new Messenger<
    'TokenRatesController',
    AllTokenRatesControllerActions,
    AllTokenRatesControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: messenger,
  });
  messenger.delegate({
    messenger: tokenRatesControllerMessenger,
    actions: [
      'TokensController:getState',
      'NetworkController:getNetworkClientById',
      'NetworkController:getState',
      'AccountsController:getAccount',
      'AccountsController:getSelectedAccount',
    ],
    events: ['TokensController:stateChange', 'NetworkController:stateChange'],
  });
  return tokenRatesControllerMessenger;
}

describe('TokenRatesController', () => {
  describe('constructor', () => {
    // let clock: sinon.SinonFakeTimers;

    // beforeEach(() => {
    //   clock = useFakeTimers({ now: Date.now() });
    // });

    // afterEach(() => {
    //   clock.restore();
    // });

    it('should set default state', async () => {
      await withController(async ({ controller }) => {
        expect(controller.state).toStrictEqual({
          marketData: {},
        });
      });
    });
  });

  describe('updateExchangeRates', () => {
    it('fetches rates for tokens in one batch', async () => {
      const chainId = '0x1';
      const nativeCurrency = 'ETH';

      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: fetchTokenPricesWithIncreasingPriceForEachToken,
      });
      jest.spyOn(tokenPricesService, 'fetchTokenPrices');

      await withController(
        {
          options: {
            tokenPricesService,
          },
          mockTokensControllerState: {
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                ],
              },
            },
          },
        },
        async ({ controller }) => {
          await controller.updateExchangeRates([
            {
              chainId,
              nativeCurrency,
            },
          ]);

          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);
          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledWith({
            assets: [
              {
                chainId,
                tokenAddress: '0x0000000000000000000000000000000000000000',
              },
              {
                chainId,
                tokenAddress: '0x0000000000000000000000000000000000000001',
              },
            ],
            currency: nativeCurrency,
          });

          expect(controller.state.marketData).toStrictEqual({
            '0x1': {
              '0x0000000000000000000000000000000000000000':
                expect.objectContaining({
                  currency: nativeCurrency,
                  price: 0.001,
                }),
              '0x0000000000000000000000000000000000000001':
                expect.objectContaining({
                  currency: nativeCurrency,
                  price: 0.002,
                }),
            },
          });
        },
      );
    });

    it('fetches rates for all tokens in batches', async () => {
      const chainId = '0x1';
      const nativeCurrency = 'ETH';

      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: fetchTokenPricesWithIncreasingPriceForEachToken,
      });
      jest.spyOn(tokenPricesService, 'fetchTokenPrices');

      const tokenAddresses = [...new Array(200).keys()]
        .map(buildAddress)
        .sort();
      const tokens = tokenAddresses.map((tokenAddress) => {
        return buildToken({ address: tokenAddress });
      });
      await withController(
        {
          options: {
            tokenPricesService,
          },
          mockTokensControllerState: {
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: tokens,
              },
            },
          },
        },
        async ({ controller }) => {
          await controller.updateExchangeRates([
            {
              chainId,
              nativeCurrency,
            },
          ]);
          const numBatches = Math.ceil(
            tokenAddresses.length / TOKEN_PRICES_BATCH_SIZE,
          );
          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(
            numBatches,
          );

          for (let i = 1; i <= numBatches; i++) {
            expect(tokenPricesService.fetchTokenPrices).toHaveBeenNthCalledWith(
              i,
              {
                assets: tokenAddresses
                  .slice(
                    (i - 1) * TOKEN_PRICES_BATCH_SIZE,
                    i * TOKEN_PRICES_BATCH_SIZE,
                  )
                  .map((tokenAddress) => ({
                    chainId,
                    tokenAddress,
                  })),
                currency: nativeCurrency,
              },
            );
          }
        },
      );
    });

    it('leaves unsupported chain state keys empty', async () => {
      const chainId = '0x1';
      const nativeCurrency = 'ETH';

      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: fetchTokenPricesWithIncreasingPriceForEachToken,
        validateChainIdSupported: (_chainId: unknown): _chainId is Hex => false,
      });
      jest.spyOn(tokenPricesService, 'fetchTokenPrices');

      await withController(
        {
          options: {
            tokenPricesService,
          },
        },
        async ({ controller }) => {
          await controller.updateExchangeRates([
            {
              chainId,
              nativeCurrency,
            },
          ]);

          expect(tokenPricesService.fetchTokenPrices).not.toHaveBeenCalled();
          expect(controller.state.marketData).toStrictEqual({
            [chainId]: {},
          });
        },
      );
    });
  });

  describe('_executePoll', () => {
    it('fetches rates for the given chains', async () => {
      await withController({}, async ({ controller }) => {
        jest.spyOn(controller, 'updateExchangeRates');

        await controller._executePoll({ chainIds: ['0x1'] });

        expect(controller.updateExchangeRates).toHaveBeenCalledWith([
          {
            chainId: '0x1',
            nativeCurrency: 'ETH',
          },
        ]);
      });
    });

    it('does not include chains with no network configuration', async () => {
      await withController(
        {
          mockNetworkState: {
            networkConfigurationsByChainId: {},
          },
        },
        async ({ controller }) => {
          jest.spyOn(controller, 'updateExchangeRates');

          await controller._executePoll({ chainIds: ['0x1'] });

          expect(controller.updateExchangeRates).toHaveBeenCalledWith([]);
        },
      );
    });
  });

  describe('TokensController:stateChange', () => {
    it('fetches rates for all updated chains', async () => {
      jest.useFakeTimers();
      const chainId = '0x1';
      const nativeCurrency = 'ETH';

      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: fetchTokenPricesWithIncreasingPriceForEachToken,
      });
      jest.spyOn(tokenPricesService, 'fetchTokenPrices');

      await withController(
        {
          options: {
            tokenPricesService,
          },
        },
        async ({ controller, triggerTokensStateChange }) => {
          triggerTokensStateChange({
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                ],
              },
            },
            allDetectedTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                  {
                    address: '0x0000000000000000000000000000000000000002',
                    decimals: 0,
                    symbol: 'TOK2',
                  },
                ],
              },
            },
            allIgnoredTokens: {},
          });

          jest.advanceTimersToNextTimer();
          await flushPromises();

          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);
          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledWith({
            assets: [
              {
                chainId,
                tokenAddress: '0x0000000000000000000000000000000000000000',
              },
              {
                chainId,
                tokenAddress: '0x0000000000000000000000000000000000000001',
              },
              {
                chainId,
                tokenAddress: '0x0000000000000000000000000000000000000002',
              },
            ],
            currency: nativeCurrency,
          });

          expect(controller.state.marketData).toStrictEqual({
            [chainId]: {
              '0x0000000000000000000000000000000000000000':
                expect.objectContaining({
                  currency: nativeCurrency,
                  price: 0.001,
                }),
              '0x0000000000000000000000000000000000000001':
                expect.objectContaining({
                  currency: nativeCurrency,
                  price: 0.002,
                }),
              '0x0000000000000000000000000000000000000002':
                expect.objectContaining({
                  currency: nativeCurrency,
                  price: 0.003,
                }),
            },
          });
        },
      );
    });

    it('does not fetch when disabled', async () => {
      jest.useFakeTimers();
      const chainId = '0x1';

      await withController(
        {
          options: {
            disabled: true,
          },
        },
        async ({ controller, triggerTokensStateChange }) => {
          jest.spyOn(controller, 'updateExchangeRates');

          triggerTokensStateChange({
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                ],
              },
            },
            allDetectedTokens: {},
            allIgnoredTokens: {},
          });

          jest.advanceTimersToNextTimer();
          await flushPromises();

          expect(controller.updateExchangeRates).not.toHaveBeenCalled();
        },
      );
    });

    it('does not include chains with no network configuration', async () => {
      jest.useFakeTimers();
      const chainId = '0x1';

      await withController(
        {
          mockNetworkState: {
            networkConfigurationsByChainId: {},
          },
        },
        async ({ controller, triggerTokensStateChange }) => {
          jest.spyOn(controller, 'updateExchangeRates');

          triggerTokensStateChange({
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                ],
              },
            },
            allDetectedTokens: {},
            allIgnoredTokens: {},
          });

          jest.advanceTimersToNextTimer();
          await flushPromises();

          expect(controller.updateExchangeRates).toHaveBeenCalledWith([]);
        },
      );
    });
  });

  describe('enable', () => {
    it('enables events', async () => {
      jest.useFakeTimers();

      const chainId = '0x1';
      await withController(
        {
          options: {
            disabled: true,
          },
        },
        async ({ controller, triggerTokensStateChange }) => {
          jest.spyOn(controller, 'updateExchangeRates');

          controller.enable();

          triggerTokensStateChange({
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                ],
              },
            },
            allDetectedTokens: {},
            allIgnoredTokens: {},
          });

          jest.advanceTimersToNextTimer();
          await flushPromises();

          expect(controller.updateExchangeRates).toHaveBeenCalledWith([
            {
              chainId,
              nativeCurrency: 'ETH',
            },
          ]);
        },
      );
    });
  });

  describe('disable', () => {
    it('disables events', async () => {
      jest.useFakeTimers();

      const chainId = '0x1';
      await withController(
        {
          options: {
            disabled: false,
          },
        },
        async ({ controller, triggerTokensStateChange }) => {
          jest.spyOn(controller, 'updateExchangeRates');

          controller.disable();

          triggerTokensStateChange({
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                ],
              },
            },
            allDetectedTokens: {},
            allIgnoredTokens: {},
          });

          jest.advanceTimersToNextTimer();
          await flushPromises();

          expect(controller.updateExchangeRates).not.toHaveBeenCalled();
        },
      );
    });
  });

  // describe('TokensController::stateChange', () => {
  //   let clock: sinon.SinonFakeTimers;

  //   beforeEach(() => {
  //     clock = useFakeTimers({ now: Date.now() });
  //   });

  //   afterEach(() => {
  //     clock.restore();
  //   });

  //   describe('when legacy polling is active', () => {
  //     it('should update exchange rates when any of the addresses in the "all tokens" collection change', async () => {
  //       const tokenAddresses = ['0xE1', '0xE2'];
  //       await withController(
  //         {
  //           mockTokensControllerState: {
  //             allTokens: {
  //               [ChainId.mainnet]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: tokenAddresses[0],
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           },
  //         },
  //         async ({ controller, triggerTokensStateChange }) => {
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           await controller.start(ChainId.mainnet, 'ETH');
  //           triggerTokensStateChange({
  //             ...getDefaultTokensState(),
  //             allTokens: {
  //               [ChainId.mainnet]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: tokenAddresses[1],
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           });

  //           // Once when starting, and another when tokens state changes
  //           expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(2);
  //         },
  //       );
  //     });

  //     it('should update exchange rates when any of the addresses in the "all tokens" collection change with invalid addresses', async () => {
  //       const tokenAddresses = ['0xinvalidAddress'];
  //       await withController(
  //         {
  //           mockTokensControllerState: {
  //             allTokens: {
  //               [ChainId.mainnet]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: tokenAddresses[0],
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           },
  //         },
  //         async ({ controller, triggerTokensStateChange }) => {
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           await controller.start(ChainId.mainnet, 'ETH');
  //           triggerTokensStateChange({
  //             ...getDefaultTokensState(),
  //             allTokens: {
  //               [ChainId.mainnet]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: tokenAddresses[1],
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           });

  //           // Once when starting, and another when tokens state changes
  //           expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(2);
  //         },
  //       );
  //     });

  //     it('should update exchange rates when any of the addresses in the "all detected tokens" collection change', async () => {
  //       const tokenAddresses = ['0xE1', '0xE2'];
  //       await withController(
  //         {
  //           mockTokensControllerState: {
  //             allDetectedTokens: {
  //               [ChainId.mainnet]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: tokenAddresses[0],
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           },
  //         },
  //         async ({ controller, triggerTokensStateChange }) => {
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           await controller.start(ChainId.mainnet, 'ETH');
  //           triggerTokensStateChange({
  //             ...getDefaultTokensState(),
  //             allDetectedTokens: {
  //               [ChainId.mainnet]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: tokenAddresses[1],
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           });
  //           // Once when starting, and another when tokens state changes
  //           expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(2);
  //         },
  //       );
  //     });

  //     it('should not update exchange rates if both the "all tokens" or "all detected tokens" are exactly the same', async () => {
  //       const tokensState = {
  //         allTokens: {
  //           [ChainId.mainnet]: {
  //             [defaultSelectedAddress]: [
  //               {
  //                 address: mockTokenAddress,
  //                 decimals: 0,
  //                 symbol: '',
  //                 aggregators: [],
  //               },
  //             ],
  //           },
  //         },
  //       };
  //       await withController(
  //         {
  //           mockTokensControllerState: {
  //             ...tokensState,
  //           },
  //         },
  //         async ({ controller, triggerTokensStateChange }) => {
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           await controller.start(ChainId.mainnet, 'ETH');
  //           triggerTokensStateChange({
  //             ...getDefaultTokensState(),
  //             ...tokensState,
  //           });

  //           // Once when starting, and that's it
  //           expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
  //         },
  //       );
  //     });

  //     it('should not update exchange rates if all of the tokens in "all tokens" just move to "all detected tokens"', async () => {
  //       const tokens = {
  //         [ChainId.mainnet]: {
  //           [defaultSelectedAddress]: [
  //             {
  //               address: mockTokenAddress,
  //               decimals: 0,
  //               symbol: '',
  //               aggregators: [],
  //             },
  //           ],
  //         },
  //       };
  //       await withController(
  //         {
  //           mockTokensControllerState: {
  //             allTokens: tokens,
  //           },
  //         },
  //         async ({ controller, triggerTokensStateChange }) => {
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           await controller.start(ChainId.mainnet, 'ETH');
  //           triggerTokensStateChange({
  //             ...getDefaultTokensState(),
  //             allDetectedTokens: tokens,
  //           });

  //           // Once when starting, and that's it
  //           expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
  //         },
  //       );
  //     });

  //     it('should not update exchange rates if a new token is added to "all detected tokens" but is already present in "all tokens"', async () => {
  //       const tokens = {
  //         [ChainId.mainnet]: {
  //           [defaultSelectedAddress]: [
  //             {
  //               address: mockTokenAddress,
  //               decimals: 0,
  //               symbol: '',
  //               aggregators: [],
  //             },
  //           ],
  //         },
  //       };
  //       await withController(
  //         {
  //           mockTokensControllerState: {
  //             allTokens: tokens,
  //           },
  //         },
  //         async ({ controller, triggerTokensStateChange }) => {
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           await controller.start(ChainId.mainnet, 'ETH');
  //           triggerTokensStateChange({
  //             ...getDefaultTokensState(),
  //             allTokens: tokens,
  //             allDetectedTokens: tokens,
  //           });

  //           // Once when starting, and that's it
  //           expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
  //         },
  //       );
  //     });

  //     it('should not update exchange rates if a new token is added to "all tokens" but is already present in "all detected tokens"', async () => {
  //       const tokens = {
  //         [ChainId.mainnet]: {
  //           [defaultSelectedAddress]: [
  //             {
  //               address: mockTokenAddress,
  //               decimals: 0,
  //               symbol: '',
  //               aggregators: [],
  //             },
  //           ],
  //         },
  //       };
  //       await withController(
  //         {
  //           mockTokensControllerState: {
  //             allDetectedTokens: tokens,
  //           },
  //         },
  //         async ({ controller, triggerTokensStateChange }) => {
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           await controller.start(ChainId.mainnet, 'ETH');
  //           triggerTokensStateChange({
  //             ...getDefaultTokensState(),
  //             allTokens: tokens,
  //             allDetectedTokens: tokens,
  //           });

  //           // Once when starting, and that's it
  //           expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
  //         },
  //       );
  //     });

  //     it('should not update exchange rates if none of the addresses in "all tokens" or "all detected tokens" change, even if other parts of the token change', async () => {
  //       await withController(
  //         {
  //           mockTokensControllerState: {
  //             ...getDefaultTokensState(),
  //             allDetectedTokens: {
  //               [ChainId.mainnet]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: mockTokenAddress,
  //                     decimals: 3,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           },
  //         },
  //         async ({ controller, triggerTokensStateChange }) => {
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           await controller.start(ChainId.mainnet, 'ETH');
  //           triggerTokensStateChange({
  //             ...getDefaultTokensState(),
  //             allDetectedTokens: {
  //               [ChainId.mainnet]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: mockTokenAddress,
  //                     decimals: 7,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           });

  //           // Once when starting, and that's it
  //           expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
  //         },
  //       );
  //     });

  //     it('should not update exchange rates if none of the addresses in "all tokens" or "all detected tokens" change, when normalized to checksum addresses', async () => {
  //       await withController(
  //         {
  //           mockTokensControllerState: {
  //             allDetectedTokens: {
  //               [ChainId.mainnet]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: '0x0EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE2',
  //                     decimals: 3,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           },
  //         },
  //         async ({ controller, triggerTokensStateChange }) => {
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           await controller.start(ChainId.mainnet, 'ETH');
  //           triggerTokensStateChange({
  //             ...getDefaultTokensState(),
  //             allDetectedTokens: {
  //               [ChainId.mainnet]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: '0x0eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee2',
  //                     decimals: 7,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           });

  //           // Once when starting, and that's it
  //           expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
  //         },
  //       );
  //     });

  //     it('should not update exchange rates if any of the addresses in "all tokens" or "all detected tokens" merely change order', async () => {
  //       await withController(
  //         {
  //           mockTokensControllerState: {
  //             allDetectedTokens: {
  //               [ChainId.mainnet]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: '0xE1',
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                   {
  //                     address: '0xE2',
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           },
  //         },
  //         async ({ controller, triggerTokensStateChange }) => {
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           await controller.start(ChainId.mainnet, 'ETH');
  //           triggerTokensStateChange({
  //             ...getDefaultTokensState(),
  //             allDetectedTokens: {
  //               [ChainId.mainnet]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: '0xE2',
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                   {
  //                     address: '0xE1',
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           });

  //           // Once when starting, and that's it
  //           expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
  //         },
  //       );
  //     });
  //   });

  //   describe('when legacy polling is inactive', () => {
  //     it('should not update exchange rates when any of the addresses in the "all tokens" collection change', async () => {
  //       const tokenAddresses = ['0xE1', '0xE2'];
  //       await withController(
  //         {
  //           mockTokensControllerState: {
  //             allTokens: {
  //               [ChainId.mainnet]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: tokenAddresses[0],
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           },
  //         },
  //         async ({ controller, triggerTokensStateChange }) => {
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           triggerTokensStateChange({
  //             ...getDefaultTokensState(),
  //             allTokens: {
  //               [ChainId.mainnet]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: tokenAddresses[1],
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           });

  //           expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
  //         },
  //       );
  //     });

  //     it('should not update exchange rates when any of the addresses in the "all detected tokens" collection change', async () => {
  //       const tokenAddresses = ['0xE1', '0xE2'];
  //       await withController(
  //         {
  //           mockTokensControllerState: {
  //             allDetectedTokens: {
  //               [ChainId.mainnet]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: tokenAddresses[0],
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           },
  //         },
  //         async ({ controller, triggerTokensStateChange }) => {
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           triggerTokensStateChange({
  //             ...getDefaultTokensState(),
  //             allDetectedTokens: {
  //               [ChainId.mainnet]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: tokenAddresses[1],
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           });

  //           expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
  //         },
  //       );
  //     });
  //   });
  // });

  // describe('NetworkController::stateChange', () => {
  //   let clock: sinon.SinonFakeTimers;

  //   beforeEach(() => {
  //     clock = useFakeTimers({ now: Date.now() });
  //   });

  //   afterEach(() => {
  //     clock.restore();
  //   });

  //   describe('when polling is active', () => {
  //     it('should update exchange rates when ticker changes', async () => {
  //       await withController(
  //         {
  //           options: {
  //             interval: 100,
  //           },
  //           mockNetworkClientConfigurationsByNetworkClientId: {
  //             'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
  //               chainId: toHex(1337),
  //               ticker: 'NEW',
  //             }),
  //           },
  //         },
  //         async ({ controller, triggerNetworkStateChange }) => {
  //           await controller.start(ChainId.mainnet, 'ETH');
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           triggerNetworkStateChange({
  //             ...getDefaultNetworkControllerState(),
  //             selectedNetworkClientId: 'AAAA-BBBB-CCCC-DDDD',
  //           });

  //           expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
  //         },
  //       );
  //     });

  //     it('should not update exchange rates when chain ID changes', async () => {
  //       await withController(
  //         {
  //           options: {
  //             interval: 100,
  //           },
  //           mockNetworkClientConfigurationsByNetworkClientId: {
  //             'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
  //               chainId: toHex(1338),
  //               ticker: 'TEST',
  //             }),
  //           },
  //         },
  //         async ({ controller, triggerNetworkStateChange }) => {
  //           await controller.start(ChainId.mainnet, 'ETH');
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           triggerNetworkStateChange({
  //             ...getDefaultNetworkControllerState(),
  //             selectedNetworkClientId: 'AAAA-BBBB-CCCC-DDDD',
  //           });

  //           expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
  //         },
  //       );
  //     });

  //     it('should clear marketData in state when event is triggeredclear', async () => {
  //       await withController(
  //         {
  //           options: {
  //             interval: 100,
  //             state: {
  //               marketData: {
  //                 [ChainId.mainnet]: {
  //                   '0x02': {
  //                     currency: 'ETH',
  //                     priceChange1d: 0,
  //                     pricePercentChange1d: 0,
  //                     tokenAddress: '0x02',
  //                     allTimeHigh: 4000,
  //                     allTimeLow: 900,
  //                     circulatingSupply: 2000,
  //                     dilutedMarketCap: 100,
  //                     high1d: 200,
  //                     low1d: 100,
  //                     marketCap: 1000,
  //                     marketCapPercentChange1d: 100,
  //                     price: 0.001,
  //                     pricePercentChange14d: 100,
  //                     pricePercentChange1h: 1,
  //                     pricePercentChange1y: 200,
  //                     pricePercentChange200d: 300,
  //                     pricePercentChange30d: 200,
  //                     pricePercentChange7d: 100,
  //                     totalVolume: 100,
  //                   },
  //                 },
  //               },
  //             },
  //           },
  //           mockNetworkClientConfigurationsByNetworkClientId: {
  //             'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
  //               chainId: toHex(1337),
  //               ticker: 'NEW',
  //             }),
  //           },
  //         },
  //         async ({ controller, triggerNetworkStateChange }) => {
  //           await controller.start(ChainId.mainnet, 'ETH');
  //           jest.spyOn(controller, 'updateExchangeRates').mockResolvedValue();
  //           triggerNetworkStateChange({
  //             ...getDefaultNetworkControllerState(),
  //             selectedNetworkClientId: 'AAAA-BBBB-CCCC-DDDD',
  //           });

  //           expect(controller.state.marketData).toStrictEqual({
  //             '0x1': {},
  //           });
  //         },
  //       );
  //     });

  //     it('should update exchange rates when network state changes without adding a new network', async () => {
  //       await withController(
  //         {
  //           options: {
  //             interval: 100,
  //           },
  //           mockNetworkClientConfigurationsByNetworkClientId: {
  //             'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
  //               chainId: ChainId.mainnet,
  //               ticker: NetworksTicker.mainnet,
  //             }),
  //           },
  //         },
  //         async ({ controller, triggerNetworkStateChange }) => {
  //           await controller.start(ChainId.mainnet, 'ETH');
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           triggerNetworkStateChange(
  //             {
  //               ...getDefaultNetworkControllerState(),
  //               selectedNetworkClientId: 'AAAA-BBBB-CCCC-DDDD',
  //             },
  //             [
  //               {
  //                 op: 'add',
  //                 path: ['networkConfigurationsByChainId', ChainId.mainnet],
  //               },
  //             ],
  //           );
  //           expect(updateExchangeRatesSpy).toHaveBeenCalled();
  //         },
  //       );
  //     });
  //   });

  //   describe('when polling is inactive', () => {
  //     it('should not update exchange rates when ticker changes', async () => {
  //       await withController(
  //         {
  //           options: {
  //             interval: 100,
  //           },
  //           mockNetworkClientConfigurationsByNetworkClientId: {
  //             'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
  //               chainId: toHex(1337),
  //               ticker: 'NEW',
  //             }),
  //           },
  //         },
  //         async ({ controller, triggerNetworkStateChange }) => {
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           triggerNetworkStateChange({
  //             ...getDefaultNetworkControllerState(),
  //             selectedNetworkClientId: 'AAAA-BBBB-CCCC-DDDD',
  //           });

  //           expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
  //         },
  //       );
  //     });

  //     it('should not update exchange rates when chain ID changes', async () => {
  //       await withController(
  //         {
  //           options: {
  //             interval: 100,
  //           },
  //           mockNetworkClientConfigurationsByNetworkClientId: {
  //             'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
  //               chainId: toHex(1338),
  //               ticker: 'TEST',
  //             }),
  //           },
  //         },
  //         async ({ controller, triggerNetworkStateChange }) => {
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           triggerNetworkStateChange({
  //             ...getDefaultNetworkControllerState(),
  //             selectedNetworkClientId: 'AAAA-BBBB-CCCC-DDDD',
  //           });

  //           expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
  //         },
  //       );
  //     });

  //     it('should not clear marketData state when ticker changes', async () => {
  //       await withController(
  //         {
  //           options: {
  //             interval: 100,
  //             state: {
  //               marketData: {
  //                 [ChainId.mainnet]: {
  //                   '0x02': {
  //                     currency: 'ETH',
  //                     priceChange1d: 0,
  //                     pricePercentChange1d: 0,
  //                     tokenAddress: '0x02',
  //                     allTimeHigh: 4000,
  //                     allTimeLow: 900,
  //                     circulatingSupply: 2000,
  //                     dilutedMarketCap: 100,
  //                     high1d: 200,
  //                     low1d: 100,
  //                     marketCap: 1000,
  //                     marketCapPercentChange1d: 100,
  //                     price: 0.001,
  //                     pricePercentChange14d: 100,
  //                     pricePercentChange1h: 1,
  //                     pricePercentChange1y: 200,
  //                     pricePercentChange200d: 300,
  //                     pricePercentChange30d: 200,
  //                     pricePercentChange7d: 100,
  //                     totalVolume: 100,
  //                   },
  //                 },
  //               },
  //             },
  //           },
  //           mockNetworkClientConfigurationsByNetworkClientId: {
  //             'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
  //               chainId: toHex(1337),
  //               ticker: 'NEW',
  //             }),
  //           },
  //         },
  //         async ({ controller, triggerNetworkStateChange }) => {
  //           jest.spyOn(controller, 'updateExchangeRates').mockResolvedValue();
  //           triggerNetworkStateChange({
  //             ...getDefaultNetworkControllerState(),
  //             selectedNetworkClientId: 'AAAA-BBBB-CCCC-DDDD',
  //           });

  //           expect(controller.state.marketData).toStrictEqual({
  //             '0x1': {
  //               '0x02': {
  //                 currency: 'ETH',
  //                 priceChange1d: 0,
  //                 pricePercentChange1d: 0,
  //                 tokenAddress: '0x02',
  //                 allTimeHigh: 4000,
  //                 allTimeLow: 900,
  //                 circulatingSupply: 2000,
  //                 dilutedMarketCap: 100,
  //                 high1d: 200,
  //                 low1d: 100,
  //                 marketCap: 1000,
  //                 marketCapPercentChange1d: 100,
  //                 price: 0.001,
  //                 pricePercentChange14d: 100,
  //                 pricePercentChange1h: 1,
  //                 pricePercentChange1y: 200,
  //                 pricePercentChange200d: 300,
  //                 pricePercentChange30d: 200,
  //                 pricePercentChange7d: 100,
  //                 totalVolume: 100,
  //               },
  //             },
  //           });
  //         },
  //       );
  //     });

  //     it('should not clear marketData state when chain ID changes', async () => {
  //       await withController(
  //         {
  //           options: {
  //             interval: 100,
  //             state: {
  //               marketData: {
  //                 [ChainId.mainnet]: {
  //                   '0x02': {
  //                     currency: 'ETH',
  //                     priceChange1d: 0,
  //                     pricePercentChange1d: 0,
  //                     tokenAddress: '0x02',
  //                     allTimeHigh: 4000,
  //                     allTimeLow: 900,
  //                     circulatingSupply: 2000,
  //                     dilutedMarketCap: 100,
  //                     high1d: 200,
  //                     low1d: 100,
  //                     marketCap: 1000,
  //                     marketCapPercentChange1d: 100,
  //                     price: 0.001,
  //                     pricePercentChange14d: 100,
  //                     pricePercentChange1h: 1,
  //                     pricePercentChange1y: 200,
  //                     pricePercentChange200d: 300,
  //                     pricePercentChange30d: 200,
  //                     pricePercentChange7d: 100,
  //                     totalVolume: 100,
  //                   },
  //                 },
  //               },
  //             },
  //           },
  //           mockNetworkClientConfigurationsByNetworkClientId: {
  //             'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
  //               chainId: toHex(1338),
  //               ticker: 'TEST',
  //             }),
  //           },
  //         },
  //         async ({ controller, triggerNetworkStateChange }) => {
  //           jest.spyOn(controller, 'updateExchangeRates').mockResolvedValue();
  //           triggerNetworkStateChange({
  //             ...getDefaultNetworkControllerState(),
  //             selectedNetworkClientId: 'AAAA-BBBB-CCCC-DDDD',
  //           });

  //           expect(controller.state.marketData).toStrictEqual({
  //             '0x1': {
  //               '0x02': {
  //                 currency: 'ETH',
  //                 priceChange1d: 0,
  //                 pricePercentChange1d: 0,
  //                 tokenAddress: '0x02',
  //                 allTimeHigh: 4000,
  //                 allTimeLow: 900,
  //                 circulatingSupply: 2000,
  //                 dilutedMarketCap: 100,
  //                 high1d: 200,
  //                 low1d: 100,
  //                 marketCap: 1000,
  //                 marketCapPercentChange1d: 100,
  //                 price: 0.001,
  //                 pricePercentChange14d: 100,
  //                 pricePercentChange1h: 1,
  //                 pricePercentChange1y: 200,
  //                 pricePercentChange200d: 300,
  //                 pricePercentChange30d: 200,
  //                 pricePercentChange7d: 100,
  //                 totalVolume: 100,
  //               },
  //             },
  //           });
  //         },
  //       );
  //     });
  //   });

  //   it('removes state when networks are deleted', async () => {
  //     const marketData = {
  //       [ChainId.mainnet]: {
  //         '0x123456': {
  //           currency: 'ETH',
  //           priceChange1d: 0,
  //           pricePercentChange1d: 0,
  //           tokenAddress: '0x02',
  //           allTimeHigh: 4000,
  //           allTimeLow: 900,
  //           circulatingSupply: 2000,
  //           dilutedMarketCap: 100,
  //           high1d: 200,
  //           low1d: 100,
  //           marketCap: 1000,
  //           marketCapPercentChange1d: 100,
  //           price: 0.001,
  //           pricePercentChange14d: 100,
  //           pricePercentChange1h: 1,
  //           pricePercentChange1y: 200,
  //           pricePercentChange200d: 300,
  //           pricePercentChange30d: 200,
  //           pricePercentChange7d: 100,
  //           totalVolume: 100,
  //         },
  //       },
  //       [ChainId['linea-mainnet']]: {
  //         '0x789': {
  //           currency: 'ETH',
  //           priceChange1d: 0,
  //           pricePercentChange1d: 0,
  //           tokenAddress: '0x02',
  //           allTimeHigh: 4000,
  //           allTimeLow: 900,
  //           circulatingSupply: 2000,
  //           dilutedMarketCap: 100,
  //           high1d: 200,
  //           low1d: 100,
  //           marketCap: 1000,
  //           marketCapPercentChange1d: 100,
  //           price: 0.001,
  //           pricePercentChange14d: 100,
  //           pricePercentChange1h: 1,
  //           pricePercentChange1y: 200,
  //           pricePercentChange200d: 300,
  //           pricePercentChange30d: 200,
  //           pricePercentChange7d: 100,
  //           totalVolume: 100,
  //         },
  //       },
  //     } as const;

  //     await withController(
  //       {
  //         options: {
  //           state: {
  //             marketData,
  //           },
  //         },
  //       },
  //       async ({ controller, triggerNetworkStateChange }) => {
  //         // Verify initial state with both networks
  //         expect(controller.state.marketData).toStrictEqual(marketData);

  //         triggerNetworkStateChange(
  //           {
  //             selectedNetworkClientId: 'mainnet',
  //             networkConfigurationsByChainId: {},
  //           } as NetworkState,
  //           [
  //             {
  //               op: 'remove',
  //               path: [
  //                 'networkConfigurationsByChainId',
  //                 ChainId['linea-mainnet'],
  //               ],
  //             },
  //           ],
  //         );

  //         // Verify linea removed
  //         expect(controller.state.marketData).toStrictEqual({
  //           [ChainId.mainnet]: marketData[ChainId.mainnet],
  //         });
  //       },
  //     );
  //   });
  // });

  // describe('PreferencesController::stateChange', () => {
  //   let clock: sinon.SinonFakeTimers;

  //   beforeEach(() => {
  //     clock = useFakeTimers({ now: Date.now() });
  //   });

  //   afterEach(() => {
  //     clock.restore();
  //   });

  //   describe('when polling is active', () => {
  //     it('should not update exchange rates when selected address changes', async () => {
  //       const alternateSelectedAddress =
  //         '0x0000000000000000000000000000000000000002';
  //       const alternateSelectedAccount = createMockInternalAccount({
  //         address: alternateSelectedAddress,
  //       });
  //       await withController(
  //         {
  //           options: {
  //             interval: 100,
  //           },
  //           mockTokensControllerState: {
  //             allTokens: {
  //               '0x1': {
  //                 [alternateSelectedAddress]: [
  //                   {
  //                     address: '0x02',
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                   {
  //                     address: '0x03',
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           },
  //         },
  //         async ({ controller, triggerSelectedAccountChange }) => {
  //           await controller.start(ChainId.mainnet, 'ETH');
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           triggerSelectedAccountChange(alternateSelectedAccount);

  //           expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
  //         },
  //       );
  //     });
  //   });

  //   describe('when polling is inactive', () => {
  //     it('does not update exchange rates when selected account changes', async () => {
  //       const alternateSelectedAddress =
  //         '0x0000000000000000000000000000000000000002';
  //       const alternateSelectedAccount = createMockInternalAccount({
  //         address: alternateSelectedAddress,
  //       });
  //       await withController(
  //         {
  //           options: {
  //             interval: 100,
  //           },
  //           mockTokensControllerState: {
  //             allTokens: {
  //               '0x1': {
  //                 [alternateSelectedAddress]: [
  //                   {
  //                     address: '0x02',
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                   {
  //                     address: '0x03',
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           },
  //         },
  //         async ({ controller, triggerSelectedAccountChange }) => {
  //           const updateExchangeRatesSpy = jest
  //             .spyOn(controller, 'updateExchangeRates')
  //             .mockResolvedValue();
  //           triggerSelectedAccountChange(alternateSelectedAccount);

  //           expect(updateExchangeRatesSpy).not.toHaveBeenCalled();
  //         },
  //       );
  //     });
  //   });
  // });

  // describe('legacy polling', () => {
  //   let clock: sinon.SinonFakeTimers;

  //   beforeEach(() => {
  //     clock = useFakeTimers({ now: Date.now() });
  //   });

  //   afterEach(() => {
  //     clock.restore();
  //   });

  //   describe('start', () => {
  //     it('should poll and update rate in the right interval', async () => {
  //       const interval = 100;
  //       const tokenPricesService = buildMockTokenPricesService();
  //       jest.spyOn(tokenPricesService, 'fetchTokenPrices');
  //       await withController(
  //         {
  //           options: {
  //             interval,
  //             tokenPricesService,
  //           },
  //           mockTokensControllerState: {
  //             allTokens: {
  //               [ChainId.mainnet]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: mockTokenAddress,
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           },
  //         },
  //         async ({ controller }) => {
  //           await controller.start(ChainId.mainnet, 'ETH');

  //           expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(
  //             1,
  //           );

  //           await advanceTime({ clock, duration: interval });
  //           expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(
  //             2,
  //           );

  //           await advanceTime({ clock, duration: interval });
  //           expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(
  //             3,
  //           );
  //         },
  //       );
  //     });
  //   });

  //   describe('stop', () => {
  //     it('should stop polling', async () => {
  //       const interval = 100;
  //       const tokenPricesService = buildMockTokenPricesService();
  //       jest.spyOn(tokenPricesService, 'fetchTokenPrices');
  //       await withController(
  //         {
  //           options: {
  //             interval,
  //             tokenPricesService,
  //           },
  //           mockTokensControllerState: {
  //             allTokens: {
  //               [ChainId.mainnet]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: mockTokenAddress,
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           },
  //         },
  //         async ({ controller }) => {
  //           await controller.start(ChainId.mainnet, 'ETH');

  //           expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(
  //             1,
  //           );

  //           controller.stop();

  //           await advanceTime({ clock, duration: interval });
  //           expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(
  //             1,
  //           );
  //         },
  //       );
  //     });
  //   });
  // });

  // describe('polling by networkClientId', () => {
  //   let clock: sinon.SinonFakeTimers;

  //   beforeEach(() => {
  //     clock = useFakeTimers({ now: Date.now() });
  //   });

  //   afterEach(() => {
  //     clock.restore();
  //   });

  //   it('should poll on the right interval', async () => {
  //     const interval = 100;
  //     const tokenPricesService = buildMockTokenPricesService();
  //     jest.spyOn(tokenPricesService, 'fetchTokenPrices');
  //     await withController(
  //       {
  //         options: {
  //           interval,
  //           tokenPricesService,
  //         },
  //         mockTokensControllerState: {
  //           allTokens: {
  //             [ChainId.mainnet]: {
  //               [defaultSelectedAddress]: [
  //                 {
  //                   address: mockTokenAddress,
  //                   decimals: 0,
  //                   symbol: '',
  //                   aggregators: [],
  //                 },
  //               ],
  //             },
  //           },
  //         },
  //       },
  //       async ({ controller }) => {
  //         controller.startPolling({
  //           chainIds: [ChainId.mainnet],
  //         });

  //         await advanceTime({ clock, duration: 0 });
  //         expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);

  //         await advanceTime({ clock, duration: interval });
  //         expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(2);

  //         await advanceTime({ clock, duration: interval });
  //         expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(3);
  //       },
  //     );
  //   });

  //   describe('updating state on poll', () => {
  //     describe('when the native currency is supported', () => {
  //       it('returns the exchange rates directly', async () => {
  //         const tokenPricesService = buildMockTokenPricesService({
  //           fetchTokenPrices: fetchTokenPricesWithIncreasingPriceForEachToken,
  //           validateCurrencySupported(currency: unknown): currency is string {
  //             return currency === 'ETH';
  //           },
  //         });
  //         const interval = 100;
  //         await withController(
  //           {
  //             options: {
  //               interval,
  //               tokenPricesService,
  //             },
  //             mockTokensControllerState: {
  //               allTokens: {
  //                 [ChainId.mainnet]: {
  //                   [defaultSelectedAddress]: [
  //                     {
  //                       address: '0x02',
  //                       decimals: 0,
  //                       symbol: '',
  //                       aggregators: [],
  //                     },
  //                     {
  //                       address: '0x03',
  //                       decimals: 0,
  //                       symbol: '',
  //                       aggregators: [],
  //                     },
  //                   ],
  //                 },
  //               },
  //             },
  //             mockNetworkClientConfigurationsByNetworkClientId: {
  //               'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
  //                 chainId: ChainId.mainnet,
  //                 ticker: 'ETH',
  //               }),
  //             },
  //           },
  //           async ({ controller }) => {
  //             controller.startPolling({
  //               chainIds: [ChainId.mainnet],
  //             });
  //             await advanceTime({ clock, duration: 0 });

  //             expect(controller.state).toStrictEqual({
  //               marketData: {
  //                 [ChainId.mainnet]: {
  //                   [ZERO_ADDRESS]: {
  //                     currency: 'ETH',
  //                     priceChange1d: 0,
  //                     pricePercentChange1d: 0,
  //                     tokenAddress: ZERO_ADDRESS,
  //                     chainId: '0x1',
  //                     assetId: 'eip155:1/slip44:60',
  //                     allTimeHigh: 4000,
  //                     allTimeLow: 900,
  //                     circulatingSupply: 2000,
  //                     dilutedMarketCap: 100,
  //                     high1d: 200,
  //                     low1d: 100,
  //                     marketCap: 1000,
  //                     marketCapPercentChange1d: 100,
  //                     price: 0.001,
  //                     pricePercentChange14d: 100,
  //                     pricePercentChange1h: 1,
  //                     pricePercentChange1y: 200,
  //                     pricePercentChange200d: 300,
  //                     pricePercentChange30d: 200,
  //                     pricePercentChange7d: 100,
  //                     totalVolume: 100,
  //                   },
  //                   '0x02': {
  //                     currency: 'ETH',
  //                     priceChange1d: 0,
  //                     pricePercentChange1d: 0,
  //                     tokenAddress: '0x02',
  //                     chainId: '0x1',
  //                     assetId: 'eip155:1/erc20:0x02',
  //                     allTimeHigh: 4000,
  //                     allTimeLow: 900,
  //                     circulatingSupply: 2000,
  //                     dilutedMarketCap: 100,
  //                     high1d: 200,
  //                     low1d: 100,
  //                     marketCap: 1000,
  //                     marketCapPercentChange1d: 100,
  //                     price: 0.002,
  //                     pricePercentChange14d: 100,
  //                     pricePercentChange1h: 1,
  //                     pricePercentChange1y: 200,
  //                     pricePercentChange200d: 300,
  //                     pricePercentChange30d: 200,
  //                     pricePercentChange7d: 100,
  //                     totalVolume: 100,
  //                   },
  //                   '0x03': {
  //                     currency: 'ETH',
  //                     priceChange1d: 0,
  //                     pricePercentChange1d: 0,
  //                     tokenAddress: '0x03',
  //                     chainId: '0x1',
  //                     assetId: 'eip155:1/erc20:0x03',
  //                     allTimeHigh: 4000,
  //                     allTimeLow: 900,
  //                     circulatingSupply: 2000,
  //                     dilutedMarketCap: 100,
  //                     high1d: 200,
  //                     low1d: 100,
  //                     marketCap: 1000,
  //                     marketCapPercentChange1d: 100,
  //                     price: 0.003,
  //                     pricePercentChange14d: 100,
  //                     pricePercentChange1h: 1,
  //                     pricePercentChange1y: 200,
  //                     pricePercentChange200d: 300,
  //                     pricePercentChange30d: 200,
  //                     pricePercentChange7d: 100,
  //                     totalVolume: 100,
  //                   },
  //                 },
  //               },
  //             });
  //           },
  //         );
  //       });
  //     });

  //     it('should stop polling', async () => {
  //       const interval = 100;
  //       const tokenPricesService = buildMockTokenPricesService();
  //       jest.spyOn(tokenPricesService, 'fetchTokenPrices');
  //       await withController(
  //         {
  //           options: {
  //             tokenPricesService,
  //           },
  //           mockTokensControllerState: {
  //             allTokens: {
  //               '0x1': {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: mockTokenAddress,
  //                     decimals: 0,
  //                     symbol: '',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //           },
  //         },
  //         async ({ controller }) => {
  //           const pollingToken = controller.startPolling({
  //             chainIds: [ChainId.mainnet],
  //           });
  //           await advanceTime({ clock, duration: 0 });
  //           expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(
  //             1,
  //           );

  //           controller.stopPollingByPollingToken(pollingToken);

  //           await advanceTime({ clock, duration: interval });
  //           expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(
  //             1,
  //           );
  //         },
  //       );
  //     });
  //   });

  //   it('does not update state when disabled', async () => {
  //     await withController(
  //       {},
  //       async ({
  //         controller,
  //         triggerTokensStateChange,
  //         triggerNetworkStateChange,
  //       }) => {
  //         const tokenAddress = '0x0000000000000000000000000000000000000001';
  //         controller.disable();
  //         await callUpdateExchangeRatesMethod({
  //           allTokens: {
  //             [ChainId.mainnet]: {
  //               [defaultSelectedAddress]: [
  //                 {
  //                   address: tokenAddress,
  //                   decimals: 18,
  //                   symbol: 'TST',
  //                   aggregators: [],
  //                 },
  //               ],
  //             },
  //           },
  //           chainId: ChainId.mainnet,
  //           controller,
  //           triggerTokensStateChange,
  //           triggerNetworkStateChange,
  //           nativeCurrency: 'ETH',
  //           selectedNetworkClientId: InfuraNetworkType.mainnet,
  //         });

  //         expect(controller.state.marketData).toStrictEqual({});
  //       },
  //     );
  //   });

  //   it('does not update state if there are no tokens for the given chain', async () => {
  //     await withController(
  //       async ({
  //         controller,
  //         triggerTokensStateChange,
  //         triggerNetworkStateChange,
  //       }) => {
  //         const tokenAddress = '0x0000000000000000000000000000000000000001';
  //         controller.enable();
  //         await callUpdateExchangeRatesMethod({
  //           allTokens: {
  //             // These tokens are on a different chain
  //             [toHex(2)]: {
  //               [defaultSelectedAddress]: [
  //                 {
  //                   address: tokenAddress,
  //                   decimals: 18,
  //                   symbol: 'TST',
  //                   aggregators: [],
  //                 },
  //               ],
  //             },
  //           },
  //           chainId: ChainId.mainnet,
  //           controller,
  //           triggerTokensStateChange,
  //           triggerNetworkStateChange,
  //           nativeCurrency: 'ETH',
  //           selectedNetworkClientId: InfuraNetworkType.mainnet,
  //         });

  //         expect(controller.state).toStrictEqual({
  //           marketData: {},
  //         });
  //       },
  //     );
  //   });

  //   it('does not update state if the price update fails', async () => {
  //     const tokenPricesService = buildMockTokenPricesService({
  //       fetchTokenPrices: jest
  //         .fn()
  //         .mockRejectedValue(new Error('Failed to fetch')),
  //     });
  //     await withController(
  //       { options: { tokenPricesService } },
  //       async ({
  //         controller,
  //         triggerTokensStateChange,
  //         triggerNetworkStateChange,
  //       }) => {
  //         const tokenAddress = '0x0000000000000000000000000000000000000001';

  //         const updateExchangeRates = await callUpdateExchangeRatesMethod({
  //           allTokens: {
  //             [ChainId.mainnet]: {
  //               [defaultSelectedAddress]: [
  //                 {
  //                   address: tokenAddress,
  //                   decimals: 18,
  //                   symbol: 'TST',
  //                   aggregators: [],
  //                 },
  //               ],
  //             },
  //           },
  //           chainId: ChainId.mainnet,
  //           controller,
  //           triggerTokensStateChange,
  //           triggerNetworkStateChange,
  //           nativeCurrency: 'ETH',
  //           selectedNetworkClientId: InfuraNetworkType.mainnet,
  //         });

  //         expect(updateExchangeRates).toBeUndefined();
  //         expect(controller.state.marketData).toStrictEqual({});
  //       },
  //     );
  //   });

  //   it('fetches rates for all tokens in batches', async () => {
  //     const chainId = ChainId.mainnet;
  //     const ticker = NetworksTicker.mainnet;
  //     const tokenAddresses = [...new Array(200).keys()]
  //       .map(buildAddress)
  //       .sort();
  //     const tokenPricesService = buildMockTokenPricesService({
  //       fetchTokenPrices: fetchTokenPricesWithIncreasingPriceForEachToken,
  //     });
  //     const fetchTokenPricesSpy = jest.spyOn(
  //       tokenPricesService,
  //       'fetchTokenPrices',
  //     );
  //     const tokens = tokenAddresses.map((tokenAddress) => {
  //       return buildToken({ address: tokenAddress });
  //     });
  //     await withController(
  //       {
  //         options: {
  //           tokenPricesService,
  //         },
  //       },
  //       async ({
  //         controller,
  //         triggerTokensStateChange,
  //         triggerNetworkStateChange,
  //       }) => {
  //         await callUpdateExchangeRatesMethod({
  //           allTokens: {
  //             [chainId]: {
  //               [defaultSelectedAddress]: tokens.slice(0, 100),
  //               // Include tokens from non selected addresses
  //               '0x0000000000000000000000000000000000000123': tokens.slice(100),
  //             },
  //           },
  //           chainId,
  //           controller,
  //           triggerTokensStateChange,
  //           triggerNetworkStateChange,
  //           nativeCurrency: ticker,
  //           selectedNetworkClientId: InfuraNetworkType.mainnet,
  //         });

  //         const numBatches = Math.ceil(
  //           tokenAddresses.length / TOKEN_PRICES_BATCH_SIZE,
  //         );
  //         expect(fetchTokenPricesSpy).toHaveBeenCalledTimes(numBatches);

  //         for (let i = 1; i <= numBatches; i++) {
  //           expect(fetchTokenPricesSpy).toHaveBeenNthCalledWith(i, {
  //             assets: tokenAddresses
  //               .slice(
  //                 (i - 1) * TOKEN_PRICES_BATCH_SIZE,
  //                 i * TOKEN_PRICES_BATCH_SIZE,
  //               )
  //               .map((tokenAddress) => ({
  //                 chainId,
  //                 tokenAddress,
  //               })),
  //             currency: ticker,
  //           });
  //         }
  //       },
  //     );
  //   });

  //   it('updates all rates', async () => {
  //     const tokenAddresses = [
  //       '0x0000000000000000000000000000000000000001',
  //       '0x0000000000000000000000000000000000000002',
  //       '0x0000000000000000000000000000000000000003',
  //     ];
  //     const tokenPricesService = buildMockTokenPricesService({
  //       fetchTokenPrices: jest.fn().mockResolvedValue({
  //         [tokenAddresses[0]]: {
  //           currency: 'ETH',
  //           tokenAddress: tokenAddresses[0],
  //           value: 0.001,
  //         },
  //         [tokenAddresses[1]]: {
  //           currency: 'ETH',
  //           tokenAddress: tokenAddresses[1],
  //           value: 0.002,
  //         },
  //         [tokenAddresses[2]]: {
  //           currency: 'ETH',
  //           tokenAddress: tokenAddresses[2],
  //           value: 0.003,
  //         },
  //       }),
  //     });
  //     await withController(
  //       { options: { tokenPricesService } },
  //       async ({
  //         controller,
  //         triggerTokensStateChange,
  //         triggerNetworkStateChange,
  //       }) => {
  //         await callUpdateExchangeRatesMethod({
  //           allTokens: {
  //             [ChainId.mainnet]: {
  //               [defaultSelectedAddress]: [
  //                 {
  //                   address: tokenAddresses[0],
  //                   decimals: 18,
  //                   symbol: 'TST1',
  //                   aggregators: [],
  //                 },
  //                 {
  //                   address: tokenAddresses[1],
  //                   decimals: 18,
  //                   symbol: 'TST2',
  //                   aggregators: [],
  //                 },
  //               ],
  //               // Include tokens from non selected addresses
  //               '0x0000000000000000000000000000000000000123': [
  //                 {
  //                   address: tokenAddresses[2],
  //                   decimals: 18,
  //                   symbol: 'TST1',
  //                   aggregators: [],
  //                 },
  //               ],
  //             },
  //           },
  //           chainId: ChainId.mainnet,
  //           controller,
  //           triggerTokensStateChange,
  //           triggerNetworkStateChange,
  //           nativeCurrency: 'ETH',
  //           selectedNetworkClientId: InfuraNetworkType.mainnet,
  //         });

  //         expect(controller.state).toMatchInlineSnapshot(`
  //                       Object {
  //                         "marketData": Object {
  //                           "0x1": Object {
  //                             "0x0000000000000000000000000000000000000001": Object {
  //                               "currency": "ETH",
  //                               "tokenAddress": "0x0000000000000000000000000000000000000001",
  //                               "value": 0.001,
  //                             },
  //                             "0x0000000000000000000000000000000000000002": Object {
  //                               "currency": "ETH",
  //                               "tokenAddress": "0x0000000000000000000000000000000000000002",
  //                               "value": 0.002,
  //                             },
  //                             "0x0000000000000000000000000000000000000003": Object {
  //                               "currency": "ETH",
  //                               "tokenAddress": "0x0000000000000000000000000000000000000003",
  //                               "value": 0.003,
  //                             },
  //                           },
  //                         },
  //                       }
  //                   `);
  //       },
  //     );
  //   });

  //   it('updates rates only for a non-selected chain', async () => {
  //     const tokenAddresses = [
  //       '0x0000000000000000000000000000000000000001',
  //       '0x0000000000000000000000000000000000000002',
  //     ];
  //     const tokenPricesService = buildMockTokenPricesService({
  //       fetchTokenPrices: jest.fn().mockResolvedValue({
  //         [tokenAddresses[0]]: {
  //           currency: 'ETH',
  //           tokenAddress: tokenAddresses[0],
  //           value: 0.001,
  //         },
  //         [tokenAddresses[1]]: {
  //           currency: 'ETH',
  //           tokenAddress: tokenAddresses[1],
  //           value: 0.002,
  //         },
  //       }),
  //     });
  //     await withController(
  //       { options: { tokenPricesService } },
  //       async ({
  //         controller,
  //         triggerTokensStateChange,
  //         triggerNetworkStateChange,
  //       }) => {
  //         await callUpdateExchangeRatesMethod({
  //           allTokens: {
  //             [toHex(2)]: {
  //               [defaultSelectedAddress]: [
  //                 {
  //                   address: tokenAddresses[0],
  //                   decimals: 18,
  //                   symbol: 'TST1',
  //                   aggregators: [],
  //                 },
  //                 {
  //                   address: tokenAddresses[1],
  //                   decimals: 18,
  //                   symbol: 'TST2',
  //                   aggregators: [],
  //                 },
  //               ],
  //             },
  //           },
  //           chainId: toHex(2),
  //           controller,
  //           triggerTokensStateChange,
  //           triggerNetworkStateChange,
  //           nativeCurrency: 'ETH',
  //           setChainAsCurrent: false,
  //         });

  //         expect(controller.state).toMatchInlineSnapshot(`
  //                           Object {
  //                             "marketData": Object {
  //                               "0x2": Object {
  //                                 "0x0000000000000000000000000000000000000001": Object {
  //                                   "currency": "ETH",
  //                                   "tokenAddress": "0x0000000000000000000000000000000000000001",
  //                                   "value": 0.001,
  //                                 },
  //                                 "0x0000000000000000000000000000000000000002": Object {
  //                                   "currency": "ETH",
  //                                   "tokenAddress": "0x0000000000000000000000000000000000000002",
  //                                   "value": 0.002,
  //                                 },
  //                               },
  //                             },
  //                           }
  //                       `);
  //       },
  //     );
  //   });

  //   it('updates exchange rates when native currency is not supported by the Price API', async () => {
  //     const selectedNetworkClientId = 'AAAA-BBBB-CCCC-DDDD';
  //     const selectedNetworkClientConfiguration =
  //       buildCustomNetworkClientConfiguration({
  //         chainId: toHex(137),
  //         ticker: 'UNSUPPORTED',
  //       });
  //     const tokenAddresses = [
  //       '0x0000000000000000000000000000000000000001',
  //       '0x0000000000000000000000000000000000000002',
  //     ];
  //     const tokenPricesService = buildMockTokenPricesService({
  //       fetchTokenPrices: jest.fn().mockResolvedValue({
  //         [tokenAddresses[0]]: {
  //           currency: 'ETH',
  //           tokenAddress: tokenAddresses[0],
  //           price: 0.001,
  //         },
  //         [tokenAddresses[1]]: {
  //           currency: 'ETH',
  //           tokenAddress: tokenAddresses[1],
  //           price: 0.002,
  //         },
  //       }),
  //       validateCurrencySupported(_currency: unknown): _currency is string {
  //         return false;
  //       },
  //     });
  //     nock('https://min-api.cryptocompare.com')
  //       .get('/data/price')
  //       .query({
  //         fsym: 'ETH',
  //         tsyms: selectedNetworkClientConfiguration.ticker,
  //       })
  //       .reply(200, { [selectedNetworkClientConfiguration.ticker]: 0.5 }); // .5 eth to 1 matic

  //     await withController(
  //       {
  //         options: { tokenPricesService },
  //         mockNetworkClientConfigurationsByNetworkClientId: {
  //           [selectedNetworkClientId]: selectedNetworkClientConfiguration,
  //         },
  //       },
  //       async ({
  //         controller,
  //         triggerTokensStateChange,
  //         triggerNetworkStateChange,
  //       }) => {
  //         await callUpdateExchangeRatesMethod({
  //           allTokens: {
  //             [selectedNetworkClientConfiguration.chainId]: {
  //               [defaultSelectedAddress]: [
  //                 {
  //                   address: tokenAddresses[0],
  //                   decimals: 18,
  //                   symbol: 'TST1',
  //                   aggregators: [],
  //                 },
  //                 {
  //                   address: tokenAddresses[1],
  //                   decimals: 18,
  //                   symbol: 'TST2',
  //                   aggregators: [],
  //                 },
  //               ],
  //             },
  //           },
  //           chainId: selectedNetworkClientConfiguration.chainId,
  //           controller,
  //           triggerTokensStateChange,
  //           triggerNetworkStateChange,
  //           nativeCurrency: selectedNetworkClientConfiguration.ticker,
  //           selectedNetworkClientId,
  //         });

  //         // token value in terms of matic should be (token value in eth) * (eth value in matic)
  //         expect(controller.state).toMatchInlineSnapshot(`
  //                       Object {
  //                         "marketData": Object {
  //                           "0x89": Object {
  //                             "0x0000000000000000000000000000000000000001": Object {
  //                               "allTimeHigh": undefined,
  //                               "allTimeLow": undefined,
  //                               "currency": "UNSUPPORTED",
  //                               "dilutedMarketCap": undefined,
  //                               "high1d": undefined,
  //                               "low1d": undefined,
  //                               "marketCap": undefined,
  //                               "price": 0.0005,
  //                               "tokenAddress": "0x0000000000000000000000000000000000000001",
  //                               "totalVolume": undefined,
  //                             },
  //                             "0x0000000000000000000000000000000000000002": Object {
  //                               "allTimeHigh": undefined,
  //                               "allTimeLow": undefined,
  //                               "currency": "UNSUPPORTED",
  //                               "dilutedMarketCap": undefined,
  //                               "high1d": undefined,
  //                               "low1d": undefined,
  //                               "marketCap": undefined,
  //                               "price": 0.001,
  //                               "tokenAddress": "0x0000000000000000000000000000000000000002",
  //                               "totalVolume": undefined,
  //                             },
  //                           },
  //                         },
  //                       }
  //                   `);
  //       },
  //     );
  //   });

  //   it('fetches rates for all tokens in batches when native currency is not supported by the Price API', async () => {
  //     const selectedNetworkClientId = 'AAAA-BBBB-CCCC-DDDD';
  //     const selectedNetworkClientConfiguration =
  //       buildCustomNetworkClientConfiguration({
  //         chainId: toHex(999),
  //         ticker: 'UNSUPPORTED',
  //       });
  //     const tokenAddresses = [...new Array(200).keys()]
  //       .map(buildAddress)
  //       .sort();
  //     const tokenPricesService = buildMockTokenPricesService({
  //       fetchTokenPrices: fetchTokenPricesWithIncreasingPriceForEachToken,
  //       validateCurrencySupported: (currency: unknown): currency is string => {
  //         return currency !== selectedNetworkClientConfiguration.ticker;
  //       },
  //     });
  //     const fetchTokenPricesSpy = jest.spyOn(
  //       tokenPricesService,
  //       'fetchTokenPrices',
  //     );
  //     const tokens = tokenAddresses.map((tokenAddress) => {
  //       return buildToken({ address: tokenAddress });
  //     });
  //     nock('https://min-api.cryptocompare.com')
  //       .get('/data/price')
  //       .query({
  //         fsym: 'ETH',
  //         tsyms: selectedNetworkClientConfiguration.ticker,
  //       })
  //       .reply(200, { [selectedNetworkClientConfiguration.ticker]: 0.5 });
  //     await withController(
  //       {
  //         options: {
  //           tokenPricesService,
  //         },
  //         mockNetworkClientConfigurationsByNetworkClientId: {
  //           [selectedNetworkClientId]: selectedNetworkClientConfiguration,
  //         },
  //         mockNetworkState: {
  //           networkConfigurationsByChainId: {
  //             [selectedNetworkClientConfiguration.chainId]: {
  //               nativeCurrency: selectedNetworkClientConfiguration.ticker,
  //               chainId: selectedNetworkClientConfiguration.chainId,
  //               name: 'UNSUPPORTED',
  //               rpcEndpoints: [],
  //               blockExplorerUrls: [],
  //               defaultRpcEndpointIndex: 0,
  //             },
  //           },
  //           selectedNetworkClientId,
  //         },
  //       },
  //       async ({
  //         controller,
  //         triggerTokensStateChange,
  //         triggerNetworkStateChange,
  //       }) => {
  //         await callUpdateExchangeRatesMethod({
  //           allTokens: {
  //             [selectedNetworkClientConfiguration.chainId]: {
  //               [defaultSelectedAddress]: tokens,
  //             },
  //           },
  //           chainId: selectedNetworkClientConfiguration.chainId,
  //           controller,
  //           triggerTokensStateChange,
  //           triggerNetworkStateChange,
  //           nativeCurrency: selectedNetworkClientConfiguration.ticker,
  //           selectedNetworkClientId,
  //         });

  //         const numBatches = Math.ceil(
  //           tokenAddresses.length / TOKEN_PRICES_BATCH_SIZE,
  //         );
  //         expect(fetchTokenPricesSpy).toHaveBeenCalledTimes(numBatches);

  //         for (let i = 1; i <= numBatches; i++) {
  //           expect(fetchTokenPricesSpy).toHaveBeenNthCalledWith(i, {
  //             chainId: selectedNetworkClientConfiguration.chainId,
  //             tokenAddresses: tokenAddresses.slice(
  //               (i - 1) * TOKEN_PRICES_BATCH_SIZE,
  //               i * TOKEN_PRICES_BATCH_SIZE,
  //             ),
  //             currency: 'ETH',
  //           });
  //         }
  //       },
  //     );
  //   });

  //   it('sets rates to undefined when chain is not supported by the Price API', async () => {
  //     const selectedNetworkClientId = 'AAAA-BBBB-CCCC-DDDD';
  //     const selectedNetworkClientConfiguration =
  //       buildCustomNetworkClientConfiguration({
  //         chainId: toHex(999),
  //         ticker: 'TST',
  //       });
  //     const tokenAddresses = [
  //       '0x0000000000000000000000000000000000000001',
  //       '0x0000000000000000000000000000000000000002',
  //     ];
  //     const tokenPricesService = buildMockTokenPricesService({
  //       fetchTokenPrices: jest.fn().mockResolvedValue({
  //         [tokenAddresses[0]]: {
  //           currency: 'ETH',
  //           tokenAddress: tokenAddresses[0],
  //           value: 0.001,
  //         },
  //         [tokenAddresses[1]]: {
  //           currency: 'ETH',
  //           tokenAddress: tokenAddresses[1],
  //           value: 0.002,
  //         },
  //       }),
  //       validateChainIdSupported(_chainId: unknown): _chainId is Hex {
  //         return false;
  //       },
  //     });
  //     await withController(
  //       {
  //         options: { tokenPricesService },
  //         mockNetworkClientConfigurationsByNetworkClientId: {
  //           [selectedNetworkClientId]: selectedNetworkClientConfiguration,
  //         },
  //       },
  //       async ({
  //         controller,
  //         triggerTokensStateChange,
  //         triggerNetworkStateChange,
  //       }) => {
  //         await callUpdateExchangeRatesMethod({
  //           allTokens: {
  //             [toHex(999)]: {
  //               [defaultSelectedAddress]: [
  //                 {
  //                   address: tokenAddresses[0],
  //                   decimals: 18,
  //                   symbol: 'TST1',
  //                   aggregators: [],
  //                 },
  //                 {
  //                   address: tokenAddresses[1],
  //                   decimals: 18,
  //                   symbol: 'TST2',
  //                   aggregators: [],
  //                 },
  //               ],
  //             },
  //           },
  //           chainId: selectedNetworkClientConfiguration.chainId,
  //           controller,
  //           triggerTokensStateChange,
  //           triggerNetworkStateChange,
  //           nativeCurrency: selectedNetworkClientConfiguration.ticker,
  //           selectedNetworkClientId,
  //         });

  //         expect(controller.state).toMatchInlineSnapshot(`
  //                       Object {
  //                         "marketData": Object {
  //                           "0x3e7": Object {
  //                             "0x0000000000000000000000000000000000000001": undefined,
  //                             "0x0000000000000000000000000000000000000002": undefined,
  //                           },
  //                         },
  //                       }
  //                     `);
  //       },
  //     );
  //   });

  //   it('correctly calls the Price API with unqiue native token addresses (e.g. MATIC)', async () => {
  //     const tokenPricesService = buildMockTokenPricesService({
  //       fetchTokenPrices: jest.fn().mockResolvedValue({
  //         '0x0000000000000000000000000000000000001010': {
  //           currency: 'MATIC',
  //           tokenAddress: '0x0000000000000000000000000000000000001010',
  //           value: 0.001,
  //         },
  //       }),
  //     });

  //     await withController(
  //       {
  //         options: { tokenPricesService },
  //         mockNetworkClientConfigurationsByNetworkClientId: {
  //           'AAAA-BBBB-CCCC-DDDD': buildCustomNetworkClientConfiguration({
  //             chainId: '0x89',
  //           }),
  //         },
  //       },
  //       async ({
  //         controller,
  //         triggerTokensStateChange,
  //         triggerNetworkStateChange,
  //       }) => {
  //         await callUpdateExchangeRatesMethod({
  //           allTokens: {
  //             '0x89': {
  //               [defaultSelectedAddress]: [],
  //             },
  //           },
  //           chainId: '0x89',
  //           controller,
  //           triggerTokensStateChange,
  //           triggerNetworkStateChange,
  //           nativeCurrency: 'MATIC',
  //           selectedNetworkClientId: 'AAAA-BBBB-CCCC-DDDD',
  //         });

  //         expect(
  //           controller.state.marketData['0x89'][
  //             '0x0000000000000000000000000000000000001010'
  //           ],
  //         ).toBeDefined();
  //       },
  //     );
  //   });

  //   it('only updates rates once when called twice', async () => {
  //     const tokenAddresses = [
  //       '0x0000000000000000000000000000000000000001',
  //       '0x0000000000000000000000000000000000000002',
  //     ];
  //     const fetchTokenPricesMock = jest.fn().mockResolvedValue({
  //       [tokenAddresses[0]]: {
  //         currency: 'ETH',
  //         tokenAddress: tokenAddresses[0],
  //         value: 0.001,
  //       },
  //       [tokenAddresses[1]]: {
  //         currency: 'ETH',
  //         tokenAddress: tokenAddresses[1],
  //         value: 0.002,
  //       },
  //     });
  //     const tokenPricesService = buildMockTokenPricesService({
  //       fetchTokenPrices: fetchTokenPricesMock,
  //     });
  //     await withController(
  //       { options: { tokenPricesService } },
  //       async ({
  //         controller,
  //         triggerTokensStateChange,
  //         triggerNetworkStateChange,
  //       }) => {
  //         const updateExchangeRates = async () =>
  //           await callUpdateExchangeRatesMethod({
  //             allTokens: {
  //               [toHex(1)]: {
  //                 [defaultSelectedAddress]: [
  //                   {
  //                     address: tokenAddresses[0],
  //                     decimals: 18,
  //                     symbol: 'TST1',
  //                     aggregators: [],
  //                   },
  //                   {
  //                     address: tokenAddresses[1],
  //                     decimals: 18,
  //                     symbol: 'TST2',
  //                     aggregators: [],
  //                   },
  //                 ],
  //               },
  //             },
  //             chainId: ChainId.mainnet,
  //             selectedNetworkClientId: InfuraNetworkType.mainnet,
  //             controller,
  //             triggerTokensStateChange,
  //             triggerNetworkStateChange,
  //             nativeCurrency: 'ETH',
  //           });

  //         await Promise.all([updateExchangeRates(), updateExchangeRates()]);

  //         expect(fetchTokenPricesMock).toHaveBeenCalledTimes(1);

  //         expect(controller.state).toMatchInlineSnapshot(`
  //                       Object {
  //                         "marketData": Object {
  //                           "0x1": Object {
  //                             "0x0000000000000000000000000000000000000001": Object {
  //                               "currency": "ETH",
  //                               "tokenAddress": "0x0000000000000000000000000000000000000001",
  //                               "value": 0.001,
  //                             },
  //                             "0x0000000000000000000000000000000000000002": Object {
  //                               "currency": "ETH",
  //                               "tokenAddress": "0x0000000000000000000000000000000000000002",
  //                               "value": 0.002,
  //                             },
  //                           },
  //                         },
  //                       }
  //                   `);
  //       },
  //     );
  //   });

  //   it('will update rates twice if detected tokens increased during second call', async () => {
  //     const tokenAddresses = [
  //       '0x0000000000000000000000000000000000000001',
  //       '0x0000000000000000000000000000000000000002',
  //     ];
  //     const fetchTokenPricesMock = jest.fn().mockResolvedValue([
  //       {
  //         currency: 'ETH',
  //         tokenAddress: tokenAddresses[0],
  //         value: 0.001,
  //       },
  //       {
  //         currency: 'ETH',
  //         tokenAddress: tokenAddresses[1],
  //         value: 0.002,
  //       },
  //     ]);
  //     const tokenPricesService = buildMockTokenPricesService({
  //       fetchTokenPrices: fetchTokenPricesMock,
  //     });
  //     await withController(
  //       { options: { tokenPricesService } },
  //       async ({
  //         controller,
  //         triggerTokensStateChange,
  //         triggerNetworkStateChange,
  //       }) => {
  //         const request1Payload = [
  //           {
  //             address: tokenAddresses[0],
  //             decimals: 18,
  //             symbol: 'TST1',
  //             aggregators: [],
  //           },
  //         ];
  //         const request2Payload = [
  //           {
  //             address: tokenAddresses[0],
  //             decimals: 18,
  //             symbol: 'TST1',
  //             aggregators: [],
  //           },
  //           {
  //             address: tokenAddresses[1],
  //             decimals: 18,
  //             symbol: 'TST2',
  //             aggregators: [],
  //           },
  //         ];
  //         const updateExchangeRates = async (
  //           tokens: typeof request1Payload | typeof request2Payload,
  //         ) =>
  //           await callUpdateExchangeRatesMethod({
  //             allTokens: {
  //               [toHex(1)]: {
  //                 [defaultSelectedAddress]: tokens,
  //               },
  //             },
  //             chainId: ChainId.mainnet,
  //             selectedNetworkClientId: InfuraNetworkType.mainnet,
  //             controller,
  //             triggerTokensStateChange,
  //             triggerNetworkStateChange,
  //             nativeCurrency: 'ETH',
  //           });

  //         await Promise.all([
  //           updateExchangeRates(request1Payload),
  //           updateExchangeRates(request2Payload),
  //         ]);

  //         expect(fetchTokenPricesMock).toHaveBeenCalledTimes(2);
  //         expect(fetchTokenPricesMock).toHaveBeenNthCalledWith(
  //           1,
  //           expect.objectContaining({
  //             assets: [{ tokenAddress: tokenAddresses[0], chainId: '0x1' }],
  //           }),
  //         );
  //         expect(fetchTokenPricesMock).toHaveBeenNthCalledWith(
  //           2,
  //           expect.objectContaining({
  //             assets: [
  //               { tokenAddress: tokenAddresses[0], chainId: '0x1' },
  //               { tokenAddress: tokenAddresses[1], chainId: '0x1' },
  //             ],
  //           }),
  //         );
  //       },
  //     );
  //   });
  // });

  describe('resetState', () => {
    it('resets the state to default state', async () => {
      const initialState: TokenRatesControllerState = {
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
      };

      await withController(
        {
          options: {
            state: initialState,
          },
        },
        ({ controller }) => {
          expect(controller.state).toStrictEqual(initialState);

          controller.resetState();

          expect(controller.state).toStrictEqual({
            marketData: {},
          });
        },
      );
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInDebugSnapshot',
          ),
        ).toMatchInlineSnapshot(`Object {}`);
      });
    });

    it('includes expected state in state logs', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInStateLogs',
          ),
        ).toMatchInlineSnapshot(`Object {}`);
      });
    });

    it('persists expected state', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "marketData": Object {},
          }
        `);
      });
    });

    it('exposes expected state to UI', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'usedInUi',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "marketData": Object {},
          }
        `);
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
  triggerTokensStateChange,
  triggerNetworkStateChange,
}: {
  controller: TokenRatesController;
  triggerTokensStateChange: (state: TokensControllerState) => void;
  triggerNetworkStateChange: (state: NetworkState, patches?: Patch[]) => void;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<ConstructorParameters<typeof TokenRatesController>[0]>;
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
    mockNetworkClientConfigurationsByNetworkClientId,
    mockTokensControllerState,
    mockNetworkState,
  } = rest;
  const messenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const mockTokensState = jest.fn<TokensControllerState, []>();
  messenger.registerActionHandler(
    'TokensController:getState',
    mockTokensState.mockReturnValue({
      ...getDefaultTokensState(),
      ...mockTokensControllerState,
    }),
  );

  const getNetworkClientById = buildMockGetNetworkClientById(
    mockNetworkClientConfigurationsByNetworkClientId,
  );
  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    getNetworkClientById,
  );

  const networkStateMock = jest.fn<NetworkState, []>();
  messenger.registerActionHandler(
    'NetworkController:getState',
    networkStateMock.mockReturnValue({
      ...getDefaultNetworkControllerState(),
      ...mockNetworkState,
    }),
  );

  const mockGetSelectedAccount = jest.fn<InternalAccount, []>();
  messenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    mockGetSelectedAccount.mockReturnValue(defaultSelectedAccount),
  );

  const mockGetAccount = jest.fn<InternalAccount, []>();
  messenger.registerActionHandler(
    'AccountsController:getAccount',
    mockGetAccount.mockReturnValue(defaultSelectedAccount),
  );

  const controller = new TokenRatesController({
    tokenPricesService: buildMockTokenPricesService(),
    messenger: buildTokenRatesControllerMessenger(messenger),
    ...options,
  });
  try {
    return await fn({
      controller,
      triggerTokensStateChange: (state: TokensControllerState) => {
        messenger.publish('TokensController:stateChange', state, []);
      },
      triggerNetworkStateChange: (
        state: NetworkState,
        patches: Patch[] = [],
      ) => {
        messenger.publish('NetworkController:stateChange', state, patches);
      },
    });
  } finally {
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
  nativeCurrency,
  selectedNetworkClientId,
  setChainAsCurrent = true,
}: {
  allTokens: TokensControllerState['allTokens'];
  chainId: Hex;
  controller: TokenRatesController;
  triggerTokensStateChange: (state: TokensControllerState) => void;
  triggerNetworkStateChange: (state: NetworkState) => void;
  nativeCurrency: string;
  selectedNetworkClientId?: NetworkClientId;
  setChainAsCurrent?: boolean;
}) {
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
      ...getDefaultNetworkControllerState(),
      selectedNetworkClientId,
    });
  }

  await controller.updateExchangeRates([
    {
      chainId,
      nativeCurrency,
    },
  ]);
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
 * A version of the token prices service `fetchTokenPrices` method where the
 * price of each given token is incremented by one.
 *
 * @param args - The arguments to this function.
 * @param args.assets - The token addresses and chainIds.
 * @param args.currency - The currency.
 * @returns The token prices.
 */
async function fetchTokenPricesWithIncreasingPriceForEachToken<
  Currency extends string,
>({
  assets,
  currency,
}: {
  assets: { tokenAddress: Hex; chainId: Hex }[];
  currency: Currency;
}): Promise<EvmAssetWithMarketData<Hex, Currency>[]> {
  return assets.map(({ tokenAddress, chainId }, i) => ({
    tokenAddress,
    chainId,
    assetId:
      `${KnownCaipNamespace.Eip155}:1/${tokenAddress === ZERO_ADDRESS ? 'slip44:60' : `erc20:${tokenAddress.toLowerCase()}`}` as CaipAssetType,
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
  }));
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
