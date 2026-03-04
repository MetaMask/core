import {
  ChainId,
  NetworkType,
  convertHexToDecimal,
  InfuraNetworkType,
} from '@metamask/controller-utils';
import type { KeyringControllerState } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { MOCK_ANY_NAMESPACE, Messenger } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import {
  getDefaultNetworkControllerState,
  RpcEndpointType,
} from '@metamask/network-controller';
import type {
  NetworkState,
  NetworkConfiguration,
  NetworkController,
  NetworkClientId,
  AutoManagedNetworkClient,
  CustomNetworkClientConfiguration,
} from '@metamask/network-controller';
import { getDefaultPreferencesState } from '@metamask/preferences-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';
import BN from 'bn.js';
import nock from 'nock';

import { formatAggregatorNames } from './assetsUtil';
import { TOKEN_END_POINT_API } from './token-service';
import type { TokenDetectionControllerMessenger } from './TokenDetectionController';
import {
  TokenDetectionController,
  controllerName,
  mapChainIdWithTokenListMap,
} from './TokenDetectionController';
import { getDefaultTokenListState } from './TokenListController';
import type { TokenListState, TokenListToken } from './TokenListController';
import type { Token } from './TokenRatesController';
import type {
  TokensController,
  TokensControllerState,
} from './TokensController';
import { getDefaultTokensState } from './TokensController';
import { jestAdvanceTime } from '../../../tests/helpers';
import { createMockInternalAccount } from '../../accounts-controller/tests/mocks';
import {
  buildCustomRpcEndpoint,
  buildInfuraNetworkConfiguration,
} from '../../network-controller/tests/helpers';

const DEFAULT_INTERVAL = 180000;

const sampleAggregators = [
  'paraswap',
  'pmm',
  'airswapLight',
  'zeroEx',
  'bancor',
  'coinGecko',
  'zapper',
  'kleros',
  'zerion',
  'cmc',
  'oneInch',
];
const formattedSampleAggregators = formatAggregatorNames(sampleAggregators);
const sampleTokenList: TokenListToken[] = [
  {
    address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    symbol: 'LINK',
    decimals: 18,
    iconUrl: '',
    occurrences: 11,
    aggregators: sampleAggregators,
    name: 'Chainlink',
  },
  {
    address: '0x1F573D6Fb3F13d689FF844B4cE37794d79a7FF1C',
    symbol: 'BNT',
    decimals: 18,
    iconUrl: '',
    occurrences: 11,
    aggregators: sampleAggregators,
    name: 'Bancor',
  },
];
const [tokenAFromList, tokenBFromList] = sampleTokenList;
const sampleTokenA = {
  address: tokenAFromList.address,
  symbol: tokenAFromList.symbol,
  decimals: tokenAFromList.decimals,
  image:
    'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
  isERC721: false,
  aggregators: formattedSampleAggregators,
  name: 'Chainlink',
};
const sampleTokenB = {
  address: tokenBFromList.address,
  symbol: tokenBFromList.symbol,
  decimals: tokenBFromList.decimals,
  image:
    'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c.png',
  isERC721: false,
  aggregators: formattedSampleAggregators,
  name: 'Bancor',
};

const mockNetworkConfigurations: Record<string, NetworkConfiguration> = {
  [InfuraNetworkType.mainnet]: buildInfuraNetworkConfiguration(
    InfuraNetworkType.mainnet,
  ),
  [InfuraNetworkType.sepolia]: buildInfuraNetworkConfiguration(
    InfuraNetworkType.sepolia,
  ),
  polygon: {
    blockExplorerUrls: ['https://polygonscan.com/'],
    chainId: '0x89',
    defaultBlockExplorerUrlIndex: 0,
    defaultRpcEndpointIndex: 0,
    name: 'Polygon Mainnet',
    nativeCurrency: 'MATIC',
    rpcEndpoints: [
      buildCustomRpcEndpoint({
        url: 'https://polygon-mainnet.infura.io/v3/fakekey',
        networkClientId: 'polygon',
      }),
    ],
  },
  avalanche: {
    blockExplorerUrls: ['https://snowtrace.io/'],
    chainId: '0xa86a',
    defaultBlockExplorerUrlIndex: 0,
    defaultRpcEndpointIndex: 0,
    name: 'Avalanche C-Chain',
    nativeCurrency: 'AVAX',
    rpcEndpoints: [
      buildCustomRpcEndpoint({
        url: 'https://api.avax.network/ext/bc/C/rpc',
        networkClientId: 'avalanche',
      }),
    ],
  },
};

// Network configurations keyed by chain ID (for use when testing with explicit chainIds)
const mockNetworkConfigurationsByChainId: Record<string, NetworkConfiguration> =
  {
    '0xa86a': mockNetworkConfigurations.avalanche,
    '0x89': mockNetworkConfigurations.polygon,
  };

type AllTokenDetectionControllerActions =
  MessengerActions<TokenDetectionControllerMessenger>;

type AllTokenDetectionControllerEvents =
  MessengerEvents<TokenDetectionControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllTokenDetectionControllerActions,
  AllTokenDetectionControllerEvents
>;

/**
 * Builds a root messenger for testing.
 *
 * @returns The root messenger.
 */
function buildRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Builds a messenger that `TokenDetectionController` can use to communicate with other controllers.
 *
 * @param messenger - The root messenger.
 * @returns The controller messenger.
 */
function buildTokenDetectionControllerMessenger(
  messenger = buildRootMessenger(),
): TokenDetectionControllerMessenger {
  const tokenDetectionControllerMessenger = new Messenger<
    'TokenDetectionController',
    AllTokenDetectionControllerActions,
    AllTokenDetectionControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: messenger,
  });
  messenger.delegate({
    messenger: tokenDetectionControllerMessenger,
    actions: [
      'AccountsController:getAccount',
      'AccountsController:getSelectedAccount',
      'KeyringController:getState',
      'NetworkController:getNetworkClientById',
      'NetworkController:getNetworkConfigurationByNetworkClientId',
      'NetworkController:getState',
      'TokensController:getState',
      'TokensController:addDetectedTokens',
      'TokenListController:getState',
      'PreferencesController:getState',
      'TokensController:addTokens',
      'NetworkController:findNetworkClientIdByChainId',
    ],
    events: [
      'AccountsController:selectedEvmAccountChange',
      'KeyringController:lock',
      'KeyringController:unlock',
      'NetworkController:networkDidChange',
      'TokenListController:stateChange',
      'PreferencesController:stateChange',
      'TransactionController:transactionConfirmed',
    ],
  });
  return tokenDetectionControllerMessenger;
}

