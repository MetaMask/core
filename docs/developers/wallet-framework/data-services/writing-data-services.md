# How to write a data service

This guide demonstrate some of the features of data services by walking through an example.

## Requirements

Let's say that we're developing a terminal for advanced traders. We have a WebSocket API that gives us real-time data on orders and a HTTP API that allows to retrieve, place, and cancel orders as needed. Both APIs are deployed under three environments: `dev`, `qa`, and `prod`.

- The WebSocket API is available at `ws://orders.<environment>.metamask.io/`.
- The HTTP API is available at `https://orders.<environment>.metamask.io/` and has the following operations:
  - **GET `/v1/orders`**: Retrieve a paginated list of orders, limited to 100 at a time (latest first by default).
  - **POST `/v1/orders`**: Enqueue a new order for processing.
  - **GET `/v1/orders/:id`**: Retrieve data about an order, including its processing status.
  - **DELETE `/v1/orders/:id`**: Cancel a pending order.

## Setting up the data service

Before we can implement these APIs, we need to take care of some boilerplate.

Here are the steps we'll follow:

1. Decide on a name
2. Define the messenger
3. Define the class

### Deciding on a name

What should we call our data service? It's best if we choose a descriptive name that reflects the API that we are wrapping. Additionally, since data services are special within the Wallet Framework, it's conventional to end the name with "Service".

So, let's go with `OrdersService`. We'll set this in a constant because we'll need this at key points shortly:

```typescript
/**
 * The name of the {@link OrdersService}, used to namespace the service's
 * actions and events.
 */
export const DATA_SERVICE_NAME = 'OrdersService';
```

### Defining the messenger

Every data service has a messenger, an object which acts as a liaison, allowing other parts of the stack to access the data service without a direct reference to it.

For now this messenger will be empty, but we'll fill it in later:

```typescript
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
```

### Defining the class

### Accounting for environment-specific URLs

## Making requests

### Non-paginated queries

## Paginated queries

### Mutations

## Subscribing to data

### Polling

### WebSockets

## Writing tests
