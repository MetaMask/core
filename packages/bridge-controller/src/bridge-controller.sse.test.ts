import { BigNumber } from '@ethersproject/bignumber';
import * as ethersContractUtils from '@ethersproject/contracts';
import { SolScope } from '@metamask/keyring-api';
import { abiERC20 } from '@metamask/metamask-eth-abis';

import { BridgeController } from './bridge-controller';
import {
  BridgeClientId,
  BRIDGE_PROD_API_BASE_URL,
  DEFAULT_BRIDGE_CONTROLLER_STATE,
  ETH_USDT_ADDRESS,
} from './constants/bridge';
import { ChainId, RequestStatus } from './types';
import type { BridgeControllerMessenger, QuoteResponse, TxData } from './types';
import * as balanceUtils from './utils/balance';
import { formatChainIdToDec } from './utils/caip-formatters';
import * as featureFlagUtils from './utils/feature-flags';
import * as fetchUtils from './utils/fetch';
import { flushPromises } from '../../../tests/helpers';
import mockBridgeQuotesErc20Erc20 from '../tests/mock-quotes-erc20-erc20.json';
import mockBridgeQuotesNativeErc20Eth from '../tests/mock-quotes-native-erc20-eth.json';
import mockBridgeQuotesNativeErc20 from '../tests/mock-quotes-native-erc20.json';
import {
  advanceToNthTimer,
  advanceToNthTimerThenFlush,
  mockSseEventSource,
  mockSseEventSourceWithMultipleDelays,
  mockSseServerError,
} from '../tests/mock-sse';

const FIRST_FETCH_DELAY = 4000;
const SECOND_FETCH_DELAY = 9000;
const THIRD_FETCH_DELAY = 2000;
const FOURTH_FETCH_DELAY = 3000;

const quoteRequest = {
  srcChainId: '0x1',
  destChainId: SolScope.Mainnet,
  srcTokenAddress: '0x0000000000000000000000000000000000000000',
  destTokenAddress: '123d1',
  srcTokenAmount: '1000000000000000000',
  slippage: 0.5,
  walletAddress: '0x30E8ccaD5A980BDF30447f8c2C48e70989D9d294',
  destWalletAddress: 'SolanaWalletAddres1234',
  resetApproval: false,
};
const metricsContext = {
  token_symbol_source: 'ETH',
  token_symbol_destination: 'USDC',
  usd_amount_source: 100,
  stx_enabled: true,
  security_warnings: [],
  warnings: [],
};

const assetExchangeRates = {
  'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': {
    exchangeRate: undefined,
    usdExchangeRate: '100',
  },
};

