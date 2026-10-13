import { LIGHTER_CHASE_CANCEL_SETTLEMENT_WINDOW_MS } from '../../../src/constants/lighterConfig.js';
import { LighterChaseService } from '../../../src/services/LighterChaseService.js';
import type {
  LighterChaseIo,
  LighterChaseRecord,
} from '../../../src/services/LighterChaseService.js';

const owner = {
  wallet: '0xabc',
  network: 'testnet' as const,
  accountIndex: 28,
  apiKeyIndex: 7,
};
const handle = 'lighter-chase:100';
const cancellation = { nonce: 209, txHash: 'b'.repeat(64), expiresAt: 110000 };
const retained = (): LighterChaseRecord => ({
  intent: {
    owner,
    handle,
    symbol: 'BTC',
    marketId: 1,
    isBuy: true,
    reduceOnly: false,
    originalSize: '0.0002',
    arrivalPrice: '100000',
    sizeDecimals: 5,
    priceDecimals: 1,
    startedAt: 100000,
    intervalMs: 1000,
    maxDurationMs: 60000,
    maxRepricings: 2,
    maxDistanceBps: 100,
    maxNotional: '20',
    minBaseAmount: '0.00001',
    minQuoteAmount: '1',
  },
  status: 'termination_pending',
  stopReason: 'canceled',
  repricings: 0,
  lastTickAt: 100000,
  executedSize: '0',
  executedNotional: '0',
  children: [
    {
      clientOrderId: '101',
      size: '0.0002',
      price: '100000',
      quotedAt: 100000,
      placement: {
        phase: 'acknowledged',
        nonce: 208,
        txHash: 'a'.repeat(64),
        expiresAt: 110000,
        acknowledged: true,
      },
      cancellations: [
        { phase: 'acknowledged', ...cancellation, acknowledged: true },
      ],
      observation: {
        orderId: '90101',
        terminal: false,
        filledSize: '0',
        filledNotional: '0',
        remainingSize: '0.0002',
      },
    },
  ],
});
type ReconciliationFixture = {
  service: LighterChaseService;
  io: LighterChaseIo;
  storage: jest.Mocked<{
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
  }>;
  disk: Map<string, string>;
  key: string;
  reconcile: () => Promise<LighterChaseRecord>;
  setTerminal: () => void;
};
const setup = (record = retained()): ReconciliationFixture => {
  const key = `lighterChase:${JSON.stringify([owner.network, owner.wallet, owner.accountIndex])}`;
  const disk = new Map([
    [key, JSON.stringify({ version: 1, records: [record] })],
  ]);
  const storage = {
    getItem: jest.fn(async (name: string) => disk.get(name) ?? null),
    setItem: jest.fn(async (name: string, value: string) => {
      disk.set(name, value);
    }),
  };
  let terminal = false;
  const io: LighterChaseIo = {
    assertCurrent: jest.fn(),
    now: () => Date.now(),
    allocateClientId: jest.fn(() => '102'),
    quote: jest.fn(async () => '100000'),
    place: jest.fn(),
    cancel: jest.fn(async (_child, hooks) => {
      await hooks.signed({
        nonce: 210,
        txHash: 'c'.repeat(64),
        expiresAt: 110000,
      });
      await hooks.beforeDispatch();
      hooks.accepted();
      await hooks.afterAccepted();
      terminal = true;
    }),
    observe: jest.fn(async () => ({
      orderId: '90101',
      terminal,
      filledSize: '0',
      filledNotional: '0',
      remainingSize: '0.0002',
    })),
  };
  const service = new LighterChaseService({ storage });
  const reconcile = async (): Promise<LighterChaseRecord> => {
    const pending = service
      .reconcileCancellation(owner, handle, '101', cancellation, io)
      .then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
    await jest.advanceTimersByTimeAsync(
      LIGHTER_CHASE_CANCEL_SETTLEMENT_WINDOW_MS + 1,
    );
    const result = await pending;
    if ('error' in result) {
      throw result.error;
    }
    return result.value;
  };
  return {
    service,
    io,
    storage,
    disk,
    key,
    reconcile,
    setTerminal: (): void => {
      terminal = true;
    },
  };
};

