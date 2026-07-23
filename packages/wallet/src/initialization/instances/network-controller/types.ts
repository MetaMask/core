import type { NetworkControllerAnalyticsOptions } from '@metamask/network-controller';
import { Hex } from '@metamask/utils';

/**
 * Per-instance options for the wallet's `NetworkController`.
 */
export type NetworkControllerInstanceOptions = {
  /**
   * The API key for Infura, used to make requests to Infura.
   */
  infuraProjectId: string;
  /**
   * An optional map of available failover URLs for each chain ID.
   */
  failoverUrls?: Record<Hex, string[]>;
  /**
   * Configuration for the analytics events the controller emits when an RPC
   * endpoint becomes unavailable or degraded.
   */
  analyticsOptions: NetworkControllerAnalyticsOptions;
};
