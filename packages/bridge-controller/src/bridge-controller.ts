import type { StateMetadata } from '@metamask/base-controller';
import type { ChainId } from '@metamask/controller-utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { NetworkClientId } from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { TransactionParams } from '@metamask/transaction-controller';
import { numberToHex } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { BrowserProvider, Contract } from 'ethers';

import { REFRESH_INTERVAL_MS } from './constants';
import {
  BRIDGE_CONTROLLER_NAME,
  DEFAULT_BRIDGE_CONTROLLER_STATE,
  METABRIDGE_CHAIN_TO_ADDRESS_MAP,
} from './constants';
import { CHAIN_IDS } from './constants/chains';
import {
  type L1GasFees,
  type QuoteRequest,
  type QuoteResponse,
  type TxData,
  type BridgeControllerState,
  BridgeFeatureFlagsKey,
  RequestStatus,
} from './types';
import type { BridgeControllerMessenger } from './types';
import { sumHexes } from './utils';
import { hasSufficientBalance } from './utils/balance';
import { fetchBridgeFeatureFlags, fetchBridgeQuotes } from './utils/fetch';
import { isValidQuoteRequest } from './utils/quote';

const metadata: StateMetadata<{ bridgeState: BridgeControllerState }> = {
  bridgeState: {
    persist: false,
    anonymous: false,
  },
};

const RESET_STATE_ABORT_MESSAGE = 'Reset controller state';

/** The input to start polling for the {@link BridgeController} */
type BridgePollingInput = {
  networkClientId: NetworkClientId;
  updatedQuoteRequest: QuoteRequest;
};

export class BridgeController extends StaticIntervalPollingController<BridgePollingInput>()<
  typeof BRIDGE_CONTROLLER_NAME,
  { bridgeState: BridgeControllerState },
  BridgeControllerMessenger
