import type { AddApprovalRequest } from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import {
  ChainId,
  NetworkType,
  convertHexToDecimal,
  InfuraNetworkType,
} from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-api';
import type { KeyringControllerState } from '@metamask/keyring-controller';
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
import {
  getDefaultPreferencesState,
  type PreferencesState,
} from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';
import BN from 'bn.js';
import nock from 'nock';
import * as sinon from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import { createMockInternalAccount } from '../../accounts-controller/src/tests/mocks';
import {
  buildCustomRpcEndpoint,
  buildInfuraNetworkConfiguration,
} from '../../network-controller/tests/helpers';
import { formatAggregatorNames } from './assetsUtil';
import * as MutliChainAccountsServiceModule from './multi-chain-accounts-service';
import {
  MOCK_GET_BALANCES_RESPONSE,
  createMockGetBalancesResponse,
} from './multi-chain-accounts-service/mocks/mock-get-balances';
import { MOCK_GET_SUPPORTED_NETWORKS_RESPONSE } from './multi-chain-accounts-service/mocks/mock-get-supported-networks';
import { TOKEN_END_POINT_API } from './token-service';
import type {
  AllowedActions,
  AllowedEvents,
  TokenDetectionControllerMessenger,
} from './TokenDetectionController';
import {
  STATIC_MAINNET_TOKEN_LIST,
  TokenDetectionController,
  controllerName,
  mapChainIdWithTokenListMap,
} from './TokenDetectionController';
import {
  getDefaultTokenListState,
  type TokenListMap,
  type TokenListState,
  type TokenListToken,
} from './TokenListController';
import type { Token } from './TokenRatesController';
import type {
  TokensController,
  TokensControllerState,
} from './TokensController';
import { getDefaultTokensState } from './TokensController';

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
  [InfuraNetworkType.goerli]: buildInfuraNetworkConfiguration(
    InfuraNetworkType.goerli,
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
      }),
    ],
  },
};

type MainControllerMessenger = ControllerMessenger<
  AllowedActions | AddApprovalRequest,
  AllowedEvents
>;

/**
 * Builds a messenger that `TokenDetectionController` can use to communicate with other controllers.
 * @param controllerMessenger - The main controller messenger.
 * @returns The restricted messenger.
 */
function buildTokenDetectionControllerMessenger(
  controllerMessenger: MainControllerMessenger = new ControllerMessenger(),
): TokenDetectionControllerMessenger {
  return controllerMessenger.getRestricted({
    name: controllerName,
    allowedActions: [
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
    ],
    allowedEvents: [
      'AccountsController:selectedEvmAccountChange',
      'KeyringController:lock',
      'KeyringController:unlock',
      'NetworkController:networkDidChange',
      'TokenListController:stateChange',
      'PreferencesController:stateChange',
    ],
  });
}

const mockMultiChainAccountsService = () => {
  const mockFetchSupportedNetworks = jest
    .spyOn(MutliChainAccountsServiceModule, 'fetchSupportedNetworks')
    .mockResolvedValue(MOCK_GET_SUPPORTED_NETWORKS_RESPONSE.fullSupport);
  const mockFetchMultiChainBalances = jest
    .spyOn(MutliChainAccountsServiceModule, 'fetchMultiChainBalances')
    .mockResolvedValue(MOCK_GET_BALANCES_RESPONSE);

  return {
    mockFetchSupportedNetworks,
    mockFetchMultiChainBalances,
  };
};

