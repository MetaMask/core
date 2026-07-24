import { SolScope } from '@metamask/keyring-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import { flushPromises } from '../../../tests/helpers.js';
import {
  getMockBridgeQuotesErc20Erc20V2,
  mockBridgeQuotesErc20Erc20V1,
} from '../tests/mock-quotes-erc20-erc20.js';
import {
  getMockBridgeQuotesNativeErc20V2,
  mockBridgeQuotesNativeErc20V1,
} from '../tests/mock-quotes-native-erc20.js';
import {
  advanceToNthTimerThenFlush,
  mockSseBatchSellEventSource,
} from '../tests/mock-sse.js';
import { BridgeController } from './bridge-controller.js';
import {
  BridgeClientId,
  BRIDGE_PROD_API_BASE_URL,
  DEFAULT_BRIDGE_CONTROLLER_STATE,
} from './constants/bridge.js';
import * as selectors from './selectors.js';
import { ChainId, RequestStatus } from './types.js';
import type { BridgeControllerMessenger } from './types.js';
import * as balanceUtils from './utils/balance.js';
import * as featureFlagUtils from './utils/feature-flags.js';
import * as fetchUtils from './utils/fetch.js';
import { FeatureId } from './validators/feature-flags.js';

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<BridgeControllerMessenger>,
  MessengerEvents<BridgeControllerMessenger>
>;

const BRIDGE_CONTROLLER_ALLOWED_EXTERNAL_ACTIONS = [
  'AccountsController:getAccountByAddress',
  'AuthenticationController:getBearerToken',
  'CurrencyRateController:getState',
  'TokenRatesController:getState',
  'MultichainAssetsRatesController:getState',
  'SnapController:handleRequest',
  'NetworkController:findNetworkClientIdByChainId',
  'NetworkController:getNetworkClientById',
  'RemoteFeatureFlagController:getState',
  'AssetsController:getExchangeRatesForBridge',
] as const;

const messengerCallMock = jest.fn();
const getLayer1GasFeeMock = jest.fn();
const mockFetchFn = jest.fn();
const trackMetaMetricsFn = jest.fn();

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
  feature_id: FeatureId.BATCH_SELL,
  token_symbol_source: 'ETH',
  token_symbol_destination: 'USDC',
  usd_amount_source: 100,
  stx_enabled: true,
  security_warnings: [],
  warnings: [],
  token_security_type_destination: null,
};

const assetExchangeRates = {
  'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': {
    exchangeRate: undefined,
    usdExchangeRate: '100',
  },
};

