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
const identity = { nonce: 4, txHash: 'abcdabcd', expiresAt: 1_800_000_100_000 };

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
  it.each(['abcd', 'g'.repeat(8), 'a'.repeat(129)])(
    'rejects an unusable signed transaction hash %s before transport',
    async (txHash) => {
      const { service } = build();
      await expect(
        service.place(intent, async (hooks) => {
          await hooks.signed({ ...identity, txHash });
        }),
      ).rejects.toThrow('identity');
    },
  );
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
        await hooks.signed({ ...identity, nonce: 5, txHash: 'cdefcdef' });
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
        nonce: hash === 'abcdabcd' ? 4 : 5,
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
      await hooks.signed({ ...identity, nonce: 5, txHash: 'cdefcdef' });
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
      await hooks.signed({ ...identity, nonce: 5, txHash: 'cdefcdef' });
      await hooks.beforeDispatch();
    });
    const client = readClient('canceled');
    client.getTx.mockImplementation(async (hash: string) => ({
      code: 200,
      hash,
      accountIndex: 28,
      apiKeyIndex: 3,
      nonce: hash === 'abcdabcd' ? 4 : 5,
      status: hash === 'abcdabcd' ? 2 : 1,
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
      nonce: hash === 'abcdabcd' ? 4 : 5,
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

  describe('TWAP review corrections', () => {
    it('accepts the provider-supported trading slot 2', async () => {
      const { service } = build();
      const slot2 = { ...intent, owner: { ...intent.owner, apiKeyIndex: 2 } };
      await service.place(slot2, async (hooks) => {
        await hooks.signed(identity);
        await hooks.beforeDispatch();
      });
      expect((await service.list(slot2.owner))[0].placement.phase).toBe(
        'acknowledged',
      );
    });
    it('releases a signed placement refused by the nonce ledger before transport', async () => {
      const { service } = build();
      await expect(
        service.place(intent, async (hooks) => {
          await hooks.signed(identity);
          throw new Error('nonce ledger full');
        }),
      ).rejects.toThrow('nonce ledger full');
      expect((await service.list(intent.owner))[0].placement.phase).toBe(
        'failed',
      );
      await service.place(
        { ...intent, clientOrderId: '124' },
        async (hooks) => {
          await hooks.signed({ ...identity, nonce: 5 });
          await hooks.beforeDispatch();
        },
      );
    });
    it.each(['prepared', 'signed'] as const)(
      'releases persisted %s ownership after a crash or stale session',
      async (phase) => {
        const { service, disk } = build();
        await sendPlacement(service);
        const key = [...disk.keys()][0];
        const doc = readDisk(disk.get(key) ?? '');
        doc.records[0].placement =
          phase === 'prepared' ? { phase } : { phase, ...identity };
        disk.set(key, JSON.stringify({ version: 1, records: doc.records }));
        const client = readClient();
        client.getOrdersByClientIds.mockResolvedValue({
          code: 200,
          orders: [],
        });
        client.getActiveOrders.mockResolvedValue({ code: 200, orders: [] });
        const restarted = build(disk).service;
        await restarted.observe(intent.owner, client, 'read-token');
        expect((await restarted.list(intent.owner))[0].placement.phase).toBe(
          'failed',
        );
      },
    );

    it.each(['active', 'history'] as const)(
      'retains expired placement uncertainty after incomplete %s reads across restart',
      async (failure) => {
        const { service, disk } = build();
        await sendPlacement(service);
        const client = readClient();
        client.getTx.mockResolvedValue(null);
        if (failure === 'active') {
          client.getActiveOrders.mockRejectedValue(
            new Error('active read unavailable'),
          );
        } else {
          client.getInactiveOrders.mockResolvedValue({
            code: 200,
            orders: [],
            nextCursor: 'incomplete',
          });
        }
        const now = jest
          .spyOn(Date, 'now')
          .mockReturnValue(identity.expiresAt + 30001);
        try {
          const observed = await service.observe(
            intent.owner,
            client,
            'read-token',
          );
          expect(observed[0].issue).toBeDefined();
          expect(observed[0].record.placement.phase).toBe('acknowledged');
          const restarted = build(disk).service;
          expect((await restarted.list(intent.owner))[0].placement.phase).toBe(
            'acknowledged',
          );
          const send = jest.fn();
          await expect(
            restarted.place({ ...intent, clientOrderId: '124' }, send),
          ).rejects.toThrow('unresolved');
          expect(send).not.toHaveBeenCalled();
        } finally {
          now.mockRestore();
        }
      },
    );
    it('releases never-landed response loss after signed expiry plus clock slack', async () => {
      const { service } = build();
      await sendPlacement(service);
      const client = readClient();
      client.getTx.mockResolvedValue(null);
      client.getOrdersByClientIds.mockResolvedValue({ code: 200, orders: [] });
      client.getActiveOrders.mockResolvedValue({ code: 200, orders: [] });
      const now = jest
        .spyOn(Date, 'now')
        .mockReturnValue(identity.expiresAt + 30001);
      try {
        await service.observe(intent.owner, client, 'read-token');
        expect((await service.list(intent.owner))[0].placement.phase).toBe(
          'failed',
        );
      } finally {
        now.mockRestore();
      }
    });
    it('retains definitive failed cancel outcomes when later parent reads fail', async () => {
      const { service } = build();
      await sendPlacement(service);
      await service.cancel(intent.owner, '123', async (hooks) => {
        await hooks.signed({ ...identity, nonce: 5, txHash: 'cdefcdef' });
        await hooks.beforeDispatch();
      });
      const client = readClient();
      client.getTx.mockImplementation(async (hash: string) => ({
        code: 200,
        hash,
        accountIndex: 28,
        apiKeyIndex: 3,
        nonce: hash === 'abcdabcd' ? 4 : 5,
        status: hash === 'abcdabcd' ? 2 : 0,
      }));
      client.getOrdersByClientIds.mockRejectedValue(
        new Error('parent read unavailable'),
      );
      await service.observe(intent.owner, client, 'read-token');
      expect((await service.list(intent.owner))[0].cancellations[0].phase).toBe(
        'failed',
      );
      await service.cancel(intent.owner, '123', async (hooks) => {
        await hooks.signed({ ...identity, nonce: 6, txHash: 'dddddddd' });
        await hooks.beforeDispatch();
      });
      expect((await service.list(intent.owner))[0].cancellations).toHaveLength(
        2,
      );
    });
    it('blocks a second market after restart while the first native probe is unresolved', async () => {
      const { service, disk } = build();
      await sendPlacement(service);
      const restarted = build(disk).service;
      await expect(
        restarted.place(
          { ...intent, marketId: 4096, symbol: 'BTC', clientOrderId: '124' },
          jest.fn(),
        ),
      ).rejects.toThrow('unresolved');
    });
    it('retains bounded native history and cancel attempt capacity', async () => {
      const { service, disk } = build();
      await sendPlacement(service);
      const key = [...disk.keys()][0];
      const doc = readDisk(disk.get(key) ?? '');
      doc.records[0].cancellations = Array.from({ length: 16 }, () => ({
        phase: 'failed' as const,
      }));
      disk.set(key, JSON.stringify({ version: 1, records: doc.records }));
      await expect(
        service.cancel(intent.owner, '123', jest.fn()),
      ).rejects.toThrow('attempt limit');
      doc.records = Array.from({ length: 64 }, (_, index) => ({
        ...doc.records[0],
        intent: { ...intent, clientOrderId: String(index + 1000) },
        placement: { phase: 'failed' as const },
      }));
      disk.set(key, JSON.stringify({ version: 1, records: doc.records }));
      await expect(
        service.place({ ...intent, clientOrderId: '2000' }, jest.fn()),
      ).rejects.toThrow('capacity');
    });
    it('reconciles two history pages and unequal children with three paginated trades', async () => {
      const { service } = build();
      await sendPlacement(service);
      const client = readClient();
      const filledParent = {
        ...parent,
        filledBaseAmount: '0.05',
        filledQuoteAmount: '6',
        remainingBaseAmount: '0.10',
      };
      const children = ['0.02', '0.03'].map((size, index) => ({
        ...parent,
        orderIndex: 1001 + index,
        orderId: String(1001 + index),
        clientOrderIndex: 124 + index,
        clientOrderId: String(124 + index),
        parentOrderIndex: parent.orderIndex,
        parentOrderId: parent.orderId,
        type: 'twap-sub',
        status: 'filled',
        initialBaseAmount: size,
        remainingBaseAmount: '0',
        filledBaseAmount: size,
        filledQuoteAmount: index === 0 ? '2.4' : '3.6',
      }));
      client.getOrdersByClientIds.mockResolvedValue({
        code: 200,
        orders: [filledParent],
      });
      client.getActiveOrders.mockResolvedValue({
        code: 200,
        orders: [filledParent],
      });
      client.getInactiveOrders
        .mockResolvedValueOnce({
          code: 200,
          orders: [children[0]],
          nextCursor: 'child-page-2',
        })
        .mockResolvedValueOnce({ code: 200, orders: [children[1]] });
      client.getTrades.mockImplementation(async (_account, _token, options) => {
        const secondChild = options?.orderIndex === '1002';
        const secondPage = options?.cursor === 'trade-page-2';
        return {
          code: 200,
          trades: [
            {
              tradeId: secondChild ? 3 : Number(secondPage) + 1,
              txHash: 'abc1',
              type: 'trade',
              marketId: intent.marketId,
              size: secondChild ? '0.03' : '0.01',
              price: '120',
              usdAmount: secondChild ? '3.6' : '1.2',
              askId: 999,
              bidId: secondChild ? 1002 : 1001,
              askAccountId: 99,
              bidAccountId: 28,
              isMakerAsk: true,
              timestamp: intent.startedAt + 1000,
              makerPositionSizeBefore: '0',
              takerPositionSizeBefore: '0',
            },
          ],
          ...(!secondChild && !secondPage
            ? { nextCursor: 'trade-page-2' }
            : {}),
        };
      });
      const [result] = await service.observe(
        intent.owner,
        client,
        'read-token',
      );
      expect(result.issue).toBeUndefined();
      expect(result.observation?.order).toMatchObject({
        executedSize: '0.05',
        executedNotional: '6',
        averagePrice: '120',
      });
      expect(result.observation?.order.fills).toHaveLength(3);
      expect(client.getInactiveOrders).toHaveBeenCalledTimes(2);
      expect(client.getTrades).toHaveBeenCalledTimes(3);
    });

    it.each(['repeat', 'capacity'] as const)(
      'refuses %s trade cursors without accepting a partial lifecycle',
      async (mode) => {
        const { service, disk } = build();
        await sendPlacement(service);
        const client = readClient();
        client.getInactiveOrders.mockResolvedValue({
          code: 200,
          orders: [
            {
              ...parent,
              orderIndex: 1001,
              orderId: '1001',
              clientOrderIndex: 124,
              clientOrderId: '124',
              parentOrderIndex: 1000,
              parentOrderId: '1000',
              type: 'twap-sub',
            },
          ],
        });
        let page = 0;
        client.getTrades.mockImplementation(async () => {
          page += 1;
          return {
            code: 200,
            trades: [
              {
                tradeId: page,
                txHash: 'abcdabcd',
                marketId: intent.marketId,
                size: '0.01',
                price: '120',
                usdAmount: '1.2',
                bidId: 1001,
                askId: 999,
                bidAccountId: 28,
                askAccountId: 99,
                isMakerAsk: true,
                timestamp: Math.floor(intent.startedAt / 1000) + 1,
                type: 'trade',
                takerPositionSizeBefore: '0',
                makerPositionSizeBefore: '0',
              },
            ],
            nextCursor: mode === 'repeat' ? 'repeat' : String(page),
          };
        });
        const [result] = await service.observe(
          intent.owner,
          client,
          'read-token',
        );
        expect(result.issue).toContain(
          mode === 'repeat'
            ? 'trade pagination is incomplete'
            : 'trade pagination limit reached',
        );
        expect(result.observation).toBeUndefined();
        expect(client.getTrades).toHaveBeenCalledTimes(
          mode === 'repeat' ? 2 : 100,
        );
        expect(
          (await build(disk).service.list(intent.owner))[0].placement.phase,
        ).toBe('acknowledged');
      },
    );
    it('rejects conflicting exact client ID counterparts before parent collection', async () => {
      const { service } = build();
      await sendPlacement(service);
      const client = readClient();
      client.getOrdersByClientIds.mockResolvedValue({
        code: 200,
        orders: [{ ...parent, clientOrderId: '124' }],
      });
      const [result] = await service.observe(
        intent.owner,
        client,
        'read-token',
      );
      expect(result.issue).toBe(
        'Lighter TWAP order identity is unsafe or inconsistent',
      );
      expect(client.getTrades).not.toHaveBeenCalled();
    });
    it('refuses repeated history cursors without accepting a partial snapshot', async () => {
      const { service } = build();
      await sendPlacement(service);
      const client = readClient();
      client.getInactiveOrders.mockResolvedValue({
        code: 200,
        orders: [parent],
        nextCursor: 'repeat',
      });
      const [result] = await service.observe(
        intent.owner,
        client,
        'read-token',
      );
      expect(result.issue).toBe(
        'Lighter TWAP order history pagination is incomplete',
      );
      expect(client.getInactiveOrders).toHaveBeenCalledTimes(2);
    });
    it('refuses a history page cap without discarding pending ownership', async () => {
      const { service } = build();
      await sendPlacement(service);
      const client = readClient();
      let page = 0;
      client.getInactiveOrders.mockImplementation(async () => {
        page += 1;
        return {
          code: 200,
          orders: [
            {
              ...parent,
              orderIndex: 5000 + page,
              orderId: String(5000 + page),
              clientOrderIndex: 6000 + page,
              clientOrderId: String(6000 + page),
            },
          ],
          nextCursor: String(page),
        };
      });
      const result = await service.observe(intent.owner, client, 'read-token');
      expect(result[0].issue).toContain('pagination limit');
      expect(client.getInactiveOrders).toHaveBeenCalledTimes(100);
    });
  });
});
