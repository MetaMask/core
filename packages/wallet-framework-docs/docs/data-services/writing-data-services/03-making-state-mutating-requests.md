# Writing a Data Service, Part 3: Making State-Mutating Requests

In [part 1](./01-getting-started.md) and [part 2](./02-making-requests.md) of this tutorial we've created a service class that handles the following API:

- **GET `/v1/orders`**: Retrieve a paginated list of orders, limited to 100 at a time (latest first by default).
- **GET `/v1/orders/:id`**: Retrieve data about an order.

Let's say that our API now allows us to place and cancel orders as needed. Now we have the following operations:

- **POST `/v1/orders`**: Enqueue a new order for processing.
- **DELETE `/v1/orders/:id`**: Cancel a pending order.

Up to now, the operations we've supported are read-only, but the new operations are different, because they can change data on the server side. <!-- TanStack Query — one of the libraries that data services use the hood — calls these requests "mutations". -->

Let's now add these to our data service.

## Creating a new order

First we'll add some types:

```diff title="packages/orders-service/src/orders-service.ts"
  /**
   * An order object that the Orders API returns.
   */
  export type ResponseOrder = Infer<typeof ResponseOrderStruct>;
+
+ /**
+  * The arguments for `createOrder`.
+  */
+ export type CreateOrderParams = Omit<
+   ResponseOrder,
+   'createdTime' | 'orderId' | 'status' | 'updatedTime'
+ >;
```

Now we'll add a new method. <!-- Note that whereas we used `fetchQuery` to make requests previously, now we'll want to use `createMutation`. --> Note the following:

- We pass `method` and `body` to the `fetch` function.
- We pass a `staleTime` of 0 to `fetchQuery`. This instructs TanStack Query not to cache these kinds of requests.
- We reuse `FetchOrderResponse` and `FetchOrderResponseStruct`, which we [previously defined for `fetchOrder`](./02-making-requests.md#handling-the-response).

```typescript title="packages/orders-service/src/orders-service.ts"
export class OrdersService extends BaseDataService</* ... */> {
  // ...

  /**
   * Retrieves details about an order.
   *
   * @param params - The order ID.
   * @returns The requested order.
   */
  async createOrder(params: CreateOrderParams): Promise<FetchOrderResponse> {
    const url = new URL(`/v1/orders`, BASE_URL);

    const responseData = await this.fetchQuery({
      queryKey: [`${this.name}:createOrder`, url.toString()],
      queryFn: async () => {
        const response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify(params),
        });

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Orders API failed with status '${response.status}'`,
          );
        }

        return response.json();
      },
      staleTime: 0,
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
```

As with `fetchOrders` and `fetchOrder`, we'll register an action for the new method:

```diff title="packages/orders-service/src/orders-service.ts"
  const MESSENGER_EXPOSED_METHODS = [
    'fetchOrders',
    'fetchOrder',
+   'createOrder',
  ] as const;
```

We'll run `yarn workspace @metamask/orders-service run generate-action-types` and see that `packages/orders-service/src/orders-service-method-action-types.ts` has this additional content:

```diff title="packages/orders-service/src/orders-service.ts"
+
+ /**
+  * Retrieves details about an order.
+  *
+  * @param params - The order ID.
+  * @returns The requested order.
+  */
+ export type OrdersServiceCreateOrderAction = {
+   type: `OrdersService:createOrder`;
+   handler: OrdersService['createOrder'];
+ };

  /**
   * Union of all OrdersService action types.
   */
  export type OrdersServiceMethodActions =
    | OrdersServiceFetchOrdersAction
-   | OrdersServiceFetchOrderAction;
+   | OrdersServiceFetchOrderAction
+   | OrdersServiceCreateOrderAction;
```

Finally, we'll write tests. We'll update the mock objects at the top of the test:

```diff title="packages/orders-service/src/orders-service.test.ts"
+ const MOCK_ORDER = {
+   details: {
+     amount: '0xde0b6b3a7640000',
+   },
+   from: 'eip155:1:0xab16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb',
+   objectId: 'eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d',
+   to: 'bip122:000000000019d6689c085ae165831e93:128Lkh3S7CkDTBZ8W7BbpsN3YYizJMp8p6',
+   type: 'token',
+ } satisfies CreateOrderParams;
+
  const MOCK_VALID_ORDER_RESPONSE_DATA = {
    order: {
-     createdTime: 1747526400,
-     details: {
-       amount: '0xde0b6b3a7640000',
-     },
-     from: 'eip155:1:0xab16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb',
-     objectId: 'eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d',
-     orderId: '0000000000000000001',
-     status: 'pending',
-     to: 'bip122:000000000019d6689c085ae165831e93:128Lkh3S7CkDTBZ8W7BbpsN3YYizJMp8p6',
-     type: 'token',
-     updatedTime: 1747526400,
+     ...MOCK_ORDER,
+     orderId: '0000000000000000001',
+     createdTime: 1747526400,
+     updatedTime: 1747526400,
+     status: 'pending',
    },
  } satisfies FetchOrderResponse;
