import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Partialize } from '@metamask/controller-utils';
import {
  InfuraNetworkType,
  NetworkType,
  isSafeChainId,
  isInfuraNetworkType,
  ChainId,
  NetworksTicker,
  NetworkNickname,
} from '@metamask/controller-utils';
import EthQuery from '@metamask/eth-query';
import { errorCodes } from '@metamask/rpc-errors';
import { createEventEmitterProxy } from '@metamask/swappable-obj-proxy';
import type { SwappableProxy } from '@metamask/swappable-obj-proxy';
import type { Hex } from '@metamask/utils';
import { isStrictHexString, hasProperty, isPlainObject } from '@metamask/utils';
import { strict as assert } from 'assert';
import type { Draft } from 'immer';
import type { Logger } from 'loglevel';
import * as URI from 'uri-js';
import { inspect } from 'util';
import { v4 as uuidV4 } from 'uuid';
import { createSelector } from 'reselect';

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

const debugLog = createModuleLogger(projectLogger, 'NetworkController');

const INFURA_URL_REGEX =
  /^https:\/\/(?<networkName>[^.]+)\.infura\.io\/v\d+\/(?<apiKey>.+)$/u;

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
 * The type of an RPC endpoint.
 *
 * @see {@link CustomRpcEndpoint}
 * @see {@link InfuraRpcEndpoint}
 */
export enum RpcEndpointType {
  Custom = 'custom',
  Infura = 'infura',
}

/**
 * An Infura RPC endpoint is a reference to a specific network that Infura
 * supports as well as an Infura account we own that we allow users to make use
 * of for free. We need to disambiguate these endpoints from custom RPC
 * endpoints, because while the types for these kinds of object both have the
 * same interface, the URL for an Infura endpoint contains the Infura project
 * ID, and we don't want this to be present in state. We therefore hide it by
 * representing it in the URL as `{infuraProjectId}`, which we replace this when
 * create network clients. But we need to know somehow that we only need to do
 * this replacement for Infura endpoints and not custom endpoints — hence the
 * separate type.
 */
export type InfuraRpcEndpoint = {
  /**
   * The optional user-facing nickname of the endpoint.
   */
  name?: string;
  /**
   * The identifier for the network client that has been created for this RPC
   * endpoint. This is also used to uniquely identify the RPC endpoint in a
   * set of RPC endpoints as well: once assigned, it is used to determine
   * whether the `name`, `type`, or `url` of the RPC endpoint has changed.
   */
  networkClientId: BuiltInNetworkClientId;
  /**
   * The type of this endpoint, always "default".
   */
  type: RpcEndpointType.Infura;
  /**
   * The URL of the endpoint. Expected to be a template with the string
   * `{infuraProjectId}`, which will get replaced with the Infura project ID
   * when the network client is created.
   */
  url: `https://${InfuraNetworkType}.infura.io/v3/{infuraProjectId}`;
};

/**
 * A custom RPC endpoint is a reference to a user-defined server which fronts an
 * EVM chain. It may refer to an Infura network, but only by coincidence.
 */
export type CustomRpcEndpoint = {
  /**
   * The optional user-facing nickname of the endpoint.
   */
  name?: string;
  /**
   * The identifier for the network client that has been created for this RPC
   * endpoint. This is also used to uniquely identify the RPC endpoint in a
   * set of RPC endpoints as well: once assigned, it is used to determine
   * whether the `name`, `type`, or `url` of the RPC endpoint has changed.
   */
  networkClientId: CustomNetworkClientId;
  /**
   * The type of this endpoint, always "custom".
   */
  type: RpcEndpointType.Custom;
  /**
   * The URL of the endpoint.
   */
  url: string;
};

/**
 * An RPC endpoint is a reference to a server which fronts an EVM chain. There
 * are two varieties of RPC endpoints: Infura and custom.
 *
 * @see {@link CustomRpcEndpoint}
 * @see {@link InfuraRpcEndpoint}
 */
export type RpcEndpoint = InfuraRpcEndpoint | CustomRpcEndpoint;

/**
 * From a user perspective, a network configuration holds information about a
 * network that a user can select through the client. A "network" in this sense
 * can explicitly refer to an EVM chain that the user explicitly adds or doesn't
 * need to add (because it comes shipped with the client). The properties here
 * therefore directly map to fields that a user sees and can edit for a network
 * within the client.
 *
 * Internally, a network configuration represents a single conceptual EVM chain,
 * which is represented tangibly via multiple RPC endpoints. A "network" is then
 * something for which a network client object is created automatically or
 * created on demand when it is added to the client.
 */
export type NetworkConfiguration = {
  /**
   * A set of URLs that allows the user to view activity that has occurred on
   * the chain.
   */
  blockExplorerUrls: string[];
  /**
   * The ID of the chain. Represented in hexadecimal format with a leading "0x"
   * instead of decimal format so that when viewed out of context it can be
   * unambiguously interpreted.
   */
  chainId: Hex;
  /**
   * A reference to a URL that the client will use by default to allow the user
   * to view activity that has occurred on the chain. This index must refer to
   * an item in `blockExplorerUrls`.
   */
  defaultBlockExplorerUrlIndex?: number;
  /**
   * A reference to an RPC endpoint that all requests will use by default in order to
   * interact with the chain. This index must refer to an item in
   * `rpcEndpoints`.
   */
  defaultRpcEndpointIndex: number;
  /**
   * The user-facing nickname assigned to the chain.
   */
  name: string;
  /**
   * The name of the currency to use for the chain.
   */
  nativeCurrency: string;
  /**
   * The collection of possible RPC endpoints that the client can use to
   * interact with the chain.
   */
  rpcEndpoints: RpcEndpoint[];
};

/**
 * A custom RPC endpoint in a new network configuration, meant to be used in
 * conjunction with `AddNetworkFields`.
 *
 * Custom RPC endpoints do not need a `networkClientId` property because it is
 * assumed that they have not already been added and therefore network clients
 * do not exist for them yet (and hence IDs need to be generated).
 */
export type AddNetworkCustomRpcEndpointFields = Omit<
  CustomRpcEndpoint,
  'networkClientId'
>;

/**
 * A new network configuration that `addNetwork` takes.
 *
 * Custom RPC endpoints do not need a `networkClientId` property because it is
 * assumed that they have not already been added and are not represented by
 * network clients yet.
 */
export type AddNetworkFields = Omit<NetworkConfiguration, 'rpcEndpoints'> & {
  rpcEndpoints: (InfuraRpcEndpoint | AddNetworkCustomRpcEndpointFields)[];
};

/**
 * A custom RPC endpoint in an updated representation of a network
 * configuration, meant to be used in conjunction with `UpdateNetworkFields`.
 *
 * Custom RPC endpoints do not need a `networkClientId` property because it is
 * assumed that they have not already been added and therefore network clients
 * do not exist for them yet (and hence IDs need to be generated).
 */
export type UpdateNetworkCustomRpcEndpointFields = Partialize<
  CustomRpcEndpoint,
  'networkClientId'
>;

/**
 * An updated representation of an existing network configuration that
 * `updateNetwork` takes.
 *
 * Custom RPC endpoints may or may not have a `networkClientId` property; if
 * they do, then it is assumed that they already exist, and if not, then it is
 * assumed that they are new and are not represented by network clients yet.
 */
