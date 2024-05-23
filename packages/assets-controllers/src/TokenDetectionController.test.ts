import type { AddApprovalRequest } from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import {
  ChainId,
  NetworkType,
  convertHexToDecimal,
  BUILT_IN_NETWORKS,
} from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-api';
import type { KeyringControllerState } from '@metamask/keyring-controller';
import type {
  NetworkState,
  NetworkConfiguration,
  NetworkController,
  NetworkClientId,
} from '@metamask/network-controller';
import { defaultState as defaultNetworkState } from '@metamask/network-controller';
import type { AutoManagedNetworkClient } from '@metamask/network-controller/src/create-auto-managed-network-client';
import type { CustomNetworkClientConfiguration } from '@metamask/network-controller/src/types';
import {
  getDefaultPreferencesState,
  type PreferencesState,
} from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';
import BN from 'bn.js';
import nock from 'nock';
import * as sinon from 'sinon';

import { advanceTime } from '../../../tests/helpers';
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
  [NetworkType.mainnet]: {
    ...BUILT_IN_NETWORKS[NetworkType.mainnet],
    rpcUrl: 'https://mainnet.infura.io/v3/fakekey',
  },
  [NetworkType.goerli]: {
    ...BUILT_IN_NETWORKS[NetworkType.goerli],
    rpcUrl: 'https://goerli.infura.io/v3/fakekey',
  },
  polygon: {
    chainId: '0x89',
    nickname: 'Polygon Mainnet',
    rpcUrl: `https://polygon-mainnet.infura.io/v3/fakekey`,
    ticker: 'MATIC',
    rpcPrefs: {
      blockExplorerUrl: 'https://polygonscan.com/',
    },
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
      'AccountsController:selectedAccountChange',
      'KeyringController:lock',
      'KeyringController:unlock',
      'NetworkController:networkDidChange',
      'TokenListController:stateChange',
      'PreferencesController:stateChange',
    ],
  });
}