describe('TokenDetectionController', () => {
  const defaultSelectedAccount = createMockInternalAccount();

  beforeEach(async () => {
    nock(TOKEN_END_POINT_API)
      .get(getTokensPath(ChainId.mainnet))
      .reply(200, sampleTokenList)
      .get(
        `/token/${convertHexToDecimal(ChainId.mainnet)}?address=${
          tokenAFromList.address
        }`,
      )
      .reply(200, tokenAFromList)
      .get(
        `/token/${convertHexToDecimal(ChainId.mainnet)}?address=${
          tokenBFromList.address
        }`,
      )
      .reply(200, tokenBFromList)
      .persist();
  });

  describe('start', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should not poll and detect tokens on interval while keyring is locked', async () => {
      await withController(
        {
          isKeyringUnlocked: false,
          options: {},
          mocks: {
            getSelectedAccount: defaultSelectedAccount,
          },
        },
        async ({ controller }) => {
          const mockTokens = jest
            .spyOn(controller, 'detectTokens')
            .mockImplementation();
          controller.setIntervalLength(10);

          await controller.start();

          expect(mockTokens).not.toHaveBeenCalled();
          await jestAdvanceTime({ duration: 15 });
          expect(mockTokens).not.toHaveBeenCalled();
        },
      );
    });

    it('should detect tokens but not restart polling if locked keyring is unlocked', async () => {
      await withController(
        {
          isKeyringUnlocked: false,
          options: {},
          mocks: {
            getSelectedAccount: defaultSelectedAccount,
          },
        },
        async ({ controller, triggerKeyringUnlock }) => {
          const mockTokens = jest
            .spyOn(controller, 'detectTokens')
            .mockImplementation();

          await controller.start();
          triggerKeyringUnlock();

          await jestAdvanceTime({ duration: DEFAULT_INTERVAL * 1.5 });
          expect(mockTokens).not.toHaveBeenCalledTimes(2);
        },
      );
    });

    it('should not poll if the controller is not active', async () => {
      await withController(
        {
          isKeyringUnlocked: true,
        },
        async ({ controller }) => {
          controller.setIntervalLength(10);

          await controller._executePoll({
            chainIds: [ChainId.mainnet],
            address: defaultSelectedAccount.address,
          });

          expect(controller.isActive).toBe(false);
        },
      );
    });

    it('should stop polling and detect tokens on interval if unlocked keyring is locked', async () => {
      await withController(
        {
          isKeyringUnlocked: true,
        },
        async ({ controller, triggerKeyringLock }) => {
          const mockTokens = jest
            .spyOn(controller, 'detectTokens')
            .mockImplementation();
          controller.setIntervalLength(10);

          await controller.start();
          triggerKeyringLock();

          expect(mockTokens).toHaveBeenCalledTimes(1);
          await jestAdvanceTime({ duration: 15 });
          expect(mockTokens).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should poll and detect tokens on interval while on supported networks', async () => {
      await withController(
        {
          options: {},
          mocks: {
            getSelectedAccount: defaultSelectedAccount,
          },
        },
        async ({ controller }) => {
          const mockTokens = jest
            .spyOn(controller, 'detectTokens')
            .mockImplementation();
          controller.setIntervalLength(10);

          await controller.start();

          expect(mockTokens).toHaveBeenCalledTimes(1);
          await jestAdvanceTime({ duration: 15 });
          expect(mockTokens).toHaveBeenCalledTimes(2);
        },
      );
    });

    it('should not autodetect while not on supported networks', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      await withController(
        {
          options: {
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
          },
          mocks: {
            getSelectedAccount: defaultSelectedAccount,
          },
        },
        async ({ controller, mockNetworkState, mockGetNetworkClientById }) => {
          mockNetworkState({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: NetworkType.sepolia,
          });
          mockGetNetworkClientById(
            () =>
              ({
                configuration: { chainId: ChainId.sepolia },
              }) as unknown as AutoManagedNetworkClient<CustomNetworkClientConfiguration>,
          );
          await controller.start();

          expect(mockGetBalancesInSingleCall).not.toHaveBeenCalled();
        },
      );
    });

    it('should detect tokens correctly on supported networks', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });
      await withController(
        {
          options: {
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
          },
          mocks: {
            getAccount: selectedAccount,
            getSelectedAccount: selectedAccount,
          },
        },

        async ({
          controller,
          mockTokenListGetState,
          callActionSpy,
          mockGetNetworkClientById,
          mockNetworkState,
        }) => {
          // Set selectedNetworkClientId to avalanche so the detection uses the right network
          mockNetworkState({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: 'avalanche',
          });
          // Mock getNetworkClientById to return Avalanche chain ID
          mockGetNetworkClientById(
            () =>
              ({
                configuration: { chainId: '0xa86a' },
              }) as unknown as AutoManagedNetworkClient<CustomNetworkClientConfiguration>,
          );

          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0xa86a': {
                timestamp: 0,
                data: {
                  [sampleTokenA.address]: {
                    name: sampleTokenA.name,
                    symbol: sampleTokenA.symbol,
                    decimals: sampleTokenA.decimals,
                    address: sampleTokenA.address,
                    occurrences: 1,
                    aggregators: sampleTokenA.aggregators,
                    iconUrl: sampleTokenA.image,
                  },
                },
              },
            },
          });

          await controller.start();

          expect(callActionSpy).toHaveBeenCalledWith(
            'TokensController:addTokens',
            [sampleTokenA],
            'avalanche',
          );
        },
      );
    });

    it('should not call add tokens if balance is not available on account api', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });

      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });
      await withController(
        {
          options: {
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
          },
          mocks: {
            getAccount: selectedAccount,
            getSelectedAccount: selectedAccount,
          },
        },

        async ({ controller, mockTokenListGetState, callActionSpy }) => {
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0xa86a': {
                timestamp: 0,
                data: {
                  test: {
                    name: sampleTokenA.name,
                    symbol: sampleTokenA.symbol,
                    decimals: sampleTokenA.decimals,
                    address: 'test',
                    occurrences: 1,
                    aggregators: sampleTokenA.aggregators,
                    iconUrl: sampleTokenA.image,
                  },
                },
              },
            },
          });

          await controller.start();

          expect(callActionSpy).not.toHaveBeenCalledWith(
            'TokensController:addDetectedTokens',
            [sampleTokenA],
            {
              chainId: ChainId.sepolia,
              selectedAddress: selectedAccount.address,
            },
          );
        },
      );
    });

    it('should detect tokens correctly on the Sepolia network', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });
      await withController(
        {
          options: {
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
          },
          mocks: {
            getAccount: selectedAccount,
            getSelectedAccount: selectedAccount,
          },
        },
        async ({
          controller,
          mockTokenListGetState,
          mockNetworkState,
          mockGetNetworkClientById,
          mockFindNetworkClientIdByChainId,
          callActionSpy,
        }) => {
          // Use Sepolia (0xaa36a7) which is not in SUPPORTED_NETWORKS_ACCOUNTS_API_V4
          mockNetworkState({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: 'avalanche',
          });
          mockGetNetworkClientById(
            () =>
              ({
                configuration: { chainId: '0xa86a' },
              }) as unknown as AutoManagedNetworkClient<CustomNetworkClientConfiguration>,
          );
          mockFindNetworkClientIdByChainId(() => 'avalanche');
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0xa86a': {
                timestamp: 0,
                data: {
                  [sampleTokenA.address]: {
                    name: sampleTokenA.name,
                    symbol: sampleTokenA.symbol,
                    decimals: sampleTokenA.decimals,
                    address: sampleTokenA.address,
                    occurrences: 1,
                    aggregators: sampleTokenA.aggregators,
                    iconUrl: sampleTokenA.image,
                  },
                },
              },
            },
          });

          await controller.start();

          expect(callActionSpy).toHaveBeenCalledWith(
            'TokensController:addTokens',
            [sampleTokenA],
            'avalanche',
          );
        },
      );
    });

    it('should update detectedTokens when new tokens are detected', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
        [sampleTokenB.address]: new BN(1),
      });
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });
      const interval = 100;
      await withController(
        {
          options: {
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            interval,
          },
          mocks: {
            getAccount: selectedAccount,
            getSelectedAccount: selectedAccount,
          },
        },
        async ({
          controller,
          mockTokenListGetState,
          callActionSpy,
          mockNetworkState,
        }) => {
          mockNetworkState({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: 'avalanche',
          });
          const tokenListState = {
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0xa86a': {
                timestamp: 0,
                data: {
                  [sampleTokenA.address]: {
                    name: sampleTokenA.name,
                    symbol: sampleTokenA.symbol,
                    decimals: sampleTokenA.decimals,
                    address: sampleTokenA.address,
                    occurrences: 1,
                    aggregators: sampleTokenA.aggregators,
                    iconUrl: sampleTokenA.image,
                  },
                },
              },
            },
          };
          mockTokenListGetState(tokenListState);
          await controller.start();

          tokenListState.tokensChainsCache['0xa86a'].data[
            sampleTokenB.address
          ] = {
            name: sampleTokenB.name,
            symbol: sampleTokenB.symbol,
            decimals: sampleTokenB.decimals,
            address: sampleTokenB.address,
            occurrences: 1,
            aggregators: sampleTokenB.aggregators,
            iconUrl: sampleTokenB.image,
          };
          mockTokenListGetState(tokenListState);
          await jestAdvanceTime({ duration: interval });

          expect(callActionSpy).toHaveBeenCalledWith(
            'TokensController:addTokens',
            [sampleTokenA, sampleTokenB],
            'avalanche',
          );
        },
      );
    });

    it('should not add ignoredTokens to the tokens list if detected with balance', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });
      await withController(
        {
          options: {
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
          },
          mocks: {
            getAccount: selectedAccount,
            getSelectedAccount: selectedAccount,
          },
        },
        async ({
          controller,
          mockTokensGetState,
          mockTokenListGetState,
          callActionSpy,
        }) => {
          mockTokensGetState({
            ...getDefaultTokensState(),
          });
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0xa86a': {
                timestamp: 0,
                data: {
                  [sampleTokenA.address]: {
                    name: sampleTokenA.name,
                    symbol: sampleTokenA.symbol,
                    decimals: sampleTokenA.decimals,
                    address: sampleTokenA.address,
                    occurrences: 1,
                    aggregators: sampleTokenA.aggregators,
                    iconUrl: sampleTokenA.image,
                  },
                },
              },
            },
          });

          await controller.start();

          expect(callActionSpy).not.toHaveBeenCalledWith(
            'TokensController:addDetectedTokens',
          );
        },
      );
    });

    it('should not detect tokens if there is no selectedAddress set', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      await withController(
        {
          options: {
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
          },
          mocks: {
            getSelectedAccount: defaultSelectedAccount,
          },
        },
        async ({ controller, mockTokenListGetState, callActionSpy }) => {
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0xa86a': {
                timestamp: 0,
                data: {
                  [sampleTokenA.address]: {
                    name: sampleTokenA.name,
                    symbol: sampleTokenA.symbol,
                    decimals: sampleTokenA.decimals,
                    address: sampleTokenA.address,
                    occurrences: 1,
                    aggregators: sampleTokenA.aggregators,
                    iconUrl: sampleTokenA.image,
                  },
                },
              },
            },
          });

          await controller.start();

          expect(callActionSpy).not.toHaveBeenCalledWith(
            'TokensController:addDetectedTokens',
          );
        },
      );
    });
  });

  describe('AccountsController:selectedAccountChange', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe('when "disabled" is false', () => {
      it('should detect new tokens after switching between accounts', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const firstSelectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        const secondSelectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000002',
        });
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getSelectedAccount: firstSelectedAccount,
            },
          },
          async ({
            mockGetAccount,
            mockTokenListGetState,
            triggerSelectedAccountChange,
            callActionSpy,
            mockNetworkState,
          }) => {
            // Set selectedNetworkClientId to avalanche and include it in networkConfigurationsByChainId
            const defaultState = getDefaultNetworkControllerState();
            mockNetworkState({
              ...defaultState,
              selectedNetworkClientId: 'avalanche',
              networkConfigurationsByChainId: {
                ...defaultState.networkConfigurationsByChainId,
                ...mockNetworkConfigurationsByChainId,
              },
            });
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                '0xa86a': {
                  timestamp: 0,
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                },
              },
            });

            mockGetAccount(secondSelectedAccount);
            triggerSelectedAccountChange(secondSelectedAccount);
            await jestAdvanceTime({ duration: 1 });

            expect(callActionSpy).toHaveBeenCalledWith(
              'TokensController:addTokens',
              [sampleTokenA],
              'avalanche',
            );
          },
        );
      });

      it('should not detect new tokens if the account is unchanged', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const selectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getSelectedAccount: selectedAccount,
            },
          },
          async ({
            mockTokenListGetState,
            triggerSelectedAccountChange,
            callActionSpy,
          }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                '0xa86a': {
                  timestamp: 0,
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                },
              },
            });

            triggerSelectedAccountChange({
              address: selectedAccount.address,
            } as InternalAccount);
            await jestAdvanceTime({ duration: 1 });

            expect(callActionSpy).not.toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
            );
          },
        );
      });

      describe('when keyring is locked', () => {
        it('should not detect new tokens after switching between accounts', async () => {
          const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
            [sampleTokenA.address]: new BN(1),
          });
          const firstSelectedAccount = createMockInternalAccount({
            address: '0x0000000000000000000000000000000000000001',
          });
          const secondSelectedAccount = createMockInternalAccount({
            address: '0x0000000000000000000000000000000000000002',
          });
          await withController(
            {
              options: {
                disabled: false,
                getBalancesInSingleCall: mockGetBalancesInSingleCall,
              },
              mocks: {
                getSelectedAccount: firstSelectedAccount,
              },
              isKeyringUnlocked: false,
            },
            async ({
              mockTokenListGetState,
              triggerSelectedAccountChange,
              callActionSpy,
            }) => {
              mockTokenListGetState({
                ...getDefaultTokenListState(),
                tokensChainsCache: {
                  '0xa86a': {
                    timestamp: 0,
                    data: {
                      [sampleTokenA.address]: {
                        name: sampleTokenA.name,
                        symbol: sampleTokenA.symbol,
                        decimals: sampleTokenA.decimals,
                        address: sampleTokenA.address,
                        occurrences: 1,
                        aggregators: sampleTokenA.aggregators,
                        iconUrl: sampleTokenA.image,
                      },
                    },
                  },
                },
              });

              triggerSelectedAccountChange({
                address: secondSelectedAccount.address,
              } as InternalAccount);
              await jestAdvanceTime({ duration: 1 });

              expect(callActionSpy).not.toHaveBeenCalledWith(
                'TokensController:addDetectedTokens',
              );
            },
          );
        });
      });
    });

    describe('when "disabled" is true', () => {
      it('should not detect new tokens after switching between accounts', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const firstSelectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        const secondSelectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000002',
        });
        await withController(
          {
            options: {
              disabled: true,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getSelectedAccount: firstSelectedAccount,
            },
          },
          async ({
            mockTokenListGetState,
            triggerSelectedAccountChange,
            callActionSpy,
          }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                '0xa86a': {
                  timestamp: 0,
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                },
              },
            });

            triggerSelectedAccountChange({
              address: secondSelectedAccount.address,
            } as InternalAccount);
            await jestAdvanceTime({ duration: 1 });

            expect(callActionSpy).not.toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
            );
          },
        );
      });
    });
  });

  describe('PreferencesController:stateChange', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe('when "disabled" is false', () => {
      it('should detect new tokens after switching between accounts', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const firstSelectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        const secondSelectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000002',
        });
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getSelectedAccount: firstSelectedAccount,
            },
          },
          async ({
            mockGetAccount,
            mockTokenListGetState,
            mockNetworkState,
            triggerPreferencesStateChange,
            triggerSelectedAccountChange,
            callActionSpy,
          }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                '0xa86a': {
                  timestamp: 0,
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                },
              },
            });
            mockNetworkState({
              networkConfigurationsByChainId: {
                '0xa86a': {
                  name: 'avalanche',
                  nativeCurrency: 'AVAX',
                  rpcEndpoints: [
                    {
                      networkClientId: 'avalanche',
                      type: RpcEndpointType.Custom,
                      url: 'https://api.avax.network/ext/bc/C/rpc',
                    },
                  ],
                  blockExplorerUrls: [],
                  chainId: '0xa86a',
                  defaultRpcEndpointIndex: 0,
                },
              },
              networksMetadata: {},
              selectedNetworkClientId: 'avalanche',
            });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              useTokenDetection: true,
            });
            mockGetAccount(secondSelectedAccount);
            triggerSelectedAccountChange(secondSelectedAccount);
            await jestAdvanceTime({ duration: 1 });

            expect(callActionSpy).toHaveBeenLastCalledWith(
              'TokensController:addTokens',
              [sampleTokenA],
              'avalanche',
            );
          },
        );
      });

      it('should detect new tokens after switching between accounts on different chains', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const firstSelectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        const secondSelectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000002',
        });
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getSelectedAccount: firstSelectedAccount,
            },
          },
          async ({
            mockGetAccount,
            mockTokenListGetState,
            mockNetworkState,
            triggerPreferencesStateChange,
            triggerSelectedAccountChange,
            controller,
          }) => {
            const mockTokens = jest.spyOn(controller, 'detectTokens');
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                '0xa86a': {
                  timestamp: 0,
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                },
              },
            });
            // Set to avalanche which is not in SUPPORTED_NETWORKS_ACCOUNTS_API_V4
            mockNetworkState({
              ...getDefaultNetworkControllerState(),
              selectedNetworkClientId: 'avalanche',
            });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              useTokenDetection: true,
            });
            mockGetAccount(secondSelectedAccount);
            triggerSelectedAccountChange(secondSelectedAccount);

            await jestAdvanceTime({ duration: 1 });

            // detectTokens is called once when account changes
            // (preference change doesn't trigger since useTokenDetection was already true by default)
            expect(mockTokens).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should detect new tokens after enabling token detection', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const selectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getSelectedAccount: selectedAccount,
            },
          },
          async ({
            mockGetAccount,
            mockTokenListGetState,
            triggerPreferencesStateChange,
            callActionSpy,
            mockNetworkState,
          }) => {
            // Set selectedNetworkClientId to avalanche (not in SUPPORTED_NETWORKS_ACCOUNTS_API_V4)
            mockNetworkState({
              ...getDefaultNetworkControllerState(),
              selectedNetworkClientId: 'avalanche',
            });
            mockGetAccount(selectedAccount);
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                '0xa86a': {
                  timestamp: 0,
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                },
              },
            });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              useTokenDetection: false,
            });
            await jestAdvanceTime({ duration: 1 });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              useTokenDetection: true,
            });
            await jestAdvanceTime({ duration: 1 });

            expect(callActionSpy).toHaveBeenCalledWith(
              'TokensController:addTokens',
              [sampleTokenA],
              'avalanche',
            );
          },
        );
      });

      it('should not detect new tokens after switching between account if token detection is disabled', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const firstSelectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        const secondSelectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000002',
        });
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getSelectedAccount: firstSelectedAccount,
            },
          },
          async ({
            mockGetAccount,
            mockTokenListGetState,
            triggerSelectedAccountChange,
            triggerPreferencesStateChange,
            callActionSpy,
          }) => {
            mockGetAccount(firstSelectedAccount);
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                '0xa86a': {
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                  timestamp: 0,
                },
              },
            });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              useTokenDetection: false,
            });
            mockGetAccount(secondSelectedAccount);
            triggerSelectedAccountChange(secondSelectedAccount);
            await jestAdvanceTime({ duration: 1 });

            expect(callActionSpy).not.toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
            );
          },
        );
      });

      it('should not detect new tokens if the account is unchanged', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const selectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getAccount: selectedAccount,
              getSelectedAccount: selectedAccount,
            },
          },
          async ({
            mockTokenListGetState,
            triggerPreferencesStateChange,
            callActionSpy,
          }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                [ChainId.sepolia]: {
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                  timestamp: 0,
                },
              },
            });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              useTokenDetection: true,
            });
            await jestAdvanceTime({ duration: 1 });

            expect(callActionSpy).not.toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
            );
          },
        );
      });
    });

    describe('when keyring is locked', () => {
      it('should not detect new tokens after switching between accounts', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const firstSelectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        const secondSelectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000002',
        });
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getSelectedAccount: firstSelectedAccount,
              getAccount: firstSelectedAccount,
            },
            isKeyringUnlocked: false,
          },
          async ({
            mockGetAccount,
            mockTokenListGetState,
            triggerPreferencesStateChange,
            triggerSelectedAccountChange,
            callActionSpy,
          }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                [ChainId.sepolia]: {
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                  timestamp: 0,
                },
              },
            });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              useTokenDetection: true,
            });
            mockGetAccount(secondSelectedAccount);
            triggerSelectedAccountChange(secondSelectedAccount);
            await jestAdvanceTime({ duration: 1 });

            expect(callActionSpy).not.toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
            );
          },
        );
      });

      it('should not detect new tokens after enabling token detection', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const selectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            isKeyringUnlocked: false,
            mocks: {
              getSelectedAccount: selectedAccount,
              getAccount: selectedAccount,
            },
          },
          async ({
            mockTokenListGetState,
            triggerPreferencesStateChange,
            callActionSpy,
          }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                [ChainId.sepolia]: {
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                  timestamp: 0,
                },
              },
            });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              useTokenDetection: false,
            });
            await jestAdvanceTime({ duration: 1 });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              useTokenDetection: true,
            });
            await jestAdvanceTime({ duration: 1 });

            expect(callActionSpy).not.toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
            );
          },
        );
      });
    });

    describe('when "disabled" is true', () => {
      it('should not detect new tokens after switching between accounts', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const firstSelectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        const secondSelectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000002',
        });
        await withController(
          {
            options: {
              disabled: true,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getAccount: firstSelectedAccount,
              getSelectedAccount: firstSelectedAccount,
            },
          },
          async ({
            mockGetAccount,
            mockTokenListGetState,
            triggerPreferencesStateChange,
            triggerSelectedAccountChange,
            callActionSpy,
          }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                [ChainId.sepolia]: {
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                  timestamp: 0,
                },
              },
            });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              useTokenDetection: true,
            });
            mockGetAccount(secondSelectedAccount);
            triggerSelectedAccountChange(secondSelectedAccount);
            await jestAdvanceTime({ duration: 1 });

            expect(callActionSpy).not.toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
            );
          },
        );
      });

      it('should not detect new tokens after enabling token detection', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const selectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        await withController(
          {
            options: {
              disabled: true,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getAccount: selectedAccount,
              getSelectedAccount: selectedAccount,
            },
          },
          async ({
            mockTokenListGetState,
            triggerPreferencesStateChange,
            callActionSpy,
          }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                [ChainId.sepolia]: {
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                  timestamp: 0,
                },
              },
            });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              useTokenDetection: false,
            });
            await jestAdvanceTime({ duration: 1 });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              useTokenDetection: true,
            });
            await jestAdvanceTime({ duration: 1 });

            expect(callActionSpy).not.toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
            );
          },
        );
      });
    });
  });

  describe('NetworkController:networkDidChange', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe('when "disabled" is false', () => {
      it('should not detect new tokens after switching to a chain that does not support token detection', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const selectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getAccount: selectedAccount,
              getSelectedAccount: selectedAccount,
            },
          },
          async ({
            mockTokenListGetState,
            callActionSpy,
            triggerNetworkDidChange,
          }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                [ChainId.sepolia]: {
                  timestamp: 0,
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                },
              },
            });

            triggerNetworkDidChange({
              ...getDefaultNetworkControllerState(),
              selectedNetworkClientId: NetworkType.sepolia,
            });
            await jestAdvanceTime({ duration: 1 });

            expect(callActionSpy).not.toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
            );
          },
        );
      });

      it('should not detect new tokens if the network client id has not changed', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const selectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getAccount: selectedAccount,
              getSelectedAccount: selectedAccount,
            },
          },
          async ({
            mockTokenListGetState,
            callActionSpy,
            triggerNetworkDidChange,
          }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                [ChainId.sepolia]: {
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                  timestamp: 0,
                },
              },
            });

            triggerNetworkDidChange({
              ...getDefaultNetworkControllerState(),
              selectedNetworkClientId: 'avalanche',
            });
            await jestAdvanceTime({ duration: 1 });

            expect(callActionSpy).not.toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
            );
          },
        );
      });

      describe('when keyring is locked', () => {
        it('should not detect new tokens after switching network client id', async () => {
          const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
            [sampleTokenA.address]: new BN(1),
          });
          const selectedAccount = createMockInternalAccount({
            address: '0x0000000000000000000000000000000000000001',
          });
          await withController(
            {
              options: {
                disabled: false,
                getBalancesInSingleCall: mockGetBalancesInSingleCall,
              },
              isKeyringUnlocked: false,
              mocks: {
                getAccount: selectedAccount,
                getSelectedAccount: selectedAccount,
              },
            },
            async ({
              mockTokenListGetState,
              callActionSpy,
              triggerNetworkDidChange,
            }) => {
              mockTokenListGetState({
                ...getDefaultTokenListState(),
                tokensChainsCache: {
                  [ChainId.sepolia]: {
                    data: {
                      [sampleTokenA.address]: {
                        name: sampleTokenA.name,
                        symbol: sampleTokenA.symbol,
                        decimals: sampleTokenA.decimals,
                        address: sampleTokenA.address,
                        occurrences: 1,
                        aggregators: sampleTokenA.aggregators,
                        iconUrl: sampleTokenA.image,
                      },
                    },
                    timestamp: 0,
                  },
                },
              });

              triggerNetworkDidChange({
                ...getDefaultNetworkControllerState(),
                selectedNetworkClientId: 'avalanche',
              });
              await jestAdvanceTime({ duration: 1 });

              expect(callActionSpy).not.toHaveBeenCalledWith(
                'TokensController:addDetectedTokens',
              );
            },
          );
        });
      });
    });

    describe('when "disabled" is true', () => {
      it('should not detect new tokens after switching network client id', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const selectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        await withController(
          {
            options: {
              disabled: true,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getAccount: selectedAccount,
              getSelectedAccount: selectedAccount,
            },
          },
          async ({
            mockTokenListGetState,
            callActionSpy,
            triggerNetworkDidChange,
          }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                [ChainId.sepolia]: {
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                  timestamp: 0,
                },
              },
            });

            triggerNetworkDidChange({
              ...getDefaultNetworkControllerState(),
              selectedNetworkClientId: 'avalanche',
            });
            await jestAdvanceTime({ duration: 1 });

            expect(callActionSpy).not.toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
            );
          },
        );
      });
    });
  });

  describe('TokenListController:stateChange', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe('when "disabled" is false', () => {
      it('should detect tokens if the token list is non-empty', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const selectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getSelectedAccount: selectedAccount,
              getAccount: selectedAccount,
            },
          },
          async ({
            mockTokenListGetState,
            callActionSpy,
            triggerTokenListStateChange,
            mockNetworkState,
          }) => {
            // Set selectedNetworkClientId to avalanche (not in SUPPORTED_NETWORKS_ACCOUNTS_API_V4)
            mockNetworkState({
              ...getDefaultNetworkControllerState(),
              selectedNetworkClientId: 'avalanche',
            });
            const tokenList = {
              [sampleTokenA.address]: {
                name: sampleTokenA.name,
                symbol: sampleTokenA.symbol,
                decimals: sampleTokenA.decimals,
                address: sampleTokenA.address,
                occurrences: 1,
                aggregators: sampleTokenA.aggregators,
                iconUrl: sampleTokenA.image,
              },
            };
            const tokenListState = {
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                '0xa86a': {
                  timestamp: 0,
                  data: tokenList,
                },
              },
            };
            mockTokenListGetState(tokenListState);

            triggerTokenListStateChange(tokenListState);
            await jestAdvanceTime({ duration: 1 });

            expect(callActionSpy).toHaveBeenCalledWith(
              'TokensController:addTokens',
              [sampleTokenA],
              'avalanche',
            );
          },
        );
      });

      it('should not detect tokens if the token list is empty', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const selectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getSelectedAccount: selectedAccount,
              getAccount: selectedAccount,
            },
          },
          async ({
            mockTokenListGetState,
            callActionSpy,
            triggerTokenListStateChange,
          }) => {
            const tokenListState = {
              ...getDefaultTokenListState(),
              tokensChainsCache: {},
            };
            mockTokenListGetState(tokenListState);

            triggerTokenListStateChange(tokenListState);
            await jestAdvanceTime({ duration: 1 });

            expect(callActionSpy).not.toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
            );
          },
        );
      });

      describe('when keyring is locked', () => {
        it('should not detect tokens', async () => {
          const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
            [sampleTokenA.address]: new BN(1),
          });
          const selectedAccount = createMockInternalAccount({
            address: '0x0000000000000000000000000000000000000001',
          });
          await withController(
            {
              options: {
                disabled: false,
                getBalancesInSingleCall: mockGetBalancesInSingleCall,
              },
              isKeyringUnlocked: false,
              mocks: {
                getSelectedAccount: selectedAccount,
                getAccount: selectedAccount,
              },
            },
            async ({
              mockTokenListGetState,
              callActionSpy,
              triggerTokenListStateChange,
            }) => {
              const tokenListState = {
                ...getDefaultTokenListState(),
                tokensChainsCache: {
                  [ChainId.sepolia]: {
                    data: {
                      [sampleTokenA.address]: {
                        name: sampleTokenA.name,
                        symbol: sampleTokenA.symbol,
                        decimals: sampleTokenA.decimals,
                        address: sampleTokenA.address,
                        occurrences: 1,
                        aggregators: sampleTokenA.aggregators,
                        iconUrl: sampleTokenA.image,
                      },
                    },
                    timestamp: 0,
                  },
                },
              };
              mockTokenListGetState(tokenListState);

              triggerTokenListStateChange(tokenListState);
              await jestAdvanceTime({ duration: 1 });

              expect(callActionSpy).not.toHaveBeenCalledWith(
                'TokensController:addDetectedTokens',
              );
            },
          );
        });
      });
    });

    describe('when "disabled" is true', () => {
      it('should not detect tokens', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const selectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        await withController(
          {
            options: {
              disabled: true,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getSelectedAccount: selectedAccount,
              getAccount: selectedAccount,
            },
          },
          async ({
            mockTokenListGetState,
            callActionSpy,
            triggerTokenListStateChange,
          }) => {
            const tokenListState = {
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                [ChainId.sepolia]: {
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                  timestamp: 0,
                },
              },
            };
            mockTokenListGetState(tokenListState);

            triggerTokenListStateChange(tokenListState);
            await jestAdvanceTime({ duration: 1 });

            expect(callActionSpy).not.toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
            );
          },
        );
      });
    });

    describe('when previous and incoming tokensChainsCache are equal with the same timestamp', () => {
      it('should not call detect tokens', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const selectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getSelectedAccount: selectedAccount,
              getAccount: selectedAccount,
            },
          },
          async ({
            mockTokenListGetState,
            triggerTokenListStateChange,
            controller,
          }) => {
            const tokenListState = {
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                [ChainId.sepolia]: {
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                  timestamp: 0,
                },
              },
            };
            mockTokenListGetState(tokenListState);
            // This should set the tokensChainsCache value
            triggerTokenListStateChange(tokenListState);
            await jestAdvanceTime({ duration: 1 });

            const mockTokens = jest.spyOn(controller, 'detectTokens');

            // Re-trigger state change so that incoming list is equal the current list in state
            triggerTokenListStateChange(tokenListState);
            await jestAdvanceTime({ duration: 1 });
            expect(mockTokens).toHaveBeenCalledTimes(0);
          },
        );
      });
    });

    describe('when previous and incoming tokensChainsCache are equal with different timestamp', () => {
      it('should not call detect tokens', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const selectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getSelectedAccount: selectedAccount,
              getAccount: selectedAccount,
            },
          },
          async ({
            mockTokenListGetState,
            triggerTokenListStateChange,
            controller,
          }) => {
            const tokenListState = {
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                [ChainId.sepolia]: {
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                  timestamp: 0,
                },
              },
            };
            mockTokenListGetState(tokenListState);
            // This should set the tokensChainsCache value
            triggerTokenListStateChange(tokenListState);
            await jestAdvanceTime({ duration: 1 });

            const mockTokens = jest.spyOn(controller, 'detectTokens');

            // Re-trigger state change so that incoming list is equal the current list in state
            triggerTokenListStateChange({
              ...tokenListState,
              tokensChainsCache: {
                [ChainId.sepolia]: {
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                  timestamp: 3424, // same list with different timestamp should not trigger detectTokens again
                },
              },
            });
            await jestAdvanceTime({ duration: 1 });
            expect(mockTokens).toHaveBeenCalledTimes(0);
          },
        );
      });
    });

    describe('when previous and incoming tokensChainsCache are not equal', () => {
      it('should call detect tokens', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const selectedAccount = createMockInternalAccount({
          address: '0x0000000000000000000000000000000000000001',
        });
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getSelectedAccount: selectedAccount,
              getAccount: selectedAccount,
            },
          },
          async ({
            mockTokenListGetState,
            triggerTokenListStateChange,
            controller,
          }) => {
            const tokenListState = {
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                [ChainId.sepolia]: {
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                  timestamp: 0,
                },
              },
            };
            mockTokenListGetState(tokenListState);
            // This should set the tokensChainsCache value
            triggerTokenListStateChange(tokenListState);
            await jestAdvanceTime({ duration: 1 });

            const mockTokens = jest.spyOn(controller, 'detectTokens');

            // Re-trigger state change so that incoming list is equal the current list in state
            triggerTokenListStateChange({
              ...tokenListState,
              tokensChainsCache: {
                ...tokenListState.tokensChainsCache,
                [ChainId['linea-mainnet']]: {
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      occurrences: 1,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                    },
                  },
                  timestamp: 5546454,
                },
              },
            });
            await jestAdvanceTime({ duration: 1 });
            expect(mockTokens).toHaveBeenCalledTimes(1);
          },
        );
      });
    });
  });

  describe('startPolling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should call detect tokens with networkClientId and address params', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });
      await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
          },
          mocks: {
            getSelectedAccount: selectedAccount,
            getAccount: selectedAccount,
          },
        },
        async ({ controller, mockTokenListGetState }) => {
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              [ChainId.sepolia]: {
                data: {
                  [sampleTokenA.address]: {
                    name: sampleTokenA.name,
                    symbol: sampleTokenA.symbol,
                    decimals: sampleTokenA.decimals,
                    address: sampleTokenA.address,
                    occurrences: 1,
                    aggregators: sampleTokenA.aggregators,
                    iconUrl: sampleTokenA.image,
                  },
                },
                timestamp: 0,
              },
            },
          });
          const spy = jest
            .spyOn(controller, 'detectTokens')
            .mockImplementation(() => {
              return Promise.resolve();
            });

          controller.startPolling({
            chainIds: ['0xa86a'],
            address: '0x1',
          });
          controller.startPolling({
            chainIds: ['0xa86a'],
            address: '0xdeadbeef',
          });
          controller.startPolling({
            chainIds: ['0x5'],
            address: '0x3',
          });
          await jestAdvanceTime({ duration: 0 });

          expect(spy.mock.calls).toMatchObject([
            [{ chainIds: ['0xa86a'], selectedAddress: '0x1' }],
            [{ chainIds: ['0xa86a'], selectedAddress: '0xdeadbeef' }],
            [{ chainIds: ['0x5'], selectedAddress: '0x3' }],
          ]);

          await jestAdvanceTime({ duration: DEFAULT_INTERVAL });
          expect(spy.mock.calls).toMatchObject([
            [{ chainIds: ['0xa86a'], selectedAddress: '0x1' }],
            [{ chainIds: ['0xa86a'], selectedAddress: '0xdeadbeef' }],
            [{ chainIds: ['0x5'], selectedAddress: '0x3' }],
            [{ chainIds: ['0xa86a'], selectedAddress: '0x1' }],
            [{ chainIds: ['0xa86a'], selectedAddress: '0xdeadbeef' }],
            [{ chainIds: ['0x5'], selectedAddress: '0x3' }],
          ]);
        },
      );
    });
  });

  describe('detectTokens', () => {
    it('should not detect tokens if token detection is disabled and current network is not mainnet', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });
      await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
          },
          mocks: {
            getSelectedAccount: selectedAccount,
            getAccount: selectedAccount,
          },
        },
        async ({
          controller,
          mockNetworkState,
          triggerPreferencesStateChange,
          callActionSpy,
        }) => {
          mockNetworkState({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: NetworkType.sepolia,
          });
          triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useTokenDetection: false,
          });
          await controller.detectTokens({
            chainIds: [ChainId.sepolia],
            selectedAddress: selectedAccount.address,
          });
          expect(callActionSpy).not.toHaveBeenCalledWith(
            'TokensController:addDetectedTokens',
          );
        },
      );
    });

    // Note: Test for mainnet legacy token list detection has been removed.
    // Mainnet is now in SUPPORTED_NETWORKS_ACCOUNTS_API_V4, so RPC detection is skipped.
    // Token detection for mainnet is handled via TokenBalancesController (Accounts API).

    it('should detect and add tokens by networkClientId correctly', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });
      await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
          },
          mocks: {
            getSelectedAccount: selectedAccount,
            getAccount: selectedAccount,
          },
        },
        async ({
          controller,
          mockTokenListGetState,
          callActionSpy,
          mockNetworkState,
        }) => {
          // Include Avalanche in networkConfigurationsByChainId for explicit chainId lookup
          const defaultState = getDefaultNetworkControllerState();
          mockNetworkState({
            ...defaultState,
            networkConfigurationsByChainId: {
              ...defaultState.networkConfigurationsByChainId,
              ...mockNetworkConfigurationsByChainId,
            },
          });
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0xa86a': {
                timestamp: 0,
                data: {
                  [sampleTokenA.address]: {
                    name: sampleTokenA.name,
                    symbol: sampleTokenA.symbol,
                    decimals: sampleTokenA.decimals,
                    address: sampleTokenA.address,
                    occurrences: 1,
                    aggregators: sampleTokenA.aggregators,
                    iconUrl: sampleTokenA.image,
                  },
                },
              },
            },
          });

          await controller.detectTokens({
            chainIds: ['0xa86a'],
            selectedAddress: selectedAccount.address,
          });

          expect(callActionSpy).toHaveBeenCalledWith(
            'TokensController:addTokens',
            [sampleTokenA],
            'avalanche',
          );
        },
      );
    });

    it('should invoke the `trackMetaMetricsEvent` callback when token detection is triggered', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });
      const mockTrackMetaMetricsEvent = jest.fn();

      await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            trackMetaMetricsEvent: mockTrackMetaMetricsEvent,
          },
          mocks: {
            getSelectedAccount: selectedAccount,
            getAccount: selectedAccount,
          },
        },
        async ({ controller, mockTokenListGetState, mockNetworkState }) => {
          // Include Avalanche in networkConfigurationsByChainId for explicit chainId lookup
          const defaultState = getDefaultNetworkControllerState();
          mockNetworkState({
            ...defaultState,
            networkConfigurationsByChainId: {
              ...defaultState.networkConfigurationsByChainId,
              ...mockNetworkConfigurationsByChainId,
            },
          });
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0xa86a': {
                timestamp: 0,
                data: {
                  [sampleTokenA.address]: {
                    name: sampleTokenA.name,
                    symbol: sampleTokenA.symbol,
                    decimals: sampleTokenA.decimals,
                    address: sampleTokenA.address,
                    occurrences: 1,
                    aggregators: sampleTokenA.aggregators,
                    iconUrl: sampleTokenA.image,
                  },
                },
              },
            },
          });

          await controller.detectTokens({
            chainIds: ['0xa86a'],
            selectedAddress: selectedAccount.address,
          });

          expect(mockTrackMetaMetricsEvent).toHaveBeenCalledWith({
            event: 'Token Detected',
            category: 'Wallet',
            properties: {
              tokens: [`${sampleTokenA.symbol} - ${sampleTokenA.address}`],
              token_standard: 'ERC20',
              asset_type: 'TOKEN',
            },
          });
        },
      );
    });

    it('does not trigger `TokensController:addDetectedTokens` action when selectedAccount is not found', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });

      const mockTrackMetaMetricsEvent = jest.fn();

      await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            trackMetaMetricsEvent: mockTrackMetaMetricsEvent,
          },
        },
        async ({
          controller,
          mockGetAccount,
          mockTokenListGetState,
          callActionSpy,
          mockNetworkState,
        }) => {
          // Include Avalanche in networkConfigurationsByChainId for explicit chainId lookup
          const defaultState = getDefaultNetworkControllerState();
          mockNetworkState({
            ...defaultState,
            networkConfigurationsByChainId: {
              ...defaultState.networkConfigurationsByChainId,
              ...mockNetworkConfigurationsByChainId,
            },
          });
          // @ts-expect-error forcing an undefined value
          mockGetAccount(undefined);
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0xa86a': {
                timestamp: 0,
                data: {
                  [sampleTokenA.address]: {
                    name: sampleTokenA.name,
                    symbol: sampleTokenA.symbol,
                    decimals: sampleTokenA.decimals,
                    address: sampleTokenA.address,
                    occurrences: 1,
                    aggregators: sampleTokenA.aggregators,
                    iconUrl: sampleTokenA.image,
                  },
                },
              },
            },
          });

          await controller.detectTokens({
            chainIds: ['0xa86a'],
          });

          expect(callActionSpy).toHaveBeenLastCalledWith(
            'TokensController:addTokens',
            [
              {
                address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
                aggregators: [
                  'Paraswap',
                  'PMM',
                  'AirswapLight',
                  '0x',
                  'Bancor',
                  'CoinGecko',
                  'Zapper',
                  'Kleros',
                  'Zerion',
                  'CMC',
                  '1inch',
                ],
                decimals: 18,
                image:
                  'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
                isERC721: false,
                name: 'Chainlink',
                symbol: 'LINK',
              },
            ],
            'avalanche',
          );
        },
      );
    });

    it('should fallback to rpc call', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });
      await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
          },
          mocks: {
            getSelectedAccount: selectedAccount,
            getAccount: selectedAccount,
          },
        },
        async ({
          controller,
          mockNetworkState,
          triggerPreferencesStateChange,
          callActionSpy,
        }) => {
          mockNetworkState({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: 'polygon',
          });
          triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useTokenDetection: false,
          });
          await controller.detectTokens({
            chainIds: [ChainId.sepolia],
            selectedAddress: selectedAccount.address,
          });
          expect(callActionSpy).not.toHaveBeenCalledWith(
            'TokensController:addDetectedTokens',
          );
        },
      );
    });

    it('should detect tokens when TransactionController:transactionConfirmed is triggered', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });
      await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
          },
          mocks: {
            getSelectedAccount: selectedAccount,
            getAccount: selectedAccount,
          },
        },
        async ({
          mockTokenListGetState,
          mockNetworkState,
          callActionSpy,
          triggerTransactionConfirmed,
        }) => {
          const defaultState = getDefaultNetworkControllerState();
          mockNetworkState({
            ...defaultState,
            selectedNetworkClientId: 'avalanche',
            networkConfigurationsByChainId: {
              ...defaultState.networkConfigurationsByChainId,
              ...mockNetworkConfigurationsByChainId,
            },
          });
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0xa86a': {
                timestamp: 0,
                data: {
                  [sampleTokenA.address]: {
                    name: sampleTokenA.name,
                    symbol: sampleTokenA.symbol,
                    decimals: sampleTokenA.decimals,
                    address: sampleTokenA.address,
                    occurrences: 1,
                    aggregators: sampleTokenA.aggregators,
                    iconUrl: sampleTokenA.image,
                  },
                },
              },
            },
          });

          triggerTransactionConfirmed({ chainId: '0xa86a' });
          // Wait for async detection to complete
          await new Promise((resolve) => setTimeout(resolve, 10));

          expect(callActionSpy).toHaveBeenCalledWith(
            'TokensController:addTokens',
            [sampleTokenA],
            'avalanche',
          );
        },
      );
    });

    it('should not detect tokens when useExternalServices returns false', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });
      await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            useExternalServices: () => false,
          },
          mocks: {
            getSelectedAccount: selectedAccount,
            getAccount: selectedAccount,
          },
        },
        async ({ controller, callActionSpy }) => {
          await controller.detectTokens();

          expect(callActionSpy).not.toHaveBeenCalledWith(
            'TokensController:addTokens',
          );
          expect(callActionSpy).not.toHaveBeenCalledWith(
            'TokensController:addDetectedTokens',
          );
        },
      );
    });

    it('should not detect tokens when no client networks are found', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });
      await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
          },
          mocks: {
            getSelectedAccount: selectedAccount,
            getAccount: selectedAccount,
          },
        },
        async ({
          controller,
          mockNetworkState,
          mockGetNetworkConfigurationByNetworkClientId,
          callActionSpy,
        }) => {
          mockNetworkState({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: 'unknown-network',
          });
          // Return undefined for unknown network to simulate no network config
          mockGetNetworkConfigurationByNetworkClientId(
            () => undefined as never,
          );

          await controller.detectTokens();

          expect(callActionSpy).not.toHaveBeenCalledWith(
            'TokensController:addTokens',
          );
        },
      );
    });

    it('should filter out tokens that are already owned by the user', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });
      await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
          },
          mocks: {
            getSelectedAccount: selectedAccount,
            getAccount: selectedAccount,
          },
        },
        async ({
          controller,
          mockNetworkState,
          mockTokenListGetState,
          mockTokensGetState,
          callActionSpy,
        }) => {
          const defaultState = getDefaultNetworkControllerState();
          mockNetworkState({
            ...defaultState,
            selectedNetworkClientId: 'avalanche',
            networkConfigurationsByChainId: {
              ...defaultState.networkConfigurationsByChainId,
              ...mockNetworkConfigurationsByChainId,
            },
          });
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0xa86a': {
                timestamp: 0,
                data: {
                  [sampleTokenA.address]: {
                    name: sampleTokenA.name,
                    symbol: sampleTokenA.symbol,
                    decimals: sampleTokenA.decimals,
                    address: sampleTokenA.address,
                    occurrences: 1,
                    aggregators: sampleTokenA.aggregators,
                    iconUrl: sampleTokenA.image,
                  },
                },
              },
            },
          });
          // Mock that the user already owns this token
          mockTokensGetState({
            ...getDefaultTokensState(),
            allTokens: {
              '0xa86a': {
                [selectedAccount.address]: [
                  { address: sampleTokenA.address } as Token,
                ],
              },
            },
          });

          await controller.detectTokens();

          // Should not call addTokens since token is already owned
          expect(callActionSpy).not.toHaveBeenCalledWith(
            'TokensController:addTokens',
            expect.anything(),
            'avalanche',
          );
        },
      );
    });

    it('should use static mainnet token list when token detection is disabled for mainnet', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': new BN(1), // USDC on mainnet
      });
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });
      await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
          },
          mocks: {
            getSelectedAccount: selectedAccount,
            getAccount: selectedAccount,
          },
        },
        async ({
          controller,
          mockNetworkState,
          mockFindNetworkClientIdByChainId,
          triggerPreferencesStateChange,
        }) => {
          const defaultState = getDefaultNetworkControllerState();
          mockNetworkState({
            ...defaultState,
            selectedNetworkClientId: 'mainnet',
            networkConfigurationsByChainId: {
              ...defaultState.networkConfigurationsByChainId,
              '0x1': {
                chainId: '0x1',
                name: 'Ethereum Mainnet',
                nativeCurrency: 'ETH',
                blockExplorerUrls: [],
                defaultBlockExplorerUrlIndex: 0,
                defaultRpcEndpointIndex: 0,
                rpcEndpoints: [
                  {
                    networkClientId: 'mainnet',
                    type: RpcEndpointType.Custom,
                    url: 'https://mainnet.infura.io/v3/test',
                    failoverUrls: [],
                  },
                ],
              },
            },
          });
          mockFindNetworkClientIdByChainId(() => 'mainnet');

          // Disable token detection - this should trigger static mainnet token list usage
          triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useTokenDetection: false,
          });

          // Trigger detection with forceRpc to ensure we test the static token list path
          await controller.detectTokens({
            chainIds: [ChainId.mainnet],
            forceRpc: true,
          });

          // The detection should have been attempted (static token list is used internally)
          // We verify the getBalancesInSingleCall was called, indicating detection ran
          expect(mockGetBalancesInSingleCall).toHaveBeenCalled();
        },
      );
    });

    it('should skip chains supported by Accounts API when forceRpc is false', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });
      await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
          },
          mocks: {
            getSelectedAccount: selectedAccount,
            getAccount: selectedAccount,
          },
        },
        async ({
          controller,
          mockNetworkState,
          mockFindNetworkClientIdByChainId,
        }) => {
          const defaultState = getDefaultNetworkControllerState();
          mockNetworkState({
            ...defaultState,
            selectedNetworkClientId: 'mainnet',
            networkConfigurationsByChainId: {
              ...defaultState.networkConfigurationsByChainId,
              '0x1': {
                chainId: '0x1',
                name: 'Ethereum Mainnet',
                nativeCurrency: 'ETH',
                blockExplorerUrls: [],
                defaultBlockExplorerUrlIndex: 0,
                defaultRpcEndpointIndex: 0,
                rpcEndpoints: [
                  {
                    networkClientId: 'mainnet',
                    type: RpcEndpointType.Custom,
                    url: 'https://mainnet.infura.io/v3/test',
                    failoverUrls: [],
                  },
                ],
              },
            },
          });
          mockFindNetworkClientIdByChainId(() => 'mainnet');

          // Call detectTokens with mainnet (which is in SUPPORTED_NETWORKS_ACCOUNTS_API_V4)
          // Without forceRpc, it should skip mainnet
          await controller.detectTokens({
            chainIds: [ChainId.mainnet],
          });

          // Should NOT call getBalancesInSingleCall since mainnet is skipped
          expect(mockGetBalancesInSingleCall).not.toHaveBeenCalled();
        },
      );
    });

    it('should detect tokens on Accounts API supported chains when forceRpc is true', async () => {
      const mainnetUSDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [mainnetUSDC]: new BN(1),
      });
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });
      await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
          },
          mocks: {
            getSelectedAccount: selectedAccount,
            getAccount: selectedAccount,
          },
        },
        async ({
          controller,
          mockNetworkState,
          mockFindNetworkClientIdByChainId,
          mockTokenListGetState,
          triggerPreferencesStateChange,
        }) => {
          const defaultState = getDefaultNetworkControllerState();
          mockNetworkState({
            ...defaultState,
            selectedNetworkClientId: 'mainnet',
            networkConfigurationsByChainId: {
              ...defaultState.networkConfigurationsByChainId,
              '0x1': {
                chainId: '0x1',
                name: 'Ethereum Mainnet',
                nativeCurrency: 'ETH',
                blockExplorerUrls: [],
                defaultBlockExplorerUrlIndex: 0,
                defaultRpcEndpointIndex: 0,
                rpcEndpoints: [
                  {
                    networkClientId: 'mainnet',
                    type: RpcEndpointType.Custom,
                    url: 'https://mainnet.infura.io/v3/test',
                    failoverUrls: [],
                  },
                ],
              },
            },
          });
          mockFindNetworkClientIdByChainId(() => 'mainnet');

          // Provide token list data for mainnet
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0x1': {
                timestamp: 0,
                data: {
                  [mainnetUSDC]: {
                    name: 'USD Coin',
                    symbol: 'USDC',
                    decimals: 6,
                    address: mainnetUSDC,
                    occurrences: 1,
                    aggregators: [],
                    iconUrl: '',
                  },
                },
              },
            },
          });

          // Enable token detection for mainnet
          triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useTokenDetection: true,
          });

          // Call detectTokens with forceRpc: true to force RPC detection on mainnet
          await controller.detectTokens({
            chainIds: [ChainId.mainnet],
            forceRpc: true,
          });

          // Should call getBalancesInSingleCall since forceRpc bypasses Accounts API filter
          expect(mockGetBalancesInSingleCall).toHaveBeenCalled();
        },
      );
    });
  });

  describe('mapChainIdWithTokenListMap', () => {
    it('should return an empty object when given an empty input', () => {
      const tokensChainsCache = {};
      const result = mapChainIdWithTokenListMap(tokensChainsCache);
      expect(result).toStrictEqual({});
    });

    it('should return the same structure when there is no "data" property in the object', () => {
      const tokensChainsCache = {
        chain1: { info: 'no data property' },
      };
      const result = mapChainIdWithTokenListMap(tokensChainsCache);
      expect(result).toStrictEqual(tokensChainsCache); // Expect unchanged structure
    });

    it('should map "data" property if present in the object', () => {
      const tokensChainsCache = {
        chain1: { data: 'someData' },
      };
      const result = mapChainIdWithTokenListMap(tokensChainsCache);
      expect(result).toStrictEqual({ chain1: 'someData' });
    });

    it('should handle multiple chains with mixed "data" properties', () => {
      const tokensChainsCache = {
        chain1: { data: 'someData1' },
        chain2: { info: 'no data property' },
        chain3: { data: 'someData3' },
      };
      const result = mapChainIdWithTokenListMap(tokensChainsCache);

      expect(result).toStrictEqual({
        chain1: 'someData1',
        chain2: { info: 'no data property' },
        chain3: 'someData3',
      });
    });

    it('should handle nested object with "data" property correctly', () => {
      const tokensChainsCache = {
        chain1: {
          data: {
            nested: 'nestedData',
          },
        },
      };
      const result = mapChainIdWithTokenListMap(tokensChainsCache);
      expect(result).toStrictEqual({ chain1: { nested: 'nestedData' } });
    });
  });

  describe('constructor options', () => {
    describe('useTokenDetection', () => {
      it('should disable token detection when useTokenDetection is false', async () => {
        const mockGetBalancesInSingleCall = jest.fn();

        await withController(
          {
            options: {
              useTokenDetection: () => false,
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getSelectedAccount: defaultSelectedAccount,
            },
          },
          async ({ controller }) => {
            // Try to detect tokens
            await controller.detectTokens();

            // Should not call getBalancesInSingleCall when useTokenDetection is false
            expect(mockGetBalancesInSingleCall).not.toHaveBeenCalled();
          },
        );
      });

      it('should enable token detection when useTokenDetection is true (default)', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({});

        await withController(
          {
            options: {
              useTokenDetection: () => true,
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getSelectedAccount: defaultSelectedAccount,
            },
          },
          async ({ controller, mockTokenListGetState, mockNetworkState }) => {
            // Set selectedNetworkClientId to avalanche (not in SUPPORTED_NETWORKS_ACCOUNTS_API_V4)
            mockNetworkState({
              ...getDefaultNetworkControllerState(),
              selectedNetworkClientId: 'avalanche',
            });
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                '0xa86a': {
                  timestamp: 0,
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                      occurrences: 11,
                    },
                  },
                },
              },
            });

            // Start the controller to make it active
            await controller.start();
            // Try to detect tokens
            await controller.detectTokens();

            // Should call getBalancesInSingleCall when useTokenDetection is true
            expect(mockGetBalancesInSingleCall).toHaveBeenCalled();
          },
        );
      });

      it('should not start polling when useTokenDetection is false', async () => {
        const mockGetBalancesInSingleCall = jest.fn();

        await withController(
          {
            options: {
              useTokenDetection: () => false,
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getSelectedAccount: defaultSelectedAccount,
            },
          },
          async ({ controller }) => {
            await controller.start();

            // Should not call getBalancesInSingleCall during start when useTokenDetection is false
            expect(mockGetBalancesInSingleCall).not.toHaveBeenCalled();
          },
        );
      });

      it('should start polling when useTokenDetection is true (default)', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({});

        await withController(
          {
            options: {
              useTokenDetection: () => true,
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
            },
            mocks: {
              getSelectedAccount: defaultSelectedAccount,
            },
          },
          async ({ controller, mockTokenListGetState, mockNetworkState }) => {
            // Set selectedNetworkClientId to avalanche (not in SUPPORTED_NETWORKS_ACCOUNTS_API_V4)
            mockNetworkState({
              ...getDefaultNetworkControllerState(),
              selectedNetworkClientId: 'avalanche',
            });
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                '0xa86a': {
                  timestamp: 0,
                  data: {
                    [sampleTokenA.address]: {
                      name: sampleTokenA.name,
                      symbol: sampleTokenA.symbol,
                      decimals: sampleTokenA.decimals,
                      address: sampleTokenA.address,
                      aggregators: sampleTokenA.aggregators,
                      iconUrl: sampleTokenA.image,
                      occurrences: 11,
                    },
                  },
                },
              },
            });

            await controller.start();

            // Should call getBalancesInSingleCall during start when useTokenDetection is true
            expect(mockGetBalancesInSingleCall).toHaveBeenCalled();
          },
        );
      });
    });
  });

  describe('addDetectedTokensViaWs', () => {
    it('should add tokens detected from websocket with metadata from cache', async () => {
      const mockTokenAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
      const checksummedTokenAddress =
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      const chainId = '0xa86a';

      await withController(
        {
          options: {
            disabled: false,
          },
          mockTokenListState: {
            tokensChainsCache: {
              [chainId]: {
                timestamp: 0,
                data: {
                  [mockTokenAddress]: {
                    name: 'USD Coin',
                    symbol: 'USDC',
                    decimals: 6,
                    address: mockTokenAddress,
                    aggregators: [],
                    iconUrl: 'https://example.com/usdc.png',
                    occurrences: 11,
                  },
                },
              },
            },
          },
        },
        async ({ controller, callActionSpy }) => {
          await controller.addDetectedTokensViaWs({
            tokensSlice: [mockTokenAddress],
            chainId: chainId as Hex,
          });

          expect(callActionSpy).toHaveBeenCalledWith(
            'TokensController:addTokens',
            [
              {
                address: checksummedTokenAddress,
                decimals: 6,
                symbol: 'USDC',
                aggregators: [],
                image: 'https://example.com/usdc.png',
                isERC721: false,
                name: 'USD Coin',
              },
            ],
            'avalanche',
          );
        },
      );
    });

    it('should skip tokens not found in cache and log warning', async () => {
      const mockTokenAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
      const chainId = '0xa86a';

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await withController(
        {
          options: {
            disabled: false,
          },
          mockTokenListState: {
            tokensChainsCache: {
              [chainId]: {
                timestamp: 0,
                data: {},
              },
            },
          },
        },
        async ({ controller, callActionSpy }) => {
          await controller.addDetectedTokensViaWs({
            tokensSlice: [mockTokenAddress],
            chainId: chainId as Hex,
          });

          // Should log warning about missing token metadata
          expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Token metadata not found in cache'),
          );

          // Should not call addTokens if no tokens have metadata
          expect(callActionSpy).not.toHaveBeenCalledWith(
            'TokensController:addTokens',
            expect.anything(),
            expect.anything(),
          );

          consoleSpy.mockRestore();
        },
      );
    });

    it('should add all tokens provided without filtering (filtering is caller responsibility)', async () => {
      const mockTokenAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
      const checksummedTokenAddress =
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      const secondTokenAddress = '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c';
      const checksummedSecondTokenAddress =
        '0x1F573D6Fb3F13d689FF844B4cE37794d79a7FF1C';
      const chainId = '0xa86a';
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });

      await withController(
        {
          options: {
            disabled: false,
          },
          mocks: {
            getSelectedAccount: selectedAccount,
            getAccount: selectedAccount,
          },
          mockTokenListState: {
            tokensChainsCache: {
              [chainId]: {
                timestamp: 0,
                data: {
                  [mockTokenAddress]: {
                    name: 'USD Coin',
                    symbol: 'USDC',
                    decimals: 6,
                    address: mockTokenAddress,
                    aggregators: [],
                    iconUrl: 'https://example.com/usdc.png',
                    occurrences: 11,
                  },
                  [secondTokenAddress]: {
                    name: 'Bancor',
                    symbol: 'BNT',
                    decimals: 18,
                    address: secondTokenAddress,
                    aggregators: [],
                    iconUrl: 'https://example.com/bnt.png',
                    occurrences: 11,
                  },
                },
              },
            },
          },
        },
        async ({ controller, callActionSpy }) => {
          // Add both tokens via websocket
          await controller.addDetectedTokensViaWs({
            tokensSlice: [mockTokenAddress, secondTokenAddress],
            chainId: chainId as Hex,
          });

          // Should add both tokens (no filtering in addDetectedTokensViaWs)
          expect(callActionSpy).toHaveBeenCalledWith(
            'TokensController:addTokens',
            [
              {
                address: checksummedTokenAddress,
                decimals: 6,
                symbol: 'USDC',
                aggregators: [],
                image: 'https://example.com/usdc.png',
                isERC721: false,
                name: 'USD Coin',
              },
              {
                address: checksummedSecondTokenAddress,
                decimals: 18,
                symbol: 'BNT',
                aggregators: [],
                image: 'https://example.com/bnt.png',
                isERC721: false,
                name: 'Bancor',
              },
            ],
            'avalanche',
          );
        },
      );
    });

    it('should track metrics when adding tokens from websocket', async () => {
      const mockTokenAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
      const checksummedTokenAddress =
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      const chainId = '0xa86a';
      const mockTrackMetricsEvent = jest.fn();

      await withController(
        {
          options: {
            disabled: false,
            trackMetaMetricsEvent: mockTrackMetricsEvent,
          },
          mockTokenListState: {
            tokensChainsCache: {
              [chainId]: {
                timestamp: 0,
                data: {
                  [mockTokenAddress]: {
                    name: 'USD Coin',
                    symbol: 'USDC',
                    decimals: 6,
                    address: mockTokenAddress,
                    aggregators: [],
                    iconUrl: 'https://example.com/usdc.png',
                    occurrences: 11,
                  },
                },
              },
            },
          },
        },
        async ({ controller, callActionSpy }) => {
          await controller.addDetectedTokensViaWs({
            tokensSlice: [mockTokenAddress],
            chainId: chainId as Hex,
          });

          // Should track metrics event
          expect(mockTrackMetricsEvent).toHaveBeenCalledWith({
            event: 'Token Detected',
            category: 'Wallet',
            properties: {
              tokens: [`USDC - ${checksummedTokenAddress}`],
              token_standard: 'ERC20',
              asset_type: 'TOKEN',
            },
          });

          expect(callActionSpy).toHaveBeenCalledWith(
            'TokensController:addTokens',
            expect.anything(),
            expect.anything(),
          );
        },
      );
    });

    it('should be callable directly as a public method on the controller instance', async () => {
      const mockTokenAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
      const checksummedTokenAddress =
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      const chainId = '0xa86a';

      await withController(
        {
          options: {
            disabled: false,
          },
          mockTokenListState: {
            tokensChainsCache: {
              [chainId]: {
                timestamp: 0,
                data: {
                  [mockTokenAddress]: {
                    name: 'USD Coin',
                    symbol: 'USDC',
                    decimals: 6,
                    address: mockTokenAddress,
                    aggregators: [],
                    iconUrl: 'https://example.com/usdc.png',
                    occurrences: 11,
                  },
                },
              },
            },
          },
        },
        async ({ controller, callActionSpy }) => {
          // Call the public method directly on the controller instance
          await controller.addDetectedTokensViaWs({
            tokensSlice: [mockTokenAddress],
            chainId: chainId as Hex,
          });

          expect(callActionSpy).toHaveBeenCalledWith(
            'TokensController:addTokens',
            [
              {
                address: checksummedTokenAddress,
                decimals: 6,
                symbol: 'USDC',
                aggregators: [],
                image: 'https://example.com/usdc.png',
                isERC721: false,
                name: 'USD Coin',
              },
            ],
            'avalanche',
          );
        },
      );
    });
  });

  describe('addDetectedTokensViaPolling', () => {
    it('should add tokens detected from polling with metadata from cache', async () => {
      const mockTokenAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
      const checksummedTokenAddress =
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      const chainId = '0xa86a';

      await withController(
        {
          options: {
            disabled: false,
            useTokenDetection: () => true,
          },
          mockTokenListState: {
            tokensChainsCache: {
              [chainId]: {
                timestamp: 0,
                data: {
                  [mockTokenAddress]: {
                    name: 'USD Coin',
                    symbol: 'USDC',
                    decimals: 6,
                    address: mockTokenAddress,
                    aggregators: [],
                    iconUrl: 'https://example.com/usdc.png',
                    occurrences: 11,
                  },
                },
              },
            },
          },
        },
        async ({ controller, callActionSpy }) => {
          await controller.addDetectedTokensViaPolling({
            tokensSlice: [mockTokenAddress],
            chainId: chainId as Hex,
          });

          expect(callActionSpy).toHaveBeenCalledWith(
            'TokensController:addTokens',
            [
              {
                address: checksummedTokenAddress,
                decimals: 6,
                symbol: 'USDC',
                aggregators: [],
                image: 'https://example.com/usdc.png',
                isERC721: false,
                name: 'USD Coin',
              },
            ],
            'avalanche',
          );
        },
      );
    });

    it('should skip if useTokenDetection is disabled', async () => {
      const mockTokenAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
      const chainId = '0xa86a';

      await withController(
        {
          options: {
            disabled: false,
            useTokenDetection: () => false,
          },
          mockTokenListState: {
            tokensChainsCache: {
              [chainId]: {
                timestamp: 0,
                data: {
                  [mockTokenAddress]: {
                    name: 'USD Coin',
                    symbol: 'USDC',
                    decimals: 6,
                    address: mockTokenAddress,
                    aggregators: [],
                    iconUrl: 'https://example.com/usdc.png',
                    occurrences: 11,
                  },
                },
              },
            },
          },
        },
        async ({ controller, callActionSpy }) => {
          await controller.addDetectedTokensViaPolling({
            tokensSlice: [mockTokenAddress],
            chainId: chainId as Hex,
          });

          // Should not call addTokens when useTokenDetection is disabled
          expect(callActionSpy).not.toHaveBeenCalledWith(
            'TokensController:addTokens',
            expect.anything(),
            expect.anything(),
          );
        },
      );
    });

    it('should skip tokens already in allTokens', async () => {
      const mockTokenAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
      const checksummedTokenAddress =
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      const chainId = '0xa86a';
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });

      await withController(
        {
          options: {
            disabled: false,
            useTokenDetection: () => true,
          },
          mocks: {
            getAccount: selectedAccount,
            getSelectedAccount: selectedAccount,
          },
          mockTokensState: {
            allTokens: {
              [chainId]: {
                [selectedAccount.address]: [
                  {
                    address: checksummedTokenAddress,
                    symbol: 'USDC',
                    decimals: 6,
                  },
                ],
              },
            },
            allDetectedTokens: {},
            allIgnoredTokens: {},
          },
          mockTokenListState: {
            tokensChainsCache: {
              [chainId]: {
                timestamp: 0,
                data: {
                  [mockTokenAddress]: {
                    name: 'USD Coin',
                    symbol: 'USDC',
                    decimals: 6,
                    address: mockTokenAddress,
                    aggregators: [],
                    iconUrl: 'https://example.com/usdc.png',
                    occurrences: 11,
                  },
                },
              },
            },
          },
        },
        async ({ controller, callActionSpy }) => {
          await controller.addDetectedTokensViaPolling({
            tokensSlice: [mockTokenAddress],
            chainId: chainId as Hex,
          });

          // Should not call addTokens for tokens already in allTokens
          expect(callActionSpy).not.toHaveBeenCalledWith(
            'TokensController:addTokens',
            expect.anything(),
            expect.anything(),
          );
        },
      );
    });

    it('should skip tokens in allIgnoredTokens', async () => {
      const mockTokenAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
      const checksummedTokenAddress =
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      const chainId = '0xa86a';
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });

      await withController(
        {
          options: {
            disabled: false,
            useTokenDetection: () => true,
          },
          mocks: {
            getAccount: selectedAccount,
            getSelectedAccount: selectedAccount,
          },
          mockTokensState: {
            allTokens: {},
            allDetectedTokens: {},
            allIgnoredTokens: {
              [chainId]: {
                [selectedAccount.address]: [checksummedTokenAddress],
              },
            },
          },
          mockTokenListState: {
            tokensChainsCache: {
              [chainId]: {
                timestamp: 0,
                data: {
                  [mockTokenAddress]: {
                    name: 'USD Coin',
                    symbol: 'USDC',
                    decimals: 6,
                    address: mockTokenAddress,
                    aggregators: [],
                    iconUrl: 'https://example.com/usdc.png',
                    occurrences: 11,
                  },
                },
              },
            },
          },
        },
        async ({ controller, callActionSpy }) => {
          await controller.addDetectedTokensViaPolling({
            tokensSlice: [mockTokenAddress],
            chainId: chainId as Hex,
          });

          // Should not call addTokens for tokens in allIgnoredTokens
          expect(callActionSpy).not.toHaveBeenCalledWith(
            'TokensController:addTokens',
            expect.anything(),
            expect.anything(),
          );
        },
      );
    });

    it('should fetch fresh token metadata cache from TokenListController at call time', async () => {
      // This test verifies the fix for the bug where addDetectedTokensViaPolling used
      // a stale/empty tokensChainsCache from construction time instead of fetching
      // fresh data from TokenListController:getState at call time.
      const mockTokenAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
      const checksummedTokenAddress =
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      const chainId = '0xa86a';

      await withController(
        {
          options: {
            disabled: false,
            useTokenDetection: () => true,
          },
          // Start with empty cache at construction time - simulating the bug scenario
          mockTokenListState: {
            tokensChainsCache: {},
          },
        },
        async ({ controller, callActionSpy, mockTokenListGetState }) => {
          // Update the mock to return populated cache data
          // This simulates TokenListController having fetched token list data after construction
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              [chainId]: {
                timestamp: 0,
                data: {
                  [mockTokenAddress]: {
                    name: 'USD Coin',
                    symbol: 'USDC',
                    decimals: 6,
                    address: mockTokenAddress,
                    aggregators: [],
                    iconUrl: 'https://example.com/usdc.png',
                    occurrences: 11,
                  },
                },
              },
            },
          });

          // Call addDetectedTokensViaPolling - with the fix, it should fetch fresh cache
          await controller.addDetectedTokensViaPolling({
            tokensSlice: [mockTokenAddress],
            chainId: chainId as Hex,
          });

          // With the fix, the token should be added because fresh cache is fetched
          expect(callActionSpy).toHaveBeenCalledWith(
            'TokensController:addTokens',
            [
              {
                address: checksummedTokenAddress,
                decimals: 6,
                symbol: 'USDC',
                aggregators: [],
                image: 'https://example.com/usdc.png',
                isERC721: false,
                name: 'USD Coin',
              },
            ],
            'avalanche',
          );
        },
      );
    });

    it('should add only untracked tokens when mixed with tracked/ignored', async () => {
      const trackedTokenAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
      const trackedTokenChecksummed =
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
      const ignoredTokenAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7';
      const ignoredTokenChecksummed =
        '0xdAC17F958D2ee523a2206206994597C13D831ec7';
      const newTokenAddress = '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c';
      const newTokenChecksummed = '0x1F573D6Fb3F13d689FF844B4cE37794d79a7FF1C';
      const chainId = '0xa86a';
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });

      await withController(
        {
          options: {
            disabled: false,
            useTokenDetection: () => true,
          },
          mocks: {
            getAccount: selectedAccount,
            getSelectedAccount: selectedAccount,
          },
          mockTokensState: {
            allTokens: {
              [chainId]: {
                [selectedAccount.address]: [
                  {
                    address: trackedTokenChecksummed,
                    symbol: 'USDC',
                    decimals: 6,
                  },
                ],
              },
            },
            allDetectedTokens: {},
            allIgnoredTokens: {
              [chainId]: {
                [selectedAccount.address]: [ignoredTokenChecksummed],
              },
            },
          },
          mockTokenListState: {
            tokensChainsCache: {
              [chainId]: {
                timestamp: 0,
                data: {
                  [trackedTokenAddress]: {
                    name: 'USD Coin',
                    symbol: 'USDC',
                    decimals: 6,
                    address: trackedTokenAddress,
                    aggregators: [],
                    iconUrl: 'https://example.com/usdc.png',
                    occurrences: 11,
                  },
                  [ignoredTokenAddress]: {
                    name: 'Tether USD',
                    symbol: 'USDT',
                    decimals: 6,
                    address: ignoredTokenAddress,
                    aggregators: [],
                    iconUrl: 'https://example.com/usdt.png',
                    occurrences: 11,
                  },
                  [newTokenAddress]: {
                    name: 'Bancor',
                    symbol: 'BNT',
                    decimals: 18,
                    address: newTokenAddress,
                    aggregators: [],
                    iconUrl: 'https://example.com/bnt.png',
                    occurrences: 11,
                  },
                },
              },
            },
          },
        },
        async ({ controller, callActionSpy }) => {
          await controller.addDetectedTokensViaPolling({
            tokensSlice: [
              trackedTokenAddress,
              ignoredTokenAddress,
              newTokenAddress,
            ],
            chainId: chainId as Hex,
          });

          // Should only add the new untracked token
          expect(callActionSpy).toHaveBeenCalledWith(
            'TokensController:addTokens',
            [
              {
                address: newTokenChecksummed,
                decimals: 18,
                symbol: 'BNT',
                aggregators: [],
                image: 'https://example.com/bnt.png',
                isERC721: false,
                name: 'Bancor',
              },
            ],
            'avalanche',
          );
        },
      );
    });
  });
});

