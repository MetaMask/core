import EthQuery from 'eth-query';
import Subprovider from 'web3-provider-engine/subproviders/provider';
import createInfuraProvider from 'eth-json-rpc-infura/src/createProvider';
import createMetamaskProvider from 'web3-provider-engine/zero';
import { Mutex } from 'async-mutex';
import type { Patch } from 'immer';
import { BaseController } from '../BaseControllerV2';
import {
  MAINNET,
  RPC,
  TESTNET_NETWORK_TYPE_TO_TICKER_SYMBOL,
} from '../constants';
import { RestrictedControllerMessenger } from '../ControllerMessenger';

/**
 * Human-readable network name
 */
export type NetworkType =
  | 'kovan'
  | 'localhost'
  | 'mainnet'
  | 'rinkeby'
  | 'goerli'
  | 'ropsten'
  | 'rpc';

export enum NetworksChainId {
  mainnet = '1',
  kovan = '42',
  rinkeby = '4',
  goerli = '5',
  ropsten = '3',
  localhost = '',
  rpc = '',
}

/**
 * @type ProviderConfig
 *
 * Configuration passed to web3-provider-engine
 * @property rpcTarget - RPC target URL.
 * @property type - Human-readable network name.
 * @property chainId - Network ID as per EIP-155.
 * @property ticker - Currency ticker.
 * @property nickname - Personalized network name.
 */
export type ProviderConfig = {
  rpcTarget?: string;
  type: NetworkType;
  chainId: string;
  ticker?: string;
  nickname?: string;
};

export type Block = {
  baseFeePerGas?: string;
};

export type NetworkProperties = {
  isEIP1559Compatible?: boolean;
};

/**
 * @type NetworkState
 *
 * Network controller state
 * @property network - Network ID as per net_version
 * @property isCustomNetwork - Identifies if the network is a custom network
 * @property provider - RPC URL and network name provider settings
 */
export type NetworkState = {
  network: string;
  isCustomNetwork: boolean;
  provider: ProviderConfig;
  properties: NetworkProperties;
};

const LOCALHOST_RPC_URL = 'http://localhost:8545';

const name = 'NetworkController';

export type EthQuery = any;

export type NetworkControllerStateChangeEvent = {
  type: `NetworkController:stateChange`;
  payload: [NetworkState, Patch[]];
};

export type NetworkControllerProviderChangeEvent = {
  type: `NetworkController:providerChange`;
  payload: [ProviderConfig];
};

export type NetworkControllerGetProviderConfigAction = {
  type: `NetworkController:getProviderConfig`;
  handler: () => ProviderConfig;
};

export type NetworkControllerGetEthQueryAction = {
  type: `NetworkController:getEthQuery`;
  handler: () => EthQuery;
};

export type NetworkControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  NetworkControllerGetProviderConfigAction | NetworkControllerGetEthQueryAction,
  NetworkControllerStateChangeEvent | NetworkControllerProviderChangeEvent,
  string,
  string
>;

export type NetworkControllerOptions = {
  messenger: NetworkControllerMessenger;
  infuraProjectId?: string;
  state?: Partial<NetworkState>;
};

const defaultState: NetworkState = {
  network: 'loading',
  isCustomNetwork: false,
  provider: { type: MAINNET, chainId: NetworksChainId.mainnet },
  properties: { isEIP1559Compatible: false },
};

/**
 * Controller that creates and manages an Ethereum network provider
 */
export class NetworkController extends BaseController<
  typeof name,
  NetworkState,
  NetworkControllerMessenger
