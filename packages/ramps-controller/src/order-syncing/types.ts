import type { TraceCallback } from '@metamask/controller-utils';

import type { RampsControllerMessenger } from '../RampsController';
import type { RampsOrder } from '../RampsService';
import type {
  USER_STORAGE_VERSION,
  USER_STORAGE_VERSION_KEY,
} from './constants';

/**
 * Compact User Storage entry wrapping a full {@link RampsOrder}.
 */
export type UserStorageRampsOrderEntry = {
  /**
   * Schema version — allows upgrade/downgrade handling in the future.
   */
  [USER_STORAGE_VERSION_KEY]: typeof USER_STORAGE_VERSION;
  /**
   * Full V2 ramps order payload.
   */
  o: RampsOrder;
  /**
   * Last-updated timestamp used for conflict resolution.
   */
  lu?: number;
  /**
   * Soft-delete tombstone timestamp. When set, the order should be removed locally.
   */
  dt?: number;
};

/**
 * {@link RampsOrder} extended with sync metadata used for conflict resolution.
 *
 * `lastUpdatedAt` is persisted on local controller orders so last-write-wins can
 * compare against remote `lu` after local edits. `deletedAt` is remote-only and
 * must be stripped before writing into {@link RampsController} state.
 */
export type SyncRampsOrder = RampsOrder & {
  lastUpdatedAt?: number;
  deletedAt?: number;
};

/**
 * Minimal controller surface required by order syncing.
 */
export type OrderSyncingController = {
  state: { orders: RampsOrder[] };
  readonly isOrderSyncingInProgress: boolean;
  setIsOrderSyncingInProgress: (value: boolean) => void;
  addOrder: (order: RampsOrder) => void;
  removeOrder: (providerOrderId: string) => void;
};

/**
 * Options for ramps order syncing operations.
 */
export type OrderSyncingOptions = {
  getRampsControllerInstance: () => OrderSyncingController;
  getMessenger: () => RampsControllerMessenger;
  trace?: TraceCallback;
};
