import type { RampsOrder } from '../RampsService';
import { TraceName, USER_STORAGE_RAMPS_ORDERS_FEATURE } from './constants';
import { canPerformOrderSyncing } from './sync-utils';
import type {
  OrderSyncingOptions,
  SyncRampsOrder,
  UserStorageRampsOrderEntry,
} from './types';
import {
  areOrdersEqual,
  createOrderStorageKey,
  isSyncableOrder,
  mapRampsOrderToUserStorageEntry,
  mapUserStorageEntryToRampsOrder,
  stripDeletedAt,
  stripSyncMetadata,
} from './utils';

export type SyncOrdersWithUserStorageConfig = {
  onOrderSyncErroneousSituation?: (
    errorMessage: string,
    sentryContext?: Record<string, unknown>,
  ) => void;
};

type MergePlan = {
  ordersToAddOrUpdateLocally: SyncRampsOrder[];
  ordersToDeleteLocally: SyncRampsOrder[];
  ordersToUpdateRemotely: RampsOrder[];
};

/**
 * Returns the timestamp used for ramps order conflict resolution.
 *
 * @param order - A ramps order that may include sync metadata.
 * @returns The best available last-updated timestamp.
 */
function getOrderTimestamp(order: RampsOrder | SyncRampsOrder): number {
  return (order as SyncRampsOrder).lastUpdatedAt ?? order.createdAt ?? 0;
}

/**
 * Builds the local/remote merge plan from the current local snapshot and remote
 * entries.
 *
 * @param localOrders - Syncable orders currently in {@link RampsController} state.
 * @param validRemoteOrders - Syncable orders fetched from User Storage.
 * @returns Lists of local mutations and remote uploads to apply.
 */
function computeMergePlan(
  localOrders: RampsOrder[],
  validRemoteOrders: SyncRampsOrder[],
): MergePlan & { remoteOrdersMap: Map<string, SyncRampsOrder> } {
  const localOrdersMap = new Map<string, RampsOrder>();
  const remoteOrdersMap = new Map<string, SyncRampsOrder>();

  localOrders.forEach((order) => {
    localOrdersMap.set(createOrderStorageKey(order), order);
  });

  validRemoteOrders.forEach((order) => {
    remoteOrdersMap.set(createOrderStorageKey(order), order);
  });

  const ordersToAddOrUpdateLocally: SyncRampsOrder[] = [];
  const ordersToDeleteLocally: SyncRampsOrder[] = [];
  const ordersToUpdateRemotely: RampsOrder[] = [];

  for (const remoteOrder of validRemoteOrders) {
    const key = createOrderStorageKey(remoteOrder);
    const localOrder = localOrdersMap.get(key);

    if (remoteOrder.deletedAt) {
      if (localOrder) {
        const localTimestamp = getOrderTimestamp(localOrder);
        const remoteTimestamp = remoteOrder.deletedAt;

        if (localTimestamp > remoteTimestamp) {
          ordersToUpdateRemotely.push(localOrder);
        } else {
          ordersToDeleteLocally.push(remoteOrder);
        }
      }
    } else if (!localOrder) {
      ordersToAddOrUpdateLocally.push(remoteOrder);
    } else if (!areOrdersEqual(localOrder, remoteOrder)) {
      const localTimestamp = getOrderTimestamp(localOrder);
      const remoteTimestamp = getOrderTimestamp(remoteOrder);

      if (localTimestamp >= remoteTimestamp) {
        ordersToUpdateRemotely.push(localOrder);
      } else {
        ordersToAddOrUpdateLocally.push(remoteOrder);
      }
    }
  }

  for (const localOrder of localOrders) {
    const key = createOrderStorageKey(localOrder);
    if (!remoteOrdersMap.has(key)) {
      ordersToUpdateRemotely.push(localOrder);
    }
  }

  return {
    remoteOrdersMap,
    ordersToAddOrUpdateLocally,
    ordersToDeleteLocally,
    ordersToUpdateRemotely,
  };
}

/**
 * Re-reads live local orders after merge mutations so orders added or updated
 * while `isOrderSyncingInProgress` is true are still uploaded remotely.
 *
 * @param plannedRemoteUploads - Orders already queued for remote upload.
 * @param remoteOrdersMap - Remote orders keyed by storage key.
 * @param currentLocalOrders - Latest syncable local orders.
 * @returns Remote uploads using the freshest local payloads.
 */
