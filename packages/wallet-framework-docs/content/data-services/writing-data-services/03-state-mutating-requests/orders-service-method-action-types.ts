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
 * Creates an order.
 *
 * @param params - The params.
 * @param params.details - Extra data with which to create the order.
 * @param params.from - The sender.
 * @param params.objectId - The ID of the object being sent. If `type` is
 * "asset", a CAIP-19 asset ID; if `type` is "token", a CAIP-19 asset type.
 * @param params.to - The recipient.
 * @param params.type - The type of object being sent (either "asset" or
 * "token").
 * @returns The created order.
 */
export type OrdersServiceCreateOrderAction = {
  type: `OrdersService:createOrder`;
  handler: OrdersService['createOrder'];
};

/**
 * Cancels an order.
 *
 * @param id - The order ID.
 */
export type OrdersServiceCancelOrderAction = {
  type: `OrdersService:cancelOrder`;
  handler: OrdersService['cancelOrder'];
};

/**
 * Union of all OrdersService action types.
 */
export type OrdersServiceMethodActions =
  | OrdersServiceFetchOrdersAction
  | OrdersServiceFetchOrderAction
  | OrdersServiceCreateOrderAction
  | OrdersServiceCancelOrderAction;
