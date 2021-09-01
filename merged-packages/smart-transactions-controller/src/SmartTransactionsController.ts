import {
  BaseConfig,
  BaseController,
  BaseState,
  NetworkState,
  util,
} from '@metamask/controllers';

export const DEFAULT_INTERVAL = 5 * 60 * 1000;

export interface SmartTransactionsConfig extends BaseConfig {
  interval: number;
  chainId: string;
  allowedNetworks: string[];
}

export interface SmartTransactionsState extends BaseState {
  smartTransactions: Record<string, any>;
  userOptIn: boolean | undefined;
}

export default class SmartTransactionsController extends BaseController<
  SmartTransactionsConfig,
  SmartTransactionsState
> {
  private handle?: NodeJS.Timeout;

  constructor(
    {
      onNetworkStateChange,
    }: {
      onNetworkStateChange: (
        listener: (networkState: NetworkState) => void,
      ) => void;
    },
    config?: Partial<SmartTransactionsConfig>,
    state?: Partial<SmartTransactionsState>,
  ) {
    super(config, state);
    this.defaultConfig = {
      interval: DEFAULT_INTERVAL,
      chainId: '',
      allowedNetworks: ['1'],
    };

    this.defaultState = {
      smartTransactions: {},
      userOptIn: undefined,
    };
    this.initialize();
    onNetworkStateChange(({ provider }) => {
      const { chainId } = provider;
      this.configure({ chainId });
      this.poll();
    });
    this.poll();
  }

  setOptInState(state: boolean | undefined): void {
    this.update({ userOptIn: state });
  }

  async poll(interval?: number): Promise<void> {
    const { chainId, allowedNetworks } = this.config;
    interval && this.configure({ interval }, false, false);
    this.handle && clearTimeout(this.handle);
    if (!allowedNetworks.includes(chainId)) {
      return;
    }
    await util.safelyExecute(() => this.updateSmartTransactions());
    this.handle = setTimeout(() => {
      this.poll(this.config.interval);
    }, this.config.interval);
  }

  async stop() {
    this.handle && clearTimeout(this.handle);
  }

  async updateSmartTransactions() {
    //
  }
}
