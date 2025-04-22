import type { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import type { StateMetadata } from '@metamask/base-controller';
import type { ChainId } from '@metamask/controller-utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { NetworkClientId } from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { TransactionParams } from '@metamask/transaction-controller';
import type { CaipAssetType } from '@metamask/utils';
import { numberToHex, type Hex } from '@metamask/utils';

import {
  type BridgeClientId,
  BRIDGE_CONTROLLER_NAME,
  BRIDGE_PROD_API_BASE_URL,
  DEFAULT_BRIDGE_CONTROLLER_STATE,
  METABRIDGE_CHAIN_TO_ADDRESS_MAP,
  REFRESH_INTERVAL_MS,
} from './constants/bridge';
import { CHAIN_IDS } from './constants/chains';
import { selectIsAssetExchangeRateInState } from './selectors';
import type { QuoteRequest } from './types';
import {
  type L1GasFees,
  type GenericQuoteRequest,
  type SolanaFees,
  type QuoteResponse,
  type TxData,
  type BridgeControllerState,
  type BridgeControllerMessenger,
  type FetchFunction,
  BridgeFeatureFlagsKey,
  RequestStatus,
} from './types';
import { getAssetIdsForToken, toExchangeRates } from './utils/assets';
import { hasSufficientBalance } from './utils/balance';
import {
  getDefaultBridgeControllerState,
  isSolanaChainId,
  sumHexes,
} from './utils/bridge';
import {
  formatAddressToCaipReference,
  formatChainIdToCaip,
  formatChainIdToHex,
} from './utils/caip-formatters';
import {
  fetchAssetPrices,
  fetchBridgeFeatureFlags,
  fetchBridgeQuotes,
} from './utils/fetch';
import { UnifiedSwapBridgeEventName } from './utils/metrics/constants';
import {
  formatProviderLabel,
  getActionTypeFromQuoteRequest,
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

const metadata: StateMetadata<BridgeControllerState> = {
  bridgeFeatureFlags: {
    persist: false,
    anonymous: false,
  },
  quoteRequest: {
    persist: false,
    anonymous: false,
  },
  quotes: {
    persist: false,
    anonymous: false,
  },
  quotesInitialLoadTime: {
    persist: false,
    anonymous: false,
  },
  quotesLastFetched: {
    persist: false,
    anonymous: false,
  },
  quotesLoadingStatus: {
    persist: false,
    anonymous: false,
  },
  quoteFetchError: {
    persist: false,
    anonymous: false,
  },
  quotesRefreshCount: {
    persist: false,
    anonymous: false,
  },
  assetExchangeRates: {
    persist: false,
    anonymous: false,
  },
};

const RESET_STATE_ABORT_MESSAGE = 'Reset controller state';

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
    UnifiedSwapBridgeEventName.QuoteError
  >[UnifiedSwapBridgeEventName.QuoteError] &
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

  readonly #clientId: string;

  readonly #getLayer1GasFee: (params: {
    transactionParams: TransactionParams;
    chainId: ChainId;
  }) => Promise<string>;

  readonly #fetchFn: FetchFunction;

  readonly #trackMetaMetricsFn: <
    T extends
      (typeof UnifiedSwapBridgeEventName)[keyof typeof UnifiedSwapBridgeEventName],
  >(
    eventName: T,
    properties: CrossChainSwapsEventProperties<T>,
  ) => void;

  readonly #config: {
    customBridgeApiBaseUrl?: string;
  };

  constructor({
    messenger,
    state,
    clientId,
    getLayer1GasFee,
    fetchFn,
    config,
    trackMetaMetricsFn,
  }: {
    messenger: BridgeControllerMessenger;
    state?: Partial<BridgeControllerState>;
    clientId: BridgeClientId;
    getLayer1GasFee: (params: {
      transactionParams: TransactionParams;
      chainId: ChainId;
    }) => Promise<string>;
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
    this.#fetchFn = fetchFn;
    this.#trackMetaMetricsFn = trackMetaMetricsFn;
    this.#config = config ?? {};

    // Register action handlers
    this.messagingSystem.registerActionHandler(
      `${BRIDGE_CONTROLLER_NAME}:setBridgeFeatureFlags`,
      this.setBridgeFeatureFlags.bind(this),
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
  }

  _executePoll = async (pollingInput: BridgePollingInput) => {
    await this.#fetchBridgeQuotes(pollingInput);
  };

  updateBridgeQuoteRequestParams = async (
    paramsToUpdate: Partial<GenericQuoteRequest>,
    context: BridgePollingInput['context'],
  ) => {
    this.stopAllPolling();
    this.#abortController?.abort('Quote request updated');

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
    });

    await this.#fetchAssetExchangeRates(updatedQuoteRequest).catch((error) =>
      console.warn('Failed to fetch asset exchange rates', error),
    );

    if (isValidQuoteRequest(updatedQuoteRequest)) {
      this.#quotesFirstFetched = Date.now();
      const providerConfig = this.#getSelectedNetworkClient()?.configuration;

      let insufficientBal: boolean | undefined;
      if (isSolanaChainId(updatedQuoteRequest.srcChainId)) {
        // If the source chain is not an EVM network, use value from params
        insufficientBal = paramsToUpdate.insufficientBal;
      } else if (providerConfig?.rpcUrl?.includes('tenderly')) {
        // If the rpcUrl is a tenderly fork (e2e tests), set insufficientBal=true
        // The bridge-api filters out quotes if the balance on mainnet is insufficient so this override allows quotes to always be returned
        insufficientBal = true;
      } else {
        // Otherwise query the src token balance from the RPC provider
        insufficientBal =
          paramsToUpdate.insufficientBal ??
          !(await this.#hasSufficientBalance(updatedQuoteRequest));
      }

      const networkClientId = this.#getSelectedNetworkClientId();
      // Set refresh rate based on the source chain before starting polling
      this.#setIntervalLength();
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
    const walletAddress = this.#getMultichainSelectedAccount()?.address;
    const srcChainIdInHex = formatChainIdToHex(quoteRequest.srcChainId);
    const provider = this.#getSelectedNetworkClient()?.provider;
    const normalizedSrcTokenAddress = formatAddressToCaipReference(
      quoteRequest.srcTokenAddress,
    );

    return (
      provider &&
      walletAddress &&
      normalizedSrcTokenAddress &&
      quoteRequest.srcTokenAmount &&
      srcChainIdInHex &&
      (await hasSufficientBalance(
        provider,
        walletAddress,
        normalizedSrcTokenAddress,
        quoteRequest.srcTokenAmount,
        srcChainIdInHex,
      ))
    );
  };

  resetState = () => {
    this.stopAllPolling();
    this.#abortController?.abort(RESET_STATE_ABORT_MESSAGE);

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

      // Keep feature flags
      const originalFeatureFlags = state.bridgeFeatureFlags;
      state.bridgeFeatureFlags = originalFeatureFlags;
    });
  };

  setBridgeFeatureFlags = async () => {
    const bridgeFeatureFlags = await fetchBridgeFeatureFlags(
      this.#clientId,
      this.#fetchFn,
      this.#config.customBridgeApiBaseUrl ?? BRIDGE_PROD_API_BASE_URL,
    );
    this.update((state) => {
      state.bridgeFeatureFlags = bridgeFeatureFlags;
    });
    this.#setIntervalLength();
  };

  /**
   * Sets the interval length based on the source chain
   */
  readonly #setIntervalLength = () => {
    const { state } = this;
    const { srcChainId } = state.quoteRequest;
    const refreshRateOverride = srcChainId
      ? state.bridgeFeatureFlags[BridgeFeatureFlagsKey.EXTENSION_CONFIG].chains[
          formatChainIdToCaip(srcChainId)
        ]?.refreshRate
      : undefined;
    const defaultRefreshRate =
      state.bridgeFeatureFlags[BridgeFeatureFlagsKey.EXTENSION_CONFIG]
        .refreshRate;
    this.setIntervalLength(refreshRateOverride ?? defaultRefreshRate);
  };

  readonly #fetchBridgeQuotes = async ({
    networkClientId: _networkClientId,
    updatedQuoteRequest,
    context,
  }: BridgePollingInput) => {
    const { bridgeFeatureFlags, quotesInitialLoadTime, quotesRefreshCount } =
      this.state;
    this.#abortController?.abort('New quote request');
    this.#abortController = new AbortController();

    this.trackUnifiedSwapBridgeEvent(
      UnifiedSwapBridgeEventName.QuotesRequested,
      context,
    );
    this.update((state) => {
      state.quotesLoadingStatus = RequestStatus.LOADING;
      state.quoteRequest = updatedQuoteRequest;
      state.quoteFetchError = DEFAULT_BRIDGE_CONTROLLER_STATE.quoteFetchError;
    });

    try {
      const quotes = await fetchBridgeQuotes(
        updatedQuoteRequest,
        // AbortController is always defined by this line, because we assign it a few lines above,
        // not sure why Jest thinks it's not
        // Linters accurately say that it's defined
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.#abortController!.signal as AbortSignal,
        this.#clientId,
        this.#fetchFn,
        this.#config.customBridgeApiBaseUrl ?? BRIDGE_PROD_API_BASE_URL,
      );

      const quotesWithL1GasFees = await this.#appendL1GasFees(quotes);
      const quotesWithSolanaFees = await this.#appendSolanaFees(quotes);

      this.update((state) => {
        state.quotes = quotesWithL1GasFees ?? quotesWithSolanaFees ?? quotes;
        state.quotesLoadingStatus = RequestStatus.FETCHED;
      });
    } catch (error) {
      const isAbortError = (error as Error).name === 'AbortError';
      const isAbortedDueToReset = error === RESET_STATE_ABORT_MESSAGE;
      if (isAbortedDueToReset || isAbortError) {
        return;
      }

      this.update((state) => {
        state.quoteFetchError =
          error instanceof Error ? error.message : 'Unknown error';
        state.quotesLoadingStatus = RequestStatus.ERROR;
        state.quotes = DEFAULT_BRIDGE_CONTROLLER_STATE.quotes;
      });
      this.trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.QuoteError,
        context,
      );
      console.log('Failed to fetch bridge quotes', error);
    } finally {
      const { maxRefreshCount } =
        bridgeFeatureFlags[BridgeFeatureFlagsKey.EXTENSION_CONFIG];

      const updatedQuotesRefreshCount = quotesRefreshCount + 1;
      // Stop polling if the maximum number of refreshes has been reached
      if (
        updatedQuoteRequest.insufficientBal ||
        (!updatedQuoteRequest.insufficientBal &&
          updatedQuotesRefreshCount >= maxRefreshCount)
      ) {
        this.stopAllPolling();
      }

      // Update quote fetching stats
      const quotesLastFetched = Date.now();
      this.update((state) => {
        state.quotesInitialLoadTime =
          updatedQuotesRefreshCount === 1 && this.#quotesFirstFetched
            ? quotesLastFetched - this.#quotesFirstFetched
            : quotesInitialLoadTime;
        state.quotesLastFetched = quotesLastFetched;
        state.quotesRefreshCount = updatedQuotesRefreshCount;
      });
    }
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
    if (!hasInvalidQuotes) {
      return await Promise.all(
        quotes.map(async (quoteResponse) => {
          const { quote, trade, approval } = quoteResponse;
          const chainId = numberToHex(quote.srcChainId) as ChainId;

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
            : '0';
          const tradeL1GasFees = await this.#getLayer1GasFee({
            transactionParams: getTxParams(trade),
            chainId,
          });
          return {
            ...quoteResponse,
            l1GasFeesInHexWei: sumHexes(approvalL1GasFees, tradeL1GasFees),
          };
        }),
      );
    }

    return undefined;
  };

  readonly #appendSolanaFees = async (
    quotes: QuoteResponse[],
  ): Promise<(QuoteResponse & SolanaFees)[] | undefined> => {
    // Return early if some of the quotes are not for solana
    if (
      quotes.some(({ quote: { srcChainId } }) => !isSolanaChainId(srcChainId))
    ) {
      return undefined;
    }

    return await Promise.all(
      quotes.map(async (quoteResponse) => {
        const { trade } = quoteResponse;
        const selectedAccount = this.#getMultichainSelectedAccount();

        if (selectedAccount?.metadata?.snap?.id && typeof trade === 'string') {
          const { value: fees } = (await this.messagingSystem.call(
            'SnapController:handleRequest',
            {
              // TODO fix these types
              snapId: selectedAccount.metadata.snap.id as never,
              origin: 'metamask',
              handler: 'onRpcRequest' as never,
              request: {
                method: 'getFeeForTransaction',
                params: {
                  transaction: trade,
                  scope: selectedAccount.options.scope,
                },
              },
            },
          )) as { value: string };

          return {
            ...quoteResponse,
            solanaFeesInLamports: fees,
          };
        }
        return quoteResponse;
      }),
    );
  };

  #getMultichainSelectedAccount() {
    return this.messagingSystem.call(
      'AccountsController:getSelectedMultichainAccount',
    );
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
    'stx_enabled' | 'usd_amount_source'
  > => {
    return {
      slippage_limit: this.state.quoteRequest.slippage,
      swap_type: getSwapTypeFromQuote(this.state.quoteRequest),
      is_hardware_wallet: isHardwareWallet(
        this.#getMultichainSelectedAccount(),
      ),
      custom_slippage: isCustomSlippage(this.state.quoteRequest.slippage),
    };
  };

  readonly #getQuoteFetchData = (): Omit<
    QuoteFetchData,
    'best_quote_provider'
  > => {
    return {
      can_submit: Boolean(this.state.quoteRequest.insufficientBal), // TODO check if balance is sufficient for network fees
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
      action_type: getActionTypeFromQuoteRequest(this.state.quoteRequest),
      ...propertiesFromClient,
    };
    switch (eventName) {
      case UnifiedSwapBridgeEventName.ButtonClicked:
      case UnifiedSwapBridgeEventName.PageViewed:
        return {
          ...this.#getRequestParams(),
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.QuotesReceived:
        return {
          ...this.#getRequestParams(),
          ...this.#getRequestMetadata(),
          ...this.#getQuoteFetchData(),
          refresh_count: this.state.quotesRefreshCount,
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.QuotesRequested:
      case UnifiedSwapBridgeEventName.QuoteError:
        return {
          ...this.#getRequestParams(),
          ...this.#getRequestMetadata(),
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
          ...baseProperties,
        };
      case UnifiedSwapBridgeEventName.SnapConfirmationViewed:
        return {
          ...baseProperties,
          ...this.#getRequestParams(),
          ...this.#getRequestMetadata(),
        };
      // These are populated by BridgeStatusController
      case UnifiedSwapBridgeEventName.Submitted:
      case UnifiedSwapBridgeEventName.Completed:
      case UnifiedSwapBridgeEventName.Failed:
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
            value: inputValue,
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
    const { address: walletAddress } =
      this.#getMultichainSelectedAccount() ?? {};
    const allowance: BigNumber = await contract.allowance(
      walletAddress,
      METABRIDGE_CHAIN_TO_ADDRESS_MAP[chainId],
    );
    return allowance.toString();
  };
}
