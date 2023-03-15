import EthQuery from 'eth-query';
import Subprovider from 'web3-provider-engine/subproviders/provider';
import createInfuraProvider from 'eth-json-rpc-infura/src/createProvider';
import createMetamaskProvider from 'web3-provider-engine/zero';
import { createEventEmitterProxy } from '@metamask/swappable-obj-proxy';
import type { SwappableProxy } from '@metamask/swappable-obj-proxy';
import { Mutex } from 'async-mutex';
import type { Patch } from 'immer';
import {
  BaseControllerV2,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import {
  MAINNET,
  RPC,
  TESTNET_NETWORK_TYPE_TO_TICKER_SYMBOL,
  NetworksChainId,
  NetworkType,
} from '@metamask/controller-utils';

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
  chainId?: string;
  ticker?: string;
  nickname?: string;
};

export type Block = {
  baseFeePerGas?: string;
};

export type NetworkDetails = {
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
  providerConfig: ProviderConfig;
  networkDetails: NetworkDetails;
};

const LOCALHOST_RPC_URL = 'http://localhost:8545';

const name = 'NetworkController';

export type EthQuery = any;

type Provider = any;

export type ProviderProxy = SwappableProxy<Provider>;

type BlockTracker = any;

type BlockTrackerProxy = SwappableProxy<BlockTracker>;

export type NetworkControllerStateChangeEvent = {
  type: `NetworkController:stateChange`;
  payload: [NetworkState, Patch[]];
};

export type NetworkControllerProviderConfigChangeEvent = {
  type: `NetworkController:providerConfigChange`;
  payload: [ProviderConfig];
};

export type NetworkControllerEvents =
  | NetworkControllerStateChangeEvent
  | NetworkControllerProviderConfigChangeEvent;

export type NetworkControllerGetProviderConfigAction = {
  type: `NetworkController:getProviderConfig`;
  handler: () => ProviderConfig;
};

export type NetworkControllerGetEthQueryAction = {
  type: `NetworkController:getEthQuery`;
  handler: () => EthQuery;
};

export type NetworkControllerActions =
  | NetworkControllerGetProviderConfigAction
  | NetworkControllerGetEthQueryAction;

export type NetworkControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  NetworkControllerGetProviderConfigAction | NetworkControllerGetEthQueryAction,
  | NetworkControllerStateChangeEvent
  | NetworkControllerProviderConfigChangeEvent,
  string,
  string
>;

export type NetworkControllerOptions = {
  messenger: NetworkControllerMessenger;
  infuraProjectId?: string;
  state?: Partial<NetworkState>;
};

export const defaultState: NetworkState = {
  network: 'loading',
  isCustomNetwork: false,
  providerConfig: { type: MAINNET, chainId: NetworksChainId.mainnet },
  networkDetails: { isEIP1559Compatible: false },
};

/**
 * Controller that creates and manages an Ethereum network provider.
 */
export class NetworkController extends BaseControllerV2<
  typeof name,
  NetworkState,
  NetworkControllerMessenger
