import EthQuery from 'eth-query';
import Subprovider from 'web3-provider-engine/subproviders/provider';
import createInfuraProvider from 'eth-json-rpc-infura/src/createProvider';
import createMetamaskProvider from 'web3-provider-engine/zero';
import { createEventEmitterProxy } from '@metamask/swappable-obj-proxy';
import type { SwappableProxy } from '@metamask/swappable-obj-proxy';
import { Mutex } from 'async-mutex';
import { v4 as random } from 'uuid';
import type { Patch } from 'immer';
import { errorCodes } from 'eth-rpc-errors';
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

import { NetworkStatus } from './constants';

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
 * Asserts that the given value is a network ID, i.e., that it is a decimal
 * number represented as a string.
 *
 * @param value - The value to check.
 */
function assertNetworkId(value: string): asserts value is NetworkId {
  if (!/^\d+$/u.test(value) || Number.isNaN(Number(value))) {
    throw new Error('value is not a number');
  }
}

/**
 * Type guard for determining whether the given value is an error object with a
 * `code` property, such as an instance of Error.
 *
 * TODO: Move this to @metamask/utils.
 *
 * @param error - The object to check.
 * @returns True if `error` has a `code`, false otherwise.
 */
function isErrorWithCode(error: unknown): error is { code: string | number } {
  return typeof error === 'object' && error !== null && 'code' in error;
}

/**
 * The network ID of a network.
 */
export type NetworkId = `${number}`;

/**
 * @type NetworkState
 *
 * Network controller state
 * @property network - Network ID as per net_version of the currently connected network
 * @property providerConfig - RPC URL and network name provider settings of the currently connected network
 * @property properties - an additional set of network properties for the currently connected network
 * @property networkConfigurations - the full list of configured networks either preloaded or added by the user.
 */