> {
  private ethQuery: EthQuery;

  private internalProviderConfig: ProviderConfig = {} as ProviderConfig;

  private infuraProjectId: string | undefined;

  private mutex = new Mutex();

  constructor({ messenger, state, infuraProjectId }: NetworkControllerOptions) {
    super({
      name,
      metadata: {
        network: {
          persist: true,
          anonymous: false,
        },
        isCustomNetwork: {
          persist: true,
          anonymous: false,
        },
        properties: {
          persist: true,
          anonymous: false,
        },
        provider: {
          persist: true,
          anonymous: false,
        },
      },
      messenger,
      state: { ...defaultState, ...state },
    });
    this.infuraProjectId = infuraProjectId;
    this.messagingSystem.registerActionHandler(
      `${this.name}:getProviderConfig`,
      () => {
        return this.state.provider;
      },
    );

    this.messagingSystem.registerActionHandler(
      `${this.name}:getEthQuery`,
      () => {
        return this.ethQuery;
      },
    );
  }

  private initializeProvider(
    type: NetworkType,
    rpcTarget?: string,
    chainId?: string,
    ticker?: string,
    nickname?: string,
  ) {
    this.update((state) => {
      state.isCustomNetwork = this.getIsCustomNetwork(chainId);
    });

    switch (type) {
      case 'kovan':
      case MAINNET:
      case 'rinkeby':
      case 'goerli':
      case 'ropsten':
        this.setupInfuraProvider(type);
        break;
      case 'localhost':
        this.setupStandardProvider(LOCALHOST_RPC_URL);
        break;
      case RPC:
        rpcTarget &&
          this.setupStandardProvider(rpcTarget, chainId, ticker, nickname);
        break;
      default:
        throw new Error(`Unrecognized network type: '${type}'`);
    }
    this.getEIP1559Compatibility();
  }

  private refreshNetwork() {
    this.update((state) => {
      state.network = 'loading';
      state.properties = {};
    });
    const { rpcTarget, type, chainId, ticker } = this.state.provider;
    this.initializeProvider(type, rpcTarget, chainId, ticker);
    this.lookupNetwork();
  }

  private registerProvider() {
    this.provider.on('error', this.verifyNetwork.bind(this));
    this.ethQuery = new EthQuery(this.provider);
  }

  private setupInfuraProvider(type: NetworkType) {
    const infuraProvider = createInfuraProvider({
      network: type,
      projectId: this.infuraProjectId,
    });
    const infuraSubprovider = new Subprovider(infuraProvider);
    const config = {
      ...this.internalProviderConfig,
      ...{
        dataSubprovider: infuraSubprovider,
        engineParams: {
          blockTrackerProvider: infuraProvider,
          pollingInterval: 12000,
        },
      },
    };
    this.updateProvider(createMetamaskProvider(config));
  }

  private getIsCustomNetwork(chainId?: string) {
    return (
      chainId !== NetworksChainId.mainnet &&
      chainId !== NetworksChainId.kovan &&
      chainId !== NetworksChainId.rinkeby &&
      chainId !== NetworksChainId.goerli &&
      chainId !== NetworksChainId.ropsten &&
      chainId !== NetworksChainId.localhost
    );
  }

  private setupStandardProvider(
    rpcTarget: string,
    chainId?: string,
    ticker?: string,
    nickname?: string,
  ) {
    const config = {
      ...this.internalProviderConfig,
      ...{
        chainId,
        engineParams: { pollingInterval: 12000 },
        nickname,
        rpcUrl: rpcTarget,
        ticker,
      },
    };
    this.updateProvider(createMetamaskProvider(config));
  }

  private updateProvider(provider: any) {
    this.safelyStopProvider(this.provider);
    this.provider = provider;
    this.registerProvider();
  }

  private safelyStopProvider(provider: any) {
    setTimeout(() => {
      provider?.stop();
    }, 500);
  }

  private verifyNetwork() {
    this.state.network === 'loading' && this.lookupNetwork();
  }

  /**
   * Ethereum provider object for the current network
   */
  provider: any;

  /**
   * Sets a new configuration for web3-provider-engine.
   *
   * TODO: Replace this wth a method.
   *
   * @param providerConfig - The web3-provider-engine configuration.
   */
  set providerConfig(providerConfig: ProviderConfig) {
    this.internalProviderConfig = providerConfig;
    const { type, rpcTarget, chainId, ticker, nickname } = this.state.provider;
    this.initializeProvider(type, rpcTarget, chainId, ticker, nickname);
    this.registerProvider();
    this.lookupNetwork();
  }

  get providerConfig() {
    throw new Error('Property only used for setting');
  }

  /**
   * Refreshes the current network code.
   */
  async lookupNetwork() {
    /* istanbul ignore if */
    if (!this.ethQuery || !this.ethQuery.sendAsync) {
      return;
    }
    const releaseLock = await this.mutex.acquire();
    this.ethQuery.sendAsync(
      { method: 'net_version' },
      (error: Error, network: string) => {
        if (this.state.network === network) {
          return;
        }

        this.update((state) => {
          state.network = error ? /* istanbul ignore next*/ 'loading' : network;
        });

        this.messagingSystem.publish(
          `NetworkController:providerChange`,
          this.state.provider,
        );

        releaseLock();
      },
    );
  }

  /**
   * Convenience method to update provider network type settings.
   *
   * @param type - Human readable network name.
   */
  setProviderType(type: NetworkType) {
    // If testnet the ticker symbol should use a testnet prefix
    const ticker =
      type in TESTNET_NETWORK_TYPE_TO_TICKER_SYMBOL &&
      TESTNET_NETWORK_TYPE_TO_TICKER_SYMBOL[type].length > 0
        ? TESTNET_NETWORK_TYPE_TO_TICKER_SYMBOL[type]
        : 'ETH';

    this.update((state) => {
      state.provider.type = type;
      state.provider.ticker = ticker;
      state.provider.chainId = NetworksChainId[type];
    });
    this.refreshNetwork();
  }

  /**
   * Convenience method to update provider RPC settings.
   *
   * @param rpcTarget - The RPC endpoint URL.
   * @param chainId - The chain ID as per EIP-155.
   * @param ticker - The currency ticker.
   * @param nickname - Personalized network name.
   */
  setRpcTarget(
    rpcTarget: string,
    chainId: string,
    ticker?: string,
    nickname?: string,
  ) {
    this.update((state) => {
      state.provider.type = RPC;
      state.provider.rpcTarget = rpcTarget;
      state.provider.chainId = chainId;
      state.provider.ticker = ticker;
      state.provider.nickname = nickname;
    });
    this.refreshNetwork();
  }

  getEIP1559Compatibility() {
    const { properties = {} } = this.state;

    if (!properties.isEIP1559Compatible) {
      if (typeof this.ethQuery?.sendAsync !== 'function') {
        return Promise.resolve(true);
      }
      return new Promise((resolve, reject) => {
        this.ethQuery.sendAsync(
          { method: 'eth_getBlockByNumber', params: ['latest', false] },
          (error: Error, block: Block) => {
            if (error) {
              reject(error);
            } else {
              const isEIP1559Compatible =
                typeof block.baseFeePerGas !== 'undefined';
              if (properties.isEIP1559Compatible !== isEIP1559Compatible) {
                this.update((state) => {
                  state.properties.isEIP1559Compatible = isEIP1559Compatible;
                });
              }
              resolve(isEIP1559Compatible);
            }
          },
        );
      });
    }
    return Promise.resolve(true);
  }
}

export default NetworkController;
