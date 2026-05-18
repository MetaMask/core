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
2. Create a package
3. Define the messenger
4. Define the class

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

## Creating a package

We want our data service to live in its own package. (In practice, this step may not be necessary — it depends on your use case — but it makes this tutorial simpler.)

Working from this repo, we'll use the `create-package` tool to do just that:

```
yarn create-package --name orders-service --description "Wraps the Orders API"
```

That should give us a new directory in `packages/orders-service` which has a `src/` directory. We'll remove `index.ts` and `index.test.ts` so we have a clean slate.

### Defining the messenger

Every data service has a messenger, an object which acts as a liaison, allowing other parts of the stack to access the data service without a direct reference to it.

So the very first thing we'll do is open a file in `packages/orders-service/src/orders-service.ts` and define the type for the messenger:

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

// ...

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

If a data service class ought to represent a data source, then the methods in that class ought to represent an operation. Since our API has two operations, we'll add two methods.

### Requesting a list of orders

#### Writing the implementation

First, let's add a method to represent `GET /v1/orders`:

```typescript
import { HttpError } from '@metamask/controller-utils';
import type { Infer } from '@metamask/superstruct';
import {
  array,
  bigint,
  literal,
  number,
  refine,
  type,
  union,
  validate,
} from '@metamask/superstruct';
import {
  CaipChainIdStruct,
  HexAddressStruct,
  HexChecksumAddressStruct,
} from '@metamask/utils';

// ...

/**
 * A struct that represents a timestamp (number of seconds since the UNIX
 * epoch).
 */
const TimestampStruct = refine(number(), 'timestamp', (value) => {
  if (new Date(value).toString() === 'Invalid Date') {
    return 'Expected a valid timestamp';
  }
  return true;
});

/**
 * Struct to validate an order object that the Orders API returns.
 */
const OrderStruct = type({
  createdTime: TimestampStruct,
  fromAddress: HexAddressStruct,
  fromChainId: CaipChainIdStruct,
  status: union([
    literal('pending'),
    literal('completed'),
    literal('canceled'),
  ]),
  toAddress: HexAddressStruct,
  toChainId: CaipChainIdStruct,
  tokenAddress: HexChecksumAddressStruct,
  tokenAmount: bigint(),
  updatedTime: TimestampStruct,
});

/**
 * Struct to validate what `GET /v1/orders` returns.
 */
const FetchOrdersResponseStruct = type({
  orders: array(OrderStruct),
});
/**
 * The data that `GET /v1/orders` returns.
 */
type FetchOrdersResponse = Infer<typeof FetchOrdersResponseStruct>;

export class OrdersService extends BaseDataService</* ... */> {
  // ...

  /**
   * Uses the API to retrieve orders.
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
  }): Promise<FetchOrdersResponse> {
    const url = new URL('/v1/orders', BASE_URL);
    url.searchParams.append('sortField', sortField);
    url.searchParams.append('sortOrder', sortOrder);

    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:fetchOrders`, url.toString()],
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

    const [error, validJsonResponse] = validate(
      jsonResponse,
      FetchOrdersResponseStruct,
    );
    if (error) {
      throw new Error(
        `Malformed response received from Orders API (${error.toString()})`,
      );
    }

    return validatedJsonResponse;
  }
}
```

Let's break this down. Our endpoint takes two query parameters, so we have our method take a `params` object. We assign defaults for each key/value pair and map them to query parameters. Then we construct the URL.

```typescript
export class OrdersService extends BaseDataService</* ... */> {
  async fetchOrders({
    sortField = 'createdTime',
    sortOrder = 'asc',
  }: {
    sortField?: 'createdTime' | 'updatedTime';
    sortOrder?: 'asc' | 'desc';
  }): Promise</* ... */> {
    const url = new URL('/v1/orders', BASE_URL);
    url.searchParams.append('sortField', sortField);
    url.searchParams.append('sortOrder', sortOrder);

    // ...
  }
}
```

Now we call `fetchQuery` — a method in `BaseDataService` — to make the request. This uses TanStack Query under the hood, and so we make sure to give it two things:

1. A query key. Request caching is enabled by default, and the query key is what TanStack Query uses to identify requests in the cache.
2. A query function. This is what TanStack Query runs to fetch data.

Let's start with the `queryKey` option. This is an array that will get serialized to form the key. The first item must be the name of the action that we will register this method under. The remaining items are technically optional, but we want requests with different query parameters to get cached differently, and we can do this easily by using the URL as the second item.

```typescript
export class OrdersService extends BaseDataService</* ... */> {
  async fetchOrders(/* ... */): Promise</* ... */> {
    // ...

    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:fetchOrders`, url.toString()],
      // ...
    });

    // ...
  }
}
```

Now on to `queryFn`. There is nothing special about making the request itself, but afterward, we carry out two steps:

1. We check the HTTP status of the response and throw error if it is not within the 200-299 range. We use a special error, `HttpError`, which comes from `@metamask/controller-utils`.
2. We also attempt to parse the response as JSON.

We do these inside of our query function and not outside, because our query function will get automatically re-run if either of these steps fails:

```typescript
import { HttpError } from '@metamask/controller-utils';
// ...

export class OrdersService extends BaseDataService</* ... */> {
  async fetchOrders(/* ... */): Promise</* ... */> {
    // ...

    const jsonResponse = await this.fetchQuery({
      // ...
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

    // ...
  }
}
```

Finally, we end our method by handling the response. We want to ensure that the data we get back from the server is in a format we expect. We could simply typecast the response data, but instead, we use the [Superstruct](https://docs.superstructjs.org/) library to define a schema (making use of some utility schemas from `@metamask/utils`), and then we match the data against it. As a plus, we can use the schema to define `FetchOrdersResponse`:

```typescript
import type { Infer } from '@metamask/superstruct';
import {
  array,
  bigint,
  literal,
  number,
  refine,
  type,
  union,
  validate,
} from '@metamask/superstruct';
import {
  CaipChainIdStruct,
  HexAddressStruct,
  HexChecksumAddressStruct,
} from '@metamask/utils';

/**
 * A struct that represents a timestamp (number of seconds since the UNIX
 * epoch).
 */
const TimestampStruct = refine(number(), 'timestamp', (value) => {
  if (new Date(value).toString() === 'Invalid Date') {
    return 'Expected a valid timestamp';
  }
  return true;
});

/**
 * Struct to validate an order object that the Orders API returns.
 */
const OrderStruct = type({
  createdTime: TimestampStruct,
  fromAddress: HexAddressStruct,
  fromChainId: CaipChainIdStruct,
  status: union([
    literal('pending'),
    literal('completed'),
    literal('canceled'),
  ]),
  toAddress: HexAddressStruct,
  toChainId: CaipChainIdStruct,
  tokenAddress: HexChecksumAddressStruct,
  tokenAmount: bigint(),
  updatedTime: TimestampStruct,
});

/**
 * Struct to validate what `GET /v1/orders` returns.
 */
const FetchOrdersResponseStruct = type({
  orders: array(OrderStruct),
});

/**
 * The data that `GET /v1/orders` returns.
 */
type FetchOrdersResponse = Infer<typeof FetchOrdersResponseStruct>;

export class OrdersService extends BaseDataService</* ... */> {
  async fetchOrders(/* ... */): Promise<FetchOrdersResponse> {
    // ...

    const [error, validJsonResponse] = validate(
      jsonResponse,
      FetchOrdersResponseStruct,
    );
    if (error) {
      throw new Error(
        `Malformed response received from Orders API (${error.toString()})`,
      );
    }

    return validatedJsonResponse;
  }
}
```

Great, we now have a method called `fetchOrders` that wraps `GET /v1/orders`. Now we need to make sure to add it to `MESSENGER_EXPOSED_METHODS` so that it will become an action on the messenger:

```diff
- const MESSENGER_EXPOSED_METHODS = [] as const;
+ const MESSENGER_EXPOSED_METHODS = [
+   'fetchOrders',
+ ] as const;
```

Then we'll run `yarn workspace @metamask/orders-service run generate-action-types` to generate `packages/orders-service/src/orders-service-method-action-types.ts`, which should look like this:

```typescript
/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { OrdersService } from './orders-service';

/**
 * Uses the API to retrieve orders.
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
 * Union of all OrdersService action types.
 */
export type OrdersServiceMethodActions = OrdersServiceFetchOrdersAction;
```

#### Writing tests

Before we move on, we need to make sure to test the data service class we've come up with so far.

### Requesting details for an order

Now let's implement `GET /v1/orders/:id`. We'll do that by adding a `fetchOrder` method that follows the same steps as we did above.

```typescript
/**
 * Struct to validate what `GET /v1/orders/:id` returns.
 */
const FetchOrderResponseStruct = type({
  order: OrderStruct,
});

/**
 * The data that `GET /v1/orders/:id` returns.
 */
type FetchOrderResponse = Infer<typeof FetchOrderResponseStruct>;

export class OrdersService extends BaseDataService</* ... */> {
  // ...

  /**
   * Uses the API to retrieve details about an order.
   *
   * @param params - Parameters to qualify the request.
   * @param params.id - The order ID
   * orders.
   * @returns The requested order.
   */
  async fetchOrder({ id }: { id?: string }): Promise<FetchOrderResponse> {
    const url = new URL(`/v1/order/${id}`, BASE_URL);

    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:fetchOrder`, url.toString()],
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

    const [error, validatedJsonResponse] = validate(
      jsonResponse,
      FetchOrderResponseStruct,
    );
    if (error) {
      throw new Error(
        `Malformed response received from Orders API (${error.toString()})`,
      );
    }

    return validatedJsonResponse;
  }
}
```

We're almost
