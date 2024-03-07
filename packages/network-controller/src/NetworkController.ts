import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import {
  BUILT_IN_NETWORKS,
  NetworksTicker,
  ChainId,
  InfuraNetworkType,
  NetworkType,
  isSafeChainId,
  isInfuraNetworkType,
} from '@metamask/controller-utils';
import EthQuery from '@metamask/eth-query';
import { errorCodes } from '@metamask/rpc-errors';
import { createEventEmitterProxy } from '@metamask/swappable-obj-proxy';
import type { SwappableProxy } from '@metamask/swappable-obj-proxy';
import type { Hex } from '@metamask/utils';
import {
  assertIsStrictHexString,
  hasProperty,
  isPlainObject,
} from '@metamask/utils';
import { strict as assert } from 'assert';
import { v4 as random } from 'uuid';

import { INFURA_BLOCKED_KEY, NetworkStatus } from './constants';
import type {
  AutoManagedNetworkClient,
  ProxyWithAccessibleTarget,
} from './create-auto-managed-network-client';
import { createAutoManagedNetworkClient } from './create-auto-managed-network-client';
import { projectLogger, createModuleLogger } from './logger';
import { NetworkClientType } from './types';
import type {
  BlockTracker,
  Provider,
  CustomNetworkClientConfiguration,
  InfuraNetworkClientConfiguration,
  NetworkClientConfiguration,
} from './types';

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
  ticker: string;
  nickname?: string;
  rpcPrefs?: { blockExplorerUrl?: string };
  id?: NetworkConfigurationId;
};

export type Block = {
  baseFeePerGas?: string;
};

/**
 * Information about a network not held by any other part of state.
 */
