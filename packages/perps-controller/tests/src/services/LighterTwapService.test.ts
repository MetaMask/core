import type { LighterClientService } from '../../../src/services/LighterClientService.js';
import { LighterTwapService } from '../../../src/services/LighterTwapService.js';
import type {
  LighterTwapIntent,
  LighterTwapRecord,
} from '../../../src/services/LighterTwapService.js';

const intent: LighterTwapIntent = {
  owner: {
    wallet: '0xabc',
    network: 'testnet',
    accountIndex: 28,
    apiKeyIndex: 3,
  },
  symbol: 'SOL',
  marketId: 4097,
  clientOrderId: '123',
  size: '0.15',
  price: '121',
  isBuy: true,
  reduceOnly: false,
  sizeDecimals: 3,
  priceDecimals: 3,
  durationMinutes: 1,
  startedAt: 1_800_000_000_000,
  orderExpiry: 1_800_000_060_000,
};
const identity = { nonce: 4, txHash: 'abcd', expiresAt: 1_800_000_100_000 };

const readDisk = (raw: string): { records: LighterTwapRecord[] } =>
  JSON.parse(raw) as { records: LighterTwapRecord[] };

const build = (
  disk = new Map<string, string>(),
  terminalMappingVerified = false,
): {
  service: LighterTwapService;
  storage: {
    getItem: jest.Mock<Promise<string | null>, [string]>;
    setItem: jest.Mock<Promise<void>, [string, string]>;
  };
  disk: Map<string, string>;
  assertCurrent: jest.Mock;
} => {
  const storage = {
    getItem: jest.fn(async (key: string) => disk.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      disk.set(key, value);
    }),
  };
  const assertCurrent = jest.fn();
  const service = new LighterTwapService({
    storage,
    assertCurrent,
    terminalMappingVerified,
  });
  return { service, storage, disk, assertCurrent };
};

