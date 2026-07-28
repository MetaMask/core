import type { TraceCallback, TraceRequest } from '@metamask/controller-utils';

import type { SpanHandle } from './traced.js';
import { emitTrace, registerTracer, traced } from './traced.js';

/**
 * A trace callback that records every request and hands each span a unique
 * context object, so tests can assert nesting by identity.
 */
type Recorder = {
  trace: TraceCallback;
  requests: TraceRequest[];
  contexts: unknown[];
};

/**
 * Build a recording trace callback.
 *
 * @returns The callback plus the requests and contexts it has seen.
 */
function makeRecorder(): Recorder {
  const requests: TraceRequest[] = [];
  const contexts: unknown[] = [];
  const trace = (async (
    request: TraceRequest,
    fn?: (context?: unknown) => unknown,
  ) => {
    requests.push(request);
    const context = { spanId: `span-${requests.length}` };
    contexts.push(context);
    return fn?.(context);
  }) as TraceCallback;
  return { trace, requests, contexts };
}

/**
 * Find the requests with a given span name.
 *
 * @param requests - Requests seen by the recorder.
 * @param name - Span name to filter by.
 * @returns The matching requests.
 */
function withName(requests: TraceRequest[], name: string): TraceRequest[] {
  return requests.filter((request) => request.name === name);
}

/**
 * A controller with two nested traced methods, modelling a public entry point
 * that decides the root tracing policy and a private choke point below it.
 */
class DemoController {
  readonly #label = 'demo';

  #firstInitReported = false;

  readonly executionCounts: Record<string, number> = {};

  constructor(trace?: TraceCallback) {
    registerTracer(this, trace);
  }

  async getAssets(accounts: string[]): Promise<string[]> {
    const span: SpanHandle = { enabled: !this.#firstInitReported };
    this.#firstInitReported = true;
    return this.#fullFetch(span, accounts);
  }

  @traced({
    name: 'AssetsFetchPipeline',
    tags: { controller: 'DemoController' },
    data: (accounts: string[]) => ({ account_count: accounts.length }),
  })
  async #fullFetch(span: SpanHandle, accounts: string[]): Promise<string[]> {
    this.#count('fullFetch');
    // `span` is the handle injected by the decorator, carrying this method's
    // own span context; passing it to a traced child nests the child.
    return this.#enrich(span, accounts);
  }

  @traced({ name: 'AssetsUpdateEnrichment' })
  async #enrich(_span: SpanHandle, accounts: string[]): Promise<string[]> {
    this.#count('enrich');
    if (accounts.includes('boom')) {
      throw new Error('enrichment failed');
    }
    return accounts.map((account) => `${account}:${this.#label}`);
  }

  #count(key: string): void {
    this.executionCounts[key] = (this.executionCounts[key] ?? 0) + 1;
  }
}

const LANE_SPAN_NAMES = {
  fast: 'AssetsFetchPipeline',
  background: 'AssetsBackgroundFetch',
  update: 'AssetsUpdateEnrichment',
} as const;

type Lane = keyof typeof LANE_SPAN_NAMES;
type PipelineOptions = { lane: Lane; sources: string[] };
type PipelineResult = { balances: Record<string, number> };

/**
 * A controller whose single decorated choke point serves several lanes, each
 * keeping its own span name and summary records.
 */
class PipelineController {
  tracingEnabled = true;

  readonly #trace?: TraceCallback;

  constructor(trace?: TraceCallback) {
    this.#trace = trace;
    registerTracer(this, trace);
  }

  async run(
    lane: Lane,
    sources: string[],
    initial?: Record<string, number>,
  ): Promise<PipelineResult> {
    const span: SpanHandle = { enabled: this.tracingEnabled };
    return initial === undefined
      ? this.#executeMiddlewares(span, { lane, sources })
      : this.#executeMiddlewares(span, { lane, sources }, initial);
  }

  @traced({
    name: (options: PipelineOptions) => LANE_SPAN_NAMES[options.lane],
    tags: { controller: 'PipelineController' },
    data: (options: PipelineOptions) => ({
      lane: options.lane,
      source_count: options.sources.length,
    }),
    summary: (
      result: PipelineResult,
      elapsedMs: number,
      options: PipelineOptions,
    ) =>
      options.lane === 'fast'
        ? {
            name: 'AssetsFullFetch',
            data: {
              duration_ms: elapsedMs,
              asset_count: Object.keys(result.balances).length,
            },
            tags: { controller: 'PipelineController' },
          }
        : undefined,
  })
  async #executeMiddlewares(
    span: SpanHandle,
    options: PipelineOptions,
    initialResponse: Record<string, number> = {},
  ): Promise<PipelineResult> {
    const balances = { ...initialResponse };
    for (const source of options.sources) {
      balances[source] = 1;
      emitTrace(this.#trace, span, {
        name: 'AssetsDataSourceTiming',
        data: { source, duration_ms: 5 },
        tags: { source },
      });
    }
    return { balances };
  }
}

