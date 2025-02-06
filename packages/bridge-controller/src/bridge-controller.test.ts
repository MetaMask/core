import type { Hex } from '@metamask/utils';
import { bigIntToHex } from '@metamask/utils';
import { Contract } from 'ethers';
import nock from 'nock';

import BridgeController from './bridge-controller';
import { DEFAULT_BRIDGE_CONTROLLER_STATE } from './constants';
import { CHAIN_IDS } from './constants/chains';
import { SWAPS_API_V2_BASE_URL } from './constants/swaps';
import mockBridgeQuotesErc20Native from './test/mock-quotes-erc20-native.json';
import mockBridgeQuotesNativeErc20Eth from './test/mock-quotes-native-erc20-eth.json';
import mockBridgeQuotesNativeErc20 from './test/mock-quotes-native-erc20.json';
import { flushPromises } from './test/utils';
import type { BridgeControllerMessenger, QuoteResponse } from './types';
import { getBridgeApiBaseUrl } from './utils';
import * as balanceUtils from './utils/balance';
import * as fetchUtils from './utils/fetch';

const EMPTY_INIT_STATE = {
  bridgeState: DEFAULT_BRIDGE_CONTROLLER_STATE,
};

const messengerMock = {
  call: jest.fn(),
  registerActionHandler: jest.fn(),
  registerInitialEventPayload: jest.fn(),
  publish: jest.fn(),
} as unknown as jest.Mocked<BridgeControllerMessenger>;

jest.mock('ethers', () => {
  return {
    ...jest.requireActual('ethers'),
    Contract: jest.fn(),
    BrowserProvider: jest.fn(),
  };
});
const getLayer1GasFeeMock = jest.fn();

