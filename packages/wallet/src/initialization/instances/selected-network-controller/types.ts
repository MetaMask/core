import type { SelectedNetworkControllerOptions } from '@metamask/selected-network-controller';

/**
 * Per-instance options for the wallet's `SelectedNetworkController`.
 */
export type SelectedNetworkControllerInstanceOptions = {
  /**
   * A map for storing domain-specific network proxies that are held in memory
   * only during use. Clients decide how entries are held, e.g., a plain `Map`
   * or a map that references its values weakly.
   */
  domainProxyMap: SelectedNetworkControllerOptions['domainProxyMap'];
};