describe('traced', () => {
  describe('span creation and nesting', () => {
    it('returns the work result and preserves access to private fields', async () => {
      const { trace } = makeRecorder();
      const controller = new DemoController(trace);

      expect(await controller.getAssets(['acc1', 'acc2'])).toStrictEqual([
        'acc1:demo',
        'acc2:demo',
      ]);
    });

    it('emits a root span for the outermost traced method', async () => {
      const { trace, requests } = makeRecorder();
      const controller = new DemoController(trace);

      await controller.getAssets(['acc1']);

      expect(requests).toHaveLength(2);
      expect(requests[0]).toMatchObject({
        name: 'AssetsFetchPipeline',
        parentContext: undefined,
        tags: { controller: 'DemoController' },
      });
    });

    it('passes the call arguments to the data extractor', async () => {
      const { trace, requests } = makeRecorder();
      const controller = new DemoController(trace);

      await controller.getAssets(['acc1', 'acc2']);

      expect(requests[0]?.data).toStrictEqual({ account_count: 2 });
    });

    it('nests a child span under the context injected into its parent', async () => {
      const { trace, requests, contexts } = makeRecorder();
      const controller = new DemoController(trace);

      await controller.getAssets(['acc1']);

      expect(requests[1]).toMatchObject({
        name: 'AssetsUpdateEnrichment',
        parentContext: contexts[0],
      });
    });
  });

  describe('when tracing is disabled for the call tree', () => {
    it('silences every span below the entry point but still runs the work', async () => {
      const { trace, requests } = makeRecorder();
      const controller = new DemoController(trace);

      await controller.getAssets(['acc1']);
      const spansAfterFirstCall = requests.length;
      const result = await controller.getAssets(['acc2']);

      expect(requests).toHaveLength(spansAfterFirstCall);
      expect(result).toStrictEqual(['acc2:demo']);
    });
  });

  describe('when no tracer is registered', () => {
    it('passes through to the work untouched', async () => {
      const controller = new DemoController(undefined);

      expect(await controller.getAssets(['acc1'])).toStrictEqual(['acc1:demo']);
    });
  });

  describe('when the tracer fails', () => {
    it('returns the work result if the tracer rejects after the work ran', async () => {
      const trace = (async (
        _request: TraceRequest,
        fn?: (context?: unknown) => unknown,
      ) => {
        if (fn) {
          await fn({ id: 'parent' });
          throw new Error('telemetry failed');
        }
        return undefined;
      }) as TraceCallback;
      const controller = new DemoController(trace);

      expect(await controller.getAssets(['acc1'])).toStrictEqual(['acc1:demo']);
      expect(controller.executionCounts.enrich).toBe(1);
    });

    it('runs the work exactly once if the tracer rejects before invoking it', async () => {
      const trace = (async () => {
        throw new Error('telemetry failed');
      }) as TraceCallback;
      const controller = new DemoController(trace);

      expect(await controller.getAssets(['acc1'])).toStrictEqual(['acc1:demo']);
      expect(controller.executionCounts).toStrictEqual({
        fullFetch: 1,
        enrich: 1,
      });
    });
  });

  describe('when the work throws', () => {
    it('propagates the error rather than swallowing it as telemetry', async () => {
      const { trace } = makeRecorder();
      const controller = new DemoController(trace);

      await expect(controller.getAssets(['boom'])).rejects.toThrow(
        'enrichment failed',
      );
    });
  });

  describe('as a single choke point for several lanes', () => {
    it('accepts an object parameter alongside a trailing defaulted parameter', async () => {
      const { trace } = makeRecorder();
      const controller = new PipelineController(trace);

      const result = await controller.run('fast', ['api', 'staked'], {
        seed: 1,
      });

      expect(result.balances).toStrictEqual({ seed: 1, api: 1, staked: 1 });
    });

    it('derives the span name from the call arguments', async () => {
      const { trace, requests } = makeRecorder();
      const controller = new PipelineController(trace);

      await controller.run('fast', ['api']);

      expect(requests[0]).toMatchObject({
        name: 'AssetsFetchPipeline',
        data: { lane: 'fast', source_count: 1 },
      });
    });

    it('gives a different lane its own root span name', async () => {
      const { trace, requests } = makeRecorder();
      const controller = new PipelineController(trace);

      await controller.run('background', ['rpc']);

      expect(requests[0]).toMatchObject({
        name: 'AssetsBackgroundFetch',
        parentContext: undefined,
      });
    });

    it('nests records emitted from the method body under its own span', async () => {
      const { trace, requests, contexts } = makeRecorder();
      const controller = new PipelineController(trace);

      await controller.run('fast', ['api', 'staked']);

      const timings = withName(requests, 'AssetsDataSourceTiming');
      expect(timings).toHaveLength(2);
      expect(
        timings.every((request) => request.parentContext === contexts[0]),
      ).toBe(true);
    });
  });

  describe('summary records', () => {
    it('derives them from the result and nests them under the span', async () => {
      const { trace, requests, contexts } = makeRecorder();
      const controller = new PipelineController(trace);

      await controller.run('fast', ['api', 'staked']);

      expect(withName(requests, 'AssetsFullFetch')[0]).toMatchObject({
        parentContext: contexts[0],
        data: { duration_ms: expect.any(Number), asset_count: 2 },
        tags: { duration_ms: expect.any(Number), asset_count: 2 },
        startTime: expect.any(Number),
      });
    });

    it('emits them while the span is still open', async () => {
      // A record attached to an already-finished Sentry transaction is
      // orphaned and dropped, so the parent must still be open at this point.
      const openSpans: string[] = [];
      const openWhenSummaryEmitted: string[][] = [];
      const trace = (async (
        request: TraceRequest,
        fn?: (context?: unknown) => unknown,
      ) => {
        if (request.name === 'AssetsFullFetch') {
          openWhenSummaryEmitted.push([...openSpans]);
        }
        if (!fn) {
          return undefined;
        }
        openSpans.push(request.name);
        try {
          return await fn({ spanId: request.name });
        } finally {
          openSpans.pop();
        }
      }) as TraceCallback;

      await new PipelineController(trace).run('fast', ['api']);

      expect(openWhenSummaryEmitted).toStrictEqual([['AssetsFetchPipeline']]);
    });

    it('emits nothing when the extractor returns undefined', async () => {
      const { trace, requests } = makeRecorder();
      const controller = new PipelineController(trace);

      await controller.run('background', ['rpc']);

      expect(withName(requests, 'AssetsFullFetch')).toHaveLength(0);
    });

    it('is silenced along with the wrap span when tracing is disabled', async () => {
      const { trace, requests } = makeRecorder();
      const controller = new PipelineController(trace);
      controller.tracingEnabled = false;

      const result = await controller.run('fast', ['api']);

      expect(requests).toHaveLength(0);
      expect(result.balances).toStrictEqual({ api: 1 });
    });
  });
});