/**
 * Construct the path used to fetch tokens that we can pass to `nock`.
 *
 * @param chainId - The chain ID.
 * @returns The constructed path.
 */
function getTokensPath(chainId: Hex): string {
  return `/tokens/${convertHexToDecimal(
    chainId,
  )}?occurrenceFloor=3&includeNativeAssets=false&includeTokenFees=false&includeAssetType=false`;
}

type WithControllerCallback<ReturnValue> = ({
  controller,
  messenger,
  mockGetAccount,
  mockGetSelectedAccount,
  mockKeyringGetState,
  mockTokensGetState,
  mockTokenListGetState,
  mockPreferencesGetState,
  mockGetNetworkClientById,
  mockGetNetworkConfigurationByNetworkClientId,
  mockNetworkState,
  callActionSpy,
  triggerKeyringUnlock,
  triggerKeyringLock,
  triggerTokenListStateChange,
  triggerPreferencesStateChange,
  triggerSelectedAccountChange,
  triggerNetworkDidChange,
}: {
  controller: TokenDetectionController;
  messenger: RootMessenger;
  mockGetAccount: (internalAccount: InternalAccount) => void;
  mockGetSelectedAccount: (address: string) => void;
  mockKeyringGetState: (state: KeyringControllerState) => void;
  mockTokensGetState: (state: TokensControllerState) => void;
  mockTokenListGetState: (state: TokenListState) => void;
  mockPreferencesGetState: (state: PreferencesState) => void;
  mockGetNetworkClientById: (
    handler: (
      networkClientId: NetworkClientId,
    ) => AutoManagedNetworkClient<CustomNetworkClientConfiguration>,
  ) => void;
  mockGetNetworkConfigurationByNetworkClientId: (
    handler: (networkClientId: NetworkClientId) => NetworkConfiguration,
  ) => void;
  mockNetworkState: (state: NetworkState) => void;
  mockFindNetworkClientIdByChainId: (
    handler: (chainId: Hex) => NetworkClientId,
  ) => void;
  callActionSpy: jest.SpyInstance;
  triggerKeyringUnlock: () => void;
  triggerKeyringLock: () => void;
  triggerTokenListStateChange: (state: TokenListState) => void;
  triggerPreferencesStateChange: (state: PreferencesState) => void;
  triggerSelectedAccountChange: (account: InternalAccount) => void;
  triggerNetworkDidChange: (state: NetworkState) => void;
  triggerTransactionConfirmed: (transactionMeta: { chainId: Hex }) => void;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<ConstructorParameters<typeof TokenDetectionController>[0]>;
  isKeyringUnlocked?: boolean;
  mocks?: {
    getAccount?: InternalAccount;
    getSelectedAccount?: InternalAccount;
    getBearerToken?: string;
  };
  mockTokenListState?: Partial<TokenListState>;
  mockTokensState?: Partial<TokensControllerState>;
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
    isKeyringUnlocked,
    mocks,
    mockTokenListState,
    mockTokensState,
  } = rest;
  const messenger = buildRootMessenger();

  const mockGetAccount = jest.fn<InternalAccount, []>();
  messenger.registerActionHandler(
    'AccountsController:getAccount',
    mockGetAccount.mockReturnValue(
      mocks?.getAccount ?? createMockInternalAccount({ address: '0x1' }),
    ),
  );

  const mockGetSelectedAccount = jest.fn<InternalAccount, []>();
  messenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    mockGetSelectedAccount.mockReturnValue(
      mocks?.getSelectedAccount ??
        createMockInternalAccount({ address: '0x1' }),
    ),
  );
  const mockKeyringState = jest.fn<KeyringControllerState, []>();
  messenger.registerActionHandler(
    'KeyringController:getState',
    mockKeyringState.mockReturnValue({
      isUnlocked: isKeyringUnlocked ?? true,
    } as KeyringControllerState),
  );
  const mockGetNetworkClientById = jest.fn<
    ReturnType<NetworkController['getNetworkClientById']>,
    Parameters<NetworkController['getNetworkClientById']>
  >();
  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    mockGetNetworkClientById.mockImplementation(() => {
      // Default to Avalanche (0xa86a) which is in SupportedTokenDetectionNetworks
      // but NOT in SUPPORTED_NETWORKS_ACCOUNTS_API_V4
      return {
        configuration: { chainId: '0xa86a' },
        provider: {},
        destroy: {},
        blockTracker: {},
      } as unknown as AutoManagedNetworkClient<CustomNetworkClientConfiguration>;
    }),
  );
  const mockGetNetworkConfigurationByNetworkClientId = jest.fn<
    ReturnType<NetworkController['getNetworkConfigurationByNetworkClientId']>,
    Parameters<NetworkController['getNetworkConfigurationByNetworkClientId']>
  >();
  messenger.registerActionHandler(
    'NetworkController:getNetworkConfigurationByNetworkClientId',
    mockGetNetworkConfigurationByNetworkClientId.mockImplementation(
      (networkClientId: NetworkClientId) => {
        return mockNetworkConfigurations[networkClientId];
      },
    ),
  );
  const mockNetworkState = jest.fn<NetworkState, []>();
  messenger.registerActionHandler(
    'NetworkController:getState',
    mockNetworkState.mockReturnValue({
      ...getDefaultNetworkControllerState(),
      // Default to avalanche so RPC detection works (not in SUPPORTED_NETWORKS_ACCOUNTS_API_V4)
      selectedNetworkClientId: 'avalanche',
    }),
  );
  const mockTokensStateFunc = jest.fn<TokensControllerState, []>();
  messenger.registerActionHandler(
    'TokensController:getState',
    mockTokensStateFunc.mockReturnValue({
      ...getDefaultTokensState(),
      ...mockTokensState,
    }),
  );
  const mockTokenListStateFunc = jest.fn<TokenListState, []>();
  messenger.registerActionHandler(
    'TokenListController:getState',
    mockTokenListStateFunc.mockReturnValue({
      ...getDefaultTokenListState(),
      ...mockTokenListState,
    }),
  );
  const mockPreferencesState = jest.fn<PreferencesState, []>();
  messenger.registerActionHandler(
    'PreferencesController:getState',
    mockPreferencesState.mockReturnValue({
      ...getDefaultPreferencesState(),
      // Enable token detection by default for tests using Avalanche
      useTokenDetection: true,
    }),
  );

  const mockFindNetworkClientIdByChainId = jest.fn<NetworkClientId, [Hex]>();
  messenger.registerActionHandler(
    'NetworkController:findNetworkClientIdByChainId',
    // Default to 'avalanche' which is not in SUPPORTED_NETWORKS_ACCOUNTS_API_V4
    mockFindNetworkClientIdByChainId.mockReturnValue('avalanche'),
  );

  messenger.registerActionHandler(
    'TokensController:addDetectedTokens',
    jest
      .fn<
        ReturnType<TokensController['addDetectedTokens']>,
        Parameters<TokensController['addDetectedTokens']>
      >()
      .mockResolvedValue(undefined),
  );

  messenger.registerActionHandler(
    'TokensController:addTokens',
    jest
      .fn<
        ReturnType<TokensController['addTokens']>,
        Parameters<TokensController['addTokens']>
      >()
      .mockResolvedValue(undefined),
  );

  const tokenDetectionControllerMessenger =
    buildTokenDetectionControllerMessenger(messenger);

  const callActionSpy = jest.spyOn(tokenDetectionControllerMessenger, 'call');

  const controller = new TokenDetectionController({
    getBalancesInSingleCall: jest.fn(),
    trackMetaMetricsEvent: jest.fn(),
    messenger: tokenDetectionControllerMessenger,
    ...options,
  });
  try {
    return await fn({
      controller,
      messenger,
      mockGetAccount: (internalAccount: InternalAccount) => {
        mockGetAccount.mockReturnValue(internalAccount);
      },
      mockGetSelectedAccount: (address: string) => {
        mockGetSelectedAccount.mockReturnValue({ address } as InternalAccount);
      },
      mockKeyringGetState: (state: KeyringControllerState) => {
        mockKeyringState.mockReturnValue(state);
      },
      mockTokensGetState: (state: TokensControllerState) => {
        mockTokensStateFunc.mockReturnValue(state);
      },
      mockPreferencesGetState: (state: PreferencesState) => {
        mockPreferencesState.mockReturnValue(state);
      },
      mockTokenListGetState: (state: TokenListState) => {
        mockTokenListStateFunc.mockReturnValue(state);
      },
      mockGetNetworkClientById: (
        handler: (
          networkClientId: NetworkClientId,
        ) => AutoManagedNetworkClient<CustomNetworkClientConfiguration>,
      ) => {
        mockGetNetworkClientById.mockImplementation(handler);
      },
      mockFindNetworkClientIdByChainId: (
        handler: (chainId: Hex) => NetworkClientId,
      ) => {
        mockFindNetworkClientIdByChainId.mockImplementation(handler);
      },
      mockGetNetworkConfigurationByNetworkClientId: (
        handler: (networkClientId: NetworkClientId) => NetworkConfiguration,
      ) => {
        mockGetNetworkConfigurationByNetworkClientId.mockImplementation(
          handler,
        );
      },
      mockNetworkState: (state: NetworkState) => {
        mockNetworkState.mockReturnValue(state);
      },
      callActionSpy,
      triggerKeyringUnlock: () => {
        messenger.publish('KeyringController:unlock');
      },
      triggerKeyringLock: () => {
        messenger.publish('KeyringController:lock');
      },
      triggerTokenListStateChange: (state: TokenListState) => {
        messenger.publish('TokenListController:stateChange', state, []);
      },
      triggerPreferencesStateChange: (state: PreferencesState) => {
        messenger.publish('PreferencesController:stateChange', state, []);
      },
      triggerSelectedAccountChange: (account: InternalAccount) => {
        messenger.publish(
          'AccountsController:selectedEvmAccountChange',
          account,
        );
      },
      triggerNetworkDidChange: (state: NetworkState) => {
        messenger.publish('NetworkController:networkDidChange', state);
      },
      triggerTransactionConfirmed: (transactionMeta: { chainId: Hex }) => {
        messenger.publish(
          'TransactionController:transactionConfirmed',
          // We only need chainId for this test, so cast to satisfy the type
          transactionMeta as unknown as Parameters<
            typeof messenger.publish<'TransactionController:transactionConfirmed'>
          >[1],
        );
      },
    });
  } finally {
    controller.stop();
    controller.stopAllPolling();
  }
}
