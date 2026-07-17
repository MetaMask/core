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
import {
  ExchangeRateSourcesForLookup,
  selectIsAssetExchangeRateInState,
} from './selectors';
import { RequestStatus } from './types';
import type {
  L1GasFees,
  GenericQuoteRequest,
  NonEvmFees,
  QuoteRequest,
  BridgeControllerState,
  BridgeControllerMessenger,
  FetchFunction,
  InputPrimaryDenomination,
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
  fetchBatchSellTrades,
} from './utils/fetch';
import {
  AbortReason,
  BatchSellMetricsEventName,
  MetaMetricsSwapsEventSource,
  MetricsActionType,
  UnifiedSwapBridgeEventName,
} from './utils/metrics/constants';
import type {
  BridgeControllerMetricsEventName,
  BridgeControllerMetricsLocation,
} from './utils/metrics/constants';
import {
  formatProviderLabel,
  getAccountHardwareType,
  getRequestParams,
  getSwapTypeFromQuote,
  isCustomSlippage,
  toInputChangedPropertyKey,
  toInputChangedPropertyValue,
} from './utils/metrics/properties';
import type {
  QuoteFetchData,
  RequestMetadata,
  RequiredEventContextFromClient,
} from './utils/metrics/types';
import type { CrossChainSwapsEventProperties } from './utils/metrics/types';
import { sortQuotes } from './utils/sort-quotes';
import {
  isValidQuoteRequest,
  isValidBatchSellQuoteRequest,
} from './validators/quote-request';
import { appendFeesToQuotes } from './utils/quote-fees';
import { getMinimumBalanceForRentExemptionInLamports } from './utils/snaps';
import type { FeatureId } from './validators/feature-flags';
import type { QuoteResponseV1 } from './validators/quote-response-v1';

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
  tokenWarnings: {
    includeInStateLogs: true,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  tokenSecurityTypeDestination: {
    includeInStateLogs: true,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  inputPrimaryDenomination: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  quoteStreamComplete: {
    includeInStateLogs: true,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  batchSellTrades: {
    includeInStateLogs: true,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  batchSellTradesLoadingStatus: {
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
  quoteRequests: GenericQuoteRequest[];
  context: RequiredEventContextFromClient[UnifiedSwapBridgeEventName.QuotesError] &
    RequiredEventContextFromClient[UnifiedSwapBridgeEventName.QuotesRequested];
};

const MESSENGER_EXPOSED_METHODS = [
  'updateBridgeQuoteRequestParams',
  'fetchQuotes',
  'updateBatchSellTrades',
  'stopPollingForQuotes',
  'setLocation',
  'getLocation',
  'setInputPrimaryDenomination',
  'resetState',
  'setChainIntervalLength',
  'trackUnifiedSwapBridgeEvent',
] as const;

export class BridgeController extends StaticIntervalPollingController<BridgePollingInput>()<
  typeof BRIDGE_CONTROLLER_NAME,
  BridgeControllerState,
  BridgeControllerMessenger
> {
  #abortController: AbortController | undefined;

  #batchSellTradesAbortController: AbortController | undefined;

  #quotesFirstFetched: number | undefined;

  /**
   * Stores the location/entry point from which the user initiated the swap or bridge flow.
   * Set via setLocation() before navigating to the swap/bridge flow.
   * Used as default for all subsequent internal events.
   */
  #location: BridgeControllerMetricsLocation =
    MetaMetricsSwapsEventSource.Unknown;

  readonly #clientId: BridgeClientId;

  readonly #clientVersion: string;

  readonly #getLayer1GasFee: typeof TransactionController.prototype.getLayer1GasFee;

  readonly #fetchFn: FetchFunction;

  readonly #trackMetaMetricsFn: <
    EventName extends BridgeControllerMetricsEventName,
  >(
    eventName: EventName,
    properties: CrossChainSwapsEventProperties<EventName>,
  ) => void;

  readonly #trace: TraceCallback;

  readonly #config: {
    customBridgeApiBaseUrl?: string;
  };

  /**
   * Returns whether to use AssetsController for exchange rates.
   * Set via constructor option getUseAssetsControllerForRates; defaults to false.
   *
   * @returns True when exchange rates should be read from AssetsController:getExchangeRatesForBridge.
   */
  readonly #getUseAssetsControllerForRates: () => boolean;

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
    getUseAssetsControllerForRates,
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
    trackMetaMetricsFn: <EventName extends BridgeControllerMetricsEventName>(
      eventName: EventName,
      properties: CrossChainSwapsEventProperties<EventName>,
    ) => void;
    traceFn?: TraceCallback;
    /**
     * When provided, called to determine whether to use AssetsController for exchange rates.
     * When true, rates are read from AssetsController:getExchangeRatesForBridge instead of
     * MultichainAssetsRatesController, TokenRatesController, and CurrencyRateController.
     */
    getUseAssetsControllerForRates?: () => boolean;
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
    this.#getUseAssetsControllerForRates =
      getUseAssetsControllerForRates ?? (() => false);

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  _executePoll = async (pollingInput: BridgePollingInput) => {
    await this.#fetchBridgeQuotes(pollingInput);
  };

  /**
   * Updates the quote request at the specified index with the given parameters, then starts
   * polling for quotes.
   *
   * @param paramsToUpdate - The parameters to update in the quote request at the specified index
   * @param context - metrics context
   * @param quoteRequestIndex - The index of the quote request to update
   * @param quoteRequestCount - The number of quote requests in the UI
   */
  updateBridgeQuoteRequestParams = async (
    paramsToUpdate: Partial<GenericQuoteRequest> & {
      walletAddress: GenericQuoteRequest['walletAddress'];
    },
    context: BridgePollingInput['context'],
    quoteRequestIndex: number = 0,
    quoteRequestCount: number = 1,
  ) => {
    // Guard against updating a quote request that doesn't exist
    if (quoteRequestIndex >= quoteRequestCount) {
      return;
    }
    this.#trackInputChangedEvents(
      paramsToUpdate,
      context.feature_id,
      quoteRequestIndex,
    );
    this.resetState(AbortReason.QuoteRequestUpdated, quoteRequestIndex);
    this.update((state) => {
      // Update only the specified quote request and keep the rest of the quote requests unchanged
      state.quoteRequest = state.quoteRequest
        .slice(0, quoteRequestIndex)
        .concat({
          ...DEFAULT_BRIDGE_CONTROLLER_STATE.quoteRequest[0],
          ...paramsToUpdate,
        })
        .concat(
          state.quoteRequest.slice(quoteRequestIndex + 1, quoteRequestCount),
        );
      state.tokenSecurityTypeDestination =
        context.token_security_type_destination ?? null;
    });

    // BatchSell and Unified swaps both use the same polling logic so both validations should pass
    if (
      isValidQuoteRequest(paramsToUpdate) &&
      isValidBatchSellQuoteRequest(this.state.quoteRequest)
    ) {
      this.#quotesFirstFetched = Date.now();
      // Update the insufficientBal and resetApproval params for the quote request
      const quoteWithInsufficientBalAndResetApproval =
        await this.#appendInsufficientBalAndResetApproval(paramsToUpdate);
      this.update((state) => {
        state.quoteRequest[quoteRequestIndex] =
          quoteWithInsufficientBalAndResetApproval;
      });

      // Set refresh rate based on the source chain before starting polling
      this.setChainIntervalLength();
      this.startPolling({
        quoteRequests: this.state.quoteRequest,
        context,
      });
    }
  };

  /**
   * Fetches quotes for specified request without updating the controller state
   * This method does not start polling for quotes and does not emit UnifiedSwapBridge events
   *
   * @param quoteRequest - The parameters for quote requests to fetch
   * @param featureId - The feature ID that maps to quoteParam overrides from LD
   * @param abortSignal - The abort signal to cancel all the requests
   * @returns A list of validated quotes
   */
  fetchQuotes = async (
    quoteRequest: GenericQuoteRequest,
    featureId: FeatureId,
    abortSignal: AbortSignal | null = null,
  ): Promise<(QuoteResponseV1 & L1GasFees & NonEvmFees)[]> => {
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

    this.#trackQuoteValidationFailures(validationFailures, featureId);

    const quotesWithFees = await appendFeesToQuotes(
      baseQuotes,
      this.messenger,
      this.#getLayer1GasFee,
      this.#getMultichainSelectedAccount(quoteRequest.walletAddress),
    );

    return sortQuotes(quotesWithFees, featureId);
  };

  /**
   * Fetches gasless transaction data and fees for BatchSell quotes.
   * To use this in the clients, add a listener for the recommendedQuotes and call
   * this handler whenever they change.
   *
   * @param quotes - The quotes to fetch the gasless transaction data and fees for
   * @param stxEnabled - Flag to estimate gas cost more precisely for the batch sell feature.
   */
  updateBatchSellTrades = async (
    quotes: (QuoteResponseV1 | null)[],
    stxEnabled: boolean,
  ): Promise<void> => {
    this.#batchSellTradesAbortController?.abort(
      AbortReason.GaslessTxBatchFetched,
    );
    this.#batchSellTradesAbortController = new AbortController();

    this.update((state) => {
      // Set loading status again if recommended quotes are re-ordered
      state.batchSellTradesLoadingStatus = RequestStatus.LOADING;
    });

    try {
      const batchSellTradesResponse = await fetchBatchSellTrades(
        quotes,
        stxEnabled,
        this.#batchSellTradesAbortController.signal,
        this.#clientId,
        await this.#getJwt(),
        this.#fetchFn,
        this.#config.customBridgeApiBaseUrl ?? BRIDGE_PROD_API_BASE_URL,
        this.#clientVersion,
      );

      this.update((state) => {
        state.batchSellTrades = batchSellTradesResponse;
        state.batchSellTradesLoadingStatus = RequestStatus.FETCHED;
      });

      // TODO if fee.asset.assetId is not in exchange rates, fetch the exchange rate and update the state
    } catch (error) {
      // Ignore abort errors
      if (
        (error as Error).toString().includes('AbortError') ||
        (error as Error).toString().includes('FetchRequestCanceledException') ||
        [
          AbortReason.ResetState,
          AbortReason.NewQuoteRequest,
          AbortReason.QuoteRequestUpdated,
          AbortReason.TransactionSubmitted,
          AbortReason.GaslessTxBatchFetched,
        ].includes(error as AbortReason)
      ) {
        // Exit the function early to prevent other state updates
        return;
      }

      this.update((state) => {
        // Reset the batch sell trades if the fetch fails to avoid showing stale data
        state.batchSellTrades = DEFAULT_BRIDGE_CONTROLLER_STATE.batchSellTrades;
        // Update loading status
        state.batchSellTradesLoadingStatus = RequestStatus.ERROR;
      });
      console.log(`Failed to fetch batch sell trades`, error);
    }
  };

  readonly #trackQuoteValidationFailures = (
    validationFailures: string[],
    featureId: FeatureId,
  ) => {
    if (validationFailures.length === 0) {
      return;
    }
    this.trackUnifiedSwapBridgeEvent(
      UnifiedSwapBridgeEventName.QuotesValidationFailed,
      {
        feature_id: featureId,
        failures: validationFailures,
        location: this.#location,
      },
    );
  };

  readonly #getExchangeRateSources = (): ExchangeRateSourcesForLookup => {
    if (this.#getUseAssetsControllerForRates()) {
      return {
        ...this.messenger.call('AssetsController:getExchangeRatesForBridge'),
        historicalPrices: {},
        ...this.state,
      };
    }
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
   * @param quoteRequests - The quote requests to fetch the exchange rates for
   */
  readonly #fetchAssetExchangeRates = async (
    quoteRequests: GenericQuoteRequest[],
  ) => {
    const exchangeRateSources = this.#getExchangeRateSources();

    // Get unique assetIds for all quote requests
    const assetIds = new Set<CaipAssetType>(
      quoteRequests
        .flatMap((quoteRequest) =>
          [
            getAssetIdsForToken(
              quoteRequest.srcTokenAddress,
              quoteRequest.srcChainId,
            ),
            getAssetIdsForToken(
              quoteRequest.destTokenAddress,
              quoteRequest.destChainId,
            ),
          ].flat(),
        )
        .filter(
          (assetId: CaipAssetType | undefined): assetId is CaipAssetType =>
            !selectIsAssetExchangeRateInState(exchangeRateSources, assetId),
        ),
    );

    const currency = this.#getUseAssetsControllerForRates()
      ? this.messenger.call('AssetsController:getExchangeRatesForBridge')
          .currentCurrency
      : this.messenger.call('CurrencyRateController:getState').currentCurrency;

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

  readonly #appendInsufficientBalAndResetApproval = async (
    quoteRequest: GenericQuoteRequest,
  ) => {
    const isSrcChainNonEVM = isNonEvmChainId(quoteRequest.srcChainId);
    const providerConfig = isSrcChainNonEVM
      ? undefined
      : this.#getNetworkClientByChainId(
          formatChainIdToHex(quoteRequest.srcChainId),
        )?.configuration;

    let insufficientBal: boolean | undefined;
    let resetApproval: boolean = Boolean(quoteRequest.resetApproval);
    if (isSrcChainNonEVM) {
      // If the source chain is not an EVM network, use value from params
      insufficientBal = quoteRequest.insufficientBal;
    } else if (providerConfig?.rpcUrl?.includes('tenderly')) {
      // If the rpcUrl is a tenderly fork (e2e tests), set insufficientBal=true
      // The bridge-api filters out quotes if the balance on mainnet is insufficient so this override allows quotes to always be returned
      insufficientBal = true;
    } else {
      // Set loading status if RPC calls are made before the quotes are fetched
      this.update((state) => {
        state.quotesLoadingStatus = RequestStatus.LOADING;
      });
      resetApproval = await this.#shouldResetApproval(quoteRequest);
      // Otherwise query the src token balance from the RPC provider
      insufficientBal =
        quoteRequest.insufficientBal ??
        (await this.#hasInsufficientBalance(quoteRequest));
    }

    return {
      ...quoteRequest,
      insufficientBal,
      resetApproval,
    };
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
    this.#batchSellTradesAbortController?.abort(reason);
  };

  /**
   * Sets the location/entry point for the current swap or bridge flow.
   * Call this when the user enters the flow so that all internally-fired
   * events (InputChanged, QuotesRequested, etc.) carry the correct location.
   *
   * @param location - The entry point from which the user initiated the flow
   */
  setLocation = (location: BridgeControllerMetricsLocation) => {
    this.#location = location;
  };

  /**
   * Returns the location/entry point for the current swap or bridge flow.
   *
   * @returns The entry point from which the user initiated the flow
   */
  getLocation = (): BridgeControllerMetricsLocation => {
    return this.#location;
  };

  setInputPrimaryDenomination = (
    inputPrimaryDenomination: InputPrimaryDenomination,
  ) => {
    this.update((state) => {
      state.inputPrimaryDenomination = inputPrimaryDenomination;
    });
  };

  resetState = (
    reason = AbortReason.ResetState,
    quoteRequestIndex: number | null = null,
    context?: RequiredEventContextFromClient[UnifiedSwapBridgeEventName.QuotesReceived],
  ) => {
    this.stopPollingForQuotes(reason, context);
    this.update((state) => {
      // Cannot do direct assignment to state, i.e. state = {... }, need to manually assign each field
      if (quoteRequestIndex === null) {
        // Clear all requests if index is null
        state.quoteRequest = DEFAULT_BRIDGE_CONTROLLER_STATE.quoteRequest;
      } else {
        // Otherwise only clear the specified request
        state.quoteRequest = state.quoteRequest
          .slice(0, quoteRequestIndex)
          .concat(DEFAULT_BRIDGE_CONTROLLER_STATE.quoteRequest[0])
          .concat(state.quoteRequest.slice(quoteRequestIndex + 1));
      }
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
      state.tokenWarnings = DEFAULT_BRIDGE_CONTROLLER_STATE.tokenWarnings;
      state.tokenSecurityTypeDestination =
        DEFAULT_BRIDGE_CONTROLLER_STATE.tokenSecurityTypeDestination;
      state.quoteStreamComplete =
        DEFAULT_BRIDGE_CONTROLLER_STATE.quoteStreamComplete;
      state.batchSellTrades = DEFAULT_BRIDGE_CONTROLLER_STATE.batchSellTrades;
      state.batchSellTradesLoadingStatus =
        DEFAULT_BRIDGE_CONTROLLER_STATE.batchSellTradesLoadingStatus;
    });
  };

  /**
   * Sets the interval length based on the source chain
   */
  setChainIntervalLength = () => {
    const { state } = this;
    // Assume that BatchSell quote requests all have the same source chain
    // Use the first one to determine refresh rate
    const { srcChainId } = state.quoteRequest[0];
    const bridgeFeatureFlags = getBridgeFeatureFlags(this.messenger);

    const refreshRateOverride = srcChainId
      ? bridgeFeatureFlags.chains[formatChainIdToCaip(srcChainId)]?.refreshRate
      : undefined;
    const defaultRefreshRate = bridgeFeatureFlags.refreshRate;
    this.setIntervalLength(refreshRateOverride ?? defaultRefreshRate);
  };

  readonly #fetchBridgeQuotes = async ({
    quoteRequests,
    context,
  }: BridgePollingInput) => {
    this.#abortController?.abort(AbortReason.NewQuoteRequest);
    this.#batchSellTradesAbortController?.abort(AbortReason.NewQuoteRequest);

    this.#abortController = new AbortController();

    this.#fetchAssetExchangeRates(quoteRequests).catch((error) =>
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
    const isBatchSellRequest = quoteRequests.length > 1;

    this.update((state) => {
      state.quoteFetchError = DEFAULT_BRIDGE_CONTROLLER_STATE.quoteFetchError;
      state.tokenWarnings = DEFAULT_BRIDGE_CONTROLLER_STATE.tokenWarnings;
      state.quoteStreamComplete =
        DEFAULT_BRIDGE_CONTROLLER_STATE.quoteStreamComplete;
      state.quotesLastFetched = Date.now();
      state.quotesLoadingStatus = RequestStatus.LOADING;
      // Prevent clients from displaying stale batch sell fees
      if (quoteRequests.length > 1) {
        state.batchSellTradesLoadingStatus = RequestStatus.LOADING;
        state.batchSellTrades = DEFAULT_BRIDGE_CONTROLLER_STATE.batchSellTrades;
      }
    });

    const jwt = await this.#getJwt();

    try {
      const [firstQuoteRequest] = quoteRequests;

      const unifiedSwapTraceName = isCrossChain(
        firstQuoteRequest.srcChainId,
        firstQuoteRequest.destChainId,
      )
        ? TraceName.BridgeQuotesFetched
        : TraceName.SwapQuotesFetched;

      await this.#trace(
        {
          name: isBatchSellRequest
            ? TraceName.BatchSellQuotesFetched
            : unifiedSwapTraceName,
          data: {
            srcChainId: formatChainIdToCaip(firstQuoteRequest.srcChainId),
            destChainId: formatChainIdToCaip(firstQuoteRequest.destChainId),
          },
        },
        async () => {
          const selectedAccount = this.#getMultichainSelectedAccount(
            firstQuoteRequest.walletAddress,
          );
          // This call is not awaited to prevent blocking quote fetching if the snap takes too long to respond
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.#setMinimumBalanceForRentExemptionInLamports(
            firstQuoteRequest.srcChainId,
            selectedAccount?.metadata?.snap?.id,
          );
          // Use SSE if enabled and return early
          if (shouldStream || isBatchSellRequest) {
            await this.#handleQuoteStreaming(
              quoteRequests,
              context.feature_id,
              jwt,
              selectedAccount,
            );
            return;
          }
          // Otherwise use regular fetch
          const quotes = await this.fetchQuotes(
            firstQuoteRequest,
            context.feature_id,
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
    const hasNoFundedQuoteRequests = quoteRequests.every(
      ({ insufficientBal }) => Boolean(insufficientBal),
    );

    if (
      hasNoFundedQuoteRequests
        ? // If all quote requests are insufficiently funded, stop polling
          // So if a BatchSell has at least 1 sufficiently funded quote request, polling continues
          true
        : // Otherwise continue polling until the maximum number of refreshes has been reached
          this.state.quotesRefreshCount >= maxRefreshCount
    ) {
      this.stopAllPolling();
    }
  };

  readonly #handleQuoteStreaming = async (
    quoteRequests: GenericQuoteRequest[],
    featureId: FeatureId,
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
      quoteRequests,
      this.#abortController?.signal,
      featureId,
      this.#clientId,
      jwt,
      this.#config.customBridgeApiBaseUrl ?? BRIDGE_PROD_API_BASE_URL,
      {
        onQuoteValidationFailure: (validationFailures) =>
          this.#trackQuoteValidationFailures(validationFailures, featureId),
        onValidQuoteReceived: async (quote: QuoteResponseV1) => {
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
        onTokenWarning: (warning) => {
          this.update((state) => {
            const isDuplicate = state.tokenWarnings.some(
              (existing) => existing.feature_id === warning.feature_id,
            );
            if (!isDuplicate) {
              state.tokenWarnings = [...state.tokenWarnings, warning];
            }
          });
        },
        onComplete: (data) => {
          this.update((state) => {
            state.quoteStreamComplete = data;
          });
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
    // Assume that all quotes in a batch are for the same account
    const addressToUse =
      walletAddress ?? this.state.quoteRequest[0].walletAddress;
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

  readonly #getRequestMetadata = (
    quoteRequestIndex: number = 0,
  ): Omit<
    RequestMetadata,
    'stx_enabled' | 'usd_amount_source' | 'security_warnings'
  > => {
    const quoteRequest = this.state.quoteRequest[quoteRequestIndex];
    const { walletAddress } = quoteRequest;
    const accountHardwareType = getAccountHardwareType(
      walletAddress
        ? this.#getMultichainSelectedAccount(walletAddress)
        : undefined,
    );

    return {
      slippage_limit: quoteRequest.slippage,
      swap_type: getSwapTypeFromQuote(quoteRequest),
      custom_slippage: isCustomSlippage(quoteRequest.slippage),
      account_hardware_type: accountHardwareType,
      is_hardware_wallet: accountHardwareType !== null,
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
    EventName extends BridgeControllerMetricsEventName,
  >(
    eventName: EventName,
    propertiesFromClient: Pick<
      RequiredEventContextFromClient,
      EventName
    >[EventName],
    quoteRequestIndex: number = 0,
  ) => {
    const clientProps = propertiesFromClient as Record<string, unknown>;
    const baseProperties = {
      ...propertiesFromClient,
      location: clientProps?.location ?? this.#location,
      action_type: MetricsActionType.SWAPBRIDGE_V1,
    };
    const inputPrimaryDenominationProperties = {
      input_primary_denomination: this.state.inputPrimaryDenomination,
    };
    const batchSellClientChainProperties = propertiesFromClient as Pick<
      RequiredEventContextFromClient[BatchSellMetricsEventName.BatchSellTokenPageViewed],
      'chain_id_source' | 'chain_id_destination'
    >;
    const batchSellBaseProperties = {
      chain_id_source: batchSellClientChainProperties.chain_id_source,
      chain_id_destination: batchSellClientChainProperties.chain_id_destination,
      location: clientProps?.location ?? this.#location,
    };
    const quoteRequest = this.state.quoteRequest[quoteRequestIndex];
    switch (eventName) {
      case UnifiedSwapBridgeEventName.ButtonClicked:
        return {
          ...getRequestParams(
            quoteRequest,
            this.state.tokenSecurityTypeDestination,
          ),
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.PageViewed:
        return {
          ...getRequestParams(
            quoteRequest,
            this.state.tokenSecurityTypeDestination,
          ),
          ...this.#getRequestMetadata(),
          ...inputPrimaryDenominationProperties,
          ...baseProperties,
        };
      case BatchSellMetricsEventName.BatchSellTokenPageViewed:
        return batchSellBaseProperties;
      case BatchSellMetricsEventName.BatchSellTokenPageContinueClicked: {
        const propsFromClient =
          propertiesFromClient as RequiredEventContextFromClient[BatchSellMetricsEventName.BatchSellTokenPageContinueClicked];
        return {
          ...batchSellBaseProperties,
          source_token_count: propsFromClient.source_token_addresses.length,
          source_token_symbols: propsFromClient.source_token_symbols,
          source_token_addresses: propsFromClient.source_token_addresses,
        };
      }
      case BatchSellMetricsEventName.BatchSellQuotePageViewed:
      case BatchSellMetricsEventName.BatchSellQuotePageReviewClicked: {
        const propsFromClient =
          propertiesFromClient as RequiredEventContextFromClient[BatchSellMetricsEventName.BatchSellQuotePageViewed];
        return {
          ...batchSellBaseProperties,
          source_token_count: propsFromClient.source_token_addresses.length,
          source_token_symbols: propsFromClient.source_token_symbols,
          source_token_addresses: propsFromClient.source_token_addresses,
          destination_token_symbol: propsFromClient.destination_token_symbol,
          destination_token_address: propsFromClient.destination_token_address,
          usd_amount_source_tokens: propsFromClient.usd_amount_source_tokens,
          usd_amount_source_total: propsFromClient.usd_amount_source_total,
          source_token_slippages: propsFromClient.source_token_slippages,
        };
      }
      case BatchSellMetricsEventName.BatchSellReviewModalSubmitted: {
        const reviewModalProperties =
          propertiesFromClient as RequiredEventContextFromClient[BatchSellMetricsEventName.BatchSellReviewModalSubmitted];
        return {
          ...batchSellBaseProperties,
          source_token_count:
            reviewModalProperties.source_token_addresses.length,
          source_token_symbols: reviewModalProperties.source_token_symbols,
          source_token_addresses: reviewModalProperties.source_token_addresses,
          destination_token_symbol:
            reviewModalProperties.destination_token_symbol,
          destination_token_address:
            reviewModalProperties.destination_token_address,
          usd_amount_source_tokens:
            reviewModalProperties.usd_amount_source_tokens,
          usd_amount_source_total:
            reviewModalProperties.usd_amount_source_total,
          source_token_slippages: reviewModalProperties.source_token_slippages,
          usd_quoted_gas: reviewModalProperties.usd_quoted_gas,
          usd_quoted_return: reviewModalProperties.usd_quoted_return,
        };
      }
      case UnifiedSwapBridgeEventName.FiatCryptoToggleClicked:
        return {
          ...getRequestParams(
            quoteRequest,
            this.state.tokenSecurityTypeDestination,
          ),
          swap_type: getSwapTypeFromQuote(quoteRequest),
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.QuotesValidationFailed:
        return {
          ...getRequestParams(
            quoteRequest,
            this.state.tokenSecurityTypeDestination,
          ),
          refresh_count: this.state.quotesRefreshCount,
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.QuotesReceived:
        return {
          ...getRequestParams(
            quoteRequest,
            this.state.tokenSecurityTypeDestination,
          ),
          ...this.#getRequestMetadata(),
          ...this.#getQuoteFetchData(),
          refresh_count: this.state.quotesRefreshCount,
          ...inputPrimaryDenominationProperties,
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.QuotesRequested:
        return {
          ...getRequestParams(
            quoteRequest,
            this.state.tokenSecurityTypeDestination,
          ),
          ...this.#getRequestMetadata(),
          has_sufficient_funds: !quoteRequest.insufficientBal,
          ...inputPrimaryDenominationProperties,
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.QuotesError:
        return {
          ...getRequestParams(
            quoteRequest,
            this.state.tokenSecurityTypeDestination,
          ),
          ...this.#getRequestMetadata(),
          error_message: this.state.quoteFetchError,
          has_sufficient_funds: !quoteRequest.insufficientBal,
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.AllQuotesOpened:
      case UnifiedSwapBridgeEventName.AllQuotesSorted:
      case UnifiedSwapBridgeEventName.QuoteSelected:
        return {
          ...getRequestParams(
            quoteRequest,
            this.state.tokenSecurityTypeDestination,
          ),
          ...this.#getRequestMetadata(),
          ...this.#getQuoteFetchData(),
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.Failed: {
        // Populate the properties that the error occurred before the tx was submitted
        return {
          ...baseProperties,
          ...getRequestParams(
            quoteRequest,
            this.state.tokenSecurityTypeDestination,
          ),
          ...this.#getRequestMetadata(),
          ...this.#getQuoteFetchData(),
          ...propertiesFromClient,
        };
      }
      case UnifiedSwapBridgeEventName.AssetDetailTooltipClicked:
      case UnifiedSwapBridgeEventName.AssetPickerOpened:
        return baseProperties;
      // Inject `token_security_type_destination` from controller state so the
      // field is always present on this event. `baseProperties` (which spreads
      // `propertiesFromClient`) wins if the client supplies a value explicitly.
      case UnifiedSwapBridgeEventName.InputSourceDestinationSwitched:
        return {
          token_security_type_destination:
            this.state.tokenSecurityTypeDestination,
          ...baseProperties,
        };
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
    featureId: FeatureId,
    quoteRequestIndex: number = 0,
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
        this.state.quoteRequest[quoteRequestIndex] &&
        value !==
          this.state.quoteRequest[quoteRequestIndex][
            key as keyof GenericQuoteRequest
          ]
      ) {
        this.trackUnifiedSwapBridgeEvent(
          UnifiedSwapBridgeEventName.InputChanged,
          {
            input: inputKey,
            input_value: inputValue,
            location: this.#location,
            feature_id: featureId,
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
   * @param quoteRequestIndex - The index of the quote request to track the event for
   * @example
   * this.trackUnifiedSwapBridgeEvent(UnifiedSwapBridgeEventName.ActionOpened, {
   *   location: MetaMetricsSwapsEventSource.MainView,
   * });
   */
  trackUnifiedSwapBridgeEvent = <
    EventName extends BridgeControllerMetricsEventName,
  >(
    eventName: EventName,
    propertiesFromClient: Pick<
      RequiredEventContextFromClient,
      EventName
    >[EventName],
    quoteRequestIndex: number = 0,
  ) => {
    try {
      const combinedPropertiesForEvent = this.#getEventProperties<EventName>(
        eventName,
        propertiesFromClient,
        quoteRequestIndex,
      );

      this.#trackMetaMetricsFn(
        eventName,
        combinedPropertiesForEvent as CrossChainSwapsEventProperties<EventName>,
      );
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