describe('TokenDetectionController', () => {
  const defaultSelectedAccount = createMockInternalAccount();

  mockMultiChainAccountsService();

  beforeEach(async () => {
    nock(TOKEN_END_POINT_API)
      .get(getTokensPath(ChainId.mainnet))
      .reply(200, sampleTokenList)
      .get(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `/token/${convertHexToDecimal(ChainId.mainnet)}?address=${
          tokenAFromList.address
        }`,
      )
      .reply(200, tokenAFromList)
      .get(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `/token/${convertHexToDecimal(ChainId.mainnet)}?address=${
          tokenBFromList.address
        }`,
      )
      .reply(200, tokenBFromList)
      .persist();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('start', () => {
    let clock: sinon.SinonFakeTimers;
    beforeEach(() => {
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      clock.restore();
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
          const mockTokens = sinon.stub(controller, 'detectTokens');
          controller.setIntervalLength(10);

          await controller.start();

          expect(mockTokens.calledOnce).toBe(false);
          await advanceTime({ clock, duration: 15 });
          expect(mockTokens.calledTwice).toBe(false);
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
          const mockTokens = sinon.stub(controller, 'detectTokens');

          await controller.start();
          triggerKeyringUnlock();

          expect(mockTokens.calledOnce).toBe(true);
          await advanceTime({ clock, duration: DEFAULT_INTERVAL * 1.5 });
          expect(mockTokens.calledTwice).toBe(false);
        },
      );
    });

    it('should stop polling and detect tokens on interval if unlocked keyring is locked', async () => {
      await withController(
        {
          isKeyringUnlocked: true,
        },
        async ({ controller, triggerKeyringLock }) => {
          const mockTokens = sinon.stub(controller, 'detectTokens');
          controller.setIntervalLength(10);

          await controller.start();
          triggerKeyringLock();

          expect(mockTokens.calledOnce).toBe(true);
          await advanceTime({ clock, duration: 15 });
          expect(mockTokens.calledTwice).toBe(false);
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
          const mockTokens = sinon.stub(controller, 'detectTokens');
          controller.setIntervalLength(10);

          await controller.start();

          expect(mockTokens.calledOnce).toBe(true);
          await advanceTime({ clock, duration: 15 });
          expect(mockTokens.calledTwice).toBe(true);
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
            useAccountsAPI: true, // USING ACCOUNTS API
          },
          mocks: {
            getSelectedAccount: defaultSelectedAccount,
          },
        },
        async ({ controller, mockNetworkState, mockGetNetworkClientById }) => {
          mockNetworkState({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: NetworkType.goerli,
          });
          mockGetNetworkClientById(
            () =>
              ({
                configuration: { chainId: '0x5' },
              } as unknown as AutoManagedNetworkClient<CustomNetworkClientConfiguration>),
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
            useAccountsAPI: true, // USING ACCOUNTS API
          },
          mocks: {
            getAccount: selectedAccount,
            getSelectedAccount: selectedAccount,
          },
        },

        async ({ controller, mockTokenListGetState, callActionSpy }) => {
          mockMultiChainAccountsService();
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0x1': {
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
            'TokensController:addDetectedTokens',
            [sampleTokenA],
            {
              chainId: ChainId.mainnet,
              selectedAddress: selectedAccount.address,
            },
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
            useAccountsAPI: true, // USING ACCOUNTS API
          },
          mocks: {
            getAccount: selectedAccount,
            getSelectedAccount: selectedAccount,
          },
        },

        async ({ controller, mockTokenListGetState, callActionSpy }) => {
          mockMultiChainAccountsService();

          const mockAPI = mockMultiChainAccountsService();
          mockAPI.mockFetchMultiChainBalances.mockResolvedValue({
            count: 0,
            balances: [
              {
                object: 'token',
                address: '0xaddress',
                name: 'Mock Token',
                symbol: 'MOCK',
                decimals: 18,
                balance: '10.18',
                chainId: 2,
              },
            ],
            unprocessedNetworks: [],
          });

          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0x1': {
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
              chainId: ChainId.mainnet,
              selectedAddress: selectedAccount.address,
            },
          );
        },
      );
    });

    it('should detect tokens correctly on the Polygon network', async () => {
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
            useAccountsAPI: true, // USING ACCOUNTS API
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
          callActionSpy,
        }) => {
          mockMultiChainAccountsService();
          mockNetworkState({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: 'polygon',
          });
          mockGetNetworkClientById(
            () =>
              ({
                configuration: { chainId: '0x89' },
              } as unknown as AutoManagedNetworkClient<CustomNetworkClientConfiguration>),
          );

          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0x89': {
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
            'TokensController:addDetectedTokens',
            [sampleTokenA],
            {
              chainId: '0x89',
              selectedAddress: selectedAccount.address,
            },
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
        async ({ controller, mockTokenListGetState, callActionSpy }) => {
          mockMultiChainAccountsService();
          const tokenListState = {
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0x1': {
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

          tokenListState.tokensChainsCache['0x1'].data[sampleTokenB.address] = {
            name: sampleTokenB.name,
            symbol: sampleTokenB.symbol,
            decimals: sampleTokenB.decimals,
            address: sampleTokenB.address,
            occurrences: 1,
            aggregators: sampleTokenB.aggregators,
            iconUrl: sampleTokenB.image,
          };
          mockTokenListGetState(tokenListState);
          await advanceTime({ clock, duration: interval });

          expect(callActionSpy).toHaveBeenCalledWith(
            'TokensController:addDetectedTokens',
            [sampleTokenA, sampleTokenB],
            {
              chainId: ChainId.mainnet,
              selectedAddress: selectedAccount.address,
            },
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
            useAccountsAPI: true, // USING ACCOUNTS API
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
          mockMultiChainAccountsService();
          mockTokensGetState({
            ...getDefaultTokensState(),
            ignoredTokens: [sampleTokenA.address],
          });
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0x1': {
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
            useAccountsAPI: true, // USING ACCOUNTS API
          },
          mocks: {
            getSelectedAccount: defaultSelectedAccount,
          },
        },
        async ({ controller, mockTokenListGetState, callActionSpy }) => {
          mockMultiChainAccountsService();
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0x1': {
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
    let clock: sinon.SinonFakeTimers;
    beforeEach(() => {
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      clock.restore();
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
              useAccountsAPI: true, // USING ACCOUNTS API
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
          }) => {
            mockMultiChainAccountsService();
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                '0x1': {
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
            await advanceTime({ clock, duration: 1 });

            expect(callActionSpy).toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
              [sampleTokenA],
              {
                chainId: ChainId.mainnet,
                selectedAddress: secondSelectedAccount.address,
              },
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
              useAccountsAPI: true, // USING ACCOUNTS API
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
            mockMultiChainAccountsService();
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                '0x1': {
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
            await advanceTime({ clock, duration: 1 });

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
                  '0x1': {
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
              await advanceTime({ clock, duration: 1 });

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
              useAccountsAPI: true, // USING ACCOUNTS API
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
                '0x1': {
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
            await advanceTime({ clock, duration: 1 });

            expect(callActionSpy).not.toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
            );
          },
        );
      });
    });
  });

  describe('PreferencesController:stateChange', () => {
    let clock: sinon.SinonFakeTimers;
    beforeEach(() => {
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      clock.restore();
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
              useAccountsAPI: true, // USING ACCOUNTS API
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
            mockMultiChainAccountsService();
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                '0x1': {
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
                '0x1': {
                  name: 'ethereum',
                  nativeCurrency: 'ETH',
                  rpcEndpoints: [
                    {
                      networkClientId: 'mainnet',
                      type: RpcEndpointType.Infura,
                      url: 'https://mainnet.infura.io/v3/{infuraProjectId}',
                    },
                  ],
                  blockExplorerUrls: [],
                  chainId: '0x1',
                  defaultRpcEndpointIndex: 0,
                },
              },
              networksMetadata: {},
              selectedNetworkClientId: 'mainnet',
            });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              useTokenDetection: true,
            });
            mockGetAccount(secondSelectedAccount);
            triggerSelectedAccountChange(secondSelectedAccount);
            await advanceTime({ clock, duration: 1 });

            expect(callActionSpy).toHaveBeenLastCalledWith(
              'TokensController:addDetectedTokens',
              [sampleTokenA],
              {
                chainId: ChainId.mainnet,
                selectedAddress: secondSelectedAccount.address,
              },
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
              useAccountsAPI: true, // USING ACCOUNTS API
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
            mockMultiChainAccountsService();
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                '0x1': {
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
              ...getDefaultNetworkControllerState(),
              selectedNetworkClientId: NetworkType.mainnet,
            });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              useTokenDetection: true,
            });
            mockGetAccount(secondSelectedAccount);
            triggerSelectedAccountChange(secondSelectedAccount);

            await advanceTime({ clock, duration: 1 });

            expect(mockTokens).toHaveBeenNthCalledWith(1, {
              chainIds: [
                '0x1',
                '0x5',
                '0xaa36a7',
                '0xe704',
                '0xe705',
                '0xe708',
              ],
              selectedAddress: secondSelectedAccount.address,
            });
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
              useAccountsAPI: true, // USING ACCOUNTS API
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
          }) => {
            mockMultiChainAccountsService();
            mockGetAccount(selectedAccount);
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                '0x1': {
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
            await advanceTime({ clock, duration: 1 });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              useTokenDetection: true,
            });
            await advanceTime({ clock, duration: 1 });

            expect(callActionSpy).toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
              [sampleTokenA],
              {
                chainId: ChainId.mainnet,
                selectedAddress: selectedAccount.address,
              },
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
              useAccountsAPI: true, // USING ACCOUNTS API
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
            mockMultiChainAccountsService();
            mockGetAccount(firstSelectedAccount);
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                '0x1': {
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
            await advanceTime({ clock, duration: 1 });

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
                [ChainId.mainnet]: {
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
            await advanceTime({ clock, duration: 1 });

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
                [ChainId.mainnet]: {
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
            await advanceTime({ clock, duration: 1 });

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
                [ChainId.mainnet]: {
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
            await advanceTime({ clock, duration: 1 });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              useTokenDetection: true,
            });
            await advanceTime({ clock, duration: 1 });

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
                [ChainId.mainnet]: {
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
            await advanceTime({ clock, duration: 1 });

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
                [ChainId.mainnet]: {
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
            await advanceTime({ clock, duration: 1 });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              useTokenDetection: true,
            });
            await advanceTime({ clock, duration: 1 });

            expect(callActionSpy).not.toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
            );
          },
        );
      });
    });
  });

  describe('NetworkController:networkDidChange', () => {
    let clock: sinon.SinonFakeTimers;
    beforeEach(() => {
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      clock.restore();
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
                '0x5': {
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
              selectedNetworkClientId: 'goerli',
            });
            await advanceTime({ clock, duration: 1 });

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
                [ChainId.mainnet]: {
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
              selectedNetworkClientId: 'mainnet',
            });
            await advanceTime({ clock, duration: 1 });

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
                  [ChainId.mainnet]: {
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
                selectedNetworkClientId: 'polygon',
              });
              await advanceTime({ clock, duration: 1 });

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
                [ChainId.mainnet]: {
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
              selectedNetworkClientId: 'polygon',
            });
            await advanceTime({ clock, duration: 1 });

            expect(callActionSpy).not.toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
            );
          },
        );
      });
    });
  });

  describe('TokenListController:stateChange', () => {
    let clock: sinon.SinonFakeTimers;
    beforeEach(() => {
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      clock.restore();
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
              useAccountsAPI: true, // USING ACCOUNTS API
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
            mockMultiChainAccountsService();
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
                '0x1': {
                  timestamp: 0,
                  data: tokenList,
                },
              },
            };
            mockTokenListGetState(tokenListState);

            triggerTokenListStateChange(tokenListState);
            await advanceTime({ clock, duration: 1 });

            expect(callActionSpy).toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
              [sampleTokenA],
              {
                chainId: ChainId.mainnet,
                selectedAddress: selectedAccount.address,
              },
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
            await advanceTime({ clock, duration: 1 });

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
                  [ChainId.mainnet]: {
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
              await advanceTime({ clock, duration: 1 });

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
                [ChainId.mainnet]: {
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
            await advanceTime({ clock, duration: 1 });

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
              useAccountsAPI: true, // USING ACCOUNTS API
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
            mockMultiChainAccountsService();
            const tokenListState = {
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                [ChainId.mainnet]: {
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
            await advanceTime({ clock, duration: 1 });

            const mockTokens = jest.spyOn(controller, 'detectTokens');

            // Re-trigger state change so that incoming list is equal the current list in state
            triggerTokenListStateChange(tokenListState);
            await advanceTime({ clock, duration: 1 });
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
              useAccountsAPI: true, // USING ACCOUNTS API
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
            mockMultiChainAccountsService();
            const tokenListState = {
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                [ChainId.mainnet]: {
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
            await advanceTime({ clock, duration: 1 });

            const mockTokens = jest.spyOn(controller, 'detectTokens');

            // Re-trigger state change so that incoming list is equal the current list in state
            triggerTokenListStateChange({
              ...tokenListState,
              tokensChainsCache: {
                [ChainId.mainnet]: {
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
            await advanceTime({ clock, duration: 1 });
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
              useAccountsAPI: true, // USING ACCOUNTS API
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
            mockMultiChainAccountsService();
            const tokenListState = {
              ...getDefaultTokenListState(),
              tokensChainsCache: {
                [ChainId.mainnet]: {
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
            await advanceTime({ clock, duration: 1 });

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
            await advanceTime({ clock, duration: 1 });
            expect(mockTokens).toHaveBeenCalledTimes(1);
          },
        );
      });
    });
  });

  describe('startPolling', () => {
    let clock: sinon.SinonFakeTimers;
    beforeEach(() => {
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      clock.restore();
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
              [ChainId.mainnet]: {
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
            chainIds: ['0x1'],
            address: '0x1',
          });
          controller.startPolling({
            chainIds: ['0xaa36a7'],
            address: '0xdeadbeef',
          });
          controller.startPolling({
            chainIds: ['0x5'],
            address: '0x3',
          });
          await advanceTime({ clock, duration: 0 });

          expect(spy.mock.calls).toMatchObject([
            [{ chainIds: ['0x1'], selectedAddress: '0x1' }],
            [{ chainIds: ['0xaa36a7'], selectedAddress: '0xdeadbeef' }],
            [{ chainIds: ['0x5'], selectedAddress: '0x3' }],
          ]);

          await advanceTime({ clock, duration: DEFAULT_INTERVAL });
          expect(spy.mock.calls).toMatchObject([
            [{ chainIds: ['0x1'], selectedAddress: '0x1' }],
            [{ chainIds: ['0xaa36a7'], selectedAddress: '0xdeadbeef' }],
            [{ chainIds: ['0x5'], selectedAddress: '0x3' }],
            [{ chainIds: ['0x1'], selectedAddress: '0x1' }],
            [{ chainIds: ['0xaa36a7'], selectedAddress: '0xdeadbeef' }],
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
            useAccountsAPI: true, // USING ACCOUNTS API
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
          mockMultiChainAccountsService();
          mockNetworkState({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: NetworkType.goerli,
          });
          triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useTokenDetection: false,
          });
          await controller.detectTokens({
            chainIds: ['0x5'],
            selectedAddress: selectedAccount.address,
          });
          expect(callActionSpy).not.toHaveBeenCalledWith(
            'TokensController:addDetectedTokens',
          );
        },
      );
    });

    it('should detect and add tokens from the `@metamask/contract-metadata` legacy token list if token detection is disabled and current network is mainnet', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue(
        Object.keys(STATIC_MAINNET_TOKEN_LIST).reduce<Record<string, BN>>(
          (acc, address) => {
            acc[address] = new BN(1);
            return acc;
          },
          {},
        ),
      );
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
          triggerPreferencesStateChange,
          callActionSpy,
        }) => {
          mockMultiChainAccountsService();
          triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useTokenDetection: false,
          });
          await controller.detectTokens({
            chainIds: ['0x1'],
            selectedAddress: selectedAccount.address,
          });
          expect(callActionSpy).toHaveBeenLastCalledWith(
            'TokensController:addDetectedTokens',
            Object.values(STATIC_MAINNET_TOKEN_LIST).map((token) => {
              const { iconUrl, ...tokenMetadata } = token;
              return {
                ...tokenMetadata,
                image: token.iconUrl,
                isERC721: false,
              };
            }),
            {
              selectedAddress: selectedAccount.address,
              chainId: ChainId.mainnet,
            },
          );
        },
      );
    });

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
            useAccountsAPI: true, // USING ACCOUNTS API
          },
          mocks: {
            getSelectedAccount: selectedAccount,
            getAccount: selectedAccount,
          },
        },
        async ({ controller, mockTokenListGetState, callActionSpy }) => {
          mockMultiChainAccountsService();
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0x1': {
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
            chainIds: ['0x1'],
            selectedAddress: selectedAccount.address,
          });

          expect(callActionSpy).toHaveBeenCalledWith(
            'TokensController:addDetectedTokens',
            [sampleTokenA],
            {
              chainId: ChainId.mainnet,
              selectedAddress: selectedAccount.address,
            },
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
            useAccountsAPI: true, // USING ACCOUNTS API
          },
          mocks: {
            getSelectedAccount: selectedAccount,
            getAccount: selectedAccount,
          },
        },
        async ({ controller, mockTokenListGetState }) => {
          mockMultiChainAccountsService();
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0x1': {
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
            chainIds: ['0x1'],
            selectedAddress: selectedAccount.address,
          });

          expect(mockTrackMetaMetricsEvent).toHaveBeenCalledWith({
            event: 'Token Detected',
            category: 'Wallet',
            properties: {
              tokens: [`${sampleTokenA.symbol} - ${sampleTokenA.address}`],
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
              token_standard: 'ERC20',
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/naming-convention
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
            useAccountsAPI: true, // USING ACCOUNTS API
          },
        },
        async ({
          controller,
          mockGetAccount,
          mockTokenListGetState,
          callActionSpy,
        }) => {
          mockMultiChainAccountsService();
          // @ts-expect-error forcing an undefined value
          mockGetAccount(undefined);
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0x1': {
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
            chainIds: ['0x1'],
          });

          expect(callActionSpy).toHaveBeenLastCalledWith(
            'TokensController:addDetectedTokens',
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
            { chainId: '0x1', selectedAddress: '' },
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
            useAccountsAPI: true, // USING ACCOUNTS API
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
          const mockAPI = mockMultiChainAccountsService();
          mockAPI.mockFetchMultiChainBalances.mockRejectedValue(
            new Error('Mock Error'),
          );
          mockNetworkState({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: 'polygon',
          });
          triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useTokenDetection: false,
          });
          await controller.detectTokens({
            chainIds: ['0x5'],
            selectedAddress: selectedAccount.address,
          });
          expect(callActionSpy).not.toHaveBeenCalledWith(
            'TokensController:addDetectedTokens',
          );
        },
      );
    });

    /**
     * Test Utility - Arrange and Act `detectTokens()` with the Accounts API feature
     * RPC flow will return `sampleTokenA` and the Accounts API flow will use `sampleTokenB`
     * @param props - options to modify these tests
     * @param props.overrideMockTokensCache - change the tokens cache
     * @param props.mockMultiChainAPI - change the Accounts API responses
     * @param props.overrideMockTokenGetState - change the external TokensController state
     * @returns properties that can be used for assertions
     */
    const arrangeActTestDetectTokensWithAccountsAPI = async (props?: {
      /** Overwrite the tokens cache inside Tokens Controller */
      overrideMockTokensCache?: (typeof sampleTokenA)[];
      mockMultiChainAPI?: ReturnType<typeof mockMultiChainAccountsService>;
      overrideMockTokenGetState?: Partial<TokensControllerState>;
    }) => {
      const {
        overrideMockTokensCache = [sampleTokenA, sampleTokenB],
        mockMultiChainAPI,
        overrideMockTokenGetState,
      } = props ?? {};

      // Arrange - RPC Tokens Flow - Uses sampleTokenA
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });

      // Arrange - API Tokens Flow - Uses sampleTokenB
      const { mockFetchSupportedNetworks, mockFetchMultiChainBalances } =
        mockMultiChainAPI ?? mockMultiChainAccountsService();

      if (!mockMultiChainAPI) {
        mockFetchSupportedNetworks.mockResolvedValue([1]);
        mockFetchMultiChainBalances.mockResolvedValue(
          createMockGetBalancesResponse([sampleTokenB.address], 1),
        );
      }

      // Arrange - Selected Account
      const selectedAccount = createMockInternalAccount({
        address: '0x0000000000000000000000000000000000000001',
      });

      // Arrange / Act - withController setup + invoke detectTokens
      const { callAction } = await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            useAccountsAPI: true, // USING ACCOUNTS API
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
          mockTokensGetState,
        }) => {
          const tokenCacheData: TokenListMap = {};
          overrideMockTokensCache.forEach(
            (t) =>
              (tokenCacheData[t.address] = {
                name: t.name,
                symbol: t.symbol,
                decimals: t.decimals,
                address: t.address,
                occurrences: 1,
                aggregators: t.aggregators,
                iconUrl: t.image,
              }),
          );

          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokensChainsCache: {
              '0x1': {
                timestamp: 0,
                data: tokenCacheData,
              },
            },
          });

          if (overrideMockTokenGetState) {
            mockTokensGetState({
              ...getDefaultTokensState(),
              ...overrideMockTokenGetState,
            });
          }

          // Act
          await controller.detectTokens({
            chainIds: ['0x1'],
            selectedAddress: selectedAccount.address,
          });

          return {
            callAction: callActionSpy,
          };
        },
      );

      const assertAddedTokens = (token: Token) =>
        expect(callAction).toHaveBeenCalledWith(
          'TokensController:addDetectedTokens',
          [token],
          {
            chainId: ChainId.mainnet,
            selectedAddress: selectedAccount.address,
          },
        );

      const assertTokensNeverAdded = () =>
        expect(callAction).not.toHaveBeenCalledWith(
          'TokensController:addDetectedTokens',
        );

      return {
        assertAddedTokens,
        assertTokensNeverAdded,
        mockFetchMultiChainBalances,
        mockGetBalancesInSingleCall,
        rpcToken: sampleTokenA,
        apiToken: sampleTokenB,
      };
    };

    it('should trigger and use Accounts API for detection', async () => {
      const {
        assertAddedTokens,
        mockFetchMultiChainBalances,
        apiToken,
        mockGetBalancesInSingleCall,
      } = await arrangeActTestDetectTokensWithAccountsAPI();

      expect(mockFetchMultiChainBalances).toHaveBeenCalled();
      expect(mockGetBalancesInSingleCall).not.toHaveBeenCalled();
      assertAddedTokens(apiToken);
    });

    it('uses the Accounts API but does not add unknown tokens', async () => {
      // API returns sampleTokenB
      // As this is not a known token (in cache), then is not added
      const {
        assertTokensNeverAdded,
        mockFetchMultiChainBalances,
        mockGetBalancesInSingleCall,
      } = await arrangeActTestDetectTokensWithAccountsAPI({
        overrideMockTokensCache: [sampleTokenA],
      });

      expect(mockFetchMultiChainBalances).toHaveBeenCalled();
      expect(mockGetBalancesInSingleCall).not.toHaveBeenCalled();
      assertTokensNeverAdded();
    });

    it('fallbacks from using the Accounts API if fails', async () => {
      // Test 1 - fetch supported networks fails
      let mockAPI = mockMultiChainAccountsService();
      mockAPI.mockFetchSupportedNetworks.mockRejectedValue(
        new Error('Mock Error'),
      );
      let actResult = await arrangeActTestDetectTokensWithAccountsAPI({
        mockMultiChainAPI: mockAPI,
      });

      expect(actResult.mockFetchMultiChainBalances).not.toHaveBeenCalled(); // never called as could not fetch supported networks...
      expect(actResult.mockGetBalancesInSingleCall).toHaveBeenCalled(); // ...so then RPC flow was initiated
      actResult.assertAddedTokens(actResult.rpcToken);

      // Test 2 - fetch multi chain fails
      mockAPI = mockMultiChainAccountsService();
      mockAPI.mockFetchMultiChainBalances.mockRejectedValue(
        new Error('Mock Error'),
      );
      actResult = await arrangeActTestDetectTokensWithAccountsAPI({
        mockMultiChainAPI: mockAPI,
      });

      expect(actResult.mockFetchMultiChainBalances).toHaveBeenCalled(); // API was called, but failed...
      expect(actResult.mockGetBalancesInSingleCall).toHaveBeenCalled(); // ...so then RPC flow was initiated
      actResult.assertAddedTokens(actResult.rpcToken);
    });

    it('uses the Accounts API but does not add tokens that are already added', async () => {
      // Here we populate the token state with a token that exists in the tokenAPI.
      // So the token retrieved from the API should not be added
      const { assertTokensNeverAdded, mockFetchMultiChainBalances } =
        await arrangeActTestDetectTokensWithAccountsAPI({
          overrideMockTokenGetState: {
            allDetectedTokens: {
              '0x1': {
                '0x0000000000000000000000000000000000000001': [
                  {
                    address: sampleTokenB.address,
                    name: sampleTokenB.name,
                    symbol: sampleTokenB.symbol,
                    decimals: sampleTokenB.decimals,
                    aggregators: sampleTokenB.aggregators,
                  },
                ],
              },
            },
          },
        });

      expect(mockFetchMultiChainBalances).toHaveBeenCalled();
      assertTokensNeverAdded();
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
});

