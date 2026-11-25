import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LighterApiError } from '../../../src/services/LighterClientService.js';
import {
  ACCOUNT,
  buildProvider,
  fakeStreamCtor,
  ownershipController,
  StreamFakeWebSocket,
} from '../../helpers/lighterProvider.js';
import type { BuiltProvider } from '../../helpers/lighterProvider.js';
import type { Deferred } from '../../helpers/serviceMocks.js';
import { createDeferred } from '../../helpers/serviceMocks.js';

vi.mock(
  import('../../../src/services/LighterClientService'),
  async (importOriginal) => ({
    ...(await importOriginal()),
    LighterClientService: vi.fn(),
  }),
);
vi.mock('../../../src/services/LighterWalletService');

const route = { providerId: 'lighter' } as const;
const absent = { subAccounts: [] };
const tick = async (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

const streamProvider = (registeredKey?: string): BuiltProvider =>
  buildProvider({
    configuredAccountIndex: null,
    webSocketCtor: fakeStreamCtor,
    registeredKey,
  });

describe('Lighter exchange account status', () => {
  beforeEach(() => {
    StreamFakeWebSocket.instances = [];
  });

  it.each([
    [
      '21100',
      async (): Promise<never> => {
        throw new LighterApiError('not found', 21100);
      },
    ],
    ['empty list', async (): Promise<typeof absent> => absent],
  ] as const)(
    'retries %s and caches only the resolved master index without signing',
    async (_label, missing) => {
      const { provider, clientInstance, calls } = streamProvider();
      const lookup = clientInstance.getAccountsByL1Address;
      lookup.mockImplementationOnce(missing);
      lookup.mockResolvedValueOnce({
        subAccounts: [ACCOUNT, { ...ACCOUNT, index: 0 }],
      });
      expect(await provider.getExchangeAccountStatus(route)).toStrictEqual({
        registered: false,
      });
      const registered = { registered: true, accountIndex: 0 };
      expect(await provider.getExchangeAccountStatus(route)).toStrictEqual(
        registered,
      );
      expect(await provider.getExchangeAccountStatus(route)).toStrictEqual(
        registered,
      );
      expect(lookup).toHaveBeenCalledTimes(2);
      expect(StreamFakeWebSocket.instances).toHaveLength(0);
      expect(calls).toStrictEqual([]);
      expect(clientInstance.getApiKeys).not.toHaveBeenCalled();
      expect(clientInstance.getNextNonce).not.toHaveBeenCalled();
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    },
  );

  it('reports an invalid configured index as a venue error, not an unregistered wallet', async () => {
    const { provider, clientInstance } = buildProvider();
    const failure = new LighterApiError('not found', 21100);
    clientInstance.getAccountByIndex.mockRejectedValueOnce(failure);
    await expect(provider.getExchangeAccountStatus(route)).rejects.toBe(
      failure,
    );
    const { controller, host } = ownershipController(provider);
    await controller.init();
    expect(
      await host.messenger.call(
        'PerpsController:getExchangeAccountStatus',
        route,
      ),
    ).toStrictEqual({
      registered: true,
      accountIndex: ACCOUNT.index,
    });
    expect(clientInstance.getAccountsByL1Address).not.toHaveBeenCalled();
  });

  it.each([
    new LighterApiError('venue unavailable', 500),
    new Error('network down'),
  ])('propagates %s unchanged', async (error) => {
    const { provider, clientInstance } = streamProvider();
    clientInstance.getAccountsByL1Address.mockRejectedValueOnce(error);
    await expect(provider.getExchangeAccountStatus(route)).rejects.toBe(error);
  });

  it.each([
    [{ ...ACCOUNT, accountType: 1 }, 'Premium'],
    [{ ...ACCOUNT, l1Address: '0xdead' }, 'not owned'],
    [{ ...ACCOUNT, index: -1 }, 'index is invalid'],
  ] as const)(
    'rejects unusable accounts rather than reporting absence: %j',
    async (account, message) => {
      const { provider, clientInstance } = streamProvider();
      clientInstance.getAccountsByL1Address.mockResolvedValue({
        subAccounts: [account],
      });
      await expect(provider.getExchangeAccountStatus(route)).rejects.toThrow(
        message,
      );
    },
  );

  it('rejects a malformed list and a deselected wallet', async () => {
    const { provider, clientInstance, getUserAddressMock } = streamProvider();
    clientInstance.getAccountsByL1Address.mockResolvedValue({});
    await expect(provider.getExchangeAccountStatus(route)).rejects.toThrow(
      TypeError,
    );
    getUserAddressMock.mockImplementation(() => {
      throw new Error('no wallet');
    });
    await expect(provider.getExchangeAccountStatus(route)).rejects.toThrow(
      'no wallet',
    );
  });

  it.each([
    [
      'status',
      (provider): Promise<unknown> => provider.getExchangeAccountStatus(route),
    ],
    [
      'account read',
      (provider): Promise<unknown> => provider.getAccountState(),
    ],
    [
      'recovery inventory',
      (provider): Promise<unknown> => provider.getPendingManualRecoveries(),
    ],
  ] satisfies [
    string,
    (provider: BuiltProvider['provider']) => Promise<unknown>,
  ][])(
    'resumes the existing account stream when %s discovers the account',
    async (_label, lookup) => {
      const { provider, clientInstance } = streamProvider('9c'.repeat(40));
      clientInstance.getAccountsByL1Address.mockResolvedValueOnce(absent);
      const callback = vi.fn();
      const positions = vi.fn();
      provider.subscribeToAccount({ callback });
      provider.subscribeToPositions({ callback: positions });
      provider.subscribeToOrders({ callback: vi.fn() });
      await tick();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ totalBalance: '0' }),
      );
      expect(positions).toHaveBeenCalledWith([]);
      const [socket] = StreamFakeWebSocket.instances;
      socket.open();
      await lookup(provider);
      await tick();
      expect(
        socket.sent.map((frame): unknown => JSON.parse(frame)),
      ).toStrictEqual(
        expect.arrayContaining([
          ...[
            'user_stats/28',
            'account_all_positions/28',
            'account_all_trades/28',
          ].map((channel) => ({ type: 'subscribe', channel })),
          {
            type: 'subscribe',
            channel: 'account_all_orders/28',
            auth: 'auth-token',
          },
        ]),
      );
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'subscribed/user_stats',
          channel: 'user_stats:28',
          stats: {
            collateral: '100',
            portfolio_value: '110',
            leverage: '2',
            available_balance: '60',
            margin_usage: '40',
            buying_power: '0',
          },
        }),
      });
      expect(callback).toHaveBeenLastCalledWith(
        expect.objectContaining({
          totalBalance: '110',
          spendableBalance: '60',
        }),
      );
      expect(StreamFakeWebSocket.instances).toHaveLength(1);
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
      await provider.disconnect();
    },
  );

  it.each(['9c'.repeat(40), undefined])(
    'restores a balance-only stream without probing or using a trading key (%s)',
    async (registeredKey) => {
      const { provider, clientInstance, calls } = streamProvider(registeredKey);
      clientInstance.getAccountsByL1Address.mockResolvedValueOnce(absent);
      provider.subscribeToAccount({ callback: vi.fn() });
      await tick();
      const [socket] = StreamFakeWebSocket.instances;
      socket.open();
      await provider.getExchangeAccountStatus(route);
      await tick();
      expect(socket.sent).toContain(
        JSON.stringify({ type: 'subscribe', channel: 'user_stats/28' }),
      );
      expect(clientInstance.getNextNonce).not.toHaveBeenCalled();
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
      expect(calls).toStrictEqual([]);
      expect(clientInstance.getApiKeys).not.toHaveBeenCalled();

      // Once a registered trading key becomes available, the pending orders
      // channel joins the same socket without repeating the deposit check.
      clientInstance.getApiKeys.mockResolvedValue({
        apiKeys: [
          {
            accountIndex: ACCOUNT.index,
            apiKeyIndex: 7,
            publicKey: '9c'.repeat(40),
          },
        ],
      });
      await provider.getOpenOrders();
      await tick();
      expect(socket.sent).toContain(
        JSON.stringify({
          type: 'subscribe',
          channel: 'account_all_orders/28',
          auth: 'auth-token',
        }),
      );
      await provider.disconnect();
    },
  );

  it('does not lose a discovery that races an older empty stream lookup', async () => {
    const { provider, clientInstance } = streamProvider();
    const pending = createDeferred<typeof absent>();
    clientInstance.getAccountsByL1Address.mockReturnValueOnce(pending.promise);
    const callback = vi.fn();
    provider.subscribeToAccount({ callback });
    await tick();
    const [socket] = StreamFakeWebSocket.instances;
    socket.open();
    await provider.getExchangeAccountStatus(route);
    pending.resolve(absent);
    await tick();
    expect(socket.sent).toContain(
      JSON.stringify({ type: 'subscribe', channel: 'user_stats/28' }),
    );
    expect(callback).not.toHaveBeenCalledWith(
      expect.objectContaining({ totalBalance: '0' }),
    );
    await provider.disconnect();
  });

  it('does not resume channels after the last subscriber leaves', async () => {
    const { provider, clientInstance } = streamProvider();
    clientInstance.getAccountsByL1Address.mockResolvedValueOnce(absent);
    const unsubscribe = provider.subscribeToOrders({ callback: vi.fn() });
    await tick();
    const [socket] = StreamFakeWebSocket.instances;
    socket.open();
    unsubscribe();
    await provider.getExchangeAccountStatus(route);
    await tick();
    expect(socket.sent).toStrictEqual([]);
    expect(clientInstance.getApiKeys).not.toHaveBeenCalled();
    await provider.disconnect();
  });

  it('rejects a pending discovery on disconnect without reopening channels', async () => {
    const { provider, clientInstance } = streamProvider();
    const pending = createDeferred<unknown>();
    clientInstance.getAccountsByL1Address
      .mockResolvedValueOnce(absent)
      .mockReturnValueOnce(pending.promise);
    provider.subscribeToOrderFills({ callback: vi.fn() });
    await tick();
    const [socket] = StreamFakeWebSocket.instances;
    socket.open();
    const status = provider.getExchangeAccountStatus(route);
    await provider.disconnect();
    pending.resolve({ subAccounts: [ACCOUNT] });
    await expect(status).rejects.toThrow('disconnected');
    expect(socket.sent).toStrictEqual([]);
    expect(StreamFakeWebSocket.instances).toHaveLength(1);
  });

  it.each([
    ['present', (pending): void => pending.resolve({ subAccounts: [ACCOUNT] })],
    [
      'absent',
      (pending): void =>
        pending.reject(new LighterApiError('not found', 21100)),
    ],
  ] satisfies [string, (pending: Deferred<unknown>) => void][])(
    'discards the previous wallet’s delayed %s answer and opens channels only for the new wallet',
    async (_label, answer) => {
      const { provider, clientInstance, getUserAddressMock } = streamProvider();
      const delayed = createDeferred<unknown>();
      const nextAccount = { ...ACCOUNT, l1Address: '0xbbbb', index: 91 };
      clientInstance.getAccountsByL1Address
        .mockResolvedValueOnce(absent)
        .mockReturnValueOnce(delayed.promise)
        .mockResolvedValue({ subAccounts: [nextAccount] });
      provider.subscribeToAccount({ callback: vi.fn() });
      await tick();
      const status = provider.getExchangeAccountStatus(route);
      getUserAddressMock.mockReturnValue(nextAccount.l1Address);
      answer(delayed);
      expect(await status).toStrictEqual({
        registered: true,
        accountIndex: 91,
      });
      await tick();
      const [, socket] = StreamFakeWebSocket.instances;
      socket.open();
      await tick();
      expect(socket.sent).toContain(
        JSON.stringify({ type: 'subscribe', channel: 'user_stats/91' }),
      );
      expect(
        StreamFakeWebSocket.instances.flatMap((ws) => ws.sent).join(),
      ).not.toContain('/28');
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
      expect(await provider.getNotificationAccountIndex()).toBe(91);
      await provider.disconnect();
    },
  );
});