describe('Lighter Chase cancellation reconciliation without dispatch', () => {
  beforeEach(() => jest.useFakeTimers({ now: 100000 }));
  afterEach(() => jest.useRealTimers());

  it('settles exact terminal evidence without changing the cancellation inventory', async () => {
    const env = setup();
    env.setTerminal();
    const result = await env.reconcile();
    expect(result.status).toBe('canceled');
    expect(result.children[0].cancellations).toStrictEqual(
      retained().children[0].cancellations,
    );
    expect(env.io.cancel).not.toHaveBeenCalled();
    expect(env.io.place).not.toHaveBeenCalled();
    expect(env.io.allocateClientId).not.toHaveBeenCalled();
  });
  it('never sends another cancellation after acknowledged phase downgrades with a nonterminal child', async () => {
    const env = setup();
    jest.mocked(env.io.observe).mockImplementation(async (child) => {
      child.cancellations[0].phase = 'failed';
      return {
        orderId: '90101',
        filledSize: '0',
        filledNotional: '0',
        remainingSize: '0.0002',
        terminal: false,
      };
    });
    const result = await env.reconcile();
    expect(result.status).toBe('termination_pending');
    expect(result.children[0].cancellations).toStrictEqual([
      { phase: 'failed', ...cancellation, acknowledged: true },
    ]);
    expect(env.io.cancel).not.toHaveBeenCalled();
    expect(env.io.allocateClientId).not.toHaveBeenCalled();
  });
  it.each([undefined, false])(
    'keeps an attempted cancellation with acknowledgement %s unresolved on a nonterminal snapshot',
    async (acknowledged) => {
      const record = retained();
      Object.assign(record.children[0].cancellations[0], {
        phase: 'attempted',
        acknowledged,
      });
      const env = setup(record);
      expect((await env.reconcile()).status).toBe('termination_pending');
      expect(env.io.cancel).not.toHaveBeenCalled();
    },
  );
  it('retains unresolved management when a reconciliation reply is lost', async () => {
    const env = setup();
    jest
      .mocked(env.io.observe)
      .mockRejectedValue(new Error('read response lost'));
    const result = await env.reconcile();
    expect(result.status).toBe('termination_pending');
    expect(result.children[0].cancellations).toStrictEqual(
      retained().children[0].cancellations,
    );
    expect(env.io.cancel).not.toHaveBeenCalled();
  });
  it.each([
    'missing record',
    'missing cancellation',
    'prepared cancellation',
    'malformed inventory',
    'active chase',
  ] as const)('rejects %s before observation or dispatch', async (failure) => {
    const record = retained();
    if (failure === 'missing cancellation') {
      record.children[0].cancellations = [];
    }
    if (failure === 'prepared cancellation') {
      record.children[0].cancellations = [{ phase: 'prepared' }];
    }
    if (failure === 'active chase') {
      record.status = 'active';
      delete record.stopReason;
    }
    const env = setup(record);
    if (failure === 'missing record') {
      env.disk.set(env.key, JSON.stringify({ version: 1, records: [] }));
    }
    if (failure === 'malformed inventory') {
      env.disk.set(env.key, '{');
    }
    await expect(env.reconcile()).rejects.toThrow(
      /JSON|Chase|dispatch|Expected/u,
    );
    expect(env.io.observe).not.toHaveBeenCalled();
    expect(env.io.cancel).not.toHaveBeenCalled();
    expect(env.storage.setItem).not.toHaveBeenCalled();
  });
  it.each(['owner', 'child', 'nonce', 'hash', 'expiry'] as const)(
    'rejects stale exact %s identity without dispatch',
    async (field) => {
      const env = setup();
      const pending = env.service.reconcileCancellation(
        field === 'owner' ? { ...owner, apiKeyIndex: 8 } : owner,
        handle,
        field === 'child' ? '102' : '101',
        {
          ...cancellation,
          ...(field === 'nonce' ? { nonce: 210 } : {}),
          ...(field === 'hash' ? { txHash: 'c'.repeat(64) } : {}),
          ...(field === 'expiry' ? { expiresAt: 110001 } : {}),
        },
        env.io,
      );
      await expect(pending).rejects.toThrow(/JSON|Chase|dispatch|Expected/u);
      expect(env.io.observe).not.toHaveBeenCalled();
      expect(env.io.cancel).not.toHaveBeenCalled();
    },
  );
  it('fences an ownership switch while reading the exact cancellation', async () => {
    const env = setup();
    jest.mocked(env.io.observe).mockImplementation(async () => {
      jest.mocked(env.io.assertCurrent).mockImplementation(() => {
        throw new Error('owner switched');
      });
      return {
        orderId: '90101',
        filledSize: '0',
        filledNotional: '0',
        remainingSize: '0.0002',
        terminal: true,
      };
    });
    await expect(env.reconcile()).rejects.toThrow('owner switched');
    expect(env.io.cancel).not.toHaveBeenCalled();
    const saved = JSON.parse(env.disk.get(env.key) ?? '') as {
      records: LighterChaseRecord[];
    };
    expect(saved.records[0].status).toBe('termination_pending');
  });
  it('preserves ordinary explicit cancellation behavior after exact failure', async () => {
    const record = retained();
    record.children[0].cancellations[0].phase = 'failed';
    const env = setup(record);
    const pending = env.service.stop(owner, handle, env.io, 'canceled');
    await jest.advanceTimersByTimeAsync(
      LIGHTER_CHASE_CANCEL_SETTLEMENT_WINDOW_MS + 1,
    );
    const result = await pending;
    expect(result.status).toBe('canceled');
    expect(env.io.cancel).toHaveBeenCalledTimes(1);
    expect(result.children[0].cancellations).toHaveLength(2);
  });
});
