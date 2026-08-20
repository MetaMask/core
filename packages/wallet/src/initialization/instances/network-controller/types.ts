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
   * endpoint becomes unavailable or degraded. Optional; omitted properties fall
   * back to the controller's defaults (which emit nothing).
   */
  analyticsOptions?: NetworkControllerAnalyticsOptions;
  /**
   * Returns an authentication token to present as a bearer credential on
   * requests to Infura endpoints, or undefined if none is available.
   *
   * Optional; when omitted, no credential is presented. Requests to other
   * endpoints are unaffected either way, as are requests that already carry an
   * `Authorization` header.
   */
  getInfuraAuthToken?: () => Promise<string | undefined>;
};
