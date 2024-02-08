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
import {
  defaultState as defaultNetworkState,
  type NetworkState,
  type NetworkConfiguration,
  type NetworkController,
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
import { formatAggregatorNames } from './assetsUtil';
import { TOKEN_END_POINT_API } from './token-service';
import type {
  AllowedActions,
  AllowedEvents,
  TokenDetectionControllerMessenger,
} from './TokenDetectionController';
import {
  TokenDetectionController,
  controllerName,
} from './TokenDetectionController';
import {
  getDefaultTokenListState,
  type TokenListState,
  type TokenListToken,
} from './TokenListController';
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
    'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
  isERC721: false,
  aggregators: formattedSampleAggregators,
  name: 'Chainlink',
};
const sampleTokenB = {
  address: tokenBFromList.address,
  symbol: tokenBFromList.symbol,
  decimals: tokenBFromList.decimals,
  image:
    'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c.png',
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
      'KeyringController:getState',
      'NetworkController:getNetworkConfigurationByNetworkClientId',
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
            networkClientId: NetworkType.goerli,
          },
        },
        async ({ controller }) => {
          await controller.start();

          expect(mockGetBalancesInSingleCall).not.toHaveBeenCalled();
        },
      );
    });

    it('should detect tokens correctly on supported networks', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const mockAddDetectedTokens = jest.fn();
      const selectedAddress = '0x0000000000000000000000000000000000000001';
      await withController(
        {
          options: {
            addDetectedTokens: mockAddDetectedTokens,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            networkClientId: NetworkType.mainnet,
            selectedAddress,
          },
        },
        async ({ controller, mockTokenListGetState }) => {
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokenList: {
              [sampleTokenA.address]: {
                name: sampleTokenA.name as string,
                symbol: sampleTokenA.symbol,
                decimals: sampleTokenA.decimals,
                address: sampleTokenA.address,
                occurrences: 1,
                aggregators: sampleTokenA.aggregators,
                iconUrl: sampleTokenA.image,
              },
            },
          });

          await controller.start();

          expect(mockAddDetectedTokens).toHaveBeenCalledWith([sampleTokenA], {
            chainId: ChainId.mainnet,
            selectedAddress,
          });
        },
      );
    });

    it('should detect tokens correctly on the Polygon network', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const mockAddDetectedTokens = jest.fn();
      const selectedAddress = '0x0000000000000000000000000000000000000001';
      await withController(
        {
          options: {
            addDetectedTokens: mockAddDetectedTokens,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            networkClientId: 'polygon',
            selectedAddress,
          },
        },
        async ({ controller, mockTokenListGetState }) => {
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokenList: {
              [sampleTokenA.address]: {
                name: sampleTokenA.name as string,
                symbol: sampleTokenA.symbol,
                decimals: sampleTokenA.decimals,
                address: sampleTokenA.address,
                occurrences: 1,
                aggregators: sampleTokenA.aggregators,
                iconUrl: sampleTokenA.image,
              },
            },
          });

          await controller.start();

          expect(mockAddDetectedTokens).toHaveBeenCalledWith([sampleTokenA], {
            chainId: '0x89',
            selectedAddress,
          });
        },
      );
    });

    it('should update detectedTokens when new tokens are detected', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
        [sampleTokenB.address]: new BN(1),
      });
      const mockAddDetectedTokens = jest.fn();
      const selectedAddress = '0x0000000000000000000000000000000000000001';
      const interval = 100;
      await withController(
        {
          options: {
            addDetectedTokens: mockAddDetectedTokens,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            interval,
            networkClientId: NetworkType.mainnet,
            selectedAddress,
          },
        },
        async ({ controller, mockTokenListGetState }) => {
          const tokenListState = {
            ...getDefaultTokenListState(),
            tokenList: {
              [sampleTokenA.address]: {
                name: sampleTokenA.name as string,
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
          await controller.start();
          mockAddDetectedTokens.mockReset();

          tokenListState.tokenList[sampleTokenB.address] = {
            name: sampleTokenB.name as string,
            symbol: sampleTokenB.symbol,
            decimals: sampleTokenB.decimals,
            address: sampleTokenB.address,
            occurrences: 1,
            aggregators: sampleTokenB.aggregators,
            iconUrl: sampleTokenB.image,
          };
          mockTokenListGetState(tokenListState);
          await advanceTime({ clock, duration: interval });

          expect(mockAddDetectedTokens).toHaveBeenCalledWith(
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
      const mockAddDetectedTokens = jest.fn();
      const mockGetTokensState = jest.fn().mockReturnValue({
        ...getDefaultTokensState(),
        ignoredTokens: [sampleTokenA.address],
      });
      const selectedAddress = '0x0000000000000000000000000000000000000001';
      await withController(
        {
          options: {
            addDetectedTokens: mockAddDetectedTokens,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            getTokensState: mockGetTokensState,
            networkClientId: NetworkType.mainnet,
            selectedAddress,
          },
        },
        async ({ controller, mockTokenListGetState }) => {
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokenList: {
              [sampleTokenA.address]: {
                name: sampleTokenA.name as string,
                symbol: sampleTokenA.symbol,
                decimals: sampleTokenA.decimals,
                address: sampleTokenA.address,
                occurrences: 1,
                aggregators: sampleTokenA.aggregators,
                iconUrl: sampleTokenA.image,
              },
            },
          });

          await controller.start();

          expect(mockAddDetectedTokens).not.toHaveBeenCalled();
        },
      );
    });

    it('should not detect tokens if there is no selectedAddress set', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const mockAddDetectedTokens = jest.fn();
      await withController(
        {
          options: {
            addDetectedTokens: mockAddDetectedTokens,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            networkClientId: NetworkType.mainnet,
            selectedAddress: '',
          },
        },
        async ({ controller, mockTokenListGetState }) => {
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokenList: {
              [sampleTokenA.address]: {
                name: sampleTokenA.name as string,
                symbol: sampleTokenA.symbol,
                decimals: sampleTokenA.decimals,
                address: sampleTokenA.address,
                occurrences: 1,
                aggregators: sampleTokenA.aggregators,
                iconUrl: sampleTokenA.image,
              },
            },
          });

          await controller.start();

          expect(mockAddDetectedTokens).not.toHaveBeenCalled();
        },
      );
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

    describe('when "disabled" is "false"', () => {
      it('should detect new tokens after switching between accounts', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const mockAddDetectedTokens = jest.fn();
        const firstSelectedAddress =
          '0x0000000000000000000000000000000000000001';
        const secondSelectedAddress =
          '0x0000000000000000000000000000000000000002';
        await withController(
          {
            options: {
              addDetectedTokens: mockAddDetectedTokens,
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              networkClientId: NetworkType.mainnet,
              selectedAddress: firstSelectedAddress,
            },
          },
          async ({ mockTokenListGetState, triggerPreferencesStateChange }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokenList: {
                [sampleTokenA.address]: {
                  name: sampleTokenA.name as string,
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

            expect(mockAddDetectedTokens).toHaveBeenCalledWith([sampleTokenA], {
              chainId: ChainId.mainnet,
              selectedAddress: secondSelectedAddress,
            });
          },
        );
      });

      it('should detect new tokens after enabling token detection', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const mockAddDetectedTokens = jest.fn();
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        await withController(
          {
            options: {
              addDetectedTokens: mockAddDetectedTokens,
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              networkClientId: NetworkType.mainnet,
              selectedAddress,
            },
          },
          async ({ mockTokenListGetState, triggerPreferencesStateChange }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokenList: {
                [sampleTokenA.address]: {
                  name: sampleTokenA.name as string,
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

            expect(mockAddDetectedTokens).toHaveBeenCalledWith([sampleTokenA], {
              chainId: ChainId.mainnet,
              selectedAddress,
            });
          },
        );
      });

      it('should not detect new tokens after switching between account if token detection is disabled', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const mockAddDetectedTokens = jest.fn();
        const firstSelectedAddress =
          '0x0000000000000000000000000000000000000001';
        const secondSelectedAddress =
          '0x0000000000000000000000000000000000000002';
        await withController(
          {
            options: {
              addDetectedTokens: mockAddDetectedTokens,
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              networkClientId: NetworkType.mainnet,
              selectedAddress: firstSelectedAddress,
            },
          },
          async ({ mockTokenListGetState, triggerPreferencesStateChange }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokenList: {
                [sampleTokenA.address]: {
                  name: sampleTokenA.name as string,
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

            expect(mockAddDetectedTokens).not.toHaveBeenCalled();
          },
        );
      });

      it('should not detect new tokens if the account is unchanged', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const mockAddDetectedTokens = jest.fn();
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        await withController(
          {
            options: {
              addDetectedTokens: mockAddDetectedTokens,
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              networkClientId: NetworkType.mainnet,
              selectedAddress,
            },
          },
          async ({ mockTokenListGetState, triggerPreferencesStateChange }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokenList: {
                [sampleTokenA.address]: {
                  name: sampleTokenA.name as string,
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

            expect(mockAddDetectedTokens).not.toHaveBeenCalled();
          },
        );
      });
    });

    describe('when "disabled" is "true"', () => {
      it('should not detect new tokens after switching between accounts', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const mockAddDetectedTokens = jest.fn();
        const firstSelectedAddress =
          '0x0000000000000000000000000000000000000001';
        const secondSelectedAddress =
          '0x0000000000000000000000000000000000000002';
        await withController(
          {
            options: {
              addDetectedTokens: mockAddDetectedTokens,
              disabled: true,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              networkClientId: NetworkType.mainnet,
              selectedAddress: firstSelectedAddress,
            },
          },
          async ({ mockTokenListGetState, triggerPreferencesStateChange }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokenList: {
                [sampleTokenA.address]: {
                  name: sampleTokenA.name as string,
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

            expect(mockAddDetectedTokens).not.toHaveBeenCalled();
          },
        );
      });

      it('should not detect new tokens after enabling token detection', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const mockAddDetectedTokens = jest.fn();
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        await withController(
          {
            options: {
              addDetectedTokens: mockAddDetectedTokens,
              disabled: true,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              networkClientId: NetworkType.mainnet,
              selectedAddress,
            },
          },
          async ({ mockTokenListGetState, triggerPreferencesStateChange }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokenList: {
                [sampleTokenA.address]: {
                  name: sampleTokenA.name as string,
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

            expect(mockAddDetectedTokens).not.toHaveBeenCalled();
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

    describe('when "disabled" is "false"', () => {
      it('should detect new tokens after switching network client id', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const mockAddDetectedTokens = jest.fn();
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        const messenger = new ControllerMessenger<
          AllowedActions,
          AllowedEvents
        >();
        await withController(
          {
            options: {
              addDetectedTokens: mockAddDetectedTokens,
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              networkClientId: NetworkType.mainnet,
              selectedAddress,
            },
            messenger,
          },
          async ({ mockTokenListGetState }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokenList: {
                [sampleTokenA.address]: {
                  name: sampleTokenA.name as string,
                  symbol: sampleTokenA.symbol,
                  decimals: sampleTokenA.decimals,
                  address: sampleTokenA.address,
                  occurrences: 1,
                  aggregators: sampleTokenA.aggregators,
                  iconUrl: sampleTokenA.image,
                },
              },
            });

            messenger.publish('NetworkController:networkDidChange', {
              ...defaultNetworkState,
              selectedNetworkClientId: 'polygon',
            });
            await advanceTime({ clock, duration: 1 });

            expect(mockAddDetectedTokens).toHaveBeenCalledWith([sampleTokenA], {
              chainId: '0x89',
              selectedAddress,
            });
          },
        );
      });

      it('should not detect new tokens after switching to a chain that does not support token detection', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const mockAddDetectedTokens = jest.fn();
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        const messenger = new ControllerMessenger<
          AllowedActions,
          AllowedEvents
        >();
        await withController(
          {
            options: {
              addDetectedTokens: mockAddDetectedTokens,
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              networkClientId: NetworkType.mainnet,
              selectedAddress,
            },
            messenger,
          },
          async ({ mockTokenListGetState }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokenList: {
                [sampleTokenA.address]: {
                  name: sampleTokenA.name as string,
                  symbol: sampleTokenA.symbol,
                  decimals: sampleTokenA.decimals,
                  address: sampleTokenA.address,
                  occurrences: 1,
                  aggregators: sampleTokenA.aggregators,
                  iconUrl: sampleTokenA.image,
                },
              },
            });

            messenger.publish('NetworkController:networkDidChange', {
              ...defaultNetworkState,
              selectedNetworkClientId: 'goerli',
            });
            await advanceTime({ clock, duration: 1 });

            expect(mockAddDetectedTokens).not.toHaveBeenCalled();
          },
        );
      });

      it('should not detect new tokens if the network client id has not changed', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const mockAddDetectedTokens = jest.fn();
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        const messenger = new ControllerMessenger<
          AllowedActions,
          AllowedEvents
        >();
        await withController(
          {
            options: {
              addDetectedTokens: mockAddDetectedTokens,
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              networkClientId: NetworkType.mainnet,
              selectedAddress,
            },
            messenger,
          },
          async ({ mockTokenListGetState }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokenList: {
                [sampleTokenA.address]: {
                  name: sampleTokenA.name as string,
                  symbol: sampleTokenA.symbol,
                  decimals: sampleTokenA.decimals,
                  address: sampleTokenA.address,
                  occurrences: 1,
                  aggregators: sampleTokenA.aggregators,
                  iconUrl: sampleTokenA.image,
                },
              },
            });

            messenger.publish('NetworkController:networkDidChange', {
              ...defaultNetworkState,
              selectedNetworkClientId: 'mainnet',
            });
            await advanceTime({ clock, duration: 1 });

            expect(mockAddDetectedTokens).not.toHaveBeenCalled();
          },
        );
      });
    });

    describe('when "disabled" is "true"', () => {
      it('should not detect new tokens after switching network client id', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const mockAddDetectedTokens = jest.fn();
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        const messenger = new ControllerMessenger<
          AllowedActions,
          AllowedEvents
        >();
        await withController(
          {
            options: {
              addDetectedTokens: mockAddDetectedTokens,
              disabled: true,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              networkClientId: NetworkType.mainnet,
              selectedAddress,
            },
            messenger,
          },
          async ({ mockTokenListGetState }) => {
            mockTokenListGetState({
              ...getDefaultTokenListState(),
              tokenList: {
                [sampleTokenA.address]: {
                  name: sampleTokenA.name as string,
                  symbol: sampleTokenA.symbol,
                  decimals: sampleTokenA.decimals,
                  address: sampleTokenA.address,
                  occurrences: 1,
                  aggregators: sampleTokenA.aggregators,
                  iconUrl: sampleTokenA.image,
                },
              },
            });

            messenger.publish('NetworkController:networkDidChange', {
              ...defaultNetworkState,
              selectedNetworkClientId: 'polygon',
            });
            await advanceTime({ clock, duration: 1 });

            expect(mockAddDetectedTokens).not.toHaveBeenCalled();
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

    describe('when "disabled" is "false"', () => {
      it('should detect tokens if the token list is non-empty', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const mockAddDetectedTokens = jest.fn();
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        const messenger = new ControllerMessenger<
          AllowedActions,
          AllowedEvents
        >();
        await withController(
          {
            options: {
              addDetectedTokens: mockAddDetectedTokens,
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              networkClientId: NetworkType.mainnet,
              selectedAddress,
            },
            messenger,
          },
          async ({ mockTokenListGetState }) => {
            const tokenListState = {
              ...getDefaultTokenListState(),
              tokenList: {
                [sampleTokenA.address]: {
                  name: sampleTokenA.name as string,
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

            messenger.publish(
              'TokenListController:stateChange',
              tokenListState,
              [],
            );
            await advanceTime({ clock, duration: 1 });

            expect(mockAddDetectedTokens).toHaveBeenCalledWith([sampleTokenA], {
              chainId: ChainId.mainnet,
              selectedAddress,
            });
          },
        );
      });

      it('should not detect tokens if the token list is empty', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const mockAddDetectedTokens = jest.fn();
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        const messenger = new ControllerMessenger<
          AllowedActions,
          AllowedEvents
        >();
        await withController(
          {
            options: {
              addDetectedTokens: mockAddDetectedTokens,
              disabled: false,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              networkClientId: NetworkType.mainnet,
              selectedAddress,
            },
            messenger,
          },
          async ({ mockTokenListGetState }) => {
            const tokenListState = {
              ...getDefaultTokenListState(),
              tokenList: {},
            };
            mockTokenListGetState(tokenListState);

            messenger.publish(
              'TokenListController:stateChange',
              tokenListState,
              [],
            );
            await advanceTime({ clock, duration: 1 });

            expect(mockAddDetectedTokens).not.toHaveBeenCalled();
          },
        );
      });
    });

    describe('when "disabled" is "true"', () => {
      it('should not detect tokens', async () => {
        const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
          [sampleTokenA.address]: new BN(1),
        });
        const mockAddDetectedTokens = jest.fn();
        const selectedAddress = '0x0000000000000000000000000000000000000001';
        const messenger = new ControllerMessenger<
          AllowedActions,
          AllowedEvents
        >();
        await withController(
          {
            options: {
              addDetectedTokens: mockAddDetectedTokens,
              disabled: true,
              getBalancesInSingleCall: mockGetBalancesInSingleCall,
              networkClientId: NetworkType.mainnet,
              selectedAddress,
            },
            messenger,
          },
          async ({ mockTokenListGetState }) => {
            const tokenListState = {
              ...getDefaultTokenListState(),
              tokenList: {
                [sampleTokenA.address]: {
                  name: sampleTokenA.name as string,
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

            messenger.publish(
              'TokenListController:stateChange',
              tokenListState,
              [],
            );
            await advanceTime({ clock, duration: 1 });

            expect(mockAddDetectedTokens).not.toHaveBeenCalled();
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
      const mockAddDetectedTokens = jest.fn();
      const selectedAddress = '0x0000000000000000000000000000000000000001';
      const messenger = new ControllerMessenger<
        AllowedActions,
        AllowedEvents
      >();
      await withController(
        {
          options: {
            addDetectedTokens: mockAddDetectedTokens,
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            networkClientId: NetworkType.mainnet,
            selectedAddress,
          },
          messenger,
        },
        async ({ controller, mockTokenListGetState }) => {
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokenList: {
              [sampleTokenA.address]: {
                name: sampleTokenA.name as string,
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
            [{ networkClientId: 'mainnet', accountAddress: '0x1' }],
            [{ networkClientId: 'sepolia', accountAddress: '0xdeadbeef' }],
            [{ networkClientId: 'goerli', accountAddress: '0x3' }],
          ]);

          await advanceTime({ clock, duration: DEFAULT_INTERVAL });
          expect(spy.mock.calls).toMatchObject([
            [{ networkClientId: 'mainnet', accountAddress: '0x1' }],
            [{ networkClientId: 'sepolia', accountAddress: '0xdeadbeef' }],
            [{ networkClientId: 'goerli', accountAddress: '0x3' }],
            [{ networkClientId: 'mainnet', accountAddress: '0x1' }],
            [{ networkClientId: 'sepolia', accountAddress: '0xdeadbeef' }],
            [{ networkClientId: 'goerli', accountAddress: '0x3' }],
          ]);
        },
      );
    });
  });

  describe('detectTokens', () => {
    it('should detect and add tokens by networkClientId correctly', async () => {
      const mockGetBalancesInSingleCall = jest.fn().mockResolvedValue({
        [sampleTokenA.address]: new BN(1),
      });
      const mockAddDetectedTokens = jest.fn();
      const selectedAddress = '0x0000000000000000000000000000000000000001';
      const messenger = new ControllerMessenger<
        AllowedActions,
        AllowedEvents
      >();
      await withController(
        {
          options: {
            addDetectedTokens: mockAddDetectedTokens,
            disabled: false,
            getBalancesInSingleCall: mockGetBalancesInSingleCall,
            networkClientId: NetworkType.mainnet,
            selectedAddress,
          },
          messenger,
        },
        async ({ controller, mockTokenListGetState }) => {
          mockTokenListGetState({
            ...getDefaultTokenListState(),
            tokenList: {
              [sampleTokenA.address]: {
                name: sampleTokenA.name as string,
                symbol: sampleTokenA.symbol,
                decimals: sampleTokenA.decimals,
                address: sampleTokenA.address,
                occurrences: 1,
                aggregators: sampleTokenA.aggregators,
                iconUrl: sampleTokenA.image,
              },
            },
          });

          await controller.detectTokens({
            networkClientId: NetworkType.mainnet,
            accountAddress: selectedAddress,
          });

          expect(mockAddDetectedTokens).toHaveBeenCalledWith([sampleTokenA], {
            chainId: ChainId.mainnet,
            selectedAddress,
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
  mockKeyringGetState,
  mockTokenListGetState,
  mockPreferencesGetState,
  triggerKeyringUnlock,
  triggerKeyringLock,
  triggerTokenListStateChange,
  triggerPreferencesStateChange,
  triggerSelectedAccountChange,
  triggerNetworkDidChange,
}: {
  controller: TokenDetectionController;
  mockKeyringGetState: (state: KeyringControllerState) => void;
  mockTokenListGetState: (state: TokenListState) => void;
  mockPreferencesGetState: (state: PreferencesState) => void;
  mockGetNetworkConfigurationByNetworkClientId: (
    handler: (networkClientId: string) => NetworkConfiguration,
  ) => void;
  triggerKeyringUnlock: () => void;
  triggerKeyringLock: () => void;
  triggerTokenListStateChange: (state: TokenListState) => void;
  triggerPreferencesStateChange: (state: PreferencesState) => void;
  triggerSelectedAccountChange: (account: InternalAccount) => void;
  triggerNetworkDidChange: (state: NetworkState) => void;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<ConstructorParameters<typeof TokenDetectionController>[0]>;
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

  const mockKeyringState = jest.fn<KeyringControllerState, []>();
  controllerMessenger.registerActionHandler(
    'KeyringController:getState',
    mockKeyringState.mockReturnValue({
      isUnlocked: true,
    } as unknown as KeyringControllerState),
  );
  const mockGetNetworkConfigurationByNetworkClientId = jest.fn<
    ReturnType<NetworkController['getNetworkConfigurationByNetworkClientId']>,
    Parameters<NetworkController['getNetworkConfigurationByNetworkClientId']>
  >();
  controllerMessenger.registerActionHandler(
    'NetworkController:getNetworkConfigurationByNetworkClientId',
    mockGetNetworkConfigurationByNetworkClientId.mockImplementation(
      (networkClientId: string) => {
        return mockNetworkConfigurations[networkClientId];
      },
    ),
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

  const controller = new TokenDetectionController({
    networkClientId: NetworkType.mainnet,
    getBalancesInSingleCall: jest.fn(),
    addDetectedTokens: jest.fn(),
    getTokensState: jest.fn().mockReturnValue(getDefaultTokensState()),
    trackMetaMetricsEvent: jest.fn(),
    messenger: buildTokenDetectionControllerMessenger(controllerMessenger),
    ...options,
  });
  try {
    return await fn({
      controller,
      mockKeyringGetState: (state: KeyringControllerState) => {
        mockKeyringState.mockReturnValue(state);
      },
      mockPreferencesGetState: (state: PreferencesState) => {
        mockPreferencesState.mockReturnValue(state);
      },
      mockTokenListGetState: (state: TokenListState) => {
        mockTokenListState.mockReturnValue(state);
      },
      mockGetNetworkConfigurationByNetworkClientId: (
        handler: (networkClientId: string) => NetworkConfiguration,
      ) => {
        mockGetNetworkConfigurationByNetworkClientId.mockImplementation(
          handler,
        );
      },
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
