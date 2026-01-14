/**
 * Connectivity status constants.
 * Used to represent whether the device has internet connectivity.
 */
export const CONNECTIVITY_STATUSES = {
  Online: 'online',
  Offline: 'offline',
} as const;

export type ConnectivityStatus =
  (typeof CONNECTIVITY_STATUSES)[keyof typeof CONNECTIVITY_STATUSES];

/**
 * Service interface for platform-specific connectivity detection.
 *
 * Each platform (extension, mobile) implements this interface using
 * platform-specific APIs:
 * - Extension: `navigator.onLine` and `online`/`offline` events
 * - Mobile: `@react-native-community/netinfo`
 *
 * The service is injected into the ConnectivityController, which
 * subscribes to connectivity changes and updates its state accordingly.
 */
export type ConnectivityService = {
  /**
   * Returns the current connectivity status.
   *
   * @returns 'online' if the device is online, 'offline' otherwise.
   */
  getStatus(): ConnectivityStatus;

  /**
   * Registers a callback to be called when connectivity status changes.
   *
   * @param callback - Function called with 'online' when online, 'offline' when offline.
   */
  onConnectivityChange(callback: (status: ConnectivityStatus) => void): void;

  /**
   * Cleans up any resources (event listeners, subscriptions).
   */
  destroy(): void;
};
