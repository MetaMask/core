# Writing a Data Service, Part 2: Making Requests

In the [previous section](./01-getting-started.md), we started by creating a data service class and a messenger to go along with it.

Now we're ready to implement the main part of the data service. How do we do that?

If a data service class ought to represent a data source, then the methods in that class ought to represent an operation. Since our API has two operations, we'll add two methods.

## Requesting a list of orders

First, let's add a method to represent `GET /v1/orders`. It looks like this:

```typescript
import { HttpError } from '@metamask/controller-utils';
import type { Infer } from '@metamask/superstruct';
import {
  array,
  intersection,
  literal,
  number,
  optional,
  record,
  refine,
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
const OrderStruct = intersection([
  // Need to list this first, otherwise the inferred type is never
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
    createdTime: TimestampStruct,
    details: optional(record(string(), unknown())),
    from: CaipAccountIdStruct,
    orderId: string(),
    status: union([
      literal('pending'),
      literal('completed'),
      literal('canceled'),
    ]),
    to: CaipAccountIdStruct,
    updatedTime: TimestampStruct,
  }),
]);

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

Let's break that down:

### Building the URL

Our endpoint takes two query parameters, so we have our method take a `params` object. We assign defaults for each key/value pair and map them to query parameters. Then we construct the URL.

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

### Making the request

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

### Handling the response

Finally, we end our method by handling the response. We want to ensure that the data we get back from the server is in a format we expect. We could simply typecast the response data, but instead, we use the [Superstruct](https://docs.superstructjs.org/) library to define a schema (making use of some utility schemas from `@metamask/utils`), and then we match the data against it. As a plus, we can use the schema to define `FetchOrdersResponse`:

```typescript
import type { Infer } from '@metamask/superstruct';
import {
  array,
  intersection,
  literal,
  number,
  optional,
  record,
  refine,
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
const OrderStruct = intersection([
  // Need to list this first, otherwise the inferred type is never
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
    createdTime: TimestampStruct,
    details: optional(record(string(), unknown())),
    from: CaipAccountIdStruct,
    orderId: string(),
    status: union([
      literal('pending'),
      literal('completed'),
      literal('canceled'),
    ]),
    to: CaipAccountIdStruct,
    updatedTime: TimestampStruct,
  }),
]);

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

### Registering an action

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

## Writing tests

Before we move on, we need to make sure to test the data service class we've come up with so far.

### Setting up the tests

We'll need some way to instantiate our service class in each test along with its messenger, so we'll define a few test helpers:

```typescript
/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<OrdersServiceMessenger>,
  MessengerEvents<OrdersServiceMessenger>
>;

/**
 * Constructs the messenger populated with all external actions and events
 * required by the service under test.
 *
 * @returns The root messenger.
 */
function createRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the service under test.
 *
 * @param rootMessenger - The root messenger, with all external actions and
 * events required by the controller's messenger.
 * @returns The service-specific messenger.
 */
function createServiceMessenger(
  rootMessenger: RootMessenger,
): OrdersServiceMessenger {
  return new Messenger({
    namespace: 'OrdersService',
    parent: rootMessenger,
  });
}

/**
 * Constructs the service under test.
 *
 * @param args - The arguments to this function.
 * @param args.options - The options that the service constructor takes. All are
 * optional and will be filled in with defaults in as needed (including
 * `messenger`).
 * @returns The new service, root messenger, and service messenger.
 */
function createService({
  options = {},
}: {
  options?: Partial<ConstructorParameters<typeof OrdersService>[0]>;
} = {}): {
  service: OrdersService;
  rootMessenger: RootMessenger;
  messenger: OrdersServiceMessenger;
} {
  const rootMessenger = createRootMessenger();
  const messenger = createServiceMessenger(rootMessenger);
  const service = new OrdersService({
    messenger,
    ...options,
  });

  return { service, rootMessenger, messenger };
}
```

### Writing a basic test

Now we can write a test for the happy path. We define some response data we know will pass validation — it doesn't really matter what this is but we try to make it realistic — and we make a new service and fetch the orders.

You may notice that we test the messenger action, not the method. Why? Services are designed to be used in any part of the stack, so the main way that they will be used is through the messenger.

```typescript
const MOCK_VALID_RESPONSE_DATA = {
  orders: [
    {
      createdTime: 1747526400,
      details: {
        amount: '0xde0b6b3a7640000',
      },
      from: 'eip155:1:0xab16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb',
      objectId: 'eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d',
      orderId: '0000000000000000001',
      status: 'pending',
      to: 'bip122:000000000019d6689c085ae165831e93:128Lkh3S7CkDTBZ8W7BbpsN3YYizJMp8p6',
      type: 'token',
      updatedTime: 1747526400,
    },
    {
      createdTime: 1747440000,
      from: 'eip155:1:0xab16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb',
      objectId:
        'eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769',
      orderId: '0000000000000000002',
      status: 'completed',
      to: 'bip122:000000000019d6689c085ae165831e93:128Lkh3S7CkDTBZ8W7BbpsN3YYizJMp8p6',
      type: 'asset',
      updatedTime: 1747526400,
    },
  ],
} satisfies FetchOrdersResponse;

describe('OrdersService', () => {
  describe('OrdersService:fetchOrders', () => {
    it('requests orders with the default sortField and sortOrder', async () => {
      nock('https://api.example.com')
        .get('/v1/orders')
        .query({ sortField: 'createdTime', sortOrder: 'asc' })
        .reply(200, MOCK_VALID_RESPONSE_DATA);
      const { rootMessenger } = createService();

      const responseData = await rootMessenger.call(
        'OrdersService:fetchOrders',
      );

      expect(responseData).toStrictEqual(MOCK_VALID_RESPONSE_DATA);
    });
  });
});
```

If we run this by saying:

```
yarn workspace @metamask/orders-service run test
```

then we should see that all of our tests pass.

## Requesting details for an order

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
