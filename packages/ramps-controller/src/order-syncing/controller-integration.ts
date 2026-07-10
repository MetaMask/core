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
  stripSyncMetadata,
} from './utils';

export type SyncOrdersWithUserStorageConfig = {
  onOrderSyncErroneousSituation?: (
    errorMessage: string,
    sentryContext?: Record<string, unknown>,
  ) => void;
};

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

  const localOrders =
    getRampsControllerInstance().state.orders.filter(isSyncableOrder);

  const remoteOrders = await getRemoteOrders(options);
  const validRemoteOrders = remoteOrders?.filter(isSyncableOrder) || [];

  const performSync = async () => {
    const controller = getRampsControllerInstance();
    try {
      controller.setIsOrderSyncingInProgress(true);

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
            ordersToDeleteLocally.push(remoteOrder);
          }
        } else if (!localOrder) {
          ordersToAddOrUpdateLocally.push(remoteOrder);
        } else if (!areOrdersEqual(localOrder, remoteOrder)) {
          const localTimestamp =
            (localOrder as SyncRampsOrder).lastUpdatedAt ||
            localOrder.createdAt ||
            0;
          const remoteTimestamp =
            remoteOrder.lastUpdatedAt || remoteOrder.createdAt || 0;

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

      for (const order of ordersToDeleteLocally) {
        controller.removeOrder(createOrderStorageKey(order));
      }

      for (const order of ordersToAddOrUpdateLocally) {
        if (!order.deletedAt) {
          controller.addOrder(stripSyncMetadata(order));
        }
      }

      if (ordersToUpdateRemotely.length > 0) {
        const updatedRemoteOrders: Record<string, SyncRampsOrder> = {};
        for (const localOrder of ordersToUpdateRemotely) {
          const key = createOrderStorageKey(localOrder);
          updatedRemoteOrders[key] = {
            ...remoteOrdersMap.get(key),
            ...localOrder,
            lastUpdatedAt: Date.now(),
          };
        }
        await saveOrdersToUserStorage(
          Object.values(updatedRemoteOrders),
          options,
        );
      }
    } catch (error) {
      if (onOrderSyncErroneousSituation) {
        onOrderSyncErroneousSituation('Error synchronizing ramps orders', {
          error,
        });
        throw error;
      }
      throw error;
    } finally {
      controller.setIsOrderSyncingInProgress(false);
    }
  };

  if (trace) {
    await trace(
      {
        name: TraceName.RampsOrderSyncFull,
        data: {
          localOrderCount: localOrders.length,
          remoteOrderCount: validRemoteOrders.length,
          isFirstSync:
            validRemoteOrders.length === 0 && localOrders.length > 0,
          isNewDeviceSync:
            localOrders.length === 0 && validRemoteOrders.length > 0,
        },
      },
      performSync,
    );
    return;
  }

  await performSync();
}

/**
 * Retrieves remote ramps orders from User Storage.
 *
 * @param options - Parameters used for retrieving remote orders.
 * @returns Array of sync-aware orders, or null if none found / on error.
 */
async function getRemoteOrders(
  options: OrderSyncingOptions,
): Promise<SyncRampsOrder[] | null> {
  const { getMessenger } = options;

  try {
    const remoteOrdersJsonArray = await getMessenger().call(
      'UserStorageController:performGetStorageAllFeatureEntries',
      USER_STORAGE_RAMPS_ORDERS_FEATURE,
    );

    if (!remoteOrdersJsonArray || remoteOrdersJsonArray.length === 0) {
      return null;
    }

    return remoteOrdersJsonArray.map((orderJson) => {
      const entry = JSON.parse(orderJson) as UserStorageRampsOrderEntry;
      return mapUserStorageEntryToRampsOrder(entry);
    });
  } catch {
    return null;
  }
}

/**
 * Saves orders to User Storage in a batch.
 *
 * @param orders - The orders to save.
 * @param options - Parameters used for saving orders.
 */
async function saveOrdersToUserStorage(
  orders: SyncRampsOrder[],
  options: OrderSyncingOptions,
): Promise<void> {
  const { getMessenger, trace } = options;

  const saveOrders = async () => {
    if (!orders || orders.length === 0) {
      return;
    }

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
 */
export async function updateOrderInRemoteStorage(
  order: RampsOrder,
  options: OrderSyncingOptions,
): Promise<void> {
  const { getMessenger, trace } = options;

  const updateOrder = async () => {
    if (!canPerformOrderSyncing(options) || !isSyncableOrder(order)) {
      return;
    }

    const updatedEntry: SyncRampsOrder = {
      ...order,
      lastUpdatedAt: Date.now(),
    };

    const key = createOrderStorageKey(order);
    const storageEntry = mapRampsOrderToUserStorageEntry(updatedEntry);

    await getMessenger().call(
      'UserStorageController:performSetStorage',
      `${USER_STORAGE_RAMPS_ORDERS_FEATURE}.${key}`,
      JSON.stringify(storageEntry),
    );
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
 */
export async function deleteOrderInRemoteStorage(
  order: Pick<RampsOrder, 'id' | 'providerOrderId'> | RampsOrder,
  options: OrderSyncingOptions,
): Promise<void> {
  const { getMessenger, trace } = options;

  const deleteOrder = async () => {
    if (!canPerformOrderSyncing(options)) {
      return;
    }

    const key = createOrderStorageKey(order);

    try {
      const existingOrderJson = await getMessenger().call(
        'UserStorageController:performGetStorage',
        `${USER_STORAGE_RAMPS_ORDERS_FEATURE}.${key}`,
      );

      if (existingOrderJson) {
        const existingStorageEntry = JSON.parse(
          existingOrderJson,
        ) as UserStorageRampsOrderEntry;
        const existingOrder =
          mapUserStorageEntryToRampsOrder(existingStorageEntry);

        const now = Date.now();
        const deletedOrder: SyncRampsOrder = {
          ...existingOrder,
          deletedAt: now,
          lastUpdatedAt: now,
        };

        const deletedStorageEntry =
          mapRampsOrderToUserStorageEntry(deletedOrder);

        await getMessenger().call(
          'UserStorageController:performSetStorage',
          `${USER_STORAGE_RAMPS_ORDERS_FEATURE}.${key}`,
          JSON.stringify(deletedStorageEntry),
        );
      }
    } catch {
      // Order not in remote storage — nothing to tombstone
    }
  };

  return trace
    ? await trace({ name: TraceName.RampsOrderSyncDeleteRemote }, deleteOrder)
    : await deleteOrder();
}
