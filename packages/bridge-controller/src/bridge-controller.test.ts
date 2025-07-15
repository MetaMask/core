/* eslint-disable jest/no-restricted-matchers */
/* eslint-disable jest/no-conditional-in-test */
import { Contract } from '@ethersproject/contracts';
import {
  EthAccountType,
  EthScope,
  SolAccountType,
  SolScope,
} from '@metamask/keyring-api';
import nock from 'nock';

import { BridgeController } from './bridge-controller';
import {
  BridgeClientId,
  BRIDGE_PROD_API_BASE_URL,
  DEFAULT_BRIDGE_CONTROLLER_STATE,
} from './constants/bridge';
import { SWAPS_API_V2_BASE_URL } from './constants/swaps';
import * as selectors from './selectors';
import {
  ChainId,
  RequestStatus,
  SortOrder,
  StatusTypes,
  type BridgeControllerMessenger,
  type QuoteResponse,
} from './types';
import * as balanceUtils from './utils/balance';
import { getNativeAssetForChainId, isSolanaChainId } from './utils/bridge';
import { formatChainIdToCaip } from './utils/caip-formatters';
import * as fetchUtils from './utils/fetch';
import {
  MetaMetricsSwapsEventSource,
  MetricsActionType,
  MetricsSwapType,
  UnifiedSwapBridgeEventName,
} from './utils/metrics/constants';
import { flushPromises } from '../../../tests/helpers';
import { handleFetch } from '../../controller-utils/src';
import mockBridgeQuotesErc20Native from '../tests/mock-quotes-erc20-native.json';
import mockBridgeQuotesNativeErc20Eth from '../tests/mock-quotes-native-erc20-eth.json';
import mockBridgeQuotesNativeErc20 from '../tests/mock-quotes-native-erc20.json';
import mockBridgeQuotesSolErc20 from '../tests/mock-quotes-sol-erc20.json';

const EMPTY_INIT_STATE = DEFAULT_BRIDGE_CONTROLLER_STATE;

jest.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

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
const trackMetaMetricsFn = jest.fn();
let fetchAssetPricesSpy: jest.SpyInstance;

