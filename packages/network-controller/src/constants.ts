/**
 * Represents the availability state of an RPC endpoint. (Yes, this is a
 * misnomer.)
 */
export enum NetworkStatus {
  /**
   * It is not determined yet whether the RPC endpoint is available.
   */
  Unknown = 'unknown',
  /**
   * The RPC endpoint is consistently returning successful responses.
   */
  Available = 'available',
  /**
   * Requests to the RPC endpoint are either slow or are beginning to
   * consistently respond with errors.
   */
  Degraded = 'degraded',
  /**
   * Requests to the RPC endpoint have responded with enough errors that it is
   * determined to be unavailable.
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