describe('emitTrace', () => {
  it('copies numeric data fields into tags so Sentry records measurements', () => {
    const { trace, requests } = makeRecorder();

    emitTrace(trace, undefined, {
      name: 'AssetsStateSize',
      data: { asset_count: 12, source: 'api' },
      tags: { controller: 'AssetsController' },
    });

    expect(requests[0]?.tags).toStrictEqual({
      controller: 'AssetsController',
      asset_count: 12,
    });
  });

  it('backdates startTime by duration_ms so the span renders its real length', () => {
    const { trace, requests } = makeRecorder();
    const before = performance.timeOrigin + performance.now();

    emitTrace(trace, undefined, {
      name: 'AssetsFullFetch',
      data: { duration_ms: 250 },
    });

    const startTime = requests[0]?.startTime as number;
    expect(startTime).toBeGreaterThanOrEqual(before - 250);
    expect(startTime).toBeLessThanOrEqual(
      performance.timeOrigin + performance.now() - 250,
    );
  });

  it('omits startTime when there is no duration to backdate from', () => {
    const { trace, requests } = makeRecorder();

    emitTrace(trace, undefined, { name: 'AssetsSubscriptionError' });

    expect(requests[0]).toStrictEqual({
      name: 'AssetsSubscriptionError',
      data: {},
      tags: {},
      parentContext: undefined,
    });
  });

  it('nests the record under the handle parent', () => {
    const { trace, requests } = makeRecorder();
    const parent = { spanId: 'parent' };

    emitTrace(trace, { parent }, { name: 'AssetsDataSourceTiming' });

    expect(requests[0]?.parentContext).toBe(parent);
  });

  it('does nothing without a tracer', () => {
    expect(() =>
      emitTrace(undefined, undefined, { name: 'AssetsFullFetch' }),
    ).not.toThrow();
  });

  it('does nothing when the handle disables tracing', () => {
    const { trace, requests } = makeRecorder();

    emitTrace(trace, { enabled: false }, { name: 'AssetsFullFetch' });

    expect(requests).toHaveLength(0);
  });

  it('swallows a tracer that throws synchronously', () => {
    const trace = (() => {
      throw new Error('telemetry failed');
    }) as TraceCallback;

    expect(() =>
      emitTrace(trace, undefined, { name: 'AssetsFullFetch' }),
    ).not.toThrow();
  });

  it('swallows a tracer that rejects', async () => {
    const unhandled = jest.fn();
    process.once('unhandledRejection', unhandled);
    const trace = (async () => {
      throw new Error('telemetry failed');
    }) as TraceCallback;

    emitTrace(trace, undefined, { name: 'AssetsFullFetch' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(unhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', unhandled);
  });
});

describe('registerTracer', () => {
  it('leaves the instance untraced when given no callback', async () => {
    const { requests } = makeRecorder();
    const controller = new DemoController(undefined);

    await controller.getAssets(['acc1']);

    expect(requests).toHaveLength(0);
  });
});
