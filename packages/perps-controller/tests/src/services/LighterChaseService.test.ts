import { LighterChaseService } from '../../../src/services/LighterChaseService.js';
import type {
  LighterChaseIntent,
  LighterChaseIo,
  LighterChaseChild,
  LighterChaseDispatchHooks,
} from '../../../src/services/LighterChaseService.js';
import type { LighterChaseChildObservation } from '../../../src/utils/lighterChase.js';
import { createDeferred } from '../../helpers/serviceMocks.js';

const owner = {
  wallet: '0xabc',
  network: 'testnet' as const,
  accountIndex: 28,
  apiKeyIndex: 7,
};
const intent: LighterChaseIntent = {
  owner,
  handle: 'lighter-chase:100',
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
};

type TestEnvironment = {
  service: LighterChaseService;
  io: LighterChaseIo;
  storage: {
    getItem: jest.Mock<Promise<string | null>, [string]>;
    setItem: jest.Mock<Promise<void>, [string, string]>;
  };
  disk: Map<string, string>;
  observed: Map<string, LighterChaseChildObservation>;
  setNow: (value: number) => void;
  setQuote: (value: string) => void;
};
const setup = (): TestEnvironment => {
  let now = 100000;
  let nextId = 100;
  let quote = '100000';
  const disk = new Map<string, string>();
  const storage = {
    getItem: jest.fn(async (key: string) => disk.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      disk.set(key, value);
    }),
  };
  const observed = new Map<
    string,
    {
      orderId: string;
      terminal: boolean;
      filledSize: string;
      filledNotional: string;
      remainingSize: string;
    }
  >();
  const sign = async (hooks: LighterChaseDispatchHooks): Promise<void> => {
    await hooks.signed({
      nonce: nextId,
      txHash: `hash-${nextId}`,
      expiresAt: now + 10000,
    });
    await hooks.beforeDispatch();
  };
  const io: LighterChaseIo = {
    assertCurrent: jest.fn(),
    now: () => now,
    allocateClientId: () => {
      nextId += 1;
      return String(nextId);
    },
    quote: jest.fn(async () => quote),
    place: jest.fn(async (child, hooks) => {
      await sign(hooks);
      observed.set(child.clientOrderId, {
        orderId: `9${child.clientOrderId}`,
        terminal: false,
        filledSize: '0',
        filledNotional: '0',
        remainingSize: child.size,
      });
    }),
    cancel: jest.fn(async (child, hooks) => {
      await sign(hooks);
      const row = observed.get(child.clientOrderId);
      if (!row) {
        throw new Error('unknown');
      }
      observed.set(child.clientOrderId, { ...row, terminal: true });
    }),
    observe: jest.fn(async (child) => {
      const row = observed.get(child.clientOrderId);
      if (!row) {
        throw new Error('child visibility uncertain');
      }
      return { ...row };
    }),
  };
  const service = new LighterChaseService({ storage });
  return {
    service,
    io,
    storage,
    disk,
    observed,
    setNow: (value: number): void => {
      now = value;
    },
    setQuote: (value: string): void => {
      quote = value;
    },
  };
};