> {
  #abortController: AbortController | undefined;

  #quotesFirstFetched: number | undefined;

  readonly #getLayer1GasFee: (params: {
    transactionParams: TransactionParams;
    chainId: ChainId;
  }) => Promise<string>;

  constructor({
    messenger,
    state,
    getLayer1GasFee,
  }: {
    messenger: BridgeControllerMessenger;
    state?: Partial<BridgeControllerState>;
    getLayer1GasFee: (params: {
      transactionParams: TransactionParams;
      chainId: ChainId;
    }) => Promise<string>;
  }) {
    super({
      name: BRIDGE_CONTROLLER_NAME,
      metadata,
      messenger,
      state: {
        bridgeState: {
          ...DEFAULT_BRIDGE_CONTROLLER_STATE,
          ...state,
        },
      },
    });

    this.setIntervalLength(REFRESH_INTERVAL_MS);

    this.#abortController = new AbortController();
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

    this.#getLayer1GasFee = getLayer1GasFee;
  }

  _executePoll = async (pollingInput: BridgePollingInput) => {
    await this.#fetchBridgeQuotes(pollingInput);
  };

  updateBridgeQuoteRequestParams = async (
    paramsToUpdate: Partial<QuoteRequest>,
  ) => {
    this.stopAllPolling();
    this.#abortController?.abort('Quote request updated');

    const { bridgeState } = this.state;
    const updatedQuoteRequest = {
      ...DEFAULT_BRIDGE_CONTROLLER_STATE.quoteRequest,
      ...paramsToUpdate,
    };

    this.update((_state) => {
      _state.bridgeState = {
        ...bridgeState,
        quoteRequest: updatedQuoteRequest,
        quotes: DEFAULT_BRIDGE_CONTROLLER_STATE.quotes,
        quotesLastFetched: DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLastFetched,
        quotesLoadingStatus:
          DEFAULT_BRIDGE_CONTROLLER_STATE.quotesLoadingStatus,
        quoteFetchError: DEFAULT_BRIDGE_CONTROLLER_STATE.quoteFetchError,
        quotesRefreshCount: DEFAULT_BRIDGE_CONTROLLER_STATE.quotesRefreshCount,
        quotesInitialLoadTime:
          DEFAULT_BRIDGE_CONTROLLER_STATE.quotesInitialLoadTime,
      };
    });

    if (isValidQuoteRequest(updatedQuoteRequest)) {
      this.#quotesFirstFetched = Date.now();
      const walletAddress = this.#getSelectedAccount().address;
      const srcChainIdInHex = numberToHex(updatedQuoteRequest.srcChainId);

      const insufficientBal =
        paramsToUpdate.insufficientBal ||
        !(await this.#hasSufficientBalance(updatedQuoteRequest));

      const networkClientId = this.#getSelectedNetworkClientId(srcChainIdInHex);
      this.startPolling({
        networkClientId,
        updatedQuoteRequest: {
          ...updatedQuoteRequest,
          walletAddress,
          insufficientBal,
        },
      });
    }
  };

  readonly #hasSufficientBalance = async (quoteRequest: QuoteRequest) => {
    const walletAddress = this.#getSelectedAccount().address;
    const srcChainIdInHex = numberToHex(quoteRequest.srcChainId);
    const provider = this.#getSelectedNetworkClient()?.provider;

    return (
      provider &&
      (await hasSufficientBalance(
        provider,
        walletAddress,
        quoteRequest.srcTokenAddress,
        quoteRequest.srcTokenAmount,
        srcChainIdInHex,
      ))
    );
  };

  resetState = () => {
    this.stopAllPolling();
    this.#abortController?.abort(RESET_STATE_ABORT_MESSAGE);

    this.update((_state) => {
      _state.bridgeState = {
        ...DEFAULT_BRIDGE_CONTROLLER_STATE,
        quotes: [],
        bridgeFeatureFlags: _state.bridgeState.bridgeFeatureFlags,
      };
    });
  };

  setBridgeFeatureFlags = async () => {
    const { bridgeState } = this.state;
    const bridgeFeatureFlags = await fetchBridgeFeatureFlags();
    this.update((_state) => {
      _state.bridgeState = { ...bridgeState, bridgeFeatureFlags };
    });
    this.setIntervalLength(
      bridgeFeatureFlags[BridgeFeatureFlagsKey.EXTENSION_CONFIG].refreshRate,
    );
  };

  readonly #fetchBridgeQuotes = async ({
    networkClientId: _networkClientId,
    updatedQuoteRequest,
  }: BridgePollingInput) => {
    this.#abortController?.abort('New quote request');
    this.#abortController = new AbortController();
    if (updatedQuoteRequest.srcChainId === updatedQuoteRequest.destChainId) {
      return;
    }
    const { bridgeState } = this.state;
    this.update((_state) => {
      _state.bridgeState = {
        ...bridgeState,
        quotesLoadingStatus: RequestStatus.LOADING,
        quoteRequest: updatedQuoteRequest,
        quoteFetchError: DEFAULT_BRIDGE_CONTROLLER_STATE.quoteFetchError,
      };
    });

    try {
      const quotes = await fetchBridgeQuotes(
        updatedQuoteRequest,
        // AbortController is always defined by this line, because we assign it a few lines above,
        // not sure why Jest thinks it's not
        // Linters accurately say that it's defined
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.#abortController!.signal as AbortSignal,
      );

      const quotesWithL1GasFees = await this.#appendL1GasFees(quotes);

      this.update((_state) => {
        _state.bridgeState = {
          ..._state.bridgeState,
          quotes: quotesWithL1GasFees,
          quotesLoadingStatus: RequestStatus.FETCHED,
        };
      });
    } catch (error) {
      const isAbortError = (error as Error).name === 'AbortError';
      const isAbortedDueToReset = error === RESET_STATE_ABORT_MESSAGE;
      if (isAbortedDueToReset || isAbortError) {
        return;
      }

      this.update((_state) => {
        _state.bridgeState = {
          ...bridgeState,
          quoteFetchError:
            error instanceof Error ? error.message : 'Unknown error',
          quotesLoadingStatus: RequestStatus.ERROR,
        };
      });
      console.log('Failed to fetch bridge quotes', error);
    } finally {
      const { maxRefreshCount } =
        bridgeState.bridgeFeatureFlags[BridgeFeatureFlagsKey.EXTENSION_CONFIG];

      const updatedQuotesRefreshCount = bridgeState.quotesRefreshCount + 1;
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
      this.update((_state) => {
        _state.bridgeState = {
          ..._state.bridgeState,
          quotesInitialLoadTime:
            updatedQuotesRefreshCount === 1 && this.#quotesFirstFetched
              ? quotesLastFetched - this.#quotesFirstFetched
              : bridgeState.quotesInitialLoadTime,
          quotesLastFetched,
          quotesRefreshCount: updatedQuotesRefreshCount,
        };
      });
    }
  };

  readonly #appendL1GasFees = async (
    quotes: QuoteResponse[],
  ): Promise<(QuoteResponse & L1GasFees)[]> => {
    return await Promise.all(
      quotes.map(async (quoteResponse) => {
        const { quote, trade, approval } = quoteResponse;
        const chainId = numberToHex(quote.srcChainId) as ChainId;
        if (
          [CHAIN_IDS.OPTIMISM.toString(), CHAIN_IDS.BASE.toString()].includes(
            chainId,
          )
        ) {
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
        }
        return quoteResponse;
      }),
    );
  };

  #getSelectedAccount() {
    return this.messagingSystem.call('AccountsController:getSelectedAccount');
  }

  #getSelectedNetworkClient() {
    const { selectedNetworkClientId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    const networkClient = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      selectedNetworkClientId,
    );
    return networkClient;
  }

  #getSelectedNetworkClientId(chainId: Hex) {
    return this.messagingSystem.call(
      'NetworkController:findNetworkClientIdByChainId',
      chainId,
    );
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

    const ethersProvider = new BrowserProvider(provider);
    const contract = new Contract(contractAddress, abiERC20, ethersProvider);
    const { address: walletAddress } = this.#getSelectedAccount();
    const allowance: bigint = await contract.allowance(
      walletAddress,
      METABRIDGE_CHAIN_TO_ADDRESS_MAP[chainId],
    );
    return allowance.toString();
  };
}
