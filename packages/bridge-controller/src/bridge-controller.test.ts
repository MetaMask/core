import { Contract } from '@ethersproject/contracts';
import { SolScope } from '@metamask/keyring-api';
import { HandlerType } from '@metamask/snaps-utils';
import type { Hex } from '@metamask/utils';
import { bigIntToHex } from '@metamask/utils';
import nock from 'nock';

import { BridgeController } from './bridge-controller';
import {
  BridgeClientId,
  BRIDGE_PROD_API_BASE_URL,
  DEFAULT_BRIDGE_CONTROLLER_STATE,
} from './constants/bridge';
import { SWAPS_API_V2_BASE_URL } from './constants/swaps';
import {
  ChainId,
  type BridgeControllerMessenger,
  type QuoteResponse,
} from './types';
import * as balanceUtils from './utils/balance';
import * as fetchUtils from './utils/fetch';
import { flushPromises } from '../../../tests/helpers';
import { handleFetch } from '../../controller-utils/src';
import mockBridgeQuotesErc20Native from '../tests/mock-quotes-erc20-native.json';
import mockBridgeQuotesNativeErc20Eth from '../tests/mock-quotes-native-erc20-eth.json';
import mockBridgeQuotesNativeErc20 from '../tests/mock-quotes-native-erc20.json';
import mockBridgeQuotesSolErc20 from '../tests/mock-quotes-sol-erc20.json';

const EMPTY_INIT_STATE = DEFAULT_BRIDGE_CONTROLLER_STATE;

const messengerMock = {
  call: jest.fn(),
  registerActionHandler: jest.fn(),
  registerInitialEventPayload: jest.fn(),
  publish: jest.fn(),
} as unknown as jest.Mocked<BridgeControllerMessenger>;

jest.mock('@ethersproject/contracts', () => {
  return {
    ...jest.requireActual('@ethersproject/contracts'),
    Contract: jest.fn(),
  };
});

const getLayer1GasFeeMock = jest.fn();
const mockFetchFn = handleFetch;