describe('TokenDetectionController', () => {
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
      await withController(async ({ controller }) => {
        const mockTokens = sinon.stub(controller, 'detectTokens');
        controller.setIntervalLength(10);

        await controller.start();

        expect(mockTokens.calledOnce).toBe(true);
        await advanceTime({ clock, duration: 15 });
        expect(mockTokens.calledTwice).toBe(true);
      });
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
        },
        async ({ controller, mockNetworkState }) => {
          mockNetworkState({
            ...defaultNetworkState,
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
      const selectedAddress = '0x0000000000000000000000000000000000000001';
      await withController(
        {
          options: {
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            selectedAddress,
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
              selectedAddress,
            },
          );
        },
      );
    });

    it('should detect tokens correctly on the Polygon network', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const selectedAddress = '0x0000000000000000000000000000000000000001';
      await withController(
        {
          options: {
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            selectedAddress,
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
            ...defaultNetworkState,
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
              selectedAddress,
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
      const selectedAddress = '0x0000000000000000000000000000000000000001';
      const interval = 100;
      await withController(
        {
          options: {
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            interval,
            selectedAddress,
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
              selectedAddress,
            },
          );
        },
      );
    });

    it('should not add ignoredTokens to the tokens list if detected with balance', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const selectedAddress = '0x0000000000000000000000000000000000000001';
      await withController(
        {
          options: {
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            selectedAddress,
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
        const firstSelectedAddress =
          '0x0000000000000000000000000000000000000001';
        const secondSelectedAddress =
          '0x0000000000000000000000000000000000000002';
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              selectedAddress: firstSelectedAddress,
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
              address: secondSelectedAddress,
            } as InternalAccount);
            await advanceTime({ clock, duration: 1 });

            expect(callActionSpy).toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
              [sampleTokenA],
              {
                chainId: ChainId.mainnet,
                selectedAddress: secondSelectedAddress,
              },
            );
          },
        );
      });

      it('should not detect new tokens if the account is unchanged', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              selectedAddress,
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
              address: selectedAddress,
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
          const firstSelectedAddress =
            '0x0000000000000000000000000000000000000001';
          const secondSelectedAddress =
            '0x0000000000000000000000000000000000000002';
          await withController(
            {
              options: {
                disabled: false,
                getBalancesInSingleCall: mockGetBalancesInSingleCall,
                selectedAddress: firstSelectedAddress,
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
                address: secondSelectedAddress,
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
        const firstSelectedAddress =
          '0x0000000000000000000000000000000000000001';
        const secondSelectedAddress =
          '0x0000000000000000000000000000000000000002';
        await withController(
          {
            options: {
              disabled: true,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              selectedAddress: firstSelectedAddress,
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
              address: secondSelectedAddress,
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
        const firstSelectedAddress =
          '0x0000000000000000000000000000000000000001';
        const secondSelectedAddress =
          '0x0000000000000000000000000000000000000002';
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              selectedAddress: firstSelectedAddress,
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
              selectedAddress: secondSelectedAddress,
              useTokenDetection: true,
            });
            await advanceTime({ clock, duration: 1 });

            expect(callActionSpy).toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
              [sampleTokenA],
              {
                chainId: ChainId.mainnet,
                selectedAddress: secondSelectedAddress,
              },
            );
          },
        );
      });

      it('should detect new tokens after enabling token detection', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              selectedAddress,
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
              selectedAddress,
              useTokenDetection: false,
            });
            await advanceTime({ clock, duration: 1 });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              selectedAddress,
              useTokenDetection: true,
            });
            await advanceTime({ clock, duration: 1 });

            expect(callActionSpy).toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
              [sampleTokenA],
              {
                chainId: ChainId.mainnet,
                selectedAddress,
              },
            );
          },
        );
      });

      it('should not detect new tokens after switching between account if token detection is disabled', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const firstSelectedAddress =
          '0x0000000000000000000000000000000000000001';
        const secondSelectedAddress =
          '0x0000000000000000000000000000000000000002';
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              selectedAddress: firstSelectedAddress,
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
              selectedAddress: secondSelectedAddress,
              useTokenDetection: false,
            });
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
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              selectedAddress,
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
              selectedAddress,
              useTokenDetection: true,
            });
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
          const firstSelectedAddress =
            '0x0000000000000000000000000000000000000001';
          const secondSelectedAddress =
            '0x0000000000000000000000000000000000000002';
          await withController(
            {
              options: {
                disabled: false,
                getBalancesInSingleCall: mockGetBalancesInSingleCall,
                selectedAddress: firstSelectedAddress,
              },
              isKeyringUnlocked: false,
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
                selectedAddress: secondSelectedAddress,
                useTokenDetection: true,
              });
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
          const selectedAddress = '0x0000000000000000000000000000000000000001';
          await withController(
            {
              options: {
                disabled: false,
                getBalancesInSingleCall: mockGetBalancesInSingleCall,
                selectedAddress,
              },
              isKeyringUnlocked: false,
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
                selectedAddress,
                useTokenDetection: false,
              });
              await advanceTime({ clock, duration: 1 });

              triggerPreferencesStateChange({
                ...getDefaultPreferencesState(),
                selectedAddress,
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

    describe('when "disabled" is true', () => {
      it('should not detect new tokens after switching between accounts', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const firstSelectedAddress =
          '0x0000000000000000000000000000000000000001';
        const secondSelectedAddress =
          '0x0000000000000000000000000000000000000002';
        await withController(
          {
            options: {
              disabled: true,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              selectedAddress: firstSelectedAddress,
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
              selectedAddress: secondSelectedAddress,
              useTokenDetection: true,
            });
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
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        await withController(
          {
            options: {
              disabled: true,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              selectedAddress,
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
              selectedAddress,
              useTokenDetection: false,
            });
            await advanceTime({ clock, duration: 1 });

            triggerPreferencesStateChange({
              ...getDefaultPreferencesState(),
              selectedAddress,
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
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              selectedAddress,
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
              ...defaultNetworkState,
              selectedNetworkClientId: 'polygon',
            });
            await advanceTime({ clock, duration: 1 });

            expect(callActionSpy).toHaveBeenCalledWith(
              'TokensController:addDetectedTokens',
              [sampleTokenA],
              {
                chainId: '0x89',
                selectedAddress,
              },
            );
          },
        );
      });

      it('should not detect new tokens after switching to a chain that does not support token detection', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              selectedAddress,
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
              ...defaultNetworkState,
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
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              selectedAddress,
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
              ...defaultNetworkState,
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
          const selectedAddress = '0x0000000000000000000000000000000000000001';
          await withController(
            {
              options: {
                disabled: false,
                getBalancesInSingleCall: mockGetBalancesInSingleCall,
                selectedAddress,
              },
              isKeyringUnlocked: false,
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
                ...defaultNetworkState,
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
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        await withController(
          {
            options: {
              disabled: true,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              selectedAddress,
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
              ...defaultNetworkState,
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
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              selectedAddress,
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
                selectedAddress,
              },
            );
          },
        );
      });

      it('should not detect tokens if the token list is empty', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        await withController(
          {
            options: {
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              selectedAddress,
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
          const selectedAddress = '0x0000000000000000000000000000000000000001';
          await withController(
            {
              options: {
                disabled: false,
                getBalancesInSingleCall: mockGetBalancesInSingleCall,
                selectedAddress,
              },
              isKeyringUnlocked: false,
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
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        await withController(
          {
            options: {
              disabled: true,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              selectedAddress,
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

  describe('startPollingByNetworkClientId', () => {
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
      const selectedAddress = '0x0000000000000000000000000000000000000001';
      await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            selectedAddress,
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

          controller.startPollingByNetworkClientId('mainnet', {
            address: '0x1',
          });
          controller.startPollingByNetworkClientId('sepolia', {
            address: '0xdeadbeef',
          });
          controller.startPollingByNetworkClientId('goerli', {
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
      const selectedAddress = '0x0000000000000000000000000000000000000001';
      await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            selectedAddress,
          },
        },
        async ({
          controller,
          mockNetworkState,
          triggerPreferencesStateChange,
          callActionSpy,
        }) => {
          mockNetworkState({
            ...defaultNetworkState,
            selectedNetworkClientId: NetworkType.goerli,
          });
          triggerPreferencesStateChange({
            ...getDefaultPreferencesState(),
            useTokenDetection: false,
          });
          await controller.detectTokens({
            networkClientId: NetworkType.goerli,
            selectedAddress,
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
      const selectedAddress = '0x0000000000000000000000000000000000000001';
      await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            selectedAddress,
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
            selectedAddress,
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
              selectedAddress,
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
      const selectedAddress = '0x0000000000000000000000000000000000000001';
      await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            selectedAddress,
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
            selectedAddress,
          });

          expect(callActionSpy).toHaveBeenCalledWith(
            'TokensController:addDetectedTokens',
            [sampleTokenA],
            {
              chainId: ChainId.mainnet,
              selectedAddress,
            },
          );
        },
      );
    });

    it('should invoke the `trackMetaMetricsEvent` callback when token detection is triggered', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const selectedAddress = '0x0000000000000000000000000000000000000001';
      const mockTrackMetaMetricsEvent = jest.fn();

      await withController(
        {
          options: {
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            trackMetaMetricsEvent: mockTrackMetaMetricsEvent,
            selectedAddress,
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
            selectedAddress,
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
  });
});

/**
 * Construct the path used to fetch tokens that we can pass to `nock`.
 *
 * @param chainId - The chain ID.
 * @returns The constructed path.
 */
function getTokensPath(chainId: Hex) {
  return `/tokens/${convertHexToDecimal(
    chainId,
  )}?occurrenceFloor=3&includeNativeAssets=false&includeDuplicateSymbolAssets=false&includeTokenFees=false&includeAssetType=false`;
}

type WithControllerCallback<ReturnValue> = ({
  controller,
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
  const { options, isKeyringUnlocked, messenger } = rest;
  const controllerMessenger =
    messenger ?? new ControllerMessenger<AllowedActions, AllowedEvents>();

  const mockGetSelectedAccount = jest.fn<InternalAccount, []>();
  controllerMessenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    mockGetSelectedAccount.mockReturnValue({
      address: '0x1',
    } as InternalAccount),
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
    mockNetworkState.mockReturnValue({ ...defaultNetworkState }),
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
          'AccountsController:selectedAccountChange',
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
