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
   * The network is unable to receive and respond to requests for unknown
   * reasons.
   */
  Unavailable = 'unavailable',
}
