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

/** The input to start polling for the {@link BridgeController} */
type BridgePollingInput = {
  networkClientId: NetworkClientId;
  updatedQuoteRequest: GenericQuoteRequest;
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
  }

  _executePoll = async (pollingInput: BridgePollingInput) => {
    await this.#fetchBridgeQuotes(pollingInput);
  };

  updateBridgeQuoteRequestParams = async (
    paramsToUpdate: Partial<GenericQuoteRequest>,
  ) => {
    this.stopAllPolling();
    this.#abortController?.abort('Quote request updated');

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
      });
    }
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

    const exchangeRateSources = {
      ...this.messagingSystem.call('MultichainAssetsRatesController:getState'),
      ...this.messagingSystem.call('CurrencyRateController:getState'),
      ...this.messagingSystem.call('TokenRatesController:getState'),
      ...this.state,
    };

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
  }: BridgePollingInput) => {
    const { bridgeFeatureFlags, quotesInitialLoadTime, quotesRefreshCount } =
      this.state;
    this.#abortController?.abort('New quote request');
    this.#abortController = new AbortController();

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
