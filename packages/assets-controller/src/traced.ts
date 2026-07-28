import type { TraceCallback, TraceContext } from '@metamask/controller-utils';

/**
 * Decorator-based Sentry tracing.
 *
 * The protocol: every traced method takes a {@link SpanHandle} as its FIRST
 * parameter. Callers pass their own handle; {@link traced} consumes it (using
 * `.parent` to nest and `.enabled` to decide whether to emit at all) and
 * injects a NEW handle carrying the freshly created span's context into the
 * method body. Inside a traced method, `span` is therefore *your own* span —
 * pass it to traced children or to {@link emitTrace} to nest them underneath.
 *
 * `enabled: false` short-circuits tracing and propagates down the entire call
 * tree, so a single decision at a public entry point silences everything below
 * it without conditionals sprinkled through the implementation.
 *
 * The handle is the first parameter rather than the last because methods with
 * trailing optional or defaulted parameters make a trailing handle unreliable
 * to locate at runtime.
 */

/**
 * A tracing handle threaded through a call tree.
 */
export type SpanHandle = {
  /** Context of the enclosing span; children nest under it. */
  parent?: TraceContext;
  /** When `false`, no spans are emitted anywhere below this point. */
  enabled?: boolean;
};

/**
 * A zero-duration span used to record a set of measurements, as opposed to
 * wrapping a unit of work.
 */
export type SummaryRecord = {
  /** Span name visible in Sentry. */
  name: string;
  /** Key-value pairs attached as span data. */
  data?: Record<string, number | string | boolean>;
  /** Key-value pairs used for Sentry filtering. */
  tags?: Record<string, number | string | boolean>;
};

/**
 * Decorator wrappers cannot read `#private` fields — private names are
 * lexically scoped to the class body — so instances publish their tracer here
 * instead. Module-private, therefore as encapsulated as a `#field`.
 */
const tracers = new WeakMap<object, TraceCallback>();

/**
 * Associate a trace callback with an instance so that {@link traced} methods on
 * it emit spans. Call this from the constructor. Instances registered without a
 * callback stay untraced, and their decorated methods become pure passthroughs.
 *
 * @param instance - The instance whose decorated methods should be traced.
 * @param trace - Trace callback supplied by the client, if any.
 */
export function registerTracer(
  instance: object,
  trace: TraceCallback | undefined,
): void {
  if (trace) {
    tracers.set(instance, trace);
  }
}

/**
 * Emit a fire-and-forget record span. The handle internalizes both whether to
 * trace at all (`span.enabled`) and where to nest (`span.parent`).
 *
 * Numeric `data` fields are copied into `tags` because MetaMask's Sentry
 * adapter promotes numeric tags to measurements, which is what dashboard
 * widgets chart (`tags[duration_ms,number]`). When `data.duration_ms` is
 * present, `startTime` is backdated by that amount so the span's rendered
 * duration matches the work that was measured.
 *
 * @param trace - Trace callback supplied by the client, if any.
 * @param span - Handle of the enclosing span, if any.
 * @param record - The span to record.
 */
export function emitTrace(
  trace: TraceCallback | undefined,
  span: SpanHandle | undefined,
  record: SummaryRecord,
): void {
  if (!trace || span?.enabled === false) {
    return;
  }

  const data = record.data ?? {};
  const numericFromData: Record<string, number> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'number') {
      numericFromData[key] = value;
    }
  }

  const durationMs =
    typeof data.duration_ms === 'number' ? data.duration_ms : undefined;
  const startTime =
    durationMs === undefined
      ? undefined
      : performance.timeOrigin + performance.now() - durationMs;

  try {
    trace(
      {
        name: record.name,
        data,
        tags: { ...record.tags, ...numericFromData },
        parentContext: span?.parent,
        ...(startTime === undefined ? {} : { startTime }),
      },
      () => undefined,
    )?.catch(() => {
      // Telemetry failure must not break.
    });
  } catch {
    // Telemetry failure must not break.
  }
}

/**
 * Options for {@link traced}.
 *
 * The extractors are typed against a PREFIX of the decorated method's
 * arguments (excluding the span handle), so an extractor only has to type the
 * parameters it actually reads even when the method has further trailing or
 * defaulted parameters.
 */
export type TracedOptions<
  ExtractorArgs extends readonly unknown[],
  ExtractorResult,
