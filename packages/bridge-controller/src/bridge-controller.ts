import type { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import type { StateMetadata } from '@metamask/base-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { NetworkClientId } from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { TransactionController } from '@metamask/transaction-controller';
import type { CaipAssetType } from '@metamask/utils';
import { numberToHex, type Hex } from '@metamask/utils';

import { BridgeClientId } from './constants/bridge';
import {
  BRIDGE_CONTROLLER_NAME,
  BRIDGE_PROD_API_BASE_URL,
  DEFAULT_BRIDGE_CONTROLLER_STATE,
  METABRIDGE_CHAIN_TO_ADDRESS_MAP,
  REFRESH_INTERVAL_MS,
} from './constants/bridge';
import { CHAIN_IDS } from './constants/chains';
import { TraceName } from './constants/traces';
import { selectIsAssetExchangeRateInState } from './selectors';
import type { QuoteRequest } from './types';
import {
  type L1GasFees,
  type GenericQuoteRequest,
  type NonEvmFees,
  type QuoteResponse,
  type TxData,
  type BridgeControllerState,
  type BridgeControllerMessenger,
  type FetchFunction,
  RequestStatus,
} from './types';
import { getAssetIdsForToken, toExchangeRates } from './utils/assets';
import { hasSufficientBalance } from './utils/balance';
import {
  getDefaultBridgeControllerState,
  isCrossChain,
  isNonEvmChainId,
  isSolanaChainId,
  sumHexes,
} from './utils/bridge';
import {
  formatAddressToCaipReference,
  formatChainIdToCaip,
  formatChainIdToHex,
} from './utils/caip-formatters';
import { getBridgeFeatureFlags } from './utils/feature-flags';
import {
  fetchAssetPrices,
  fetchBridgeQuotes,
  fetchBridgeQuoteStream,
} from './utils/fetch';
import {
  AbortReason,
  MetricsActionType,
  UnifiedSwapBridgeEventName,
} from './utils/metrics/constants';
import {
  formatProviderLabel,
  getRequestParams,
  getSwapTypeFromQuote,
  isCustomSlippage,
  isHardwareWallet,
  toInputChangedPropertyKey,
  toInputChangedPropertyValue,
} from './utils/metrics/properties';
import type {
  QuoteFetchData,
  RequestMetadata,
  RequestParams,
  RequiredEventContextFromClient,
} from './utils/metrics/types';
import { type CrossChainSwapsEventProperties } from './utils/metrics/types';
import { isValidQuoteRequest } from './utils/quote';
import {
  computeFeeRequest,
  getMinimumBalanceForRentExemptionRequest,
} from './utils/snaps';
import { FeatureId } from './utils/validators';

const metadata: StateMetadata<BridgeControllerState> = {
  quoteRequest: {
    includeInStateLogs: true,
    persist: false,
    anonymous: false,
    usedInUi: true,
  },
  quotes: {
    includeInStateLogs: true,
    persist: false,
    anonymous: false,
    usedInUi: true,
  },
  quotesInitialLoadTime: {
    includeInStateLogs: true,
    persist: false,
    anonymous: false,
    usedInUi: true,
  },
  quotesLastFetched: {
    includeInStateLogs: true,
    persist: false,
    anonymous: false,
    usedInUi: true,
  },
  quotesLoadingStatus: {
    includeInStateLogs: true,
    persist: false,
    anonymous: false,
    usedInUi: true,
  },
  quoteFetchError: {
    includeInStateLogs: true,
    persist: false,
    anonymous: false,
    usedInUi: true,
  },
  quotesRefreshCount: {
    includeInStateLogs: true,
    persist: false,
    anonymous: false,
    usedInUi: true,
  },
  assetExchangeRates: {
    includeInStateLogs: true,
    persist: false,
    anonymous: false,
    usedInUi: true,
  },
  minimumBalanceForRentExemptionInLamports: {
    includeInStateLogs: true,
    persist: false,
    anonymous: false,
    usedInUi: true,
  },
};

/**
 * The input to start polling for the {@link BridgeController}
 *
 * @param networkClientId - The network client ID of the selected network
 * @param updatedQuoteRequest - The updated quote request
 * @param context - The context contains properties that can't be populated by the
 * controller and need to be provided by the client for analytics
 */
type BridgePollingInput = {
  networkClientId: NetworkClientId;
  updatedQuoteRequest: GenericQuoteRequest;
  context: Pick<
    RequiredEventContextFromClient,
    UnifiedSwapBridgeEventName.QuotesError
  >[UnifiedSwapBridgeEventName.QuotesError] &
    Pick<
      RequiredEventContextFromClient,
      UnifiedSwapBridgeEventName.QuotesRequested
    >[UnifiedSwapBridgeEventName.QuotesRequested];
};

export class BridgeController extends StaticIntervalPollingController<BridgePollingInput>()<
  typeof BRIDGE_CONTROLLER_NAME,
  BridgeControllerState,
  BridgeControllerMessenger
> {
  #abortController: AbortController | undefined;

  #quotesFirstFetched: number | undefined;

  readonly #clientId: BridgeClientId;

  readonly #clientVersion: string | undefined;

  readonly #getLayer1GasFee: typeof TransactionController.prototype.getLayer1GasFee;

  readonly #fetchFn: FetchFunction;

  readonly #trackMetaMetricsFn: <
    T extends
      (typeof UnifiedSwapBridgeEventName)[keyof typeof UnifiedSwapBridgeEventName],
  >(
    eventName: T,
    properties: CrossChainSwapsEventProperties<T>,
  ) => void;

  readonly #trace: TraceCallback;

  readonly #config: {
    customBridgeApiBaseUrl?: string;
  };

  constructor({
    messenger,
    state,
    clientId,
    clientVersion,
    getLayer1GasFee,
    fetchFn,
    config,
    trackMetaMetricsFn,
    traceFn,
  }: {
    messenger: BridgeControllerMessenger;
    state?: Partial<BridgeControllerState>;
    clientId: BridgeClientId;
    clientVersion?: string;
    getLayer1GasFee: typeof TransactionController.prototype.getLayer1GasFee;
    fetchFn: FetchFunction;
    config?: {
      customBridgeApiBaseUrl?: string;
    };
    trackMetaMetricsFn: <
      T extends
        (typeof UnifiedSwapBridgeEventName)[keyof typeof UnifiedSwapBridgeEventName],
    >(
      eventName: T,
      properties: CrossChainSwapsEventProperties<T>,
    ) => void;
    traceFn?: TraceCallback;
  }) {
    super({
      name: BRIDGE_CONTROLLER_NAME,
      metadata,
      messenger,
      state: {
        ...getDefaultBridgeControllerState(),
        ...state,
      },
    });

    this.setIntervalLength(REFRESH_INTERVAL_MS);

    this.#abortController = new AbortController();
    this.#getLayer1GasFee = getLayer1GasFee;
    this.#clientId = clientId;
    this.#clientVersion = clientVersion;
    this.#fetchFn = fetchFn;
    this.#trackMetaMetricsFn = trackMetaMetricsFn;
    this.#config = config ?? {};
    this.#trace = traceFn ?? (((_request, fn) => fn?.()) as TraceCallback);

    // Register action handlers
    this.messagingSystem.registerActionHandler(
      `${BRIDGE_CONTROLLER_NAME}:setChainIntervalLength`,
      this.setChainIntervalLength.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      `${BRIDGE_CONTROLLER_NAME}:updateBridgeQuoteRequestParams`,
      this.updateBridgeQuoteRequestParams.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      `${BRIDGE_CONTROLLER_NAME}:resetState`,
      this.resetState.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      `${BRIDGE_CONTROLLER_NAME}:getBridgeERC20Allowance`,
      this.getBridgeERC20Allowance.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      `${BRIDGE_CONTROLLER_NAME}:trackUnifiedSwapBridgeEvent`,
      this.trackUnifiedSwapBridgeEvent.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      `${BRIDGE_CONTROLLER_NAME}:stopPollingForQuotes`,
      this.stopPollingForQuotes.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      `${BRIDGE_CONTROLLER_NAME}:fetchQuotes`,
      this.fetchQuotes.bind(this),
    );
  }

  _executePoll = async (pollingInput: BridgePollingInput) => {
    await this.#fetchBridgeQuotes(pollingInput);
  };

  updateBridgeQuoteRequestParams = async (
    paramsToUpdate: Partial<GenericQuoteRequest> & {
      walletAddress: GenericQuoteRequest['walletAddress'];
    },
    context: BridgePollingInput['context'],
  ) => {
    this.stopAllPolling();
    this.#abortController?.abort(AbortReason.QuoteRequestUpdated);

    this.#trackInputChangedEvents(paramsToUpdate);

    const updatedQuoteRequest = {
      ...DEFAULT_BRIDGE_CONTROLLER_STATE.quoteRequest,
      ...paramsToUpdate,
    };

    this.update((state) => {
      state.quoteRequest = updatedQuoteRequest;
      state.quotes = DEFAULT_BRIDGE_CONTROLLER_STATE.quotes;
      state.quotesLastFetched =
        DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLastFetched;
      state.quotesLoadingStatus =
        DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLoadingStatus;
      state.quoteFetchError = DEFAULT_BRIDGE_CONTROLLER_STATE.quoteFetchError;
      state.quotesRefreshCount =
        DEFAULT_BRIDGE_CONTROLLER_STATE.quotesRefreshCount;
      state.quotesInitialLoadTime =
        DEFAULT_BRIDGE_CONTROLLER_STATE.quotesInitialLoadTime;
      // Reset required minimum balance if the source chain is not Solana
      if (
        updatedQuoteRequest.srcChainId &&
        !isSolanaChainId(updatedQuoteRequest.srcChainId)
      ) {
        state.minimumBalanceForRentExemptionInLamports =
          DEFAULT_BRIDGE_CONTROLLER_STATE.minimumBalanceForRentExemptionInLamports;
      }
    });

    await this.#fetchAssetExchangeRates(updatedQuoteRequest).catch((error) =>
      console.warn('Failed to fetch asset exchange rates', error),
    );

    if (isValidQuoteRequest(updatedQuoteRequest)) {
      this.#quotesFirstFetched = Date.now();
      const providerConfig = this.#getSelectedNetworkClient()?.configuration;

      let insufficientBal: boolean | undefined;
      if (isNonEvmChainId(updatedQuoteRequest.srcChainId)) {
        // If the source chain is not an EVM network, use value from params
        insufficientBal = paramsToUpdate.insufficientBal;
      } else if (providerConfig?.rpcUrl?.includes('tenderly')) {
        // If the rpcUrl is a tenderly fork (e2e tests), set insufficientBal=true
        // The bridge-api filters out quotes if the balance on mainnet is insufficient so this override allows quotes to always be returned
        insufficientBal = true;
      } else {
        try {
          // Otherwise query the src token balance from the RPC provider
          insufficientBal =
            paramsToUpdate.insufficientBal ??
            !(await this.#hasSufficientBalance(updatedQuoteRequest));
        } catch (error) {
          console.error('Failed to fetch balance', error);
          insufficientBal = true; // fallback to true for backend simulations
        }
      }

      const networkClientId = this.#getSelectedNetworkClientId();
      // Set refresh rate based on the source chain before starting polling
      this.setChainIntervalLength();
      this.startPolling({
        networkClientId,
        updatedQuoteRequest: {
          ...updatedQuoteRequest,
          insufficientBal,
        },
        context,
      });
    }
  };

  /**
   * Fetches quotes for specified request without updating the controller state
   * This method does not start polling for quotes and does not emit UnifiedSwapBridge events
   *
   * @param quoteRequest - The parameters for quote requests to fetch
   * @param abortSignal - The abort signal to cancel all the requests
   * @param featureId - The feature ID that maps to quoteParam overrides from LD
   * @returns A list of validated quotes
   */
  fetchQuotes = async (
    quoteRequest: GenericQuoteRequest,
    abortSignal: AbortSignal | null = null,
    featureId: FeatureId | null = null,
  ): Promise<(QuoteResponse & L1GasFees & NonEvmFees)[]> => {
    const bridgeFeatureFlags = getBridgeFeatureFlags(this.messagingSystem);
    // If featureId is specified, retrieve the quoteRequestOverrides for that featureId
    const quoteRequestOverrides = featureId
      ? bridgeFeatureFlags.quoteRequestOverrides?.[featureId]
      : undefined;

    // If quoteRequestOverrides is specified, merge it with the quoteRequest
    const { quotes: baseQuotes, validationFailures } = await fetchBridgeQuotes(
      quoteRequestOverrides
        ? { ...quoteRequest, ...quoteRequestOverrides }
        : quoteRequest,
      abortSignal,
      this.#clientId,
      this.#fetchFn,
      this.#config.customBridgeApiBaseUrl ?? BRIDGE_PROD_API_BASE_URL,
      featureId,
      this.#clientVersion,
    );

    this.#trackResponseValidationFailures(validationFailures);

    const quotesWithFees = await this.#appendFees(quoteRequest, baseQuotes);

    // Sort perps quotes by increasing estimated processing time (fastest first)
    if (featureId === FeatureId.PERPS) {
      return quotesWithFees.sort((a, b) => {
        return (
          a.estimatedProcessingTimeInSeconds -
          b.estimatedProcessingTimeInSeconds
        );
      });
    }
    return quotesWithFees;
  };

  readonly #appendFees = async (
    quoteRequest: GenericQuoteRequest,
    baseQuotes: QuoteResponse[],
  ) => {
    const quotesWithL1GasFees = await this.#appendL1GasFees(baseQuotes);
    const quotesWithNonEvmFees = await this.#appendNonEvmFees(
      baseQuotes,
      quoteRequest.walletAddress,
    );
    const quotesWithFees =
      quotesWithL1GasFees ?? quotesWithNonEvmFees ?? baseQuotes;
    return quotesWithFees;
  };

  readonly #trackResponseValidationFailures = (
    validationFailures: string[],
  ) => {
    if (validationFailures.length === 0) {
      return;
    }
    this.trackUnifiedSwapBridgeEvent(
      UnifiedSwapBridgeEventName.QuotesValidationFailed,
      {
        failures: validationFailures,
      },
    );
  };

  readonly #getExchangeRateSources = () => {
    return {
      ...this.messagingSystem.call('MultichainAssetsRatesController:getState'),
      ...this.messagingSystem.call('CurrencyRateController:getState'),
      ...this.messagingSystem.call('TokenRatesController:getState'),
      ...this.state,
    };
  };

  /**
   * Fetches the exchange rates for the assets in the quote request if they are not already in the state
   * In addition to the selected tokens, this also fetches the native asset for the source and destination chains
   *
   * @param quoteRequest - The quote request
   * @param quoteRequest.srcChainId - The source chain ID
   * @param quoteRequest.srcTokenAddress - The source token address
   * @param quoteRequest.destChainId - The destination chain ID
   * @param quoteRequest.destTokenAddress - The destination token address
   */
  readonly #fetchAssetExchangeRates = async ({
    srcChainId,
    srcTokenAddress,
    destChainId,
    destTokenAddress,
  }: Partial<GenericQuoteRequest>) => {
    const assetIds: Set<CaipAssetType> = new Set([]);
    const exchangeRateSources = this.#getExchangeRateSources();
    if (
      srcTokenAddress &&
      srcChainId &&
      !selectIsAssetExchangeRateInState(
        exchangeRateSources,
        srcChainId,
        srcTokenAddress,
      )
    ) {
      getAssetIdsForToken(srcTokenAddress, srcChainId).forEach((assetId) =>
        assetIds.add(assetId),
      );
    }
    if (
      destTokenAddress &&
      destChainId &&
      !selectIsAssetExchangeRateInState(
        exchangeRateSources,
        destChainId,
        destTokenAddress,
      )
    ) {
      getAssetIdsForToken(destTokenAddress, destChainId).forEach((assetId) =>
        assetIds.add(assetId),
      );
    }

    const currency = this.messagingSystem.call(
      'CurrencyRateController:getState',
    ).currentCurrency;

    if (assetIds.size === 0) {
      return;
    }

    const pricesByAssetId = await fetchAssetPrices({
      assetIds,
      currencies: new Set([currency]),
      clientId: this.#clientId,
      clientVersion: this.#clientVersion,
      fetchFn: this.#fetchFn,
    });
    const exchangeRates = toExchangeRates(currency, pricesByAssetId);
    this.update((state) => {
      state.assetExchangeRates = {
        ...state.assetExchangeRates,
        ...exchangeRates,
      };
    });
  };

  readonly #hasSufficientBalance = async (
    quoteRequest: GenericQuoteRequest,
  ) => {
    // Only check balance for EVM chains
    if (isNonEvmChainId(quoteRequest.srcChainId)) {
      return true;
    }

    const srcChainIdInHex = formatChainIdToHex(quoteRequest.srcChainId);
    const provider = this.#getSelectedNetworkClient()?.provider;
    const normalizedSrcTokenAddress = formatAddressToCaipReference(
      quoteRequest.srcTokenAddress,
    );

    return (
      provider &&
      normalizedSrcTokenAddress &&
      quoteRequest.srcTokenAmount &&
      srcChainIdInHex &&
      (await hasSufficientBalance(
        provider,
        quoteRequest.walletAddress,
        normalizedSrcTokenAddress,
        quoteRequest.srcTokenAmount,
        srcChainIdInHex,
      ))
    );
  };

  stopPollingForQuotes = (reason?: AbortReason) => {
    this.stopAllPolling();
    this.#abortController?.abort(reason);
  };

  resetState = () => {
    this.stopPollingForQuotes(AbortReason.ResetState);

    this.update((state) => {
      // Cannot do direct assignment to state, i.e. state = {... }, need to manually assign each field
      state.quoteRequest = DEFAULT_BRIDGE_CONTROLLER_STATE.quoteRequest;
      state.quotesInitialLoadTime =
        DEFAULT_BRIDGE_CONTROLLER_STATE.quotesInitialLoadTime;
      state.quotes = DEFAULT_BRIDGE_CONTROLLER_STATE.quotes;
      state.quotesLastFetched =
        DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLastFetched;
      state.quotesLoadingStatus =
        DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLoadingStatus;
      state.quoteFetchError = DEFAULT_BRIDGE_CONTROLLER_STATE.quoteFetchError;
      state.quotesRefreshCount =
        DEFAULT_BRIDGE_CONTROLLER_STATE.quotesRefreshCount;
      state.assetExchangeRates =
        DEFAULT_BRIDGE_CONTROLLER_STATE.assetExchangeRates;
      state.minimumBalanceForRentExemptionInLamports =
        DEFAULT_BRIDGE_CONTROLLER_STATE.minimumBalanceForRentExemptionInLamports;
    });
  };

  /**
   * Sets the interval length based on the source chain
   */
  setChainIntervalLength = () => {
    const { state } = this;
    const { srcChainId } = state.quoteRequest;
    const bridgeFeatureFlags = getBridgeFeatureFlags(this.messagingSystem);

    const refreshRateOverride = srcChainId
      ? bridgeFeatureFlags.chains[formatChainIdToCaip(srcChainId)]?.refreshRate
      : undefined;
    const defaultRefreshRate = bridgeFeatureFlags.refreshRate;
    this.setIntervalLength(refreshRateOverride ?? defaultRefreshRate);
  };

  readonly #fetchBridgeQuotes = async ({
    networkClientId: _networkClientId,
    updatedQuoteRequest,
    context,
  }: BridgePollingInput) => {
    this.#abortController?.abort('New quote request');
    this.#abortController = new AbortController();

    this.trackUnifiedSwapBridgeEvent(
      UnifiedSwapBridgeEventName.QuotesRequested,
      context,
    );

    const { sseEnabled, maxRefreshCount } = getBridgeFeatureFlags(
      this.messagingSystem,
    );
    const shouldStream = Boolean(sseEnabled);

    this.update((state) => {
      state.quotesLoadingStatus = RequestStatus.LOADING;
      // TODO remove this since it's not needed
      state.quoteRequest = updatedQuoteRequest;
      state.quoteFetchError = DEFAULT_BRIDGE_CONTROLLER_STATE.quoteFetchError;
    });

    try {
      await this.#trace(
        {
          name: isCrossChain(
            updatedQuoteRequest.srcChainId,
            updatedQuoteRequest.destChainId,
          )
            ? TraceName.BridgeQuotesFetched
            : TraceName.SwapQuotesFetched,
          data: {
            srcChainId: formatChainIdToCaip(updatedQuoteRequest.srcChainId),
            destChainId: formatChainIdToCaip(updatedQuoteRequest.destChainId),
          },
        },
        async () => {
          // This call is not awaited to prevent blocking quote fetching if the snap takes too long to respond
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.#setMinimumBalanceForRentExemptionInLamports(
            updatedQuoteRequest.srcChainId,
          );
          if (shouldStream) {
            await fetchBridgeQuoteStream(
              this.#fetchFn,
              updatedQuoteRequest,
              this.#abortController?.signal,
              this.#clientId,
              this.#config.customBridgeApiBaseUrl ?? BRIDGE_PROD_API_BASE_URL,
              {
                onOpen: async () => {
                  // Clear quotes when first quote in stream is received
                  this.update((state) => {
                    state.quotes = DEFAULT_BRIDGE_CONTROLLER_STATE.quotes;
                  });
                  return Promise.resolve();
                },
                onValidationFailures: this.#trackResponseValidationFailures,
                onValidQuotesReceived: async (quote: QuoteResponse) => {
                  const quotesWithFees = await this.#appendFees(
                    updatedQuoteRequest,
                    [quote],
                  );
                  this.update((state) => {
                    if (
                      state.quotesInitialLoadTime ===
                        DEFAULT_BRIDGE_CONTROLLER_STATE.quotesInitialLoadTime &&
                      quotesWithFees.length > 0 &&
                      this.#quotesFirstFetched
                    ) {
                      state.quotesInitialLoadTime =
                        Date.now() - this.#quotesFirstFetched;
                    }
                    state.quotes.push(...quotesWithFees);
                  });
                },
              },
            );
          } else {
            const quotes = await this.fetchQuotes(
              updatedQuoteRequest,
              // AbortController is always defined by this line, because we assign it a few lines above,
              // not sure why Jest thinks it's not
              // Linters accurately say that it's defined
              this.#abortController?.signal as AbortSignal,
            );
            this.update((state) => {
              state.quotes = quotes;
            });
          }

          this.update((state) => {
            state.quotesLoadingStatus = RequestStatus.FETCHED;
          });
        },
      );
    } catch (error) {
      const isAbortError = (error as Error).name === 'AbortError';
      if (
        isAbortError ||
        [
          AbortReason.ResetState,
          AbortReason.NewQuoteRequest,
          AbortReason.QuoteRequestUpdated,
        ].includes(error as AbortReason)
      ) {
        // Exit the function early to prevent other state updates
        return;
      }

      this.update((state) => {
        state.quoteFetchError =
          this.#clientId === BridgeClientId.MOBILE
            ? 'generic mobile error'
            : (((error as Error)?.message ??
                'Unknown error') as never as string);

        state.quotesLoadingStatus = RequestStatus.ERROR;
        state.quotes = DEFAULT_BRIDGE_CONTROLLER_STATE.quotes;
      });

      this.trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.QuotesError,
        context,
      );
      console.log(
        `Failed to ${shouldStream ? 'stream' : 'fetch'} bridge quotes`,
        error,
      );
    }

    // Stop polling if the maximum number of refreshes has been reached
    if (
      updatedQuoteRequest.insufficientBal ||
      (!updatedQuoteRequest.insufficientBal &&
        this.state.quotesRefreshCount >= maxRefreshCount)
    ) {
      this.stopAllPolling();
    }

    // Update quote fetching stats
    const quotesLastFetched = Date.now();
    this.update((state) => {
      if (!shouldStream) {
        state.quotesInitialLoadTime =
          state.quotesRefreshCount === 0 && this.#quotesFirstFetched
            ? quotesLastFetched - this.#quotesFirstFetched
            : this.state.quotesInitialLoadTime;
      }
      state.quotesLastFetched = quotesLastFetched;
      state.quotesRefreshCount += 1;
    });
  };

  readonly #appendL1GasFees = async (
    quotes: QuoteResponse[],
  ): Promise<(QuoteResponse & L1GasFees)[] | undefined> => {
    // Indicates whether some of the quotes are not for optimism or base
    const hasInvalidQuotes = quotes.some(({ quote }) => {
      const chainId = formatChainIdToCaip(quote.srcChainId);
      return ![CHAIN_IDS.OPTIMISM, CHAIN_IDS.BASE]
        .map(formatChainIdToCaip)
        .includes(chainId);
    });

    // Only append L1 gas fees if all quotes are for either optimism or base
    if (hasInvalidQuotes) {
      return undefined;
    }

    const l1GasFeePromises = Promise.allSettled(
      quotes.map(async (quoteResponse) => {
        const { quote, trade, approval } = quoteResponse;
        const chainId = numberToHex(quote.srcChainId);

        const getTxParams = (txData: TxData) => ({
          from: txData.from,
          to: txData.to,
          value: txData.value,
          data: txData.data,
          gasLimit: txData.gasLimit?.toString(),
        });
        const approvalL1GasFees = approval
          ? await this.#getLayer1GasFee({
              transactionParams: getTxParams(approval),
              chainId,
            })
          : '0x0';
        const tradeL1GasFees = await this.#getLayer1GasFee({
          transactionParams: getTxParams(trade),
          chainId,
        });

        if (approvalL1GasFees === undefined || tradeL1GasFees === undefined) {
          return undefined;
        }

        return {
          ...quoteResponse,
          l1GasFeesInHexWei: sumHexes(approvalL1GasFees, tradeL1GasFees),
        };
      }),
    );

    const quotesWithL1GasFees = (await l1GasFeePromises).reduce<
      (QuoteResponse & L1GasFees)[]
    >((acc, result) => {
      if (result.status === 'fulfilled' && result.value) {
        acc.push(result.value);
      } else if (result.status === 'rejected') {
        console.error('Error calculating L1 gas fees for quote', result.reason);
      }
      return acc;
    }, []);

    return quotesWithL1GasFees;
  };

  readonly #setMinimumBalanceForRentExemptionInLamports = (
    srcChainId: GenericQuoteRequest['srcChainId'],
  ): Promise<void> | undefined => {
    const selectedAccount = this.#getMultichainSelectedAccount();

    return isSolanaChainId(srcChainId) && selectedAccount?.metadata?.snap?.id
      ? this.messagingSystem
          .call(
            'SnapController:handleRequest',
            getMinimumBalanceForRentExemptionRequest(
              selectedAccount.metadata.snap?.id,
            ),
          ) // eslint-disable-next-line promise/always-return
          .then((result) => {
            this.update((state) => {
              state.minimumBalanceForRentExemptionInLamports = String(result);
            });
          })
          .catch((error) => {
            console.error(
              'Error setting minimum balance for rent exemption',
              error,
            );
            this.update((state) => {
              state.minimumBalanceForRentExemptionInLamports =
                DEFAULT_BRIDGE_CONTROLLER_STATE.minimumBalanceForRentExemptionInLamports;
            });
          })
      : undefined;
  };

  /**
   * Appends transaction fees for non-EVM chains to quotes
   *
   * @param quotes - Array of quote responses to append fees to
   * @param walletAddress - The wallet address for which the quotes were requested
   * @returns Array of quotes with fees appended, or undefined if quotes are for EVM chains
   */
  readonly #appendNonEvmFees = async (
    quotes: QuoteResponse[],
    walletAddress: GenericQuoteRequest['walletAddress'],
  ): Promise<(QuoteResponse & NonEvmFees)[] | undefined> => {
    if (
      quotes.some(({ quote: { srcChainId } }) => !isNonEvmChainId(srcChainId))
    ) {
      return undefined;
    }

    const selectedAccount = this.#getMultichainSelectedAccount(walletAddress);
    const nonEvmFeePromises = Promise.allSettled(
      quotes.map(async (quoteResponse) => {
        const { trade, quote } = quoteResponse;

        if (selectedAccount?.metadata?.snap?.id && typeof trade === 'string') {
          const scope = formatChainIdToCaip(quote.srcChainId);

          const response = (await this.messagingSystem.call(
            'SnapController:handleRequest',
            computeFeeRequest(
              selectedAccount.metadata.snap?.id,
              trade,
              selectedAccount.id,
              scope,
            ),
          )) as {
            type: 'base' | 'priority';
            asset: {
              unit: string;
              type: string;
              amount: string;
              fungible: true;
            };
          }[];

          const baseFee = response?.find((fee) => fee.type === 'base');
          // Store fees in native units as returned by the snap (e.g., SOL, BTC)
          const feeInNative = baseFee?.asset?.amount || '0';

          return {
            ...quoteResponse,
            nonEvmFeesInNative: feeInNative,
          };
        }
        return quoteResponse;
      }),
    );

    const quotesWithNonEvmFees = (await nonEvmFeePromises).reduce<
      (QuoteResponse & NonEvmFees)[]
    >((acc, result) => {
      if (result.status === 'fulfilled' && result.value) {
        acc.push(result.value);
      } else if (result.status === 'rejected') {
        console.error(
          'Error calculating non-EVM fees for quote',
          result.reason,
        );
      }
      return acc;
    }, []);

    return quotesWithNonEvmFees;
  };

  #getMultichainSelectedAccount(
    walletAddress?: GenericQuoteRequest['walletAddress'],
  ) {
    const addressToUse = walletAddress ?? this.state.quoteRequest.walletAddress;
    if (!addressToUse) {
      throw new Error('Account address is required');
    }
    const selectedAccount = this.messagingSystem.call(
      'AccountsController:getAccountByAddress',
      addressToUse,
    );
    if (!selectedAccount) {
      throw new Error('Account not found');
    }
    return selectedAccount;
  }

  #getSelectedNetworkClientId() {
    const { selectedNetworkClientId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    return selectedNetworkClientId;
  }

  #getSelectedNetworkClient() {
    const selectedNetworkClientId = this.#getSelectedNetworkClientId();
    const networkClient = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      selectedNetworkClientId,
    );
    return networkClient;
  }

  readonly #getRequestParams = (): Omit<
    RequestParams,
    'token_symbol_source' | 'token_symbol_destination'
  > => {
    const srcChainIdCaip = formatChainIdToCaip(
      this.state.quoteRequest.srcChainId ||
        this.#getSelectedNetworkClient().configuration.chainId,
    );
    return getRequestParams(this.state.quoteRequest, srcChainIdCaip);
  };

  readonly #getRequestMetadata = (): Omit<
    RequestMetadata,
    | 'stx_enabled'
    | 'usd_amount_source'
    | 'security_warnings'
    | 'is_hardware_wallet'
  > => {
    return {
      slippage_limit: this.state.quoteRequest.slippage,
      swap_type: getSwapTypeFromQuote(this.state.quoteRequest),
      custom_slippage: isCustomSlippage(this.state.quoteRequest.slippage),
    };
  };

  readonly #getQuoteFetchData = (): Omit<
    QuoteFetchData,
    'best_quote_provider' | 'price_impact' | 'can_submit'
  > => {
    return {
      quotes_count: this.state.quotes.length,
      quotes_list: this.state.quotes.map(({ quote }) =>
        formatProviderLabel(quote),
      ),
      initial_load_time_all_quotes: this.state.quotesInitialLoadTime ?? 0,
    };
  };

  readonly #getEventProperties = <
    T extends
      (typeof UnifiedSwapBridgeEventName)[keyof typeof UnifiedSwapBridgeEventName],
  >(
    eventName: T,
    propertiesFromClient: Pick<RequiredEventContextFromClient, T>[T],
  ): CrossChainSwapsEventProperties<T> => {
    const baseProperties = {
      ...propertiesFromClient,
      action_type: MetricsActionType.SWAPBRIDGE_V1,
    };
    switch (eventName) {
      case UnifiedSwapBridgeEventName.ButtonClicked:
      case UnifiedSwapBridgeEventName.PageViewed:
        return {
          ...this.#getRequestParams(),
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.QuotesValidationFailed:
        return {
          ...this.#getRequestParams(),
          refresh_count: this.state.quotesRefreshCount,
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.QuotesReceived:
        return {
          ...this.#getRequestParams(),
          ...this.#getRequestMetadata(),
          ...this.#getQuoteFetchData(),
          is_hardware_wallet: isHardwareWallet(
            this.#getMultichainSelectedAccount(),
          ),
          refresh_count: this.state.quotesRefreshCount,
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.QuotesRequested:
        return {
          ...this.#getRequestParams(),
          ...this.#getRequestMetadata(),
          is_hardware_wallet: isHardwareWallet(
            this.#getMultichainSelectedAccount(),
          ),
          has_sufficient_funds: !this.state.quoteRequest.insufficientBal,
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.QuotesError:
        return {
          ...this.#getRequestParams(),
          ...this.#getRequestMetadata(),
          is_hardware_wallet: isHardwareWallet(
            this.#getMultichainSelectedAccount(),
          ),
          error_message: this.state.quoteFetchError,
          has_sufficient_funds: !this.state.quoteRequest.insufficientBal,
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.AllQuotesOpened:
      case UnifiedSwapBridgeEventName.AllQuotesSorted:
      case UnifiedSwapBridgeEventName.QuoteSelected:
        return {
          ...this.#getRequestParams(),
          ...this.#getRequestMetadata(),
          ...this.#getQuoteFetchData(),
          is_hardware_wallet: isHardwareWallet(
            this.#getMultichainSelectedAccount(),
          ),
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.Failed: {
        // Populate the properties that the error occurred before the tx was submitted
        return {
          ...baseProperties,
          ...this.#getRequestParams(),
          ...this.#getRequestMetadata(),
          ...this.#getQuoteFetchData(),
          ...propertiesFromClient,
        };
      }
      case UnifiedSwapBridgeEventName.AssetDetailTooltipClicked:
        return baseProperties;
      // These events may be published after the bridge-controller state is reset
      // So the BridgeStatusController populates all the properties
      case UnifiedSwapBridgeEventName.Submitted:
      case UnifiedSwapBridgeEventName.Completed:
        return propertiesFromClient;
      case UnifiedSwapBridgeEventName.InputChanged:
      default:
        return baseProperties;
    }
  };

  readonly #trackInputChangedEvents = (
    paramsToUpdate: Partial<GenericQuoteRequest>,
  ) => {
    Object.entries(paramsToUpdate).forEach(([key, value]) => {
      const inputKey = toInputChangedPropertyKey[key as keyof QuoteRequest];
      const inputValue =
        toInputChangedPropertyValue[key as keyof QuoteRequest]?.(
          paramsToUpdate,
        );
      if (
        inputKey &&
        inputValue !== undefined &&
        value !== this.state.quoteRequest[key as keyof GenericQuoteRequest]
      ) {
        this.trackUnifiedSwapBridgeEvent(
          UnifiedSwapBridgeEventName.InputChanged,
          {
            input: inputKey,
            input_value: inputValue,
          },
        );
      }
    });
  };

  /**
   * This method tracks cross-chain swaps events
   *
   * @param eventName - The name of the event to track
   * @param propertiesFromClient - Properties that can't be calculated from the event name and need to be provided by the client
   * @example
   * this.trackUnifiedSwapBridgeEvent(UnifiedSwapBridgeEventName.ActionOpened, {
   *   location: MetaMetricsSwapsEventSource.MainView,
   * });
   */
  trackUnifiedSwapBridgeEvent = <
    T extends
      (typeof UnifiedSwapBridgeEventName)[keyof typeof UnifiedSwapBridgeEventName],
  >(
    eventName: T,
    propertiesFromClient: Pick<RequiredEventContextFromClient, T>[T],
  ) => {
    try {
      const combinedPropertiesForEvent = this.#getEventProperties<T>(
        eventName,
        propertiesFromClient,
      );

      this.#trackMetaMetricsFn(eventName, combinedPropertiesForEvent);
    } catch (error) {
      console.error(
        'Error tracking cross-chain swaps MetaMetrics event',
        error,
      );
    }
  };

  /**
   *
   * @param contractAddress - The address of the ERC20 token contract
   * @param chainId - The hex chain ID of the bridge network
   * @returns The atomic allowance of the ERC20 token contract
   */
  getBridgeERC20Allowance = async (
    contractAddress: string,
    chainId: Hex,
  ): Promise<string> => {
    const provider = this.#getSelectedNetworkClient()?.provider;
    if (!provider) {
      throw new Error('No provider found');
    }

    const ethersProvider = new Web3Provider(provider);
    const contract = new Contract(contractAddress, abiERC20, ethersProvider);
    const allowance: BigNumber = await contract.allowance(
      this.state.quoteRequest.walletAddress,
      METABRIDGE_CHAIN_TO_ADDRESS_MAP[chainId],
    );
    return allowance.toString();
  };
}