describe('BridgeController SSE', function () {
  let bridgeController: BridgeController,
    fetchAssetPricesSpy: jest.SpyInstance,
    stopAllPollingSpy: jest.SpyInstance,
    startPollingSpy: jest.SpyInstance,
    hasSufficientBalanceSpy: jest.SpyInstance,
    fetchBridgeQuotesSpy: jest.SpyInstance,
    consoleLogSpy: jest.SpyInstance;

  const messengerMock = {
    call: jest.fn(),
    registerActionHandler: jest.fn(),
    registerInitialEventPayload: jest.fn(),
    publish: jest.fn(),
  } as unknown as jest.Mocked<BridgeControllerMessenger>;
  const getLayer1GasFeeMock = jest.fn();
  const mockFetchFn = jest.fn();
  const trackMetaMetricsFn = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.resetAllMocks();

    fetchAssetPricesSpy = jest
      .spyOn(fetchUtils, 'fetchAssetPrices')
      .mockResolvedValue({
        'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': {
          usd: '100',
        },
      });
    getLayer1GasFeeMock.mockResolvedValue('0x1');
    messengerMock.call.mockImplementation(
      (...args: Parameters<BridgeControllerMessenger['call']>) => {
        switch (args[0]) {
          case 'AuthenticationController:getBearerToken':
            return 'AUTH_TOKEN';
          default:
            return {
              address: '0x123',
              provider: jest.fn(),
              currencyRates: {},
              marketData: {},
              conversionRates: {},
            };
        }
      },
    );
    jest.spyOn(featureFlagUtils, 'getBridgeFeatureFlags').mockReturnValue({
      minimumVersion: '0.0.0',
      maxRefreshCount: 5,
      refreshRate: 30000,
      support: true,
      sse: {
        enabled: true,
        minimumVersion: '13.8.0',
      },
      chains: {
        '10': { isActiveSrc: true, isActiveDest: false },
        '534352': { isActiveSrc: true, isActiveDest: false },
        '137': { isActiveSrc: false, isActiveDest: true },
        '42161': { isActiveSrc: false, isActiveDest: true },
        [ChainId.SOLANA]: {
          isActiveSrc: true,
          isActiveDest: true,
        },
      },
      chainRanking: [{ chainId: 'eip155:1' as const, name: 'Ethereum' }],
    });

    bridgeController = new BridgeController({
      messenger: messengerMock,
      getLayer1GasFee: getLayer1GasFeeMock,
      clientId: BridgeClientId.EXTENSION,
      fetchFn: mockFetchFn,
      trackMetaMetricsFn,
      clientVersion: '13.8.0',
    });

    jest.useFakeTimers();
    stopAllPollingSpy = jest.spyOn(bridgeController, 'stopAllPolling');
    startPollingSpy = jest.spyOn(bridgeController, 'startPolling');
    hasSufficientBalanceSpy = jest
      .spyOn(balanceUtils, 'hasSufficientBalance')
      .mockResolvedValue(true);
    fetchBridgeQuotesSpy = jest.spyOn(fetchUtils, 'fetchBridgeQuoteStream');
    consoleLogSpy = jest.spyOn(console, 'log');
  });

  it('should trigger quote polling if request is valid', async function () {
    mockFetchFn.mockImplementationOnce(async () => {
      return mockSseEventSource(mockBridgeQuotesNativeErc20 as QuoteResponse[]);
    });
    await bridgeController.updateBridgeQuoteRequestParams(
      quoteRequest,
      metricsContext,
    );

    // Before polling starts
    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);
    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledWith({
      updatedQuoteRequest: {
        ...quoteRequest,
        insufficientBal: false,
        resetApproval: false,
      },
      context: metricsContext,
    });
    expect(fetchAssetPricesSpy).toHaveBeenCalledTimes(0);
    const expectedState = {
      ...DEFAULT_BRIDGE_CONTROLLER_STATE,
      quoteRequest,
      quotesLoadingStatus: RequestStatus.LOADING,
    };
    expect(bridgeController.state).toStrictEqual(expectedState);

    // Loading state
    jest.advanceTimersByTime(1000);
    await advanceToNthTimerThenFlush();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledWith(
      mockFetchFn,
      {
        ...quoteRequest,
        insufficientBal: false,
        resetApproval: false,
      },
      expect.any(AbortSignal),
      BridgeClientId.EXTENSION,
      'AUTH_TOKEN',
      BRIDGE_PROD_API_BASE_URL,
      {
        onValidationFailure: expect.any(Function),
        onValidQuoteReceived: expect.any(Function),
        onClose: expect.any(Function),
      },
      '13.8.0',
    );
    const { quotesLastFetched: t1, ...stateWithoutTimestamp } =
      bridgeController.state;
    // eslint-disable-next-line jest/no-restricted-matchers
    expect(stateWithoutTimestamp).toMatchSnapshot();
    expect(t1).toBeCloseTo(Date.now() - 1000);

    // After first fetch
    jest.advanceTimersByTime(5000);
    await flushPromises();
    expect(fetchAssetPricesSpy).toHaveBeenCalledTimes(1);
    expect(bridgeController.state).toStrictEqual({
      ...expectedState,
      quotesInitialLoadTime: 6000,
      quoteRequest: {
        ...quoteRequest,
        insufficientBal: false,
        resetApproval: false,
      },
      quotes: mockBridgeQuotesNativeErc20.map((quote) => ({
        ...quote,
        l1GasFeesInHexWei: '0x1',
        resetApproval: undefined,
      })),
      quotesRefreshCount: 1,
      quotesLoadingStatus: 1,
      quotesLastFetched: t1,
      assetExchangeRates,
    });
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenCalledTimes(0);
    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
    expect(getLayer1GasFeeMock).toHaveBeenCalledTimes(2);
    // eslint-disable-next-line jest/no-restricted-matchers
    expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
  });

  it.each([
    [
      'swapping',
      '1',
      '0x1',
      '0x095ea7b3000000000000000000000000881d40237659c251811cec9c364ef91dc08d300c0000000000000000000000000000000000000000000000000000000000000000',
    ],
    [
      'bridging',
      '1',
      SolScope.Mainnet,
      '0x095ea7b30000000000000000000000000439e60f02a8900a951603950d8d4527f400c3f10000000000000000000000000000000000000000000000000000000000000000',
    ],
    ['swapping', '0', '0x1', undefined, false, 1],
  ])(
    'should append resetApproval when %s USDT on Ethereum',
    async function (
      _: string,
      allowance: string,
      destChainId: string,
      tradeData?: string,
      resetApproval: boolean = true,
      mockContractCalls: number = 3,
      srcTokenAddress: string = ETH_USDT_ADDRESS,
    ) {
      const mockUSDTQuoteResponse = mockBridgeQuotesErc20Erc20.map((quote) => ({
        ...quote,
        quote: {
          ...quote.quote,
          srcTokenAddress,
          srcChainId: 1,
          destChainId: formatChainIdToDec(destChainId),
        },
      }));
      mockFetchFn.mockImplementationOnce(async () => {
        return mockSseEventSource(mockUSDTQuoteResponse as QuoteResponse[]);
      });

      const contractMock = new ethersContractUtils.Contract(
        ETH_USDT_ADDRESS,
        abiERC20,
      );
      const contractMockSpy = jest
        .spyOn(ethersContractUtils, 'Contract')
        .mockImplementation(() => {
          return {
            ...jest.requireActual('@ethersproject/contracts').Contract,
            interface: contractMock.interface,
            allowance: jest.fn().mockResolvedValue(BigNumber.from(allowance)),
          };
        });

      const usdtQuoteRequest = {
        ...quoteRequest,
        srcTokenAddress,
        srcChainId: '0x1',
        destChainId,
      };

      await bridgeController.updateBridgeQuoteRequestParams(
        usdtQuoteRequest,
        metricsContext,
      );

      // Before polling starts
      expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
      expect(startPollingSpy).toHaveBeenCalledTimes(1);
      expect(startPollingSpy).toHaveBeenCalledWith({
        updatedQuoteRequest: {
          ...usdtQuoteRequest,
          insufficientBal: false,
          resetApproval,
        },
        context: metricsContext,
      });
      const expectedState = {
        ...DEFAULT_BRIDGE_CONTROLLER_STATE,
        quoteRequest: usdtQuoteRequest,
        quotesLoadingStatus: RequestStatus.LOADING,
      };
      expect(bridgeController.state).toStrictEqual(expectedState);

      // Loading state
      jest.advanceTimersByTime(1000);
      await advanceToNthTimerThenFlush();
      expect(fetchBridgeQuotesSpy).toHaveBeenCalledWith(
        mockFetchFn,
        {
          ...usdtQuoteRequest,
          insufficientBal: false,
          resetApproval,
        },
        expect.any(AbortSignal),
        BridgeClientId.EXTENSION,
        'AUTH_TOKEN',
        BRIDGE_PROD_API_BASE_URL,
        {
          onValidationFailure: expect.any(Function),
          onValidQuoteReceived: expect.any(Function),
          onClose: expect.any(Function),
        },
        '13.8.0',
      );
      const { quotesLastFetched: t1, quoteRequest: stateQuoteRequest } =
        bridgeController.state;
      expect(stateQuoteRequest).toStrictEqual({
        ...usdtQuoteRequest,
        insufficientBal: false,
        resetApproval,
      });
      expect(t1).toBeCloseTo(Date.now() - 1000);

      // After first fetch
      jest.advanceTimersByTime(5000);
      await flushPromises();
      expect(bridgeController.state).toStrictEqual({
        ...expectedState,
        quotesInitialLoadTime: 6000,
        quoteRequest: {
          ...usdtQuoteRequest,
          insufficientBal: false,
          resetApproval,
        },
        quotes: mockUSDTQuoteResponse.map((quote) => ({
          ...quote,
          resetApproval: tradeData
            ? {
                ...quote.approval,
                data: tradeData,
              }
            : undefined,
        })),
        quotesRefreshCount: 1,
        quotesLoadingStatus: 1,
        quotesLastFetched: t1,
        assetExchangeRates,
      });
      expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledTimes(0);
      expect(getLayer1GasFeeMock).not.toHaveBeenCalled();
      expect(contractMockSpy.mock.calls).toHaveLength(mockContractCalls);
    },
  );

  it('should use resetApproval and insufficientBal fallback values if provider is not found', async function () {
    messengerMock.call.mockImplementation(
      (...args: Parameters<BridgeControllerMessenger['call']>) => {
        if (args[0] === 'AuthenticationController:getBearerToken') {
          return 'AUTH_TOKEN';
        }
        return {
          address: '0x123',
          provider: undefined,
          currencyRates: {},
          marketData: {},
          conversionRates: {},
        } as never;
      },
    );
    const mockUSDTQuoteResponse = mockBridgeQuotesErc20Erc20.map((quote) => ({
      ...quote,
      quote: {
        ...quote.quote,
        srcTokenAddress: ETH_USDT_ADDRESS,
        srcChainId: 1,
      },
    }));
    mockFetchFn.mockImplementationOnce(async () => {
      return mockSseEventSource(mockUSDTQuoteResponse as QuoteResponse[]);
    });

    const contractMock = new ethersContractUtils.Contract(
      ETH_USDT_ADDRESS,
      abiERC20,
    );
    const contractMockSpy = jest
      .spyOn(ethersContractUtils, 'Contract')
      .mockImplementation(() => {
        return {
          ...jest.requireActual('@ethersproject/contracts').Contract,
          interface: contractMock.interface,
          allowance: jest.fn().mockResolvedValue(BigNumber.from('1')),
        };
      });

    const usdtQuoteRequest = {
      ...quoteRequest,
      srcTokenAddress: ETH_USDT_ADDRESS,
      srcChainId: '0x1',
    };

    await bridgeController.updateBridgeQuoteRequestParams(
      usdtQuoteRequest,
      metricsContext,
    );

    // Before polling starts
    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledWith({
      updatedQuoteRequest: {
        ...usdtQuoteRequest,
        insufficientBal: true,
        resetApproval: true,
      },
      context: metricsContext,
    });
    const expectedState = {
      ...DEFAULT_BRIDGE_CONTROLLER_STATE,
      quoteRequest: usdtQuoteRequest,
      quotesLoadingStatus: RequestStatus.LOADING,
    };
    expect(bridgeController.state).toStrictEqual(expectedState);

    // Loading state
    jest.advanceTimersByTime(1000);
    // Wait for JWT token retrieval
    await advanceToNthTimerThenFlush();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledWith(
      mockFetchFn,
      {
        ...usdtQuoteRequest,
        insufficientBal: true,
        resetApproval: true,
      },
      expect.any(AbortSignal),
      BridgeClientId.EXTENSION,
      'AUTH_TOKEN',
      BRIDGE_PROD_API_BASE_URL,
      {
        onValidationFailure: expect.any(Function),
        onValidQuoteReceived: expect.any(Function),
        onClose: expect.any(Function),
      },
      '13.8.0',
    );
    const { quotesLastFetched: t1, quoteRequest: stateQuoteRequest } =
      bridgeController.state;
    expect(stateQuoteRequest).toStrictEqual({
      ...usdtQuoteRequest,
      insufficientBal: true,
      resetApproval: true,
    });
    expect(t1).toBeCloseTo(Date.now() - 1000);

    // After first fetch
    jest.advanceTimersByTime(5000);
    await flushPromises();
    expect(bridgeController.state).toStrictEqual({
      ...expectedState,
      quotesInitialLoadTime: 6000,
      quoteRequest: {
        ...usdtQuoteRequest,
        insufficientBal: true,
        resetApproval: true,
      },
      quotes: mockUSDTQuoteResponse.map((quote) => ({
        ...quote,
        resetApproval: {
          ...quote.approval,
          data: '0x095ea7b30000000000000000000000000439e60f02a8900a951603950d8d4527f400c3f10000000000000000000000000000000000000000000000000000000000000000',
        },
      })),
      quotesRefreshCount: 1,
      quotesLoadingStatus: 1,
      quotesLastFetched: t1,
      assetExchangeRates,
    });
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenCalledTimes(0);
    expect(getLayer1GasFeeMock).not.toHaveBeenCalled();
    expect(contractMockSpy.mock.calls).toHaveLength(2);
  });

  it('should replace all stale quotes after a refresh and first quote is received', async function () {
    mockFetchFn.mockImplementationOnce(async () => {
      return mockSseEventSource(
        mockBridgeQuotesNativeErc20 as QuoteResponse[],
        FIRST_FETCH_DELAY,
      );
    });
    mockFetchFn.mockImplementationOnce(async () => {
      return mockSseEventSourceWithMultipleDelays(
        mockBridgeQuotesNativeErc20Eth as never,
        SECOND_FETCH_DELAY,
      );
    });
    await bridgeController.updateBridgeQuoteRequestParams(
      quoteRequest,
      metricsContext,
    );
    // Wait for JWT token retrieval
    await advanceToNthTimerThenFlush();
    // 1st fetch
    jest.advanceTimersByTime(FIRST_FETCH_DELAY);
    await flushPromises();
    expect(bridgeController.state.quotes).toStrictEqual(
      mockBridgeQuotesNativeErc20.map((quote) => ({
        ...quote,
        l1GasFeesInHexWei: '0x1',
        resetApproval: undefined,
      })),
    );
    const t1 = bridgeController.state.quotesLastFetched;
    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);

    // Wait for next polling interval
    jest.advanceTimersToNextTimer();
    await flushPromises();

    const expectedState = {
      ...DEFAULT_BRIDGE_CONTROLLER_STATE,
      quotesInitialLoadTime: FIRST_FETCH_DELAY,
      quoteRequest: {
        ...quoteRequest,
        insufficientBal: false,
        resetApproval: false,
      },
      quotes: [mockBridgeQuotesNativeErc20Eth[0]].map((quote) => ({
        ...quote,
        resetApproval: undefined,
      })),
      quotesLoadingStatus: RequestStatus.LOADING,
      quotesRefreshCount: 1,
      assetExchangeRates,
    };

    // 2nd fetch request's first server event
    jest.advanceTimersToNextTimer();
    jest.advanceTimersByTime(SECOND_FETCH_DELAY - 1000);
    await flushPromises();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(2);
    expect(bridgeController.state).toStrictEqual({
      ...expectedState,
      quotesLastFetched: expect.any(Number),
    });
    const t2 = bridgeController.state.quotesLastFetched;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(t2).toBeGreaterThan(t1!);

    // After 2nd server event
    await advanceToNthTimerThenFlush();
    expect(bridgeController.state).toStrictEqual({
      ...expectedState,
      quotes: mockBridgeQuotesNativeErc20Eth.map((quote) => ({
        ...quote,
        resetApproval: undefined,
      })),
      quotesLastFetched: t2,
      quotesRefreshCount: 2,
      quotesLoadingStatus: RequestStatus.FETCHED,
    });

    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(2);
    expect(consoleLogSpy).toHaveBeenCalledTimes(0);
    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
    expect(getLayer1GasFeeMock).toHaveBeenCalledTimes(2);
    // eslint-disable-next-line jest/no-restricted-matchers
    expect(trackMetaMetricsFn.mock.calls.at(-1)).toMatchSnapshot();
  });

  it('should reset quotes list if quote refresh fails', async function () {
    mockFetchFn.mockImplementationOnce(async () => {
      return mockSseEventSource(
        mockBridgeQuotesNativeErc20 as never,
        FIRST_FETCH_DELAY,
      );
    });
    mockFetchFn.mockImplementationOnce(async () => {
      return mockSseEventSourceWithMultipleDelays(
        mockBridgeQuotesNativeErc20Eth as never,
        SECOND_FETCH_DELAY,
      );
    });
    mockFetchFn.mockRejectedValueOnce('Network error');
    await bridgeController.updateBridgeQuoteRequestParams(
      quoteRequest,
      metricsContext,
    );

    consoleLogSpy.mockImplementationOnce(jest.fn());
    // Wait for JWT token retrieval
    await advanceToNthTimerThenFlush();
    // 1st fetch
    jest.advanceTimersByTime(FIRST_FETCH_DELAY);
    await flushPromises();
    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);
    expect(bridgeController.state.quotesInitialLoadTime).toBe(
      FIRST_FETCH_DELAY,
    );

    // 2nd fetch
    await advanceToNthTimerThenFlush();
    await advanceToNthTimerThenFlush(2);
    expect(bridgeController.state.quotesRefreshCount).toBe(2);
    expect(bridgeController.state.quotesInitialLoadTime).toBe(
      FIRST_FETCH_DELAY,
    );
    expect(bridgeController.state.quotes).toStrictEqual(
      mockBridgeQuotesNativeErc20Eth.map((quote) => ({
        ...quote,
        resetApproval: undefined,
      })),
    );
    const t2 = bridgeController.state.quotesLastFetched;

    // 3nd fetch throws an error
    await advanceToNthTimerThenFlush();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(3);
    expect(bridgeController.state).toStrictEqual({
      ...DEFAULT_BRIDGE_CONTROLLER_STATE,
      quotesInitialLoadTime: FIRST_FETCH_DELAY,
      quoteRequest: {
        ...quoteRequest,
        insufficientBal: false,
        resetApproval: false,
      },
      quotes: [],
      quotesLoadingStatus: 2,
      quoteFetchError: 'Network error',
      quotesRefreshCount: 3,
      quotesLastFetched: Date.now(),
      assetExchangeRates,
    });
    expect(
      bridgeController.state.quotesLastFetched,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ).toBeGreaterThan(t2!);
    expect(consoleLogSpy.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "Failed to stream bridge quotes",
          "Network error",
        ],
      ]
    `);
    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
    expect(getLayer1GasFeeMock).toHaveBeenCalledTimes(2);
    expect(trackMetaMetricsFn).toHaveBeenCalledTimes(8);
    // eslint-disable-next-line jest/no-restricted-matchers
    expect(trackMetaMetricsFn.mock.calls.slice(6, 8)).toMatchSnapshot();
  });

  it('should reset and refetch quotes after quote request is changed', async function () {
    mockFetchFn.mockImplementationOnce(async () => {
      return mockSseEventSource(
        mockBridgeQuotesNativeErc20 as never,
        FIRST_FETCH_DELAY,
      );
    });
    mockFetchFn.mockImplementationOnce(async () => {
      return mockSseEventSourceWithMultipleDelays(
        mockBridgeQuotesNativeErc20Eth as never,
        SECOND_FETCH_DELAY,
      );
    });
    mockFetchFn.mockRejectedValueOnce('Network error');
    mockFetchFn.mockImplementationOnce(async () => {
      return mockSseEventSourceWithMultipleDelays(
        [
          ...(mockBridgeQuotesNativeErc20 as never[]),
          ...(mockBridgeQuotesNativeErc20 as never),
        ] as never,
        THIRD_FETCH_DELAY,
      );
    });

    await bridgeController.updateBridgeQuoteRequestParams(
      quoteRequest,
      metricsContext,
    );

    consoleLogSpy.mockImplementationOnce(jest.fn());
    hasSufficientBalanceSpy.mockRejectedValue(new Error('Balance error'));

    // Wait for JWT token retrieval
    await advanceToNthTimerThenFlush();

    // 1st fetch
    jest.advanceTimersByTime(FIRST_FETCH_DELAY);
    await flushPromises();
    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);

    // Wait for next polling interval
    jest.advanceTimersToNextTimer();
    await flushPromises();

    // 2nd fetch
    jest.advanceTimersToNextTimer();
    jest.advanceTimersToNextTimer();
    await flushPromises();
    expect(bridgeController.state.quotesRefreshCount).toBe(2);
    const t2 = bridgeController.state.quotesLastFetched;

    // 3nd fetch throws an error
    await advanceToNthTimerThenFlush();
    const t5 = bridgeController.state.quotesLastFetched;
    expect(bridgeController.state.quotesRefreshCount).toBe(3);
    expect(bridgeController.state.quotes).toStrictEqual([]);
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(t5).toBeGreaterThan(t2!);
    const expectedState = {
      ...DEFAULT_BRIDGE_CONTROLLER_STATE,
      quotesLoadingStatus: RequestStatus.LOADING,
      quoteRequest: {
        ...quoteRequest,
        srcTokenAmount: '10',
      },
      assetExchangeRates: {},
    };
    // Start new quote request
    await bridgeController.updateBridgeQuoteRequestParams(
      { ...quoteRequest, srcTokenAmount: '10' },
      {
        stx_enabled: true,
        token_symbol_source: 'ETH',
        token_symbol_destination: 'USDC',
        security_warnings: [],
        usd_amount_source: 100,
      },
    );
    // Right after state update, before fetch has started
    expect(bridgeController.state).toStrictEqual(expectedState);
    advanceToNthTimer();
    expect(bridgeController.state).toStrictEqual({
      ...expectedState,
      quoteRequest: {
        ...quoteRequest,
        srcTokenAmount: '10',
        insufficientBal: true,
        resetApproval: false,
      },
      quotesLastFetched: Date.now(),
      quotesLoadingStatus: RequestStatus.LOADING,
    });
    const t1 = bridgeController.state.quotesLastFetched;
    // Wait for JWT token retrieval
    await advanceToNthTimerThenFlush();
    // 1st quote is received
    await advanceToNthTimerThenFlush();
    const expectedStateAfterFirstQuote = {
      ...expectedState,
      quotesInitialLoadTime: THIRD_FETCH_DELAY,
      quotes: [
        {
          ...mockBridgeQuotesNativeErc20[0],
          l1GasFeesInHexWei: '0x1',
          resetApproval: undefined,
        },
      ],
      quotesRefreshCount: 0,
      quotesLoadingStatus: RequestStatus.LOADING,
      quoteRequest: {
        ...quoteRequest,
        srcTokenAmount: '10',
        insufficientBal: true,
        resetApproval: false,
      },
      quotesLastFetched: t1,
      assetExchangeRates,
    };
    expect(bridgeController.state.quotes).toHaveLength(1);
    expect(bridgeController.state).toStrictEqual({
      ...expectedStateAfterFirstQuote,
    });
    const t4 = bridgeController.state.quotesLastFetched;
    expect(t4).toBe(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      t5!,
    );
    // All other quotes are received
    await advanceToNthTimerThenFlush(3);
    expect(bridgeController.state).toStrictEqual({
      ...expectedStateAfterFirstQuote,
      quotesRefreshCount: 1,
      quotesLoadingStatus: RequestStatus.FETCHED,
      quotes: [
        ...mockBridgeQuotesNativeErc20,
        ...mockBridgeQuotesNativeErc20,
      ].map((quote) => ({
        ...quote,
        l1GasFeesInHexWei: '0x1',
        resetApproval: undefined,
      })),
      assetExchangeRates,
    });
    expect(
      bridgeController.state.quotesLastFetched,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ).toBe(t4!);

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(4);
    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(2);
    expect(getLayer1GasFeeMock).toHaveBeenCalledTimes(6);
    expect(trackMetaMetricsFn).toHaveBeenCalledTimes(9);
    // eslint-disable-next-line jest/no-restricted-matchers
    expect(trackMetaMetricsFn.mock.calls.slice(8, 9)).toMatchSnapshot();
  });

  it('should publish validation failures', async function () {
    mockFetchFn.mockImplementationOnce(async () => {
      return mockSseEventSource(
        mockBridgeQuotesNativeErc20 as QuoteResponse[],
        FIRST_FETCH_DELAY,
      );
    });
    mockFetchFn.mockImplementationOnce(async () => {
      return mockSseEventSourceWithMultipleDelays(
        mockBridgeQuotesNativeErc20Eth as never[],
        SECOND_FETCH_DELAY,
      );
    });
    mockFetchFn.mockRejectedValueOnce('Network error');
    mockFetchFn.mockImplementationOnce(async () => {
      return mockSseEventSourceWithMultipleDelays(
        [
          ...(mockBridgeQuotesNativeErc20 as never[]),
          ...(mockBridgeQuotesNativeErc20 as never[]),
        ] as never[],
        THIRD_FETCH_DELAY,
      );
    });
    mockFetchFn.mockImplementationOnce(async () => {
      const { quote, ...rest } = mockBridgeQuotesNativeErc20[0];
      return mockSseEventSourceWithMultipleDelays(
        [
          {
            ...mockBridgeQuotesNativeErc20Eth[1],
            trade: { abc: '123' } as unknown as TxData,
          } as never,
          '' as unknown as never,
          mockBridgeQuotesNativeErc20Eth[0] as unknown as never,
          rest as unknown as never,
        ],
        FOURTH_FETCH_DELAY,
      );
    });
    await bridgeController.updateBridgeQuoteRequestParams(
      quoteRequest,
      metricsContext,
    );

    consoleLogSpy.mockImplementationOnce(jest.fn());
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementationOnce(jest.fn())
      .mockImplementationOnce(jest.fn());

    // Wait for JWT token retrieval
    await advanceToNthTimerThenFlush();

    // 1st fetch
    jest.advanceTimersByTime(FIRST_FETCH_DELAY);
    await flushPromises();
    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);

    // Wait for next polling interval
    await advanceToNthTimerThenFlush();

    // Wait for JWT token retrieval
    await advanceToNthTimerThenFlush();

    // 2nd fetch
    await advanceToNthTimerThenFlush(1);
    expect(bridgeController.state.quotesRefreshCount).toBe(2);

    // 3nd fetch throws an error
    await advanceToNthTimerThenFlush();
    const t5 = bridgeController.state.quotesLastFetched;
    expect(bridgeController.state.quotesRefreshCount).toBe(3);
    expect(bridgeController.state.quotes).toStrictEqual([]);
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);

    // Start new quote request
    await bridgeController.updateBridgeQuoteRequestParams(
      { ...quoteRequest, srcTokenAmount: '10' },
      {
        stx_enabled: true,
        token_symbol_source: 'ETH',
        token_symbol_destination: 'USDC',
        security_warnings: [],
        usd_amount_source: 100,
      },
    );

    // Wait for JWT token retrieval
    await advanceToNthTimerThenFlush();

    // 1st quote is received
    jest.advanceTimersByTime(FOURTH_FETCH_DELAY - 1000);
    await flushPromises();

    const t4 = bridgeController.state.quotesLastFetched;
    expect(t4).toBe(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      t5!,
    );
    expect(bridgeController.state.quotesRefreshCount).toBe(0);
    expect(bridgeController.state.quotesLoadingStatus).toBe(
      RequestStatus.LOADING,
    );

    // 2nd quote is received
    await advanceToNthTimerThenFlush(3);
    expect(bridgeController.state.quotes).toStrictEqual(
      [...mockBridgeQuotesNativeErc20, ...mockBridgeQuotesNativeErc20].map(
        (quote) => ({
          ...quote,
          l1GasFeesInHexWei: '0x1',
          resetApproval: undefined,
        }),
      ),
    );

    // Wait for next polling interval
    jest.advanceTimersToNextTimer();
    await flushPromises();

    // 2nd fetch after request is updated
    // Iterate through a list of received valid and invalid quotes
    // Invalid quotes received
    // Invalid quote
    jest.advanceTimersByTime(FOURTH_FETCH_DELAY - 1000);
    await flushPromises();
    const expectedState = {
      ...DEFAULT_BRIDGE_CONTROLLER_STATE,
      quotesInitialLoadTime: 2000,
      quoteRequest: {
        ...quoteRequest,
        srcTokenAmount: '10',
        insufficientBal: false,
        resetApproval: false,
      },
      quotes: [mockBridgeQuotesNativeErc20Eth[0]].map((quote) => ({
        ...quote,
        resetApproval: undefined,
      })),
      quotesRefreshCount: 1,
      quoteFetchError: null,
      quotesLoadingStatus: RequestStatus.LOADING,
      assetExchangeRates,
      quotesLastFetched: expect.any(Number),
    };
    const t6 = bridgeController.state.quotesLastFetched;
    expect(t6).toBeCloseTo(Date.now() - 2000);
    // Empty event.data
    await advanceToNthTimerThenFlush();
    // Valid quote
    await advanceToNthTimerThenFlush();
    await advanceToNthTimerThenFlush();
    expect(bridgeController.state).toStrictEqual(expectedState);
    const t7 = bridgeController.state.quotesLastFetched;
    expect(t7).toBe(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      t6!,
    );
    expect(consoleWarnSpy.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "Quote validation failed",
        [
          "lifi|trade",
          "lifi|trade.chainId",
          "lifi|trade.to",
          "lifi|trade.from",
          "lifi|trade.value",
          "lifi|trade.data",
          "lifi|trade.gasLimit",
          "lifi|trade.unsignedPsbtBase64",
          "lifi|trade.inputsToSign",
          "lifi|trade.raw_data_hex",
        ],
      ]
    `);
    // Invalid quote
    jest.advanceTimersByTime(FOURTH_FETCH_DELAY * 3 - 1000);
    await flushPromises();
    expect(bridgeController.state).toStrictEqual({
      ...expectedState,
      quotesRefreshCount: 2,
      quotesLoadingStatus: RequestStatus.FETCHED,
    });
    expect(bridgeController.state.quotesLastFetched).toBe(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      t7!,
    );
    expect(consoleWarnSpy.mock.calls).toHaveLength(3);
    expect(consoleWarnSpy.mock.calls[1]).toMatchInlineSnapshot(`
      [
        "Quote validation failed",
        [
          "unknown|unknown",
        ],
      ]
    `);
    expect(consoleWarnSpy.mock.calls[2]).toMatchInlineSnapshot(`
      [
        "Quote validation failed",
        [
          "unknown|quote",
        ],
      ]
    `);

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(5);
    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(2);
    expect(getLayer1GasFeeMock).toHaveBeenCalledTimes(6);
    expect(trackMetaMetricsFn).toHaveBeenCalledTimes(13);
    // eslint-disable-next-line jest/no-restricted-matchers
    expect(trackMetaMetricsFn.mock.calls.slice(10, 13)).toMatchSnapshot();
  });

  it('should rethrow error from server', async function () {
    mockFetchFn.mockImplementationOnce(async () => {
      return mockSseServerError('timeout from server');
    });
    await bridgeController.updateBridgeQuoteRequestParams(
      quoteRequest,
      metricsContext,
    );

    // Before polling starts
    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);
    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledWith({
      updatedQuoteRequest: {
        ...quoteRequest,
        insufficientBal: false,
        resetApproval: false,
      },
      context: metricsContext,
    });
    const expectedState = {
      ...DEFAULT_BRIDGE_CONTROLLER_STATE,
      quoteRequest,
      assetExchangeRates: {},
      quotesLoadingStatus: RequestStatus.LOADING,
    };
    expect(bridgeController.state).toStrictEqual(expectedState);

    // Loading state
    jest.advanceTimersByTime(1000);
    // Wait for JWT token retrieval
    await advanceToNthTimerThenFlush();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledWith(
      mockFetchFn,
      {
        ...quoteRequest,
        insufficientBal: false,
        resetApproval: false,
      },
      expect.any(AbortSignal),
      BridgeClientId.EXTENSION,
      'AUTH_TOKEN',
      BRIDGE_PROD_API_BASE_URL,
      {
        onValidationFailure: expect.any(Function),
        onValidQuoteReceived: expect.any(Function),
        onClose: expect.any(Function),
      },
      '13.8.0',
    );
    expect(fetchAssetPricesSpy).toHaveBeenCalledTimes(1);
    const { quotesLastFetched: t1, ...stateWithoutTimestamp } =
      bridgeController.state;
    // eslint-disable-next-line jest/no-restricted-matchers
    expect(stateWithoutTimestamp).toMatchSnapshot();
    expect(t1).toBeCloseTo(Date.now() - 1000);

    // After first fetch
    jest.advanceTimersByTime(5000);
    await flushPromises();
    expect(bridgeController.state).toStrictEqual({
      ...expectedState,
      assetExchangeRates,
      quoteRequest: {
        ...quoteRequest,
        insufficientBal: false,
        resetApproval: false,
      },
      quotesRefreshCount: 1,
      quotesLoadingStatus: 2,
      quoteFetchError: 'Bridge-api error: timeout from server',
      quotesLastFetched: t1,
    });
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "Failed to stream bridge quotes",
        [Error: Bridge-api error: timeout from server],
      ]
    `);
    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
    expect(getLayer1GasFeeMock).toHaveBeenCalledTimes(0);
    // eslint-disable-next-line jest/no-restricted-matchers
    expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
  });
});
