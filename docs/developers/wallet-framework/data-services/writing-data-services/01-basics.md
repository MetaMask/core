# How to write a data service (part 1)

In this tutorial, we'll show you how to write a data service.

This tutorial is divided into 3 parts. In the first part, we'll start with a basic example, and then later, we'll demonstrate some more advanced use cases.

## Requirements

Let's say that we're developing a terminal for advanced traders. We have an HTTP API that allows us to retrieve orders that all users are making. This API has the following operations:

- **GET `/v1/orders`**: Retrieve a paginated list of orders, limited to 100 at a time (latest first by default).
- **GET `/v1/orders/:id`**: Retrieve data about an order.

We want to write a data service that represents this API.

## Setting up the data service

First, we need to take care of some boilerplate. Here are the steps we'll follow:

1. Decide on a name
2. Define the messenger
3. Define the class

### Deciding on a name

What should we call our data service? A data service is intended to represent a singular data source, so it's best if we choose a descriptive name that reflects the API that we are wrapping. Additionally, since data services are special within the Wallet Framework, it's conventional to end the name with "Service".

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

We'll first define the type for the messenger:

```typescript
import type { Messenger } from '@metamask/messenger';

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link OrdersService}.
 */
export type OrdersServiceMessenger = Messenger<
  typeof DATA_SERVICE_NAME,
  OrdersServiceActions | AllowedActions,
  OrdersServiceEvents | AllowedEvents
>;
```

Note that the `Messenger` takes three type parameters:

- A namespace for all owned actions and events
- A union type representing all actions that the messenger recognizes, which can be divided into:
  - All internal actions, those that the messenger owns and "exports" to other messengers
  - All external actions, those that the messenger "imports" from other messengers
- A union type representing all events that the messenger recognizes, which can similarly be divided into
  - All internal actions, those that the messenger owns and "exports" to other messengers
  - All external events, those that the messenger "imports" from other messengers

We've already defined the namespace, so let's define `OrdersServiceActions`. The set of internal actions for a data service must at least include `<DataServiceName>:invalidateQueries`:

```typescript
import type { DataServiceInvalidateQueriesAction } from '@metamask/base-data-service';

/**
 * Invalidates cached queries for {@link OrdersService}.
 */
export type OrdersServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof DATA_SERVICE_NAME>;

/**
 * Actions that {@link OrdersService} exposes to other consumers.
 */
export type OrdersServiceActions = OrdersServiceInvalidateQueriesAction;
```

Then we define `OrdersServiceEvents`. The set of events for a data service must at least include `<DataServiceName>:granularCacheUpdated` and `<DataServiceName>:cacheUpdated`:

```typescript
// [!code highlight:3]
import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service'; // [!code highlight:21]

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
```

Our data service won't use any external actions or events. For completeness, however, we will also define `AllowedActions` and `AllowedEvents`:

```typescript
/**
 * Events from other messengers that {@link OrdersService} subscribes to.
 */
type AllowedEvents = never;

/**
 * Events from other messengers that {@link OrdersService} subscribes to.
 */
type AllowedEvents = never;
```

Finally, we define a constant that will be used to hold methods that should be automatically exposed through the messenger. We'll talk about that shortly:

```typescript
/**
 * All of the methods within {@link OrdersService} that are exposed via the
 * messenger.
 */
const MESSENGER_EXPOSED_METHODS = [] as const;
```

### Defining the class

Now we need to define the data service class itself. We extend `BaseDataService`, passing it the name of the service and the messenger type. We also define a constructor which takes a messenger and options for the underlying query client and policy object and passes them to the parent along with the name:

```typescript
import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import type { QueryClientConfig } from '@tanstack/query-core';

/**
 * This service wraps the HTTP and WebSocket Orders APIs.
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
}
```

## Making requests

Now we're ready to implement the main part of the data service. How do we do that?

If a data service class ought to represent a data source, then the methods in that class ought to represent an operation. Since our API has two operations, we'll add two methods:
