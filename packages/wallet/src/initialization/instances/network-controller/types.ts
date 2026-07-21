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
};
