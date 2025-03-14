import type { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import type { StateMetadata } from '@metamask/base-controller';
import type { ChainId } from '@metamask/controller-utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { NetworkClientId } from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import { type SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { TransactionParams } from '@metamask/transaction-controller';
import { numberToHex } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import {
  type BridgeClientId,
  BRIDGE_CONTROLLER_NAME,
  BRIDGE_PROD_API_BASE_URL,
  DEFAULT_BRIDGE_CONTROLLER_STATE,
  METABRIDGE_CHAIN_TO_ADDRESS_MAP,
  REFRESH_INTERVAL_MS,
} from './constants/bridge';
import { CHAIN_IDS } from './constants/chains';
import type { GenericQuoteRequest, SolanaFees } from './types';
import {
  type L1GasFees,
  type QuoteResponse,
  type TxData,
  type BridgeControllerState,
  type BridgeControllerMessenger,
  type FetchFunction,
  BridgeFeatureFlagsKey,
  RequestStatus,
} from './types';
import { hasSufficientBalance } from './utils/balance';
import { isSolanaChainId, sumHexes } from './utils/bridge';
import {
  formatAddressToString,
  formatChainIdToCaip,
  formatChainIdToHex,
} from './utils/caip-formatters';
import { fetchBridgeFeatureFlags, fetchBridgeQuotes } from './utils/fetch';
import { isValidQuoteRequest } from './utils/quote';

const metadata: StateMetadata<BridgeControllerState> = {
  bridgeState: {
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
        bridgeState: DEFAULT_BRIDGE_CONTROLLER_STATE,
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

    this.update(({ bridgeState: state }) => {
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

    if (isValidQuoteRequest(updatedQuoteRequest)) {
      this.#quotesFirstFetched = Date.now();

      // Query the balance of the source token if the source chain is an EVM chain
      let insufficientBal: boolean | undefined;
      if (isSolanaChainId(updatedQuoteRequest.srcChainId)) {
        insufficientBal = paramsToUpdate.insufficientBal;
      } else {
        insufficientBal =
          paramsToUpdate.insufficientBal ||
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

  readonly #hasSufficientBalance = async (
    quoteRequest: GenericQuoteRequest,
  ) => {
    const walletAddress = this.#getMultichainSelectedAccount()?.address;
    const srcChainIdInHex = formatChainIdToHex(quoteRequest.srcChainId);
    const provider = this.#getSelectedNetworkClient()?.provider;
    const srcTokenAddressWithoutPrefix = formatAddressToString(
      quoteRequest.srcTokenAddress,
    );

    return (
      provider &&
      walletAddress &&
      srcTokenAddressWithoutPrefix &&
      quoteRequest.srcTokenAmount &&
      srcChainIdInHex &&
      (await hasSufficientBalance(
        provider,
        walletAddress,
        srcTokenAddressWithoutPrefix,
        quoteRequest.srcTokenAmount,
        srcChainIdInHex,
      ))
    );
  };

  resetState = () => {
    this.stopAllPolling();
    this.#abortController?.abort(RESET_STATE_ABORT_MESSAGE);

    this.update(({ bridgeState: state }) => {
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
    this.update(({ bridgeState: state }) => {
      state.bridgeFeatureFlags = bridgeFeatureFlags;
    });
    this.#setIntervalLength();
  };

  /**
   * Sets the interval length based on the source chain
   */
  readonly #setIntervalLength = () => {
    const { bridgeState: state } = this.state;
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
      this.state.bridgeState;
    this.#abortController?.abort('New quote request');
    this.#abortController = new AbortController();

    this.update(({ bridgeState: state }) => {
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

      this.update(({ bridgeState: state }) => {
        state.quotes = quotesWithL1GasFees ?? quotesWithSolanaFees ?? quotes;
        state.quotesLoadingStatus = RequestStatus.FETCHED;
      });
    } catch (error) {
      const isAbortError = (error as Error).name === 'AbortError';
      const isAbortedDueToReset = error === RESET_STATE_ABORT_MESSAGE;
      if (isAbortedDueToReset || isAbortError) {
        return;
      }

      this.update(({ bridgeState: state }) => {
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
      this.update(({ bridgeState: state }) => {
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
              snapId: selectedAccount.metadata.snap.id as SnapId,
              origin: 'metamask',
              handler: HandlerType.OnRpcRequest,
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
