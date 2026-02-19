/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import type { StateMetadata } from '@metamask/base-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { TransactionController } from '@metamask/transaction-controller';
import type { CaipAssetType, Hex } from '@metamask/utils';

import type { BridgeClientId } from './constants/bridge';
import {
  BRIDGE_CONTROLLER_NAME,
  BRIDGE_PROD_API_BASE_URL,
  DEFAULT_BRIDGE_CONTROLLER_STATE,
  METABRIDGE_ETHEREUM_ADDRESS,
  REFRESH_INTERVAL_MS,
} from './constants/bridge';
import { CHAIN_IDS } from './constants/chains';
import { SWAPS_CONTRACT_ADDRESSES } from './constants/swaps';
import { TraceName } from './constants/traces';
import { selectIsAssetExchangeRateInState } from './selectors';
import { RequestStatus } from './types';
import type {
  L1GasFees,
  GenericQuoteRequest,
  NonEvmFees,
  QuoteRequest,
  QuoteResponse,
  BridgeControllerState,
  BridgeControllerMessenger,
  FetchFunction,
} from './types';
import { getAssetIdsForToken, toExchangeRates } from './utils/assets';
import { hasSufficientBalance } from './utils/balance';
import {
  getDefaultBridgeControllerState,
  isCrossChain,
  isEthUsdt,
  isNonEvmChainId,
  isSolanaChainId,
} from './utils/bridge';
import {
  formatAddressToCaipReference,
  formatChainIdToCaip,
  formatChainIdToHex,
} from './utils/caip-formatters';
import {
  getBridgeFeatureFlags,
  hasMinimumRequiredVersion,
} from './utils/feature-flags';
import {
  fetchAssetPrices,
  fetchBridgeQuotes,
  fetchBridgeQuoteStream,
} from './utils/fetch';
import {
  AbortReason,
  MetaMetricsSwapsEventSource,
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
  RequiredEventContextFromClient,
} from './utils/metrics/types';
import type { CrossChainSwapsEventProperties } from './utils/metrics/types';
import { isValidQuoteRequest, sortQuotes } from './utils/quote';
import { appendFeesToQuotes } from './utils/quote-fees';
import { getMinimumBalanceForRentExemptionInLamports } from './utils/snaps';
import type { FeatureId } from './utils/validators';

