import type { RampsControllerOptions } from '@metamask/ramps-controller';

/**
 * Per-instance options for the wallet's `RampsController`.
 */
export type RampsControllerInstanceOptions = {
  requestCacheTTL?: RampsControllerOptions['requestCacheTTL'];
  requestCacheMaxSize?: RampsControllerOptions['requestCacheMaxSize'];
};