> = {
  /** Span name, or a function deriving it from the call's arguments. */
  name: string | ((...args: ExtractorArgs) => string);
  /** Key-value pairs used for Sentry filtering. */
  tags?: Record<string, string | number | boolean>;
  /** Derives span data from the call's arguments. */
  data?: (...args: ExtractorArgs) => Record<string, string | number | boolean>;
  /**
   * Derives record spans from the result. They are emitted while the span is
   * still open so that they nest under it: a child attached to an
   * already-finished Sentry transaction is orphaned and dropped.
   */
  summary?: (
    result: ExtractorResult,
    elapsedMs: number,
    ...args: ExtractorArgs
  ) => SummaryRecord | SummaryRecord[] | undefined;
};

/**
 * Wrap an async method in a Sentry span.
 *
 * The decorated method must take a {@link SpanHandle} as its first parameter;
 * see the module documentation for the protocol.
 *
 * Telemetry never breaks the work: if the tracer rejects after the work ran,
 * the work's result is returned; if it rejects before invoking the work, the
 * work runs once without a span. Errors thrown by the work itself propagate.
 *
 * @param options - See {@link TracedOptions}.
 * @returns A method decorator.
 */
export function traced<
  ExtractorArgs extends readonly unknown[] = readonly unknown[],
  ExtractorResult = unknown,
>(options: TracedOptions<ExtractorArgs, ExtractorResult>) {
  return function decorate<
    This extends object,
    Args extends readonly [...ExtractorArgs, ...unknown[]],
    Return extends ExtractorResult,
  >(
    // The handle is declared required here so that a method may declare it
    // either way: `span: SpanHandle | undefined` still satisfies this
    // contravariantly, while `span: SpanHandle` forces every call site to
    // state whether it wants tracing.
    target: (this: This, span: SpanHandle, ...args: Args) => Promise<Return>,
    _context: ClassMethodDecoratorContext<
      This,
      (this: This, span: SpanHandle, ...args: Args) => Promise<Return>
    >,
  ) {
    // Extractors are typed against a prefix of the method's arguments; JS
    // ignores extra arguments, so calling them with all of them is safe.
    const getName = (args: Args): string =>
      typeof options.name === 'function'
        ? (options.name as (...a: readonly unknown[]) => string)(...args)
        : options.name;

    const getData = (
      args: Args,
    ): Record<string, string | number | boolean> | undefined =>
      options.data
        ? (
            options.data as (
              ...a: readonly unknown[]
            ) => Record<string, string | number | boolean>
          )(...args)
        : undefined;

    const getSummaryRecords = (
      value: Return,
      elapsedMs: number,
      args: Args,
    ): SummaryRecord[] => {
      if (!options.summary) {
        return [];
      }
      const produced = (
        options.summary as (
          result: unknown,
          elapsed: number,
          ...a: readonly unknown[]
        ) => SummaryRecord | SummaryRecord[] | undefined
      )(value, elapsedMs, ...args);
      if (produced === undefined) {
        return [];
      }
      return Array.isArray(produced) ? produced : [produced];
    };

    return async function tracedMethod(
      this: This,
      span: SpanHandle,
      ...args: Args
    ): Promise<Return> {
      const trace = tracers.get(this);
      if (!trace || span?.enabled === false) {
        return target.call(this, span, ...args);
      }

      let outcome:
        | { ok: true; value: Return }
        | { ok: false; error: unknown }
        | undefined;

      try {
        await trace(
          {
            name: getName(args),
            parentContext: span?.parent,
            data: getData(args),
            tags: options.tags,
          },
          async (context) => {
            const startedMs = performance.now();
            try {
              const value = await target.call(
                this,
                { parent: context, enabled: span?.enabled },
                ...args,
              );
              outcome = { ok: true, value };

              try {
                const elapsedMs = performance.now() - startedMs;
                for (const record of getSummaryRecords(
                  value,
                  elapsedMs,
                  args,
                )) {
                  emitTrace(trace, { parent: context }, record);
                }
              } catch {
                // Summary telemetry must not break the work.
              }

              return value;
            } catch (error) {
              outcome = { ok: false, error };
              throw error;
            }
          },
        );
      } catch {
        // Telemetry failure must not break the work — unless the work failed.
      }

      if (outcome === undefined) {
        // The tracer failed before invoking the work; run it without a span.
        return target.call(this, { enabled: span?.enabled }, ...args);
      }
      if (outcome.ok) {
        return outcome.value;
      }
      throw outcome.error;
    };
  };
}
