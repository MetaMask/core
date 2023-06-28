import { strict as assert } from 'assert';
import { createEventEmitterProxy } from '@metamask/swappable-obj-proxy';
import type { SwappableProxy } from '@metamask/swappable-obj-proxy';
import EthQuery from 'eth-query';
import {
  BaseControllerV2,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { v4 as random } from 'uuid';
import type { Patch } from 'immer';
import { errorCodes } from 'eth-rpc-errors';
import {
  BUILT_IN_NETWORKS,
  convertHexToDecimal,
  NetworksTicker,
  ChainId,
  InfuraNetworkType,
  NetworkType,
  isSafeChainId,
} from '@metamask/controller-utils';
import {
  Hex,
  assertIsStrictHexString,
  hasProperty,
  isPlainObject,
  isStrictHexString,
} from '@metamask/utils';
import { INFURA_BLOCKED_KEY, NetworkStatus } from './constants';
import { projectLogger, createModuleLogger } from './logger';
import {
  CustomNetworkClientConfiguration,
  InfuraNetworkClientConfiguration,
  NetworkClientConfiguration,
  NetworkClientType,
} from './types';
import type { BlockTracker, Provider } from './types';
import {
  AutoManagedNetworkClient,
  createAutoManagedNetworkClient,
  ProxyWithAccessibleTarget,
} from './create-auto-managed-network-client';

const log = createModuleLogger(projectLogger, 'NetworkController');

/**
 * @type ProviderConfig
 *
 * Configuration passed to web3-provider-engine
 * @property rpcUrl - RPC target URL.
 * @property type - Human-readable network name.
 * @property chainId - Network ID as per EIP-155.
 * @property ticker - Currency ticker.
 * @property nickname - Personalized network name.
 * @property id - Network Configuration Id.
 */
export type ProviderConfig = {
  rpcUrl?: string;
  type: NetworkType;
  chainId: Hex;
  ticker?: string;
  nickname?: string;
  rpcPrefs?: { blockExplorerUrl?: string };
  id?: NetworkConfigurationId;
};

export type Block = {
  baseFeePerGas?: string;
};

/**
 * Information about the network not held by any other part of state. Currently
 * only used to capture whether a network supports EIP-1559.
 */
export type NetworkDetails = {
  /**
   * EIPs supported by the network.
   */
  EIPS: {
    [eipNumber: number]: boolean;
  };
};

/**
 * Custom RPC network information
 *
 * @property rpcUrl - RPC target URL.
 * @property chainId - Network ID as per EIP-155
 * @property nickname - Personalized network name.
 * @property ticker - Currency ticker.
 * @property rpcPrefs - Personalized preferences.
 */
export type NetworkConfiguration = {
  rpcUrl: string;
  chainId: Hex;
  ticker: string;
  nickname?: string;
  rpcPrefs?: {
    blockExplorerUrl: string;
  };
};

/**
 * `Object.keys()` is intentionally generic: it returns the keys of an object,
 * but it cannot make guarantees about the contents of that object, so the type
 * of the keys is merely `string[]`. While this is technically accurate, it is
 * also unnecessary if we have an object that we own and whose contents are
 * known exactly.
 *
 * TODO: Move to @metamask/utils.
 *
 * @param object - The object.
 * @returns The keys of an object, typed according to the type of the object
 * itself.
 */
function knownKeysOf<K extends PropertyKey>(
  object: Partial<Record<K, any>>,
) {
  return Object.keys(object) as K[];
}

/**
 * Convert the given value into a valid network ID. The ID is accepted
 * as either a number, a decimal string, or a 0x-prefixed hex string.
 *
 * @param value - The network ID to convert, in an unknown format.
 * @returns A valid network ID (as a decimal string)
 * @throws If the given value cannot be safely parsed.
 */
function convertNetworkId(value: unknown): NetworkId {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return `${value}`;
  } else if (isStrictHexString(value)) {
    return `${convertHexToDecimal(value)}`;
  } else if (typeof value === 'string' && /^\d+$/u.test(value)) {
    return value as NetworkId;
  }
  throw new Error(`Cannot parse as a valid network ID: '${value}'`);
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
 * Returns whether the given argument is a type that our Infura middleware
 * recognizes.
 *
 * @param type - A type to compare.
 * @returns True or false, depending on whether the given type is one that our
 * Infura middleware recognizes.
 */
function isInfuraProviderType(type: string): type is InfuraNetworkType {
  return Object.keys(InfuraNetworkType).includes(type);
}

/**
 * Builds an identifier for an Infura network client, used to look it up in the
 * registry at some later point in time.
 *
 * @param infuraNetworkName - The name of the Infura network.
 * @returns The built identifier.
 */
function buildInfuraNetworkClientId(
  infuraNetworkName: InfuraNetworkType,
): InfuraNetworkClientId {
  return `infura||${infuraNetworkName}` as const;
}

/**
 * Builds an identifier for a custom network client, used to look it up in the
 * registry at some later point in time.
 *
 * @param networkConfigurationId - The ID of the network configuration for the
 * network.
 * @param chainId - The chain ID of the network.
 * @param rpcUrl - The RPC URL of the network.
 * @returns The built identifier.
 */
function buildCustomNetworkClientId(
  networkConfigurationId: NetworkConfigurationId | undefined,
  chainId?: Hex,
  rpcUrl?: string | undefined,
): CustomNetworkClientId {
  if (networkConfigurationId === undefined) {
    if (chainId === undefined) {
      throw new Error('Missing chainId (this should never happen)');
    }
    if (rpcUrl === undefined) {
      return `custom||${chainId}` as const;
    }
    return `custom||${chainId}||${rpcUrl.toLowerCase()}` as const;
  }
  return `custom||${networkConfigurationId}` as const;
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

const name = 'NetworkController';

/**
 * Represents the block tracker for the currently selected network. (Note that
 * this is a proxy around a proxy: the inner one exists so that the block
 * tracker doesn't have to exist until it's used, and the outer one exists so
 * that the currently selected network can change without consumers needing to
 * refresh the object reference to that network.)
 */
export type BlockTrackerProxy = SwappableProxy<
  ProxyWithAccessibleTarget<BlockTracker>
>;

/**
 * Represents the provider for the currently selected network. (Note that this
 * is a proxy around a proxy: the inner one exists so that the provider doesn't
 * have to exist until it's used, and the outer one exists so that the currently
 * selected network can change without consumers needing to refresh the object
 * reference to that network.)
 */
export type ProviderProxy = SwappableProxy<ProxyWithAccessibleTarget<Provider>>;

export type NetworkControllerStateChangeEvent = {
  type: `NetworkController:stateChange`;
  payload: [NetworkState, Patch[]];
};

/**
 * `networkWillChange` is published when the current network is about to be
 * switched, but the new provider has not been created and no state changes have
 * occurred yet.
 */
export type NetworkControllerNetworkWillChangeEvent = {
  type: 'NetworkController:networkWillChange';
  payload: [];
};

/**
 * `networkDidChange` is published after a provider has been created for a newly
 * switched network (but before the network has been confirmed to be available).
 */
export type NetworkControllerNetworkDidChangeEvent = {
  type: 'NetworkController:networkDidChange';
  payload: [];
};

/**
 * `infuraIsBlocked` is published after the network is switched to an Infura
 * network, but when Infura returns an error blocking the user based on their
 * location.
 */
export type NetworkControllerInfuraIsBlockedEvent = {
  type: 'NetworkController:infuraIsBlocked';
  payload: [];
};

/**
 * `infuraIsBlocked` is published either after the network is switched to an
 * Infura network and Infura does not return an error blocking the user based on
 * their location, or the network is switched to a non-Infura network.
 */
export type NetworkControllerInfuraIsUnblockedEvent = {
  type: 'NetworkController:infuraIsUnblocked';
  payload: [];
};

export type NetworkControllerEvents =
  | NetworkControllerStateChangeEvent
  | NetworkControllerNetworkWillChangeEvent
  | NetworkControllerNetworkDidChangeEvent
  | NetworkControllerInfuraIsBlockedEvent
  | NetworkControllerInfuraIsUnblockedEvent;

export type NetworkControllerGetStateAction = {
  type: `NetworkController:getState`;
  handler: () => NetworkState;
};

export type NetworkControllerGetProviderConfigAction = {
  type: `NetworkController:getProviderConfig`;
  handler: () => ProviderConfig;
};

export type NetworkControllerGetEthQueryAction = {
  type: `NetworkController:getEthQuery`;
  handler: () => EthQuery | undefined;
};

export type NetworkControllerActions =
  | NetworkControllerGetStateAction
  | NetworkControllerGetProviderConfigAction
  | NetworkControllerGetEthQueryAction;

export type NetworkControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  NetworkControllerActions,
  NetworkControllerEvents,
  string,
  string
>;

export type NetworkControllerOptions = {
  messenger: NetworkControllerMessenger;
  trackMetaMetricsEvent: () => void;
  infuraProjectId: string;
  state?: Partial<NetworkState>;
};

export const defaultState: NetworkState = {
  networkId: null,
  networkStatus: NetworkStatus.Unknown,
  providerConfig: {
    type: NetworkType.mainnet,
    chainId: ChainId.mainnet,
  },
  networkDetails: {
    EIPS: {},
  },
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
 * The string that uniquely identifies an Infura network client.
 */
type InfuraNetworkClientId = `infura||${InfuraNetworkType}`;

/**
 * The string that uniquely identifies a custom network client.
 */
type CustomNetworkClientId = `custom||${string}`;

/**
 * The collection of auto-managed network clients that map to Infura networks.
 */
type AutoManagedInfuraNetworkClientRegistry = Record<
  InfuraNetworkClientId,
  AutoManagedNetworkClient<InfuraNetworkClientConfiguration>
>;

/**
 * The collection of auto-managed network clients that map to Infura networks.
 */
type AutoManagedCustomNetworkClientRegistry = Record<
  CustomNetworkClientId,
  AutoManagedNetworkClient<CustomNetworkClientConfiguration>
>;

/**
 * The collection of auto-managed network clients that map to Infura networks
 * as well as custom networks that users have added.
 */
type AutoManagedNetworkClientRegistry = {
  [NetworkClientType.Infura]: AutoManagedInfuraNetworkClientRegistry;
  [NetworkClientType.Custom]: AutoManagedCustomNetworkClientRegistry;
};

/**
 * Controller that creates and manages an Ethereum network provider.
 */
export class NetworkController extends BaseControllerV2<
  typeof name,
  NetworkState,
  NetworkControllerMessenger
> {
  #ethQuery?: EthQuery;

  #infuraProjectId: string;

  #trackMetaMetricsEvent: (event: MetaMetricsEventPayload) => void;

  #previousProviderConfig: ProviderConfig;

  #providerProxy: ProviderProxy | undefined;

  #provider: ProxyWithAccessibleTarget<Provider> | undefined;

  #blockTrackerProxy: BlockTrackerProxy | undefined;

  #autoManagedNetworkClientRegistry?: AutoManagedNetworkClientRegistry;

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
    if (!infuraProjectId || typeof infuraProjectId !== 'string') {
      throw new Error('Invalid Infura project ID');
    }
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

    this.#previousProviderConfig = this.state.providerConfig;
  }

  /**
   * Accesses the provider and block tracker for the currently selected network.
   *
   * @returns The proxy and block tracker proxies.
   */
  getProviderAndBlockTracker(): {
    provider: SwappableProxy<ProxyWithAccessibleTarget<Provider>> | undefined;
    blockTracker:
      | SwappableProxy<ProxyWithAccessibleTarget<BlockTracker>>
      | undefined;
  } {
    return {
      provider: this.#providerProxy,
      blockTracker: this.#blockTrackerProxy,
    };
  }

  /**
   * Returns all of the network clients that have been created so far. This
   * collection represents not only Infura networks but also any networks that
   * the user has added.
   *
   * @returns The list of known network clients.
   */
  getNetworkClients(): AutoManagedNetworkClient<NetworkClientConfiguration>[] {
    const autoManagedNetworkClientRegistry =
      this.#ensureAutoManagedNetworkClientRegistryPopulated();

    return [
      ...Object.values(
        autoManagedNetworkClientRegistry[NetworkClientType.Infura],
      ),
      ...Object.values(
        autoManagedNetworkClientRegistry[NetworkClientType.Custom],
      ),
    ];
  }

  /**
   * Executes a series of steps to apply the changes to the provider config:
   *
   * 1. Notifies subscribers that the network is about to change.
   * 2. Clears state associated with the current network.
   * 3. Looks up a known and preinitialized network client matching the provider
   * config and re-points the provider and block tracker proxy to it.
   * 4. Notifies subscribers that the network has changed.
   */
  async #refreshNetwork() {
    this.messagingSystem.publish('NetworkController:networkWillChange');
    this.update((state) => {
      state.networkId = null;
      state.networkStatus = NetworkStatus.Unknown;
      state.networkDetails = {
        EIPS: {},
      };
    });
    this.#applyNetworkSelection();
    this.messagingSystem.publish('NetworkController:networkDidChange');
    await this.lookupNetwork();
  }

  /**
   * Populates the network clients and establishes the initial network based on
   * the provider configuration in state.
   */
  async initializeProvider() {
    this.#ensureAutoManagedNetworkClientRegistryPopulated();

    this.#applyNetworkSelection();
    await this.lookupNetwork();
  }

  /**
   * Fetches the network ID for the network, ensuring that it is a hex string.
   *
   * @returns A promise that either resolves to the network ID, or rejects with
   * an error.
   * @throws If the network ID of the network is not a valid hex string.
   */
  async #getNetworkId(): Promise<NetworkId> {
    const possibleNetworkId = await new Promise<string>((resolve, reject) => {
      if (!this.#ethQuery) {
        throw new Error('Provider has not been initialized');
      }

      this.#ethQuery.sendAsync(
        { method: 'net_version' },
        (error: unknown, result?: unknown) => {
          if (error) {
            reject(error);
          } else {
            // TODO: Validate this type
            resolve(result as string);
          }
        },
      );
    });

    return convertNetworkId(possibleNetworkId);
  }

  /**
   * Performs side effects after switching to a network. If the network is
   * available, updates the network state with the network ID of the network and
   * stores whether the network supports EIP-1559; otherwise clears said
   * information about the network that may have been previously stored.
   *
   * @fires infuraIsBlocked if the network is Infura-supported and is blocking
   * requests.
   * @fires infuraIsUnblocked if the network is Infura-supported and is not
   * blocking requests, or if the network is not Infura-supported.
   */
  async lookupNetwork() {
    if (!this.#ethQuery) {
      return;
    }

    const isInfura = isInfuraProviderType(this.state.providerConfig.type);

    let networkChanged = false;
    const listener = () => {
      networkChanged = true;
      this.messagingSystem.unsubscribe(
        'NetworkController:networkDidChange',
        listener,
      );
    };
    this.messagingSystem.subscribe(
      'NetworkController:networkDidChange',
      listener,
    );

    let updatedNetworkStatus: NetworkStatus;
    let updatedNetworkId: NetworkId | null = null;
    let updatedIsEIP1559Compatible: boolean | undefined;

    try {
      const [networkId, isEIP1559Compatible] = await Promise.all([
        this.#getNetworkId(),
        this.#determineEIP1559Compatibility(),
      ]);
      updatedNetworkStatus = NetworkStatus.Available;
      updatedNetworkId = networkId;
      updatedIsEIP1559Compatible = isEIP1559Compatible;
    } catch (error) {
      if (isErrorWithCode(error)) {
        let responseBody;
        if (
          isInfura &&
          hasProperty(error, 'message') &&
          typeof error.message === 'string'
        ) {
          try {
            responseBody = JSON.parse(error.message);
          } catch {
            // error.message must not be JSON
          }
        }

        if (
          isPlainObject(responseBody) &&
          responseBody.error === INFURA_BLOCKED_KEY
        ) {
          updatedNetworkStatus = NetworkStatus.Blocked;
        } else if (error.code === errorCodes.rpc.internal) {
          updatedNetworkStatus = NetworkStatus.Unknown;
        } else {
          updatedNetworkStatus = NetworkStatus.Unavailable;
        }
      } else {
        log('NetworkController - could not determine network status', error);
        updatedNetworkStatus = NetworkStatus.Unknown;
      }
    }

    if (networkChanged) {
      // If the network has changed, then `lookupNetwork` either has been or is
      // in the process of being called, so we don't need to go further.
      return;
    }
    this.messagingSystem.unsubscribe(
      'NetworkController:networkDidChange',
      listener,
    );

    this.update((state) => {
      state.networkId = updatedNetworkId;
      state.networkStatus = updatedNetworkStatus;
      if (updatedIsEIP1559Compatible === undefined) {
        delete state.networkDetails.EIPS[1559];
      } else {
        state.networkDetails.EIPS[1559] = updatedIsEIP1559Compatible;
      }
    });

    if (isInfura) {
      if (updatedNetworkStatus === NetworkStatus.Available) {
        this.messagingSystem.publish('NetworkController:infuraIsUnblocked');
      } else if (updatedNetworkStatus === NetworkStatus.Blocked) {
        this.messagingSystem.publish('NetworkController:infuraIsBlocked');
      }
    } else {
      // Always publish infuraIsUnblocked regardless of network status to
      // prevent consumers from being stuck in a blocked state if they were
      // previously connected to an Infura network that was blocked
      this.messagingSystem.publish('NetworkController:infuraIsUnblocked');
    }
  }

  /**
   * Convenience method to update provider network type settings.
   *
   * @param type - Human readable network name.
   */
  async setProviderType(type: InfuraNetworkType) {
    assert.notStrictEqual(
      type,
      NetworkType.rpc,
      `NetworkController - cannot call "setProviderType" with type "${NetworkType.rpc}". Use "setActiveNetwork"`,
    );
    assert.ok(
      isInfuraProviderType(type),
      `Unknown Infura provider type "${type}".`,
    );

    this.#previousProviderConfig = this.state.providerConfig;

    // If testnet the ticker symbol should use a testnet prefix
    const ticker =
      type in NetworksTicker && NetworksTicker[type].length > 0
        ? NetworksTicker[type]
        : 'ETH';

    this.#ensureAutoManagedNetworkClientRegistryPopulated();

    this.update((state) => {
      state.providerConfig.type = type;
      state.providerConfig.ticker = ticker;
      state.providerConfig.chainId = ChainId[type];
      state.providerConfig.rpcPrefs = BUILT_IN_NETWORKS[type].rpcPrefs;
      state.providerConfig.rpcUrl = undefined;
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
    this.#previousProviderConfig = this.state.providerConfig;

    const targetNetwork =
      this.state.networkConfigurations[networkConfigurationId];

    if (!targetNetwork) {
      throw new Error(
        `networkConfigurationId ${networkConfigurationId} does not match a configured networkConfiguration`,
      );
    }

    this.#ensureAutoManagedNetworkClientRegistryPopulated();

    this.update((state) => {
      state.providerConfig.type = NetworkType.rpc;
      state.providerConfig.rpcUrl = targetNetwork.rpcUrl;
      state.providerConfig.chainId = targetNetwork.chainId;
      state.providerConfig.ticker = targetNetwork.ticker;
      state.providerConfig.nickname = targetNetwork.nickname;
      state.providerConfig.rpcPrefs = targetNetwork.rpcPrefs;
      state.providerConfig.id = targetNetwork.id;
    });

    await this.#refreshNetwork();
  }

  /**
   * Fetches the latest block for the network.
   *
   * @returns A promise that either resolves to the block header or null if
   * there is no latest block, or rejects with an error.
   */
  #getLatestBlock(): Promise<Block> {
    return new Promise((resolve, reject) => {
      if (!this.#ethQuery) {
        throw new Error('Provider has not been initialized');
      }

      this.#ethQuery.sendAsync(
        { method: 'eth_getBlockByNumber', params: ['latest', false] },
        (error: unknown, block?: unknown) => {
          if (error) {
            reject(error);
          } else {
            // TODO: Validate this type
            resolve(block as Block);
          }
        },
      );
    });
  }

  /**
   * Determines whether the network supports EIP-1559 by checking whether the
   * latest block has a `baseFeePerGas` property, then updates state
   * appropriately.
   *
   * @returns A promise that resolves to true if the network supports EIP-1559
   * and false otherwise.
   */
  async getEIP1559Compatibility() {
    const { EIPS } = this.state.networkDetails;

    if (EIPS[1559] !== undefined) {
      return EIPS[1559];
    }

    if (!this.#ethQuery) {
      return false;
    }

    const isEIP1559Compatible = await this.#determineEIP1559Compatibility();
    this.update((state) => {
      state.networkDetails.EIPS[1559] = isEIP1559Compatible;
    });
    return isEIP1559Compatible;
  }

  /**
   * Retrieves the latest block from the currently selected network; if the
   * block has a `baseFeePerGas` property, then we know that the network
   * supports EIP-1559; otherwise it doesn't.
   *
   * @returns A promise that resolves to true if the network supports EIP-1559
   * and false otherwise.
   */
  async #determineEIP1559Compatibility(): Promise<boolean> {
    const latestBlock = await this.#getLatestBlock();
    return latestBlock?.baseFeePerGas !== undefined;
  }

  /**
   * Re-initializes the provider and block tracker for the current network.
   */
  async resetConnection() {
    this.#ensureAutoManagedNetworkClientRegistryPopulated();
    await this.#refreshNetwork();
  }

  /**
   * Adds a new custom network or updates the information for an existing
   * network.
   *
   * This may involve updating the `networkConfigurations` property in
   * state as well and/or adding a new network client to the network client
   * registry. The `rpcUrl` and `chainId` of the given object are used to
   * determine which action to take:
   *
   * - If the `rpcUrl` corresponds to an existing network configuration
   * (case-insensitively), then it is overwritten with the object. Furthermore,
   * if the `chainId` is different from the existing network configuration, then
   * the existing network client is replaced with a new one.
   * - If the `rpcUrl` does not correspond to an existing network configuration
   * (case-insensitively), then the object is used to add a new network
   * configuration along with a new network client.
   *
   * @param networkConfiguration - The network configuration to add or update.
   * @param options - Additional configuration options.
   * @param options.referrer - Used to create a metrics event; the site from which the call originated, or 'metamask' for internal calls.
   * @param options.source - Used to create a metrics event; where the event originated (i.e. from a dapp or from the network form).
   * @param options.setActive - If true, switches to the network upon adding or updating it (default: false).
   * @returns The ID for the added or updated network configuration.
   */
  async upsertNetworkConfiguration(
    networkConfiguration: NetworkConfiguration,
    {
      referrer,
      source,
      setActive = false,
    }: {
      referrer: string;
      source: string;
      setActive?: boolean;
    },
  ): Promise<string> {
    const sanitizedNetworkConfiguration = (
      ['rpcUrl', 'chainId', 'ticker', 'nickname', 'rpcPrefs'] as const
    ).reduce((obj, key) => {
      if (key in networkConfiguration) {
        return { ...obj, [key]: networkConfiguration[key] };
      }
      return obj;
    }, {} as NetworkConfiguration);
    const { rpcUrl, chainId, ticker } = sanitizedNetworkConfiguration;

    assertIsStrictHexString(chainId);
    if (!isSafeChainId(chainId)) {
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

    const autoManagedNetworkClientRegistry =
      this.#ensureAutoManagedNetworkClientRegistryPopulated();

    const existingNetworkConfiguration = Object.values(
      this.state.networkConfigurations,
    ).find(
      (networkConfiguration) =>
        networkConfiguration.rpcUrl.toLowerCase() === rpcUrl.toLowerCase(),
    );
    const upsertedNetworkConfigurationId = existingNetworkConfiguration
      ? existingNetworkConfiguration.id
      : random();
    const networkClientId = buildCustomNetworkClientId(
      upsertedNetworkConfigurationId,
    );

    this.update((state) => {
      state.networkConfigurations[upsertedNetworkConfigurationId] = {
        id: upsertedNetworkConfigurationId,
        ...sanitizedNetworkConfiguration,
      };
    });

    const customNetworkClientRegistry =
      autoManagedNetworkClientRegistry[NetworkClientType.Custom];
    const existingAutoManagedNetworkClient =
      customNetworkClientRegistry[networkClientId];
    const shouldDestroyExistingNetworkClient =
      existingAutoManagedNetworkClient &&
      existingAutoManagedNetworkClient.configuration.chainId !== chainId;
    if (shouldDestroyExistingNetworkClient) {
      existingAutoManagedNetworkClient.destroy();
    }
    if (
      !existingAutoManagedNetworkClient ||
      shouldDestroyExistingNetworkClient
    ) {
      customNetworkClientRegistry[networkClientId] =
        createAutoManagedNetworkClient({
          type: NetworkClientType.Custom,
          chainId,
          rpcUrl,
        });
    }

    if (!existingNetworkConfiguration) {
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
      await this.setActiveNetwork(upsertedNetworkConfigurationId);
    }

    return upsertedNetworkConfigurationId;
  }

  /**
   * Removes a custom network from state.
   *
   * This involves updating the `networkConfigurations` property in state as
   * well and removing the network client that corresponds to the network from
   * the client registry.
   *
   * @param networkConfigurationId - The ID of an existing network
   * configuration.
   */
  removeNetworkConfiguration(networkConfigurationId: string) {
    if (!this.state.networkConfigurations[networkConfigurationId]) {
      throw new Error(
        `networkConfigurationId ${networkConfigurationId} does not match a configured networkConfiguration`,
      );
    }

    const autoManagedNetworkClientRegistry =
      this.#ensureAutoManagedNetworkClientRegistryPopulated();
    const networkClientId = buildCustomNetworkClientId(networkConfigurationId);

    this.update((state) => {
      delete state.networkConfigurations[networkConfigurationId];
    });

    const customNetworkClientRegistry =
      autoManagedNetworkClientRegistry[NetworkClientType.Custom];
    const existingAutoManagedNetworkClient =
      customNetworkClientRegistry[networkClientId];
    existingAutoManagedNetworkClient.destroy();
    delete customNetworkClientRegistry[networkClientId];
  }

  /**
   * Switches to the previously selected network, assuming that there is one
   * (if not and `initializeProvider` has not been previously called, then this
   * method is equivalent to calling `resetConnection`).
   */
  async rollbackToPreviousProvider() {
    this.#ensureAutoManagedNetworkClientRegistryPopulated();

    this.update((state) => {
      state.providerConfig = this.#previousProviderConfig;
    });

    await this.#refreshNetwork();
  }

  /**
   * Deactivates the controller, stopping any ongoing polling.
   *
   * In-progress requests will not be aborted.
   */
  async destroy() {
    await this.#blockTrackerProxy?.destroy();
  }

  /**
   * Updates the controller using the given backup data.
   *
   * @param backup - The data that has been backed up.
   * @param backup.networkConfigurations - Network configurations in the backup.
   */
  loadBackup({
    networkConfigurations,
  }: {
    networkConfigurations: NetworkState['networkConfigurations'];
  }): void {
    this.update((state) => {
      state.networkConfigurations = {
        ...state.networkConfigurations,
        ...networkConfigurations,
      };
    });
  }

  /**
   * Before accessing or switching the network, the registry of network clients
   * needs to be populated. Otherwise, `#applyNetworkSelection` and
   * `getNetworkClients` will throw an error. This method checks to see if the
   * population step has happened yet, and if not, makes it happen.
   *
   * @returns The populated network client registry.
   */
  #ensureAutoManagedNetworkClientRegistryPopulated(): AutoManagedNetworkClientRegistry {
    const autoManagedNetworkClientRegistry =
      this.#autoManagedNetworkClientRegistry ??
      this.#createAutoManagedNetworkClientRegistry();
    this.#autoManagedNetworkClientRegistry = autoManagedNetworkClientRegistry;
    return autoManagedNetworkClientRegistry;
  }

  /**
   * Constructs the registry of network clients based on the set of Infura
   * networks as well as the custom networks in state.
   *
   * @returns The network clients keyed by ID.
   */
  #createAutoManagedNetworkClientRegistry() {
    const infuraNetworkClientRegistry =
      this.#buildIdentifiedInfuraNetworkClientConfigurations().reduce(
        (obj, [networkClientId, networkClientConfiguration]) => {
          const autoManagedNetworkClient = createAutoManagedNetworkClient(
            networkClientConfiguration,
          );
          return { ...obj, [networkClientId]: autoManagedNetworkClient };
        },
        {} as AutoManagedInfuraNetworkClientRegistry,
      );

    const customNetworkClientRegistry =
      this.#buildIdentifiedCustomNetworkClientConfigurations().reduce(
        (obj, [networkClientId, networkClientConfiguration]) => {
          const autoManagedNetworkClient = createAutoManagedNetworkClient(
            networkClientConfiguration,
          );
          return { ...obj, [networkClientId]: autoManagedNetworkClient };
        },
        {} as AutoManagedCustomNetworkClientRegistry,
      );

    const [networkClientType, networkClientId, networkClientConfiguration] =
      this.#buildIdentifiedNetworkClientConfigurationFromProviderConfig();

    if (networkClientType === NetworkClientType.Infura) {
      infuraNetworkClientRegistry[networkClientId] =
        createAutoManagedNetworkClient(networkClientConfiguration);
    } else {
      customNetworkClientRegistry[networkClientId] =
        createAutoManagedNetworkClient(networkClientConfiguration);
    }

    return {
      [NetworkClientType.Infura]: infuraNetworkClientRegistry,
      [NetworkClientType.Custom]: customNetworkClientRegistry,
    };
  }

  /**
   * Constructs the list of network clients for Infura networks (that is,
   * those that we know Infura supports).
   *
   * @returns The network clients.
   */
  #buildIdentifiedInfuraNetworkClientConfigurations(): [
    string,
    InfuraNetworkClientConfiguration,
  ][] {
    return knownKeysOf(InfuraNetworkType).map((network) => {
      const networkClientId = buildInfuraNetworkClientId(network);
      const networkClientConfiguration: InfuraNetworkClientConfiguration = {
        type: NetworkClientType.Infura,
        network,
        infuraProjectId: this.#infuraProjectId,
      };
      return [networkClientId, networkClientConfiguration];
    });
  }

  /**
   * Constructs the list of network clients for custom networks (that is, those
   * that have been added to `networkConfigurations` in state).
   *
   * @returns The network clients.
   */
  #buildIdentifiedCustomNetworkClientConfigurations(): [
    string,
    CustomNetworkClientConfiguration,
  ][] {
    return Object.entries(this.state.networkConfigurations).map(
      ([networkConfigurationId, networkConfiguration]) => {
        if (networkConfiguration.chainId === undefined) {
          throw new Error('chainId must be provided for custom RPC endpoints');
        }
        if (networkConfiguration.rpcUrl === undefined) {
          throw new Error('rpcUrl must be provided for custom RPC endpoints');
        }
        const networkClientId = buildCustomNetworkClientId(
          networkConfigurationId,
        );
        const networkClientConfiguration: CustomNetworkClientConfiguration = {
          type: NetworkClientType.Custom,
          chainId: networkConfiguration.chainId,
          rpcUrl: networkConfiguration.rpcUrl,
        };
        return [networkClientId, networkClientConfiguration];
      },
    );
  }

  /**
   * Converts the provider config object in state to a network client
   * configuration object.
   *
   * @returns The network client config.
   * @throws If the provider config is of type "rpc" and lacks either a
   * `chainId` or an `rpcUrl`.
   */
  #buildIdentifiedNetworkClientConfigurationFromProviderConfig():
    | [
        NetworkClientType.Custom,
        CustomNetworkClientId,
        CustomNetworkClientConfiguration,
      ]
    | [
        NetworkClientType.Infura,
        InfuraNetworkClientId,
        InfuraNetworkClientConfiguration,
      ] {
    const { providerConfig } = this.state;

    if (providerConfig.type === NetworkType.rpc) {
      if (providerConfig.chainId === undefined) {
        throw new Error('chainId must be provided for custom RPC endpoints');
      }
      if (providerConfig.rpcUrl === undefined) {
        throw new Error('rpcUrl must be provided for custom RPC endpoints');
      }
      const networkClientId = buildCustomNetworkClientId(
        providerConfig.id,
        providerConfig.chainId,
        providerConfig.rpcUrl,
      );
      const networkClientConfiguration: CustomNetworkClientConfiguration = {
        chainId: providerConfig.chainId,
        rpcUrl: providerConfig.rpcUrl,
        type: NetworkClientType.Custom,
      };
      return [
        NetworkClientType.Custom,
        networkClientId,
        networkClientConfiguration,
      ];
    }

    if (isInfuraProviderType(providerConfig.type)) {
      const networkClientId = buildInfuraNetworkClientId(providerConfig.type);
      const networkClientConfiguration: InfuraNetworkClientConfiguration = {
        network: providerConfig.type,
        infuraProjectId: this.#infuraProjectId,
        type: NetworkClientType.Infura,
      };
      return [
        NetworkClientType.Infura,
        networkClientId,
        networkClientConfiguration,
      ];
    }

    throw new Error(`Unrecognized network type: '${providerConfig.type}'`);
  }

  /**
   * Uses the information in the provider config object to look up a known and
   * preinitialized network client. Once a network client is found, updates the
   * provider and block tracker proxy to point to those from the network client,
   * then finally creates an EthQuery that points to the provider proxy.
   *
   * @throws If no network client could be found matching the current provider
   * config.
   */
  #applyNetworkSelection() {
    if (!this.#autoManagedNetworkClientRegistry) {
      throw new Error(
        'initializeProvider must be called first in order to switch the network',
      );
    }

    const { providerConfig } = this.state;

    if (
      providerConfig.type === NetworkType.rpc &&
      providerConfig.id === undefined
    ) {
      if (providerConfig.chainId === undefined) {
        throw new Error('chainId must be provided for custom RPC endpoints');
      }
      if (providerConfig.rpcUrl === undefined) {
        throw new Error('rpcUrl must be provided for custom RPC endpoints');
      }
    }

    let autoManagedNetworkClient: AutoManagedNetworkClient<NetworkClientConfiguration>;

    if (providerConfig.type === NetworkType.rpc) {
      const networkClientType = NetworkClientType.Custom;
      const networkClientId = buildCustomNetworkClientId(
        providerConfig.id,
        providerConfig.chainId,
        providerConfig.rpcUrl,
      );
      const customNetworkClientRegistry =
        this.#autoManagedNetworkClientRegistry[networkClientType];
      autoManagedNetworkClient = customNetworkClientRegistry[networkClientId];
      if (!autoManagedNetworkClient) {
        throw new Error(
          `Could not find Infura network matching ${networkClientId}`,
        );
      }
    } else {
      const networkClientType = NetworkClientType.Infura;
      const networkClientId = buildInfuraNetworkClientId(providerConfig.type);
      const infuraNetworkClientRegistry =
        this.#autoManagedNetworkClientRegistry[networkClientType];
      autoManagedNetworkClient = infuraNetworkClientRegistry[networkClientId];
      if (!autoManagedNetworkClient) {
        throw new Error(
          `Could not find custom network matching ${networkClientId}`,
        );
      }
    }

    const { provider, blockTracker } = autoManagedNetworkClient;

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

    this.#ethQuery = new EthQuery(this.#providerProxy);
  }
}