function reconcileOrdersForRemoteUpload(
  plannedRemoteUploads: RampsOrder[],
  remoteOrdersMap: Map<string, SyncRampsOrder>,
  currentLocalOrders: RampsOrder[],
): RampsOrder[] {
  const keyedUploads = new Map(
    plannedRemoteUploads.map((order) => [createOrderStorageKey(order), order]),
  );

  for (const localOrder of currentLocalOrders) {
    const key = createOrderStorageKey(localOrder);
    const existingUpload = keyedUploads.get(key);
    const remoteOrder = remoteOrdersMap.get(key);

    if (existingUpload) {
      if (!areOrdersEqual(existingUpload, localOrder)) {
        keyedUploads.set(key, localOrder);
      }
      continue;
    }

    if (!remoteOrder || !areOrdersEqual(localOrder, remoteOrder)) {
      keyedUploads.set(key, localOrder);
    }
  }

  return [...keyedUploads.values()];
}

/**
 * Syncs V2 ramps orders between local {@link RampsController} state and User Storage.
 *
 * Handles first sync, new-device sync, merges, timestamp-based conflict resolution,
 * and remote soft-deletes.
 *
 * @param config - Optional callbacks for sync errors.
 * @param options - Parameters used for syncing operations.
 */
export async function syncOrdersWithUserStorage(
  config: SyncOrdersWithUserStorageConfig,
  options: OrderSyncingOptions,
): Promise<void> {
  const { getRampsControllerInstance, trace } = options;
  const { onOrderSyncErroneousSituation } = config;

  if (!canPerformOrderSyncing(options)) {
    return;
  }

  const controller = getRampsControllerInstance();
  // Set the semaphore before the remote fetch so overlapping sync calls and
  // incremental addOrder/removeOrder pushes cannot race the merge.
  controller.setIsOrderSyncingInProgress(true);

  try {
    const validRemoteOrders = (await getRemoteOrders(options, config)).filter(
      isSyncableOrder,
    );

    const performSync = async (): Promise<void> => {
      const getLocalOrders = (): RampsOrder[] =>
        controller.state.orders.filter(isSyncableOrder);

      const {
        remoteOrdersMap,
        ordersToAddOrUpdateLocally,
        ordersToDeleteLocally,
        ordersToUpdateRemotely,
      } = computeMergePlan(getLocalOrders(), validRemoteOrders);

      for (const order of ordersToDeleteLocally) {
        controller.removeOrder(createOrderStorageKey(order));
      }

      for (const order of ordersToAddOrUpdateLocally) {
        if (!order.deletedAt) {
          controller.addOrder(stripDeletedAt(order));
        }
      }

      const ordersToUpload = reconcileOrdersForRemoteUpload(
        ordersToUpdateRemotely,
        remoteOrdersMap,
        getLocalOrders(),
      );

      if (ordersToUpload.length > 0) {
        const syncedUploads: SyncRampsOrder[] = ordersToUpload.map(
          (localOrder) => ({
            ...stripSyncMetadata(localOrder),
            lastUpdatedAt:
              (localOrder as SyncRampsOrder).lastUpdatedAt ?? Date.now(),
          }),
        );
        await saveOrdersToUserStorage(syncedUploads, options);
      }
    };

    if (trace) {
      const localOrderCount =
        controller.state.orders.filter(isSyncableOrder).length;

      await trace(
        {
          name: TraceName.RampsOrderSyncFull,
          data: {
            localOrderCount,
            remoteOrderCount: validRemoteOrders.length,
            isFirstSync: validRemoteOrders.length === 0 && localOrderCount > 0,
            isNewDeviceSync:
              localOrderCount === 0 && validRemoteOrders.length > 0,
          },
        },
        performSync,
      );
      return;
    }

    await performSync();
  } catch (error) {
    onOrderSyncErroneousSituation?.('Error synchronizing ramps orders', {
      error,
    });
    throw error;
  } finally {
    controller.setIsOrderSyncingInProgress(false);
  }
}

/**
 * Retrieves remote ramps orders from User Storage.
 *
 * @param options - Parameters used for retrieving remote orders.
 * @param config - Optional sync callbacks for error reporting.
 * @returns Parsed sync-aware orders. Returns an empty array when none exist.
 */
