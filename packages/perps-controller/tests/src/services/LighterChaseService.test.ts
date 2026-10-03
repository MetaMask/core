import {
  LighterChaseService,
  LighterChaseObservationPendingError,
} from '../../../src/services/LighterChaseService.js';
import type {
  LighterChaseIntent,
  LighterChaseIo,
  LighterChaseChild,
  LighterChaseDispatchHooks,
  LighterChaseRecord,
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
      txHash: nextId.toString(16).padStart(8, '0'),
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
  it.each([undefined, false, true])(
    'round06 reads version-1 acknowledgment evidence %s without replay',
    async (acknowledged) => {
      const env = setup();
      const record = await env.service.start(intent, env.io);
      record.status = 'termination_pending';
      const dispatch = record.children[0].placement;
      dispatch.phase = acknowledged === true ? 'acknowledged' : 'attempted';
      if (acknowledged === undefined) {
        delete dispatch.acknowledged;
      } else {
        dispatch.acknowledged = acknowledged;
      }
      const key = [...env.disk.keys()][0];
      env.disk.set(key, JSON.stringify({ version: 1, records: [record] }));
      const restored = new LighterChaseService({ storage: env.storage });
      const records = await restored.list(owner, env.io);
      expect(records[0].children[0].placement).toStrictEqual(dispatch);
      await restored.tick(owner, intent.handle, env.io);
      expect(env.io.place).toHaveBeenCalledTimes(1);
      expect(env.io.cancel).not.toHaveBeenCalled();
    },
  );
  it.each([
    { phase: 'attempted', acknowledged: 'false' },
    { phase: 'acknowledged', acknowledged: false },
    { phase: 'attempted', acknowledged: true },
  ])(
    'round06 rejects malformed acknowledgment evidence %s',
    async (evidence) => {
      const env = setup();
      const record = await env.service.start(intent, env.io);
      Object.assign(record.children[0].placement, evidence);
      const key = [...env.disk.keys()][0];
      env.disk.set(key, JSON.stringify({ version: 1, records: [record] }));
      const restored = new LighterChaseService({ storage: env.storage });
      await expect(restored.list(owner, env.io)).rejects.toThrow(
        /acknowledged|acceptance/u,
      );
      expect(env.io.place).toHaveBeenCalledTimes(1);
      expect(env.io.cancel).not.toHaveBeenCalled();
    },
  );
  it.each([
    'owner',
    'clientOrderId',
    'size',
    'price',
    'nonce',
    'txHash',
    'expiresAt',
  ] as const)(
    'round06 refuses captured completion after saved %s changes',
    async (field) => {
      const env = setup();
      let completionError: unknown;
      let savedAfterCompletion: string | undefined;
      jest.mocked(env.io.place).mockImplementation(async (_child, hooks) => {
        await hooks.signed({ nonce: 8, txHash: 'deadbeef', expiresAt: 110000 });
        await hooks.beforeDispatch();
        const key = [...env.disk.keys()][0];
        const journal = JSON.parse(env.disk.get(key) ?? '') as {
          records: LighterChaseRecord[];
        };
        const record = journal.records[0];
        const child = record.children[0];
        if (field === 'owner') {
          record.intent.owner.apiKeyIndex += 1;
        } else if (field === 'clientOrderId') {
          child.clientOrderId = '102';
        } else if (field === 'size') {
          child.size = '0.0001';
        } else if (field === 'price') {
          child.price = '99999';
        } else if (field === 'nonce') {
          child.placement.nonce = 9;
        } else if (field === 'txHash') {
          child.placement.txHash = 'abcdefab';
        } else {
          child.placement.expiresAt = 110001;
        }
        env.disk.set(key, JSON.stringify(journal));
        hooks.accepted();
        completionError = await hooks
          .afterAccepted()
          .catch((error: unknown) => error);
        savedAfterCompletion = env.disk.get(key);
        throw new Error('completion attempt mismatch');
      });
      await env.service.start(intent, env.io);
      expect(completionError).toBeInstanceOf(Error);
      expect((completionError as Error).message).toBe(
        'Lighter Chase completion attempt mismatch',
      );
      expect(savedAfterCompletion).not.toContain('"acknowledged":true');
      expect(env.io.place).toHaveBeenCalledTimes(1);
      expect(env.io.cancel).not.toHaveBeenCalled();
    },
  );
  describe('bounded Chase cancellation settlement', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(100000);
    });
    afterEach(() => jest.useRealTimers());

    const pendingCancel = async (env: TestEnvironment): Promise<void> => {
      env.io.now = (): number => Date.now();
      await env.service.start(intent, env.io);
      jest.mocked(env.io.cancel).mockImplementation(async (_child, hooks) => {
        await hooks.signed({
          nonce: 202,
          txHash: 'cdefcdef',
          expiresAt: 120000,
        });
        await hooks.beforeDispatch();
      });
    };
    const terminal = (
      env: TestEnvironment,
      filledSize = '0',
      filledNotional = '0',
    ): void => {
      const row = env.observed.get('101');
      if (!row) {
        throw new Error('Missing owned child');
      }
      env.observed.set('101', {
        ...row,
        terminal: true,
        filledSize,
        filledNotional,
        remainingSize: filledSize === '0' ? intent.originalSize : '0.00015',
      });
    };

    it.each(['live', 'missing'] as const)(
      'settles delayed %s visibility after exactly one cancellation',
      async (visibility) => {
        const env = setup();
        await pendingCancel(env);
        const observe = jest.mocked(env.io.observe).getMockImplementation();
        if (!observe) {
          throw new Error('Missing observation implementation');
        }
        jest
          .mocked(env.io.observe)
          .mockImplementation(async (child, recordEvidence) => {
            if (
              visibility === 'missing' &&
              child.cancellations.length > 0 &&
              !env.observed.get('101')?.terminal
            ) {
              throw new LighterChaseObservationPendingError(
                'Exact child pending',
              );
            }
            return await observe(child, recordEvidence);
          });
        const stopping = env.service.stop(
          owner,
          intent.handle,
          env.io,
          'canceled',
        );
        setTimeout(() => terminal(env), 2000);
        await jest.advanceTimersByTimeAsync(2500);
        const result = await stopping;
        expect(result.status).toBe('canceled');
        expect(result.children[0].cancellations).toStrictEqual([
          expect.objectContaining({ phase: 'acknowledged', nonce: 202 }),
        ]);
        expect(result.children[0].observation?.terminal).toBe(true);
        expect(env.io.cancel).toHaveBeenCalledTimes(1);
        expect(env.io.place).toHaveBeenCalledTimes(1);
        expect((await env.service.list(owner, env.io))[0].status).toBe(
          'canceled',
        );
      },
    );

    it.each(['live', 'missing'] as const)(
      'bounds %s visibility and reconciles the retained attempt without replay',
      async (visibility) => {
        const env = setup();
        await pendingCancel(env);
        if (visibility === 'missing') {
          const observe = jest.mocked(env.io.observe).getMockImplementation();
          if (!observe) {
            throw new Error('Missing observation implementation');
          }
          jest
            .mocked(env.io.observe)
            .mockImplementation(async (child, recordEvidence) => {
              if (
                child.cancellations.length > 0 &&
                !env.observed.get('101')?.terminal
              ) {
                throw new LighterChaseObservationPendingError(
                  'Exact child pending',
                );
              }
              return await observe(child, recordEvidence);
            });
        }
        let finished = false;
        const stopping = env.service
          .stop(owner, intent.handle, env.io, 'canceled')
          .then((result) => {
            finished = true;
            return result;
          });
        await jest.advanceTimersByTimeAsync(9999);
        expect(finished).toBe(false);
        await jest.advanceTimersByTimeAsync(1);
        expect((await stopping).status).toBe('termination_pending');
        const retrying = env.service.stop(
          owner,
          intent.handle,
          env.io,
          'canceled',
        );
        setTimeout(() => terminal(env), 2000);
        await jest.advanceTimersByTimeAsync(2500);
        expect((await retrying).status).toBe('canceled');
        expect(env.io.cancel).toHaveBeenCalledTimes(1);
        expect(env.io.place).toHaveBeenCalledTimes(1);
      },
    );

    it('settles delayed terminal evidence after cancellation response loss without replay', async () => {
      const env = setup();
      await pendingCancel(env);
      const cancel = jest.mocked(env.io.cancel).getMockImplementation();
      if (!cancel) {
        throw new Error('Missing cancellation implementation');
      }
      jest.mocked(env.io.cancel).mockImplementation(async (child, hooks) => {
        await cancel(child, hooks);
        throw new Error('cancel response lost');
      });
      const stopping = env.service.stop(
        owner,
        intent.handle,
        env.io,
        'canceled',
      );
      setTimeout(() => terminal(env), 2000);
      await jest.advanceTimersByTimeAsync(2500);
      const result = await stopping;
      expect(result.status).toBe('canceled');
      expect(result.children[0].cancellations).toStrictEqual([
        expect.objectContaining({ phase: 'attempted', nonce: 202 }),
      ]);
      expect(env.io.cancel).toHaveBeenCalledTimes(1);
      expect(env.io.place).toHaveBeenCalledTimes(1);
    });

    it.each(['deadline', 'backwards'] as const)(
      'uses the injected cancellation clock for a %s change',
      async (change) => {
        const env = setup();
        await pendingCancel(env);
        let injectedNow = 100000;
        env.io.now = (): number => injectedNow;
        let finished = false;
        const stopping = env.service
          .stop(owner, intent.handle, env.io, 'canceled')
          .then((result) => {
            finished = true;
            return result;
          });
        await jest.advanceTimersByTimeAsync(0);
        expect(finished).toBe(false);
        injectedNow = change === 'deadline' ? 110000 : 99999;
        await jest.advanceTimersByTimeAsync(250);
        expect(finished).toBe(true);
        expect((await stopping).status).toBe('termination_pending');
        expect(env.io.cancel).toHaveBeenCalledTimes(1);
        expect(env.io.place).toHaveBeenCalledTimes(1);
      },
    );

    it('persists partial fills during settlement and retains them in the terminal receipt', async () => {
      const env = setup();
      await pendingCancel(env);
      const stopping = env.service.stop(
        owner,
        intent.handle,
        env.io,
        'canceled',
      );
      setTimeout(() => {
        terminal(env, '0.00005', '5');
        const row = env.observed.get('101');
        if (row) {
          env.observed.set('101', { ...row, terminal: false });
        }
      }, 1000);
      setTimeout(() => terminal(env, '0.00005', '5'), 2000);
      await jest.advanceTimersByTimeAsync(1250);
      expect([...env.disk.values()].join(' ')).toContain(
        '"executedSize":"0.00005"',
      );
      await jest.advanceTimersByTimeAsync(1000);
      expect(await stopping).toMatchObject({
        status: 'canceled',
        executedSize: '0.00005',
        executedNotional: '5',
      });
      expect(env.io.place).toHaveBeenCalledTimes(1);
      expect(env.io.cancel).toHaveBeenCalledTimes(1);
    });

    it('fences owner changes during the read-only wait before further reads or journal writes', async () => {
      const env = setup();
      await pendingCancel(env);
      const stopping = env.service
        .stop(owner, intent.handle, env.io, 'canceled')
        .catch((error: unknown) => error);
      await jest.advanceTimersByTimeAsync(1000);
      const disk = [...env.disk.entries()];
      const reads = jest.mocked(env.io.observe).mock.calls.length;
      jest.mocked(env.io.assertCurrent).mockImplementation(() => {
        throw new Error('owner changed');
      });
      await jest.advanceTimersByTimeAsync(250);
      expect(await stopping).toMatchObject({ message: 'owner changed' });
      expect([...env.disk.entries()]).toStrictEqual(disk);
      expect(env.io.observe).toHaveBeenCalledTimes(reads);
      expect(env.io.cancel).toHaveBeenCalledTimes(1);
    });

    it('retains foreign identity failures instead of retrying them as visibility lag', async () => {
      const env = setup();
      await pendingCancel(env);
      const observe = jest.mocked(env.io.observe).getMockImplementation();
      if (!observe) {
        throw new Error('Missing observation implementation');
      }
      jest
        .mocked(env.io.observe)
        .mockImplementation(async (child, recordEvidence) => {
          if (child.cancellations.length > 0) {
            throw new Error('foreign child identity');
          }
          return await observe(child, recordEvidence);
        });
      const result = await env.service.stop(
        owner,
        intent.handle,
        env.io,
        'canceled',
      );
      expect(result).toMatchObject({
        status: 'termination_pending',
        error: 'foreign child identity',
      });
      const reads = jest.mocked(env.io.observe).mock.calls.length;
      await jest.advanceTimersByTimeAsync(10000);
      expect(env.io.observe).toHaveBeenCalledTimes(reads);
      expect(env.io.cancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('prepared final quote', () => {
    it('persists a fresh bounded price after slow preparation without changing the original intent', async () => {
      const env = setup();
      const initial = structuredClone(intent);
      const place = jest.mocked(env.io.place).getMockImplementation();
      if (!place) {
        throw new Error('Missing placement implementation');
      }
      jest.mocked(env.io.place).mockImplementation(async (child, hooks) => {
        const { clientOrderId } = child;
        env.setNow(106000);
        await hooks.prepareQuote('99999.9');
        expect(child).toMatchObject({
          clientOrderId,
          price: '99999.9',
          size: intent.originalSize,
          quotedAt: 106000,
          placement: { phase: 'prepared' },
        });
        expect([...env.disk.values()].join(' ')).toContain('"price":"99999.9"');
        await place(child, hooks);
      });
      const result = await env.service.start(intent, env.io);
      expect(result.status).toBe('active');
      expect(result.intent).toStrictEqual(initial);
      expect(result.children).toHaveLength(1);
      expect(result.repricings).toBe(0);
    });
    it.each(['signed', 'attempted', 'acknowledged'] as const)(
      'refuses final quote mutation of a %s child',
      async (phase) => {
        const env = setup();
        let retained: LighterChaseDispatchHooks | undefined;
        let refusal: unknown;
        const mutate = async (
          hooks: LighterChaseDispatchHooks,
        ): Promise<void> => {
          try {
            await hooks.prepareQuote('99999.8');
          } catch (error) {
            refusal = error;
          }
        };
        jest.mocked(env.io.place).mockImplementation(async (child, hooks) => {
          retained = hooks;
          await hooks.prepareQuote('99999.9');
          await hooks.signed({
            nonce: 8,
            txHash: 'abcdabcd',
            expiresAt: 110000,
          });
          if (phase === 'signed') {
            await mutate(hooks);
          }
          await hooks.beforeDispatch();
          if (phase === 'attempted') {
            await mutate(hooks);
          }
          env.observed.set(child.clientOrderId, {
            orderId: '9001',
            terminal: false,
            filledSize: '0',
            filledNotional: '0',
            remainingSize: child.size,
          });
        });
        const result = await env.service.start(intent, env.io);
        expect(result.status).toBe('active');
        if (!retained) {
          throw new Error('Missing retained hooks');
        }
        if (phase === 'acknowledged') {
          await mutate(retained);
        }
        if (!(refusal instanceof Error)) {
          throw new Error('Expected a refused quote mutation');
        }
        expect(refusal.message).toContain('cannot change after signing');
        expect(result.children[0]).toMatchObject({
          price: '99999.9',
          quotedAt: 100000,
          size: intent.originalSize,
          placement: { phase: 'acknowledged' },
        });
      },
    );
    it.each([
      { now: 99999, error: 'clock moved backwards' },
      { now: 160000, error: 'duration elapsed' },
    ])('refuses a fresh quote with $error', async ({ now, error }) => {
      const env = setup();
      jest.mocked(env.io.place).mockImplementation(async (_child, hooks) => {
        env.setNow(now);
        await hooks.prepareQuote('99999.9');
      });
      const result = await env.service.start(intent, env.io);
      expect(result.status).toBe('failed');
      expect(result.error).toContain(error);
      expect(env.observed.size).toBe(0);
      expect(result.children[0].price).toBe('100000');
    });
    it.each(['failure', 'slow write'] as const)(
      'does not sign after final quote persistence %s',
      async (condition) => {
        const env = setup();
        let injected = false;
        env.storage.setItem.mockImplementation(async (key, value) => {
          if (!injected && value.includes('"price":"99999.9"')) {
            injected = true;
            if (condition === 'failure') {
              throw new Error('final quote disk failure');
            }
            env.setNow(106000);
          }
          env.disk.set(key, value);
        });
        const signed = jest.fn();
        jest.mocked(env.io.place).mockImplementation(async (_child, hooks) => {
          await hooks.prepareQuote('99999.9');
          signed();
          await hooks.signed({
            nonce: 8,
            txHash: 'abcdabcd',
            expiresAt: 110000,
          });
        });
        const result = await env.service.start(intent, env.io);
        expect(result.status).toBe('failed');
        expect(result.error).toContain(
          condition === 'failure'
            ? 'final quote disk failure'
            : 'quote is stale',
        );
        expect(signed).not.toHaveBeenCalled();
        expect(env.observed.size).toBe(0);
      },
    );
  });
  it('cancels the exact owned child despite unavailable fill reconciliation and retains pending termination', async () => {
    const env = setup();
    await env.service.start(intent, env.io);
    jest
      .mocked(env.io.observe)
      .mockRejectedValue(new Error('fill history unavailable'));
    const result = await env.service.stop(
      owner,
      intent.handle,
      env.io,
      'canceled',
    );
    expect(env.io.cancel).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('termination_pending');
    expect(result.error).toContain('fill history unavailable');
    expect(env.io.place).toHaveBeenCalledTimes(1);
  });
  it('accepts supported slot 2 for bounded Chase ownership', async () => {
    const env = setup();
    expect(
      (
        await env.service.start(
          { ...intent, owner: { ...owner, apiKeyIndex: 2 } },
          env.io,
        )
      ).status,
    ).toBe('active');
  });
  it.each(['abcd', 'gggggggg'])(
    'rejects invalid exact signed hash %s before transport',
    async (txHash) => {
      const env = setup();
      jest.mocked(env.io.place).mockImplementation(async (_child, hooks) => {
        await hooks.signed({ nonce: 8, txHash, expiresAt: 110000 });
      });
      const result = await env.service.start(intent, env.io);
      expect(result.error).toBe('Invalid Lighter Chase signing identity');
      expect(result.children[0].placement.phase).toBe('failed');
    },
  );
  it('persists immutable child ownership before sign and attempt before transport', async () => {
    const env = setup();
    const submitted: LighterChaseChild[] = [];
    jest.mocked(env.io.place).mockImplementation(async (child, hooks) => {
      expect([...env.disk.values()].join(' ')).toContain(child.clientOrderId);
      await hooks.signed({ nonce: 8, txHash: 'abcdabcd', expiresAt: 110000 });
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
      await hooks.signed({ nonce: 9, txHash: 'cdefcdef', expiresAt: 111000 });
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
    jest.useFakeTimers();
    try {
      const env = setup();
      await env.service.start(intent, env.io);
      jest.mocked(env.io.cancel).mockImplementation(async (_child, hooks) => {
        await hooks.signed({ nonce: 9, txHash: 'cdefcdef', expiresAt: 111000 });
        await hooks.beforeDispatch();
      });
      env.setNow(101000);
      env.setQuote('99999');
      const ticking = env.service.tick(owner, intent.handle, env.io);
      await jest.advanceTimersByTimeAsync(10000);
      const result = await ticking;
      expect(result.status).toBe('active');
      expect(env.io.place).toHaveBeenCalledTimes(1);
      await env.service.tick(owner, intent.handle, env.io);
      expect(env.io.cancel).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
  it('preserves response loss across restart without creating or resuming a child', async () => {
    const env = setup();
    jest.mocked(env.io.place).mockImplementation(async (_child, hooks) => {
      await hooks.signed({ nonce: 8, txHash: 'deadbeef', expiresAt: 110000 });
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
  it('releases a signed child refused before transport so stop needs no cancel', async () => {
    const env = setup();
    jest.mocked(env.io.place).mockImplementation(async (_child, hooks) => {
      await hooks.signed({ nonce: 8, txHash: 'abcdabcd', expiresAt: 110000 });
      throw new Error('nonce ledger full');
    });
    expect(await env.service.start(intent, env.io)).toMatchObject({
      status: 'failed',
      error: 'nonce ledger full',
    });
    const records = await env.service.list(owner, env.io);
    expect(records[0].children[0].placement.phase).toBe('failed');
    await env.service.stop(owner, intent.handle, env.io, 'canceled');
    expect(env.io.cancel).not.toHaveBeenCalled();
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
    const restarted = new LighterChaseService({ storage: env.storage });
    const records = await restarted.list(owner, env.io);
    expect(records[0].children[0].placement.phase).toBe('failed');
    expect(records[0].status).toBe('failed');
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
      expect(result.status).toBe('canceled');
      expect(result.stopReason).toBe(status);
      expect(result.children.at(-1)?.observation?.terminal).toBe(true);
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
      await hooks.signed({ nonce: 8, txHash: 'abcdabcd', expiresAt: 110000 });
      signed.resolve();
      await pending.promise;
      await hooks.beforeDispatch();
    });
    const starting = env.service.start(intent, env.io);
    await signed.promise;
    env.service.interrupt();
    pending.resolve();
    expect((await starting).status).toBe('failed');
    expect((await env.service.list(owner, env.io))[0].status).toBe('failed');
  });
  it('does not report an active session when interrupted after an accepted child', async () => {
    const env = setup();
    const original = jest.mocked(env.io.observe).getMockImplementation();
    if (!original) {
      throw new Error('Missing observation implementation');
    }
    jest
      .mocked(env.io.observe)
      .mockImplementation(async (child, recordEvidence) => {
        const result = await original(child, recordEvidence);
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
      await hooks.signed({ nonce: 8, txHash: 'abcddcba', expiresAt: 120000 });
      env.setNow(106000);
      await hooks.beforeDispatch();
    });
    const result = await env.service.start(intent, env.io);
    expect(result.status).toBe('failed');
    expect(result.children[0].placement.phase).toBe('failed');
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
  it('keeps local stop of a settled handle from interrupting newer or unrelated sessions', async () => {
    const env = setup();
    await env.service.start(intent, env.io);
    const settled = await env.service.stop(
      owner,
      intent.handle,
      env.io,
      'canceled',
    );
    const newer = { ...intent, handle: 'lighter-chase:200' };
    const unrelated = {
      ...intent,
      handle: 'lighter-chase:300',
      owner: { ...owner, accountIndex: 29 },
    };
    const current = await env.service.start(newer, env.io);
    const other = await env.service.start(unrelated, env.io);

    expect(
      await env.service.stopLocally(
        owner,
        intent.handle,
        { assertCurrent: env.io.assertCurrent },
        'backgrounded',
        'authority unavailable',
      ),
    ).toStrictEqual(settled);

    expect((await env.service.list(owner, env.io))[1]).toStrictEqual(current);
    expect((await env.service.list(unrelated.owner, env.io))[0]).toStrictEqual(
      other,
    );
    env.setNow(101000);
    env.setQuote('99999');
    expect(
      (await env.service.tick(owner, newer.handle, env.io)).repricings,
    ).toBe(1);
    expect(
      (await env.service.tick(unrelated.owner, unrelated.handle, env.io))
        .repricings,
    ).toBe(1);
  });
  it('rejects a local stop when its session changes during the journal read', async () => {
    const env = setup();
    const retained = await env.service.start(intent, env.io);
    const entered = createDeferred<void>();
    const pending = createDeferred<void>();
    let current = true;
    const assertCurrent = (): void => {
      if (!current) {
        throw new Error('session changed');
      }
    };
    env.storage.getItem.mockImplementationOnce(async (key) => {
      entered.resolve();
      await pending.promise;
      return env.disk.get(key) ?? null;
    });
    const writes = env.storage.setItem.mock.calls.length;
    const reads = jest.mocked(env.io.observe).mock.calls.length;
    const stopping = env.service.stopLocally(
      owner,
      intent.handle,
      { assertCurrent },
      'backgrounded',
      'authority unavailable',
    );
    await entered.promise;
    current = false;
    pending.resolve();

    await expect(stopping).rejects.toThrow('session changed');

    expect(env.storage.setItem).toHaveBeenCalledTimes(writes);
    expect(jest.mocked(env.io.observe)).toHaveBeenCalledTimes(reads);
    expect(env.io.cancel).not.toHaveBeenCalled();
    expect((await env.service.list(owner, env.io))[0].children).toStrictEqual(
      retained.children,
    );
  });
  it('rejects failed local stop persistence without consuming cancellation ownership', async () => {
    const env = setup();
    const retained = await env.service.start(intent, env.io);
    env.storage.setItem.mockRejectedValueOnce(
      new Error('local stop storage unavailable'),
    );

    await expect(
      env.service.stopLocally(
        owner,
        intent.handle,
        { assertCurrent: env.io.assertCurrent },
        'backgrounded',
        'authority unavailable',
      ),
    ).rejects.toThrow('local stop storage unavailable');

    expect(env.io.cancel).not.toHaveBeenCalled();
    expect((await env.service.list(owner, env.io))[0].children).toStrictEqual(
      retained.children,
    );
  });
  it('checks the absolute duration before the interval throttle', async () => {
    const env = setup();
    await env.service.start(
      { ...intent, intervalMs: 120000, maxDurationMs: 180000 },
      env.io,
    );
    env.setNow(220000);
    await env.service.tick(owner, intent.handle, env.io);
    env.setNow(280000);
    const result = await env.service.tick(owner, intent.handle, env.io);
    expect(result).toMatchObject({
      status: 'canceled',
      stopReason: 'duration_reached',
    });
    expect(env.io.cancel).toHaveBeenCalledTimes(1);
    expect(env.io.place).toHaveBeenCalledTimes(1);
  });
  it('requests duration cleanup after a slow quote without replacing', async () => {
    const env = setup();
    await env.service.start(intent, env.io);
    env.setNow(159000);
    jest.mocked(env.io.quote).mockImplementation(async () => {
      env.setNow(160000);
      return '99999';
    });
    const result = await env.service.tick(owner, intent.handle, env.io);
    expect(result).toMatchObject({
      status: 'canceled',
      stopReason: 'duration_reached',
    });
    expect(env.io.place).toHaveBeenCalledTimes(1);
    expect(env.io.cancel).toHaveBeenCalledTimes(1);
  });
  it('keeps a settled stop reason and status unchanged on later cancellation', async () => {
    const env = setup();
    await env.service.start(intent, env.io);
    env.setNow(160000);
    const stopped = await env.service.tick(owner, intent.handle, env.io);
    const repeated = await env.service.stop(
      owner,
      intent.handle,
      env.io,
      'backgrounded',
    );
    expect(repeated).toStrictEqual(stopped);
    expect(repeated).toMatchObject({
      status: 'canceled',
      stopReason: 'duration_reached',
    });
    expect(env.io.cancel).toHaveBeenCalledTimes(1);
  });
  it('preserves the first stop reason while cleanup remains uncertain', async () => {
    const env = setup();
    await env.service.start(intent, env.io);
    jest.mocked(env.io.cancel).mockRejectedValue(new Error('unavailable'));
    await env.service.stop(owner, intent.handle, env.io, 'canceled');
    const result = await env.service.stop(
      owner,
      intent.handle,
      env.io,
      'backgrounded',
    );
    expect(result.stopReason).toBe('canceled');
    expect(result.status).toBe('termination_pending');
  });
  it('retains the explicit stop reason requested during an in-flight quote', async () => {
    const env = setup();
    await env.service.start(intent, env.io);
    env.setNow(101000);
    const quoted = createDeferred<void>();
    const pending = createDeferred<string>();
    jest.mocked(env.io.quote).mockImplementation(async () => {
      quoted.resolve();
      return await pending.promise;
    });
    const ticking = env.service.tick(owner, intent.handle, env.io);
    await quoted.promise;
    const stopping = env.service.stop(owner, intent.handle, env.io, 'canceled');
    pending.resolve('99999');
    await ticking;
    expect(await stopping).toMatchObject({
      status: 'canceled',
      stopReason: 'canceled',
    });
    expect(env.io.place).toHaveBeenCalledTimes(1);
    expect(env.io.cancel).toHaveBeenCalledTimes(1);
  });
});
