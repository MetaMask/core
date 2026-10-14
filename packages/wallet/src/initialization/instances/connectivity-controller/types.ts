import type { ConnectivityAdapter } from '@metamask/connectivity-controller';

/**
 * Per-instance options for the wallet's `ConnectivityController`.
 */
export type ConnectivityControllerInstanceOptions = {
  /**
   * Platform-specific adapter that observes the device's network connectivity.
   * Required because connectivity is inherently platform-specific; node-like
   * environments can pass the exported `AlwaysOnlineAdapter`.
   */
  connectivityAdapter: ConnectivityAdapter;
};