async function getRemoteOrders(
  options: OrderSyncingOptions,
  config: SyncOrdersWithUserStorageConfig,
): Promise<SyncRampsOrder[]> {
  const { getMessenger } = options;
  const { onOrderSyncErroneousSituation } = config;

  try {
    const remoteOrdersJsonArray = await getMessenger().call(
      'UserStorageController:performGetStorageAllFeatureEntries',
      USER_STORAGE_RAMPS_ORDERS_FEATURE,
    );

    if (!remoteOrdersJsonArray || remoteOrdersJsonArray.length === 0) {
      return [];
    }

    const orders: SyncRampsOrder[] = [];

    for (const orderJson of remoteOrdersJsonArray) {
      try {
        const entry = JSON.parse(orderJson) as UserStorageRampsOrderEntry;
        orders.push(mapUserStorageEntryToRampsOrder(entry));
      } catch (error) {
        onOrderSyncErroneousSituation?.(
          'Failed to parse remote ramps order entry',
          { error, orderJson },
        );
      }
    }

    return orders;
  } catch (error) {
    onOrderSyncErroneousSituation?.('Failed to fetch remote ramps orders', {
      error,
    });
    throw error;
  }
}

/**
 * Saves orders to User Storage in a batch.
 *
 * @param orders - The orders to save.
 * @param options - Parameters used for saving orders.
 * @returns Resolves when the batch write completes.
 */
async function saveOrdersToUserStorage(
  orders: SyncRampsOrder[],
  options: OrderSyncingOptions,
): Promise<void> {
  const { getMessenger, trace } = options;

  const saveOrders = async (): Promise<void> => {
    const storageEntries: [string, string][] = orders.map((order) => {
      const key = createOrderStorageKey(order);
      const storageEntry = mapRampsOrderToUserStorageEntry(order);
      return [key, JSON.stringify(storageEntry)];
    });

    await getMessenger().call(
      'UserStorageController:performBatchSetStorage',
      USER_STORAGE_RAMPS_ORDERS_FEATURE,
      storageEntries,
    );
  };

  return trace
    ? await trace(
        {
          name: TraceName.RampsOrderSyncSaveBatch,
          data: {
            orderCount: orders.length,
            hasBatchOperations: orders.length > 1,
          },
        },
        saveOrders,
      )
    : await saveOrders();
}

/**
 * Updates a single order in remote storage without a full sync.
 *
 * @param order - The order that was updated locally.
 * @param options - Parameters used for syncing operations.
 * @returns Resolves when the remote update completes or no-ops.
 */
export async function updateOrderInRemoteStorage(
  order: RampsOrder,
  options: OrderSyncingOptions,
): Promise<void> {
  const { trace } = options;

  const updateOrder = async (): Promise<void> => {
    if (!canPerformOrderSyncing(options) || !isSyncableOrder(order)) {
      return;
    }

    const updatedEntry: SyncRampsOrder = {
      ...order,
      lastUpdatedAt: Date.now(),
    };

    await saveOrdersToUserStorage([updatedEntry], options);
  };

  if (trace) {
    return await trace(
      {
        name: TraceName.RampsOrderSyncUpdateRemote,
        data: {
          orderStatus: order.status,
          hasProviderOrderId: Boolean(order.providerOrderId),
        },
      },
      updateOrder,
    );
  }

  return await updateOrder();
}

/**
 * Marks a single order as deleted in remote storage (soft delete).
 *
 * @param order - The order that was deleted locally (needs id / providerOrderId).
 * @param options - Parameters used for syncing operations.
 * @returns Resolves when the remote soft-delete completes or no-ops.
 */
export async function deleteOrderInRemoteStorage(
  order: RampsOrder,
  options: OrderSyncingOptions,
): Promise<void> {
  const { trace } = options;

  const deleteOrder = async (): Promise<void> => {
    if (!canPerformOrderSyncing(options) || !isSyncableOrder(order)) {
      return;
    }

    const now = Date.now();
    const deletedOrder: SyncRampsOrder = {
      ...order,
      deletedAt: now,
      lastUpdatedAt: now,
    };

    await saveOrdersToUserStorage([deletedOrder], options);
  };

  return trace
    ? await trace({ name: TraceName.RampsOrderSyncDeleteRemote }, deleteOrder)
    : await deleteOrder();
}

export const orderSyncingTestExports = {
  computeMergePlan,
  reconcileOrdersForRemoteUpload,
  getOrderTimestamp,
};
