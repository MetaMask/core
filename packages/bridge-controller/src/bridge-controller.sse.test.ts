/* eslint-disable jest/no-restricted-matchers */

import { SolScope } from '@metamask/keyring-api';
import * as eventSource from '@microsoft/fetch-event-source';

import { BridgeController } from './bridge-controller';
import {
  BridgeClientId,
  BRIDGE_PROD_API_BASE_URL,
  DEFAULT_BRIDGE_CONTROLLER_STATE,
} from './constants/bridge';
import { ChainId, type BridgeControllerMessenger } from './types';
import * as balanceUtils from './utils/balance';
import * as featureFlagUtils from './utils/feature-flags';
import * as fetchUtils from './utils/fetch';
import { flushPromises } from '../../../tests/helpers';
import { handleFetch } from '../../controller-utils/src';
import mockBridgeQuotesNativeErc20Eth from '../tests/mock-quotes-native-erc20-eth.json';
import mockBridgeQuotesNativeErc20 from '../tests/mock-quotes-native-erc20.json';

const messengerMock = {
  call: jest.fn(),
  registerActionHandler: jest.fn(),
  registerInitialEventPayload: jest.fn(),
  publish: jest.fn(),
} as unknown as jest.Mocked<BridgeControllerMessenger>;

const getLayer1GasFeeMock = jest.fn();
const mockFetchFn = handleFetch;
const trackMetaMetricsFn = jest.fn();
let fetchAssetPricesSpy: jest.SpyInstance;

