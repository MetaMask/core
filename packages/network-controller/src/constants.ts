import { InfuraNetworkType } from "@metamask/controller-utils";

/**
 * Represents the availability status of an RPC endpoint. (Regrettably, the
 * name of this type is a misnomer.)
 *
 * The availability status is set both automatically (as requests are made) and
 * manually (when `lookupNetwork` is called).
 */
export enum NetworkStatus {
  /**
   * Either the availability status of the RPC endpoint has not been determined,
   * or request that `lookupNetwork` performed returned an unknown error.
   */
  Unknown = 'unknown',
  /**
   * The RPC endpoint is consistently returning successful (2xx) responses.
   */
  Available = 'available',
  /**
   * Either the last request to the RPC endpoint was either too slow, or the
   * endpoint is consistently returning errors and the number of retries has
   * been reached.
   */
  Degraded = 'degraded',
  /**
   * The RPC endpoint is consistently returning enough 5xx errors that requests
   * have been paused.
   */
  Unavailable = 'unavailable',
  /**
   * The RPC endpoint is inaccessible for the user based on their location. This
   * status only applies to Infura networks.
   */
  Blocked = 'blocked',
}

export const INFURA_BLOCKED_KEY = 'countryBlocked';

/**
 * A set of deprecated network ChainId.
 * The network controller will exclude those the networks begin as default network,
 * without the need to remove the network from constant list of controller-utils.
 */
export const DEPRECATED_NETWORKS = new Set<string>(['0xe704', '0x5']);

/**
 * A mapping of network keys to their corresponding InfuraNetworkType keys.
 * This is used to map the network keys to the InfuraNetworkType keys.
 * For example, `monad-testnet` is mapped to `monad-testnet-infura`.
 * This is used to map the network keys to the InfuraNetworkType keys.
 */
export const FALLBACK_INFURA_NETWORK_TYPE_MAPPING: Record<string, InfuraNetworkType> = {
  'monad-testnet': 'monad-testnet-infura',
}
