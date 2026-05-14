import { BaseDataService } from '@metamask/base-data-service';
import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import type { Messenger } from '@metamask/messenger';

/**
 * The name of the {@link OrdersService}, used to namespace the service's
 * actions and events.
 */
export const DATA_SERVICE_NAME = 'OrdersService';

/**
 * All of the methods within {@link OrdersService} that are exposed via the
 * messenger.
 */
const MESSENGER_EXPOSED_METHODS = [] as const;

/**
 * Invalidates cached queries for {@link OrdersService}.
 */
export type OrdersServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof DATA_SERVICE_NAME>;

/**
 * Actions that {@link OrdersService} exposes to other consumers.
 */
export type OrdersServiceActions = OrdersServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link OrdersService} calls.
 */
type AllowedActions = never;

/**
 * Published when {@link OrdersService}'s cache is updated.
 */
export type OrdersServiceCacheUpdatedEvent = DataServiceCacheUpdatedEvent<
  typeof DATA_SERVICE_NAME
>;

/**
 * Published when a key within {@link OrdersService}'s cache is updated.
 */
export type OrdersServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof DATA_SERVICE_NAME>;

/**
 * Events that {@link OrdersService} exposes to other consumers.
 */
export type OrdersServiceEvents =
  | OrdersServiceCacheUpdatedEvent
  | OrdersServiceGranularCacheUpdatedEvent;

/**
 * Events from other messengers that {@link OrdersService} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by {@link
 * OrdersService}.
 */
export type OrdersServiceMessenger = Messenger<
  typeof DATA_SERVICE_NAME,
  OrdersServiceActions | AllowedActions,
  OrdersServiceEvents | AllowedEvents
>;
