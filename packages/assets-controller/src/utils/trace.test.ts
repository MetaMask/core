import type { TraceCallback, TraceRequest } from '@metamask/controller-utils';

import { emitTrace, withTrace } from './trace.js';

describe('emitTrace', () => {
  it('is a no-op when trace is omitted', () => {
    expect(() =>
      emitTrace({
        name: 'TestSpan',
        data: { duration_ms: 1 },
      }),
    ).not.toThrow();
  });

  it('invokes trace with duration tags and backdated startTime', () => {
    const trace = jest.fn().mockResolvedValue(undefined);

    emitTrace({
      name: 'TestSpan',
      trace: trace as unknown as TraceCallback,
      data: { duration_ms: 25, chain_count: 2 },
      parentContext: { id: 'parent' },
    });

    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'TestSpan',
        data: { duration_ms: 25, chain_count: 2 },
        tags: expect.objectContaining({
          controller: 'AssetsController',
          duration_ms: 25,
          chain_count: 2,
        }),
        parentContext: { id: 'parent' },
        startTime: expect.any(Number),
      }),
      expect.any(Function),
    );
  });

  it('swallows rejected trace promises', () => {
    const trace = jest.fn().mockRejectedValue(new Error('telemetry failed'));

    expect(() =>
      emitTrace({
        name: 'TestSpan',
        trace: trace as unknown as TraceCallback,
        data: { ok: true },
      }),
    ).not.toThrow();
  });
});

describe('withTrace', () => {
  it('runs fn without parent context when trace is omitted', async () => {
    const result = await withTrace({
      name: 'Parent',
      data: {},
      fn: async (parentContext) => {
        expect(parentContext).toBeUndefined();
        return 'done';
      },
    });

    expect(result).toBe('done');
  });

  it('passes parent context from trace into fn', async () => {
    const parentSpan = { id: 'parent' };
    const trace = jest
      .fn()
      .mockImplementation(
        async (_request: TraceRequest, fn?: (context?: unknown) => unknown) =>
          fn?.(parentSpan),
      );

    const result = await withTrace({
      name: 'Parent',
      trace: trace as unknown as TraceCallback,
      data: { chain_count: 1 },
      fn: async (parentContext) => {
        expect(parentContext).toBe(parentSpan);
        return 42;
      },
    });

    expect(result).toBe(42);
  });

  it('does not fail when trace rejects after work completes', async () => {
    const trace = jest
      .fn()
      .mockImplementation(
        async (_request: TraceRequest, fn?: (context?: unknown) => unknown) => {
          await fn?.({ id: 'parent' });
          throw new Error('telemetry failed');
        },
      );

    expect(
      await withTrace({
        name: 'Parent',
        trace: trace as unknown as TraceCallback,
        data: {},
        fn: async () => 'ok',
      }),
    ).toBe('ok');
  });

  it('still runs work when trace rejects before invoking fn', async () => {
    const trace = jest.fn().mockRejectedValue(new Error('telemetry failed'));

    expect(
      await withTrace({
        name: 'Parent',
        trace: trace as unknown as TraceCallback,
        data: {},
        fn: async () => 'fallback',
      }),
    ).toBe('fallback');
  });

  it('propagates errors thrown by fn', async () => {
    const trace = jest
      .fn()
      .mockImplementation(
        async (_request: TraceRequest, fn?: (context?: unknown) => unknown) =>
          fn?.({ id: 'parent' }),
      );

    await expect(
      withTrace({
        name: 'Parent',
        trace: trace as unknown as TraceCallback,
        data: {},
        fn: async () => {
          throw new Error('pipeline failed');
        },
      }),
    ).rejects.toThrow('pipeline failed');
  });
});