describe('Lighter bounded Chase lifecycle', () => {
  it('persists immutable child ownership before sign and attempt before transport', async () => {
    const env = setup();
    const submitted: LighterChaseChild[] = [];
    jest.mocked(env.io.place).mockImplementation(async (child, hooks) => {
      expect([...env.disk.values()].join(' ')).toContain(child.clientOrderId);
      await hooks.signed({ nonce: 8, txHash: 'signed', expiresAt: 110000 });
      expect([...env.disk.values()].join(' ')).toContain('signed');
      await hooks.beforeDispatch();
      expect([...env.disk.values()].join(' ')).toContain('attempted');
      submitted.push(child);
      env.observed.set(child.clientOrderId, {
        orderId: '9001',
        terminal: false,
        filledSize: '0',
        filledNotional: '0',
        remainingSize: child.size,
      });
    });
    expect((await env.service.start(intent, env.io)).status).toBe('active');
    expect(submitted).toHaveLength(1);
  });
  it('subtracts authoritative partial fills during cancellation before replacement', async () => {
    const env = setup();
    await env.service.start(intent, env.io);
    jest.mocked(env.io.cancel).mockImplementation(async (child, hooks) => {
      await hooks.signed({ nonce: 9, txHash: 'cancel', expiresAt: 111000 });
      await hooks.beforeDispatch();
      env.observed.set(child.clientOrderId, {
        orderId: `9${child.clientOrderId}`,
        terminal: true,
        filledSize: '0.00005',
        filledNotional: '5',
        remainingSize: '0.00015',
      });
    });
    env.setNow(101000);
    env.setQuote('99999');
    const result = await env.service.tick(owner, intent.handle, env.io);
    expect(result.children.map((child) => child.size)).toStrictEqual([
      '0.0002',
      '0.00015',
    ]);
    expect(result.repricings).toBe(1);
    expect(result.executedSize).toBe('0.00005');
  });
  it('never replaces an acknowledged cancel whose child remains live', async () => {
    const env = setup();
    await env.service.start(intent, env.io);
    jest.mocked(env.io.cancel).mockImplementation(async (_child, hooks) => {
      await hooks.signed({ nonce: 9, txHash: 'cancel', expiresAt: 111000 });
      await hooks.beforeDispatch();
    });
    env.setNow(101000);
    env.setQuote('99999');
    const result = await env.service.tick(owner, intent.handle, env.io);
    expect(result.status).toBe('termination_pending');
    expect(env.io.place).toHaveBeenCalledTimes(1);
    await env.service.tick(owner, intent.handle, env.io);
    expect(env.io.cancel).toHaveBeenCalledTimes(1);
  });
  it('preserves response loss across restart without creating or resuming a child', async () => {
    const env = setup();
    jest.mocked(env.io.place).mockImplementation(async (_child, hooks) => {
      await hooks.signed({ nonce: 8, txHash: 'lost', expiresAt: 110000 });
      await hooks.beforeDispatch();
      throw new Error('response lost');
    });
    const result = await env.service.start(intent, env.io);
    expect(result.status).toBe('termination_pending');
    const restarted = new LighterChaseService({ storage: env.storage });
    expect((await restarted.list(owner, env.io))[0].status).toBe(
      'termination_pending',
    );
    await restarted.tick(owner, intent.handle, env.io);
    expect(env.io.place).toHaveBeenCalledTimes(1);
    await expect(
      restarted.start({ ...intent, handle: 'different' }, env.io),
    ).rejects.toThrow('unresolved');
  });
  it('blocks signing when immutable journal persistence fails', async () => {
    const env = setup();
    env.storage.setItem.mockRejectedValue(new Error('disk unavailable'));
    await expect(env.service.start(intent, env.io)).rejects.toThrow(
      'disk unavailable',
    );
    expect(env.io.place).not.toHaveBeenCalled();
  });
  it('retains attempted ownership when the acknowledgment journal write fails', async () => {
    const env = setup();
    env.storage.setItem.mockImplementation(async (key, value) => {
      if (value.includes('acknowledged')) {
        throw new Error('ack disk failure');
      }
      env.disk.set(key, value);
    });
    await expect(env.service.start(intent, env.io)).rejects.toThrow(
      'ack disk failure',
    );
    expect([...env.disk.values()].join(' ')).toContain('attempted');
    const restarted = new LighterChaseService({ storage: env.storage });
    expect((await restarted.list(owner, env.io))[0].status).toBe(
      'termination_pending',
    );
    expect(env.io.place).toHaveBeenCalledTimes(1);
  });
  it('retains a signed child when attempted-state persistence fails before transport', async () => {
    const env = setup();
    env.storage.setItem.mockImplementation(async (key, value) => {
      if (value.includes('attempted')) {
        throw new Error('disk attempt failure');
      }
      env.disk.set(key, value);
    });
    await expect(env.service.start(intent, env.io)).rejects.toThrow(
      'disk attempt failure',
    );
    expect([...env.disk.values()].join(' ')).toContain('signed');
    expect(env.observed.size).toBe(0);
  });
  it.each([
    {
      field: 'duration',
      next: 160000,
      quote: '100000',
      max: 2,
      status: 'duration_reached',
    },
    {
      field: 'distance',
      next: 101000,
      quote: '101001',
      max: 2,
      status: 'max_distance_reached',
    },
    {
      field: 'count',
      next: 101000,
      quote: '99999',
      max: 0,
      status: 'repricing_limit_reached',
    },
  ])(
    'stops and confirms exact cleanup at $field',
    async ({ next, quote, max, status }) => {
      const env = setup();
      await env.service.start({ ...intent, maxRepricings: max }, env.io);
      env.setNow(next);
      env.setQuote(quote);
      const result = await env.service.tick(owner, intent.handle, env.io);
      expect(result.status).toBe(status);
      expect(env.io.place).toHaveBeenCalledTimes(1);
      expect(env.io.cancel).toHaveBeenCalledTimes(1);
    },
  );
  it('ignores early ticks and rejects a replacement exceeding the aggregate quote budget', async () => {
    const env = setup();
    await env.service.start(intent, env.io);
    env.setQuote('100001');
    await env.service.tick(owner, intent.handle, env.io);
    expect(env.io.quote).toHaveBeenCalledTimes(1);
    env.setNow(101000);
    const result = await env.service.tick(owner, intent.handle, env.io);
    expect(result.status).not.toBe('active');
    expect(env.io.place).toHaveBeenCalledTimes(1);
  });
  it('suspends on a failed book and retains unknown cleanup visibly', async () => {
    const env = setup();
    await env.service.start(intent, env.io);
    env.setNow(101000);
    jest.mocked(env.io.quote).mockRejectedValue(new Error('stale book'));
    jest
      .mocked(env.io.cancel)
      .mockRejectedValue(new Error('cancel unavailable'));
    expect((await env.service.tick(owner, intent.handle, env.io)).status).toBe(
      'termination_pending',
    );
    expect(env.io.place).toHaveBeenCalledTimes(1);
  });
  it('interrupts an in-flight placement before its dispatch hook and never resumes', async () => {
    const env = setup();
    const pending = createDeferred<void>();
    const signed = createDeferred<void>();
    jest.mocked(env.io.place).mockImplementation(async (_child, hooks) => {
      await hooks.signed({ nonce: 8, txHash: 'signed', expiresAt: 110000 });
      signed.resolve();
      await pending.promise;
      await hooks.beforeDispatch();
    });
    const starting = env.service.start(intent, env.io);
    await signed.promise;
    env.service.interrupt();
    pending.resolve();
    expect((await starting).status).toBe('termination_pending');
    expect((await env.service.list(owner, env.io))[0].status).toBe(
      'termination_pending',
    );
  });
  it('does not report an active session when interrupted after an accepted child', async () => {
    const env = setup();
    const original = jest.mocked(env.io.observe).getMockImplementation();
    if (!original) {
      throw new Error('Missing observation implementation');
    }
    jest.mocked(env.io.observe).mockImplementation(async (child) => {
      const result = await original(child);
      env.service.interrupt();
      return result;
    });
    expect((await env.service.start(intent, env.io)).status).toBe(
      'termination_pending',
    );
  });
  it('refuses a financial continuation whose quote aged during signing', async () => {
    const env = setup();
    jest.mocked(env.io.place).mockImplementation(async (_child, hooks) => {
      await hooks.signed({ nonce: 8, txHash: 'delayed', expiresAt: 120000 });
      env.setNow(106000);
      await hooks.beforeDispatch();
    });
    const result = await env.service.start(intent, env.io);
    expect(result.status).toBe('termination_pending');
    expect(result.error).toContain('stale');
  });
  it('refuses stale account/network authority before signing and during reads', async () => {
    const env = setup();
    jest.mocked(env.io.assertCurrent).mockImplementation(() => {
      throw new Error('owner changed');
    });
    await expect(env.service.start(intent, env.io)).rejects.toThrow(
      'owner changed',
    );
    expect(env.io.place).not.toHaveBeenCalled();
  });
  it('does not replace after another provider explicitly terminated the shared durable handle', async () => {
    const env = setup();
    await env.service.start(intent, env.io);
    const other = new LighterChaseService({ storage: env.storage });
    expect(
      (await other.stop(owner, intent.handle, env.io, 'canceled')).status,
    ).toBe('canceled');
    env.setNow(101000);
    env.setQuote('99999');
    expect((await env.service.tick(owner, intent.handle, env.io)).status).toBe(
      'canceled',
    );
    expect(env.io.place).toHaveBeenCalledTimes(1);
  });
  it('explicitly terminates a restarted owned session without reconnect replay', async () => {
    const env = setup();
    await env.service.start(intent, env.io);
    const restarted = new LighterChaseService({ storage: env.storage });
    expect((await restarted.list(owner, env.io))[0].status).toBe(
      'termination_pending',
    );
    expect(
      (await restarted.stop(owner, intent.handle, env.io, 'canceled')).status,
    ).toBe('canceled');
    expect(env.io.place).toHaveBeenCalledTimes(1);
  });
});