export type UpdateNetworkFields = Omit<NetworkConfiguration, 'rpcEndpoints'> & {
  rpcEndpoints: (InfuraRpcEndpoint | UpdateNetworkCustomRpcEndpointFields)[];
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
 * Extra information about each network, such as whether it is accessible or
 * blocked and whether it supports EIP-1559, keyed by network client ID.
 */
export type NetworksMetadata = Record<NetworkClientId, NetworkMetadata>;

/**
 * The state that NetworkController stores.
 */
export type NetworkState = {
  /**
   * The ID of the network client that the proxies returned by
   * `getSelectedNetworkClient` currently point to.
   */
  selectedNetworkClientId: NetworkClientId;
  /**
   * The registry of networks and corresponding RPC endpoints that the
   * controller can use to make requests for various chains.
   *
   * @see {@link NetworkConfiguration}
   */
  networkConfigurationsByChainId: Record<Hex, NetworkConfiguration>;
  /**
   * Extra information about each network, such as whether it is accessible or
   * blocked and whether it supports EIP-1559, keyed by network client ID.
   */
  networksMetadata: NetworksMetadata;
};

const controllerName = 'NetworkController';

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
  typeof controllerName,
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

/**
 * `networkAdded` is published after a network configuration is added to the
 * network configuration registry and network clients are created for it.
 */
export type NetworkControllerNetworkAddedEvent = {
  type: 'NetworkController:networkAdded';
  payload: [networkConfiguration: NetworkConfiguration];
};

export type NetworkControllerEvents =
  | NetworkControllerStateChangeEvent
  | NetworkControllerNetworkWillChangeEvent
  | NetworkControllerNetworkDidChangeEvent
  | NetworkControllerInfuraIsBlockedEvent
  | NetworkControllerInfuraIsUnblockedEvent
  | NetworkControllerNetworkAddedEvent;

export type NetworkControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
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

export type NetworkControllerGetNetworkConfigurationByChainId = {
  type: `NetworkController:getNetworkConfigurationByChainId`;
  handler: NetworkController['getNetworkConfigurationByChainId'];
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
  | NetworkControllerGetNetworkConfigurationByChainId
  | NetworkControllerGetNetworkConfigurationByNetworkClientId;

export type NetworkControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  NetworkControllerActions,
  NetworkControllerEvents,
  never,
  never
>;

export type NetworkControllerOptions = {
  messenger: NetworkControllerMessenger;
  infuraProjectId: string;
  state?: Partial<NetworkState>;
  log?: Logger;
};

/**
 * Constructs a value for the state property `networkConfigurationsByChainId`
 * which will be used if it has not been provided to the constructor.
 *
 * @returns The default value for `networkConfigurationsByChainId`.
 */
function getDefaultNetworkConfigurationsByChainId(): Record<
  Hex,
  NetworkConfiguration
> {
  return Object.values(InfuraNetworkType).reduce<
    Record<Hex, NetworkConfiguration>
  >((obj, infuraNetworkType) => {
    const chainId = ChainId[infuraNetworkType];
    const rpcEndpointUrl =
      // False negative - this is a string.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `https://${infuraNetworkType}.infura.io/v3/{infuraProjectId}` as const;

    const networkConfiguration: NetworkConfiguration = {
      blockExplorerUrls: [],
      chainId,
      defaultRpcEndpointIndex: 0,
      name: NetworkNickname[infuraNetworkType],
      nativeCurrency: NetworksTicker[infuraNetworkType],
      rpcEndpoints: [
        {
          networkClientId: infuraNetworkType,
          type: RpcEndpointType.Infura,
          url: rpcEndpointUrl,
        },
      ],
    };

    return { ...obj, [chainId]: networkConfiguration };
  }, {});
}

/**
 * Constructs properties for the NetworkController state whose values will be
 * used if not provided to the constructor.
 *
 * @returns The default NetworkController state.
 */
export function getDefaultNetworkControllerState(): NetworkState {
  const networksMetadata = {};
  const networkConfigurationsByChainId =
    getDefaultNetworkConfigurationsByChainId();

  return {
    selectedNetworkClientId: InfuraNetworkType.mainnet,
    networksMetadata,
    networkConfigurationsByChainId,
  };
}

/**
 * Get a list of all network configurations.
 *
 * @param state - NetworkController state
 * @returns A list of all available network configurations
 */
export function getNetworkConfigurations(
  state: NetworkState,
): NetworkConfiguration[] {
  return Object.values(state.networkConfigurationsByChainId);
}

/**
 * Get a list of all available client IDs from a list of
 * network configurations
 * @param networkConfigurations - The array of network configurations
 * @returns A list of all available client IDs
 */
export function getAvailableNetworkClientIds(
  networkConfigurations: NetworkConfiguration[],
): string[] {
  return networkConfigurations.flatMap((networkConfiguration) =>
    networkConfiguration.rpcEndpoints.map(
      (rpcEndpoint) => rpcEndpoint.networkClientId,
    ),
  );
}

export const selectAvailableNetworkClientIds = createSelector(
  [getNetworkConfigurations],
  getAvailableNetworkClientIds,
);

/**
 * The collection of auto-managed network clients that map to Infura networks.
 */
export type AutoManagedBuiltInNetworkClientRegistry = Record<
  BuiltInNetworkClientId,
  AutoManagedNetworkClient<InfuraNetworkClientConfiguration>
>;

/**
 * The collection of auto-managed network clients that map to Infura networks.
 */
export type AutoManagedCustomNetworkClientRegistry = Record<
  CustomNetworkClientId,
  AutoManagedNetworkClient<CustomNetworkClientConfiguration>
>;

/**
 * The collection of auto-managed network clients that map to Infura networks
 * as well as custom networks that users have added.
 */
export type AutoManagedNetworkClientRegistry = {
  [NetworkClientType.Infura]: AutoManagedBuiltInNetworkClientRegistry;
  [NetworkClientType.Custom]: AutoManagedCustomNetworkClientRegistry;
};

/**
 * Instructs `addNetwork` and `updateNetwork` to create a network client for an
 * RPC endpoint.
 *
 * @see {@link NetworkClientOperation}
 */
type AddNetworkClientOperation = {
  type: 'add';
  rpcEndpoint: RpcEndpoint;
};

/**
 * Instructs `updateNetwork` and `removeNetwork` to remove a network client for
 * an RPC endpoint.
 *
 * @see {@link NetworkClientOperation}
 */
type RemoveNetworkClientOperation = {
  type: 'remove';
  rpcEndpoint: RpcEndpoint;
};

/**
 * Instructs `addNetwork` and `updateNetwork` to replace the network client for
 * an RPC endpoint.
 *
 * @see {@link NetworkClientOperation}
 */
type ReplaceNetworkClientOperation = {
  type: 'replace';
  oldRpcEndpoint: RpcEndpoint;
  newRpcEndpoint: RpcEndpoint;
};

/**
 * Instructs `addNetwork` and `updateNetwork` not to do anything with an RPC
 * endpoint, as far as the network client registry is concerned.
 *
 * @see {@link NetworkClientOperation}
 */
type NoopNetworkClientOperation = {
  type: 'noop';
  rpcEndpoint: RpcEndpoint;
};

/* eslint-disable jsdoc/check-indentation */
/**
 * Instructs `addNetwork`, `updateNetwork`, and `removeNetwork` how to
 * update the network client registry.
 *
 * - When `addNetwork` is called, represents a network client that should be
 * created for a new RPC endpoint.
 * - When `removeNetwork` is called, represents a network client that should be
 * destroyed for a previously existing RPC endpoint.
 * - When `updateNetwork` is called, represents either:
 *   - a network client that should be added for a new RPC endpoint
 *   - a network client that should be removed for a previously existing RPC
 *   endpoint
 *   - a network client that should be replaced for an RPC endpoint that was
 *   changed in a non-major way, or
 *   - a network client that should be unchanged for an RPC endpoint that was
 *   also unchanged.
 */
/* eslint-enable jsdoc/check-indentation */
type NetworkClientOperation =
  | AddNetworkClientOperation
  | RemoveNetworkClientOperation
  | ReplaceNetworkClientOperation
  | NoopNetworkClientOperation;

/**
 * Determines whether the given URL is valid by attempting to parse it.
 *
 * @param url - The URL to test.
 * @returns True if the URL is valid, false otherwise.
 */
function isValidUrl(url: string) {
  const uri = URI.parse(url);
  return (
    uri.error === undefined && (uri.scheme === 'http' || uri.scheme === 'https')
  );
}

/**
 * Given an Infura API URL, extracts the subdomain that identifies the Infura
 * network.
 *
 * @param rpcEndpointUrl - The URL to operate on.
 * @returns The Infura network name that the URL references.
 * @throws if the URL is not an Infura API URL, or if an Infura network is not
 * present in the URL.
 */
function deriveInfuraNetworkNameFromRpcEndpointUrl(
  rpcEndpointUrl: string,
): InfuraNetworkType {
  const match = INFURA_URL_REGEX.exec(rpcEndpointUrl);

  if (match?.groups) {
    if (isInfuraNetworkType(match.groups.networkName)) {
      return match.groups.networkName;
    }

    throw new Error(`Unknown Infura network '${match.groups.networkName}'`);
  }

  throw new Error('Could not derive Infura network from RPC endpoint URL');
}

/**
 * Performs a series of checks that the given NetworkController state is
 * internally consistent — that all parts of state that are supposed to match in
 * fact do — so that working with the state later on doesn't cause unexpected
 * errors.
 *
 * In the case of NetworkController, there are several parts of state that need
 * to match. For instance, `defaultRpcEndpointIndex` needs to match an entry
 * within `rpcEndpoints`, and `selectedNetworkClientId` needs to point to an RPC
 * endpoint within a network configuration.
 *
 * @param state - The NetworkController state to verify.
 * @throws if the state is invalid in some way.
 */
function validateNetworkControllerState(state: NetworkState) {
  const networkConfigurationEntries = Object.entries(
    state.networkConfigurationsByChainId,
  );
  const networkClientIds = selectAvailableNetworkClientIds(state);

  if (networkConfigurationEntries.length === 0) {
    throw new Error(
      'NetworkController state is invalid: `networkConfigurationsByChainId` cannot be empty',
    );
  }

  for (const [chainId, networkConfiguration] of networkConfigurationEntries) {
    if (chainId !== networkConfiguration.chainId) {
      throw new Error(
        `NetworkController state has invalid \`networkConfigurationsByChainId\`: Network configuration '${networkConfiguration.name}' is filed under '${chainId}' which does not match its \`chainId\` of '${networkConfiguration.chainId}'`,
      );
    }

    const isInvalidDefaultBlockExplorerUrlIndex =
      networkConfiguration.blockExplorerUrls.length > 0
        ? networkConfiguration.defaultBlockExplorerUrlIndex === undefined ||
          networkConfiguration.blockExplorerUrls[
            networkConfiguration.defaultBlockExplorerUrlIndex
          ] === undefined
        : networkConfiguration.defaultBlockExplorerUrlIndex !== undefined;

    if (isInvalidDefaultBlockExplorerUrlIndex) {
      throw new Error(
        `NetworkController state has invalid \`networkConfigurationsByChainId\`: Network configuration '${networkConfiguration.name}' has a \`defaultBlockExplorerUrlIndex\` that does not refer to an entry in \`blockExplorerUrls\``,
      );
    }

    if (
      networkConfiguration.rpcEndpoints[
        networkConfiguration.defaultRpcEndpointIndex
      ] === undefined
    ) {
      throw new Error(
        `NetworkController state has invalid \`networkConfigurationsByChainId\`: Network configuration '${networkConfiguration.name}' has a \`defaultRpcEndpointIndex\` that does not refer to an entry in \`rpcEndpoints\``,
      );
    }
  }

  if ([...new Set(networkClientIds)].length < networkClientIds.length) {
    throw new Error(
      'NetworkController state has invalid `networkConfigurationsByChainId`: Every RPC endpoint across all network configurations must have a unique `networkClientId`',
    );
  }

  if (!networkClientIds.includes(state.selectedNetworkClientId)) {
    throw new Error(
      `NetworkController state is invalid: \`selectedNetworkClientId\` ${inspect(
        state.selectedNetworkClientId,
      )} does not refer to an RPC endpoint within a network configuration`,
    );
  }
}

/**
 * Transforms a map of chain ID to network configuration to a map of network
 * client ID to network configuration.
 *
 * @param networkConfigurationsByChainId - The network configurations, keyed by
 * chain ID.
 * @returns The network configurations, keyed by network client ID.
 */
function buildNetworkConfigurationsByNetworkClientId(
  networkConfigurationsByChainId: Record<Hex, NetworkConfiguration>,
): Map<NetworkClientId, NetworkConfiguration> {
  return new Map(
    Object.values(networkConfigurationsByChainId).flatMap(
      (networkConfiguration) => {
        return networkConfiguration.rpcEndpoints.map((rpcEndpoint) => {
          return [rpcEndpoint.networkClientId, networkConfiguration];
        });
      },
    ),
  );
}

/**
 * Controller that creates and manages an Ethereum network provider.
 */
export class NetworkController extends BaseController<
  typeof controllerName,
  NetworkState,
  NetworkControllerMessenger
> {
  #ethQuery?: EthQuery;

  #infuraProjectId: string;

  #previouslySelectedNetworkClientId: string;

  #providerProxy: ProviderProxy | undefined;

  #blockTrackerProxy: BlockTrackerProxy | undefined;

  #autoManagedNetworkClientRegistry?: AutoManagedNetworkClientRegistry;

  #autoManagedNetworkClient?:
    | AutoManagedNetworkClient<CustomNetworkClientConfiguration>
    | AutoManagedNetworkClient<InfuraNetworkClientConfiguration>;

  #log: Logger | undefined;

  #networkConfigurationsByNetworkClientId: Map<
    NetworkClientId,
    NetworkConfiguration
  >;

  constructor({
    messenger,
    state,
    infuraProjectId,
    log,
  }: NetworkControllerOptions) {
    const initialState = { ...getDefaultNetworkControllerState(), ...state };
    validateNetworkControllerState(initialState);
    if (!infuraProjectId || typeof infuraProjectId !== 'string') {
      throw new Error('Invalid Infura project ID');
    }

    super({
      name: controllerName,
      metadata: {
        selectedNetworkClientId: {
          persist: true,
          anonymous: false,
        },
        networksMetadata: {
          persist: true,
          anonymous: false,
        },
        networkConfigurationsByChainId: {
          persist: true,
          anonymous: false,
        },
      },
      messenger,
      state: initialState,
    });

    this.#infuraProjectId = infuraProjectId;
    this.#log = log;

    this.#previouslySelectedNetworkClientId =
      this.state.selectedNetworkClientId;
    this.#networkConfigurationsByNetworkClientId =
      buildNetworkConfigurationsByNetworkClientId(
        this.state.networkConfigurationsByChainId,
      );

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
      `${this.name}:getNetworkConfigurationByChainId`,
      this.getNetworkConfigurationByChainId.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      // ESLint is mistaken here; `name` is a string.
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
   * Internally, the Infura and custom network clients are categorized by type
   * so that when accessing either kind of network client, TypeScript knows
   * which type to assign to the network client. For some cases it's more useful
   * to be able to access network clients by ID instead of by type and then ID,
   * so this function makes that possible.
   *
   * @returns The network clients registered so far, keyed by ID.
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
   * @param options - Options for this method.
   * @param options.updateState - Allows for updating state.
   */
  async #refreshNetwork(
    networkClientId: string,
    options: {
      updateState?: (state: Draft<NetworkState>) => void;
    } = {},
  ) {
    this.messagingSystem.publish(
      'NetworkController:networkWillChange',
      this.state,
    );
    this.#applyNetworkSelection(networkClientId, options);
    this.messagingSystem.publish(
      'NetworkController:networkDidChange',
      this.state,
    );
    await this.lookupNetwork();
  }

  /**
   * Ensures that network clients for Infura and custom RPC endpoints have been
   * created. Then, consulting state, initializes and establishes the currently
   * selected network client.
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
      debugLog('NetworkController: lookupNetworkByClientId: ', error);

      // TODO: mock ethQuery.sendAsync to throw error without error code
      /* istanbul ignore else */
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
            this.#log?.warn(
              'NetworkController: lookupNetworkByClientId: json parse error: ',
              error,
            );
          }
        }

        if (
          isPlainObject(responseBody) &&
          responseBody.error === INFURA_BLOCKED_KEY
        ) {
          updatedNetworkStatus = NetworkStatus.Blocked;
        } else if (error.code === errorCodes.rpc.internal) {
          updatedNetworkStatus = NetworkStatus.Unknown;
          this.#log?.warn(
            'NetworkController: lookupNetworkByClientId: rpc internal error: ',
            error,
          );
        } else {
          updatedNetworkStatus = NetworkStatus.Unavailable;
          this.#log?.warn(
            'NetworkController: lookupNetworkByClientId: ',
            error,
          );
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
        debugLog(
          'NetworkController - could not determine network status',
          error,
        );
        updatedNetworkStatus = NetworkStatus.Unknown;
        this.#log?.warn('NetworkController: lookupNetworkByClientId: ', error);
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
      // TODO: mock ethQuery.sendAsync to throw error without error code
      /* istanbul ignore else */
      if (isErrorWithCode(error)) {
        let responseBody;
        if (
          isInfura &&
          hasProperty(error, 'message') &&
          typeof error.message === 'string'
        ) {
          try {
            responseBody = JSON.parse(error.message);
          } catch (parseError) {
            // error.message must not be JSON
            this.#log?.warn(
              'NetworkController: lookupNetwork: json parse error',
              parseError,
            );
          }
        }

        if (
          isPlainObject(responseBody) &&
          responseBody.error === INFURA_BLOCKED_KEY
        ) {
          updatedNetworkStatus = NetworkStatus.Blocked;
        } else if (error.code === errorCodes.rpc.internal) {
          updatedNetworkStatus = NetworkStatus.Unknown;
          this.#log?.warn(
            'NetworkController: lookupNetwork: rpc internal error',
            error,
          );
        } else {
          updatedNetworkStatus = NetworkStatus.Unavailable;
          this.#log?.warn('NetworkController: lookupNetwork: ', error);
        }
      } else {
        debugLog(
          'NetworkController - could not determine network status',
          error,
        );
        updatedNetworkStatus = NetworkStatus.Unknown;
        this.#log?.warn('NetworkController: lookupNetwork: ', error);
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
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `NetworkController - cannot call "setProviderType" with type "${NetworkType.rpc}". Use "setActiveNetwork"`,
    );
    assert.ok(
      isInfuraNetworkType(type),
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `Unknown Infura provider type "${type}".`,
    );

    await this.setActiveNetwork(type);
  }

  /**
   * Changes the selected network.
   *
   * @param networkClientId - The ID of a network client that will be used to
   * make requests.
   * @param options - Options for this method.
   * @param options.updateState - Allows for updating state.
   * @throws if no network client is associated with the given
   * network client ID.
   */
  async setActiveNetwork(
    networkClientId: string,
    options: {
      updateState?: (state: Draft<NetworkState>) => void;
    } = {},
  ) {
    this.#previouslySelectedNetworkClientId =
      this.state.selectedNetworkClientId;

    await this.#refreshNetwork(networkClientId, options);
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
   * Returns the network configuration that has been filed under the given chain
   * ID.
   *
   * @param chainId - The chain ID to use as a key.
   * @returns The network configuration if one exists, or undefined.
   */
  getNetworkConfigurationByChainId(
    chainId: Hex,
  ): NetworkConfiguration | undefined {
    return this.state.networkConfigurationsByChainId[chainId];
  }

  /**
   * Returns the network configuration that contains an RPC endpoint with the
   * given network client ID.
   *
   * @param networkClientId - The network client ID to use as a key.
   * @returns The network configuration if one exists, or undefined.
   */
  getNetworkConfigurationByNetworkClientId(
    networkClientId: NetworkClientId,
  ): NetworkConfiguration | undefined {
    return this.#networkConfigurationsByNetworkClientId.get(networkClientId);
  }

  /**
   * Creates and registers network clients for the collection of Infura and
   * custom RPC endpoints that can be used to make requests for a particular
   * chain, storing the given configuration object in state for later reference.
   *
   * @param fields - The object that describes the new network/chain and lists
   * the RPC endpoints which front that chain.
   * @returns The newly added network configuration.
   * @throws if any part of `fields` would produce invalid state.
   * @see {@link NetworkConfiguration}
   */
  addNetwork(fields: AddNetworkFields): NetworkConfiguration {
    const { rpcEndpoints: setOfRpcEndpointFields } = fields;

    const autoManagedNetworkClientRegistry =
      this.#ensureAutoManagedNetworkClientRegistryPopulated();

    this.#validateNetworkFields({
      mode: 'add',
      networkFields: fields,
      autoManagedNetworkClientRegistry,
    });

    const networkClientOperations = setOfRpcEndpointFields.map(
      (defaultOrCustomRpcEndpointFields) => {
        const rpcEndpoint =
          defaultOrCustomRpcEndpointFields.type === RpcEndpointType.Custom
            ? {
                ...defaultOrCustomRpcEndpointFields,
                networkClientId: uuidV4(),
              }
            : defaultOrCustomRpcEndpointFields;
        return {
          type: 'add' as const,
          rpcEndpoint,
        };
      },
    );

    const newNetworkConfiguration =
      this.#determineNetworkConfigurationToPersist({
        networkFields: fields,
        networkClientOperations,
      });
    this.#registerNetworkClientsAsNeeded({
      networkFields: fields,
      networkClientOperations,
      autoManagedNetworkClientRegistry,
    });
    this.update((state) => {
      this.#updateNetworkConfigurations({
        state,
        mode: 'add',
        networkFields: fields,
        networkConfigurationToPersist: newNetworkConfiguration,
      });
    });

    this.#networkConfigurationsByNetworkClientId =
      buildNetworkConfigurationsByNetworkClientId(
        this.state.networkConfigurationsByChainId,
      );

    this.messagingSystem.publish(
      `${controllerName}:networkAdded`,
      newNetworkConfiguration,
    );

    return newNetworkConfiguration;
  }

  /**
   * Updates the configuration for a previously stored network filed under the
   * given chain ID, creating + registering new network clients to represent RPC
   * endpoints that have been added and destroying + unregistering existing
   * network clients for RPC endpoints that have been removed.
   *
   * Note that if `chainId` is changed, then all network clients associated with
   * that chain will be removed and re-added, even if none of the RPC endpoints
   * have changed.
   *
   * @param chainId - The chain ID associated with an existing network.
   * @param fields - The object that describes the updates to the network/chain,
   * including the new set of RPC endpoints which should front that chain.
   * @param options - Options to provide.
   * @param options.replacementSelectedRpcEndpointIndex - Usually you cannot
   * remove an RPC endpoint that is being represented by the currently selected
   * network client. This option allows you to specify another RPC endpoint
   * (either an existing one or a new one) that should be used to select a new
   * network instead.
   * @returns The updated network configuration.
   * @throws if `chainId` does not refer to an existing network configuration,
   * if any part of `fields` would produce invalid state, etc.
   * @see {@link NetworkConfiguration}
   */
  async updateNetwork(
    chainId: Hex,
    fields: UpdateNetworkFields,
    {
      replacementSelectedRpcEndpointIndex,
    }: { replacementSelectedRpcEndpointIndex?: number } = {},
  ): Promise<NetworkConfiguration> {
    const existingNetworkConfiguration =
      this.state.networkConfigurationsByChainId[chainId];

    if (existingNetworkConfiguration === undefined) {
      throw new Error(
        `Could not update network: Cannot find network configuration for chain ${inspect(
          chainId,
        )}`,
      );
    }

    const existingChainId = chainId;
    const { chainId: newChainId, rpcEndpoints: setOfNewRpcEndpointFields } =
      fields;

    const autoManagedNetworkClientRegistry =
      this.#ensureAutoManagedNetworkClientRegistryPopulated();

    this.#validateNetworkFields({
      mode: 'update',
      networkFields: fields,
      existingNetworkConfiguration,
      autoManagedNetworkClientRegistry,
    });

    const networkClientOperations: NetworkClientOperation[] = [];

    for (const newRpcEndpointFields of setOfNewRpcEndpointFields) {
      const existingRpcEndpointForNoop =
        existingNetworkConfiguration.rpcEndpoints.find((rpcEndpoint) => {
          return (
            rpcEndpoint.type === newRpcEndpointFields.type &&
            rpcEndpoint.url === newRpcEndpointFields.url &&
            (rpcEndpoint.networkClientId ===
              newRpcEndpointFields.networkClientId ||
              newRpcEndpointFields.networkClientId === undefined)
          );
        });
      const existingRpcEndpointForReplaceWhenChainChanged =
        existingNetworkConfiguration.rpcEndpoints.find((rpcEndpoint) => {
          return (
            (rpcEndpoint.type === RpcEndpointType.Infura &&
              newRpcEndpointFields.type === RpcEndpointType.Infura) ||
            (rpcEndpoint.type === newRpcEndpointFields.type &&
              rpcEndpoint.networkClientId ===
                newRpcEndpointFields.networkClientId &&
              rpcEndpoint.url === newRpcEndpointFields.url)
          );
        });
      const existingRpcEndpointForReplaceWhenChainNotChanged =
        existingNetworkConfiguration.rpcEndpoints.find((rpcEndpoint) => {
          return (
            rpcEndpoint.type === newRpcEndpointFields.type &&
            (rpcEndpoint.url === newRpcEndpointFields.url ||
              rpcEndpoint.networkClientId ===
                newRpcEndpointFields.networkClientId)
          );
        });

      if (
        newChainId !== existingChainId &&
        existingRpcEndpointForReplaceWhenChainChanged !== undefined
      ) {
        const newRpcEndpoint =
          newRpcEndpointFields.type === RpcEndpointType.Infura
            ? newRpcEndpointFields
            : { ...newRpcEndpointFields, networkClientId: uuidV4() };

        networkClientOperations.push({
          type: 'replace' as const,
          oldRpcEndpoint: existingRpcEndpointForReplaceWhenChainChanged,
          newRpcEndpoint,
        });
      } else if (existingRpcEndpointForNoop !== undefined) {
        let newRpcEndpoint;
        if (existingRpcEndpointForNoop.type === RpcEndpointType.Infura) {
          newRpcEndpoint = existingRpcEndpointForNoop;
        } else {
          // `networkClientId` shouldn't be missing at this point; if it is,
          // that's a mistake, so fill it back in
          newRpcEndpoint = Object.assign({}, newRpcEndpointFields, {
            networkClientId: existingRpcEndpointForNoop.networkClientId,
          });
        }
        networkClientOperations.push({
          type: 'noop' as const,
          rpcEndpoint: newRpcEndpoint,
        });
      } else if (
        existingRpcEndpointForReplaceWhenChainNotChanged !== undefined
      ) {
        let newRpcEndpoint;
        /* istanbul ignore if */
        if (newRpcEndpointFields.type === RpcEndpointType.Infura) {
          // This case can't actually happen. If we're here, it means that some
          // part of the RPC endpoint changed. But there is no part of an Infura
          // RPC endpoint that can be changed (as it would immediately make that
          // RPC endpoint self-inconsistent). This is just here to appease
          // TypeScript.
          newRpcEndpoint = newRpcEndpointFields;
        } else {
          newRpcEndpoint = {
            ...newRpcEndpointFields,
            networkClientId: uuidV4(),
          };
        }

        networkClientOperations.push({
          type: 'replace' as const,
          oldRpcEndpoint: existingRpcEndpointForReplaceWhenChainNotChanged,
          newRpcEndpoint,
        });
      } else {
        const newRpcEndpoint =
          newRpcEndpointFields.type === RpcEndpointType.Infura
            ? newRpcEndpointFields
            : { ...newRpcEndpointFields, networkClientId: uuidV4() };
        const networkClientOperation = {
          type: 'add' as const,
          rpcEndpoint: newRpcEndpoint,
        };
        networkClientOperations.push(networkClientOperation);
      }
    }

    for (const existingRpcEndpoint of existingNetworkConfiguration.rpcEndpoints) {
      if (
        !networkClientOperations.some((networkClientOperation) => {
          const otherRpcEndpoint =
            networkClientOperation.type === 'replace'
              ? networkClientOperation.oldRpcEndpoint
              : networkClientOperation.rpcEndpoint;
          return (
            otherRpcEndpoint.type === existingRpcEndpoint.type &&
            otherRpcEndpoint.networkClientId ===
              existingRpcEndpoint.networkClientId &&
            otherRpcEndpoint.url === existingRpcEndpoint.url
          );
        })
      ) {
        const networkClientOperation = {
          type: 'remove' as const,
          rpcEndpoint: existingRpcEndpoint,
        };
        networkClientOperations.push(networkClientOperation);
      }
    }

    const updatedNetworkConfiguration =
      this.#determineNetworkConfigurationToPersist({
        networkFields: fields,
        networkClientOperations,
      });

    if (
      replacementSelectedRpcEndpointIndex === undefined &&
      networkClientOperations.some((networkClientOperation) => {
        return (
          networkClientOperation.type === 'remove' &&
          networkClientOperation.rpcEndpoint.networkClientId ===
            this.state.selectedNetworkClientId
        );
      }) &&
      !networkClientOperations.some((networkClientOperation) => {
        return (
          networkClientOperation.type === 'replace' &&
          networkClientOperation.oldRpcEndpoint.networkClientId ===
            this.state.selectedNetworkClientId
        );
      })
    ) {
      throw new Error(
        // False negative - this is a string.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Could not update network: Cannot update RPC endpoints in such a way that the selected network '${this.state.selectedNetworkClientId}' would be removed without a replacement. Choose a different RPC endpoint as the selected network via the \`replacementSelectedRpcEndpointIndex\` option.`,
      );
    }

    this.#registerNetworkClientsAsNeeded({
      networkFields: fields,
      networkClientOperations,
      autoManagedNetworkClientRegistry,
    });

    const replacementSelectedRpcEndpointWithIndex = networkClientOperations
      .map(
        (networkClientOperation, index) =>
          [networkClientOperation, index] as const,
      )
      .find(([networkClientOperation, _index]) => {
        return (
          networkClientOperation.type === 'replace' &&
          networkClientOperation.oldRpcEndpoint.networkClientId ===
            this.state.selectedNetworkClientId
        );
      });
    const correctedReplacementSelectedRpcEndpointIndex =
      replacementSelectedRpcEndpointIndex ??
      replacementSelectedRpcEndpointWithIndex?.[1];

    let rpcEndpointToSelect: RpcEndpoint | undefined;
    if (correctedReplacementSelectedRpcEndpointIndex !== undefined) {
      rpcEndpointToSelect =
        updatedNetworkConfiguration.rpcEndpoints[
          correctedReplacementSelectedRpcEndpointIndex
        ];

      if (rpcEndpointToSelect === undefined) {
        throw new Error(
          `Could not update network: \`replacementSelectedRpcEndpointIndex\` ${correctedReplacementSelectedRpcEndpointIndex} does not refer to an entry in \`rpcEndpoints\``,
        );
      }
    }

    if (
      rpcEndpointToSelect &&
      rpcEndpointToSelect.networkClientId !== this.state.selectedNetworkClientId
    ) {
      await this.setActiveNetwork(rpcEndpointToSelect.networkClientId, {
        updateState: (state) => {
          this.#updateNetworkConfigurations({
            state,
            mode: 'update',
            networkFields: fields,
            networkConfigurationToPersist: updatedNetworkConfiguration,
            existingNetworkConfiguration,
          });
        },
      });
    } else {
      this.update((state) => {
        this.#updateNetworkConfigurations({
          state,
          mode: 'update',
          networkFields: fields,
          networkConfigurationToPersist: updatedNetworkConfiguration,
          existingNetworkConfiguration,
        });
      });
    }

    this.#networkConfigurationsByNetworkClientId =
      buildNetworkConfigurationsByNetworkClientId(
        this.state.networkConfigurationsByChainId,
      );

    this.#unregisterNetworkClientsAsNeeded({
      networkClientOperations,
      autoManagedNetworkClientRegistry,
    });

    return updatedNetworkConfiguration;
  }

  /**
   * Destroys and unregisters the network identified by the given chain ID, also
   * removing the associated network configuration from state.
   *
   * @param chainId - The chain ID associated with an existing network.
   * @throws if `chainId` does not refer to an existing network configuration,
   * or if the currently selected network is being removed.
   * @see {@link NetworkConfiguration}
   */
  removeNetwork(chainId: Hex) {
    const existingNetworkConfiguration =
      this.state.networkConfigurationsByChainId[chainId];

    if (existingNetworkConfiguration === undefined) {
      throw new Error(
        `Cannot find network configuration for chain ${inspect(chainId)}`,
      );
    }

    if (
      existingNetworkConfiguration.rpcEndpoints.some(
        (rpcEndpoint) =>
          rpcEndpoint.networkClientId === this.state.selectedNetworkClientId,
      )
    ) {
      throw new Error(`Cannot remove the currently selected network`);
    }

    const autoManagedNetworkClientRegistry =
      this.#ensureAutoManagedNetworkClientRegistryPopulated();

    const networkClientOperations =
      existingNetworkConfiguration.rpcEndpoints.map((rpcEndpoint) => {
        return {
          type: 'remove' as const,
          rpcEndpoint,
        };
      });

    this.#unregisterNetworkClientsAsNeeded({
      networkClientOperations,
      autoManagedNetworkClientRegistry,
    });
    this.update((state) => {
      this.#updateNetworkConfigurations({
        state,
        mode: 'remove',
        existingNetworkConfiguration,
      });
    });

    this.#networkConfigurationsByNetworkClientId =
      buildNetworkConfigurationsByNetworkClientId(
        this.state.networkConfigurationsByChainId,
      );
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
   * Merges the given backup data into controller state.
   *
   * @param backup - The data that has been backed up.
   * @param backup.networkConfigurationsByChainId - Network configurations,
   * keyed by chain ID.
   */
  loadBackup({
    networkConfigurationsByChainId,
  }: Pick<NetworkState, 'networkConfigurationsByChainId'>): void {
    this.update((state) => {
      state.networkConfigurationsByChainId = {
        ...state.networkConfigurationsByChainId,
        ...networkConfigurationsByChainId,
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
   * Ensure that the given fields which will be used to either add or update a
   * network are valid.
   *
   * @param args - The arguments.
   */
  #validateNetworkFields(
    args: {
      autoManagedNetworkClientRegistry: AutoManagedNetworkClientRegistry;
    } & (
      | {
          mode: 'add';
          networkFields: AddNetworkFields;
        }
      | {
          mode: 'update';
          existingNetworkConfiguration: NetworkConfiguration;
          networkFields: UpdateNetworkFields;
        }
    ),
  ) {
    const { mode, networkFields, autoManagedNetworkClientRegistry } = args;
    const existingNetworkConfiguration =
      'existingNetworkConfiguration' in args
        ? args.existingNetworkConfiguration
        : null;

    const errorMessagePrefix =
      mode === 'update' ? 'Could not update network' : 'Could not add network';

    if (
      !isStrictHexString(networkFields.chainId) ||
      !isSafeChainId(networkFields.chainId)
    ) {
      throw new Error(
        `${errorMessagePrefix}: Invalid \`chainId\` ${inspect(
          networkFields.chainId,
        )} (must start with "0x" and not exceed the maximum)`,
      );
    }

    if (
      existingNetworkConfiguration === null ||
      networkFields.chainId !== existingNetworkConfiguration.chainId
    ) {
      const existingNetworkConfigurationViaChainId =
        this.state.networkConfigurationsByChainId[networkFields.chainId];
      if (existingNetworkConfigurationViaChainId !== undefined) {
        if (existingNetworkConfiguration === null) {
          throw new Error(
            // False negative - these are strings.
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            `Could not add network for chain ${args.networkFields.chainId} as another network for that chain already exists ('${existingNetworkConfigurationViaChainId.name}')`,
          );
        } else {
          throw new Error(
            // False negative - these are strings.
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            `Cannot move network from chain ${existingNetworkConfiguration.chainId} to ${networkFields.chainId} as another network for that chain already exists ('${existingNetworkConfigurationViaChainId.name}')`,
          );
        }
      }
    }

    const isInvalidDefaultBlockExplorerUrlIndex =
      networkFields.blockExplorerUrls.length > 0
        ? networkFields.defaultBlockExplorerUrlIndex === undefined ||
          networkFields.blockExplorerUrls[
            networkFields.defaultBlockExplorerUrlIndex
          ] === undefined
        : networkFields.defaultBlockExplorerUrlIndex !== undefined;

    if (isInvalidDefaultBlockExplorerUrlIndex) {
      throw new Error(
        `${errorMessagePrefix}: \`defaultBlockExplorerUrlIndex\` must refer to an entry in \`blockExplorerUrls\``,
      );
    }

    if (networkFields.rpcEndpoints.length === 0) {
      throw new Error(
        `${errorMessagePrefix}: \`rpcEndpoints\` must be a non-empty array`,
      );
    }
    for (const rpcEndpointFields of networkFields.rpcEndpoints) {
      if (!isValidUrl(rpcEndpointFields.url)) {
        throw new Error(
          `${errorMessagePrefix}: An entry in \`rpcEndpoints\` has invalid URL ${inspect(
            rpcEndpointFields.url,
          )}`,
        );
      }
      const networkClientId =
        'networkClientId' in rpcEndpointFields
          ? rpcEndpointFields.networkClientId
          : undefined;

      if (
        rpcEndpointFields.type === RpcEndpointType.Custom &&
        networkClientId !== undefined &&
        isInfuraNetworkType(networkClientId)
      ) {
        throw new Error(
          // This is a string.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `${errorMessagePrefix}: Custom RPC endpoint '${rpcEndpointFields.url}' has invalid network client ID '${networkClientId}'`,
        );
      }

      if (
        mode === 'update' &&
        networkClientId !== undefined &&
        rpcEndpointFields.type === RpcEndpointType.Custom &&
        !Object.values(autoManagedNetworkClientRegistry).some(
          (networkClientsById) => networkClientId in networkClientsById,
        )
      ) {
        throw new Error(
          `${errorMessagePrefix}: RPC endpoint '${
            // This is a string.
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            rpcEndpointFields.url
          }' refers to network client ${inspect(
            networkClientId,
          )} that does not exist`,
        );
      }

      if (
        networkFields.rpcEndpoints.some(
          (otherRpcEndpointFields) =>
            otherRpcEndpointFields !== rpcEndpointFields &&
            URI.equal(otherRpcEndpointFields.url, rpcEndpointFields.url),
        )
      ) {
        throw new Error(
          `${errorMessagePrefix}: Each entry in rpcEndpoints must have a unique URL`,
        );
      }

      const networkConfigurationsForOtherChains = Object.values(
        this.state.networkConfigurationsByChainId,
      ).filter((networkConfiguration) =>
        existingNetworkConfiguration
          ? networkConfiguration.chainId !==
            existingNetworkConfiguration.chainId
          : true,
      );
      for (const networkConfiguration of networkConfigurationsForOtherChains) {
        const rpcEndpoint = networkConfiguration.rpcEndpoints.find(
          (existingRpcEndpoint) =>
            URI.equal(rpcEndpointFields.url, existingRpcEndpoint.url),
        );
        if (rpcEndpoint) {
          throw new Error(
            mode === 'update'
              ? // False negative - these are strings.
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                `Could not update network to point to same RPC endpoint as existing network for chain ${networkConfiguration.chainId} ('${networkConfiguration.name}')`
              : // False negative - these are strings.
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                `Could not add network that points to same RPC endpoint as existing network for chain ${networkConfiguration.chainId} ('${networkConfiguration.name}')`,
          );
        }
      }
    }

    if (
      [...new Set(networkFields.rpcEndpoints)].length <
      networkFields.rpcEndpoints.length
    ) {
      throw new Error(
        `${errorMessagePrefix}: Each entry in rpcEndpoints must be unique`,
      );
    }

    const networkClientIds = networkFields.rpcEndpoints
      .map((rpcEndpoint) =>
        'networkClientId' in rpcEndpoint
          ? rpcEndpoint.networkClientId
          : undefined,
      )
      .filter(
        (networkClientId): networkClientId is NetworkClientId =>
          networkClientId !== undefined,
      );
    if ([...new Set(networkClientIds)].length < networkClientIds.length) {
      throw new Error(
        `${errorMessagePrefix}: Each entry in rpcEndpoints must have a unique networkClientId`,
      );
    }

    const infuraRpcEndpoints = networkFields.rpcEndpoints.filter(
      (rpcEndpointFields): rpcEndpointFields is InfuraRpcEndpoint =>
        rpcEndpointFields.type === RpcEndpointType.Infura,
    );
    if (infuraRpcEndpoints.length > 1) {
      throw new Error(
        `${errorMessagePrefix}: There cannot be more than one Infura RPC endpoint`,
      );
    }

    const soleInfuraRpcEndpoint = infuraRpcEndpoints[0];
    if (soleInfuraRpcEndpoint) {
      const infuraNetworkName = deriveInfuraNetworkNameFromRpcEndpointUrl(
        soleInfuraRpcEndpoint.url,
      );
      const infuraNetworkNickname = NetworkNickname[infuraNetworkName];
      const infuraChainId = ChainId[infuraNetworkName];
      if (networkFields.chainId !== infuraChainId) {
        throw new Error(
          mode === 'add'
            ? // This is a string.
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              `Could not add network with chain ID ${networkFields.chainId} and Infura RPC endpoint for '${infuraNetworkNickname}' which represents ${infuraChainId}, as the two conflict`
            : // This is a string.
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              `Could not update network with chain ID ${networkFields.chainId} and Infura RPC endpoint for '${infuraNetworkNickname}' which represents ${infuraChainId}, as the two conflict`,
        );
      }
    }

    if (
      networkFields.rpcEndpoints[networkFields.defaultRpcEndpointIndex] ===
      undefined
    ) {
      throw new Error(
        `${errorMessagePrefix}: \`defaultRpcEndpointIndex\` must refer to an entry in \`rpcEndpoints\``,
      );
    }
  }

  /**
   * Constructs a network configuration that will be persisted to state when
   * adding or updating a network.
   *
   * @param args - The arguments to this function.
   * @param args.networkFields - The fields used to add or update a network.
   * @param args.networkClientOperations - Operations which were calculated for
   * updating the network client registry but which also map back to RPC
   * endpoints (and so can be used to save those RPC endpoints).
   * @returns The network configuration to persist.
   */
  #determineNetworkConfigurationToPersist({
    networkFields,
    networkClientOperations,
  }: {
    networkFields: AddNetworkFields | UpdateNetworkFields;
    networkClientOperations: NetworkClientOperation[];
  }): NetworkConfiguration {
    const rpcEndpointsToPersist = networkClientOperations
      .filter(
        (
          networkClientOperation,
        ): networkClientOperation is
          | AddNetworkClientOperation
          | NoopNetworkClientOperation => {
          return (
            networkClientOperation.type === 'add' ||
            networkClientOperation.type === 'noop'
          );
        },
      )
      .map((networkClientOperation) => networkClientOperation.rpcEndpoint)
      .concat(
        networkClientOperations
          .filter(
            (
              networkClientOperation,
            ): networkClientOperation is ReplaceNetworkClientOperation => {
              return networkClientOperation.type === 'replace';
            },
          )
          .map(
            (networkClientOperation) => networkClientOperation.newRpcEndpoint,
          ),
      );

    return { ...networkFields, rpcEndpoints: rpcEndpointsToPersist };
  }

  /**
   * Creates and registers network clients using the given operations calculated
   * as a part of adding or updating a network.
   *
   * @param args - The arguments to this function.
   * @param args.networkFields - The fields used to add or update a network.
   * @param args.networkClientOperations - Dictate which network clients need to
   * be created.
   * @param args.autoManagedNetworkClientRegistry - The network client registry
   * to update.
   */
  #registerNetworkClientsAsNeeded({
    networkFields,
    networkClientOperations,
    autoManagedNetworkClientRegistry,
  }: {
    networkFields: AddNetworkFields | UpdateNetworkFields;
    networkClientOperations: NetworkClientOperation[];
    autoManagedNetworkClientRegistry: AutoManagedNetworkClientRegistry;
  }) {
    const addedRpcEndpoints = networkClientOperations
      .filter(
        (
          networkClientOperation,
        ): networkClientOperation is AddNetworkClientOperation => {
          return networkClientOperation.type === 'add';
        },
      )
      .map((networkClientOperation) => networkClientOperation.rpcEndpoint)
      .concat(
        networkClientOperations
          .filter(
            (
              networkClientOperation,
            ): networkClientOperation is ReplaceNetworkClientOperation => {
              return networkClientOperation.type === 'replace';
            },
          )
          .map(
            (networkClientOperation) => networkClientOperation.newRpcEndpoint,
          ),
      );

    for (const addedRpcEndpoint of addedRpcEndpoints) {
      if (addedRpcEndpoint.type === RpcEndpointType.Infura) {
        autoManagedNetworkClientRegistry[NetworkClientType.Infura][
          addedRpcEndpoint.networkClientId
        ] = createAutoManagedNetworkClient({
          type: NetworkClientType.Infura,
          chainId: networkFields.chainId,
          network: addedRpcEndpoint.networkClientId,
          infuraProjectId: this.#infuraProjectId,
          ticker: networkFields.nativeCurrency,
        });
      } else {
        autoManagedNetworkClientRegistry[NetworkClientType.Custom][
          addedRpcEndpoint.networkClientId
        ] = createAutoManagedNetworkClient({
          type: NetworkClientType.Custom,
          chainId: networkFields.chainId,
          rpcUrl: addedRpcEndpoint.url,
          ticker: networkFields.nativeCurrency,
        });
      }
    }
  }

  /**
   * Destroys and removes network clients using the given operations calculated
   * as a part of updating or removing a network.
   *
   * @param args - The arguments to this function.
   * @param args.networkClientOperations - Dictate which network clients to
   * remove.
   * @param args.autoManagedNetworkClientRegistry - The network client registry
   * to update.
   */
  #unregisterNetworkClientsAsNeeded({
    networkClientOperations,
    autoManagedNetworkClientRegistry,
  }: {
    networkClientOperations: NetworkClientOperation[];
    autoManagedNetworkClientRegistry: AutoManagedNetworkClientRegistry;
  }) {
    const removedRpcEndpoints = networkClientOperations
      .filter(
        (
          networkClientOperation,
        ): networkClientOperation is RemoveNetworkClientOperation => {
          return networkClientOperation.type === 'remove';
        },
      )
      .map((networkClientOperation) => networkClientOperation.rpcEndpoint)
      .concat(
        networkClientOperations
          .filter(
            (
              networkClientOperation,
            ): networkClientOperation is ReplaceNetworkClientOperation => {
              return networkClientOperation.type === 'replace';
            },
          )
          .map(
            (networkClientOperation) => networkClientOperation.oldRpcEndpoint,
          ),
      );

    for (const rpcEndpoint of removedRpcEndpoints) {
      const networkClient = this.getNetworkClientById(
        rpcEndpoint.networkClientId,
      );
      networkClient.destroy();
      delete autoManagedNetworkClientRegistry[networkClient.configuration.type][
        rpcEndpoint.networkClientId
      ];
    }
  }

  /**
   * Updates `networkConfigurationsByChainId` in state depending on whether a
   * network is being added, updated, or removed.
   *
   * - The existing network configuration will be removed when a network is
   * being filed under a different chain or removed.
   * - A network configuration will be stored when a network is being added or
   * when a network is being updated.
   *
   * @param args - The arguments to this function.
   */
  #updateNetworkConfigurations(
    args: { state: Draft<NetworkState> } & (
      | {
          mode: 'add';
          networkFields: AddNetworkFields;
          networkConfigurationToPersist: NetworkConfiguration;
        }
      | {
          mode: 'update';
          networkFields: UpdateNetworkFields;
          networkConfigurationToPersist: NetworkConfiguration;
          existingNetworkConfiguration: NetworkConfiguration;
        }
      | {
          mode: 'remove';
          existingNetworkConfiguration: NetworkConfiguration;
        }
    ),
  ) {
    const { state, mode } = args;

    if (
      mode === 'remove' ||
      (mode === 'update' &&
        args.networkFields.chainId !==
          args.existingNetworkConfiguration.chainId)
    ) {
      delete state.networkConfigurationsByChainId[
        args.existingNetworkConfiguration.chainId
      ];
    }

    if (mode === 'add' || mode === 'update') {
      state.networkConfigurationsByChainId[args.networkFields.chainId] =
        args.networkConfigurationToPersist;
    }
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
    return (this.#autoManagedNetworkClientRegistry ??=
      this.#createAutoManagedNetworkClientRegistry());
  }

  /**
   * Constructs the registry of network clients based on the set of default
   * and custom networks in state.
   *
   * @returns The network clients keyed by ID.
   */
  #createAutoManagedNetworkClientRegistry(): AutoManagedNetworkClientRegistry {
    const chainIds = knownKeysOf(this.state.networkConfigurationsByChainId);
    const networkClientsWithIds = chainIds.flatMap((chainId) => {
      const networkConfiguration =
        this.state.networkConfigurationsByChainId[chainId];
      return networkConfiguration.rpcEndpoints.map((rpcEndpoint) => {
        if (rpcEndpoint.type === RpcEndpointType.Infura) {
          const infuraNetworkName = deriveInfuraNetworkNameFromRpcEndpointUrl(
            rpcEndpoint.url,
          );
          return [
            rpcEndpoint.networkClientId,
            createAutoManagedNetworkClient({
              type: NetworkClientType.Infura,
              network: infuraNetworkName,
              infuraProjectId: this.#infuraProjectId,
              chainId: networkConfiguration.chainId,
              ticker: networkConfiguration.nativeCurrency,
            }),
          ] as const;
        }
        return [
          rpcEndpoint.networkClientId,
          createAutoManagedNetworkClient({
            type: NetworkClientType.Custom,
            chainId: networkConfiguration.chainId,
            rpcUrl: rpcEndpoint.url,
            ticker: networkConfiguration.nativeCurrency,
          }),
        ] as const;
      });
    });

    return networkClientsWithIds.reduce(
      (
        obj: {
          [NetworkClientType.Custom]: Partial<AutoManagedCustomNetworkClientRegistry>;
          [NetworkClientType.Infura]: Partial<AutoManagedBuiltInNetworkClientRegistry>;
        },
        [networkClientId, networkClient],
      ) => {
        return {
          ...obj,
          [networkClient.configuration.type]: {
            ...obj[networkClient.configuration.type],
            [networkClientId]: networkClient,
          },
        };
      },
      {
        [NetworkClientType.Custom]: {},
        [NetworkClientType.Infura]: {},
      },
    ) as AutoManagedNetworkClientRegistry;
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
   * @param options - Options for this method.
   * @param options.updateState - Allows for updating state.
   * @throws if no network client could be found matching the given ID.
   */
  #applyNetworkSelection(
    networkClientId: string,
    {
      updateState,
    }: {
      updateState?: (state: Draft<NetworkState>) => void;
    } = {},
  ) {
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
          `No Infura network client found with ID ${inspect(networkClientId)}`,
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
          `No network client found with ID ${inspect(networkClientId)}`,
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
      updateState?.(state);
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