describe('BridgeController SSE tests', function () {
  let bridgeController: BridgeController;

  beforeEach(() => {
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
    bridgeController = new BridgeController({
      messenger: messengerMock,
      getLayer1GasFee: getLayer1GasFeeMock,
      clientId: BridgeClientId.EXTENSION,
      fetchFn: mockFetchFn,
      trackMetaMetricsFn,
      clientVersion: '1.0.0',
    });
    messengerMock.call.mockReturnValue({
      address: '0x123',
      provider: jest.fn(),
      selectedNetworkClientId: 'selectedNetworkClientId',
      currencyRates: {},
      marketData: {},
      conversionRates: {},
    } as never);
    const defaultFlags = {
      minimumVersion: '0.0.0',
      maxRefreshCount: 5,
      refreshRate: 30000,
      support: true,
      sseEnabled: true,
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
    };
    jest
      .spyOn(featureFlagUtils, 'getBridgeFeatureFlags')
      .mockReturnValue(defaultFlags);
  });

  const metricsContext = {
    token_symbol_source: 'ETH',
    token_symbol_destination: 'USDC',
    usd_amount_source: 100,
    stx_enabled: true,
    security_warnings: [],
    warnings: [],
  };

  it('updateBridgeQuoteRequestParams should trigger quote polling if request is valid', async function () {
    jest.useFakeTimers();
    const stopAllPollingSpy = jest.spyOn(bridgeController, 'stopAllPolling');
    const startPollingSpy = jest.spyOn(bridgeController, 'startPolling');
    const hasSufficientBalanceSpy = jest
      .spyOn(balanceUtils, 'hasSufficientBalance')
      .mockResolvedValue(true);

    const fetchBridgeQuotesSpy = jest.spyOn(
      fetchUtils,
      'fetchBridgeQuoteStream',
    );

    const consoleLogSpy = jest.spyOn(console, 'log');

    jest
      .spyOn(eventSource, 'fetchEventSource')
      .mockImplementationOnce(async (url, { onopen, onmessage, onclose }) => {
        setTimeout(() => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          onopen?.({ ok: true } as Response);
        }, 1000);

        setTimeout(() => {
          onmessage?.({
            data: JSON.stringify(mockBridgeQuotesNativeErc20[0]),
            event: 'quote',
            id: '1',
          });
          onmessage?.({
            data: JSON.stringify(mockBridgeQuotesNativeErc20[1]),
            event: 'quote',
            id: '2',
          });
          onclose?.();
        }, 4000);
      })
      .mockImplementationOnce(async (url, { onopen, onmessage }) => {
        setTimeout(() => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          onopen?.({ ok: true } as Response);
        }, 1000);

        setTimeout(() => {
          onmessage?.({
            data: JSON.stringify(mockBridgeQuotesNativeErc20Eth[0]),
            event: 'quote',
            id: '1',
          });
        }, 9000);
        await Promise.resolve();

        setTimeout(() => {
          onmessage?.({
            data: JSON.stringify(mockBridgeQuotesNativeErc20Eth[1]),
            event: 'quote',
            id: '2',
          });
        }, 2000);
      })
      .mockImplementationOnce(async (url, { onopen, onmessage, onerror }) => {
        setTimeout(() => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          onopen?.({ ok: true } as Response);
        }, 1000);

        onerror?.('Network error');
      })
      .mockImplementationOnce(async (url, { onopen, onmessage }) => {
        setTimeout(() => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          onopen?.({ ok: true } as Response);
        }, 1000);

        setTimeout(() => {
          onmessage?.({
            data: JSON.stringify(mockBridgeQuotesNativeErc20[0]),
            event: 'quote',
            id: '1',
          });
          onmessage?.({
            data: JSON.stringify(mockBridgeQuotesNativeErc20[1]),
            event: 'quote',
            id: '2',
          });
          onmessage?.({
            data: JSON.stringify(mockBridgeQuotesNativeErc20[0]),
            event: 'quote',
            id: '3',
          });
          onmessage?.({
            data: JSON.stringify(mockBridgeQuotesNativeErc20[1]),
            event: 'quote',
            id: '4',
          });
        }, 10000);
      });

    const quoteParams = {
      srcChainId: '0x1',
      destChainId: SolScope.Mainnet,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
      destTokenAddress: '123d1',
      srcTokenAmount: '1000000000000000000',
      slippage: 0.5,
      walletAddress: '0x30E8ccaD5A980BDF30447f8c2C48e70989D9d294',
      destWalletAddress: 'SolanaWalletAddres1234',
    };
    const quoteRequest = {
      ...quoteParams,
    };
    await bridgeController.updateBridgeQuoteRequestParams(
      quoteParams,
      metricsContext,
    );

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
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        quoteRequest: {
          ...quoteRequest,
          walletAddress: '0x30E8ccaD5A980BDF30447f8c2C48e70989D9d294',
        },
        quotes: DEFAULT_BRIDGE_CONTROLLER_STATE.quotes,
        quotesLastFetched: DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLastFetched,
        quotesLoadingStatus:
          DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLoadingStatus,
      }),
    );

    // Loading state
    jest.advanceTimersByTime(1000);
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(1);
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
        onOpen: expect.any(Function),
        onValidationFailure: expect.any(Function),
        onValidQuoteReceived: expect.any(Function),
      },
      '1.0.0',
    );
    expect(bridgeController.state.quotesLastFetched).toBeNull();
    expect(bridgeController.state).toMatchSnapshot();

    // After first fetch
    jest.advanceTimersByTime(5000);
    await flushPromises();
    expect(consoleLogSpy.mock.calls).toMatchInlineSnapshot(`Array []`);
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        quotesInitialLoadTime: 6000,
        quoteRequest: { ...quoteRequest, insufficientBal: false },
        quotes: mockBridgeQuotesNativeErc20.map((quote) => ({
          ...quote,
          l1GasFeesInHexWei: '0x1',
        })),
        quotesRefreshCount: 1,
        quotesLoadingStatus: 1,
      }),
    );
    const firstFetchTime = bridgeController.state.quotesLastFetched;
    expect(firstFetchTime).toBeGreaterThan(0);
    jest.advanceTimersToNextTimer();

    // After 2nd fetch's first server event
    jest.advanceTimersByTime(11000);
    await flushPromises();
    expect(bridgeController.state.quotes).toHaveLength(1);
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        quotesInitialLoadTime: 6000,
        quoteRequest: { ...quoteRequest, insufficientBal: false },
        quotes: [mockBridgeQuotesNativeErc20Eth[0]],
        quotesLoadingStatus: 1,
        quoteFetchError: null,
        quotesRefreshCount: 2,
      }),
    );
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(2);
    const secondFetchTime = bridgeController.state.quotesLastFetched;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(secondFetchTime).toBeGreaterThan(firstFetchTime!);

    // After 2nd server event
    jest.advanceTimersByTime(2000);
    await flushPromises();
    expect(bridgeController.state.quotes).toHaveLength(2);
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        quotesInitialLoadTime: 6000,
        quoteRequest: { ...quoteRequest, insufficientBal: false },
        quotes: mockBridgeQuotesNativeErc20Eth,
        quotesLoadingStatus: 1,
        quoteFetchError: null,
        quotesRefreshCount: 2,
      }),
    );
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(2);
    const secondFetchNextMessageTime = bridgeController.state.quotesLastFetched;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(secondFetchNextMessageTime).toBe(secondFetchTime!);

    // After 3nd fetch throws an error
    jest.advanceTimersToNextTimer();
    await flushPromises();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(3);
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        quotesInitialLoadTime: 6000,
        quoteRequest: { ...quoteRequest, insufficientBal: false },
        quotes: [],
        quotesLoadingStatus: 2,
        quoteFetchError: 'Network error',
        quotesRefreshCount: 3,
      }),
    );
    const thirdFetchTime = bridgeController.state.quotesLastFetched;
    expect(
      thirdFetchTime,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ).toBeGreaterThan(secondFetchTime!);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Failed to stream bridge quotes',
      new Error('Network error'),
    );
    expect(consoleLogSpy.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "Failed to stream bridge quotes",
          [Error: Network error],
        ],
      ]
    `);

    // Incoming request update aborts current polling
    jest.advanceTimersByTime(10000);
    await flushPromises();
    await bridgeController.updateBridgeQuoteRequestParams(
      { ...quoteRequest, srcTokenAmount: '10', insufficientBal: false },
      {
        stx_enabled: true,
        token_symbol_source: 'ETH',
        token_symbol_destination: 'USDC',
        security_warnings: [],
      },
    );
    await flushPromises();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(3);
    expect(bridgeController.state).toMatchSnapshot();

    // Next fetch succeeds
    jest.advanceTimersByTime(15000);
    await flushPromises();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(4);
    const { quotesLastFetched, quotes, ...stateWithoutTimestamp } =
      bridgeController.state;

    expect(stateWithoutTimestamp).toMatchSnapshot();
    expect(quotes).toStrictEqual(
      [...mockBridgeQuotesNativeErc20, ...mockBridgeQuotesNativeErc20].map(
        (quote) => ({
          ...quote,
          l1GasFeesInHexWei: '0x1',
        }),
      ),
    );
    expect(
      quotesLastFetched,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ).toBeGreaterThan(thirdFetchTime!);

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
    expect(getLayer1GasFeeMock).toHaveBeenCalledTimes(6);
    expect(trackMetaMetricsFn).toHaveBeenCalledTimes(9);
    expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
  });
});
