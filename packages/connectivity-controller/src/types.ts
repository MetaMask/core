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
 * Adapter interface for platform-specific connectivity detection.
 * Each platform (extension, mobile) implements this interface using
 * platform-specific APIs to detect internet connectivity.
 */
export type ConnectivityAdapter = {
  /**
   * Returns a promise that resolves to the current connectivity status.
   *
   * @returns A promise that resolves to 'online' if the device is online, 'offline' otherwise.
   */
  getStatus(): Promise<ConnectivityStatus>;

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
