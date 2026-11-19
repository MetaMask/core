import type { StorageAdapter } from '@metamask/storage-service';

/**
 * Per-instance options for the wallet's `StorageService`.
 */
export type StorageServiceInstanceOptions = {
  /**
   * Storage adapter the service persists data through. Supplied by the
   * consumer, as the backing store differs per environment.
   */
  storage: StorageAdapter;
};