type WithControllerCallback<ReturnValue> = (payload: {
  controller: BridgeController;
  rootMessenger: RootMessenger;
  stopAllPollingSpy: jest.SpyInstance;
  startPollingSpy: jest.SpyInstance;
  hasSufficientBalanceSpy: jest.SpyInstance;
  fetchBridgeQuotesSpy: jest.SpyInstance;
  fetchAssetPricesSpy: jest.SpyInstance;
  consoleLogSpy: jest.SpyInstance;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<ConstructorParameters<typeof BridgeController>[0]>;
};

async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ options = {} }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];

  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const messenger: BridgeControllerMessenger = new Messenger({
    namespace: 'BridgeController',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger,
    actions: [...BRIDGE_CONTROLLER_ALLOWED_EXTERNAL_ACTIONS],
  });

  for (const action of BRIDGE_CONTROLLER_ALLOWED_EXTERNAL_ACTIONS) {
    rootMessenger.registerActionHandler(action, (...actionArgs) =>
      messengerCallMock(action, ...actionArgs),
    );
  }

  jest.useFakeTimers();

  getLayer1GasFeeMock.mockResolvedValue('0x1');

  messengerCallMock.mockImplementation(
    (...messengerArgs: Parameters<BridgeControllerMessenger['call']>) => {
      switch (messengerArgs[0]) {
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

  const controller = new BridgeController({
    messenger,
    getLayer1GasFee: getLayer1GasFeeMock,
    clientId: BridgeClientId.EXTENSION,
    fetchFn: mockFetchFn,
    trackMetaMetricsFn,
    clientVersion: '13.8.0',
    ...options,
  });

  const stopAllPollingSpy = jest.spyOn(controller, 'stopAllPolling');
  const startPollingSpy = jest.spyOn(controller, 'startPolling');
  const hasSufficientBalanceSpy = jest
    .spyOn(balanceUtils, 'hasSufficientBalance')
    .mockResolvedValue(true);
  const fetchBridgeQuotesSpy = jest.spyOn(fetchUtils, 'fetchBridgeQuoteStream');
  const fetchAssetPricesSpy = jest
    .spyOn(fetchUtils, 'fetchAssetPrices')
    .mockResolvedValue({
      'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': {
        usd: '100',
      },
    });

  const consoleLogSpy = jest.spyOn(console, 'log');

  return await testFunction({
    controller,
    rootMessenger,
    stopAllPollingSpy,
    startPollingSpy,
    hasSufficientBalanceSpy,
    fetchBridgeQuotesSpy,
    fetchAssetPricesSpy,
    consoleLogSpy,
  });
}

describe('BridgeController BatchSell (multiple quote requests) SSE', function () {
  describe('fetch quotes', function () {
    beforeEach(() => {
      jest.clearAllMocks();
      jest.clearAllTimers();
      jest.resetAllMocks();
    });

    it('should trigger quote polling if request is valid', async function () {
      const consoleWarnSpy = jest.spyOn(console, 'warn');
      await withController(
        async ({
          controller: bridgeController,
          rootMessenger,
          stopAllPollingSpy,
          startPollingSpy,
          hasSufficientBalanceSpy,
          fetchBridgeQuotesSpy,
          fetchAssetPricesSpy,
          consoleLogSpy,
        }) => {
          mockFetchFn.mockImplementationOnce(async () => {
            return mockSseBatchSellEventSource([
              mockBridgeQuotesNativeErc20V1,
              mockBridgeQuotesErc20Erc20V1.map((quote) => ({
                ...quote,
                quoteRequestIndex: 1,
              })),
            ]);
          });
          hasSufficientBalanceSpy.mockResolvedValue(true);

          const selectIsAssetExchangeRateInStateSpy = jest.spyOn(
            selectors,
            'selectIsAssetExchangeRateInState',
          );

          const quoteRequest0 = {
            ...quoteRequest,
            srcTokenAddress:
              mockBridgeQuotesNativeErc20V1[0].quote.srcAsset.address,
            destTokenAddress:
              mockBridgeQuotesNativeErc20V1[0].quote.destAsset.address,
            srcChainId:
              mockBridgeQuotesNativeErc20V1[0].quote.srcAsset.chainId.toString(),
            destChainId:
              mockBridgeQuotesNativeErc20V1[0].quote.destAsset.chainId.toString(),
            srcTokenAmount: '100000000000000000',
          };
          const quoteRequest1 = {
            ...quoteRequest,
            srcTokenAddress:
              mockBridgeQuotesErc20Erc20V1[0].quote.srcAsset.address,
            destTokenAddress:
              mockBridgeQuotesErc20Erc20V1[0].quote.destAsset.address,
            srcChainId:
              mockBridgeQuotesErc20Erc20V1[0].quote.srcAsset.chainId.toString(),
            destChainId:
              mockBridgeQuotesErc20Erc20V1[0].quote.destAsset.chainId.toString(),
            srcTokenAmount: '1000000000000000000',
          };
          const quoteRequest2 = {
            ...quoteRequest,
            srcTokenAddress:
              mockBridgeQuotesNativeErc20V1[0].quote.srcAsset.address,
            destTokenAddress:
              mockBridgeQuotesNativeErc20V1[0].quote.destAsset.address,
            srcChainId:
              mockBridgeQuotesNativeErc20V1[0].quote.srcAsset.chainId.toString(),
            destChainId:
              mockBridgeQuotesNativeErc20V1[0].quote.destAsset.chainId.toString(),
            srcTokenAmount: '1000000000000000000',
          };

          await rootMessenger.call(
            'BridgeController:updateBridgeQuoteRequestParams',
            quoteRequest2,
            metricsContext,
            4,
            1,
          );
          await rootMessenger.call(
            'BridgeController:updateBridgeQuoteRequestParams',
            quoteRequest2,
            metricsContext,
            1,
            2,
          );
          await rootMessenger.call(
            'BridgeController:updateBridgeQuoteRequestParams',
            quoteRequest2,
            metricsContext,
            4,
            1,
          );
          await rootMessenger.call(
            'BridgeController:updateBridgeQuoteRequestParams',
            quoteRequest0,
            metricsContext,
            0,
            1,
          );
          await rootMessenger.call(
            'BridgeController:updateBridgeQuoteRequestParams',
            quoteRequest1,
            metricsContext,
            1,
            2,
          );
          await rootMessenger.call(
            'BridgeController:updateBridgeQuoteRequestParams',
            quoteRequest1,
            metricsContext,
            1,
            3,
          );
          await rootMessenger.call(
            'BridgeController:updateBridgeQuoteRequestParams',
            quoteRequest2,
            metricsContext,
            2,
            3,
          );

          // Before polling starts
          expect(stopAllPollingSpy).toHaveBeenCalledTimes(5);
          expect(startPollingSpy).toHaveBeenCalledTimes(4);
          expect(
            startPollingSpy.mock.calls
              .map((call) => call[0].quoteRequests)
              .flat()
              .find((call) => !call),
          ).toBeUndefined();
          expect(bridgeController.state.quoteRequest).toStrictEqual([
            { ...quoteRequest0, insufficientBal: false },
            { ...quoteRequest1, insufficientBal: false },
            { ...quoteRequest2, insufficientBal: false },
          ]);
          expect(fetchAssetPricesSpy).toHaveBeenCalledTimes(0);
          const expectedState = {
            ...DEFAULT_BRIDGE_CONTROLLER_STATE,
            quoteRequest: [
              { ...quoteRequest0, insufficientBal: false },
              { ...quoteRequest1, insufficientBal: false },
              { ...quoteRequest2, insufficientBal: false },
            ],
            quotesLoadingStatus: RequestStatus.LOADING,
          };
          expect(bridgeController.state).toStrictEqual(expectedState);

          // Loading state
          jest.advanceTimersByTime(1000);
          await advanceToNthTimerThenFlush();
          expect(bridgeController.state.quotesLoadingStatus).toBe(
            RequestStatus.LOADING,
          );
          expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(4);
          expect(fetchBridgeQuotesSpy).toHaveBeenCalledWith(
            mockFetchFn,
            [
              {
                ...quoteRequest0,
                insufficientBal: false,
                resetApproval: false,
              },
              {
                ...quoteRequest1,
                insufficientBal: false,
                resetApproval: false,
              },
              {
                ...quoteRequest2,
                insufficientBal: false,
                resetApproval: false,
              },
            ],
            expect.any(AbortSignal),
            FeatureId.BATCH_SELL,
            BridgeClientId.EXTENSION,
            'AUTH_TOKEN',
            BRIDGE_PROD_API_BASE_URL,
            {
              onQuoteValidationFailure: expect.any(Function),
              onValidQuoteReceived: expect.any(Function),
              onTokenWarning: expect.any(Function),
              onComplete: expect.any(Function),
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
          expect(consoleWarnSpy.mock.calls).toMatchInlineSnapshot(`[]`);
          expect(fetchAssetPricesSpy).toHaveBeenCalledTimes(1);
          expect(bridgeController.state).toStrictEqual({
            ...expectedState,
            quotesInitialLoadTime: 6000,
            quoteRequest: [
              {
                ...quoteRequest0,
                insufficientBal: false,
                resetApproval: false,
              },
              {
                ...quoteRequest1,
                insufficientBal: false,
                resetApproval: false,
              },
              {
                ...quoteRequest2,
                insufficientBal: false,
                resetApproval: false,
              },
            ],
            quotes: getMockBridgeQuotesNativeErc20V2()
              .map((quote) => ({
                ...quote,
                l1GasFeesInHexWei: '0x1',
                resetApproval: undefined,
                quoteRequestIndex: 0,
                featureId: FeatureId.BATCH_SELL,
              }))
              .concat(
                getMockBridgeQuotesErc20Erc20V2({ quoteRequestIndex: 1 }).map(
                  (quote) => ({
                    ...quote,
                    l1GasFeesInHexWei: '0x2',
                    resetApproval: undefined,
                    quoteRequestIndex: 1,
                    featureId: FeatureId.BATCH_SELL,
                  }),
                ),
              ),
            quotesRefreshCount: 1,
            quotesLoadingStatus: 1,
            quotesLastFetched: t1,
            assetExchangeRates,
            batchSellTrades: null,
            batchSellTradesLoadingStatus: RequestStatus.LOADING,
          });
          expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(1);
          expect(consoleLogSpy).toHaveBeenCalledTimes(0);
          expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(4);
          expect(getLayer1GasFeeMock).toHaveBeenCalledTimes(6);
          // eslint-disable-next-line jest/no-restricted-matchers
          expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
          expect(selectIsAssetExchangeRateInStateSpy).toHaveBeenCalledTimes(12);
          expect(fetchAssetPricesSpy).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  describe('fetch trades/fees', function () {
    beforeEach(() => {
      jest.clearAllMocks();
      jest.clearAllTimers();
      jest.resetAllMocks();
    });

    it('should fetch batch gasless trades and fees', async function () {
      await withController(
        async ({
          controller: bridgeController,
          rootMessenger,
          stopAllPollingSpy,
          startPollingSpy,
          fetchAssetPricesSpy,
          consoleLogSpy,
        }) => {
          jest.useFakeTimers();
          const abortControllerSpy = jest.spyOn(
            AbortController.prototype,
            'abort',
          );
          const fetchBatchSellTradesSpy = jest.spyOn(
            fetchUtils,
            'fetchBatchSellTrades',
          );
          const mockBatchSellTrades = {
            transactions: [],
            fee: {
              amount: '100',
              asset: {
                symbol: 'USDC',
                chainId: 10,
                address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
                name: 'USD Coin',
                decimals: 6,
                assetId:
                  'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
              } as const,
            },
          };

          // Before initial fetch
          expect(stopAllPollingSpy).toHaveBeenCalledTimes(0);
          expect(abortControllerSpy).toHaveBeenCalledTimes(0);
          expect(fetchBatchSellTradesSpy).toHaveBeenCalledTimes(0);
          expect(startPollingSpy).not.toHaveBeenCalled();
          expect(bridgeController.state.batchSellTrades).toBeNull();
          expect(
            bridgeController.state.batchSellTradesLoadingStatus,
          ).toBeNull();
          expect(fetchAssetPricesSpy).toHaveBeenCalledTimes(0);
          expect(bridgeController.state).toStrictEqual(
            DEFAULT_BRIDGE_CONTROLLER_STATE,
          );

          fetchBatchSellTradesSpy.mockImplementationOnce(
            () =>
              new Promise((resolve) => {
                jest.useRealTimers();
                setTimeout(() => {
                  jest.useFakeTimers();
                  resolve(mockBatchSellTrades);
                }, 2000);
              }),
          );

          // Initial fetch
          await rootMessenger.call(
            'BridgeController:updateBatchSellTrades',
            [],
            false,
          );

          await jest.advanceTimersByTimeAsync(1000);
          await flushPromises();

          expect(stopAllPollingSpy).toHaveBeenCalledTimes(0);
          expect(abortControllerSpy).toHaveBeenCalledTimes(0);
          expect(fetchBatchSellTradesSpy.mock.calls[0][0]).toStrictEqual([]);
          expect(startPollingSpy).not.toHaveBeenCalled();
          expect(bridgeController.state.batchSellTrades).toStrictEqual(
            mockBatchSellTrades,
          );
          expect(fetchAssetPricesSpy).toHaveBeenCalledTimes(0);

          await jest.advanceTimersByTimeAsync(1000);
          await flushPromises();

          expect(bridgeController.state).toStrictEqual({
            ...DEFAULT_BRIDGE_CONTROLLER_STATE,
            batchSellTradesLoadingStatus: RequestStatus.FETCHED,
            batchSellTrades: mockBatchSellTrades,
          });

          expect(fetchBatchSellTradesSpy).toHaveBeenCalledTimes(1);
          expect(consoleLogSpy.mock.calls).toMatchInlineSnapshot(`[]`);
          expect(trackMetaMetricsFn).toHaveBeenCalledTimes(0);
          jest.useRealTimers();
        },
      );
    });

    it('should abort previous fetch if new fetch is called', async function () {
      await withController(
        async ({
          controller: bridgeController,
          rootMessenger,
          stopAllPollingSpy,
          startPollingSpy,
          fetchAssetPricesSpy,
          consoleLogSpy,
        }) => {
          jest.useFakeTimers();
          const abortControllerSpy = jest.spyOn(
            AbortController.prototype,
            'abort',
          );
          const fetchBatchSellTradesSpy = jest.spyOn(
            fetchUtils,
            'fetchBatchSellTrades',
          );
          const mockBatchSellTrades = {
            transactions: [],
            fee: {
              amount: '100',
              asset: {
                symbol: 'USDC',
                chainId: 10,
                address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
                name: 'USD Coin',
                decimals: 6,
                assetId:
                  'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
              } as const,
            },
          };
          const mockBatchSellTrades2 = {
            transactions: [],
            fee: {
              amount: '500',
              asset: {
                ...mockBatchSellTrades.fee.asset,
              },
            },
          };

          // Before initial fetch
          expect(stopAllPollingSpy).toHaveBeenCalledTimes(0);
          expect(abortControllerSpy).toHaveBeenCalledTimes(0);
          expect(fetchBatchSellTradesSpy).toHaveBeenCalledTimes(0);
          expect(startPollingSpy).not.toHaveBeenCalled();
          expect(bridgeController.state.batchSellTrades).toBeNull();
          expect(
            bridgeController.state.batchSellTradesLoadingStatus,
          ).toBeNull();
          expect(fetchAssetPricesSpy).toHaveBeenCalledTimes(0);
          expect(bridgeController.state).toStrictEqual(
            DEFAULT_BRIDGE_CONTROLLER_STATE,
          );

          fetchBatchSellTradesSpy.mockImplementationOnce(
            () =>
              new Promise((resolve) => {
                jest.useRealTimers();
                setTimeout(() => {
                  jest.useFakeTimers();
                  resolve(mockBatchSellTrades);
                }, 2000);
              }),
          );

          fetchBatchSellTradesSpy.mockImplementationOnce(
            () =>
              new Promise((resolve) => {
                resolve(mockBatchSellTrades2);
              }),
          );

          // Call twice in a row
          await rootMessenger.call(
            'BridgeController:updateBatchSellTrades',
            [],
            false,
          );
          await rootMessenger.call(
            'BridgeController:updateBatchSellTrades',
            getMockBridgeQuotesErc20Erc20V2(),
            false,
          );

          await jest.advanceTimersByTimeAsync(1000);
          await flushPromises();

          expect(stopAllPollingSpy).toHaveBeenCalledTimes(0);
          expect(abortControllerSpy).toHaveBeenCalledTimes(1);
          expect(fetchBatchSellTradesSpy.mock.calls[0][0]).toStrictEqual([]);
          expect(startPollingSpy).not.toHaveBeenCalled();
          expect(bridgeController.state.batchSellTrades).toStrictEqual(
            mockBatchSellTrades2,
          );
          expect(
            bridgeController.state.batchSellTradesLoadingStatus,
          ).toStrictEqual(RequestStatus.FETCHED);
          expect(fetchAssetPricesSpy).toHaveBeenCalledTimes(0);

          await jest.advanceTimersByTimeAsync(1000);
          await flushPromises();

          expect(bridgeController.state).toStrictEqual({
            ...DEFAULT_BRIDGE_CONTROLLER_STATE,
            batchSellTradesLoadingStatus: RequestStatus.FETCHED,
            batchSellTrades: mockBatchSellTrades2,
          });

          expect(fetchBatchSellTradesSpy).toHaveBeenCalledTimes(2);
          expect(fetchBatchSellTradesSpy.mock.calls[0]).toStrictEqual([
            [],
            false,
            expect.any(AbortSignal),
            'extension',
            'AUTH_TOKEN',
            expect.any(Function),
            'https://bridge.api.cx.metamask.io',
            '13.8.0',
          ]);
          expect(fetchBatchSellTradesSpy.mock.calls[1]).toStrictEqual([
            getMockBridgeQuotesErc20Erc20V2(),
            false,
            expect.any(AbortSignal),
            'extension',
            'AUTH_TOKEN',
            expect.any(Function),
            'https://bridge.api.cx.metamask.io',
            '13.8.0',
          ]);
          expect(consoleLogSpy.mock.calls).toMatchInlineSnapshot(`[]`);
          expect(trackMetaMetricsFn).toHaveBeenCalledTimes(0);
          jest.useRealTimers();
        },
      );
    });

    it('should abort previous fetch if resetState is called', async function () {
      await withController(
        async ({
          controller: bridgeController,
          rootMessenger,
          stopAllPollingSpy,
          startPollingSpy,
          fetchAssetPricesSpy,
          consoleLogSpy,
        }) => {
          jest.useFakeTimers();
          const abortControllerSpy = jest.spyOn(
            AbortController.prototype,
            'abort',
          );
          const fetchBatchSellTradesSpy = jest.spyOn(
            fetchUtils,
            'fetchBatchSellTrades',
          );
          const mockBatchSellTrades = {
            transactions: [],
            fee: {
              amount: '100',
              asset: {
                symbol: 'USDC',
                chainId: 10,
                address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
                name: 'USD Coin',
                decimals: 6,
                assetId:
                  'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
              } as const,
            },
          };

          // Before initial fetch
          expect(bridgeController.state).toStrictEqual(
            DEFAULT_BRIDGE_CONTROLLER_STATE,
          );

          fetchBatchSellTradesSpy.mockImplementationOnce(
            () =>
              new Promise((resolve) => {
                jest.useRealTimers();
                setTimeout(() => {
                  jest.useFakeTimers();
                  resolve(mockBatchSellTrades);
                }, 2000);
              }),
          );

          // Reset after starting fetch
          await rootMessenger.call(
            'BridgeController:updateBatchSellTrades',
            [],
            false,
          );
          rootMessenger.call('BridgeController:resetState');

          await jest.advanceTimersByTimeAsync(1000);
          await flushPromises();

          expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
          expect(abortControllerSpy).toHaveBeenCalledTimes(2);
          expect(fetchBatchSellTradesSpy.mock.calls[0][0]).toStrictEqual([]);
          expect(startPollingSpy).not.toHaveBeenCalled();
          expect(bridgeController.state.batchSellTrades).toBeNull();
          expect(
            bridgeController.state.batchSellTradesLoadingStatus,
          ).toBeNull();
          expect(fetchAssetPricesSpy).toHaveBeenCalledTimes(0);

          await jest.advanceTimersByTimeAsync(1000);
          await flushPromises();

          expect(bridgeController.state).toStrictEqual(
            DEFAULT_BRIDGE_CONTROLLER_STATE,
          );

          expect(fetchBatchSellTradesSpy).toHaveBeenCalledTimes(1);
          expect(fetchBatchSellTradesSpy.mock.calls[0]).toStrictEqual([
            [],
            false,
            expect.any(AbortSignal),
            'extension',
            'AUTH_TOKEN',
            expect.any(Function),
            'https://bridge.api.cx.metamask.io',
            '13.8.0',
          ]);
          expect(consoleLogSpy.mock.calls).toMatchInlineSnapshot(`[]`);
          expect(trackMetaMetricsFn).toHaveBeenCalledTimes(0);
          jest.useRealTimers();
        },
      );
    });

    it('should reset batch trade states if fetch throws an error', async function () {
      await withController(
        async ({
          controller: bridgeController,
          rootMessenger,
          stopAllPollingSpy,
          startPollingSpy,
          fetchAssetPricesSpy,
          consoleLogSpy,
        }) => {
          jest.useFakeTimers();
          const abortControllerSpy = jest.spyOn(
            AbortController.prototype,
            'abort',
          );
          const fetchBatchSellTradesSpy = jest.spyOn(
            fetchUtils,
            'fetchBatchSellTrades',
          );
          const mockBatchSellTrades = {
            transactions: [],
            fee: {
              amount: '100',
              asset: {
                symbol: 'USDC',
                chainId: 10,
                address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
                name: 'USD Coin',
                decimals: 6,
                assetId:
                  'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
              } as const,
            },
          };

          expect(bridgeController.state).toStrictEqual(
            DEFAULT_BRIDGE_CONTROLLER_STATE,
          );

          fetchBatchSellTradesSpy.mockImplementationOnce(
            () =>
              new Promise((resolve) => {
                jest.useRealTimers();
                setTimeout(() => {
                  jest.useFakeTimers();
                  resolve(mockBatchSellTrades);
                }, 1000);
              }),
          );
          fetchBatchSellTradesSpy.mockRejectedValueOnce(
            new Error('Network error'),
          );

          // 1st fetch
          await rootMessenger.call(
            'BridgeController:updateBatchSellTrades',
            [],
            false,
          );

          await jest.advanceTimersByTimeAsync(1000);
          await flushPromises();

          expect(stopAllPollingSpy).toHaveBeenCalledTimes(0);
          expect(abortControllerSpy).toHaveBeenCalledTimes(0);
          expect(fetchBatchSellTradesSpy.mock.calls[0][0]).toStrictEqual([]);
          expect(startPollingSpy).not.toHaveBeenCalled();
          expect(bridgeController.state.batchSellTrades).toStrictEqual(
            mockBatchSellTrades,
          );
          expect(fetchAssetPricesSpy).toHaveBeenCalledTimes(0);
          expect(bridgeController.state.batchSellTradesLoadingStatus).toBe(
            RequestStatus.FETCHED,
          );

          expect(bridgeController.state).toStrictEqual({
            ...DEFAULT_BRIDGE_CONTROLLER_STATE,
            batchSellTrades: mockBatchSellTrades,
            batchSellTradesLoadingStatus: RequestStatus.FETCHED,
          });

          // 2nd fetch
          await rootMessenger.call(
            'BridgeController:updateBatchSellTrades',
            getMockBridgeQuotesErc20Erc20V2(),
            false,
          );

          await jest.advanceTimersByTimeAsync(2000);
          await flushPromises();

          expect(stopAllPollingSpy).toHaveBeenCalledTimes(0);
          expect(abortControllerSpy).toHaveBeenCalledTimes(1);
          expect(fetchBatchSellTradesSpy.mock.calls[1][0]).toStrictEqual(
            getMockBridgeQuotesErc20Erc20V2(),
          );
          expect(startPollingSpy).not.toHaveBeenCalled();
          expect(bridgeController.state.batchSellTrades).toBeNull();
          expect(bridgeController.state.batchSellTradesLoadingStatus).toBe(
            RequestStatus.ERROR,
          );
          expect(fetchAssetPricesSpy).toHaveBeenCalledTimes(0);

          expect(bridgeController.state).toStrictEqual({
            ...DEFAULT_BRIDGE_CONTROLLER_STATE,
            batchSellTradesLoadingStatus: RequestStatus.ERROR,
          });

          expect(fetchBatchSellTradesSpy).toHaveBeenCalledTimes(2);
          expect(consoleLogSpy.mock.calls).toMatchInlineSnapshot(`
            [
              [
                "Failed to fetch batch sell trades",
                [Error: Network error],
              ],
            ]
          `);
          expect(trackMetaMetricsFn).toHaveBeenCalledTimes(0);
          jest.useRealTimers();
        },
      );
    });
  });
});