describe('BridgeController', function () {
  let bridgeController: BridgeController;

  beforeAll(function () {
    bridgeController = new BridgeController({
      messenger: messengerMock,
      getLayer1GasFee: getLayer1GasFeeMock,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();

    nock(getBridgeApiBaseUrl())
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
    nock(getBridgeApiBaseUrl())
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
    const expectedFeatureFlagsResponse = {
      extensionConfig: {
        maxRefreshCount: 3,
        refreshRate: 3,
        support: true,
        chains: {
          [CHAIN_IDS.OPTIMISM]: { isActiveSrc: true, isActiveDest: false },
          [CHAIN_IDS.SCROLL]: { isActiveSrc: true, isActiveDest: false },
          [CHAIN_IDS.POLYGON]: { isActiveSrc: false, isActiveDest: true },
          [CHAIN_IDS.ARBITRUM]: { isActiveSrc: false, isActiveDest: true },
        },
      },
    };
    expect(bridgeController.state).toStrictEqual(EMPTY_INIT_STATE);

    const setIntervalLengthSpy = jest.spyOn(
      bridgeController,
      'setIntervalLength',
    );

    await bridgeController.setBridgeFeatureFlags();
    expect(bridgeController.state.bridgeState.bridgeFeatureFlags).toStrictEqual(
      expectedFeatureFlagsResponse,
    );
    expect(setIntervalLengthSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalLengthSpy).toHaveBeenCalledWith(3);

    bridgeController.resetState();
    expect(bridgeController.state.bridgeState).toStrictEqual(
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
    expect(bridgeController.state.bridgeState.quoteRequest).toStrictEqual({
      srcChainId: 1,
      slippage: 0.5,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
      walletAddress: undefined,
    });

    await bridgeController.updateBridgeQuoteRequestParams({ destChainId: 10 });
    expect(bridgeController.state.bridgeState.quoteRequest).toStrictEqual({
      destChainId: 10,
      slippage: 0.5,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
      walletAddress: undefined,
    });

    await bridgeController.updateBridgeQuoteRequestParams({
      destChainId: undefined,
    });
    expect(bridgeController.state.bridgeState.quoteRequest).toStrictEqual({
      destChainId: undefined,
      slippage: 0.5,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
      walletAddress: undefined,
    });

    await bridgeController.updateBridgeQuoteRequestParams({
      srcTokenAddress: undefined,
    });
    expect(bridgeController.state.bridgeState.quoteRequest).toStrictEqual({
      slippage: 0.5,
      srcTokenAddress: undefined,
      walletAddress: undefined,
    });

    await bridgeController.updateBridgeQuoteRequestParams({
      srcTokenAmount: '100000',
      destTokenAddress: '0x123',
      slippage: 0.5,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
      walletAddress: undefined,
    });
    expect(bridgeController.state.bridgeState.quoteRequest).toStrictEqual({
      srcTokenAmount: '100000',
      destTokenAddress: '0x123',
      slippage: 0.5,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
      walletAddress: undefined,
    });

    await bridgeController.updateBridgeQuoteRequestParams({
      srcTokenAddress: '0x2ABC',
    });
    expect(bridgeController.state.bridgeState.quoteRequest).toStrictEqual({
      slippage: 0.5,
      srcTokenAddress: '0x2ABC',
      walletAddress: undefined,
    });

    bridgeController.resetState();
    expect(bridgeController.state.bridgeState.quoteRequest).toStrictEqual({
      slippage: 0.5,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
      walletAddress: undefined,
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
      srcChainId: 1,
      destChainId: 10,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
      destTokenAddress: '0x123',
      srcTokenAmount: '1000000000000000000',
    };
    const quoteRequest = {
      ...quoteParams,
      slippage: 0.5,
      walletAddress: '0x123',
    };
    await bridgeController.updateBridgeQuoteRequestParams(quoteParams);

    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);
    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledWith({
      networkClientId: expect.anything(),
      updatedQuoteRequest: {
        ...quoteRequest,
        insufficientBal: false,
      },
    });

    expect(bridgeController.state.bridgeState).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteRequest, walletAddress: undefined },
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
    );
    expect(
      bridgeController.state.bridgeState.quotesLastFetched,
    ).toBeUndefined();

    expect(bridgeController.state.bridgeState).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteRequest, insufficientBal: false },
        quotes: [],
        quotesLoadingStatus: 0,
      }),
    );

    // After first fetch
    jest.advanceTimersByTime(10000);
    await flushPromises();
    expect(bridgeController.state.bridgeState).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteRequest, insufficientBal: false },
        quotes: mockBridgeQuotesNativeErc20Eth,
        quotesLoadingStatus: 1,
      }),
    );
    const firstFetchTime = bridgeController.state.bridgeState.quotesLastFetched;
    expect(firstFetchTime).toBeGreaterThan(0);

    // After 2nd fetch
    jest.advanceTimersByTime(50000);
    await flushPromises();
    expect(bridgeController.state.bridgeState).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteRequest, insufficientBal: false },
        quotes: [
          ...mockBridgeQuotesNativeErc20Eth,
          ...mockBridgeQuotesNativeErc20Eth,
        ],
        quotesLoadingStatus: 1,
        quoteFetchError: undefined,
        quotesRefreshCount: 2,
      }),
    );
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(2);
    const secondFetchTime =
      bridgeController.state.bridgeState.quotesLastFetched;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(secondFetchTime).toBeGreaterThan(firstFetchTime!);

    // After 3nd fetch throws an error
    jest.advanceTimersByTime(50000);
    await flushPromises();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(3);
    expect(bridgeController.state.bridgeState).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteRequest, insufficientBal: false },
        quotes: [
          ...mockBridgeQuotesNativeErc20Eth,
          ...mockBridgeQuotesNativeErc20Eth,
        ],
        quotesLoadingStatus: 2,
        quoteFetchError: 'Network error',
        quotesRefreshCount: 3,
      }),
    );
    expect(
      bridgeController.state.bridgeState.quotesLastFetched,
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
      srcChainId: 1,
      destChainId: 10,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
      destTokenAddress: '0x123',
      srcTokenAmount: '1000000000000000000',
    };
    const quoteRequest = {
      ...quoteParams,
      slippage: 0.5,
      walletAddress: '0x123',
    };
    await bridgeController.updateBridgeQuoteRequestParams(quoteParams);

    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);
    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledWith({
      networkClientId: expect.anything(),
      updatedQuoteRequest: {
        ...quoteRequest,
        insufficientBal: true,
      },
    });

    expect(bridgeController.state.bridgeState).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteRequest, walletAddress: undefined },
        quotes: DEFAULT_BRIDGE_CONTROLLER_STATE.quotes,
        quotesLastFetched: DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLastFetched,
        quotesInitialLoadTime: undefined,
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
    );
    expect(
      bridgeController.state.bridgeState.quotesLastFetched,
    ).toBeUndefined();

    expect(bridgeController.state.bridgeState).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteRequest, insufficientBal: true },
        quotes: [],
        quotesLoadingStatus: 0,
      }),
    );

    // After first fetch
    jest.advanceTimersByTime(10000);
    await flushPromises();
    expect(bridgeController.state.bridgeState).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteRequest, insufficientBal: true },
        quotes: mockBridgeQuotesNativeErc20Eth,
        quotesLoadingStatus: 1,
        quotesRefreshCount: 1,
        quotesInitialLoadTime: 11000,
      }),
    );
    const firstFetchTime = bridgeController.state.bridgeState.quotesLastFetched;
    expect(firstFetchTime).toBeGreaterThan(0);

    // After 2nd fetch
    jest.advanceTimersByTime(50000);
    await flushPromises();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(1);
    expect(bridgeController.state.bridgeState).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteRequest, insufficientBal: true },
        quotes: mockBridgeQuotesNativeErc20Eth,
        quotesLoadingStatus: 1,
        quotesRefreshCount: 1,
        quotesInitialLoadTime: 11000,
      }),
    );
    const secondFetchTime =
      bridgeController.state.bridgeState.quotesLastFetched;
    expect(secondFetchTime).toStrictEqual(firstFetchTime);
    expect(getLayer1GasFeeMock).not.toHaveBeenCalled();
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
    });

    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).not.toHaveBeenCalled();

    expect(bridgeController.state.bridgeState).toStrictEqual(
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
        srcChainId: 10,
        destChainId: 1,
        srcTokenAddress: '0x4200000000000000000000000000000000000006',
        destTokenAddress: '0x0000000000000000000000000000000000000000',
        srcTokenAmount: '991250000000000000',
      };
      const quoteRequest = {
        ...quoteParams,
        slippage: 0.5,
        walletAddress: '0x123',
      };
      await bridgeController.updateBridgeQuoteRequestParams(quoteParams);

      expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
      expect(startPollingSpy).toHaveBeenCalledTimes(1);
      expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
      expect(startPollingSpy).toHaveBeenCalledWith({
        networkClientId: expect.anything(),
        updatedQuoteRequest: {
          ...quoteRequest,
          insufficientBal: true,
        },
      });

      expect(bridgeController.state.bridgeState).toStrictEqual(
        expect.objectContaining({
          quoteRequest: { ...quoteRequest, walletAddress: undefined },
          quotes: DEFAULT_BRIDGE_CONTROLLER_STATE.quotes,
          quotesLastFetched: DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLastFetched,
          quotesLoadingStatus:
            DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLoadingStatus,
        }),
      );

      // // Loading state
      jest.advanceTimersByTime(500);
      await flushPromises();
      expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(1);
      expect(fetchBridgeQuotesSpy).toHaveBeenCalledWith(
        {
          ...quoteRequest,
          insufficientBal: true,
        },
        expect.any(AbortSignal),
      );
      expect(
        bridgeController.state.bridgeState.quotesLastFetched,
      ).toBeUndefined();

      expect(bridgeController.state.bridgeState).toStrictEqual(
        expect.objectContaining({
          quoteRequest: { ...quoteRequest, insufficientBal: true },
          quotes: [],
          quotesLoadingStatus: 0,
        }),
      );

      // After first fetch
      jest.advanceTimersByTime(1500);
      await flushPromises();
      const { quotes } = bridgeController.state.bridgeState;
      expect(bridgeController.state.bridgeState).toStrictEqual(
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

      const firstFetchTime =
        bridgeController.state.bridgeState.quotesLastFetched;
      expect(firstFetchTime).toBeGreaterThan(0);

      expect(getLayer1GasFeeMock).toHaveBeenCalledTimes(
        getLayer1GasFeeMockCallCount,
      );
    },
  );
});
