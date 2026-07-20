import { BigNumber } from '@ethersproject/bignumber';
import * as ethersContractUtils from '@ethersproject/contracts';
import { SolScope } from '@metamask/keyring-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { abiERC20 } from '@metamask/metamask-eth-abis';

import { flushPromises } from '../../../tests/helpers';
import {
  mockBridgeQuotesErc20Erc20V1,
  getMockBridgeQuotesErc20Erc20V2,
} from '../tests/mock-quotes-erc20-erc20';
import {
  getMockBridgeQuotesNativeErc20V2,
  mockBridgeQuotesNativeErc20V1,
} from '../tests/mock-quotes-native-erc20';
import {
  getMockBridgeQuotesNativeErc20EthV2,
  mockBridgeQuotesNativeErc20EthV1,
} from '../tests/mock-quotes-native-erc20-eth';
import {
  advanceToNthTimer,
  advanceToNthTimerThenFlush,
  mockSseEventSource,
  mockSseEventSourceWithComplete,
  mockSseEventSourceWithMultipleDelays,
  mockSseEventSourceWithWarnings,
  mockSseServerError,
} from '../tests/mock-sse';
import { BridgeController } from './bridge-controller';
import {
  BridgeClientId,
  BRIDGE_PROD_API_BASE_URL,
  DEFAULT_BRIDGE_CONTROLLER_STATE,
  ETH_USDT_ADDRESS,
} from './constants/bridge';
import { ChainId, RequestStatus } from './types';
import type { BridgeControllerMessenger } from './types';
import * as balanceUtils from './utils/balance';
import {
  formatChainIdToCaip,
  formatChainIdToDec,
} from './utils/caip-formatters';
import * as featureFlagUtils from './utils/feature-flags';
import * as fetchUtils from './utils/fetch';
import { FeatureId } from './validators/feature-flags';
import { validateQuoteResponseV1 } from './validators/quote-response-v1';
import { QuoteStreamCompleteReason } from './validators/quote-stream-complete';
import { TokenFeatureType } from './validators/token-feature';
import type { TxData } from './validators/trade';

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
  feature_id: FeatureId.UNIFIED_SWAP_BRIDGE,
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

