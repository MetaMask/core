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

### Declaring the base URL (and its variants)

Next, we need to set the base URL of the API up front (this way we don't need to repeat it each time when we make a request).

In our case, we also need to figure out a way to allow the base URL to be dynamic depending on the environment. To do this, we'll have our constructor take an `env` option and then build the URL in the constructor:

```typescript
// [!code highlight:22]
/**
 * The environments the API is deployed under.
 */
// Note that we do not use an enum because they are not supported by Node's
// type-stripping feature, nor TypeScript's `erasableSyntaxOnly` option
const Env = {
  Development: 'dev',
  QA: 'qa',
  Production: 'prod'
} as const;

/**
 * A deployment environment.
 */
type Env = (typeof Env)[typeof keyof Env];

/**
 * @returns The base URL of the API that the service represents.
 */
function getBaseUrl(env: Env): string {
  return `https://orders.${env}.metamask.io`;
}

export class OrdersService extends BaseDataService<
  typeof DATA_SERVICE_NAME,
  OrdersServiceMessenger
> {
  // [!code highlight]
  readonly #baseUrl: string;

  constructor({
    messenger,
    // [!code highlight]
    env,
    queryClientConfig = {},
    policyOptions = {},
  }: {
    messenger: OrdersServiceMessenger;
    // [!code highlight]
    env: Env;
    queryClientConfig?: QueryClientConfig;
    policyOptions?: CreateServicePolicyOptions;
  }) {
    super({
      name: DATA_SERVICE_NAME,
      messenger,
      queryClientConfig,
      policyOptions,
    });

    // [!code highlight]
    this.#baseUrl = getBaseUrl(env);

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }
}
```

## Making requests

### Non-paginated queries

## Paginated queries

### Mutations

## Subscribing to data

### Polling

### WebSockets

## Writing tests
