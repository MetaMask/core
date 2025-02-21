/**
 * Represents the availability state of the currently selected network.
 */
export enum NetworkStatus {
  /**
   * The network may or may not be able to receive requests, but either no
   * attempt has been made to determine this, or an attempt was made but was
   * unsuccessful.
   */
  Unknown = 'unknown',
  /**
   * The network is able to receive and respond to requests.
   */
  Available = 'available',
  /**
   * The network was unable to receive and respond to requests for unknown
   * reasons.
   */
  Unavailable = 'unavailable',
  /**
   * The network is not only unavailable, but is also inaccessible for the user
   * specifically based on their location. This state only applies to Infura
   * networks.
   */
  Blocked = 'blocked',
}

export const INFURA_BLOCKED_KEY = 'countryBlocked';

/**
 * Represents how long the NetworkController should wait for
 * the network to respond for requests for the latest block
 * before failing with an error.
 */
export const GET_LATEST_BLOCK_TIMEOUT = 10000;
