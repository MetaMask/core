import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import {
  BUILT_IN_NETWORKS,
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
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
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
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
export function knownKeysOf<K extends PropertyKey>(
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  object: Partial<Record<K, any>>,
) {
  return Object.keys(object) as K[];
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
  return pickedObject as Pick<Obj, Keys>;
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
 * The string that uniquely identifies an Infura network client.
 */
export type BuiltInNetworkClientId = InfuraNetworkType;

/**
 * The string that uniquely identifies a custom network client.
 */
export type CustomNetworkClientId = string;

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
 * @property properties - an additional set of network properties for the currently connected network
 * @property networkConfigurations - the full list of configured networks either preloaded or added by the user.
 */
export type NetworkState = {
  selectedNetworkClientId: NetworkClientId;
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

export type NetworkControllerGetEthQueryAction = {
  type: `NetworkController:getEthQuery`;
  handler: () => EthQuery | undefined;
};

export type NetworkControllerGetNetworkClientByIdAction = {
  type: `NetworkController:getNetworkClientById`;
  handler: NetworkController['getNetworkClientById'];
};

export type NetworkControllerGetSelectedNetworkClientAction = {
  type: `NetworkController:getSelectedNetworkClient`;
  handler: NetworkController['getSelectedNetworkClient'];
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
  | NetworkControllerGetEthQueryAction
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetSelectedNetworkClientAction
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

  #previouslySelectedNetworkClientId: string;

  #providerProxy: ProviderProxy | undefined;

  #blockTrackerProxy: BlockTrackerProxy | undefined;

  #autoManagedNetworkClientRegistry?: AutoManagedNetworkClientRegistry;

  #autoManagedNetworkClient?:
    | AutoManagedNetworkClient<CustomNetworkClientConfiguration>
    | AutoManagedNetworkClient<InfuraNetworkClientConfiguration>;

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
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:getEthQuery`,
      () => {
        return this.#ethQuery;
      },
    );

    this.messagingSystem.registerActionHandler(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:getNetworkClientById`,
      this.getNetworkClientById.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:getEIP1559Compatibility`,
      this.getEIP1559Compatibility.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:setActiveNetwork`,
      this.setActiveNetwork.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:setProviderType`,
      this.setProviderType.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:findNetworkClientIdByChainId`,
      this.findNetworkClientIdByChainId.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:getNetworkConfigurationByNetworkClientId`,
      this.getNetworkConfigurationByNetworkClientId.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.name}:getSelectedNetworkClient`,
      this.getSelectedNetworkClient.bind(this),
    );

    this.#previouslySelectedNetworkClientId =
      this.state.selectedNetworkClientId;
  }

  /**
   * Accesses the provider and block tracker for the currently selected network.
   * @returns The proxy and block tracker proxies.
   * @deprecated This method has been replaced by `getSelectedNetworkClient` (which has a more easily used return type) and will be removed in a future release.
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
   * Accesses the provider and block tracker for the currently selected network.
   *
   * @returns an object with the provider and block tracker proxies for the currently selected network.
   */
  getSelectedNetworkClient():
    | {
        provider: SwappableProxy<ProxyWithAccessibleTarget<Provider>>;
        blockTracker: SwappableProxy<ProxyWithAccessibleTarget<BlockTracker>>;
      }
    | undefined {
    if (this.#providerProxy && this.#blockTrackerProxy) {
      return {
        provider: this.#providerProxy,
        blockTracker: this.#blockTrackerProxy,
      };
    }
    return undefined;
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
      // This is impossible to reach
      /* istanbul ignore if */
      if (!infuraNetworkClient) {
        throw new Error(
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
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
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `No custom network client was found with the ID "${networkClientId}".`,
      );
    }
    return customNetworkClient;
  }

  /**
   * Executes a series of steps to switch the network:
   *
   * 1. Notifies subscribers via the messenger that the network is about to be
   * switched (and, really, that the global provider and block tracker proxies
   * will be re-pointed to a new network).
   * 2. Looks up a known and preinitialized network client matching the given
   * ID and uses it to re-point the aforementioned provider and block tracker
   * proxies.
   * 3. Notifies subscribers via the messenger that the network has switched.
   * 4. Captures metadata for the newly switched network in state.
   *
   * @param networkClientId - The ID of a network client that requests will be
   * routed through (either the name of an Infura network or the ID of a custom
   * network configuration).
   */
  async #refreshNetwork(networkClientId: string) {
    this.messagingSystem.publish(
      'NetworkController:networkWillChange',
      this.state,
    );
    this.#applyNetworkSelection(networkClientId);
    this.messagingSystem.publish(
      'NetworkController:networkDidChange',
      this.state,
    );
    await this.lookupNetwork();
  }

  /**
   * Creates network clients for built-in and custom networks, then establishes
   * the currently selected network client based on state.
   */
  async initializeProvider() {
    this.#applyNetworkSelection(this.state.selectedNetworkClientId);
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
   * Persists the following metadata about the given or selected network to
   * state:
   *
   * - The status of the network, namely, whether it is available, geo-blocked
   * (Infura only), or unavailable, or whether the status is unknown
   * - Whether the network supports EIP-1559, or whether it is unknown
   *
   * Note that it is possible for the network to be switched while this data is
   * being collected. If that is the case, no metadata for the (now previously)
   * selected network will be updated.
   *
   * @param networkClientId - The ID of the network client to update.
   * If no ID is provided, uses the currently selected network.
   */
  async lookupNetwork(networkClientId?: NetworkClientId) {
    if (networkClientId) {
      await this.lookupNetworkByClientId(networkClientId);
      return;
    }

    if (!this.#ethQuery) {
      return;
    }

    const isInfura =
      this.#autoManagedNetworkClient?.configuration.type ===
      NetworkClientType.Infura;

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
    if ((type as unknown) === NetworkType.rpc) {
      throw new Error(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `NetworkController - cannot call "setProviderType" with type "${NetworkType.rpc}". Use "setActiveNetwork"`,
      );
    }
    if (!isInfuraNetworkType(type)) {
      throw new Error(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Unknown Infura provider type "${type}".`,
      );
    }

    await this.setActiveNetwork(type);
  }

  /**
   * Changes the selected network.
   *
   * @param networkClientId - The ID of a network client that requests will be
   * routed through (either the name of an Infura network or the ID of a custom
   * network configuration).
   * @throws if no network client is associated with the given
   * `networkClientId`.
   */
  async setActiveNetwork(networkClientId: string) {
    this.#previouslySelectedNetworkClientId =
      this.state.selectedNetworkClientId;

    await this.#refreshNetwork(networkClientId);
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
   * Ensures that the provider and block tracker proxies are pointed to the
   * currently selected network and refreshes the metadata for the
   */
  async resetConnection() {
    await this.#refreshNetwork(this.state.selectedNetworkClientId);
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
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
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
    const networkClientId = upsertedNetworkConfigurationId;

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
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
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
    const networkClientId = networkConfigurationId;

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
   * Assuming that the network has been previously switched, switches to this
   * new network.
   *
   * If the network has not been previously switched, this method is equivalent
   * to {@link resetConnection}.
   */
  async rollbackToPreviousProvider() {
    await this.#refreshNetwork(this.#previouslySelectedNetworkClientId);
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
    ].reduce(
      (
        registry,
        [networkClientType, networkClientId, networkClientConfiguration],
      ) => {
        const autoManagedNetworkClient = createAutoManagedNetworkClient(
          networkClientConfiguration,
        );
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
      const networkClientConfiguration: InfuraNetworkClientConfiguration = {
        type: NetworkClientType.Infura,
        network,
        infuraProjectId: this.#infuraProjectId,
        chainId: BUILT_IN_NETWORKS[network].chainId,
        ticker: BUILT_IN_NETWORKS[network].ticker,
      };
      return [NetworkClientType.Infura, network, networkClientConfiguration];
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
        const networkClientId = networkConfigurationId;
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
   * Updates the global provider and block tracker proxies (accessible via
   * {@link getSelectedNetworkClient}) to point to the same ones within the
   * given network client, thereby magically switching any consumers using these
   * proxies to use the new network.
   *
   * Also refreshes the EthQuery instance accessible via the `getEthQuery`
   * action to wrap the provider from the new network client. Note that this is
   * not a proxy, so consumers will need to call `getEthQuery` again after the
   * network switch.
   *
   * @param networkClientId - The ID of a network client that requests will be
   * routed through (either the name of an Infura network or the ID of a custom
   * network configuration).
   * @throws if no network client could be found matching the given ID.
   */
  #applyNetworkSelection(networkClientId: string) {
    const autoManagedNetworkClientRegistry =
      this.#ensureAutoManagedNetworkClientRegistryPopulated();

    let autoManagedNetworkClient:
      | AutoManagedNetworkClient<CustomNetworkClientConfiguration>
      | AutoManagedNetworkClient<InfuraNetworkClientConfiguration>;

    if (isInfuraNetworkType(networkClientId)) {
      const possibleAutoManagedNetworkClient =
        autoManagedNetworkClientRegistry[NetworkClientType.Infura][
          networkClientId
        ];

      // This is impossible to reach
      /* istanbul ignore if */
      if (!possibleAutoManagedNetworkClient) {
        throw new Error(
          `Infura network client not found with ID '${networkClientId}'`,
        );
      }

      autoManagedNetworkClient = possibleAutoManagedNetworkClient;
    } else {
      const possibleAutoManagedNetworkClient =
        autoManagedNetworkClientRegistry[NetworkClientType.Custom][
          networkClientId
        ];

      if (!possibleAutoManagedNetworkClient) {
        throw new Error(
          `Custom network client not found with ID '${networkClientId}'`,
        );
      }

      autoManagedNetworkClient = possibleAutoManagedNetworkClient;
    }

    this.#autoManagedNetworkClient = autoManagedNetworkClient;

    this.update((state) => {
      state.selectedNetworkClientId = networkClientId;
      if (state.networksMetadata[networkClientId] === undefined) {
        state.networksMetadata[networkClientId] = {
          status: NetworkStatus.Unknown,
          EIPS: {},
        };
      }
    });

    if (this.#providerProxy) {
      this.#providerProxy.setTarget(this.#autoManagedNetworkClient.provider);
    } else {
      this.#providerProxy = createEventEmitterProxy(
        this.#autoManagedNetworkClient.provider,
      );
    }

    if (this.#blockTrackerProxy) {
      this.#blockTrackerProxy.setTarget(
        this.#autoManagedNetworkClient.blockTracker,
      );
    } else {
      this.#blockTrackerProxy = createEventEmitterProxy(
        this.#autoManagedNetworkClient.blockTracker,
        { eventFilter: 'skipInternal' },
      );
    }

    this.#ethQuery = new EthQuery(this.#providerProxy);
  }
}
