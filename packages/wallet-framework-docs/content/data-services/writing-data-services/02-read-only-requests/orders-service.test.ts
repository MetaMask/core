import { DEFAULT_MAX_RETRIES } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock from 'nock';

import type {
  FetchOrderResponse,
  FetchOrdersResponse,
  OrdersServiceMessenger,
} from './orders-service';
import { OrdersService } from './orders-service';

const MOCK_VALID_ORDERS_RESPONSE_DATA = {
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

const MOCK_VALID_ORDER_RESPONSE_DATA = {
  order: MOCK_VALID_ORDERS_RESPONSE_DATA.orders[0],
} satisfies FetchOrderResponse;

describe('OrdersService', () => {
  describe('OrdersService:fetchOrders', () => {
    it('requests orders with the default sortField and sortOrder', async () => {
      nock('https://api.example.com')
        .get('/v1/orders')
        .query({ sortField: 'createdTime', sortOrder: 'asc' })
        .reply(200, MOCK_VALID_ORDERS_RESPONSE_DATA);
      const { rootMessenger } = createService();

      const responseData = await rootMessenger.call(
        'OrdersService:fetchOrders',
      );

      expect(responseData).toStrictEqual(MOCK_VALID_ORDERS_RESPONSE_DATA);
    });

    it('requests orders with the given sortField and sortOrder', async () => {
      nock('https://api.example.com')
        .get('/v1/orders')
        .query({ sortField: 'updatedTime', sortOrder: 'desc' })
        .reply(200, MOCK_VALID_ORDERS_RESPONSE_DATA);
      const { rootMessenger } = createService();

      const responseData = await rootMessenger.call(
        'OrdersService:fetchOrders',
        {
          sortField: 'updatedTime',
          sortOrder: 'desc',
        },
      );

      expect(responseData).toStrictEqual(MOCK_VALID_ORDERS_RESPONSE_DATA);
    });

    it('throws if the API returns a non-200 status', async () => {
      nock('https://api.example.com')
        .get('/v1/orders')
        .query({ sortField: 'createdTime', sortOrder: 'asc' })
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(500);
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('OrdersService:fetchOrders'),
      ).rejects.toThrow("Orders API failed with status '500'");
    });

    it.each([
      'not an object',
      { missing: 'orders' },
      { orders: 'not an array' },
      { orders: ['not an object'] },
      {
        orders: [
          {
            ...MOCK_VALID_ORDERS_RESPONSE_DATA.orders[0],
            createdTime: 'not a timestamp',
          },
        ],
      },
      {
        orders: [
          {
            ...MOCK_VALID_ORDERS_RESPONSE_DATA.orders[0],
            createdTime: 2 ** 53 - 1,
          },
        ],
      },
      {
        orders: [
          {
            ...MOCK_VALID_ORDERS_RESPONSE_DATA.orders[0],
            details: 'not an object',
          },
        ],
      },
      {
        orders: [
          {
            ...MOCK_VALID_ORDERS_RESPONSE_DATA.orders[0],
            from: 'not a CAIP account ID',
          },
        ],
      },
      {
        orders: [
          {
            ...MOCK_VALID_ORDERS_RESPONSE_DATA.orders[0],
            orderId: {
              not: 'a string',
            },
          },
        ],
      },
      {
        orders: [
          {
            ...MOCK_VALID_ORDERS_RESPONSE_DATA.orders[0],
            status: 'not a valid status',
          },
        ],
      },
      {
        orders: [
          {
            ...MOCK_VALID_ORDERS_RESPONSE_DATA.orders[0],
            to: 'not a CAIP account ID',
          },
        ],
      },
      {
        orders: [
          {
            ...MOCK_VALID_ORDERS_RESPONSE_DATA.orders[0],
            updatedTime: 'not a timestamp',
          },
        ],
      },
      {
        orders: [
          {
            ...MOCK_VALID_ORDERS_RESPONSE_DATA.orders[0],
            objectId: 'not a CAIP asset type',
          },
        ],
      },
      {
        orders: [
          {
            ...MOCK_VALID_ORDERS_RESPONSE_DATA.orders[0],
            type: 'not a valid type',
          },
        ],
      },
    ])(
      'throws if the API returns a malformed response %o',
      async (response) => {
        nock('https://api.example.com')
          .get('/v1/orders')
          .query({ sortField: 'createdTime', sortOrder: 'asc' })
          .reply(200, JSON.stringify(response));
        const { rootMessenger } = createService();

        await expect(
          rootMessenger.call('OrdersService:fetchOrders'),
        ).rejects.toThrow('Malformed response received from Orders API');
      },
    );
  });

  describe('fetchOrders', () => {
    it('requests orders from the API, same as the messenger action', async () => {
      nock('https://api.example.com')
        .get('/v1/orders')
        .query({ sortField: 'createdTime', sortOrder: 'asc' })
        .reply(200, MOCK_VALID_ORDERS_RESPONSE_DATA);
      const { service } = createService();

      const responseData = await service.fetchOrders();

      expect(responseData).toStrictEqual(MOCK_VALID_ORDERS_RESPONSE_DATA);
    });
  });

  describe('OrdersService:fetchOrder', () => {
    it('requests an order with the default sortField and sortOrder', async () => {
      nock('https://api.example.com')
        .get('/v1/orders/AAAA-BBBB-CCCC-DDDD')
        .reply(200, MOCK_VALID_ORDER_RESPONSE_DATA);
      const { rootMessenger } = createService();

      const responseData = await rootMessenger.call(
        'OrdersService:fetchOrder',
        'AAAA-BBBB-CCCC-DDDD',
      );

      expect(responseData).toStrictEqual(MOCK_VALID_ORDER_RESPONSE_DATA);
    });

    it('throws if the API returns a non-200 status', async () => {
      nock('https://api.example.com')
        .get('/v1/orders/AAAA-BBBB-CCCC-DDDD')
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(500);
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('OrdersService:fetchOrder', 'AAAA-BBBB-CCCC-DDDD'),
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
          .get('/v1/orders/AAAA-BBBB-CCCC-DDDD')
          .reply(200, JSON.stringify(response));
        const { rootMessenger } = createService();

        await expect(
          rootMessenger.call('OrdersService:fetchOrder', 'AAAA-BBBB-CCCC-DDDD'),
        ).rejects.toThrow('Malformed response received from Orders API');
      },
    );
  });

  describe('fetchOrder', () => {
    it('requests an order from the API, same as the messenger action', async () => {
      nock('https://api.example.com')
        .get('/v1/orders/AAAA-BBBB-CCCC-DDDD')
        .reply(200, MOCK_VALID_ORDER_RESPONSE_DATA);
      const { service } = createService();

      const responseData = await service.fetchOrder('AAAA-BBBB-CCCC-DDDD');

      expect(responseData).toStrictEqual(MOCK_VALID_ORDER_RESPONSE_DATA);
    });
  });
});

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