describe('BridgeController SSE', function () {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.resetAllMocks();
  });

  it('should trigger quote polling if request is valid', async function () {
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
          return mockSseEventSource(mockBridgeQuotesNativeErc20V1);
        });
        await rootMessenger.call(
          'BridgeController:updateBridgeQuoteRequestParams',
          quoteRequest,
          metricsContext,
        );

        // Before polling starts
        expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
        expect(startPollingSpy).toHaveBeenCalledTimes(1);
        expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
        expect(startPollingSpy).toHaveBeenCalledWith({
          quoteRequests: [
            {
              ...quoteRequest,
              insufficientBal: false,
            },
          ],
          context: metricsContext,
        });
        expect(fetchAssetPricesSpy).toHaveBeenCalledTimes(0);
        const expectedState = {
          ...DEFAULT_BRIDGE_CONTROLLER_STATE,
          quoteRequest: [{ ...quoteRequest, insufficientBal: false }],
          quotesLoadingStatus: RequestStatus.LOADING,
        };
        expect(bridgeController.state).toStrictEqual(expectedState);

        // Loading state
        jest.advanceTimersByTime(1000);
        await advanceToNthTimerThenFlush();
        expect(fetchBridgeQuotesSpy).toHaveBeenCalledWith(
          mockFetchFn,
          [
            {
              ...quoteRequest,
              insufficientBal: false,
              resetApproval: false,
            },
          ],
          expect.any(AbortSignal),
          FeatureId.UNIFIED_SWAP_BRIDGE,
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
        expect(fetchAssetPricesSpy).toHaveBeenCalledTimes(1);
        expect(bridgeController.state).toStrictEqual({
          ...expectedState,
          quotesInitialLoadTime: 6000,
          quoteRequest: [
            {
              ...quoteRequest,
              insufficientBal: false,
              resetApproval: false,
            },
          ],
          quotes: getMockBridgeQuotesNativeErc20V2().map((quote) => ({
            ...quote,
            l1GasFeesInHexWei: '0x1',
            resetApproval: undefined,
            featureId: FeatureId.UNIFIED_SWAP_BRIDGE,
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
      },
    );
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
    'should append resetApproval when %s USDT on Ethereum (%s, %s)',
    async function (
      _: string,
      allowance: string,
      destChainId: string,
      tradeData?: string,
      resetApproval: boolean = true,
      mockContractCalls: number = 3,
      srcTokenAddress: string = ETH_USDT_ADDRESS,
    ) {
      await withController(
        async ({
          controller: bridgeController,
          rootMessenger,
          stopAllPollingSpy,
          startPollingSpy,
          fetchBridgeQuotesSpy,
          consoleLogSpy,
        }) => {
          const mockUSDTQuoteResponse = getMockBridgeQuotesErc20Erc20V2({
            quote: {
              srcAsset: {
                address: ETH_USDT_ADDRESS,
                assetId:
                  `${formatChainIdToCaip(1)}/erc20:${srcTokenAddress}` as const,
                symbol: 'USDT',
                name: 'Tether USD',
                decimals: 6,
                chainId: 1,
                iconUrl: 'https://media.socket.tech/tokens/all/USDT',
              },
              srcChainId: 1,
            },
          });
          mockFetchFn.mockImplementationOnce(async () => {
            return mockSseEventSource(mockUSDTQuoteResponse);
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
                allowance: jest
                  .fn()
                  .mockResolvedValue(BigNumber.from(allowance)),
              };
            });

          const usdtQuoteRequest = {
            ...quoteRequest,
            srcTokenAddress,
            srcChainId: '0x1',
            destChainId,
          };

          await rootMessenger.call(
            'BridgeController:updateBridgeQuoteRequestParams',
            usdtQuoteRequest,
            metricsContext,
          );

          // Before polling starts
          expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
          expect(startPollingSpy).toHaveBeenCalledTimes(1);
          expect(startPollingSpy).toHaveBeenCalledWith({
            quoteRequests: [
              {
                ...usdtQuoteRequest,
                insufficientBal: false,
                resetApproval,
              },
            ],
            context: metricsContext,
          });
          const expectedState = {
            ...DEFAULT_BRIDGE_CONTROLLER_STATE,
            quoteRequest: [
              { ...usdtQuoteRequest, insufficientBal: false, resetApproval },
            ],
            quotesLoadingStatus: RequestStatus.LOADING,
          };
          expect(bridgeController.state).toStrictEqual(expectedState);

          // Loading state
          jest.advanceTimersByTime(1000);
          await advanceToNthTimerThenFlush();
          expect(fetchBridgeQuotesSpy).toHaveBeenCalledWith(
            mockFetchFn,
            [
              {
                ...usdtQuoteRequest,
                insufficientBal: false,
                resetApproval,
              },
            ],
            expect.any(AbortSignal),
            FeatureId.UNIFIED_SWAP_BRIDGE,
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
          const { quotesLastFetched: t1, quoteRequest: stateQuoteRequest } =
            bridgeController.state;
          expect(stateQuoteRequest).toStrictEqual([
            {
              ...usdtQuoteRequest,
              insufficientBal: false,
              resetApproval,
            },
          ]);
          expect(t1).toBeCloseTo(Date.now() - 1000);

          // After first fetch
          jest.advanceTimersByTime(5000);
          await flushPromises();
          expect(bridgeController.state).toStrictEqual({
            ...expectedState,
            quotesInitialLoadTime: 6000,
            quoteRequest: [
              {
                ...usdtQuoteRequest,
                insufficientBal: false,
                resetApproval,
              },
            ],
            quotes: getMockBridgeQuotesErc20Erc20V2({
              quote: {
                srcAsset: {
                  address: ETH_USDT_ADDRESS,
                  assetId: `eip155:1/erc20:${ETH_USDT_ADDRESS}`,
                  symbol: 'USDT',
                  name: 'Tether USD',
                  decimals: 6,
                  chainId: 1,
                  iconUrl: 'https://media.socket.tech/tokens/all/USDT',
                },
                srcChainId: 1,
                destChainId: formatChainIdToDec(destChainId),
              },
            }).map((quote) => ({
              ...quote,
              featureId: FeatureId.UNIFIED_SWAP_BRIDGE,
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
    },
  );

  it('should use resetApproval and insufficientBal fallback values if provider is not found', async function () {
    await withController(
      async ({
        controller: bridgeController,
        rootMessenger,
        stopAllPollingSpy,
        startPollingSpy,
        fetchBridgeQuotesSpy,
        consoleLogSpy,
      }) => {
        messengerCallMock.mockImplementation(
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
        const mockUSDTQuoteResponse = mockBridgeQuotesErc20Erc20V1.map(
          (quote) => ({
            ...quote,
            quote: {
              ...quote.quote,
              srcAsset: {
                address: ETH_USDT_ADDRESS,
                assetId: `eip155:1/erc20:${ETH_USDT_ADDRESS}` as const,
                chainId: 1,
                symbol: 'USDT',
                name: 'Tether USD',
                decimals: 6,
                iconUrl: 'https://media.socket.tech/tokens/all/USDT',
              },
              srcChainId: 1,
            },
          }),
        );
        mockUSDTQuoteResponse.forEach((quote) =>
          validateQuoteResponseV1(quote),
        );

        mockFetchFn.mockImplementationOnce(async () => {
          return mockSseEventSource(mockUSDTQuoteResponse);
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

        await rootMessenger.call(
          'BridgeController:updateBridgeQuoteRequestParams',
          usdtQuoteRequest,
          metricsContext,
        );

        // Before polling starts
        expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
        expect(startPollingSpy).toHaveBeenCalledTimes(1);
        expect(startPollingSpy).toHaveBeenCalledWith({
          quoteRequests: [
            {
              ...usdtQuoteRequest,
              insufficientBal: true,
              resetApproval: true,
            },
          ],
          context: metricsContext,
        });
        const expectedState = {
          ...DEFAULT_BRIDGE_CONTROLLER_STATE,
          quoteRequest: [
            { ...usdtQuoteRequest, insufficientBal: true, resetApproval: true },
          ],
          quotesLoadingStatus: RequestStatus.LOADING,
        };
        expect(bridgeController.state).toStrictEqual(expectedState);

        // Loading state
        jest.advanceTimersByTime(1000);
        // Wait for JWT token retrieval
        await advanceToNthTimerThenFlush();
        expect(fetchBridgeQuotesSpy).toHaveBeenCalledWith(
          mockFetchFn,
          [
            {
              ...usdtQuoteRequest,
              insufficientBal: true,
              resetApproval: true,
            },
          ],
          expect.any(AbortSignal),
          FeatureId.UNIFIED_SWAP_BRIDGE,
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
        const { quotesLastFetched: t1, quoteRequest: stateQuoteRequest } =
          bridgeController.state;
        expect(stateQuoteRequest[0]).toStrictEqual({
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
          quoteRequest: [
            {
              ...usdtQuoteRequest,
              insufficientBal: true,
              resetApproval: true,
            },
          ],
          quotes: getMockBridgeQuotesErc20Erc20V2({
            quote: {
              srcAsset: {
                address: ETH_USDT_ADDRESS,
                assetId: `eip155:1/erc20:${ETH_USDT_ADDRESS}`,
                name: 'Tether USD',
                decimals: 6,
                symbol: 'USDT',
                chainId: 1,
                iconUrl: 'https://media.socket.tech/tokens/all/USDT',
              },
              srcChainId: 1,
            },
          }).map((quote) => ({
            ...quote,
            featureId: FeatureId.UNIFIED_SWAP_BRIDGE,
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
      },
    );
  });

  it('should replace all stale quotes after a refresh and first quote is received', async function () {
    await withController(
      async ({
        controller: bridgeController,
        rootMessenger,
        stopAllPollingSpy,
        startPollingSpy,
        hasSufficientBalanceSpy,
        fetchBridgeQuotesSpy,
        consoleLogSpy,
      }) => {
        mockFetchFn.mockImplementationOnce(async () => {
          return mockSseEventSource(
            mockBridgeQuotesNativeErc20V1,
            FIRST_FETCH_DELAY,
          );
        });
        mockFetchFn.mockImplementationOnce(async () => {
          return mockSseEventSourceWithMultipleDelays(
            mockBridgeQuotesNativeErc20EthV1,
            SECOND_FETCH_DELAY,
          );
        });
        await rootMessenger.call(
          'BridgeController:updateBridgeQuoteRequestParams',
          quoteRequest,
          metricsContext,
        );
        // Wait for JWT token retrieval
        await advanceToNthTimerThenFlush();
        // 1st fetch
        jest.advanceTimersByTime(FIRST_FETCH_DELAY);
        await flushPromises();
        expect(bridgeController.state.quotes).toStrictEqual(
          getMockBridgeQuotesNativeErc20V2().map((quote) => ({
            ...quote,
            l1GasFeesInHexWei: '0x1',
            resetApproval: undefined,
            featureId: FeatureId.UNIFIED_SWAP_BRIDGE,
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
          quoteRequest: [
            {
              ...quoteRequest,
              insufficientBal: false,
              resetApproval: false,
            },
          ],
          quotes: [getMockBridgeQuotesNativeErc20EthV2()[0]].map((quote) => ({
            ...quote,
            resetApproval: undefined,
            featureId: FeatureId.UNIFIED_SWAP_BRIDGE,
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
          quotes: getMockBridgeQuotesNativeErc20EthV2().map((quote) => ({
            ...quote,
            resetApproval: undefined,
            featureId: FeatureId.UNIFIED_SWAP_BRIDGE,
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
      },
    );
  });

  it('should reset quotes list if quote refresh fails', async function () {
    await withController(
      async ({
        controller: bridgeController,
        rootMessenger,
        stopAllPollingSpy,
        startPollingSpy,
        hasSufficientBalanceSpy,
        fetchBridgeQuotesSpy,
        consoleLogSpy,
      }) => {
        mockFetchFn.mockImplementationOnce(async () => {
          return mockSseEventSource(
            mockBridgeQuotesNativeErc20V1,
            FIRST_FETCH_DELAY,
          );
        });
        mockFetchFn.mockImplementationOnce(async () => {
          return mockSseEventSourceWithMultipleDelays(
            mockBridgeQuotesNativeErc20EthV1,
            SECOND_FETCH_DELAY,
          );
        });
        mockFetchFn.mockRejectedValueOnce('Network error');
        await rootMessenger.call(
          'BridgeController:updateBridgeQuoteRequestParams',
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
          getMockBridgeQuotesNativeErc20EthV2().map((quote) => ({
            ...quote,
            resetApproval: undefined,
            featureId: FeatureId.UNIFIED_SWAP_BRIDGE,
          })),
        );
        const t2 = bridgeController.state.quotesLastFetched;

        // 3nd fetch throws an error
        await advanceToNthTimerThenFlush();
        expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(3);
        expect(bridgeController.state).toStrictEqual({
          ...DEFAULT_BRIDGE_CONTROLLER_STATE,
          quotesInitialLoadTime: FIRST_FETCH_DELAY,
          quoteRequest: [
            {
              ...quoteRequest,
              insufficientBal: false,
              resetApproval: false,
            },
          ],
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
      },
    );
  });

  it('should reset and refetch quotes after quote request is changed', async function () {
    await withController(
      async ({
        controller: bridgeController,
        rootMessenger,
        stopAllPollingSpy,
        startPollingSpy,
        hasSufficientBalanceSpy,
        fetchBridgeQuotesSpy,
        consoleLogSpy,
      }) => {
        mockFetchFn.mockImplementationOnce(async () => {
          return mockSseEventSource(
            mockBridgeQuotesNativeErc20V1,
            FIRST_FETCH_DELAY,
          );
        });
        mockFetchFn.mockImplementationOnce(async () => {
          return mockSseEventSourceWithMultipleDelays(
            mockBridgeQuotesNativeErc20EthV1,
            SECOND_FETCH_DELAY,
          );
        });
        mockFetchFn.mockRejectedValueOnce('Network error');
        mockFetchFn.mockImplementationOnce(async () => {
          return mockSseEventSourceWithMultipleDelays(
            [
              ...mockBridgeQuotesNativeErc20V1,
              ...mockBridgeQuotesNativeErc20V1,
            ],
            THIRD_FETCH_DELAY,
          );
        });

        await rootMessenger.call(
          'BridgeController:updateBridgeQuoteRequestParams',
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
          quoteRequest: [
            {
              ...quoteRequest,
              srcTokenAmount: '10',
              insufficientBal: true,
            },
          ],
          assetExchangeRates: {},
        };
        // Start new quote request
        await rootMessenger.call(
          'BridgeController:updateBridgeQuoteRequestParams',
          { ...quoteRequest, srcTokenAmount: '10' },
          {
            stx_enabled: true,
            token_symbol_source: 'ETH',
            token_symbol_destination: 'USDC',
            security_warnings: [],
            usd_amount_source: 100,
            token_security_type_destination: null,
            feature_id: FeatureId.UNIFIED_SWAP_BRIDGE,
          },
        );
        // Right after state update, before fetch has started
        expect(bridgeController.state).toStrictEqual(expectedState);
        advanceToNthTimer();
        expect(bridgeController.state).toStrictEqual({
          ...expectedState,
          quoteRequest: [
            {
              ...quoteRequest,
              srcTokenAmount: '10',
              insufficientBal: true,
              resetApproval: false,
            },
          ],
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
              ...getMockBridgeQuotesNativeErc20V2()[0],
              l1GasFeesInHexWei: '0x1',
              resetApproval: undefined,
              featureId: FeatureId.UNIFIED_SWAP_BRIDGE,
            },
          ],
          quotesRefreshCount: 0,
          quotesLoadingStatus: RequestStatus.LOADING,
          quoteRequest: [
            {
              ...quoteRequest,
              srcTokenAmount: '10',
              insufficientBal: true,
              resetApproval: false,
            },
          ],
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
            ...getMockBridgeQuotesNativeErc20V2(),
            ...getMockBridgeQuotesNativeErc20V2(),
          ].map((quote) => ({
            ...quote,
            l1GasFeesInHexWei: '0x1',
            resetApproval: undefined,
            featureId: FeatureId.UNIFIED_SWAP_BRIDGE,
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
      },
    );
  });

  it('should publish validation failures', async function () {
    await withController(
      async ({
        controller: bridgeController,
        rootMessenger,
        stopAllPollingSpy,
        startPollingSpy,
        hasSufficientBalanceSpy,
        fetchBridgeQuotesSpy,
        consoleLogSpy,
      }) => {
        mockFetchFn.mockImplementationOnce(async () => {
          return mockSseEventSource(
            mockBridgeQuotesNativeErc20V1,
            FIRST_FETCH_DELAY,
          );
        });
        mockFetchFn.mockImplementationOnce(async () => {
          return mockSseEventSourceWithMultipleDelays(
            mockBridgeQuotesNativeErc20EthV1,
            SECOND_FETCH_DELAY,
          );
        });
        mockFetchFn.mockRejectedValueOnce('Network error');
        mockFetchFn.mockImplementationOnce(async () => {
          return mockSseEventSourceWithMultipleDelays(
            [
              ...mockBridgeQuotesNativeErc20V1,
              ...mockBridgeQuotesNativeErc20V1,
            ],
            THIRD_FETCH_DELAY,
          );
        });
        mockFetchFn.mockImplementationOnce(async () => {
          const { quote, ...rest } = mockBridgeQuotesNativeErc20V1[0];
          return mockSseEventSourceWithMultipleDelays(
            [
              {
                ...mockBridgeQuotesNativeErc20EthV1[1],
                trade: { abc: '123' } as unknown as TxData,
              },
              '' as unknown as never,
              mockBridgeQuotesNativeErc20EthV1[0],
              rest as unknown as never,
            ],
            FOURTH_FETCH_DELAY,
          );
        });
        await rootMessenger.call(
          'BridgeController:updateBridgeQuoteRequestParams',
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
        await rootMessenger.call(
          'BridgeController:updateBridgeQuoteRequestParams',
          { ...quoteRequest, srcTokenAmount: '10' },
          {
            stx_enabled: true,
            token_symbol_source: 'ETH',
            token_symbol_destination: 'USDC',
            security_warnings: [],
            usd_amount_source: 100,
            token_security_type_destination: 'test',
            feature_id: FeatureId.UNIFIED_SWAP_BRIDGE,
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
          [
            ...getMockBridgeQuotesNativeErc20V2(),
            ...getMockBridgeQuotesNativeErc20V2(),
          ].map((quote) => ({
            ...quote,
            featureId: FeatureId.UNIFIED_SWAP_BRIDGE,
            l1GasFeesInHexWei: '0x1',
            resetApproval: undefined,
          })),
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
          quoteRequest: [
            {
              ...quoteRequest,
              srcTokenAmount: '10',
              insufficientBal: false,
              resetApproval: false,
            },
          ],
          quotes: [getMockBridgeQuotesNativeErc20EthV2()[0]].map((quote) => ({
            ...quote,
            resetApproval: undefined,
            featureId: FeatureId.UNIFIED_SWAP_BRIDGE,
          })),
          quotesRefreshCount: 1,
          quoteFetchError: null,
          quotesLoadingStatus: RequestStatus.LOADING,
          assetExchangeRates,
          quotesLastFetched: expect.any(Number),
          tokenSecurityTypeDestination: 'test',
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
              "At path: quote.src (type) -- Expected an object, but received: undefined",
              "At path: quote.dest (type) -- Expected an object, but received: undefined",
              "At path: quote.feeData.metabridge (type) -- Expected an array value, but received: [object Object]",
              "At path: quote.aggregator (type) -- Expected a string, but received: undefined",
              "At path: quote.protocols (type) -- Expected an array value, but received: undefined",
              "At path: quote.steps.0.src (type) -- Expected an object, but received: undefined",
              "At path: quote.steps.0.dest (type) -- Expected an object, but received: undefined",
              "At path: quote.steps.1.src (type) -- Expected an object, but received: undefined",
              "At path: quote.steps.1.dest (type) -- Expected an object, but received: undefined",
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
              "At path: <root> (type) -- Expected an object, but received: """,
            ],
          ]
        `);
        expect(consoleWarnSpy.mock.calls[2]).toMatchInlineSnapshot(`
          [
            "Quote validation failed",
            [
              "At path: quote (type) -- Expected an object, but received: undefined",
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
      },
    );
  });

  it('should rethrow error from server', async function () {
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
          return mockSseServerError('timeout from server');
        });
        await rootMessenger.call(
          'BridgeController:updateBridgeQuoteRequestParams',
          quoteRequest,
          metricsContext,
        );

        // Before polling starts
        expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
        expect(startPollingSpy).toHaveBeenCalledTimes(1);
        expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
        expect(startPollingSpy).toHaveBeenCalledWith({
          quoteRequests: [
            {
              ...quoteRequest,
              insufficientBal: false,
              resetApproval: false,
            },
          ],
          context: metricsContext,
        });
        const expectedState = {
          ...DEFAULT_BRIDGE_CONTROLLER_STATE,
          quoteRequest: [
            {
              ...quoteRequest,
              insufficientBal: false,
              resetApproval: false,
            },
          ],
          assetExchangeRates: {},
          quotesLoadingStatus: RequestStatus.LOADING,
        };
        expect(bridgeController.state).toStrictEqual(expectedState);

        // Loading state
        jest.advanceTimersByTime(1000);
        // Wait for JWT token retrieval
        await advanceToNthTimerThenFlush();
        expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
        expect(bridgeController.state.quotesLoadingStatus).toBe(
          RequestStatus.LOADING,
        );
        expect(fetchBridgeQuotesSpy).toHaveBeenCalledWith(
          mockFetchFn,
          [
            {
              ...quoteRequest,
              insufficientBal: false,
              resetApproval: false,
            },
          ],
          expect.any(AbortSignal),
          FeatureId.UNIFIED_SWAP_BRIDGE,
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
          quoteRequest: [
            {
              ...quoteRequest,
              insufficientBal: false,
              resetApproval: false,
            },
          ],
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
      },
    );
  });

  it('should populate tokenWarnings from token_warning SSE events', async function () {
    await withController(async ({ controller: bridgeController }) => {
      const mockWarning = {
        feature_id: 'HONEYPOT',
        type: TokenFeatureType.MALICIOUS,
        description: 'Token is a honeypot',
      };
      mockFetchFn.mockImplementationOnce(async () => {
        return mockSseEventSourceWithWarnings(mockBridgeQuotesNativeErc20V1, [
          mockWarning,
        ]);
      });

      await bridgeController.updateBridgeQuoteRequestParams(
        quoteRequest,
        metricsContext,
      );

      expect(bridgeController.state.tokenWarnings).toStrictEqual([]);

      jest.advanceTimersByTime(1000);
      await advanceToNthTimerThenFlush();

      // After stream completes
      jest.advanceTimersByTime(5000);
      await flushPromises();

      expect(bridgeController.state.tokenWarnings).toStrictEqual([mockWarning]);
      expect(bridgeController.state.quotes.length).toBeGreaterThan(0);
    });
  });

  it('should clear tokenWarnings on resetState', async function () {
    await withController(async ({ controller: bridgeController }) => {
      const mockWarning = {
        feature_id: 'HONEYPOT',
        type: TokenFeatureType.MALICIOUS,
        description: 'Token is a honeypot',
      };
      mockFetchFn.mockImplementationOnce(async () => {
        return mockSseEventSourceWithWarnings(mockBridgeQuotesNativeErc20V1, [
          mockWarning,
        ]);
      });

      await bridgeController.updateBridgeQuoteRequestParams(
        quoteRequest,
        metricsContext,
      );

      jest.advanceTimersByTime(1000);
      await advanceToNthTimerThenFlush();
      jest.advanceTimersByTime(5000);
      await flushPromises();

      expect(bridgeController.state.tokenWarnings).toStrictEqual([mockWarning]);

      bridgeController.resetState();
      expect(bridgeController.state.tokenWarnings).toStrictEqual([]);
    });
  });

  it('should deduplicate tokenWarnings with the same feature_id', async function () {
    await withController(async ({ controller: bridgeController }) => {
      const mockWarning = {
        feature_id: 'HONEYPOT',
        type: TokenFeatureType.MALICIOUS,
        description: 'Token is a honeypot',
      };
      const duplicateWarning = {
        feature_id: 'HONEYPOT',
        type: TokenFeatureType.MALICIOUS,
        description: 'Duplicate warning',
      };
      mockFetchFn.mockImplementationOnce(async () => {
        return mockSseEventSourceWithWarnings(mockBridgeQuotesNativeErc20V1, [
          mockWarning,
          duplicateWarning,
        ]);
      });

      await bridgeController.updateBridgeQuoteRequestParams(
        quoteRequest,
        metricsContext,
      );

      jest.advanceTimersByTime(1000);
      await advanceToNthTimerThenFlush();
      jest.advanceTimersByTime(5000);
      await flushPromises();

      expect(bridgeController.state.tokenWarnings).toStrictEqual([mockWarning]);
    });
  });

  it('should deduplicate tokenWarnings with the same feature_id but different type', async function () {
    await withController(async ({ controller: bridgeController }) => {
      const maliciousWarning = {
        feature_id: 'HONEYPOT',
        type: TokenFeatureType.MALICIOUS,
        description: 'Token is a honeypot',
      };
      const infoWarning = {
        feature_id: 'HONEYPOT',
        type: TokenFeatureType.INFO,
        description: 'Informational notice',
      };
      mockFetchFn.mockImplementationOnce(async () => {
        return mockSseEventSourceWithWarnings(mockBridgeQuotesNativeErc20V1, [
          maliciousWarning,
          infoWarning,
        ]);
      });

      await bridgeController.updateBridgeQuoteRequestParams(
        quoteRequest,
        metricsContext,
      );

      jest.advanceTimersByTime(1000);
      await advanceToNthTimerThenFlush();
      jest.advanceTimersByTime(5000);
      await flushPromises();

      expect(bridgeController.state.tokenWarnings).toStrictEqual([
        maliciousWarning,
      ]);
    });
  });

  it('should keep tokenWarnings with the same type but different feature_id', async function () {
    await withController(async ({ controller: bridgeController }) => {
      const honeypotWarning = {
        feature_id: 'HONEYPOT',
        type: TokenFeatureType.MALICIOUS,
        description: 'Token is a honeypot',
      };
      const fakeTokenWarning = {
        feature_id: 'FAKE_TOKEN',
        type: TokenFeatureType.MALICIOUS,
        description: 'Possible fake token',
      };
      mockFetchFn.mockImplementationOnce(async () => {
        return mockSseEventSourceWithWarnings(mockBridgeQuotesNativeErc20V1, [
          honeypotWarning,
          fakeTokenWarning,
        ]);
      });

      await bridgeController.updateBridgeQuoteRequestParams(
        quoteRequest,
        metricsContext,
      );

      jest.advanceTimersByTime(1000);
      await advanceToNthTimerThenFlush();
      jest.advanceTimersByTime(5000);
      await flushPromises();

      expect(bridgeController.state.tokenWarnings).toStrictEqual([
        honeypotWarning,
        fakeTokenWarning,
      ]);
    });
  });

  it('should populate quoteStreamComplete from complete SSE event', async function () {
    await withController(async ({ controller: bridgeController }) => {
      const mockComplete = {
        quoteCount: 2,
        hasQuotes: true,
        reason: QuoteStreamCompleteReason.RETRY,
        context: { source: 'bridge-api' },
      };
      mockFetchFn.mockImplementationOnce(async () => {
        return mockSseEventSourceWithComplete(
          mockBridgeQuotesNativeErc20V1,
          [],
          mockComplete,
        );
      });

      await bridgeController.updateBridgeQuoteRequestParams(
        quoteRequest,
        metricsContext,
      );

      expect(bridgeController.state.quoteStreamComplete).toBeNull();

      jest.advanceTimersByTime(1000);
      await advanceToNthTimerThenFlush();
      jest.advanceTimersByTime(5000);
      await flushPromises();

      expect(bridgeController.state.quoteStreamComplete).toStrictEqual(
        mockComplete,
      );
      expect(bridgeController.state.quotes.length).toBeGreaterThan(0);
    });
  });

  it('should populate quoteStreamComplete with optional fields omitted', async function () {
    await withController(async ({ controller: bridgeController }) => {
      const mockComplete = {
        quoteCount: 0,
        hasQuotes: false,
      };
      mockFetchFn.mockImplementationOnce(async () => {
        return mockSseEventSourceWithComplete([], [], mockComplete);
      });

      await bridgeController.updateBridgeQuoteRequestParams(
        quoteRequest,
        metricsContext,
      );

      jest.advanceTimersByTime(1000);
      await advanceToNthTimerThenFlush();
      jest.advanceTimersByTime(5000);
      await flushPromises();

      expect(bridgeController.state.quoteStreamComplete).toStrictEqual(
        mockComplete,
      );
    });
  });

  it('should clear quoteStreamComplete on resetState', async function () {
    await withController(async ({ controller: bridgeController }) => {
      const mockComplete = {
        quoteCount: 2,
        hasQuotes: true,
      };
      mockFetchFn.mockImplementationOnce(async () => {
        return mockSseEventSourceWithComplete(
          mockBridgeQuotesNativeErc20V1,
          [],
          mockComplete,
        );
      });

      await bridgeController.updateBridgeQuoteRequestParams(
        quoteRequest,
        metricsContext,
      );

      jest.advanceTimersByTime(1000);
      await advanceToNthTimerThenFlush();
      jest.advanceTimersByTime(5000);
      await flushPromises();

      expect(bridgeController.state.quoteStreamComplete).toStrictEqual(
        mockComplete,
      );

      bridgeController.resetState();
      expect(bridgeController.state.quoteStreamComplete).toBeNull();
    });
  });

  it('should clear quoteStreamComplete at the start of each fetch', async function () {
    await withController(async ({ controller: bridgeController }) => {
      const mockComplete = {
        quoteCount: 2,
        hasQuotes: true,
      };
      mockFetchFn.mockImplementation(async () => {
        return mockSseEventSourceWithComplete(
          mockBridgeQuotesNativeErc20V1,
          [],
          mockComplete,
        );
      });

      await bridgeController.updateBridgeQuoteRequestParams(
        quoteRequest,
        metricsContext,
      );

      jest.advanceTimersByTime(1000);
      await advanceToNthTimerThenFlush();
      jest.advanceTimersByTime(5000);
      await flushPromises();

      expect(bridgeController.state.quoteStreamComplete).toStrictEqual(
        mockComplete,
      );

      // Trigger a second fetch — quoteStreamComplete should be cleared before the stream completes
      jest.advanceTimersByTime(1000);
      await advanceToNthTimerThenFlush();

      expect(bridgeController.state.quoteStreamComplete).toBeNull();

      jest.advanceTimersByTime(5000);
      await flushPromises();

      expect(bridgeController.state.quoteStreamComplete).toStrictEqual(
        mockComplete,
      );
    });
  });
});