export type NetworkState = {
  networkId: NetworkId | null;
  networkStatus: NetworkStatus;
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

export type BlockTrackerProxy = SwappableProxy<BlockTracker>;

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
  networkId: null,
  networkStatus: NetworkStatus.Unknown,
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
  #ethQuery: EthQuery;

  #infuraProjectId: string | undefined;

  #trackMetaMetricsEvent: (event: MetaMetricsEventPayload) => void;

  #mutex = new Mutex();

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
        networkId: {
          persist: true,
          anonymous: false,
        },
        networkStatus: {
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
    this.#infuraProjectId = infuraProjectId;
    this.#trackMetaMetricsEvent = trackMetaMetricsEvent;
    this.messagingSystem.registerActionHandler(
      `${this.name}:getProviderConfig`,
      () => {
        return this.state.providerConfig;
      },
    );

    this.messagingSystem.registerActionHandler(
      `${this.name}:getEthQuery`,
      () => {
        return this.#ethQuery;
      },
    );

    this.#previousNetworkSpecifier = this.state.providerConfig.type;
  }

  #configureProvider(
    type: NetworkType,
    rpcTarget?: string,
    chainId?: string,
    ticker?: string,
    nickname?: string,
  ) {
    switch (type) {
      case NetworkType.mainnet:
      case NetworkType.goerli:
      case NetworkType.sepolia:
        this.#setupInfuraProvider(type);
        break;
      case NetworkType.localhost:
        this.#setupStandardProvider(LOCALHOST_RPC_URL);
        break;
      case NetworkType.rpc:
        rpcTarget &&
          this.#setupStandardProvider(rpcTarget, chainId, ticker, nickname);
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

  async #refreshNetwork() {
    this.update((state) => {
      state.networkId = null;
      state.networkStatus = NetworkStatus.Unknown;
      state.networkDetails = {};
    });
    const { rpcTarget, type, chainId, ticker } = this.state.providerConfig;
    this.#configureProvider(type, rpcTarget, chainId, ticker);
    await this.lookupNetwork();
  }

  #registerProvider() {
    const { provider } = this.getProviderAndBlockTracker();

    if (provider) {
      provider.on('error', this.#verifyNetwork.bind(this));
      this.#ethQuery = new EthQuery(provider);
    }
  }

  #setupInfuraProvider(type: NetworkType) {
    const infuraProvider = createInfuraProvider({
      network: type,
      projectId: this.#infuraProjectId,
    });
    const infuraSubprovider = new Subprovider(infuraProvider);
    const config = {
      dataSubprovider: infuraSubprovider,
      engineParams: {
        blockTrackerProvider: infuraProvider,
        pollingInterval: 12000,
      },
    };
    this.#updateProvider(createMetamaskProvider(config));
  }

  #getIsCustomNetwork(chainId?: string) {
    return (
      chainId !== NetworksChainId.mainnet &&
      chainId !== NetworksChainId.goerli &&
      chainId !== NetworksChainId.sepolia &&
      chainId !== NetworksChainId.localhost
    );
  }

  #setupStandardProvider(
    rpcTarget: string,
    chainId?: string,
    ticker?: string,
    nickname?: string,
  ) {
    const config = {
      chainId,
      engineParams: { pollingInterval: 12000 },
      nickname,
      rpcUrl: rpcTarget,
      ticker,
    };
    this.#updateProvider(createMetamaskProvider(config));
  }

  #updateProvider(provider: Provider) {
    this.#safelyStopProvider(this.#provider);
    this.#setProviderAndBlockTracker({
      provider,
      blockTracker: provider._blockTracker,
    });
    this.#registerProvider();
  }

  #safelyStopProvider(provider: Provider | undefined) {
    setTimeout(() => {
      provider?.stop();
    }, 500);
  }

  async #verifyNetwork() {
    if (this.state.networkStatus !== NetworkStatus.Available) {
      await this.lookupNetwork();
    }
  }

  /**
   * Method to inilialize the provider,
   * Creates the provider and block tracker for the configured network,
   * using the provider to gather details about the network.
   *
   */
  async initializeProvider() {
    const { type, rpcTarget, chainId, ticker, nickname } =
      this.state.providerConfig;
    this.#configureProvider(type, rpcTarget, chainId, ticker, nickname);
    this.#registerProvider();
    await this.lookupNetwork();
  }

  async #getNetworkId(): Promise<NetworkId> {
    const possibleNetworkId = await new Promise<string>((resolve, reject) => {
      this.#ethQuery.sendAsync(
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

    assertNetworkId(possibleNetworkId);
    return possibleNetworkId;
  }

  /**
   * Refreshes the current network code.
   */
  async lookupNetwork() {
    if (!this.#ethQuery) {
      return;
    }
    const releaseLock = await this.#mutex.acquire();

    try {
      try {
        const networkId = await this.#getNetworkId();
        if (this.state.networkId === networkId) {
          return;
        }

        this.update((state) => {
          state.networkId = networkId;
          state.networkStatus = NetworkStatus.Available;
        });
      } catch (error) {
        const networkStatus =
          isErrorWithCode(error) && error.code !== errorCodes.rpc.internal
            ? NetworkStatus.Unavailable
            : NetworkStatus.Unknown;
        this.update((state) => {
          state.networkId = null;
          state.networkStatus = networkStatus;
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
  async setProviderType(type: NetworkType) {
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
    await this.#refreshNetwork();
  }

  /**
   * Convenience method to update provider RPC settings.
   *
   * @param networkConfigurationId - The unique id for the network configuration to set as the active provider.
   */
  async setActiveNetwork(networkConfigurationId: string) {
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

    await this.#refreshNetwork();
  }

  #getLatestBlock(): Promise<Block> {
    return new Promise((resolve, reject) => {
      this.#ethQuery.sendAsync(
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

    if (networkDetails.isEIP1559Compatible || !this.#ethQuery) {
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

  resetConnection() {
    const { type, rpcTarget, chainId, ticker, nickname } =
      this.state.providerConfig;
    this.#configureProvider(type, rpcTarget, chainId, ticker, nickname);
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
  async upsertNetworkConfiguration(
    { rpcUrl, chainId, ticker, nickname, rpcPrefs }: NetworkConfiguration,
    {
      setActive = false,
      referrer,
      source,
    }: { setActive?: boolean; referrer: string; source: string },
  ): Promise<string> {
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
      this.#trackMetaMetricsEvent({
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
      await this.setActiveNetwork(newNetworkConfigurationId);
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