```

## Adding tests

Then we'll add the new tests:

```typescript title="packages/orders-service/src/orders-service.test.ts"
describe('OrdersService', () => {
  // ...

  describe('OrdersService:createOrder', () => {
    it('creates an order', async () => {
      nock('https://api.example.com')
        .post('/v1/orders')
        .reply(200, MOCK_VALID_ORDER_RESPONSE_DATA);
      const { rootMessenger } = createService();

      const responseData = await rootMessenger.call(
        'OrdersService:createOrder',
        MOCK_ORDER,
      );

      expect(responseData).toStrictEqual(MOCK_VALID_ORDER_RESPONSE_DATA);
    });

    it('throws if the API returns a non-200 status', async () => {
      nock('https://api.example.com')
        .post('/v1/orders')
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(500);
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('OrdersService:createOrder', MOCK_ORDER),
      ).rejects.toThrow("Orders API failed with status '500'");
    });

    it.each([
      'not an object',
      { missing: 'order' },
      { order: 'not an array' },
      { order: ['not an object'] },
      {
        order: {
          ...MOCK_VALID_ORDER_RESPONSE_DATA.order,
          createdTime: 'not a timestamp',
        },
      },
      {
        order: {
          ...MOCK_VALID_ORDER_RESPONSE_DATA.order,
          createdTime: 2 ** 53 - 1,
        },
      },
      {
        order: {
          ...MOCK_VALID_ORDER_RESPONSE_DATA.order,
          details: 'not an object',
        },
      },
      {
        order: {
          ...MOCK_VALID_ORDER_RESPONSE_DATA.order,
          from: 'not a CAIP account ID',
        },
      },
      {
        order: {
          ...MOCK_VALID_ORDER_RESPONSE_DATA.order,
          orderId: {
            not: 'a string',
          },
        },
      },
      {
        order: {
          ...MOCK_VALID_ORDER_RESPONSE_DATA.order,
          status: 'not a valid status',
        },
      },
      {
        order: {
          ...MOCK_VALID_ORDER_RESPONSE_DATA.order,
          to: 'not a CAIP account ID',
        },
      },
      {
        order: {
          ...MOCK_VALID_ORDER_RESPONSE_DATA.order,
          updatedTime: 'not a timestamp',
        },
      },
      {
        order: {
          ...MOCK_VALID_ORDER_RESPONSE_DATA.order,
          objectId: 'not a CAIP asset type',
        },
      },
      {
        order: {
          ...MOCK_VALID_ORDER_RESPONSE_DATA.order,
          type: 'not a valid type',
        },
      },
    ])(
      'throws if the API returns a malformed response %o',
      async (response) => {
        nock('https://api.example.com')
          .post('/v1/orders')
          .reply(200, JSON.stringify(response));
        const { rootMessenger } = createService();

        await expect(
          rootMessenger.call('OrdersService:createOrder', MOCK_ORDER),
        ).rejects.toThrow('Malformed response received from Orders API');
      },
    );

    it('does not cache requests', async () => {
      const scope = nock('https://api.example.com')
        .post('/v1/orders')
        .times(2)
        .reply(200, MOCK_VALID_ORDER_RESPONSE_DATA);
      const { rootMessenger } = createService();

      await rootMessenger.call('OrdersService:createOrder', MOCK_ORDER);
      await rootMessenger.call('OrdersService:createOrder', MOCK_ORDER);
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('createOrder', () => {
    it('requests an order from the API, same as the method', async () => {
      nock('https://api.example.com')
        .post('/v1/orders')
        .reply(200, MOCK_VALID_ORDER_RESPONSE_DATA);
      const { service } = createService();

      const responseData = await service.createOrder(MOCK_ORDER);

      expect(responseData).toStrictEqual(MOCK_VALID_ORDER_RESPONSE_DATA);
    });
  });
});
```

## Summary

In this section we added two methods, `createOrder` and `deleteOrder`, which use `POST` and `DELETE` HTTP methods to change the state of the server.

Here's what we have so far:

```typescript title="packages/orders-service/src/orders-service.ts"
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
const MESSENGER_EXPOSED_METHODS = [
  'fetchOrders',
  'fetchOrder',
  'createOrder',
] as const;

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
const ResponseOrderStruct = intersection([
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
 * The arguments for `createOrder`.
 */
export type CreateOrderParams = Omit<
  ResponseOrder,
  'createdTime' | 'orderId' | 'status' | 'updatedTime'
>;

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

  /**
   * Retrieves details about an order.
   *
   * @param params - The order ID.
   * @returns The requested order.
   */
  async createOrder(params: CreateOrderParams): Promise<FetchOrderResponse> {
    const url = new URL(`/v1/orders`, BASE_URL);

    const responseData = await this.fetchQuery({
      queryKey: [`${this.name}:createOrder`, url.toString()],
      queryFn: async () => {
        const response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify(params),
        });

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Orders API failed with status '${response.status}'`,
          );
        }

        return response.json();
      },
      staleTime: 0,
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
```

What else might we want to add to our data service? In the next section we'll discuss how to incorporate real-time updates.

---

Continue to [**Part 4: Real-Time Updates**](./04-real-time-updates.md) →
