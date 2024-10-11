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
import { getDefaultNetworkControllerState } from '@metamask/network-controller';
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
} from './TokenDetectionController';
import {
  getDefaultTokenListState,
  type TokenListState,
  type TokenListToken,
} from './TokenListController';
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

describe('TokenDetectionController', () => {
  const defaultSelectedAccount = createMockInternalAccount();

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
          },
          mocks: {
            getSelectedAccount: defaultSelectedAccount,
          },
        },
        async ({ controller, mockNetworkState }) => {
          mockNetworkState({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: NetworkType.goerli,
          });
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
        async ({ controller, mockTokenListGetState, callActionSpy }) => {
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
          },
          mocks: {
            getSelectedAccount: defaultSelectedAccount,
          },
        },
        async ({ controller, mockTokenListGetState, callActionSpy }) => {
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
            },
            mocks: {
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
          }) => {
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
              tokenList: {
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
              tokenList: {
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
              tokenList: {
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
              tokenList: {
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
              tokenList: {
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
              tokenList: {
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
      it('should detect new tokens after switching network client id', async () => {
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

            triggerNetworkDidChange({
              ...getDefaultNetworkControllerState(),
              selectedNetworkClientId: 'polygon',
            });
            await advanceTime({ clock, duration: 1 });

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
              tokenList: {
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
                tokenList: {
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
              tokenList: {
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
              tokenList,
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
              tokenList: {},
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
                tokenList: {
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
              tokenList: {
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
            tokenList: {
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
          });
          const spy = jest
            .spyOn(controller, 'detectTokens')
            .mockImplementation(() => {
              return Promise.resolve();
            });

          controller.startPolling({
            networkClientId: 'mainnet',
            address: '0x1',
          });
          controller.startPolling({
            networkClientId: 'sepolia',
            address: '0xdeadbeef',
          });
          controller.startPolling({
            networkClientId: 'goerli',
            address: '0x3',
          });
          await advanceTime({ clock, duration: 0 });

          expect(spy.mock.calls).toMatchObject([
            [{ networkClientId: 'mainnet', selectedAddress: '0x1' }],
            [{ networkClientId: 'sepolia', selectedAddress: '0xdeadbeef' }],
            [{ networkClientId: 'goerli', selectedAddress: '0x3' }],
          ]);

          await advanceTime({ clock, duration: DEFAULT_INTERVAL });
          expect(spy.mock.calls).toMatchObject([
            [{ networkClientId: 'mainnet', selectedAddress: '0x1' }],
            [{ networkClientId: 'sepolia', selectedAddress: '0xdeadbeef' }],
            [{ networkClientId: 'goerli', selectedAddress: '0x3' }],
            [{ networkClientId: 'mainnet', selectedAddress: '0x1' }],
            [{ networkClientId: 'sepolia', selectedAddress: '0xdeadbeef' }],
            [{ networkClientId: 'goerli', selectedAddress: '0x3' }],
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
            selectedNetworkClientId: NetworkType.goerli,
          });
          triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useTokenDetection: false,
          });
          await controller.detectTokens({
            networkClientId: NetworkType.goerli,
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
          triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useTokenDetection: false,
          });
          await controller.detectTokens({
            networkClientId: NetworkType.mainnet,
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
          },
          mocks: {
            getSelectedAccount: selectedAccount,
            getAccount: selectedAccount,
          },
        },
        async ({ controller, mockTokenListGetState, callActionSpy }) => {
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
            networkClientId: NetworkType.mainnet,
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
            networkClientId: NetworkType.mainnet,
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
          },
        },
        async ({
          controller,
          mockGetAccount,
          mockTokenListGetState,
          callActionSpy,
        }) => {
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
            networkClientId: NetworkType.mainnet,
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