export type NetworkMetadata = {
  /**
   * EIPs supported by the network.
   */
  EIPS: {
    [eipNumber: number]: boolean;
  };
  /**
   * Indicates the availability of the network
   */
  status: NetworkStatus;
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
 * The collection of network configurations in state.
 */
type NetworkConfigurations = Record<
  NetworkConfigurationId,
  NetworkConfiguration & { id: NetworkConfigurationId }
>;

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
export function knownKeysOf<K extends PropertyKey>(
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  object: Partial<Record<K, any>>,
) {
  return Object.keys(object) as K[];
}

/**
 * Asserts that the given value is of the given type if the given validation
 * function returns a truthy result.
 *
 * @param value - The value to validate.
 * @param validate - A function used to validate that the value is of the given
 * type. Takes the `value` as an argument and is expected to return true or
 * false.
 * @param message - The message to throw if the function does not return a
 * truthy result.
 * @throws if the function does not return a truthy result.
 */
function assertOfType<Type>(
  value: unknown,
  validate: (value: unknown) => boolean,
  message: string,
): asserts value is Type {
  assert.ok(validate(value), message);
}

/**
 * Returns a portion of the given object with only the given keys.
 *
 * @param object - An object.
 * @param keys - The keys to pick from the object.
 * @returns the portion of the object.
 */
// TODO: Replace `any` with type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pick<Obj extends Record<any, any>, Keys extends keyof Obj>(
  object: Obj,
  keys: Keys[],
): Pick<Obj, Keys> {
  const pickedObject = keys.reduce<Partial<Pick<Obj, Keys>>>(
    (finalObject, key) => {
      return { ...finalObject, [key]: object[key] };
    },
    {},
  );
  assertOfType<Pick<Obj, Keys>>(
    pickedObject,
    () => keys.every((key) => key in pickedObject),
    'The reduce did not produce an object with all of the desired keys.',
  );
  return pickedObject;
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
 * Builds an identifier for an Infura network client for lookup purposes.
 *
 * @param infuraNetworkOrProviderConfig - The name of an Infura network or a
 * provider config.
 * @returns The built identifier.
 */
function buildInfuraNetworkClientId(
  infuraNetworkOrProviderConfig:
    | InfuraNetworkType
    | (ProviderConfig & { type: InfuraNetworkType }),
): BuiltInNetworkClientId {
  if (typeof infuraNetworkOrProviderConfig === 'string') {
    return infuraNetworkOrProviderConfig;
  }
  return infuraNetworkOrProviderConfig.type;
}

/**
 * Builds an identifier for a custom network client for lookup purposes.
 *
 * @param args - This function can be called two ways:
 * 1. The ID of a network configuration.
 * 2. A provider config and a set of network configurations.
 * @returns The built identifier.
 */
function buildCustomNetworkClientId(
  ...args:
    | [NetworkConfigurationId]
    | [
        ProviderConfig & { type: typeof NetworkType.rpc; rpcUrl: string },
        NetworkConfigurations,
      ]
): CustomNetworkClientId {
  if (args.length === 1) {
    return args[0];
  }
  const [{ id, rpcUrl }, networkConfigurations] = args;
  if (id === undefined) {
    const matchingNetworkConfiguration = Object.values(
      networkConfigurations,
    ).find((networkConfiguration) => {
      return networkConfiguration.rpcUrl === rpcUrl.toLowerCase();
    });
    if (matchingNetworkConfiguration) {
      return matchingNetworkConfiguration.id;
    }
    return rpcUrl.toLowerCase();
  }
  return id;
}

/**
 * Returns whether the given provider config refers to an Infura network.
 *
 * @param providerConfig - The provider config.
 * @returns True if the provider config refers to an Infura network, false
 * otherwise.
 */
function isInfuraProviderConfig(
  providerConfig: ProviderConfig,
): providerConfig is ProviderConfig & { type: InfuraNetworkType } {
  return isInfuraNetworkType(providerConfig.type);
}

/**
 * Returns whether the given provider config refers to an Infura network.
 *
 * @param providerConfig - The provider config.
 * @returns True if the provider config refers to an Infura network, false
 * otherwise.
 */
function isCustomProviderConfig(
  providerConfig: ProviderConfig,
): providerConfig is ProviderConfig & { type: typeof NetworkType.rpc } {
  return providerConfig.type === NetworkType.rpc;
}

/**
 * As a provider config represents the settings that are used to interface with
 * an RPC endpoint, it must have both a chain ID and an RPC URL if it represents
 * a custom network. These properties _should_ be set as they are validated in
 * the UI when a user adds a custom network, but just to be safe we validate
 * them here.
 *
 * In addition, historically the `rpcUrl` property on the ProviderConfig type
 * has been optional, even though it should not be. Making this non-optional
 * would be a breaking change, so this function types the provider config
 * correctly so that we don't have to check `rpcUrl` in other places.
 *
 * @param providerConfig - A provider config.
 * @throws if the provider config does not have a chain ID or an RPC URL.
 */
function validateCustomProviderConfig(
  providerConfig: ProviderConfig & { type: typeof NetworkType.rpc },
): asserts providerConfig is typeof providerConfig & { rpcUrl: string } {
  if (providerConfig.chainId === undefined) {
    throw new Error('chainId must be provided for custom RPC endpoints');
  }
  if (providerConfig.rpcUrl === undefined) {
    throw new Error('rpcUrl must be provided for custom RPC endpoints');
  }
}
/**
 * The string that uniquely identifies an Infura network client.
 */
type BuiltInNetworkClientId = InfuraNetworkType;

/**
 * The string that uniquely identifies a custom network client.
 */
type CustomNetworkClientId = string;

/**
 * The string that uniquely identifies a network client.
 */
export type NetworkClientId = BuiltInNetworkClientId | CustomNetworkClientId;

/**
 * Information about networks not held by any other part of state.
 */
export type NetworksMetadata = {
  [networkClientId: NetworkClientId]: NetworkMetadata;
};

/**
 * @type NetworkState
 *
 * Network controller state
 * @property providerConfig - RPC URL and network name provider settings of the currently connected network
 * @property properties - an additional set of network properties for the currently connected network
 * @property networkConfigurations - the full list of configured networks either preloaded or added by the user.
 */
export type NetworkState = {
  selectedNetworkClientId: NetworkClientId;
  providerConfig: ProviderConfig;
  networkConfigurations: NetworkConfigurations;
  networksMetadata: NetworksMetadata;
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

export type NetworkControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof name,
  NetworkState
>;

/**
 * `networkWillChange` is published when the current network is about to be
 * switched, but the new provider has not been created and no state changes have
 * occurred yet.
 */
export type NetworkControllerNetworkWillChangeEvent = {
  type: 'NetworkController:networkWillChange';
  payload: [NetworkState];
};

/**
 * `networkDidChange` is published after a provider has been created for a newly
 * switched network (but before the network has been confirmed to be available).
 */
export type NetworkControllerNetworkDidChangeEvent = {
  type: 'NetworkController:networkDidChange';
  payload: [NetworkState];
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

export type NetworkControllerGetStateAction = ControllerGetStateAction<
  typeof name,
  NetworkState
>;

export type NetworkControllerGetProviderConfigAction = {
  type: `NetworkController:getProviderConfig`;
  handler: () => ProviderConfig;
};

export type NetworkControllerGetEthQueryAction = {
  type: `NetworkController:getEthQuery`;
  handler: () => EthQuery | undefined;
};

export type NetworkControllerGetNetworkClientByIdAction = {
  type: `NetworkController:getNetworkClientById`;
  handler: NetworkController['getNetworkClientById'];
};

export type NetworkControllerGetEIP1559CompatibilityAction = {
  type: `NetworkController:getEIP1559Compatibility`;
  handler: NetworkController['getEIP1559Compatibility'];
};

export type NetworkControllerFindNetworkClientIdByChainIdAction = {
  type: `NetworkController:findNetworkClientIdByChainId`;
  handler: NetworkController['findNetworkClientIdByChainId'];
};

/**
 * Change the currently selected network to the given built-in network type.
 *
 * @deprecated This action has been replaced by `setActiveNetwork`, and will be
 * removed in a future release.
 */
export type NetworkControllerSetProviderTypeAction = {
  type: `NetworkController:setProviderType`;
  handler: NetworkController['setProviderType'];
};

export type NetworkControllerSetActiveNetworkAction = {
  type: `NetworkController:setActiveNetwork`;
  handler: NetworkController['setActiveNetwork'];
};

export type NetworkControllerGetNetworkConfigurationByNetworkClientId = {
  type: `NetworkController:getNetworkConfigurationByNetworkClientId`;
  handler: NetworkController['getNetworkConfigurationByNetworkClientId'];
};

export type NetworkControllerActions =
  | NetworkControllerGetStateAction
  | NetworkControllerGetProviderConfigAction
  | NetworkControllerGetEthQueryAction
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetEIP1559CompatibilityAction
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | NetworkControllerSetActiveNetworkAction
  | NetworkControllerSetProviderTypeAction
  | NetworkControllerGetNetworkConfigurationByNetworkClientId;

export type NetworkControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  NetworkControllerActions,
  NetworkControllerEvents,
  never,
  never
>;

export type NetworkControllerOptions = {
  messenger: NetworkControllerMessenger;
  trackMetaMetricsEvent: () => void;
  infuraProjectId: string;
  state?: Partial<NetworkState>;
};

export const defaultState: NetworkState = {
  selectedNetworkClientId: NetworkType.mainnet,
  providerConfig: {
    type: NetworkType.mainnet,
    chainId: ChainId.mainnet,
    ticker: NetworksTicker.mainnet,
  },
  networksMetadata: {},
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
 * The collection of auto-managed network clients that map to Infura networks.
 */
type AutoManagedBuiltInNetworkClientRegistry = Record<
  BuiltInNetworkClientId,
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
  [NetworkClientType.Infura]: AutoManagedBuiltInNetworkClientRegistry;
  [NetworkClientType.Custom]: AutoManagedCustomNetworkClientRegistry;
};

/**
 * Controller that creates and manages an Ethereum network provider.
 */
export class NetworkController extends BaseController<
  typeof name,
  NetworkState,
  NetworkControllerMessenger
> {
  #ethQuery?: EthQuery;

  #infuraProjectId: string;

  #trackMetaMetricsEvent: (event: MetaMetricsEventPayload) => void;

  #previousProviderConfig: ProviderConfig;

  #providerProxy: ProviderProxy | undefined;

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
        selectedNetworkClientId: {
          persist: true,
          anonymous: false,
        },
        networksMetadata: {
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

    this.messagingSystem.registerActionHandler(
      `${this.name}:getNetworkClientById`,
      this.getNetworkClientById.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${this.name}:getEIP1559Compatibility`,
      this.getEIP1559Compatibility.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${this.name}:setActiveNetwork`,
      this.setActiveNetwork.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${this.name}:setProviderType`,
      this.setProviderType.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${this.name}:findNetworkClientIdByChainId`,
      this.findNetworkClientIdByChainId.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${this.name}:getNetworkConfigurationByNetworkClientId`,
      this.getNetworkConfigurationByNetworkClientId.bind(this),
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
   * Returns all of the network clients that have been created so far, keyed by
   * their identifier in the network client registry. This collection represents
   * not only built-in networks but also any custom networks that consumers have
   * added.
   *
   * @returns The list of known network clients.
   */
  getNetworkClientRegistry(): AutoManagedBuiltInNetworkClientRegistry &
    AutoManagedCustomNetworkClientRegistry {
    const autoManagedNetworkClientRegistry =
      this.#ensureAutoManagedNetworkClientRegistryPopulated();

    return Object.assign(
      {},
      autoManagedNetworkClientRegistry[NetworkClientType.Infura],
      autoManagedNetworkClientRegistry[NetworkClientType.Custom],
    );
  }

  /**
   * Returns the Infura network client with the given ID.
   *
   * @param infuraNetworkClientId - An Infura network client ID.
   * @returns The Infura network client.
   * @throws If an Infura network client does not exist with the given ID.
   */
  getNetworkClientById(
    infuraNetworkClientId: BuiltInNetworkClientId,
  ): AutoManagedNetworkClient<InfuraNetworkClientConfiguration>;

  /**
   * Returns the custom network client with the given ID.
   *
   * @param customNetworkClientId - A custom network client ID.
   * @returns The custom network client.
   * @throws If a custom network client does not exist with the given ID.
   */
  getNetworkClientById(
    customNetworkClientId: CustomNetworkClientId,
  ): AutoManagedNetworkClient<CustomNetworkClientConfiguration>;

  getNetworkClientById(
    networkClientId: NetworkClientId,
  ): AutoManagedNetworkClient<NetworkClientConfiguration> {
    if (!networkClientId) {
      throw new Error('No network client ID was provided.');
    }

    const autoManagedNetworkClientRegistry =
      this.#ensureAutoManagedNetworkClientRegistryPopulated();

    if (isInfuraNetworkType(networkClientId)) {
      const infuraNetworkClient =
        autoManagedNetworkClientRegistry[NetworkClientType.Infura][
          networkClientId
        ];
      if (!infuraNetworkClient) {
        throw new Error(
          `No Infura network client was found with the ID "${networkClientId}".`,
        );
      }
      return infuraNetworkClient;
    }

    const customNetworkClient =
      autoManagedNetworkClientRegistry[NetworkClientType.Custom][
        networkClientId
      ];
    if (!customNetworkClient) {
      throw new Error(
        `No custom network client was found with the ID "${networkClientId}".`,
      );
    }
    return customNetworkClient;
  }

  /**
   * Executes a series of steps to apply the changes to the provider config:
   *
   * 1. Notifies subscribers that the network is about to change.
   * 2. Looks up a known and preinitialized network client matching the provider
   * config and re-points the provider and block tracker proxy to it.
   * 3. Notifies subscribers that the network has changed.
   */
  async #refreshNetwork() {
    this.messagingSystem.publish(
      'NetworkController:networkWillChange',
      this.state,
    );
    this.#applyNetworkSelection();
    this.messagingSystem.publish(
      'NetworkController:networkDidChange',
      this.state,
    );
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
   * Refreshes the network meta with EIP-1559 support and the network status
   * based on the given network client ID.
   *
   * @param networkClientId - The ID of the network client to update.
   */
  async lookupNetworkByClientId(networkClientId: NetworkClientId) {
    const isInfura = isInfuraNetworkType(networkClientId);
    let updatedNetworkStatus: NetworkStatus;
    let updatedIsEIP1559Compatible: boolean | undefined;

    try {
      updatedIsEIP1559Compatible = await this.#determineEIP1559Compatibility(
        networkClientId,
      );
      updatedNetworkStatus = NetworkStatus.Available;
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
      } else if (
        typeof Error !== 'undefined' &&
        hasProperty(error as unknown as Error, 'message') &&
        typeof (error as unknown as Error).message === 'string' &&
        (error as unknown as Error).message.includes(
          'No custom network client was found with the ID',
        )
      ) {
        throw error;
      } else {
        log('NetworkController - could not determine network status', error);
        updatedNetworkStatus = NetworkStatus.Unknown;
      }
    }
    this.update((state) => {
      if (state.networksMetadata[networkClientId] === undefined) {
        state.networksMetadata[networkClientId] = {
          status: NetworkStatus.Unknown,
          EIPS: {},
        };
      }
      const meta = state.networksMetadata[networkClientId];
      meta.status = updatedNetworkStatus;
      if (updatedIsEIP1559Compatible === undefined) {
        delete meta.EIPS[1559];
      } else {
        meta.EIPS[1559] = updatedIsEIP1559Compatible;
      }
    });
  }

  /**
   * Performs side effects after switching to a network. If the network is
   * available, updates the network state with the network ID of the network and
   * stores whether the network supports EIP-1559; otherwise clears said
   * information about the network that may have been previously stored.
   *
   * @param networkClientId - (Optional) The ID of the network client to update.
   * If no ID is provided, uses the currently selected network.
   * @fires infuraIsBlocked if the network is Infura-supported and is blocking
   * requests.
   * @fires infuraIsUnblocked if the network is Infura-supported and is not
   * blocking requests, or if the network is not Infura-supported.
   */
  async lookupNetwork(networkClientId?: NetworkClientId) {
    if (networkClientId) {
      await this.lookupNetworkByClientId(networkClientId);
      return;
    }

    if (!this.#ethQuery) {
      return;
    }

    const isInfura = isInfuraProviderConfig(this.state.providerConfig);

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
    let updatedIsEIP1559Compatible: boolean | undefined;

    try {
      const isEIP1559Compatible = await this.#determineEIP1559Compatibility(
        this.state.selectedNetworkClientId,
      );
      updatedNetworkStatus = NetworkStatus.Available;
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
      const meta = state.networksMetadata[state.selectedNetworkClientId];
      meta.status = updatedNetworkStatus;
      if (updatedIsEIP1559Compatible === undefined) {
        delete meta.EIPS[1559];
      } else {
        meta.EIPS[1559] = updatedIsEIP1559Compatible;
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
   * @deprecated This has been replaced by `setActiveNetwork`, and will be
   * removed in a future release
   */
  async setProviderType(type: InfuraNetworkType) {
    assert.notStrictEqual(
      type,
      NetworkType.rpc,
      `NetworkController - cannot call "setProviderType" with type "${NetworkType.rpc}". Use "setActiveNetwork"`,
    );
    assert.ok(
      isInfuraNetworkType(type),
      `Unknown Infura provider type "${type}".`,
    );

    await this.setActiveNetwork(type);
  }

  /**
   * Convenience method to update provider RPC settings.
   *
   * @param networkConfigurationIdOrType - The unique id for the network configuration to set as the active provider,
   * or the type of a built-in network.
   */
  async setActiveNetwork(networkConfigurationIdOrType: string) {
    this.#previousProviderConfig = this.state.providerConfig;

    let targetNetwork: ProviderConfig;
    if (isInfuraNetworkType(networkConfigurationIdOrType)) {
      const ticker = NetworksTicker[networkConfigurationIdOrType];

      targetNetwork = {
        chainId: ChainId[networkConfigurationIdOrType],
        id: undefined,
        rpcPrefs: BUILT_IN_NETWORKS[networkConfigurationIdOrType].rpcPrefs,
        rpcUrl: undefined,
        nickname: undefined,
        ticker,
        type: networkConfigurationIdOrType,
      };
    } else {
      if (
        !Object.keys(this.state.networkConfigurations).includes(
          networkConfigurationIdOrType,
        )
      ) {
        throw new Error(
          `networkConfigurationId ${networkConfigurationIdOrType} does not match a configured networkConfiguration or built-in network type`,
        );
      }
      targetNetwork = {
        ...this.state.networkConfigurations[networkConfigurationIdOrType],
        type: NetworkType.rpc,
      };
    }

    this.#ensureAutoManagedNetworkClientRegistryPopulated();

    this.update((state) => {
      state.providerConfig = targetNetwork;
    });

    await this.#refreshNetwork();
  }

  /**
   * Fetches the latest block for the network.
   *
   * @param networkClientId - The networkClientId to fetch the correct provider against which to check the latest block. Defaults to the selectedNetworkClientId.
   * @returns A promise that either resolves to the block header or null if
   * there is no latest block, or rejects with an error.
   */
  #getLatestBlock(networkClientId: NetworkClientId): Promise<Block> {
    if (networkClientId === undefined) {
      networkClientId = this.state.selectedNetworkClientId;
    }

    const networkClient = this.getNetworkClientById(networkClientId);
    const ethQuery = new EthQuery(networkClient.provider);

    return new Promise((resolve, reject) => {
      ethQuery.sendAsync(
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
   * @param networkClientId - The networkClientId to fetch the correct provider against which to check 1559 compatibility.
   * @returns A promise that resolves to true if the network supports EIP-1559
   * , false otherwise, or `undefined` if unable to determine the compatibility.
   */
  async getEIP1559Compatibility(networkClientId?: NetworkClientId) {
    if (networkClientId) {
      return this.get1559CompatibilityWithNetworkClientId(networkClientId);
    }
    if (!this.#ethQuery) {
      return false;
    }

    const { EIPS } =
      this.state.networksMetadata[this.state.selectedNetworkClientId];

    if (EIPS[1559] !== undefined) {
      return EIPS[1559];
    }

    const isEIP1559Compatible = await this.#determineEIP1559Compatibility(
      this.state.selectedNetworkClientId,
    );
    this.update((state) => {
      if (isEIP1559Compatible !== undefined) {
        state.networksMetadata[state.selectedNetworkClientId].EIPS[1559] =
          isEIP1559Compatible;
      }
    });
    return isEIP1559Compatible;
  }

  async get1559CompatibilityWithNetworkClientId(
    networkClientId: NetworkClientId,
  ) {
    let metadata = this.state.networksMetadata[networkClientId];
    if (metadata === undefined) {
      await this.lookupNetwork(networkClientId);
      metadata = this.state.networksMetadata[networkClientId];
    }
    const { EIPS } = metadata;

    // may want to include some 'freshness' value - something to make sure we refetch this from time to time
    return EIPS[1559];
  }

  /**
   * Retrieves and checks the latest block from the currently selected
   * network; if the block has a `baseFeePerGas` property, then we know
   * that the network supports EIP-1559; otherwise it doesn't.
   *
   * @param networkClientId - The networkClientId to fetch the correct provider against which to check 1559 compatibility
   * @returns A promise that resolves to `true` if the network supports EIP-1559,
   * `false` otherwise, or `undefined` if unable to retrieve the last block.
   */
  async #determineEIP1559Compatibility(
    networkClientId: NetworkClientId,
  ): Promise<boolean | undefined> {
    const latestBlock = await this.#getLatestBlock(networkClientId);

    if (!latestBlock) {
      return undefined;
    }

    return latestBlock.baseFeePerGas !== undefined;
  }

  /**
   * Re-initializes the provider and block tracker for the current network.
   */
  async resetConnection() {
    this.#ensureAutoManagedNetworkClientRegistryPopulated();
    await this.#refreshNetwork();
  }

  /**
   * Returns a configuration object for the network identified by the given
   * network client ID. If given an Infura network type, constructs one based on
   * what we know about the network; otherwise attempts locates a network
   * configuration in state that corresponds to the network client ID.
   *
   * @param networkClientId - The network client ID.
   * @returns The configuration for the referenced network if one exists, or
   * undefined otherwise.
   */
  getNetworkConfigurationByNetworkClientId(
    networkClientId: NetworkClientId,
  ): NetworkConfiguration | undefined {
    if (isInfuraNetworkType(networkClientId)) {
      const rpcUrl = `https://${networkClientId}.infura.io/v3/${
        this.#infuraProjectId
      }`;
      return {
        rpcUrl,
        ...BUILT_IN_NETWORKS[networkClientId],
      };
    }

    return this.state.networkConfigurations[networkClientId];
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
    const sanitizedNetworkConfiguration: NetworkConfiguration = pick(
      networkConfiguration,
      ['rpcUrl', 'chainId', 'ticker', 'nickname', 'rpcPrefs'],
    );
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
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      (networkConfig) =>
        networkConfig.rpcUrl.toLowerCase() === rpcUrl.toLowerCase(),
    );
    const upsertedNetworkConfigurationId = existingNetworkConfiguration
      ? existingNetworkConfiguration.id
      : random();
    const networkClientId = buildCustomNetworkClientId(
      upsertedNetworkConfigurationId,
    );

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
          ticker,
        });
    }

    this.update((state) => {
      state.networkConfigurations[upsertedNetworkConfigurationId] = {
        id: upsertedNetworkConfigurationId,
        ...sanitizedNetworkConfiguration,
      };
    });

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
   * Searches for a network configuration ID with the given ChainID and returns it.
   *
   * @param chainId - ChainId to search for
   * @returns networkClientId of the network configuration with the given chainId
   */
  findNetworkClientIdByChainId(chainId: Hex): NetworkClientId {
    const networkClients = this.getNetworkClientRegistry();
    const networkClientEntry = Object.entries(networkClients).find(
      ([_, networkClient]) => networkClient.configuration.chainId === chainId,
    );
    if (networkClientEntry === undefined) {
      throw new Error("Couldn't find networkClientId for chainId");
    }
    return networkClientEntry[0];
  }

  /**
   * Before accessing or switching the network, the registry of network clients
   * needs to be populated. Otherwise, `#applyNetworkSelection` and
   * `getNetworkClientRegistry` will throw an error. This method checks to see if the
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
   * Constructs the registry of network clients based on the set of built-in
   * networks as well as the custom networks in state.
   *
   * @returns The network clients keyed by ID.
   */
  #createAutoManagedNetworkClientRegistry(): AutoManagedNetworkClientRegistry {
    return [
      ...this.#buildIdentifiedInfuraNetworkClientConfigurations(),
      ...this.#buildIdentifiedCustomNetworkClientConfigurations(),
      ...this.#buildIdentifiedNetworkClientConfigurationsFromProviderConfig(),
    ].reduce(
      (
        registry,
        [networkClientType, networkClientId, networkClientConfiguration],
      ) => {
        const autoManagedNetworkClient = createAutoManagedNetworkClient(
          networkClientConfiguration,
        );
        if (networkClientId in registry[networkClientType]) {
          return registry;
        }
        return {
          ...registry,
          [networkClientType]: {
            ...registry[networkClientType],
            [networkClientId]: autoManagedNetworkClient,
          },
        };
      },
      {
        [NetworkClientType.Infura]: {},
        [NetworkClientType.Custom]: {},
      },
    ) as AutoManagedNetworkClientRegistry;
  }

  /**
   * Constructs the list of network clients for built-in networks (that is,
   * the subset of the networks we know Infura supports that consumers do not
   * need to explicitly add).
   *
   * @returns The network clients.
   */
  #buildIdentifiedInfuraNetworkClientConfigurations(): [
    NetworkClientType.Infura,
    BuiltInNetworkClientId,
    InfuraNetworkClientConfiguration,
  ][] {
    return knownKeysOf(InfuraNetworkType).map((network) => {
      const networkClientId = buildInfuraNetworkClientId(network);
      const networkClientConfiguration: InfuraNetworkClientConfiguration = {
        type: NetworkClientType.Infura,
        network,
        infuraProjectId: this.#infuraProjectId,
        chainId: BUILT_IN_NETWORKS[network].chainId,
        ticker: BUILT_IN_NETWORKS[network].ticker,
      };
      return [
        NetworkClientType.Infura,
        networkClientId,
        networkClientConfiguration,
      ];
    });
  }

  /**
   * Constructs the list of network clients for custom networks (that is, those
   * which consumers have added via `networkConfigurations`).
   *
   * @returns The network clients.
   */
  #buildIdentifiedCustomNetworkClientConfigurations(): [
    NetworkClientType.Custom,
    CustomNetworkClientId,
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
          ticker: networkConfiguration.ticker,
        };
        return [
          NetworkClientType.Custom,
          networkClientId,
          networkClientConfiguration,
        ];
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
  #buildIdentifiedNetworkClientConfigurationsFromProviderConfig():
    | [
        [
          NetworkClientType.Custom,
          CustomNetworkClientId,
          CustomNetworkClientConfiguration,
        ],
      ]
    | [] {
    const { providerConfig } = this.state;

    if (isCustomProviderConfig(providerConfig)) {
      validateCustomProviderConfig(providerConfig);
      const networkClientId = buildCustomNetworkClientId(
        providerConfig,
        this.state.networkConfigurations,
      );
      const networkClientConfiguration: CustomNetworkClientConfiguration = {
        chainId: providerConfig.chainId,
        rpcUrl: providerConfig.rpcUrl,
        type: NetworkClientType.Custom,
        ticker: providerConfig.ticker,
      };
      return [
        [NetworkClientType.Custom, networkClientId, networkClientConfiguration],
      ];
    }

    if (isInfuraProviderConfig(providerConfig)) {
      return [];
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

    let autoManagedNetworkClient: AutoManagedNetworkClient<NetworkClientConfiguration>;

    let networkClientId: NetworkClientId;
    if (isInfuraProviderConfig(providerConfig)) {
      const networkClientType = NetworkClientType.Infura;
      networkClientId = buildInfuraNetworkClientId(providerConfig);
      const builtInNetworkClientRegistry =
        this.#autoManagedNetworkClientRegistry[networkClientType];
      autoManagedNetworkClient =
        builtInNetworkClientRegistry[networkClientId as BuiltInNetworkClientId];
      if (!autoManagedNetworkClient) {
        throw new Error(
          `Could not find custom network matching ${networkClientId}`,
        );
      }
    } else if (isCustomProviderConfig(providerConfig)) {
      validateCustomProviderConfig(providerConfig);
      const networkClientType = NetworkClientType.Custom;
      networkClientId = buildCustomNetworkClientId(
        providerConfig,
        this.state.networkConfigurations,
      );
      const customNetworkClientRegistry =
        this.#autoManagedNetworkClientRegistry[networkClientType];
      autoManagedNetworkClient = customNetworkClientRegistry[networkClientId];
      if (!autoManagedNetworkClient) {
        throw new Error(
          `Could not find built-in network matching ${networkClientId}`,
        );
      }
    } else {
      throw new Error('Could not determine type of provider config');
    }

    this.update((state) => {
      state.selectedNetworkClientId = networkClientId;
      if (state.networksMetadata[networkClientId] === undefined) {
        state.networksMetadata[networkClientId] = {
          status: NetworkStatus.Unknown,
          EIPS: {},
        };
      }
    });

    const { provider, blockTracker } = autoManagedNetworkClient;

    if (this.#providerProxy) {
      this.#providerProxy.setTarget(provider);
    } else {
      this.#providerProxy = createEventEmitterProxy(provider);
    }

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
