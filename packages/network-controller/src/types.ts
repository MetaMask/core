import type { InfuraNetworkType } from '@metamask/controller-utils';
import type { BlockTracker as BaseBlockTracker } from '@metamask/eth-block-tracker';
import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import type { Hex } from '@metamask/utils';

import type { NetworkStatus } from './constants';

export type Provider = SafeEventEmitterProvider;

export type BlockTracker = BaseBlockTracker & {
  checkForLatestBlock(): Promise<string>;
};

/**
 * The type of network client that can be created.
 */
export enum NetworkClientType {
  Custom = 'custom',
  Infura = 'infura',
}

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
 * The string that uniquely identifies a custom network client.
 */
export type CustomNetworkClientId = string;

/**
 * An RPC endpoint is a reference to a server which fronts an EVM chain. There
 * are two varieties of RPC endpoints: Infura and custom.
 *
 * @see {@link CustomRpcEndpoint}
 * @see {@link InfuraRpcEndpoint}
 */
export type RpcEndpoint = InfuraRpcEndpoint | CustomRpcEndpoint;

/**
 * The string that uniquely identifies a network client.
 */
export type NetworkClientId = BuiltInNetworkClientId | CustomNetworkClientId;

/**
 * A configuration object that can be used to create a client for a custom
 * network.
 */
export type CustomNetworkClientConfiguration = {
  chainId: Hex;
  rpcUrl: string;
  ticker: string;
  type: NetworkClientType.Custom;
};

/**
 * A configuration object that can be used to create a client for an Infura
 * network.
 */
export type InfuraNetworkClientConfiguration = {
  chainId: Hex;
  network: InfuraNetworkType;
  infuraProjectId: string;
  ticker: string;
  type: NetworkClientType.Infura;
};

/**
 * A configuration object that can be used to create a client for a network.
 */
export type NetworkClientConfiguration =
  | CustomNetworkClientConfiguration
  | InfuraNetworkClientConfiguration;

/**
 * The string that uniquely identifies an Infura network client.
 */
export type BuiltInNetworkClientId = InfuraNetworkType;

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
  /**
   * Profile Sync - Network Sync field.
   * Allows comparison of local network state with state to sync.
   */
  lastUpdatedAt?: number;
};

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