describe('LighterTwapService durable ownership', () => {
  it('persists immutable intent and exact dispatch identity before transport', async () => {
    const { service, disk } = build();
    await service.place(intent, async (hooks) => {
      expect(readDisk([...disk.values()][0]).records[0].intent).toStrictEqual(
        intent,
      );
      await hooks.signed(identity);
      await hooks.beforeDispatch();
      expect(
        readDisk([...disk.values()][0]).records[0].placement,
      ).toMatchObject({ ...identity, phase: 'attempted' });
    });
    expect((await service.list(intent.owner))[0].placement.phase).toBe(
      'acknowledged',
    );
  });

  it('retains uncertain dispatch after a lost response and refuses replay after restart', async () => {
    const { service, disk } = build();
    await expect(
      service.place(intent, async (hooks) => {
        await hooks.signed(identity);
        await hooks.beforeDispatch();
        throw new Error('response lost');
      }),
    ).rejects.toThrow('response lost');
    const restarted = build(disk).service;
    expect((await restarted.list(intent.owner))[0].placement.phase).toBe(
      'attempted',
    );
    const send = jest.fn();
    await expect(restarted.place(intent, send)).rejects.toThrow(
      'already tracked',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses dispatch when persistence fails', async () => {
    const { service, storage } = build();
    storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    const send = jest.fn();
    await expect(service.place(intent, send)).rejects.toThrow('disk full');
    expect(send).not.toHaveBeenCalled();
  });

  it('preserves the prepared owner even when the current account changes', async () => {
    const { service, assertCurrent, disk } = build();
    await expect(
      service.place(intent, async (hooks) => {
        await hooks.signed(identity);
        assertCurrent.mockImplementation(() => {
          throw new Error('stale owner');
        });
        await hooks.beforeDispatch();
      }),
    ).rejects.toThrow('stale owner');
    expect(readDisk([...disk.values()][0]).records[0].placement.phase).toBe(
      'signed',
    );
  });

  it('does not report cancel acknowledgment as authoritative termination', async () => {
    const { service } = build();
    await service.place(intent, async (hooks) => {
      await hooks.signed(identity);
      await hooks.beforeDispatch();
    });
    const record = await service.cancel(
      intent.owner,
      intent.clientOrderId,
      async (hooks) => {
        await hooks.signed({ ...identity, nonce: 5, txHash: 'cdef' });
        await hooks.beforeDispatch();
      },
    );
    expect(record.cancellations[0].phase).toBe('acknowledged');
    expect(record.terminalConfirmed).toBe(false);
    await expect(
      service.cancel(intent.owner, intent.clientOrderId, jest.fn()),
    ).rejects.toThrow('cancellation remains unresolved');
  });

  it('rejects corrupted persisted ownership instead of reporting empty inventory', async () => {
    const { service, disk } = build();
    await service
      .place(intent, async () => {
        throw new Error('unsent');
      })
      .catch(() => undefined);
    const key = [...disk.keys()][0];
    const raw = readDisk(disk.get(key) ?? '');
    raw.records[0].intent.owner.accountIndex = 29;
    disk.set(key, JSON.stringify(raw));
    await expect(service.list(intent.owner)).rejects.toThrow('ownership');
  });
});

describe('LighterTwapService read-only lifecycle reconciliation', () => {
  const parent = {
    orderIndex: 1000,
    orderId: '1000',
    clientOrderIndex: 123,
    clientOrderId: '123',
    marketIndex: 4097,
    ownerAccountIndex: 28,
    initialBaseAmount: '0.15',
    remainingBaseAmount: '0.15',
    filledBaseAmount: '0',
    filledQuoteAmount: '0',
    price: '121',
    isAsk: false,
    type: 'twap',
    timeInForce: 'good-till-time',
    reduceOnly: false,
    status: 'in-progress',
    orderExpiry: intent.orderExpiry,
    timestamp: 1_800_000_000,
    nonce: 4,
  };
  const readClient = (
    status = 'in-progress',
  ): jest.Mocked<
    Pick<
      LighterClientService,
      | 'getOrdersByClientIds'
      | 'getActiveOrders'
      | 'getInactiveOrders'
      | 'getTrades'
      | 'getTx'
    >
  > => {
    const row = { ...parent, status };
    return {
      getOrdersByClientIds: jest
        .fn<
          ReturnType<LighterClientService['getOrdersByClientIds']>,
          Parameters<LighterClientService['getOrdersByClientIds']>
        >()
        .mockResolvedValue({ code: 200, orders: [row] }),
      getActiveOrders: jest
        .fn<
          ReturnType<LighterClientService['getActiveOrders']>,
          Parameters<LighterClientService['getActiveOrders']>
        >()
        .mockResolvedValue({
          code: 200,
          orders: status === 'in-progress' ? [row] : [],
        }),
      getInactiveOrders: jest
        .fn<
          ReturnType<LighterClientService['getInactiveOrders']>,
          Parameters<LighterClientService['getInactiveOrders']>
        >()
        .mockResolvedValue({
          code: 200,
          orders: status === 'in-progress' ? [] : [row],
        }),
      getTrades: jest
        .fn<
          ReturnType<LighterClientService['getTrades']>,
          Parameters<LighterClientService['getTrades']>
        >()
        .mockResolvedValue({ code: 200, trades: [] }),
      getTx: jest.fn(async (hash: string) => ({
        code: 200,
        hash,
        accountIndex: 28,
        apiKeyIndex: 3,
        nonce: hash === 'abcd' ? 4 : 5,
        status: 2,
      })),
    };
  };
  const sendPlacement = async (
    service: LighterTwapService,
  ): Promise<LighterTwapRecord> =>
    await service.place(intent, async (hooks) => {
      await hooks.signed(identity);
      await hooks.beforeDispatch();
    });

  it('recovers exact parent and observed fills after restart without signing or replay', async () => {
    const { service, disk } = build();
    await sendPlacement(service);
    const restarted = build(disk).service;
    const client = readClient();
    const observations = await restarted.observe(
      intent.owner,
      client,
      'read-token',
    );
    expect(observations[0].observation?.order).toMatchObject({
      orderId: '1000',
      executedSize: '0',
      status: 'active',
    });
    expect(observations[0].record.placement.phase).toBe('succeeded');
    expect(client.getOrdersByClientIds).toHaveBeenCalledWith(28, 'read-token', [
      '123',
    ]);
    expect((await restarted.list(intent.owner))[0].parentOrderId).toBe('1000');
  });

  it('keeps terminal observation gated even after matching executed cancel', async () => {
    const { service } = build();
    await sendPlacement(service);
    await service.cancel(intent.owner, '123', async (hooks) => {
      await hooks.signed({ ...identity, nonce: 5, txHash: 'cdef' });
      await hooks.beforeDispatch();
    });
    const observed = await service.observe(
      intent.owner,
      readClient('canceled'),
      'read-token',
    );
    expect(observed[0].observation?.terminalObserved).toBe(true);
    expect(observed[0].record.terminalConfirmed).toBe(false);
  });

  it('requires exact executed cancellation before verified terminal settlement', async () => {
    const { service } = build(new Map(), true);
    await sendPlacement(service);
    await service.cancel(intent.owner, '123', async (hooks) => {
      await hooks.signed({ ...identity, nonce: 5, txHash: 'cdef' });
      await hooks.beforeDispatch();
    });
    const client = readClient('canceled');
    client.getTx.mockImplementation(async (hash: string) => ({
      code: 200,
      hash,
      accountIndex: 28,
      apiKeyIndex: 3,
      nonce: hash === 'abcd' ? 4 : 5,
      status: hash === 'abcd' ? 2 : 1,
    }));
    expect(
      (await service.observe(intent.owner, client, 'read-token'))[0].record
        .terminalConfirmed,
    ).toBe(false);
    client.getTx.mockImplementation(async (hash: string) => ({
      code: 200,
      hash,
      accountIndex: 28,
      apiKeyIndex: 3,
      nonce: hash === 'abcd' ? 4 : 5,
      status: 2,
    }));
    expect(
      (await service.observe(intent.owner, client, 'read-token'))[0].record
        .terminalConfirmed,
    ).toBe(true);
    const send = jest.fn();
    await service.cancel(intent.owner, '123', send);
    expect(send).not.toHaveBeenCalled();
  });

  it('retains an explicit unknown when history pagination is incomplete', async () => {
    const { service } = build();
    await sendPlacement(service);
    const client = readClient();
    client.getInactiveOrders.mockResolvedValue({
      code: 200,
      orders: [],
      nextCursor: 'still-more',
    });
    const observed = await service.observe(intent.owner, client, 'read-token');
    expect(observed[0].issue).toContain('pagination is incomplete');
    expect(observed[0].observation).toBeUndefined();
    expect(observed[0].record.terminalConfirmed).toBe(false);
  });

  it('refuses mismatched transaction identity and preserves the original pending record', async () => {
    const { service } = build();
    await sendPlacement(service);
    const client = readClient();
    client.getTx.mockResolvedValue({
      code: 200,
      hash: 'different',
      accountIndex: 28,
      apiKeyIndex: 3,
      nonce: 4,
      status: 2,
    });
    const observed = await service.observe(intent.owner, client, 'read-token');
    expect(observed[0].issue).toContain('identity mismatch');
    expect(observed[0].record.placement.phase).toBe('acknowledged');
  });

  it('rejects a changing account during history reads without writing another owner', async () => {
    const { service, assertCurrent, storage } = build();
    await sendPlacement(service);
    const before = storage.setItem.mock.calls.length;
    const client = readClient();
    client.getActiveOrders.mockImplementation(async () => {
      assertCurrent.mockImplementation(() => {
        throw new Error('account changed');
      });
      return { code: 200, orders: [parent] };
    });
    await expect(
      service.observe(intent.owner, client, 'read-token'),
    ).rejects.toThrow('account changed');
    expect(storage.setItem).toHaveBeenCalledTimes(before);
  });
});