/**
 * Construct the path used to fetch tokens that we can pass to `nock`.
 *
 * @param chainId - The chain ID.
 * @returns The constructed path.
 */
function getTokensPath(chainId: Hex) {
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  return `/tokens/${convertHexToDecimal(
    chainId,
  )}?occurrenceFloor=3&includeNativeAssets=false&includeTokenFees=false&includeAssetType=false`;
}

type WithControllerCallback<ReturnValue> = ({
  controller,
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
  callActionSpy: jest.SpyInstance;
  triggerKeyringUnlock: () => void;
  triggerKeyringLock: () => void;
  triggerTokenListStateChange: (state: TokenListState) => void;
  triggerPreferencesStateChange: (state: PreferencesState) => void;
  triggerSelectedAccountChange: (account: InternalAccount) => void;
  triggerNetworkDidChange: (state: NetworkState) => void;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<ConstructorParameters<typeof TokenDetectionController>[0]>;
  isKeyringUnlocked?: boolean;
  messenger?: ControllerMessenger<AllowedActions, AllowedEvents>;
  mocks?: {
    getAccount?: InternalAccount;
    getSelectedAccount?: InternalAccount;
  };
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
  const { options, isKeyringUnlocked, messenger, mocks } = rest;
  const controllerMessenger =
    messenger ?? new ControllerMessenger<AllowedActions, AllowedEvents>();

  const mockGetAccount = jest.fn<InternalAccount, []>();
  controllerMessenger.registerActionHandler(
    'AccountsController:getAccount',
    mockGetAccount.mockReturnValue(
      mocks?.getAccount ?? createMockInternalAccount({ address: '0x1' }),
    ),
  );

  const mockGetSelectedAccount = jest.fn<InternalAccount, []>();
  controllerMessenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    mockGetSelectedAccount.mockReturnValue(
      mocks?.getSelectedAccount ??
        createMockInternalAccount({ address: '0x1' }),
    ),
  );
  const mockKeyringState = jest.fn<KeyringControllerState, []>();
  controllerMessenger.registerActionHandler(
    'KeyringController:getState',
    mockKeyringState.mockReturnValue({
      isUnlocked: isKeyringUnlocked ?? true,
    } as KeyringControllerState),
  );
  const mockGetNetworkClientById = jest.fn<
    ReturnType<NetworkController['getNetworkClientById']>,
    Parameters<NetworkController['getNetworkClientById']>
  >();
  controllerMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    mockGetNetworkClientById.mockImplementation(() => {
      return {
        configuration: { chainId: '0x1' },
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
  controllerMessenger.registerActionHandler(
    'NetworkController:getNetworkConfigurationByNetworkClientId',
    mockGetNetworkConfigurationByNetworkClientId.mockImplementation(
      (networkClientId: NetworkClientId) => {
        return mockNetworkConfigurations[networkClientId];
      },
    ),
  );
  const mockNetworkState = jest.fn<NetworkState, []>();
  controllerMessenger.registerActionHandler(
    'NetworkController:getState',
    mockNetworkState.mockReturnValue({ ...getDefaultNetworkControllerState() }),
  );
  const mockTokensState = jest.fn<TokensControllerState, []>();
  controllerMessenger.registerActionHandler(
    'TokensController:getState',
    mockTokensState.mockReturnValue({ ...getDefaultTokensState() }),
  );
  const mockTokenListState = jest.fn<TokenListState, []>();
  controllerMessenger.registerActionHandler(
    'TokenListController:getState',
    mockTokenListState.mockReturnValue({ ...getDefaultTokenListState() }),
  );
  const mockPreferencesState = jest.fn<PreferencesState, []>();
  controllerMessenger.registerActionHandler(
    'PreferencesController:getState',
    mockPreferencesState.mockReturnValue({
      ...getDefaultPreferencesState(),
    }),
  );
  controllerMessenger.registerActionHandler(
    'TokensController:addDetectedTokens',
    jest
      .fn<
        ReturnType<TokensController['addDetectedTokens']>,
        Parameters<TokensController['addDetectedTokens']>
      >()
      .mockResolvedValue(undefined),
  );
  const callActionSpy = jest.spyOn(controllerMessenger, 'call');

  const controller = new TokenDetectionController({
    getBalancesInSingleCall: jest.fn(),
    trackMetaMetricsEvent: jest.fn(),
    messenger: buildTokenDetectionControllerMessenger(controllerMessenger),
    useAccountsAPI: false,
    platform: 'extension',
    ...options,
  });
  try {
    return await fn({
      controller,
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
        mockTokensState.mockReturnValue(state);
      },
      mockPreferencesGetState: (state: PreferencesState) => {
        mockPreferencesState.mockReturnValue(state);
      },
      mockTokenListGetState: (state: TokenListState) => {
        mockTokenListState.mockReturnValue(state);
      },
      mockGetNetworkClientById: (
        handler: (
          networkClientId: NetworkClientId,
        ) => AutoManagedNetworkClient<CustomNetworkClientConfiguration>,
      ) => {
        mockGetNetworkClientById.mockImplementation(handler);
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
        controllerMessenger.publish('KeyringController:unlock');
      },
      triggerKeyringLock: () => {
        controllerMessenger.publish('KeyringController:lock');
      },
      triggerTokenListStateChange: (state: TokenListState) => {
        controllerMessenger.publish(
          'TokenListController:stateChange',
          state,
          [],
        );
      },
      triggerPreferencesStateChange: (state: PreferencesState) => {
        controllerMessenger.publish(
          'PreferencesController:stateChange',
          state,
          [],
        );
      },
      triggerSelectedAccountChange: (account: InternalAccount) => {
        controllerMessenger.publish(
          'AccountsController:selectedEvmAccountChange',
          account,
        );
      },
      triggerNetworkDidChange: (state: NetworkState) => {
        controllerMessenger.publish(
          'NetworkController:networkDidChange',
          state,
        );
      },
    });
  } finally {
    controller.stop();
    controller.stopAllPolling();
  }
}
