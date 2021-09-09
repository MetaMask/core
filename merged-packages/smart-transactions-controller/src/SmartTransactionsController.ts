import {
  BaseConfig,
  BaseController,
  BaseState,
  NetworkState,
  util,
} from '@metamask/controllers';
import {
  APIType,
  SmartTransaction,
  SignedTransaction,
  SignedCanceledTransaction,
  UnsignedTransaction,
} from './types';
import { getAPIRequestURL, isSmartTransactionPending } from './utils';

const { handleFetch, safelyExecute } = util;

// TODO: JSDoc all methods
// TODO: Remove all comments (* ! ?)

export const DEFAULT_INTERVAL = 5 * 60 * 1000;

export interface SmartTransactionsControllerConfig extends BaseConfig {
  interval: number;
  clientId: string;
  chainId: string;
  supportedChainIds: string[];
}

export interface SmartTransactionsControllerState extends BaseState {
  smartTransactions: Record<string, SmartTransaction[]>;
  userOptIn: boolean | undefined;
}

export default class SmartTransactionsController extends BaseController<
  SmartTransactionsControllerConfig,
  SmartTransactionsControllerState
> {
  private timeoutHandle?: NodeJS.Timeout;

  private updateSmartTransaction(smartTransaction: SmartTransaction): void {
    const { chainId } = this.config;
    const currentIndex = this.state.smartTransactions[chainId]?.findIndex(
      (st) => st.UUID === smartTransaction.UUID,
    );
    if (currentIndex === -1) {
      this.update({
        smartTransactions: {
          ...this.state.smartTransactions,
          [chainId]: [
            ...this.state.smartTransactions?.[chainId],
            smartTransaction,
          ],
        },
      });
    } else {
      this.update({
        smartTransactions: {
          ...this.state.smartTransactions,
          [chainId]: this.state.smartTransactions[chainId].map(
            (item, index) => {
              return index === currentIndex ? smartTransaction : item;
            },
          ),
        },
      });
    }
  }

  /* istanbul ignore next */
  private async fetch(request: string, options?: RequestInit) {
    const { clientId } = this.config;
    const fetchOptions = {
      ...options,
      headers: clientId
        ? {
            'X-Client-Id': clientId,
          }
        : undefined,
    };

    return handleFetch(request, fetchOptions);
  }

  constructor(
    {
      onNetworkStateChange,
    }: {
      onNetworkStateChange: (
        listener: (networkState: NetworkState) => void,
      ) => void;
    },
    config?: Partial<SmartTransactionsControllerConfig>,
    state?: Partial<SmartTransactionsControllerState>,
  ) {
    super(config, state);

    this.defaultConfig = {
      interval: DEFAULT_INTERVAL,
      chainId: '',
      clientId: 'default',
      supportedChainIds: ['1'],
    };

    this.defaultState = {
      smartTransactions: {},
      userOptIn: undefined,
    };

    this.initialize();

    onNetworkStateChange(({ provider }) => {
      const { chainId } = provider;
      this.configure({ chainId });
      if (this.config.supportedChainIds.includes(chainId)) {
        this.update({
          smartTransactions: {
            ...this.state.smartTransactions,
            [chainId]: this.state.smartTransactions[chainId] ?? [],
          },
        });
      }
      this.poll();
    });

    this.poll();
  }

  async poll(interval?: number): Promise<void> {
    const { chainId, supportedChainIds } = this.config;
    interval && this.configure({ interval }, false, false);
    this.timeoutHandle && clearTimeout(this.timeoutHandle);
    if (!supportedChainIds.includes(chainId)) {
      return;
    }
    await safelyExecute(() => this.updateSmartTransactions());
    this.timeoutHandle = setTimeout(() => {
      this.poll(this.config.interval);
    }, this.config.interval);
  }

  async stop() {
    this.timeoutHandle && clearTimeout(this.timeoutHandle);
  }

  setOptInState(state: boolean | undefined): void {
    this.update({ userOptIn: state });
  }

  async updateSmartTransactions() {
    const { smartTransactions } = this.state;
    const { chainId } = this.config;

    const transactionsToUpdate: string[] = [];
    smartTransactions[chainId]?.forEach((smartTransaction) => {
      if (isSmartTransactionPending(smartTransaction)) {
        transactionsToUpdate.push(smartTransaction.UUID);
      }
    });

    if (transactionsToUpdate.length > 0) {
      this.fetchSmartTransactionsStatus(transactionsToUpdate);
    } else {
      this.stop();
    }
  }

  // ! Ask backend API to accept list of UUIDs as params
  async fetchSmartTransactionsStatus(UUIDS: string[]): Promise<void> {
    const { chainId } = this.config;

    const params = new URLSearchParams({
      uuids: UUIDS.join(','),
    });

    const url = `${getAPIRequestURL(
      APIType.STATUS,
      chainId,
    )}?${params.toString()}`;

    const data: SmartTransaction[] = await this.fetch(url);

    data.forEach((smartTransaction) => {
      this.updateSmartTransaction(smartTransaction);
    });
  }

  async getUnsignedTransactionsAndEstimates(
    unsignedTransaction: UnsignedTransaction,
  ): Promise<{
    transactions: UnsignedTransaction[];
    cancelTransactions: UnsignedTransaction[];
    estimates: {
      maxFee: number; // GWEI number
      estimatedFee: number; // GWEI number
    };
  }> {
    const { chainId } = this.config;

    const data = await this.fetch(
      getAPIRequestURL(APIType.GET_TRANSACTIONS, chainId),
      {
        method: 'POST',
        body: JSON.stringify({ tx: unsignedTransaction }),
      },
    );

    return data;
  }

  // * After this successful call client must add a nonce representative to
  // * transaction controller external transactions list
  async submitSignedTransactions({
    signedTransactions,
    signedCanceledTransactions,
  }: {
    signedTransactions: SignedTransaction[];
    signedCanceledTransactions: SignedCanceledTransaction[];
  }) {
    const { chainId } = this.config;
    const data = await this.fetch(
      getAPIRequestURL(APIType.SUBMIT_TRANSACTIONS, chainId),
      {
        method: 'POST',
        body: JSON.stringify({
          signedTransactions,
          // TODO: Check if canceled transactions can be part of signedTransactions.
          signedCanceledTransactions,
        }),
      },
    );

    this.updateSmartTransaction({ UUID: data.uuid });
  }

  // ! This should return if the cancellation was on chain or not (for nonce management)
  // * After this successful call client must update nonce representative
  // * in transaction controller external transactions list
  // ! Ask backend API to make this endpoint a POST
  async cancelSmartTransaction(UUID: string): Promise<void> {
    const { chainId } = this.config;
    await this.fetch(getAPIRequestURL(APIType.CANCEL, chainId), {
      method: 'POST',
      body: JSON.stringify({ uuid: UUID }),
    });
  }
}