describe('BridgeController', function () {
  let bridgeController: BridgeController;

  beforeAll(function () {
    bridgeController = new BridgeController({
      messenger: messengerMock,
      getLayer1GasFee: getLayer1GasFeeMock,
      clientId: BridgeClientId.EXTENSION,
      fetchFn: mockFetchFn,
      trackMetaMetricsFn,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();

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

    fetchAssetPricesSpy = jest
      .spyOn(fetchUtils, 'fetchAssetPrices')
      .mockResolvedValue({
        'eip155:10/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': {
          usd: '100',
        },
      });
    bridgeController.resetState();
  });

  it('constructor should setup correctly', function () {
    expect(bridgeController.state).toStrictEqual(EMPTY_INIT_STATE);
  });

  it('setBridgeFeatureFlags should fetch and set the bridge feature flags', async function () {
    const bridgeConfig = {
      minimumVersion: '0.0.0',
      maxRefreshCount: 3,
      refreshRate: 3,
      support: true,
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
    const remoteFeatureFlagControllerState = {
      cacheTimestamp: 1745515389440,
      remoteFeatureFlags: {
        bridgeConfig,
        assetsNotificationsEnabled: false,
        confirmation_redesign: {
          contract_interaction: false,
          signatures: false,
          staking_confirmations: false,
        },
        confirmations_eip_7702: {},
        earnFeatureFlagTemplate: {
          enabled: false,
          minimumVersion: '0.0.0',
        },
        earnPooledStakingEnabled: {
          enabled: false,
          minimumVersion: '0.0.0',
        },
        earnPooledStakingServiceInterruptionBannerEnabled: {
          enabled: false,
          minimumVersion: '0.0.0',
        },
        earnStablecoinLendingEnabled: {
          enabled: false,
          minimumVersion: '0.0.0',
        },
        earnStablecoinLendingServiceInterruptionBannerEnabled: {
          enabled: false,
          minimumVersion: '0.0.0',
        },
        mobileMinimumVersions: {
          androidMinimumAPIVersion: 0,
          appMinimumBuild: 0,
          appleMinimumOS: 0,
        },
        productSafetyDappScanning: false,
        testFlagForThreshold: {},
        tokenSearchDiscoveryEnabled: false,
        transactionsPrivacyPolicyUpdate: 'no_update',
        transactionsTxHashInAnalytics: false,
        walletFrameworkRpcFailoverEnabled: false,
      },
    };

    expect(bridgeController.state).toStrictEqual(EMPTY_INIT_STATE);

    const setIntervalLengthSpy = jest.spyOn(
      bridgeController,
      'setIntervalLength',
    );
    (messengerMock.call as jest.Mock).mockImplementation(() => {
      return remoteFeatureFlagControllerState;
    });

    bridgeController.setChainIntervalLength();

    expect(setIntervalLengthSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalLengthSpy).toHaveBeenCalledWith(3);
  });

  const metricsContext = {
    token_symbol_source: 'ETH',
    token_symbol_destination: 'USDC',
    usd_amount_source: 100,
    stx_enabled: true,
    security_warnings: [],
    warnings: [],
  };

  it('updateBridgeQuoteRequestParams should update the quoteRequest state', async function () {
    messengerMock.call.mockReturnValue({
      currentCurrency: 'usd',
    } as never);

    await bridgeController.updateBridgeQuoteRequestParams(
      { srcChainId: 1 },
      metricsContext,
    );
    expect(bridgeController.state.quoteRequest).toStrictEqual({
      srcChainId: 1,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
    });
    expect(trackMetaMetricsFn).toHaveBeenCalledTimes(1);

    await bridgeController.updateBridgeQuoteRequestParams(
      { destChainId: 10 },
      metricsContext,
    );
    expect(bridgeController.state.quoteRequest).toStrictEqual({
      destChainId: 10,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
    });

    await bridgeController.updateBridgeQuoteRequestParams(
      {
        destChainId: undefined,
      },
      metricsContext,
    );
    expect(bridgeController.state.quoteRequest).toStrictEqual({
      destChainId: undefined,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
    });

    await bridgeController.updateBridgeQuoteRequestParams(
      {
        srcTokenAddress: undefined,
      },
      metricsContext,
    );
    expect(bridgeController.state.quoteRequest).toStrictEqual({
      srcTokenAddress: undefined,
    });

    await bridgeController.updateBridgeQuoteRequestParams(
      {
        srcTokenAmount: '100000',
        destTokenAddress: '0x123',
        slippage: 0.5,
        srcTokenAddress: '0x0000000000000000000000000000000000000000',
      },
      metricsContext,
    );
    expect(bridgeController.state.quoteRequest).toStrictEqual({
      srcTokenAmount: '100000',
      destTokenAddress: '0x123',
      slippage: 0.5,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
    });

    await bridgeController.updateBridgeQuoteRequestParams(
      {
        srcTokenAddress: '0x2ABC',
      },
      metricsContext,
    );
    expect(bridgeController.state.quoteRequest).toStrictEqual({
      srcTokenAddress: '0x2ABC',
    });

    bridgeController.resetState();
    expect(bridgeController.state.quoteRequest).toStrictEqual({
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
    });

    expect(trackMetaMetricsFn).toHaveBeenCalledTimes(3);

    expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
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
      currencyRates: {},
      marketData: {},
      conversionRates: {},
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

    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementationOnce(jest.fn());

    const quoteParams = {
      srcChainId: '0x1',
      destChainId: SolScope.Mainnet,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
      destTokenAddress: '123d1',
      srcTokenAmount: '1000000000000000000',
      slippage: 0.5,
      walletAddress: '0x123',
      destWalletAddress: 'SolanaWalletAddres1234',
    };
    const quoteRequest = {
      ...quoteParams,
    };
    await bridgeController.updateBridgeQuoteRequestParams(
      quoteParams,
      metricsContext,
    );

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
    const thirdFetchTime = bridgeController.state.quotesLastFetched;

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
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Failed to fetch bridge quotes',
      new Error('Network error'),
    );

    // Next fetch succeeds
    jest.advanceTimersByTime(15000);
    await flushPromises();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(4);
    const { quotesLastFetched, quotes, ...stateWithoutTimestamp } =
      bridgeController.state;

    expect(stateWithoutTimestamp).toMatchSnapshot();
    expect(quotes).toStrictEqual([
      ...mockBridgeQuotesNativeErc20Eth,
      ...mockBridgeQuotesNativeErc20Eth,
    ]);
    expect(
      quotesLastFetched,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ).toBeGreaterThan(thirdFetchTime!);

    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
    expect(getLayer1GasFeeMock).not.toHaveBeenCalled();

    expect(trackMetaMetricsFn).toHaveBeenCalledTimes(9);

    expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
  });

  it('updateBridgeQuoteRequestParams should reset minimumBalanceForRentExemptionInLamports if getMinimumBalanceForRentExemption call fails', async function () {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.spyOn(balanceUtils, 'hasSufficientBalance').mockResolvedValue(false);
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(jest.fn());
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(jest.fn());

    const setupMessengerMock = (shouldMinBalanceFail = false) => {
      messengerMock.call.mockImplementation(
        (
          ...args: Parameters<BridgeControllerMessenger['call']>
        ): ReturnType<BridgeControllerMessenger['call']> => {
          const [actionType, params] = args;

          if (actionType === 'CurrencyRateController:getState') {
            throw new Error('Currency rate error');
          }

          if (
            actionType === 'AccountsController:getSelectedMultichainAccount'
          ) {
            return {
              type: SolAccountType.DataAccount,
              id: 'account1',
              scopes: [SolScope.Mainnet],
              methods: [],
              address: '0x123',
              metadata: {
                name: 'Account 1',
                importTime: 1717334400,
                keyring: {
                  type: 'Keyring',
                },
                snap: {
                  id: 'npm:@metamask/solana-snap',
                  name: 'Solana Snap',
                  enabled: true,
                },
              },
              options: {
                scope: SolScope.Mainnet,
              },
            };
          }

          if (actionType === 'SnapController:handleRequest') {
            return new Promise((resolve, reject) => {
              if (
                (params as { handler: string })?.handler === 'onProtocolRequest'
              ) {
                if (shouldMinBalanceFail) {
                  return setTimeout(() => {
                    reject(new Error('Min balance error'));
                  }, 200);
                }
                return setTimeout(() => {
                  resolve('5000');
                }, 200);
              }
              return setTimeout(() => {
                resolve({ value: '14' });
              }, 100);
            });
          }
          return {
            provider: jest.fn() as never,
            selectedNetworkClientId: 'selectedNetworkClientId',
          } as never;
        },
      );
    };
    jest
      .spyOn(selectors, 'selectIsAssetExchangeRateInState')
      .mockReturnValue(true);

    setupMessengerMock();
    const fetchBridgeQuotesSpy = jest
      .spyOn(fetchUtils, 'fetchBridgeQuotes')
      .mockImplementation(async () => {
        return await new Promise((resolve) => {
          return setTimeout(() => {
            resolve(mockBridgeQuotesSolErc20 as never);
          }, 2000);
        });
      });

    const quoteParams = {
      srcChainId: SolScope.Mainnet,
      destChainId: SolScope.Mainnet,
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
      destTokenAddress: '0x123',
      srcTokenAmount: '1000000000000000000',
      walletAddress: '0x123',
      slippage: 0.5,
    };

    /*
    Set quote request with Solana srcChainId
    */
    await bridgeController.updateBridgeQuoteRequestParams(
      quoteParams,
      metricsContext,
    );

    // Initial state check
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        quoteRequest: { ...quoteParams },
        minimumBalanceForRentExemptionInLamports: '0',
        quotesLoadingStatus:
          DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLoadingStatus,
      }),
    );

    // Advance timers and check loading state
    jest.advanceTimersByTime(200);
    await flushPromises();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(1);
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        minimumBalanceForRentExemptionInLamports: '5000',
        quotes: [],
        quotesLoadingStatus: RequestStatus.LOADING,
      }),
    );

    // Advance timers and check final state
    jest.advanceTimersByTime(2600);
    await flushPromises();
    jest.advanceTimersByTime(100);
    await flushPromises();
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        minimumBalanceForRentExemptionInLamports: '5000',
        quotes: mockBridgeQuotesSolErc20.map((quote) => ({
          ...quote,
          solanaFeesInLamports: '14',
        })),
        quotesLoadingStatus: RequestStatus.FETCHED,
      }),
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(
      messengerMock.call.mock.calls.filter(([action]) =>
        action.includes('SnapController'),
      ),
    ).toHaveLength(3);

    /*
    Update quote request params to EVM and back to Solana
    */
    await bridgeController.updateBridgeQuoteRequestParams(
      { ...quoteParams, srcChainId: '0x1' },
      metricsContext,
    );
    jest.advanceTimersByTime(2000);
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        minimumBalanceForRentExemptionInLamports: '0',
        quotes: [],
        quotesLoadingStatus: null,
      }),
    );

    /*
    Add destWalletAddress
    */
    await bridgeController.updateBridgeQuoteRequestParams(
      { ...quoteParams, destWalletAddress: 'SolanaWalletAddres1234' },
      metricsContext,
    );
    jest.advanceTimersByTime(2000);
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        minimumBalanceForRentExemptionInLamports: '0',
        quotes: [],
        quotesLoadingStatus: RequestStatus.LOADING,
      }),
    );

    await bridgeController.updateBridgeQuoteRequestParams(
      quoteParams,
      metricsContext,
    );
    jest.advanceTimersByTime(3510);
    await flushPromises();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(3);
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        minimumBalanceForRentExemptionInLamports: '5000',
        quotes: mockBridgeQuotesSolErc20.map((quote) => ({
          ...quote,
          solanaFeesInLamports: '14',
        })),
        quotesLoadingStatus: RequestStatus.FETCHED,
      }),
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(
      messengerMock.call.mock.calls.filter(([action]) =>
        action.includes('SnapController'),
      ),
    ).toHaveLength(9);

    /*
    Test min balance fetch failure
    */
    setupMessengerMock(true);
    await bridgeController.updateBridgeQuoteRequestParams(
      { ...quoteParams, srcTokenAmount: '11111' },
      metricsContext,
    );

    // Check states during failure scenario
    jest.advanceTimersByTime(2210);
    await flushPromises();
    expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(4);
    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        minimumBalanceForRentExemptionInLamports: '0',
        quotes: mockBridgeQuotesSolErc20.map((quote) => ({
          ...quote,
          solanaFeesInLamports: '14',
        })),
        quotesLoadingStatus: RequestStatus.FETCHED,
      }),
    );

    // Verify error handling
    expect(consoleErrorSpy.mock.calls).toMatchSnapshot();
    expect(
      messengerMock.call.mock.calls.filter(([action]) =>
        action.includes('SnapController'),
      ),
    ).toHaveLength(12);
    expect(
      messengerMock.call.mock.calls.filter(([action]) =>
        action.includes('SnapController'),
      ),
    ).toMatchSnapshot();
    expect(consoleWarnSpy).toHaveBeenCalledTimes(5);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Failed to fetch asset exchange rates',
      new Error('Currency rate error'),
    );
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
      currentCurrency: 'usd',
      currencyRates: {},
      marketData: {},
      conversionRates: {},
    } as never);
    jest
      .spyOn(selectors, 'selectIsAssetExchangeRateInState')
      .mockReturnValue(true);

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
      destChainId: '0xa',
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
      destTokenAddress: '0x123',
      srcTokenAmount: '1000000000000000000',
      walletAddress: '0x123',
      slippage: 0.5,
    };
    const quoteRequest = {
      ...quoteParams,
    };
    await bridgeController.updateBridgeQuoteRequestParams(
      quoteParams,
      metricsContext,
    );

    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);
    expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledWith({
      networkClientId: 'selectedNetworkClientId',
      updatedQuoteRequest: {
        ...quoteRequest,
        insufficientBal: true,
      },
      context: metricsContext,
    });
    expect(fetchAssetPricesSpy).not.toHaveBeenCalled();

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
    bridgeController.trackUnifiedSwapBridgeEvent(
      UnifiedSwapBridgeEventName.QuotesReceived,
      {
        warnings: ['warning1'],
        usd_quoted_gas: 0,
        gas_included: false,
        quoted_time_minutes: 10,
        usd_quoted_return: 100,
        price_impact: 0,
        provider: 'provider_bridge',
        best_quote_provider: 'provider_bridge2',
      },
    );

    expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();

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

        if (actionType === 'AccountsController:getSelectedMultichainAccount') {
          return {
            type: SolAccountType.DataAccount,
            id: 'account1',
            scopes: [SolScope.Mainnet],
            methods: [],
            address: '0x123',
            metadata: {
              snap: {
                id: 'npm:@metamask/solana-snap',
                name: 'Solana Snap',
                enabled: true,
              },
              name: 'Account 1',
              importTime: 1717334400,
              keyring: {
                type: 'Keyring',
              },
            },
            options: {
              scope: 'mainnet',
            },
          };
        }

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
      destChainId: '0xa',
      srcTokenAddress: '0x0000000000000000000000000000000000000000',
      destTokenAddress: '0x123',
      srcTokenAmount: '1000000000000000000',
      walletAddress: '0x123',
      slippage: 0.5,
    };
    const quoteRequest = {
      ...quoteParams,
    };
    await bridgeController.updateBridgeQuoteRequestParams(
      quoteParams,
      metricsContext,
    );

    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).toHaveBeenCalledTimes(1);
    expect(hasSufficientBalanceSpy).not.toHaveBeenCalled();
    expect(startPollingSpy).toHaveBeenCalledWith({
      networkClientId: 'selectedNetworkClientId',
      updatedQuoteRequest: {
        ...quoteRequest,
        insufficientBal: true,
      },
      context: metricsContext,
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

    await bridgeController.updateBridgeQuoteRequestParams(
      {
        srcChainId: 1,
        destChainId: 10,
        srcTokenAddress: '0x0000000000000000000000000000000000000000',
        destTokenAddress: '0x123',
        slippage: 0.5,
      },
      metricsContext,
    );

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

  it('updateBridgeQuoteRequestParams should not trigger quote polling if bridging to or from solana and destWalletAddress is undefined', async function () {
    const stopAllPollingSpy = jest.spyOn(bridgeController, 'stopAllPolling');
    const startPollingSpy = jest.spyOn(bridgeController, 'startPolling');
    messengerMock.call.mockReturnValue({
      address: '0x123',
      provider: jest.fn(),
    } as never);

    await bridgeController.updateBridgeQuoteRequestParams(
      {
        srcChainId: 1,
        destChainId: ChainId.SOLANA,
        srcTokenAddress: '0x0000000000000000000000000000000000000000',
        destTokenAddress: '0x123',
        slippage: 0.5,
      },
      metricsContext,
    );

    expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
    expect(startPollingSpy).not.toHaveBeenCalled();

    expect(bridgeController.state).toStrictEqual(
      expect.objectContaining({
        quoteRequest: {
          srcChainId: 1,
          slippage: 0.5,
          srcTokenAddress: '0x0000000000000000000000000000000000000000',
          walletAddress: undefined,
          destChainId: ChainId.SOLANA,
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
          if (methodName === 'NetworkController:getNetworkClientById') {
            return { provider: null };
          }
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
        trackMetaMetricsFn,
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
      ['0x2', '0x1'],
      [6, 12],
    ],
    [
      'should append l1GasFees if srcChain is 10 and srcToken is native',
      mockBridgeQuotesNativeErc20 as unknown as QuoteResponse[],
      ['0x1', '0x1'],
      [2, 2],
    ],
    [
      'should not append l1GasFees if srcChain is not 10',
      mockBridgeQuotesNativeErc20Eth as unknown as QuoteResponse[],
      [],
      [2, 0],
    ],
    [
      'should filter out quote if getL1Fees returns undefined',
      mockBridgeQuotesErc20Native as unknown as QuoteResponse[],
      ['0x2', undefined],
      [5, 12],
    ],
    [
      'should filter out quote if L1 fee calculation fails',
      mockBridgeQuotesErc20Native as unknown as QuoteResponse[],
      ['0x2', '0x1', 'L1 gas fee calculation failed'],
      [5, 11],
    ],
  ])(
    'updateBridgeQuoteRequestParams: %s',
    async (
      _testTitle: string,
      quoteResponse: QuoteResponse[],
      [totalL1GasFeesInHexWei, tradeL1GasFeesInHexWei, tradeL1GasFeeError]: (
        | string
        | undefined
      )[],
      [expectedQuotesLength, expectedGetLayer1GasFeeMockCallCount]: number[],
    ) => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(jest.fn());
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

      for (const [index, quote] of quoteResponse.entries()) {
        if (tradeL1GasFeeError && index === 0) {
          getLayer1GasFeeMock.mockRejectedValueOnce(
            new Error(tradeL1GasFeeError),
          );
          continue;
        }

        if (quote.approval) {
          getLayer1GasFeeMock.mockResolvedValueOnce('0x1');
        }

        if (tradeL1GasFeesInHexWei === undefined && index === 0) {
          getLayer1GasFeeMock.mockResolvedValueOnce(undefined);
          continue;
        }
        getLayer1GasFeeMock.mockResolvedValueOnce(
          tradeL1GasFeesInHexWei ?? '0x1',
        );
      }

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
        srcChainId: '0xa',
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
      await bridgeController.updateBridgeQuoteRequestParams(
        quoteParams,
        metricsContext,
      );

      expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
      expect(startPollingSpy).toHaveBeenCalledTimes(1);
      expect(hasSufficientBalanceSpy).toHaveBeenCalledTimes(1);
      expect(startPollingSpy).toHaveBeenCalledWith({
        networkClientId: 'selectedNetworkClientId',
        updatedQuoteRequest: {
          ...quoteRequest,
          insufficientBal: true,
        },
        context: metricsContext,
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
      expect(quotes).toHaveLength(expectedQuotesLength);
      expect(bridgeController.state).toStrictEqual(
        expect.objectContaining({
          quoteRequest: { ...quoteRequest, insufficientBal: true },
          quotesLoadingStatus: 1,
          quotesRefreshCount: 1,
        }),
      );
      quotes.forEach((quote) => {
        const expectedQuote = {
          ...quote,
          l1GasFeesInHexWei: totalL1GasFeesInHexWei,
        };
        // eslint-disable-next-line jest/prefer-strict-equal
        expect(quote).toEqual(expectedQuote);
      });

      const firstFetchTime = bridgeController.state.quotesLastFetched;
      expect(firstFetchTime).toBeGreaterThan(0);

      expect(getLayer1GasFeeMock).toHaveBeenCalledTimes(
        expectedGetLayer1GasFeeMockCallCount,
      );

      expect(errorSpy).toHaveBeenCalledTimes(tradeL1GasFeeError ? 1 : 0);
    },
  );

  it('should handle errors from fetchBridgeQuotes', async () => {
    jest.useFakeTimers();
    const fetchBridgeQuotesSpy = jest.spyOn(fetchUtils, 'fetchBridgeQuotes');
    messengerMock.call.mockReturnValue({
      address: '0x123',
      provider: jest.fn(),
    } as never);

    jest.spyOn(balanceUtils, 'hasSufficientBalance').mockResolvedValue(true);

    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementationOnce(jest.fn());

    // Fetch throws unknown Error
    fetchBridgeQuotesSpy.mockImplementationOnce(async () => {
      return await new Promise((_resolve, reject) => {
        return setTimeout(() => {
          reject(new Error('Other error'));
        }, 1000);
      });
    });

    // Fetch succeeds
    fetchBridgeQuotesSpy.mockImplementationOnce(async () => {
      return await new Promise((resolve) => {
        return setTimeout(() => {
          resolve(mockBridgeQuotesNativeErc20Eth as never);
        }, 1000);
      });
    });

    // Fetch throws string error
    fetchBridgeQuotesSpy.mockImplementationOnce(async () => {
      return await new Promise((_resolve, reject) => {
        return setTimeout(() => {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject('Test error');
        }, 1000);
      });
    });

    const quoteParams = {
      srcChainId: '0xa',
      destChainId: '0x1',
      srcTokenAddress: '0x4200000000000000000000000000000000000006',
      destTokenAddress: '0x0000000000000000000000000000000000000000',
      srcTokenAmount: '991250000000000000',
      walletAddress: 'eip:id/id:id/0x123',
    };

    await bridgeController.updateBridgeQuoteRequestParams(
      quoteParams,
      metricsContext,
    );

    // Advance timers to trigger fetch
    jest.advanceTimersByTime(1000);
    await flushPromises();

    // Verify state wasn't updated due to abort
    expect(bridgeController.state.quoteFetchError).toBe('Other error');
    expect(bridgeController.state.quotesLoadingStatus).toBe(
      RequestStatus.ERROR,
    );
    expect(bridgeController.state.quotes).toStrictEqual([]);

    // Verify state wasn't updated due to reset
    bridgeController.resetState();
    jest.advanceTimersByTime(1000);
    await flushPromises();
    expect(bridgeController.state.quoteFetchError).toBeNull();
    expect(bridgeController.state.quotesLoadingStatus).toBeNull();
    expect(bridgeController.state.quotes).toStrictEqual([]);

    // Verify quotes are fetched
    await bridgeController.updateBridgeQuoteRequestParams(
      quoteParams,
      metricsContext,
    );
    jest.advanceTimersByTime(10000);
    await flushPromises();
    const { quotes, quotesLastFetched, ...stateWithoutQuotes } =
      bridgeController.state;

    expect(stateWithoutQuotes).toMatchSnapshot();
    expect(quotes).toStrictEqual(mockBridgeQuotesNativeErc20Eth);
    expect(quotesLastFetched).toBeCloseTo(Date.now());

    jest.advanceTimersByTime(10000);
    await flushPromises();
    const {
      quotes: quotes2,
      quotesLastFetched: quotesLastFetched2,
      ...stateWithoutQuotes2
    } = bridgeController.state;

    expect(stateWithoutQuotes2).toMatchSnapshot();
    expect(quotes2).toStrictEqual(mockBridgeQuotesNativeErc20Eth);

    expect(quotesLastFetched2).toBe(quotesLastFetched);
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Failed to fetch bridge quotes',
      new Error('Other error'),
    );
  });

  it.each([
    [
      'should append solanaFees for Solana quotes',
      mockBridgeQuotesSolErc20 as unknown as QuoteResponse[],
      2,
      '5000',
      '300',
    ],
    [
      'should not append solanaFees if selected account is not a snap',
      mockBridgeQuotesSolErc20 as unknown as QuoteResponse[],
      2,
      undefined,
      '0',
      true,
    ],
    [
      'should handle mixed Solana and non-Solana quotes by not appending fees',
      [
        ...mockBridgeQuotesSolErc20,
        ...mockBridgeQuotesErc20Native,
      ] as unknown as QuoteResponse[],
      8,
      undefined,
      '1',
    ],
  ])(
    'updateBridgeQuoteRequestParams: %s',
    async (
      _testTitle: string,
      quoteResponse: QuoteResponse[],
      expectedQuotesLength: number,
      expectedFees: string | undefined,
      expectedMinBalance: string | undefined,
      isEvmAccount = false,
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
          const [actionType, params] = args;

          if (
            actionType === 'AccountsController:getSelectedMultichainAccount'
          ) {
            if (isEvmAccount) {
              return {
                type: EthAccountType.Eoa,
                id: 'account1',
                scopes: [EthScope.Eoa],
                methods: [],
                address: '0x123',
                metadata: {
                  name: 'Account 1',
                  importTime: 1717334400,
                  keyring: {
                    type: 'Keyring',
                  },
                },
                options: {
                  scope: 'mainnet',
                },
              };
            }
            return {
              type: SolAccountType.DataAccount,
              id: 'account1',
              scopes: [SolScope.Mainnet],
              methods: [],
              address: '0x123',
              metadata: {
                name: 'Account 1',
                importTime: 1717334400,
                keyring: {
                  type: 'Keyring',
                },
                snap: {
                  id: 'npm:@metamask/solana-snap',
                  name: 'Solana Snap',
                  enabled: true,
                },
              },
              options: {
                scope: SolScope.Mainnet,
              },
            };
          }

          if (actionType === 'SnapController:handleRequest') {
            return new Promise((resolve) => {
              if (
                (params as { handler: string })?.handler === 'onProtocolRequest'
              ) {
                return setTimeout(() => {
                  resolve(expectedMinBalance);
                }, 200);
              }
              return setTimeout(() => {
                resolve({ value: expectedFees });
              }, 100);
            });
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
        destWalletAddress: '0x5342',
        slippage: 0.5,
      };

      await bridgeController.updateBridgeQuoteRequestParams(
        quoteParams,
        metricsContext,
      );

      expect(stopAllPollingSpy).toHaveBeenCalledTimes(1);
      expect(startPollingSpy).toHaveBeenCalledTimes(1);
      expect(hasSufficientBalanceSpy).not.toHaveBeenCalled();

      // Loading state
      jest.advanceTimersByTime(201);
      await flushPromises();
      expect(bridgeController.state).toStrictEqual(
        expect.objectContaining({
          quotesLoadingStatus: RequestStatus.LOADING,
          quotes: [],
          minimumBalanceForRentExemptionInLamports: expectedMinBalance,
        }),
      );
      jest.advanceTimersByTime(295);
      await flushPromises();
      expect(fetchBridgeQuotesSpy).toHaveBeenCalledTimes(1);

      // After fetch completes
      jest.advanceTimersByTime(2601);
      await flushPromises();

      jest.advanceTimersByTime(100);
      await flushPromises();
      const { quotes } = bridgeController.state;
      expect(bridgeController.state).toStrictEqual(
        expect.objectContaining({
          quotesLoadingStatus: RequestStatus.FETCHED,
          quotesRefreshCount: 1,
        }),
      );

      // Verify Solana fees
      quotes.forEach((quote) => {
        expect(quote.solanaFeesInLamports).toBe(
          isSolanaChainId(quote.quote.srcChainId) ? expectedFees : undefined,
        );
      });

      // Verify snap interaction
      const snapCalls = messengerMock.call.mock.calls.filter(
        ([methodName]) => methodName === 'SnapController:handleRequest',
      );

      expect(snapCalls).toMatchSnapshot();

      expect(quotes).toHaveLength(expectedQuotesLength);
    },
  );

  describe('trackUnifiedSwapBridgeEvent client-side calls', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      messengerMock.call.mockImplementation(
        (): ReturnType<BridgeControllerMessenger['call']> => {
          return {
            provider: jest.fn() as never,
            selectedNetworkClientId: 'selectedNetworkClientId',
            rpcUrl: 'https://mainnet.infura.io/v3/123',
            configuration: {
              chainId: 'eip155:1',
            },
          } as never;
        },
      );
    });

    it('should track the ButtonClicked event', () => {
      bridgeController.trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.ButtonClicked,
        {
          location: MetaMetricsSwapsEventSource.MainView,
          token_symbol_source: 'ETH',
          token_symbol_destination: null,
        },
      );
      expect(trackMetaMetricsFn).toHaveBeenCalledTimes(1);

      expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
    });

    it('should track the PageViewed event', () => {
      bridgeController.trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.PageViewed,
        { abc: 1 },
      );
      expect(trackMetaMetricsFn).toHaveBeenCalledTimes(1);

      expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
    });

    it('should track the InputSourceDestinationFlipped event', () => {
      bridgeController.trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.InputSourceDestinationFlipped,
        {
          token_symbol_destination: 'USDC',
          token_symbol_source: 'ETH',
          security_warnings: ['warning1'],
          chain_id_source: formatChainIdToCaip(1),
          token_address_source: getNativeAssetForChainId(1).assetId,
          chain_id_destination: formatChainIdToCaip(10),
          token_address_destination: getNativeAssetForChainId(10).assetId,
        },
      );
      expect(trackMetaMetricsFn).toHaveBeenCalledTimes(1);

      expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
    });

    it('should track the AllQuotesOpened event', () => {
      bridgeController.trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.AllQuotesOpened,
        {
          price_impact: 6,
          token_symbol_source: 'ETH',
          token_symbol_destination: 'USDC',
          gas_included: false,
          stx_enabled: false,
        },
      );
      expect(trackMetaMetricsFn).toHaveBeenCalledTimes(1);

      expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
    });

    it('should track the AllQuotesSorted event', () => {
      bridgeController.trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.AllQuotesSorted,
        {
          sort_order: SortOrder.COST_ASC,
          price_impact: 6,
          gas_included: false,
          stx_enabled: false,
          token_symbol_source: 'ETH',
          best_quote_provider: 'provider_bridge2',
          token_symbol_destination: 'USDC',
        },
      );
      expect(trackMetaMetricsFn).toHaveBeenCalledTimes(1);

      expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
    });

    it('should track the QuoteSelected event', () => {
      bridgeController.trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.QuoteSelected,
        {
          is_best_quote: true,
          usd_quoted_gas: 0,
          gas_included: false,
          quoted_time_minutes: 10,
          usd_quoted_return: 100,
          price_impact: 0,
          provider: 'provider_bridge',
          best_quote_provider: 'provider_bridge2',
        },
      );
      expect(trackMetaMetricsFn).toHaveBeenCalledTimes(1);

      expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
    });

    it('should track the QuotesReceived event', () => {
      bridgeController.trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.QuotesReceived,
        {
          warnings: ['warning1'],
          usd_quoted_gas: 0,
          gas_included: false,
          quoted_time_minutes: 10,
          usd_quoted_return: 100,
          price_impact: 0,
          provider: 'provider_bridge',
          best_quote_provider: 'provider_bridge2',
        },
      );
      expect(trackMetaMetricsFn).toHaveBeenCalledTimes(1);

      expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
    });
  });

  describe('trackUnifiedSwapBridgeEvent bridge-status-controller calls', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      messengerMock.call.mockImplementation(() => {
        return {
          provider: jest.fn() as never,
          selectedNetworkClientId: 'selectedNetworkClientId',
          rpcUrl: 'https://mainnet.infura.io/v3/123',
          configuration: {
            chainId: 'eip155:1',
          },
        } as never;
      });
    });

    it('should track the SnapConfirmationViewed event', () => {
      bridgeController.trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.SnapConfirmationViewed,
        {
          action_type: MetricsActionType.CROSSCHAIN_V1,
          price_impact: 0,
          usd_quoted_gas: 0,
          gas_included: false,
          quoted_time_minutes: 0,
          usd_quoted_return: 0,
          provider: 'provider_bridge',
        },
      );
      expect(trackMetaMetricsFn).toHaveBeenCalledTimes(1);

      expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
    });

    it('should track the Submitted event', () => {
      const controller = new BridgeController({
        messenger: messengerMock,
        getLayer1GasFee: getLayer1GasFeeMock,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: mockFetchFn,
        trackMetaMetricsFn,
        state: {
          quoteRequest: {
            srcChainId: SolScope.Mainnet,
            destChainId: '0xa',
            srcTokenAddress: 'NATIVE',
            destTokenAddress: '0x1234',
            srcTokenAmount: '1000000',
            walletAddress: '0x123',
            slippage: 0.5,
          },
          quotes: mockBridgeQuotesSolErc20 as never,
        },
      });
      controller.trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.Submitted,
        {
          usd_quoted_gas: 1,
          gas_included: false,
          quoted_time_minutes: 2,
          usd_quoted_return: 113,
          provider: 'provider_bridge',
          price_impact: 12,
          token_symbol_source: 'ETH',
          token_symbol_destination: 'USDC',
          stx_enabled: false,
          usd_amount_source: 100,
        },
      );
      expect(trackMetaMetricsFn).toHaveBeenCalledTimes(1);

      expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
    });

    it('should track the Completed event', () => {
      bridgeController.trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.Completed,
        {
          action_type: MetricsActionType.CROSSCHAIN_V1,
          approval_transaction: StatusTypes.PENDING,
          source_transaction: StatusTypes.PENDING,
          destination_transaction: StatusTypes.PENDING,
          actual_time_minutes: 10,
          usd_actual_return: 100,
          usd_actual_gas: 10,
          quote_vs_execution_ratio: 1,
          quoted_vs_used_gas_ratio: 1,
          chain_id_source: formatChainIdToCaip(1),
          token_symbol_source: 'ETH',
          token_address_source: getNativeAssetForChainId(1).assetId,
          custom_slippage: true,
          usd_amount_source: 100,
          stx_enabled: false,
          is_hardware_wallet: false,
          swap_type: MetricsSwapType.CROSSCHAIN,
          provider: 'provider_bridge',
          price_impact: 6,
          gas_included: false,
          usd_quoted_gas: 0,
          quoted_time_minutes: 0,
          usd_quoted_return: 0,
          chain_id_destination: formatChainIdToCaip(10),
          token_symbol_destination: 'USDC',
          token_address_destination: getNativeAssetForChainId(10).assetId,
          security_warnings: [],
        },
      );
      expect(trackMetaMetricsFn).toHaveBeenCalledTimes(1);

      expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
    });

    it('should track the Failed event', () => {
      bridgeController.trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.Failed,
        {
          action_type: MetricsActionType.CROSSCHAIN_V1,
          allowance_reset_transaction: StatusTypes.PENDING,
          approval_transaction: StatusTypes.PENDING,
          source_transaction: StatusTypes.PENDING,
          destination_transaction: StatusTypes.PENDING,
          usd_quoted_gas: 0,
          gas_included: false,
          quoted_time_minutes: 0,
          usd_quoted_return: 0,
          price_impact: 0,
          provider: 'provider_bridge',
          actual_time_minutes: 10,
          error_message: 'error_message',
          chain_id_source: formatChainIdToCaip(1),
          token_symbol_source: 'ETH',
          token_address_source: getNativeAssetForChainId(1).assetId,
          custom_slippage: true,
          usd_amount_source: 100,
          stx_enabled: false,
          is_hardware_wallet: false,
          swap_type: MetricsSwapType.CROSSCHAIN,
          chain_id_destination: formatChainIdToCaip(ChainId.SOLANA),
          token_symbol_destination: 'USDC',
          token_address_destination: getNativeAssetForChainId(ChainId.SOLANA)
            .assetId,
          security_warnings: [],
        },
      );
      expect(trackMetaMetricsFn).toHaveBeenCalledTimes(1);

      expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
    });

    it('should track the Failed event before tx is submitted', () => {
      const controller = new BridgeController({
        messenger: messengerMock,
        getLayer1GasFee: getLayer1GasFeeMock,
        clientId: BridgeClientId.EXTENSION,
        fetchFn: mockFetchFn,
        trackMetaMetricsFn,
        state: {
          quoteRequest: {
            srcChainId: SolScope.Mainnet,
            destChainId: '1',
            srcTokenAddress: 'NATIVE',
            destTokenAddress: '0x1234',
            srcTokenAmount: '1000000',
            walletAddress: '0x123',
            slippage: 0.5,
          },
          quotes: mockBridgeQuotesSolErc20 as never,
        },
      });
      controller.trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.Failed,
        {
          error_message: 'Failed to submit tx',
          usd_quoted_gas: 1,
          gas_included: false,
          quoted_time_minutes: 2,
          usd_quoted_return: 113,
          provider: 'provider_bridge',
          price_impact: 12,
          token_symbol_source: 'ETH',
          token_symbol_destination: 'USDC',
          stx_enabled: false,
          usd_amount_source: 100,
        },
      );
      expect(trackMetaMetricsFn).toHaveBeenCalledTimes(1);

      expect(trackMetaMetricsFn.mock.calls).toMatchSnapshot();
    });
  });

  describe('trackUnifiedSwapBridgeEvent client-side call exceptions', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      messengerMock.call.mockImplementation(
        (
          ...args: Parameters<BridgeControllerMessenger['call']>
        ): ReturnType<BridgeControllerMessenger['call']> => {
          const actionType = args[0];
          if (
            actionType === 'AccountsController:getSelectedMultichainAccount'
          ) {
            return {
              type: SolAccountType.DataAccount,
              id: 'account1',
              scopes: [SolScope.Mainnet],
              methods: [],
              address: '0x123',
              metadata: {
                snap: {
                  id: 'npm:@metamask/solana-snap',
                  name: 'Solana Snap',
                  enabled: true,
                },
                name: 'Account 1',
                importTime: 1717334400,
              } as never,
              options: {
                scope: 'mainnet',
              },
            };
          }
          return {
            provider: jest.fn() as never,
            selectedNetworkClientId: 'selectedNetworkClientId',
            rpcUrl: 'https://mainnet.infura.io/v3/123',
            configuration: {
              chainId: 'eip155:1',
            },
          } as never;
        },
      );
    });

    it('should not track the event if the account keyring type is not set', () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(jest.fn());
      bridgeController.trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.QuotesReceived,
        {
          warnings: ['warning1'],
          usd_quoted_gas: 0,
          gas_included: false,
          quoted_time_minutes: 10,
          usd_quoted_return: 100,
          price_impact: 0,
          provider: 'provider_bridge',
          best_quote_provider: 'provider_bridge2',
        },
      );
      expect(trackMetaMetricsFn).toHaveBeenCalledTimes(0);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        'Error tracking cross-chain swaps MetaMetrics event',
        new TypeError("Cannot read properties of undefined (reading 'type')"),
      );
    });
  });
});