const metadata: StateMetadata<BridgeControllerState> = {
  quoteRequest: {
    includeInStateLogs: true,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  quotes: {
    includeInStateLogs: true,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  quotesInitialLoadTime: {
    includeInStateLogs: true,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  quotesLastFetched: {
    includeInStateLogs: true,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  quotesLoadingStatus: {
    includeInStateLogs: true,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  quoteFetchError: {
    includeInStateLogs: true,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  quotesRefreshCount: {
    includeInStateLogs: true,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  assetExchangeRates: {
    includeInStateLogs: true,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  minimumBalanceForRentExemptionInLamports: {
    includeInStateLogs: true,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
};

/**
 * The input to start polling for the {@link BridgeController}
 *
 * @param updatedQuoteRequest - The updated quote request
 * @param context - The context contains properties that can't be populated by the
 * controller and need to be provided by the client for analytics
 */
type BridgePollingInput = {
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

  /**
   * Stores the location/entry point from which the user initiated the swap or bridge flow.
   * Set via setLocation() before navigating to the swap/bridge flow.
   * Used as default for all subsequent internal events.
   */
  #location: MetaMetricsSwapsEventSource = MetaMetricsSwapsEventSource.MainView;

  readonly #clientId: BridgeClientId;

  readonly #clientVersion: string;

  readonly #getLayer1GasFee: typeof TransactionController.prototype.getLayer1GasFee;

  readonly #fetchFn: FetchFunction;

  readonly #trackMetaMetricsFn: <
    EventName extends
      (typeof UnifiedSwapBridgeEventName)[keyof typeof UnifiedSwapBridgeEventName],
  >(
    eventName: EventName,
    properties: CrossChainSwapsEventProperties<EventName>,
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
    clientVersion: string;
    getLayer1GasFee: typeof TransactionController.prototype.getLayer1GasFee;
    fetchFn: FetchFunction;
    config?: {
      customBridgeApiBaseUrl?: string;
    };
    trackMetaMetricsFn: <
      EventName extends
        (typeof UnifiedSwapBridgeEventName)[keyof typeof UnifiedSwapBridgeEventName],
    >(
      eventName: EventName,
      properties: CrossChainSwapsEventProperties<EventName>,
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
    this.messenger.registerActionHandler(
      `${BRIDGE_CONTROLLER_NAME}:setChainIntervalLength`,
      this.setChainIntervalLength.bind(this),
    );
    this.messenger.registerActionHandler(
      `${BRIDGE_CONTROLLER_NAME}:updateBridgeQuoteRequestParams`,
      this.updateBridgeQuoteRequestParams.bind(this),
    );
    this.messenger.registerActionHandler(
      `${BRIDGE_CONTROLLER_NAME}:resetState`,
      this.resetState.bind(this),
    );
    this.messenger.registerActionHandler(
      `${BRIDGE_CONTROLLER_NAME}:trackUnifiedSwapBridgeEvent`,
      this.trackUnifiedSwapBridgeEvent.bind(this),
    );
    this.messenger.registerActionHandler(
      `${BRIDGE_CONTROLLER_NAME}:stopPollingForQuotes`,
      this.stopPollingForQuotes.bind(this),
    );
    this.messenger.registerActionHandler(
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
    this.#trackInputChangedEvents(paramsToUpdate);
    this.resetState(AbortReason.QuoteRequestUpdated);
    const updatedQuoteRequest = {
      ...DEFAULT_BRIDGE_CONTROLLER_STATE.quoteRequest,
      ...paramsToUpdate,
    };
    this.update((state) => {
      state.quoteRequest = updatedQuoteRequest;
    });

    if (isValidQuoteRequest(updatedQuoteRequest)) {
      this.#quotesFirstFetched = Date.now();
      const isSrcChainNonEVM = isNonEvmChainId(updatedQuoteRequest.srcChainId);
      const providerConfig = isSrcChainNonEVM
        ? undefined
        : this.#getNetworkClientByChainId(
            formatChainIdToHex(updatedQuoteRequest.srcChainId),
          )?.configuration;

      let insufficientBal: boolean | undefined;
      let resetApproval: boolean = Boolean(paramsToUpdate.resetApproval);
      if (isSrcChainNonEVM) {
        // If the source chain is not an EVM network, use value from params
        insufficientBal = paramsToUpdate.insufficientBal;
      } else if (providerConfig?.rpcUrl?.includes('tenderly')) {
        // If the rpcUrl is a tenderly fork (e2e tests), set insufficientBal=true
        // The bridge-api filters out quotes if the balance on mainnet is insufficient so this override allows quotes to always be returned
        insufficientBal = true;
      } else {
        // Set loading status if RPC calls are made before the quotes are fetched
        this.update((state) => {
          state.quotesLoadingStatus = RequestStatus.LOADING;
        });
        resetApproval = await this.#shouldResetApproval(updatedQuoteRequest);
        // Otherwise query the src token balance from the RPC provider
        insufficientBal =
          paramsToUpdate.insufficientBal ??
          (await this.#hasInsufficientBalance(updatedQuoteRequest));
      }

      // Set refresh rate based on the source chain before starting polling
      this.setChainIntervalLength();
      this.startPolling({
        updatedQuoteRequest: {
          ...updatedQuoteRequest,
          insufficientBal,
          resetApproval,
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
    const bridgeFeatureFlags = getBridgeFeatureFlags(this.messenger);
    const jwt = await this.#getJwt();
    // If featureId is specified, retrieve the quoteRequestOverrides for that featureId
    const quoteRequestOverrides = featureId
      ? bridgeFeatureFlags.quoteRequestOverrides?.[featureId]
      : undefined;
    const resetApproval = await this.#shouldResetApproval(quoteRequest);

    // If quoteRequestOverrides is specified, merge it with the quoteRequest
    const { quotes: baseQuotes, validationFailures } = await fetchBridgeQuotes(
      quoteRequestOverrides
        ? { ...quoteRequest, ...quoteRequestOverrides, resetApproval }
        : { ...quoteRequest, resetApproval },
      abortSignal,
      this.#clientId,
      jwt,
      this.#fetchFn,
      this.#config.customBridgeApiBaseUrl ?? BRIDGE_PROD_API_BASE_URL,
      featureId,
      this.#clientVersion,
    );

    this.#trackResponseValidationFailures(validationFailures);

    const quotesWithFees = await appendFeesToQuotes(
      baseQuotes,
      this.messenger,
      this.#getLayer1GasFee,
      this.#getMultichainSelectedAccount(quoteRequest.walletAddress),
    );

    return sortQuotes(quotesWithFees, featureId);
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
        location: this.#location,
      },
    );
  };

  readonly #getExchangeRateSources = () => {
    return {
      ...this.messenger.call('MultichainAssetsRatesController:getState'),
      ...this.messenger.call('CurrencyRateController:getState'),
      ...this.messenger.call('TokenRatesController:getState'),
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

    const currency = this.messenger.call(
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
      signal: this.#abortController?.signal,
    });
    const exchangeRates = toExchangeRates(currency, pricesByAssetId);
    this.update((state) => {
      state.assetExchangeRates = {
        ...state.assetExchangeRates,
        ...exchangeRates,
      };
    });
  };

  readonly #hasInsufficientBalance = async (
    quoteRequest: GenericQuoteRequest,
  ) => {
    try {
      const srcChainIdInHex = formatChainIdToHex(quoteRequest.srcChainId);
      const provider =
        this.#getNetworkClientByChainId(srcChainIdInHex)?.provider;
      const normalizedSrcTokenAddress = formatAddressToCaipReference(
        quoteRequest.srcTokenAddress,
      );

      return !(
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
    } catch (error) {
      console.warn('Failed to set insufficientBal', error);
      // Fall back to true so the backend returns quotes
      return true;
    }
  };

  readonly #shouldResetApproval = async (quoteRequest: GenericQuoteRequest) => {
    if (isNonEvmChainId(quoteRequest.srcChainId)) {
      return false;
    }
    try {
      const normalizedSrcTokenAddress = formatAddressToCaipReference(
        quoteRequest.srcTokenAddress,
      );
      if (isEthUsdt(quoteRequest.srcChainId, normalizedSrcTokenAddress)) {
        const allowance = BigNumber.from(
          await this.#getUSDTMainnetAllowance(
            quoteRequest.walletAddress,
            normalizedSrcTokenAddress,
            quoteRequest.destChainId,
          ),
        );
        return allowance.lt(quoteRequest.srcTokenAmount) && allowance.gt(0);
      }
      return false;
    } catch (error) {
      console.warn('Failed to set resetApproval', error);
      // Fall back to true so the backend returns quotes
      return true;
    }
  };

  stopPollingForQuotes = (
    reason?: AbortReason,
    context?: RequiredEventContextFromClient[UnifiedSwapBridgeEventName.QuotesReceived],
  ) => {
    this.stopAllPolling();
    // If polling is stopped before quotes finish loading, track QuotesReceived
    if (this.state.quotesLoadingStatus === RequestStatus.LOADING && context) {
      this.trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.QuotesReceived,
        context,
      );
    }
    // Clears quotes list in state
    this.#abortController?.abort(reason);
  };

  /**
   * Sets the location/entry point for the current swap or bridge flow.
   * Call this when the user enters the flow so that all internally-fired
   * events (InputChanged, QuotesRequested, etc.) carry the correct location.
   *
   * @param location - The entry point from which the user initiated the flow
   */
  setLocation = (location: MetaMetricsSwapsEventSource) => {
    this.#location = location;
  };

  resetState = (reason = AbortReason.ResetState) => {
    this.stopPollingForQuotes(reason);
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
    const bridgeFeatureFlags = getBridgeFeatureFlags(this.messenger);

    const refreshRateOverride = srcChainId
      ? bridgeFeatureFlags.chains[formatChainIdToCaip(srcChainId)]?.refreshRate
      : undefined;
    const defaultRefreshRate = bridgeFeatureFlags.refreshRate;
    this.setIntervalLength(refreshRateOverride ?? defaultRefreshRate);
  };

  readonly #fetchBridgeQuotes = async ({
    updatedQuoteRequest,
    context,
  }: BridgePollingInput) => {
    this.#abortController?.abort(AbortReason.NewQuoteRequest);
    this.#abortController = new AbortController();

    this.#fetchAssetExchangeRates(updatedQuoteRequest).catch((error) =>
      console.warn('Failed to fetch asset exchange rates', error),
    );

    this.trackUnifiedSwapBridgeEvent(
      UnifiedSwapBridgeEventName.QuotesRequested,
      context,
    );

    const { sse, maxRefreshCount } = getBridgeFeatureFlags(this.messenger);
    const shouldStream =
      sse?.enabled &&
      hasMinimumRequiredVersion(this.#clientVersion, sse.minimumVersion);

    this.update((state) => {
      state.quoteRequest = updatedQuoteRequest;
      state.quoteFetchError = DEFAULT_BRIDGE_CONTROLLER_STATE.quoteFetchError;
      state.quotesLastFetched = Date.now();
      state.quotesLoadingStatus = RequestStatus.LOADING;
    });

    const jwt = await this.#getJwt();

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
          const selectedAccount = this.#getMultichainSelectedAccount(
            updatedQuoteRequest.walletAddress,
          );
          // This call is not awaited to prevent blocking quote fetching if the snap takes too long to respond
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.#setMinimumBalanceForRentExemptionInLamports(
            updatedQuoteRequest.srcChainId,
            selectedAccount?.metadata?.snap?.id,
          );
          // Use SSE if enabled and return early
          if (shouldStream) {
            await this.#handleQuoteStreaming(
              updatedQuoteRequest,
              jwt,
              selectedAccount,
            );
            return;
          }
          // Otherwise use regular fetch
          const quotes = await this.fetchQuotes(
            updatedQuoteRequest,
            this.#abortController?.signal,
          );
          this.update((state) => {
            // Set the initial load time if this is the first fetch
            if (
              state.quotesRefreshCount ===
                DEFAULT_BRIDGE_CONTROLLER_STATE.quotesRefreshCount &&
              this.#quotesFirstFetched
            ) {
              state.quotesInitialLoadTime =
                Date.now() - this.#quotesFirstFetched;
            }
            state.quotes = quotes;
            state.quotesLoadingStatus = RequestStatus.FETCHED;
          });
        },
      );
    } catch (error) {
      // Reset the quotes list if the fetch fails to avoid showing stale quotes
      this.update((state) => {
        state.quotes = DEFAULT_BRIDGE_CONTROLLER_STATE.quotes;
      });
      // Ignore abort errors
      if (
        (error as Error).toString().includes('AbortError') ||
        (error as Error).toString().includes('FetchRequestCanceledException') ||
        [
          AbortReason.ResetState,
          AbortReason.NewQuoteRequest,
          AbortReason.QuoteRequestUpdated,
          AbortReason.TransactionSubmitted,
        ].includes(error as AbortReason)
      ) {
        // Exit the function early to prevent other state updates
        return;
      }

      // Update loading status and error message
      this.update((state) => {
        // The error object reference is not guaranteed to exist on mobile so reading
        // the message directly could cause an error.
        let errorMessage;
        try {
          errorMessage =
            (error as Error)?.message ?? (error as Error).toString();
        } catch {
          // Intentionally empty
        } finally {
          state.quoteFetchError = errorMessage ?? 'Unknown error';
        }
        state.quotesLoadingStatus = RequestStatus.ERROR;
      });
      // Track event and log error
      this.trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.QuotesError,
        context,
      );
      console.log(
        `Failed to ${shouldStream ? 'stream' : 'fetch'} bridge quotes`,
        error,
      );
    }

    // Update refresh count after fetching, validation and fee calculation have completed
    this.update((state) => {
      state.quotesRefreshCount += 1;
    });
    // Stop polling if the maximum number of refreshes has been reached
    if (
      updatedQuoteRequest.insufficientBal ||
      (!updatedQuoteRequest.insufficientBal &&
        this.state.quotesRefreshCount >= maxRefreshCount)
    ) {
      this.stopAllPolling();
    }
  };

  readonly #handleQuoteStreaming = async (
    updatedQuoteRequest: GenericQuoteRequest,
    jwt?: string,
    selectedAccount?: InternalAccount,
  ) => {
    /**
     * Tracks the number of valid quotes received from the current stream, which is used
     * to determine when to clear the quotes list and set the initial load time
     */
    let validQuotesCounter = 0;
    /**
     * Tracks all pending promises from appendFeesToQuotes calls to ensure they complete
     * before setting quotesLoadingStatus to FETCHED
     */
    const pendingFeeAppendPromises = new Set<Promise<void>>();

    await fetchBridgeQuoteStream(
      this.#fetchFn,
      updatedQuoteRequest,
      this.#abortController?.signal,
      this.#clientId,
      jwt,
      this.#config.customBridgeApiBaseUrl ?? BRIDGE_PROD_API_BASE_URL,
      {
        onValidationFailure: this.#trackResponseValidationFailures,
        onValidQuoteReceived: async (quote: QuoteResponse) => {
          const feeAppendPromise = (async () => {
            const quotesWithFees = await appendFeesToQuotes(
              [quote],
              this.messenger,
              this.#getLayer1GasFee,
              selectedAccount,
            );
            if (quotesWithFees.length > 0) {
              validQuotesCounter += 1;
            }
            this.update((state) => {
              // Clear previous quotes and quotes load time when first quote in the current
              // polling loop is received
              // This enables clients to continue showing the previous quotes while new
              // quotes are loading
              // Note: If there are no valid quotes until the 2nd fetch, quotesInitialLoadTime will be > refreshRate
              if (validQuotesCounter === 1) {
                state.quotes = DEFAULT_BRIDGE_CONTROLLER_STATE.quotes;
                if (!state.quotesInitialLoadTime && this.#quotesFirstFetched) {
                  // Set the initial load time after the first quote is received
                  state.quotesInitialLoadTime =
                    Date.now() - this.#quotesFirstFetched;
                }
              }
              state.quotes = [...state.quotes, ...quotesWithFees];
            });
          })();
          pendingFeeAppendPromises.add(feeAppendPromise);
          feeAppendPromise
            .catch((error) => {
              // Catch errors to prevent them from breaking stream processing
              // If appendFeesToQuotes throws, the state update never happens, so no invalid entry is added
              console.error('Error appending fees to quote', error);
            })
            .finally(() => {
              pendingFeeAppendPromises.delete(feeAppendPromise);
            });
          // Await the promise to ensure errors are caught and handled before continuing
          // The promise is also tracked in pendingFeeAppendPromises for onClose to wait for
          await feeAppendPromise;
        },
        onClose: async () => {
          // Wait for all pending appendFeesToQuotes operations to complete
          // before setting quotesLoadingStatus to FETCHED
          await Promise.allSettled(Array.from(pendingFeeAppendPromises));
          this.update((state) => {
            // If there are no valid quotes in the current stream, clear the quotes list
            // to remove quotes from the previous stream
            if (validQuotesCounter === 0) {
              state.quotes = DEFAULT_BRIDGE_CONTROLLER_STATE.quotes;
            }
            state.quotesLoadingStatus = RequestStatus.FETCHED;
          });
        },
      },
      this.#clientVersion,
    );
  };

  readonly #setMinimumBalanceForRentExemptionInLamports = async (
    srcChainId: GenericQuoteRequest['srcChainId'],
    snapId?: string,
  ) => {
    if (!isSolanaChainId(srcChainId) || !snapId) {
      return;
    }
    const minimumBalanceForRentExemptionInLamports =
      await getMinimumBalanceForRentExemptionInLamports(snapId, this.messenger);
    this.update((state) => {
      state.minimumBalanceForRentExemptionInLamports =
        minimumBalanceForRentExemptionInLamports;
    });
  };

  #getMultichainSelectedAccount(
    walletAddress?: GenericQuoteRequest['walletAddress'],
  ) {
    const addressToUse = walletAddress ?? this.state.quoteRequest.walletAddress;
    if (!addressToUse) {
      throw new Error('Account address is required');
    }
    const selectedAccount = this.messenger.call(
      'AccountsController:getAccountByAddress',
      addressToUse,
    );
    return selectedAccount;
  }

  #getNetworkClientByChainId(chainId: Hex) {
    const networkClientId = this.messenger.call(
      'NetworkController:findNetworkClientIdByChainId',
      chainId,
    );
    if (!networkClientId) {
      throw new Error(`No network client found for chainId: ${chainId}`);
    }
    const networkClient = this.messenger.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
    return networkClient;
  }

  readonly #getJwt = async (): Promise<string | undefined> => {
    try {
      const token = await this.messenger.call(
        'AuthenticationController:getBearerToken',
      );
      return token;
    } catch (error) {
      console.error('Error getting JWT token for bridge-api request', error);
      return undefined;
    }
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
      has_gas_included_quote: this.state.quotes.some(
        ({ quote }) => quote.gasIncluded,
      ),
    };
  };

  readonly #getEventProperties = <
    EventName extends
      (typeof UnifiedSwapBridgeEventName)[keyof typeof UnifiedSwapBridgeEventName],
  >(
    eventName: EventName,
    propertiesFromClient: Pick<
      RequiredEventContextFromClient,
      EventName
    >[EventName],
  ): CrossChainSwapsEventProperties<EventName> => {
    const clientProps = propertiesFromClient as Record<string, unknown>;
    const baseProperties = {
      ...propertiesFromClient,
      location: clientProps?.location ?? this.#location,
      action_type: MetricsActionType.SWAPBRIDGE_V1,
    };
    switch (eventName) {
      case UnifiedSwapBridgeEventName.ButtonClicked:
      case UnifiedSwapBridgeEventName.PageViewed:
        return {
          ...getRequestParams(this.state.quoteRequest),
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.QuotesValidationFailed:
        return {
          ...getRequestParams(this.state.quoteRequest),
          refresh_count: this.state.quotesRefreshCount,
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.QuotesReceived:
        return {
          ...getRequestParams(this.state.quoteRequest),
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
          ...getRequestParams(this.state.quoteRequest),
          ...this.#getRequestMetadata(),
          is_hardware_wallet: isHardwareWallet(
            this.#getMultichainSelectedAccount(),
          ),
          has_sufficient_funds: !this.state.quoteRequest.insufficientBal,
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.QuotesError:
        return {
          ...getRequestParams(this.state.quoteRequest),
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
          ...getRequestParams(this.state.quoteRequest),
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
          ...getRequestParams(this.state.quoteRequest),
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
            location: this.#location,
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
    EventName extends
      (typeof UnifiedSwapBridgeEventName)[keyof typeof UnifiedSwapBridgeEventName],
  >(
    eventName: EventName,
    propertiesFromClient: Pick<
      RequiredEventContextFromClient,
      EventName
    >[EventName],
  ) => {
    try {
      const combinedPropertiesForEvent = this.#getEventProperties<EventName>(
        eventName,
        propertiesFromClient,
      );

      this.#trackMetaMetricsFn(eventName, combinedPropertiesForEvent);
    } catch (error) {
      console.error(
        `Error tracking cross-chain swaps MetaMetrics event ${eventName}`,
        error,
      );
    }
  };

  /**
   *
   * @param walletAddress - The address of the account to get the allowance for
   * @param contractAddress - The address of the ERC20 token contract on mainnet
   * @param destinationChainId - The chain ID of the destination network
   * @returns The atomic allowance of the ERC20 token contract
   */
  readonly #getUSDTMainnetAllowance = async (
    walletAddress: string,
    contractAddress: string,
    destinationChainId: GenericQuoteRequest['destChainId'],
  ): Promise<string> => {
    const networkClient = this.#getNetworkClientByChainId(CHAIN_IDS.MAINNET);
    const provider = networkClient?.provider;
    if (!provider) {
      throw new Error('No provider found');
    }

    const ethersProvider = new Web3Provider(provider);
    const contract = new Contract(contractAddress, abiERC20, ethersProvider);
    const spenderAddress = isCrossChain(CHAIN_IDS.MAINNET, destinationChainId)
      ? METABRIDGE_ETHEREUM_ADDRESS
      : SWAPS_CONTRACT_ADDRESSES[CHAIN_IDS.MAINNET];
    const allowance: BigNumber = await contract.allowance(
      walletAddress,
      spenderAddress,
    );
    return allowance.toString();
  };
}
