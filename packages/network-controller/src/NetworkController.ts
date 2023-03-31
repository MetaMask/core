import EthQuery from 'eth-query';
import Subprovider from 'web3-provider-engine/subproviders/provider';
import createInfuraProvider from 'eth-json-rpc-infura/src/createProvider';
import createMetamaskProvider from 'web3-provider-engine/zero';
import { createEventEmitterProxy } from '@metamask/swappable-obj-proxy';
import type { SwappableProxy } from '@metamask/swappable-obj-proxy';
import { Mutex } from 'async-mutex';
import { v4 as random } from 'uuid';
import type { Patch } from 'immer';
import {
  BaseControllerV2,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import {
  NetworksChainId,
  NetworkType,
  isSafeChainId,
  NetworksTicker,
  isNetworkType,
  BUILT_IN_NETWORKS,
} from '@metamask/controller-utils';

import { assertIsStrictHexString } from '@metamask/utils';

/**
 * @type ProviderConfig
 *
 * Configuration passed to web3-provider-engine
 * @property rpcTarget - RPC target URL.
 * @property type - Human-readable network name.
 * @property chainId - Network ID as per EIP-155.
 * @property ticker - Currency ticker.
 * @property nickname - Personalized network name.
 * @property id - Network Configuration Id.
 */
export type ProviderConfig = {
  rpcTarget?: string;
  type: NetworkType;
  chainId: string;
  ticker?: string;
  nickname?: string;
  rpcPrefs?: { blockExplorerUrl?: string };
  id?: NetworkConfigurationId;
};

export type Block = {
  baseFeePerGas?: string;
};

export type NetworkDetails = {
  isEIP1559Compatible?: boolean;
};

/**
 * Custom RPC network information
 *
 * @property rpcTarget - RPC target URL.
 * @property chainId - Network ID as per EIP-155
 * @property nickname - Personalized network name.
 * @property ticker - Currency ticker.
 * @property rpcPrefs - Personalized preferences.
 */
export type NetworkConfiguration = {
  rpcUrl: string;
  chainId: string;
  ticker: string;
  nickname?: string;
  rpcPrefs?: {
    blockExplorerUrl: string;
  };
};

/**
 * @type NetworkState
 *
 * Network controller state
 * @property network - Network ID as per net_version of the currently connected network
 * @property isCustomNetwork - Identifies if the currently connected network is a custom network
 * @property providerConfig - RPC URL and network name provider settings of the currently connected network
 * @property properties - an additional set of network properties for the currently connected network
 * @property networkConfigurations - the full list of configured networks either preloaded or added by the user.
 */
export type NetworkState = {
  network: string;
  isCustomNetwork: boolean;
  providerConfig: ProviderConfig;
  networkDetails: NetworkDetails;
  networkConfigurations: Record<string, NetworkConfiguration & { id: string }>;
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
  trackMetaMetricsEvent: () => void;
  infuraProjectId?: string;
  state?: Partial<NetworkState>;
};

export const defaultState: NetworkState = {
  network: 'loading',
  isCustomNetwork: false,
  providerConfig: {
    type: NetworkType.mainnet,
    chainId: NetworksChainId.mainnet,
  },
  networkDetails: { isEIP1559Compatible: false },
  networkConfigurations: {},
};

type MetaMetricsEventPayload = {
  event: string;
  category: string;
  referrer?: { url: string };
  actionId?: number;
  environmentType?: string;
  properties?: unknown;
  sensitiveProperties?: unknown;
  revenue?: number;
  currency?: string;
  value?: number;
};

type NetworkConfigurationId = string;

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

  private trackMetaMetricsEvent: (event: MetaMetricsEventPayload) => void;

  private mutex = new Mutex();

  #previousNetworkSpecifier: NetworkType | NetworkConfigurationId | null;

  #provider: Provider | undefined;

  #providerProxy: ProviderProxy | undefined;

  #blockTrackerProxy: BlockTrackerProxy | undefined;

  constructor({
    messenger,
    state,
    infuraProjectId,
    trackMetaMetricsEvent,
  }: NetworkControllerOptions) {
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
        networkConfigurations: {
          persist: true,
          anonymous: false,
        },
      },
      messenger,
      state: { ...defaultState, ...state },
    });
    this.infuraProjectId = infuraProjectId;
    this.trackMetaMetricsEvent = trackMetaMetricsEvent;
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

    this.#previousNetworkSpecifier = this.state.providerConfig.type;
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
      case NetworkType.mainnet:
      case NetworkType.goerli:
      case NetworkType.sepolia:
        this.setupInfuraProvider(type);
        break;
      case NetworkType.localhost:
        this.setupStandardProvider(LOCALHOST_RPC_URL);
        break;
      case NetworkType.rpc:
        rpcTarget &&
          this.setupStandardProvider(rpcTarget, chainId, ticker, nickname);
        break;
      default:
        throw new Error(`Unrecognized network type: '${type}'`);
    }
    this.getEIP1559Compatibility();
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
    this.lookupNetwork();
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
      chainId !== NetworksChainId.goerli &&
      chainId !== NetworksChainId.sepolia &&
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
    this.state.network === 'loading' && this.lookupNetwork();
  }

  /**
   * Sets a new configuration for web3-provider-engine.
   *
   * TODO: Replace this wth a method.
   *
   * @param providerConfig - The web3-provider-engine configuration.
   */
  set providerConfig(providerConfig: ProviderConfig) {
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
   * Convenience method to set the current provider config to the private providerConfig class variable.
   */
  #setCurrentAsPreviousProvider() {
    const { type, id } = this.state.providerConfig;
    if (type === NetworkType.rpc && id) {
      this.#previousNetworkSpecifier = id;
    } else {
      this.#previousNetworkSpecifier = type;
    }
  }

  /**
   * Convenience method to update provider network type settings.
   *
   * @param type - Human readable network name.
   */
  setProviderType(type: NetworkType) {
    this.#setCurrentAsPreviousProvider();
    // If testnet the ticker symbol should use a testnet prefix
    const ticker =
      type in NetworksTicker && NetworksTicker[type].length > 0
        ? NetworksTicker[type]
        : 'ETH';

    this.update((state) => {
      state.providerConfig.type = type;
      state.providerConfig.ticker = ticker;
      state.providerConfig.chainId = NetworksChainId[type];
      state.providerConfig.rpcPrefs = BUILT_IN_NETWORKS[type].rpcPrefs;
      state.providerConfig.rpcTarget = undefined;
      state.providerConfig.nickname = undefined;
      state.providerConfig.id = undefined;
    });
    this.refreshNetwork();
  }

  /**
   * Convenience method to update provider RPC settings.
   *
   * @param networkConfigurationId - The unique id for the network configuration to set as the active provider.
   */
  setActiveNetwork(networkConfigurationId: string) {
    this.#setCurrentAsPreviousProvider();

    const targetNetwork =
      this.state.networkConfigurations[networkConfigurationId];

    if (!targetNetwork) {
      throw new Error(
        `networkConfigurationId ${networkConfigurationId} does not match a configured networkConfiguration`,
      );
    }

    this.update((state) => {
      state.providerConfig.type = NetworkType.rpc;
      state.providerConfig.rpcTarget = targetNetwork.rpcUrl;
      state.providerConfig.chainId = targetNetwork.chainId;
      state.providerConfig.ticker = targetNetwork.ticker;
      state.providerConfig.nickname = targetNetwork.nickname;
      state.providerConfig.rpcPrefs = targetNetwork.rpcPrefs;
      state.providerConfig.id = targetNetwork.id;
    });

    this.refreshNetwork();
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

  /**
   * Adds a network configuration if the rpcUrl is not already present on an
   * existing network configuration. Otherwise updates the entry with the matching rpcUrl.
   *
   * @param networkConfiguration - The network configuration to add or, if rpcUrl matches an existing entry, to modify.
   * @param networkConfiguration.rpcUrl -  RPC provider url.
   * @param networkConfiguration.chainId - Network ID as per EIP-155.
   * @param networkConfiguration.ticker - Currency ticker.
   * @param networkConfiguration.nickname - Personalized network name.
   * @param networkConfiguration.rpcPrefs - Personalized preferences (i.e. preferred blockExplorer)
   * @param options - additional configuration options.
   * @param options.setActive - An option to set the newly added networkConfiguration as the active provider.
   * @param options.referrer - The site from which the call originated, or 'metamask' for internal calls - used for event metrics.
   * @param options.source - Where the upsertNetwork event originated (i.e. from a dapp or from the network form) - used for event metrics.
   * @returns id for the added or updated network configuration
   */
  upsertNetworkConfiguration(
    { rpcUrl, chainId, ticker, nickname, rpcPrefs }: NetworkConfiguration,
    {
      setActive = false,
      referrer,
      source,
    }: { setActive?: boolean; referrer: string; source: string },
  ): string {
    assertIsStrictHexString(chainId);

    if (!isSafeChainId(parseInt(chainId, 16))) {
      throw new Error(
        `Invalid chain ID "${chainId}": numerical value greater than max safe value.`,
      );
    }

    if (!rpcUrl) {
      throw new Error(
        'An rpcUrl is required to add or update network configuration',
      );
    }

    if (!referrer || !source) {
      throw new Error(
        'referrer and source are required arguments for adding or updating a network configuration',
      );
    }

    try {
      // eslint-disable-next-line no-new
      new URL(rpcUrl);
    } catch (e: any) {
      if (e.message.includes('Invalid URL')) {
        throw new Error('rpcUrl must be a valid URL');
      }
    }

    if (!ticker) {
      throw new Error(
        'A ticker is required to add or update networkConfiguration',
      );
    }

    const newNetworkConfiguration = {
      rpcUrl,
      chainId,
      ticker,
      nickname,
      rpcPrefs,
    };

    const oldNetworkConfigurations = this.state.networkConfigurations;

    const oldNetworkConfigurationId = Object.values(
      oldNetworkConfigurations,
    ).find(
      (networkConfiguration) =>
        networkConfiguration.rpcUrl?.toLowerCase() === rpcUrl?.toLowerCase(),
    )?.id;

    const newNetworkConfigurationId = oldNetworkConfigurationId || random();
    this.update((state) => {
      state.networkConfigurations = {
        ...oldNetworkConfigurations,
        [newNetworkConfigurationId]: {
          ...newNetworkConfiguration,
          id: newNetworkConfigurationId,
        },
      };
    });

    if (!oldNetworkConfigurationId) {
      this.trackMetaMetricsEvent({
        event: 'Custom Network Added',
        category: 'Network',
        referrer: {
          url: referrer,
        },
        properties: {
          chain_id: chainId,
          symbol: ticker,
          source,
        },
      });
    }

    if (setActive) {
      this.setActiveNetwork(newNetworkConfigurationId);
    }

    return newNetworkConfigurationId;
  }

  /**
   * Removes network configuration from state.
   *
   * @param networkConfigurationId - The networkConfigurationId of an existing network configuration
   */
  removeNetworkConfiguration(networkConfigurationId: string) {
    if (!this.state.networkConfigurations[networkConfigurationId]) {
      throw new Error(
        `networkConfigurationId ${networkConfigurationId} does not match a configured networkConfiguration`,
      );
    }
    this.update((state) => {
      delete state.networkConfigurations[networkConfigurationId];
    });
  }

  /**
   * Rolls back provider config to the previous provider in case of errors or inability to connect during network switch.
   */
  rollbackToPreviousProvider() {
    const specifier = this.#previousNetworkSpecifier;
    if (isNetworkType(specifier)) {
      this.setProviderType(specifier);
    } else if (typeof specifier === 'string') {
      this.setActiveNetwork(specifier);
    }
  }
}

export default NetworkController;