> {
  private ethQuery: EthQuery;

  private internalProviderConfig: ProviderConfig = {} as ProviderConfig;

  private infuraProjectId: string | undefined;

  private mutex = new Mutex();

  #provider: Provider | undefined;

  #providerProxy: ProviderProxy | undefined;

  #blockTrackerProxy: BlockTrackerProxy | undefined;

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
        networkDetails: {
          persist: true,
          anonymous: false,
        },
        providerConfig: {
          persist: true,
          anonymous: false,
        },
      },
      messenger,
      state: { ...defaultState, ...state },
    });
    this.setProviderConfig(this.state.providerConfig);
    this.infuraProjectId = infuraProjectId;
    this.messagingSystem.registerActionHandler(
      `${this.name}:getProviderConfig`,
      () => {
        return this.state.providerConfig;
      },
    );

    this.messagingSystem.registerActionHandler(
      `${this.name}:getEthQuery`,
      () => {
        return this.ethQuery;
      },
    );
  }

  public start() {
    if (['rpc', 'localhost'].indexOf(this.state.providerConfig.type) === -1) {
      return this.setProviderType(this.state.providerConfig.type);
    }

    const { rpcTarget, chainId, nickname, ticker } = this.state.providerConfig;
    if (rpcTarget === undefined) {
      throw new Error(
        "Cannot setRpcTarget without having an rpcTarget in the providerConfig"
      );
    }
    if (chainId === undefined) {
      throw new Error(
        "Cannot setRpcTarget without having a chainId in the providerConfig"
      );
    }
    return this.setRpcTarget(
      rpcTarget,
      chainId,
      ticker,
      nickname,
    );
  }

  public setProviderConfig(providerConfig: ProviderConfig) {
    const { type, nickname } = providerConfig;
    let { chainId, rpcTarget, ticker } = providerConfig;
    if (type === "localhost") {
      rpcTarget = LOCALHOST_RPC_URL;
    }
    if (type !== "rpc" && type !== "localhost") {
      chainId = NetworksChainId[type];
      ticker =
        type in TESTNET_NETWORK_TYPE_TO_TICKER_SYMBOL &&
          TESTNET_NETWORK_TYPE_TO_TICKER_SYMBOL[type].length > 0
          ? TESTNET_NETWORK_TYPE_TO_TICKER_SYMBOL[type]
          : 'ETH';
    }

    this.update((state) => {
      state.providerConfig.type = type;
      state.providerConfig.ticker = ticker;
      state.providerConfig.chainId = chainId;
      state.providerConfig.rpcTarget = rpcTarget;
      state.providerConfig.nickname = nickname;
    });
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
      case MAINNET:
      case 'goerli':
      case 'sepolia':
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
    return this.getEIP1559Compatibility();
  }

  getProviderAndBlockTracker(): {
    provider: SwappableProxy<Provider> | undefined;
    blockTracker: SwappableProxy<BlockTracker> | undefined;
  } {
    return {
      provider: this.#providerProxy,
      blockTracker: this.#blockTrackerProxy,
    };
  }

  private refreshNetwork() {
    this.update((state) => {
      state.network = 'loading';
      state.networkDetails = {};
    });
    const { rpcTarget, type, chainId, ticker } = this.state.providerConfig;
    this.initializeProvider(type, rpcTarget, chainId, ticker);
    this.registerProvider();
    return this.lookupNetwork();
  }

  private registerProvider() {
    const { provider } = this.getProviderAndBlockTracker();

    if (provider) {
      provider.on('error', this.verifyNetwork.bind(this));
      this.ethQuery = new EthQuery(provider);
    }
  }

  private setupInfuraProvider(type: NetworkType) {
    const infuraProvider = createInfuraProvider({
      network: type,
      projectId: this.infuraProjectId,
    });
    const infuraSubprovider = new Subprovider(infuraProvider);
    const config = {
      ...this.state.providerConfig,
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
      chainId !== NetworksChainId.goerli &&
      chainId !== NetworksChainId.sepolia &&
      chainId !== NetworksChainId.localhost
    );
  }

  private setupStandardProvider(
    rpcTarget: string,
    chainId?: string,
  ) {
    const config = {
      chainId: chainId || this.state.providerConfig.chainId,
      engineParams: { pollingInterval: 12000 },
      rpcUrl: rpcTarget || this.state.providerConfig.rpcTarget,
    };
    this.updateProvider(createMetamaskProvider(config));
  }

  private updateProvider(provider: Provider) {
    this.safelyStopProvider(this.#provider);
    this.#setProviderAndBlockTracker({
      provider,
      blockTracker: provider._blockTracker,
    });
    this.registerProvider();
  }

  private safelyStopProvider(provider: Provider | undefined) {
    setTimeout(() => {
      provider?.stop();
    }, 500);
  }

  private verifyNetwork() {
    if (this.state.network === 'loading') {
      return this.lookupNetwork();
    }
  }

  /**
   * Sets a new configuration for web3-provider-engine.
   *
   * TODO: Replace this wth a method.
   *
   * @param providerConfig - The web3-provider-engine configuration.
   */
  set providerConfig(providerConfig: ProviderConfig) {
    this.setProviderConfig(providerConfig);
    this.internalProviderConfig = providerConfig;
    const { type, rpcTarget, chainId, ticker, nickname } =
      this.state.providerConfig;
    this.initializeProvider(type, rpcTarget, chainId, ticker, nickname);
    this.registerProvider();
    this.lookupNetwork();
  }

  get providerConfig() {
    throw new Error('Property only used for setting');
  }

  async #getNetworkId(): Promise<string> {
    return await new Promise((resolve, reject) => {
      this.ethQuery.sendAsync(
        { method: 'net_version' },
        (error: Error, result: string) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        },
      );
    });
  }

  /**
   * Refreshes the current network code.
   */
  async lookupNetwork() {
    if (!this.ethQuery) {
      return;
    }
    const releaseLock = await this.mutex.acquire();

    try {
      try {
        const networkId = await this.#getNetworkId();
        if (this.state.network === networkId) {
          return;
        }

        this.update((state) => {
          state.network = networkId;
        });
      } catch (_error) {
        this.update((state) => {
          state.network = 'loading';
        });
      }

      this.messagingSystem.publish(
        `NetworkController:providerConfigChange`,
        this.state.providerConfig,
      );
    } finally {
      releaseLock();
    }
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
      state.providerConfig.type = type;
      state.providerConfig.ticker = ticker;
      state.providerConfig.chainId = NetworksChainId[type];
      state.providerConfig.rpcTarget = undefined;
      state.providerConfig.nickname = undefined;
    });
    return this.refreshNetwork();
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
      state.providerConfig.type = RPC;
      state.providerConfig.rpcTarget = rpcTarget;
      state.providerConfig.chainId = chainId;
      state.providerConfig.ticker = ticker;
      state.providerConfig.nickname = nickname;
    });
    return this.refreshNetwork();
  }

  #getLatestBlock(): Promise<Block> {
    return new Promise((resolve, reject) => {
      this.ethQuery.sendAsync(
        { method: 'eth_getBlockByNumber', params: ['latest', false] },
        (error: Error, block: Block) => {
          if (error) {
            reject(error);
          } else {
            resolve(block);
          }
        },
      );
    });
  }

  async getEIP1559Compatibility() {
    const { networkDetails = {} } = this.state;

    if (networkDetails.isEIP1559Compatible || !this.ethQuery) {
      return true;
    }

    const latestBlock = await this.#getLatestBlock();
    const isEIP1559Compatible =
      typeof latestBlock.baseFeePerGas !== 'undefined';
    if (networkDetails.isEIP1559Compatible !== isEIP1559Compatible) {
      this.update((state) => {
        state.networkDetails.isEIP1559Compatible = isEIP1559Compatible;
      });
    }
    return isEIP1559Compatible;
  }

  #setProviderAndBlockTracker({
    provider,
    blockTracker,
  }: {
    provider: Provider;
    blockTracker: BlockTracker;
  }) {
    if (this.#providerProxy) {
      this.#providerProxy.setTarget(provider);
    } else {
      this.#providerProxy = createEventEmitterProxy(provider);
    }
    this.#provider = provider;

    if (this.#blockTrackerProxy) {
      this.#blockTrackerProxy.setTarget(blockTracker);
    } else {
      this.#blockTrackerProxy = createEventEmitterProxy(blockTracker, {
        eventFilter: 'skipInternal',
      });
    }
  }
}

export default NetworkController;
