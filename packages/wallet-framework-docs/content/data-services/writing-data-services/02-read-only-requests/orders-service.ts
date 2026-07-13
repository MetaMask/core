import { BaseDataService } from '@metamask/base-data-service';
import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import { HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { Infer } from '@metamask/superstruct';
import {
  array,
  integer,
  intersection,
  literal,
  optional,
  record,
  string,
  type,
  union,
  unknown,
  validate,
} from '@metamask/superstruct';
import {
  CaipAccountIdStruct,
  CaipAssetIdStruct,
  CaipAssetTypeStruct,
} from '@metamask/utils';
import type { QueryClientConfig } from '@tanstack/query-core';

import type { OrdersServiceMethodActions } from './orders-service-method-action-types';

/**
 * The name of the {@link OrdersService}, used to namespace the service's
 * actions and events.
 */
export const DATA_SERVICE_NAME = 'OrdersService';

/**
 * All of the methods within {@link OrdersService} that are exposed via the
 * messenger.
 */
const MESSENGER_EXPOSED_METHODS = ['fetchOrders', 'fetchOrder'] as const;

/**
 * Invalidates cached queries for {@link OrdersService}.
 */
export type OrdersServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof DATA_SERVICE_NAME>;

/**
 * Actions that {@link OrdersService} exposes to other consumers.
 */
export type OrdersServiceActions =
  | OrdersServiceInvalidateQueriesAction
  | OrdersServiceMethodActions;

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

/**
 * Struct to validate an order object that the Orders API returns.
 */
const ResponseOrderStruct = intersection([
  // Need to list this first in the intersection,
  // otherwise the inferred type is `never`.
  // See: <https://github.com/ianstormtaylor/superstruct/issues/1180>
  union([
    type({
      objectId: CaipAssetTypeStruct,
      type: literal('token'),
    }),
    type({
      objectId: CaipAssetIdStruct,
      type: literal('asset'),
    }),
  ]),
  type({
    createdTime: integer(),
    details: optional(record(string(), unknown())),
    from: CaipAccountIdStruct,
    orderId: string(),
    status: union([
      literal('pending'),
      literal('completed'),
      literal('canceled'),
    ]),
    to: CaipAccountIdStruct,
    updatedTime: integer(),
  }),
]);

/**
 * An order object that the Orders API returns.
 */
export type ResponseOrder = Infer<typeof ResponseOrderStruct>;

/**
 * Struct to validate what `GET /v1/orders` returns.
 */
const FetchOrdersResponseStruct = type({
  orders: array(ResponseOrderStruct),
});

/**
 * The data that `GET /v1/orders` returns.
 */
export type FetchOrdersResponse = Infer<typeof FetchOrdersResponseStruct>;

/**
 * Struct to validate what `GET /v1/orders/:id` returns.
 */
const FetchOrderResponseStruct = type({
  order: ResponseOrderStruct,
});

/**
 * The data that `GET /v1/orders/:id` returns.
 */
export type FetchOrderResponse = Infer<typeof FetchOrderResponseStruct>;

/**
 * The base URL of the API that the service represents.
 */
const BASE_URL = 'https://api.example.com';

/**
 * This service wraps the Orders API.
 */
export class OrdersService extends BaseDataService<
  typeof DATA_SERVICE_NAME,
  OrdersServiceMessenger
> {
  /**
   * Constructs a new OrdersService object.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.queryClientConfig - Configuration for the underlying TanStack
   * Query client.
   * @param args.policyOptions - Options to pass to `createServicePolicy`, which
   * is used to wrap each request. See {@link CreateServicePolicyOptions}.
   */
  constructor({
    messenger,
    queryClientConfig = {},
    policyOptions = {},
  }: {
    messenger: OrdersServiceMessenger;
    queryClientConfig?: QueryClientConfig;
    policyOptions?: CreateServicePolicyOptions;
  }) {
    super({
      name: DATA_SERVICE_NAME,
      messenger,
      queryClientConfig,
      policyOptions,
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Retrieves orders.
   *
   * @param params - Parameters to qualify the request.
   * @param params.sortField - The field by which to sort the list of orders.
   * @param params.sortOrder - The direction in which to sort the list of
   * orders.
   * @returns The orders from the API.
   */
  async fetchOrders({
    sortField = 'createdTime',
    sortOrder = 'asc',
  }: {
    sortField?: 'createdTime' | 'updatedTime';
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<FetchOrdersResponse> {
    const url = new URL('/v1/orders', BASE_URL);
    url.searchParams.append('sortField', sortField);
    url.searchParams.append('sortOrder', sortOrder);

    const responseData = await this.fetchQuery({
      queryKey: [`${this.name}:fetchOrders`, sortField, sortOrder],
      queryFn: async () => {
        const response = await fetch(url);

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Orders API failed with status '${response.status}'`,
          );
        }

        return response.json();
      },
    });

    const [error, validatedResponseData] = validate(
      responseData,
      FetchOrdersResponseStruct,
    );
    if (error) {
      throw new Error(
        `Malformed response received from Orders API (${error.toString()})`,
      );
    }

    return validatedResponseData;
  }

  /**
   * Retrieves details about an order.
   *
   * @param id - The order ID.
   * @returns The requested order.
   */
  async fetchOrder(id: string): Promise<FetchOrderResponse> {
    const url = new URL(`/v1/orders/${id}`, BASE_URL);

    const responseData = await this.fetchQuery({
      queryKey: [`${this.name}:fetchOrder`, id],
      queryFn: async () => {
        const response = await fetch(url);

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Orders API failed with status '${response.status}'`,
          );
        }

        return response.json();
      },
    });

    const [error, validatedResponseData] = validate(
      responseData,
      FetchOrderResponseStruct,
    );
    if (error) {
      throw new Error(
        `Malformed response received from Orders API (${error.toString()})`,
      );
    }

    return validatedResponseData;
  }
}
