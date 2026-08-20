import { debugLog, debugLogStore } from './debugLogStore.js';
import type { DebugLogEvent } from './debugLogStore.js';

describe('debugLogStore', () => {
  afterEach(() => {
    debugLogStore.disable();
  });

  it('is disabled by default and drops published events', () => {
    const listener = jest.fn();
    const unsubscribe = debugLogStore.subscribe(listener);
    debugLogStore.publish({ className: 'C', methodName: 'm' });
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('publishes stamped events to subscribers when enabled', () => {
    debugLogStore.enable();
    const events: DebugLogEvent[] = [];
    const unsubscribe = debugLogStore.subscribe((event) => events.push(event));

    const before = Date.now();
    debugLogStore.publish({ className: 'C', methodName: 'm', data: { ok: true } });
    const after = Date.now();

    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event?.className).toBe('C');
    expect(event?.methodName).toBe('m');
    expect(event?.data).toStrictEqual({ ok: true });
    expect(event?.timestampMs).toBeGreaterThanOrEqual(before);
    expect(event?.timestampMs).toBeLessThanOrEqual(after);
    expect(event?.timestamp).toBe(new Date(event?.timestampMs ?? 0).toISOString());
    unsubscribe();
  });

  it('stamps the ambient context set via runWithContext', () => {
    debugLogStore.enable();
    let captured: DebugLogEvent | undefined;
    const unsubscribe = debugLogStore.subscribe((event) => {
      captured = event;
    });

    debugLogStore.runWithContext({ trigger: 'network-removed', lane: 'fast' }, () => {
      debugLogStore.publish({ className: 'C', methodName: 'm' });
    });

    expect(captured?.context).toStrictEqual({
      trigger: 'network-removed',
      lane: 'fast',
    });
    // Context is popped after the scope ends.
    expect(debugLogStore.currentContext()).toStrictEqual({});
    unsubscribe();
  });

  it('merges nested contexts and restores the parent on exit', () => {
    const inner = debugLogStore.runWithContext(
      { trigger: 'startup', sources: ['A'] },
      () =>
        debugLogStore.runWithContext({ lane: 'slow' }, () =>
          debugLogStore.currentContext(),
        ),
    );
    expect(inner).toStrictEqual({ trigger: 'startup', sources: ['A'], lane: 'slow' });
    expect(debugLogStore.currentContext()).toStrictEqual({});
  });

  it('pops the context even when the scoped fn throws', () => {
    expect(() =>
      debugLogStore.runWithContext({ trigger: 'startup' }, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(debugLogStore.currentContext()).toStrictEqual({});
  });

  it('isolates a faulty subscriber from the rest', () => {
    debugLogStore.enable();
    const good = jest.fn();
    const unsubBad = debugLogStore.subscribe(() => {
      throw new Error('bad listener');
    });
    const unsubGood = debugLogStore.subscribe(good);

    expect(() =>
      debugLogStore.publish({ className: 'C', methodName: 'm' }),
    ).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    unsubBad();
    unsubGood();
  });

  it('disable clears dangling context frames', () => {
    debugLogStore.enable();
    debugLogStore.runWithContext({ trigger: 'startup' }, () => {
      debugLogStore.disable();
    });
    debugLogStore.enable();
    expect(debugLogStore.currentContext()).toStrictEqual({});
  });
});

describe('debugLog decorator', () => {
  afterEach(() => {
    debugLogStore.disable();
  });

  class Example {
    // eslint-disable-next-line no-empty-function
    @debugLog()
    sync(value: number): number {
      return value * 2;
    }

    @debugLog()
    async asyncOk(value: number): Promise<number> {
      return Promise.resolve(value + 1);
    }

    @debugLog()
    throws(): number {
      throw new Error('sync boom');
    }

    @debugLog()
    async asyncThrows(): Promise<number> {
      return Promise.reject(new Error('async boom'));
    }
  }

  it('is a passthrough when the store is disabled', () => {
    const example = new Example();
    const listener = jest.fn();
    const unsubscribe = debugLogStore.subscribe(listener);
    expect(example.sync(3)).toBe(6);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('publishes class, method, output and duration for sync methods', () => {
    debugLogStore.enable();
    let event: DebugLogEvent | undefined;
    const unsubscribe = debugLogStore.subscribe((published) => {
      event = published;
    });
    const example = new Example();

    expect(example.sync(4)).toBe(8);
    expect(event?.className).toBe('Example');
    expect(event?.methodName).toBe('sync');
    expect(event?.data).toBe(8);
    expect(event?.error).toBeUndefined();
    expect(typeof event?.durationMs).toBe('number');
    unsubscribe();
  });

  it('awaits async methods before publishing their resolved value', async () => {
    debugLogStore.enable();
    let event: DebugLogEvent | undefined;
    const unsubscribe = debugLogStore.subscribe((published) => {
      event = published;
    });
    const example = new Example();

    await expect(example.asyncOk(4)).resolves.toBe(5);
    expect(event?.methodName).toBe('asyncOk');
    expect(event?.data).toBe(5);
    unsubscribe();
  });

  it('captures the context snapshot at call time for async methods', async () => {
    debugLogStore.enable();
    let event: DebugLogEvent | undefined;
    const unsubscribe = debugLogStore.subscribe((published) => {
      event = published;
    });
    const example = new Example();

    const promise = debugLogStore.runWithContext({ trigger: 'startup' }, async () =>
      example.asyncOk(1),
    );
    // Scope has already popped synchronously here.
    expect(debugLogStore.currentContext()).toStrictEqual({});
    await promise;
    expect(event?.context).toStrictEqual({ trigger: 'startup' });
    unsubscribe();
  });

  it('records and rethrows sync errors', () => {
    debugLogStore.enable();
    let event: DebugLogEvent | undefined;
    const unsubscribe = debugLogStore.subscribe((published) => {
      event = published;
    });
    const example = new Example();

    expect(() => example.throws()).toThrow('sync boom');
    expect(event?.error).toBe('sync boom');
    expect(event?.data).toBeUndefined();
    unsubscribe();
  });

  it('records and rethrows async rejections', async () => {
    debugLogStore.enable();
    let event: DebugLogEvent | undefined;
    const unsubscribe = debugLogStore.subscribe((published) => {
      event = published;
    });
    const example = new Example();

    await expect(example.asyncThrows()).rejects.toThrow('async boom');
    expect(event?.error).toBe('async boom');
    unsubscribe();
  });
});