describe('BridgeController', function () {
  let bridgeController: BridgeController;

  beforeAll(function () {
    bridgeController = new BridgeController({
      messenger: messengerMock,
      getLayer1GasFee: getLayer1GasFeeMock,
      clientId: BridgeClientId.EXTENSION,
      fetchFn: mockFetchFn,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();

    nock(BRIDGE_PROD_API_BASE_URL)
      .get('/getAllFeatureFlags')
      .reply(200, {
        'extension-config': {
          refreshRate: 3,
          maxRefreshCount: 3,
          support: true,
          chains: {
            '10': {
              isActiveSrc: true,
              isActiveDest: false,
            },
            '534352': {
              isActiveSrc: true,
              isActiveDest: false,
            },
            '137': {
              isActiveSrc: false,
              isActiveDest: true,
            },
            '42161': {
              isActiveSrc: false,
              isActiveDest: true,
            },
            [ChainId.SOLANA]: {
              isActiveSrc: true,
              isActiveDest: true,
            },
          },
        },
        'mobile-config': {
          refreshRate: 3,
          maxRefreshCount: 3,
          support: true,
          chains: {
            '10': {
              isActiveSrc: true,
              isActiveDest: false,
            },
            '534352': {
              isActiveSrc: true,
              isActiveDest: false,
            },
            '137': {
              isActiveSrc: false,
              isActiveDest: true,
            },
            '42161': {
              isActiveSrc: false,
              isActiveDest: true,
            },
            [ChainId.SOLANA]: {
              isActiveSrc: true,
              isActiveDest: true,
            },
          },
        },
        'approval-gas-multiplier': {
          '137': 1.1,
          '42161': 1.2,
          '10': 1.3,
          '534352': 1.4,
        },
        'bridge-gas-multiplier': {
          '137': 2.1,
          '42161': 2.2,
          '10': 2.3,
          '534352': 2.4,
        },
      });
    nock(BRIDGE_PROD_API_BASE_URL)
      .get('/getTokens?chainId=10')
      .reply(200, [
        {
          address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
          symbol: 'ABC',
          decimals: 16,
          aggregators: ['lifl', 'socket'],
        },
        {
          address: '0x1291478912',
          symbol: 'DEF',
          decimals: 16,
        },
      ]);
    nock(SWAPS_API_V2_BASE_URL)
      .get('/networks/10/topAssets')
      .reply(200, [
        {
          address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
          symbol: 'ABC',
        },
      ]);
    bridgeController.resetState();
  });

  it('constructor should setup correctly', function () {
    expect(bridgeController.state).toStrictEqual(EMPTY_INIT_STATE);
  });

  it('setBridgeFeatureFlags should fetch and set the bridge feature flags', async function () {
    const commonConfig = {
      maxRefreshCount: 3,
      refreshRate: 3,
      support: true,
      chains: {
        'eip155:10': { isActiveSrc: true, isActiveDest: false },
        'eip155:534352': { isActiveSrc: true, isActiveDest: false },
        'eip155:137': { isActiveSrc: false, isActiveDest: true },
        'eip155:42161': { isActiveSrc: false, isActiveDest: true },
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
          isActiveSrc: true,
          isActiveDest: true,
        },
      },
    };

    const expectedFeatureFlagsResponse = {
      extensionConfig: commonConfig,
      mobileConfig: commonConfig,
    };
    expect(bridgeController.state).toStrictEqual(EMPTY_INIT_STATE);

    const setIntervalLengthSpy = jest.spyOn(
      bridgeController,
      'setIntervalLength',
    );

    await bridgeController.setBridgeFeatureFlags();
    expect(bridgeController.state.bridgeFeatureFlags).toStrictEqual(
      expectedFeatureFlagsResponse,
    );
    expect(setIntervalLengthSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalLengthSpy).toHaveBeenCalledWith(3);

    bridgeController.resetState();
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        bridgeFeatureFlags: expectedFeatureFlagsResponse,
        quotes: DEFAULT_BRIDGE_CONTROLLER_STATE.quotes,
        quotesLastFetched: DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLastFetched,
        quotesLoadingStatus:
          DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLoadingStatus,
      }),
    );
  });

  it('updateBridgeQuoteRequestParams should update the quoteRequest state', async function () {
    await bridgeController.updateBridgeQuoteRequestParams({ srcChainId: 1 });
    expect(bridgeController.state.quoteRequest).toStrictEqual({
      srcChainId: 1,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
    });

    await bridgeController.updateBridgeQuoteRequestParams({ destChainId: 10 });
    expect(bridgeController.state.quoteRequest).toStrictEqual({
      destChainId: 10,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
    });

    await bridgeController.updateBridgeQuoteRequestParams({
      destChainId: undefined,
    });
    expect(bridgeController.state.quoteRequest).toStrictEqual({
      destChainId: undefined,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
    });

    await bridgeController.updateBridgeQuoteRequestParams({
      srcTokenAddress: undefined,
    });
    expect(bridgeController.state.quoteRequest).toStrictEqual({
      srcTokenAddress: undefined,
    });

    await bridgeController.updateBridgeQuoteRequestParams({
      srcTokenAmount: '100000',
      destTokenAddress: '0x123',
      slippage: 0.5,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
    });
    expect(bridgeController.state.quoteRequest).toStrictEqual({
      srcTokenAmount: '100000',
      destTokenAddress: '0x123',
      slippage: 0.5,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
    });

    await bridgeController.updateBridgeQuoteRequestParams({
      srcTokenAddress: '0x2ABC',
    });
    expect(bridgeController.state.quoteRequest).toStrictEqual({
      srcTokenAddress: '0x2ABC',
    });

    bridgeController.resetState();
    expect(bridgeController.state.quoteRequest).toStrictEqual({
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
    });
  });

  it('updateBridgeQuoteRequestParams should trigger quote polling if request is valid', async function () {
    jest.useFakeTimers();
    const stopAllPollingSpy = jest.spyOn(bridgeController, 'stopAllPolling');
    const startPollingSpy = jest.spyOn(bridgeController, 'startPolling');
    const hasSufficientBalanceSpy = jest
      .spyOn(balanceUtils, 'hasSufficientBalance')
      .mockResolvedValue(true);
    messengerMock.call.mockReturnValue({
      address: '0x123',
      provider: jest.fn(),
      selectedNetworkClientId: 'selectedNetworkClientId',
    } as never);

    const fetchBridgeQuotesSpy = jest
      .spyOn(fetchUtils, 'fetchBridgeQuotes')
      .mockImplementationOnce(async () => {
        return await new Promise((resolve) => {
          return setTimeout(() => {
            resolve(mockBridgeQuotesNativeErc20Eth as never);
          }, 5000);
        });
      });

    fetchBridgeQuotesSpy.mockImplementationOnce(async () => {
      return await new Promise((resolve) => {
        return setTimeout(() => {
          resolve([
            ...mockBridgeQuotesNativeErc20Eth,
            ...mockBridgeQuotesNativeErc20Eth,
          ] as never);
        }, 10000);
      });
    });

    fetchBridgeQuotesSpy.mockImplementationOnce(async () => {
      return await new Promise((_resolve, reject) => {
        return setTimeout(() => {
          reject(new Error('Network error'));
        }, 10000);
      });
    });

    const quoteParams = {
      srcChainId: '0x1',
      destChainId: SolScope.Mainnet,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
      destTokenAddress: '123d1',
      srcTokenAmount: '1000000000000000000',
      slippage: 0.5,
      walletAddress: '0x123',
    };
    const quoteRequest = {
      ...quoteParams,
    };
    await bridgeController.updateBridgeQuoteRequestParams(quoteParams);

    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);
    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledWith({
      networkClientId: 'selectedNetworkClientId',
      updatedQuoteRequest: {
        ...quoteRequest,
        insufficientBal: false,
      },
    });

    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteRequest, walletAddress: '0x123' },
        quotes: DEFAULT_BRIDGE_CONTROLLER_STATE.quotes,
        quotesLastFetched: DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLastFetched,
        quotesLoadingStatus:
          DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLoadingStatus,
      }),
    );

    // Loading state
    jest.advanceTimersByTime(1000);
    await flushPromises();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(1);
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledWith(
      {
        ...quoteRequest,
        insufficientBal: false,
      },
      expect.any(AbortSignal),
      BridgeClientId.EXTENSION,
      mockFetchFn,
      BRIDGE_PROD_API_BASE_URL,
    );
    expect(bridgeController.state.quotesLastFetched).toBeNull();

    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteRequest, insufficientBal: false },
        quotes: [],
        quotesLoadingStatus: 0,
      }),
    );

    // After first fetch
    jest.advanceTimersByTime(10000);
    await flushPromises();
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteRequest, insufficientBal: false },
        quotes: mockBridgeQuotesNativeErc20Eth,
        quotesLoadingStatus: 1,
      }),
    );
    const firstFetchTime = bridgeController.state.quotesLastFetched;
    expect(firstFetchTime).toBeGreaterThan(0);

    // After 2nd fetch
    jest.advanceTimersByTime(50000);
    await flushPromises();
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteRequest, insufficientBal: false },
        quotes: [
          ...mockBridgeQuotesNativeErc20Eth,
          ...mockBridgeQuotesNativeErc20Eth,
        ],
        quotesLoadingStatus: 1,
        quoteFetchError: null,
        quotesRefreshCount: 2,
      }),
    );
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(2);
    const secondFetchTime = bridgeController.state.quotesLastFetched;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(secondFetchTime).toBeGreaterThan(firstFetchTime!);

    // After 3nd fetch throws an error
    jest.advanceTimersByTime(50000);
    await flushPromises();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(3);
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteRequest, insufficientBal: false },
        quotes: [],
        quotesLoadingStatus: 2,
        quoteFetchError: 'Network error',
        quotesRefreshCount: 3,
      }),
    );
    expect(
      bridgeController.state.quotesLastFetched,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ).toBeGreaterThan(secondFetchTime!);

    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
    expect(getLayer1GasFeeMock).not.toHaveBeenCalled();
  });

  it('updateBridgeQuoteRequestParams should only poll once if insufficientBal=true', async function () {
    jest.useFakeTimers();
    const stopAllPollingSpy = jest.spyOn(bridgeController, 'stopAllPolling');
    const startPollingSpy = jest.spyOn(bridgeController, 'startPolling');
    const hasSufficientBalanceSpy = jest
      .spyOn(balanceUtils, 'hasSufficientBalance')
      .mockResolvedValue(false);
    messengerMock.call.mockReturnValue({
      address: '0x123',
      provider: jest.fn(),
      selectedNetworkClientId: 'selectedNetworkClientId',
    } as never);

    const fetchBridgeQuotesSpy = jest
      .spyOn(fetchUtils, 'fetchBridgeQuotes')
      .mockImplementationOnce(async () => {
        return await new Promise((resolve) => {
          return setTimeout(() => {
            resolve(mockBridgeQuotesNativeErc20Eth as never);
          }, 5000);
        });
      });

    fetchBridgeQuotesSpy.mockImplementation(async () => {
      return await new Promise((resolve) => {
        return setTimeout(() => {
          resolve([
            ...mockBridgeQuotesNativeErc20Eth,
            ...mockBridgeQuotesNativeErc20Eth,
          ] as never);
        }, 10000);
      });
    });

    const quoteParams = {
      srcChainId: '0x1',
      destChainId: '0x10',
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
      destTokenAddress: '0x123',
      srcTokenAmount: '1000000000000000000',
      walletAddress: '0x123',
      slippage: 0.5,
    };
    const quoteRequest = {
      ...quoteParams,
    };
    await bridgeController.updateBridgeQuoteRequestParams(quoteParams);

    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);
    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledWith({
      networkClientId: 'selectedNetworkClientId',
      updatedQuoteRequest: {
        ...quoteRequest,
        insufficientBal: true,
      },
    });

    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        quoteRequest,
        quotes: DEFAULT_BRIDGE_CONTROLLER_STATE.quotes,
        quotesLastFetched: DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLastFetched,
        quotesInitialLoadTime: null,
        quotesLoadingStatus:
          DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLoadingStatus,
      }),
    );

    // Loading state
    jest.advanceTimersByTime(1000);
    await flushPromises();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(1);
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledWith(
      {
        ...quoteRequest,
        insufficientBal: true,
      },
      expect.any(AbortSignal),
      BridgeClientId.EXTENSION,
      mockFetchFn,
      BRIDGE_PROD_API_BASE_URL,
    );
    expect(bridgeController.state.quotesLastFetched).toBeNull();

    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteRequest, insufficientBal: true },
        quotes: [],
        quotesLoadingStatus: 0,
      }),
    );

    // After first fetch
    jest.advanceTimersByTime(10000);
    await flushPromises();
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteRequest, insufficientBal: true },
        quotes: mockBridgeQuotesNativeErc20Eth,
        quotesLoadingStatus: 1,
        quotesRefreshCount: 1,
        quotesInitialLoadTime: 11000,
      }),
    );
    const firstFetchTime = bridgeController.state.quotesLastFetched;
    expect(firstFetchTime).toBeGreaterThan(0);

    // After 2nd fetch
    jest.advanceTimersByTime(50000);
    await flushPromises();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(1);
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteRequest, insufficientBal: true },
        quotes: mockBridgeQuotesNativeErc20Eth,
        quotesLoadingStatus: 1,
        quotesRefreshCount: 1,
        quotesInitialLoadTime: 11000,
      }),
    );
    const secondFetchTime = bridgeController.state.quotesLastFetched;
    expect(secondFetchTime).toStrictEqual(firstFetchTime);
    expect(getLayer1GasFeeMock).not.toHaveBeenCalled();
  });

  it('updateBridgeQuoteRequestParams should set insufficientBal=true if RPC provider is tenderly', async function () {
    jest.useFakeTimers();
    const stopAllPollingSpy = jest.spyOn(bridgeController, 'stopAllPolling');
    const startPollingSpy = jest.spyOn(bridgeController, 'startPolling');
    const hasSufficientBalanceSpy = jest
      .spyOn(balanceUtils, 'hasSufficientBalance')
      .mockResolvedValue(false);

    messengerMock.call.mockImplementation(
      (
        ...args: Parameters<BridgeControllerMessenger['call']>
      ): ReturnType<BridgeControllerMessenger['call']> => {
        const actionType = args[0];

        // eslint-disable-next-line jest/no-conditional-in-test
        if (actionType === 'AccountsController:getSelectedMultichainAccount') {
          return {
            address: '0x123',
            metadata: {
              snap: {
                id: 'npm:@metamask/solana-snap',
                name: 'Solana Snap',
                enabled: true,
              },
            } as never,
            options: {
              scope: 'mainnet',
            },
          } as never;
        }
        // eslint-disable-next-line jest/no-conditional-in-test
        if (actionType === 'NetworkController:getNetworkClientById') {
          return {
            configuration: { rpcUrl: 'https://rpc.tenderly.co' },
          } as never;
        }
        return {
          provider: jest.fn() as never,
          selectedNetworkClientId: 'selectedNetworkClientId',
        } as never;
      },
    );

    const fetchBridgeQuotesSpy = jest
      .spyOn(fetchUtils, 'fetchBridgeQuotes')
      .mockImplementationOnce(async () => {
        return await new Promise((resolve) => {
          return setTimeout(() => {
            resolve(mockBridgeQuotesNativeErc20Eth as never);
          }, 5000);
        });
      });

    fetchBridgeQuotesSpy.mockImplementation(async () => {
      return await new Promise((resolve) => {
        return setTimeout(() => {
          resolve([
            ...mockBridgeQuotesNativeErc20Eth,
            ...mockBridgeQuotesNativeErc20Eth,
          ] as never);
        }, 10000);
      });
    });

    const quoteParams = {
      srcChainId: '0x1',
      destChainId: '0x10',
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
      destTokenAddress: '0x123',
      srcTokenAmount: '1000000000000000000',
      walletAddress: '0x123',
      slippage: 0.5,
    };
    const quoteRequest = {
      ...quoteParams,
    };
    await bridgeController.updateBridgeQuoteRequestParams(quoteParams);

    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);
    expect(hasSufficientBalanceSpy).not.toHaveBeenCalled();
    expect(startPollingSpy).toHaveBeenCalledWith({
      networkClientId: 'selectedNetworkClientId',
      updatedQuoteRequest: {
        ...quoteRequest,
        insufficientBal: true,
      },
    });

    // Loading state
    jest.advanceTimersByTime(1000);
    await flushPromises();

    // After first fetch
    jest.advanceTimersByTime(10000);
    await flushPromises();
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteRequest, insufficientBal: true },
        quotes: mockBridgeQuotesNativeErc20Eth,
        quotesLoadingStatus: 1,
        quotesRefreshCount: 1,
        quotesInitialLoadTime: 11000,
      }),
    );
    const firstFetchTime = bridgeController.state.quotesLastFetched;
    expect(firstFetchTime).toBeGreaterThan(0);
  });

  it('updateBridgeQuoteRequestParams should not trigger quote polling if request is invalid', async function () {
    const stopAllPollingSpy = jest.spyOn(bridgeController, 'stopAllPolling');
    const startPollingSpy = jest.spyOn(bridgeController, 'startPolling');
    messengerMock.call.mockReturnValue({
      address: '0x123',
      provider: jest.fn(),
    } as never);

    await bridgeController.updateBridgeQuoteRequestParams({
      srcChainId: 1,
      destChainId: 10,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
      destTokenAddress: '0x123',
      slippage: 0.5,
    });

    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).not.toHaveBeenCalled();

    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        quoteRequest: {
          srcChainId: 1,
          slippage: 0.5,
          srcTokenAddress: '0x0000000000000000000000000000000000000000',
          walletAddress: undefined,
          destChainId: 10,
          destTokenAddress: '0x123',
        },
        quotes: DEFAULT_BRIDGE_CONTROLLER_STATE.quotes,
        quotesLastFetched: DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLastFetched,
        quotesLoadingStatus:
          DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLoadingStatus,
      }),
    );
  });

  describe('getBridgeERC20Allowance', () => {
    it('should return the atomic allowance of the ERC20 token contract', async () => {
      (Contract as unknown as jest.Mock).mockImplementation(() => ({
        allowance: jest.fn(() => '100000000000000000000'),
      }));

      messengerMock.call.mockReturnValue({
        address: '0x123',
        provider: jest.fn(),
      } as never);

      const allowance = await bridgeController.getBridgeERC20Allowance(
        '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
        '0xa',
      );
      expect(allowance).toBe('100000000000000000000');
    });

    it('should throw an error when no provider is found', async () => {
      // Setup
      const mockMessenger = {
        call: jest.fn().mockImplementation((methodName) => {
          // eslint-disable-next-line jest/no-conditional-in-test
          if (methodName === 'NetworkController:getNetworkClientById') {
            return { provider: null };
          }
          // eslint-disable-next-line jest/no-conditional-in-test
          if (methodName === 'NetworkController:getState') {
            return { selectedNetworkClientId: 'testNetworkClientId' };
          }
          return undefined;
        }),
        registerActionHandler: jest.fn(),
        publish: jest.fn(),
        registerInitialEventPayload: jest.fn(),
      } as unknown as jest.Mocked<BridgeControllerMessenger>;

      const controller = new BridgeController({
        messenger: mockMessenger,
        clientId: BridgeClientId.EXTENSION,
        getLayer1GasFee: jest.fn(),
        fetchFn: mockFetchFn,
      });

      // Test
      await expect(
        controller.getBridgeERC20Allowance('0xContractAddress', '0x1'),
      ).rejects.toThrow('No provider found');
    });
  });

  it.each([
    [
      'should append l1GasFees if srcChain is 10 and srcToken is erc20',
      mockBridgeQuotesErc20Native as QuoteResponse[],
      bigIntToHex(BigInt('2608710388388') * 2n),
      12,
    ],
    [
      'should append l1GasFees if srcChain is 10 and srcToken is native',
      mockBridgeQuotesNativeErc20 as unknown as QuoteResponse[],
      bigIntToHex(BigInt('2608710388388')),
      2,
    ],
    [
      'should not append l1GasFees if srcChain is not 10',
      mockBridgeQuotesNativeErc20Eth as unknown as QuoteResponse[],
      undefined,
      0,
    ],
  ])(
    'updateBridgeQuoteRequestParams: %s',
    async (
      _testTitle: string,
      quoteResponse: QuoteResponse[],
      l1GasFeesInHexWei: Hex | undefined,
      getLayer1GasFeeMockCallCount: number,
    ) => {
      jest.useFakeTimers();
      const stopAllPollingSpy = jest.spyOn(bridgeController, 'stopAllPolling');
      const startPollingSpy = jest.spyOn(bridgeController, 'startPolling');
      const hasSufficientBalanceSpy = jest
        .spyOn(balanceUtils, 'hasSufficientBalance')
        .mockResolvedValue(false);
      messengerMock.call.mockReturnValue({
        address: '0x123',
        provider: jest.fn(),
        selectedNetworkClientId: 'selectedNetworkClientId',
      } as never);
      getLayer1GasFeeMock.mockResolvedValue('0x25F63418AA4');

      const fetchBridgeQuotesSpy = jest
        .spyOn(fetchUtils, 'fetchBridgeQuotes')
        .mockImplementationOnce(async () => {
          return await new Promise((resolve) => {
            return setTimeout(() => {
              resolve(quoteResponse as never);
            }, 1000);
          });
        });

      const quoteParams = {
        srcChainId: '0x10',
        destChainId: '0x1',
        srcTokenAddress: '0x4200000000000000000000000000000000000006',
        destTokenAddress: '0x0000000000000000000000000000000000000000',
        srcTokenAmount: '991250000000000000',
        walletAddress: 'eip:id/id:id/0x123',
        slippage: 0.5,
      };
      const quoteRequest = {
        ...quoteParams,
      };
      await bridgeController.updateBridgeQuoteRequestParams(quoteParams);

      expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
      expect(startPollingSpy).toHaveBeenCalledTimes(1);
      expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
      expect(startPollingSpy).toHaveBeenCalledWith({
        networkClientId: 'selectedNetworkClientId',
        updatedQuoteRequest: {
          ...quoteRequest,
          insufficientBal: true,
        },
      });

      expect(bridgeController.state).toStrictEqual(
        expect.objectContaining({
          quoteRequest,
          quotes: DEFAULT_BRIDGE_CONTROLLER_STATE.quotes,
          quotesLastFetched: DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLastFetched,
          quotesLoadingStatus:
            DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLoadingStatus,
        }),
      );

      // Loading state
      jest.advanceTimersByTime(500);
      await flushPromises();
      expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(1);
      expect(fetchBridgeQuotesSpy).toHaveBeenCalledWith(
        {
          ...quoteRequest,
          insufficientBal: true,
        },
        expect.any(AbortSignal),
        BridgeClientId.EXTENSION,
        mockFetchFn,
        BRIDGE_PROD_API_BASE_URL,
      );
      expect(bridgeController.state.quotesLastFetched).toBeNull();

      expect(bridgeController.state).toStrictEqual(
        expect.objectContaining({
          quoteRequest: { ...quoteRequest, insufficientBal: true },
          quotes: [],
          quotesLoadingStatus: 0,
        }),
      );

      // After first fetch
      jest.advanceTimersByTime(1500);
      await flushPromises();
      const { quotes } = bridgeController.state;
      expect(bridgeController.state).toStrictEqual(
        expect.objectContaining({
          quoteRequest: { ...quoteRequest, insufficientBal: true },
          quotesLoadingStatus: 1,
          quotesRefreshCount: 1,
        }),
      );
      quotes.forEach((quote) => {
        const expectedQuote = { ...quote, l1GasFeesInHexWei };
        // eslint-disable-next-line jest/prefer-strict-equal
        expect(quote).toEqual(expectedQuote);
      });

      const firstFetchTime = bridgeController.state.quotesLastFetched;
      expect(firstFetchTime).toBeGreaterThan(0);

      expect(getLayer1GasFeeMock).toHaveBeenCalledTimes(
        getLayer1GasFeeMockCallCount,
      );
    },
  );

  it('should handle abort signals in fetchBridgeQuotes', async () => {
    jest.useFakeTimers();
    const fetchBridgeQuotesSpy = jest.spyOn(fetchUtils, 'fetchBridgeQuotes');
    messengerMock.call.mockReturnValue({
      address: '0x123',
      provider: jest.fn(),
    } as never);

    jest.spyOn(balanceUtils, 'hasSufficientBalance').mockResolvedValue(true);

    // Mock fetchBridgeQuotes to throw AbortError
    fetchBridgeQuotesSpy.mockImplementation(async () => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      throw error;
    });

    const quoteParams = {
      srcChainId: '0x10',
      destChainId: '0x1',
      srcTokenAddress: '0x4200000000000000000000000000000000000006',
      destTokenAddress: '0x0000000000000000000000000000000000000000',
      srcTokenAmount: '991250000000000000',
      walletAddress: 'eip:id/id:id/0x123',
    };

    await bridgeController.updateBridgeQuoteRequestParams(quoteParams);

    // Advance timers to trigger fetch
    jest.advanceTimersByTime(1000);
    await flushPromises();

    // Verify state wasn't updated due to abort
    expect(bridgeController.state.quoteFetchError).toBeNull();
    expect(bridgeController.state.quotesLoadingStatus).toBe(0);
    expect(bridgeController.state.quotes).toStrictEqual([]);

    // Test reset abort
    fetchBridgeQuotesSpy.mockRejectedValueOnce('Reset controller state');

    await bridgeController.updateBridgeQuoteRequestParams(quoteParams);

    jest.advanceTimersByTime(1000);
    await flushPromises();

    // Verify state wasn't updated due to reset
    expect(bridgeController.state.quoteFetchError).toBeNull();
    expect(bridgeController.state.quotesLoadingStatus).toBe(0);
    expect(bridgeController.state.quotes).toStrictEqual([]);
  });

  const getFeeSnapCalls = mockBridgeQuotesSolErc20.map(({ trade }) => [
    'SnapController:handleRequest',
    {
      snapId: 'npm:@metamask/solana-snap',
      origin: 'metamask',
      handler: HandlerType.OnRpcRequest,
      request: {
        method: 'getFeeForTransaction',
        params: {
          transaction: trade,
          scope: 'mainnet',
        },
      },
    },
  ]);

  it.each([
    [
      'should append solanaFees for Solana quotes',
      mockBridgeQuotesSolErc20 as unknown as QuoteResponse[],
      '5000',
      getFeeSnapCalls,
    ],
    [
      'should not append solanaFees if selected account is not a snap',
      mockBridgeQuotesSolErc20 as unknown as QuoteResponse[],
      undefined,
      [],
      false,
    ],
    [
      'should handle mixed Solana and non-Solana quotes by not appending fees',
      [
        ...mockBridgeQuotesSolErc20,
        ...mockBridgeQuotesErc20Native,
      ] as unknown as QuoteResponse[],
      undefined,
      [],
    ],
  ])(
    'updateBridgeQuoteRequestParams: %s',
    async (
      _testTitle: string,
      quoteResponse: QuoteResponse[],
      expectedFees: string | undefined,
      expectedSnapCalls: typeof getFeeSnapCalls,
      isSnapAccount = true,
    ) => {
      jest.useFakeTimers();
      const stopAllPollingSpy = jest.spyOn(bridgeController, 'stopAllPolling');
      const startPollingSpy = jest.spyOn(bridgeController, 'startPolling');
      const hasSufficientBalanceSpy = jest
        .spyOn(balanceUtils, 'hasSufficientBalance')
        .mockResolvedValue(false);

      messengerMock.call.mockImplementation(
        (
          ...args: Parameters<BridgeControllerMessenger['call']>
        ): ReturnType<BridgeControllerMessenger['call']> => {
          const actionType = args[0];

          // eslint-disable-next-line jest/no-conditional-in-test
          if (
            // eslint-disable-next-line jest/no-conditional-in-test
            actionType === 'AccountsController:getSelectedMultichainAccount' &&
            isSnapAccount
          ) {
            return {
              address: '0x123',
              metadata: {
                snap: {
                  id: 'npm:@metamask/solana-snap',
                  name: 'Solana Snap',
                  enabled: true,
                },
              } as never,
              options: {
                scope: 'mainnet',
              },
            } as never;
          }
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'SnapController:handleRequest') {
            return { value: '5000' } as never;
          }
          return {
            provider: jest.fn() as never,
            selectedNetworkClientId: 'selectedNetworkClientId',
          } as never;
        },
      );

      const fetchBridgeQuotesSpy = jest
        .spyOn(fetchUtils, 'fetchBridgeQuotes')
        .mockImplementation(async () => {
          return await new Promise((resolve) => {
            return setTimeout(() => {
              resolve(quoteResponse as never);
            }, 1000);
          });
        });

      const quoteParams = {
        srcChainId: SolScope.Mainnet,
        destChainId: '1',
        srcTokenAddress: 'NATIVE',
        destTokenAddress: '0x0000000000000000000000000000000000000000',
        srcTokenAmount: '1000000',
        walletAddress: '0x123',
        slippage: 0.5,
      };

      await bridgeController.updateBridgeQuoteRequestParams(quoteParams);

      expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
      expect(startPollingSpy).toHaveBeenCalledTimes(1);
      expect(hasSufficientBalanceSpy).not.toHaveBeenCalled();

      // Loading state
      jest.advanceTimersByTime(500);
      await flushPromises();
      expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(1);

      // After fetch completes
      jest.advanceTimersByTime(1500);
      await flushPromises();

      const { quotes } = bridgeController.state;
      expect(bridgeController.state).toStrictEqual(
        expect.objectContaining({
          quotesLoadingStatus: 1,
          quotesRefreshCount: 1,
        }),
      );

      // Verify Solana fees
      quotes.forEach((quote) => {
        expect(quote.solanaFeesInLamports).toBe(expectedFees);
      });

      // Verify snap interaction
      const snapCalls = messengerMock.call.mock.calls.filter(
        ([methodName]) => methodName === 'SnapController:handleRequest',
      );

      expect(snapCalls).toMatchObject(expectedSnapCalls);
    },
  );
  //   jest.useFakeTimers();

  //   // Mock account without snap metadata
  //   messengerMock.call.mockImplementation((methodName) => {
  //     if (methodName === 'AccountsController:getSelectedMultichainAccount') {
  //       return {
  //         address: '0x123',
  //         options: {
  //           scope: 'mainnet',
  //         },
  //       };
  //     }
  //     return {
  //       provider: jest.fn(),
  //       selectedNetworkClientId: 'selectedNetworkClientId',
  //     };
  //   });

  //   const solanaQuotes = [
  //     {
  //       quote: {
  //         srcChainId: 'solana:101',
  //         // ... other required quote fields
  //       },
  //       trade: 'base64EncodedSolanaTransaction',
  //     },
  //   ] as QuoteResponse[];

  //   jest
  //     .spyOn(fetchUtils, 'fetchBridgeQuotes')
  //     .mockResolvedValueOnce(solanaQuotes as never);

  //   await bridgeController.updateBridgeQuoteRequestParams({
  //     srcChainId: 'solana:101',
  //     destChainId: '1',
  //     srcTokenAmount: '1000000',
  //     walletAddress: '0x123',
  //   });

  //   jest.advanceTimersByTime(2000);
  //   await flushPromises();

  //   const { quotes } = bridgeController.state;
  //   expect(quotes[0]).not.toHaveProperty('solanaFeesInLamports');
  //   expect(messengerMock.call).not.toHaveBeenCalledWith(
  //     'SnapController:handleRequest',
  //     expect.any(Object),
  //   );
  // });
});
