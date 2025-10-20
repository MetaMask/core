import { SolScope } from '@metamask/keyring-api';

import { BridgeController } from './bridge-controller';
import {
  BridgeClientId,
  BRIDGE_PROD_API_BASE_URL,
  DEFAULT_BRIDGE_CONTROLLER_STATE,
} from './constants/bridge';
import type { QuoteResponse } from './types';
import {
  ChainId,
  RequestStatus,
  type BridgeControllerMessenger,
} from './types';
import * as balanceUtils from './utils/balance';
import * as featureFlagUtils from './utils/feature-flags';
import * as fetchUtils from './utils/fetch';
import { flushPromises } from '../../../tests/helpers';
import { handleFetch } from '../../controller-utils/src';
import mockBridgeQuotesNativeErc20Eth from '../tests/mock-quotes-native-erc20-eth.json';
import mockBridgeQuotesNativeErc20 from '../tests/mock-quotes-native-erc20.json';
import {
  advanceToNthTimer,
  advanceToNthTimerThenFlush,
  mockSseEventSource,
} from '../tests/mock-sse';

const quoteRequest = {
  srcChainId: '0x1',
  destChainId: SolScope.Mainnet,
  srcTokenAddress: '0x0000000000000000000000000000000000000000',
  destTokenAddress: '123d1',
  srcTokenAmount: '1000000000000000000',
  slippage: 0.5,
  walletAddress: '0x30E8ccaD5A980BDF30447f8c2C48e70989D9d294',
  destWalletAddress: 'SolanaWalletAddres1234',
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
  const mockFetchFn = handleFetch;
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
    messengerMock.call.mockReturnValue({
      address: '0x123',
      provider: jest.fn(),
      selectedNetworkClientId: 'selectedNetworkClientId',
      currencyRates: {},
      marketData: {},
      conversionRates: {},
    } as never);
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
    });

    bridgeController = new BridgeController({
      messenger: messengerMock,
      getLayer1GasFee: getLayer1GasFeeMock,
      clientId: BridgeClientId.EXTENSION,
      fetchFn: mockFetchFn,
      trackMetaMetricsFn,
      clientVersion: '13.8.0',
    });

    mockSseEventSource(
      mockBridgeQuotesNativeErc20 as QuoteResponse[],
      mockBridgeQuotesNativeErc20Eth as QuoteResponse[],
    );

    jest.useFakeTimers();
    stopAllPollingSpy = jest.spyOn(bridgeController, 'stopAllPolling');
    startPollingSpy = jest.spyOn(bridgeController, 'startPolling');
    hasSufficientBalanceSpy = jest
      .spyOn(balanceUtils, 'hasSufficientBalance')
      .mockResolvedValue(true);
    fetchBridgeQuotesSpy = jest.spyOn(fetchUtils, 'fetchBridgeQuoteStream');
    consoleLogSpy = jest.spyOn(console, 'log');
    stopAllPollingSpy = jest.spyOn(bridgeController, 'stopAllPolling');
    await bridgeController.updateBridgeQuoteRequestParams(
      quoteRequest,
      metricsContext,
    );
  });

  it('should trigger quote polling if request is valid', async function () {
    // Before polling starts
    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);
    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledWith({
      networkClientId: 'selectedNetworkClientId',
      updatedQuoteRequest: {
        ...quoteRequest,
        insufficientBal: false,
      },
      context: metricsContext,
    });
    expect(fetchAssetPricesSpy).toHaveBeenCalledTimes(1);
    const expectedState = {
      ...DEFAULT_BRIDGE_CONTROLLER_STATE,
      quoteRequest,
      assetExchangeRates,
    };
    expect(bridgeController.state).toStrictEqual(expectedState);

    // Loading state
    jest.advanceTimersByTime(1000);
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledWith(
      mockFetchFn,
      {
        ...quoteRequest,
        insufficientBal: false,
      },
      expect.any(AbortSignal),
      BridgeClientId.EXTENSION,
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
    expect(bridgeController.state).toStrictEqual({
      ...expectedState,
      quotesInitialLoadTime: 6000,
      quoteRequest: { ...quoteRequest, insufficientBal: false },
      quotes: mockBridgeQuotesNativeErc20.map((quote) => ({
        ...quote,
        l1GasFeesInHexWei: '0x1',
      })),
      quotesRefreshCount: 1,
      quotesLoadingStatus: 1,
      quotesLastFetched: t1,
    });
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenCalledTimes(0);
    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
    expect(getLayer1GasFeeMock).toHaveBeenCalledTimes(2);
    // eslint-disable-next-line jest/no-restricted-matchers
    expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
  });

  it('should replace all stale quotes after a refresh and first quote is received', async function () {
    // 1st fetch
    jest.advanceTimersByTime(5000);
    await flushPromises();
    expect(bridgeController.state.quotes).toStrictEqual(
      mockBridgeQuotesNativeErc20.map((quote) => ({
        ...quote,
        l1GasFeesInHexWei: '0x1',
      })),
    );
    const t1 = bridgeController.state.quotesLastFetched;
    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);

    const expectedState = {
      ...DEFAULT_BRIDGE_CONTROLLER_STATE,
      quotesInitialLoadTime: 5000,
      quoteRequest: { ...quoteRequest, insufficientBal: false },
      quotes: [mockBridgeQuotesNativeErc20Eth[0]],
      quotesLoadingStatus: RequestStatus.LOADING,
      quotesRefreshCount: 2,
      assetExchangeRates,
    };

    // 2nd fetch request's first server event
    await advanceToNthTimerThenFlush(3);
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
      quotes: mockBridgeQuotesNativeErc20Eth,
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
    consoleLogSpy.mockImplementationOnce(jest.fn());
    // 1st fetch
    jest.advanceTimersByTime(25000);
    await flushPromises();
    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);
    expect(bridgeController.state.quotesInitialLoadTime).toBe(25000);

    // 2nd fetch
    await advanceToNthTimerThenFlush();
    await advanceToNthTimerThenFlush(2);
    expect(bridgeController.state.quotesRefreshCount).toBe(2);
    expect(bridgeController.state.quotesInitialLoadTime).toBe(25000);
    expect(bridgeController.state.quotes).toStrictEqual(
      mockBridgeQuotesNativeErc20Eth,
    );
    const t2 = bridgeController.state.quotesLastFetched;

    // 3nd fetch throws an error
    await advanceToNthTimerThenFlush();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(3);
    expect(bridgeController.state).toStrictEqual({
      ...DEFAULT_BRIDGE_CONTROLLER_STATE,
      quotesInitialLoadTime: 25000,
      quoteRequest: { ...quoteRequest, insufficientBal: false },
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
              Array [
                Array [
                  "Failed to stream bridge quotes",
                  [Error: Network error],
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
    consoleLogSpy.mockImplementationOnce(jest.fn());
    hasSufficientBalanceSpy.mockRejectedValue(new Error('Balance error'));
    // 1st fetch
    jest.advanceTimersByTime(5000);
    await flushPromises();
    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);

    // 2nd fetch
    await advanceToNthTimerThenFlush();
    expect(bridgeController.state.quotesRefreshCount).toBe(2);
    await advanceToNthTimerThenFlush(2);
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
      quoteRequest: {
        ...quoteRequest,
        srcTokenAmount: '10',
      },
      assetExchangeRates,
    };
    // Start new quote request
    await bridgeController.updateBridgeQuoteRequestParams(
      { ...quoteRequest, srcTokenAmount: '10' },
      {
        stx_enabled: true,
        token_symbol_source: 'ETH',
        token_symbol_destination: 'USDC',
        security_warnings: [],
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
      },
      quotesLastFetched: Date.now(),
      quotesLoadingStatus: RequestStatus.LOADING,
    });
    const t1 = bridgeController.state.quotesLastFetched;
    advanceToNthTimer(1);
    // 1st quote is received
    await advanceToNthTimerThenFlush();
    const expectedStateAfterFirstQuote = {
      ...expectedState,
      quotesInitialLoadTime: 2000,
      quotes: [{ ...mockBridgeQuotesNativeErc20[0], l1GasFeesInHexWei: '0x1' }],
      quotesRefreshCount: 1,
      quotesLoadingStatus: RequestStatus.LOADING,
      quoteRequest: {
        ...quoteRequest,
        srcTokenAmount: '10',
        insufficientBal: true,
      },
      quotesLastFetched: t1,
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
    // 2nd quote is received
    await advanceToNthTimerThenFlush(3);
    expect(bridgeController.state).toStrictEqual({
      ...expectedStateAfterFirstQuote,
      quotesLoadingStatus: RequestStatus.FETCHED,
      quotes: [
        ...mockBridgeQuotesNativeErc20,
        ...mockBridgeQuotesNativeErc20,
      ].map((quote) => ({
        ...quote,
        l1GasFeesInHexWei: '0x1',
      })),
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
    consoleLogSpy.mockImplementationOnce(jest.fn());
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementationOnce(jest.fn())
      .mockImplementationOnce(jest.fn());
    // 1st fetch
    jest.advanceTimersByTime(9000);
    await flushPromises();
    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);

    // 2nd fetch
    await advanceToNthTimerThenFlush();
    await advanceToNthTimerThenFlush(2);
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
      },
    );

    // 1st quote is received
    await advanceToNthTimerThenFlush(3);
    const t4 = bridgeController.state.quotesLastFetched;
    expect(t4).toBe(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      t5!,
    );
    expect(bridgeController.state.quotesRefreshCount).toBe(1);
    // 2nd quote is received
    await advanceToNthTimerThenFlush(3);
    expect(bridgeController.state.quotes).toStrictEqual(
      [...mockBridgeQuotesNativeErc20, ...mockBridgeQuotesNativeErc20].map(
        (quote) => ({
          ...quote,
          l1GasFeesInHexWei: '0x1',
        }),
      ),
    );

    // 2nd fetch after request is updated
    // Iterate through a list of received valid and invalid quotes
    // Invalid quotes received
    advanceToNthTimer(2);
    // Invalid quote
    await advanceToNthTimerThenFlush();
    const expectedState = {
      ...DEFAULT_BRIDGE_CONTROLLER_STATE,
      quotesInitialLoadTime: 2000,
      quoteRequest: {
        ...quoteRequest,
        srcTokenAmount: '10',
        insufficientBal: false,
      },
      quotes: [mockBridgeQuotesNativeErc20Eth[0]],
      quotesRefreshCount: 2,
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
    expect(bridgeController.state).toStrictEqual(expectedState);
    const t7 = bridgeController.state.quotesLastFetched;
    expect(t7).toBe(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      t6!,
    );
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        "Quote validation failed",
        Array [
          "lifi|trade",
          "lifi|trade.chainId",
          "lifi|trade.to",
          "lifi|trade.from",
          "lifi|trade.value",
          "lifi|trade.data",
          "lifi|trade.gasLimit",
          "lifi|trade.unsignedPsbtBase64",
          "lifi|trade.inputsToSign",
        ],
      ]
    `);
    // Invalid quote
    await advanceToNthTimerThenFlush();
    expect(bridgeController.state).toStrictEqual({
      ...expectedState,
      quotesRefreshCount: 2,
      quotesLoadingStatus: RequestStatus.FETCHED,
    });
    expect(bridgeController.state.quotesLastFetched).toBe(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      t7!,
    );
    expect(consoleWarnSpy.mock.calls).toHaveLength(2);
    expect(consoleWarnSpy.mock.calls[1]).toMatchInlineSnapshot(`
              Array [
                "Quote validation failed",
                Array [
                  "unknown|quote",
                ],
              ]
          `);

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(5);
    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(2);
    expect(getLayer1GasFeeMock).toHaveBeenCalledTimes(6);
    expect(trackMetaMetricsFn).toHaveBeenCalledTimes(12);
    // eslint-disable-next-line jest/no-restricted-matchers
    expect(trackMetaMetricsFn.mock.calls.slice(10, 12)).toMatchSnapshot();
  });
});
