/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { OrdersService } from './orders-service';

/**
 * Retrieves orders.
 *
 * @param params - Parameters to qualify the request.
 * @param params.sortField - The field by which to sort the list of orders.
 * @param params.sortOrder - The direction in which to sort the list of
 * orders.
 * @returns The orders from the API.
 */
export type OrdersServiceFetchOrdersAction = {
  type: `OrdersService:fetchOrders`;
  handler: OrdersService['fetchOrders'];
};

/**
 * Retrieves details about an order.
 *
 * @param id - The order ID.
 * @returns The requested order.
 */
export type OrdersServiceFetchOrderAction = {
  type: `OrdersService:fetchOrder`;
  handler: OrdersService['fetchOrder'];
};

/**
 * Union of all OrdersService action types.
 */
export type OrdersServiceMethodActions =
  | OrdersServiceFetchOrdersAction
  | OrdersServiceFetchOrderAction;
