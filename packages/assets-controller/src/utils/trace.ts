import type { TraceCallback, TraceContext } from '@metamask/controller-utils';

const DEFAULT_TAGS: Record<string, number | string | boolean> = {
  controller: 'AssetsController',
};

export type TraceSpanData = Record<string, number | string | boolean>;

export type EmitTraceParams = {
  name: string;
  /** When omitted / undefined, this is a no-op (bake call-site gating here). */
  trace?: TraceCallback;
  data: TraceSpanData;
  tags?: TraceSpanData;
  parentContext?: TraceContext;
  /** Override span start; otherwise derived from `data.duration_ms` when present. */
  startTime?: number;
};

export type WithTraceParams<Result> = {
  name: string;
  /** When omitted / undefined, `fn` runs with no parent context. */
  trace?: TraceCallback;
  data: TraceSpanData;
  fn: (parentContext?: TraceContext) => Promise<Result>;
  tags?: TraceSpanData;
  startTime?: number;
};

/**
 * Build request tags / startTime for MetaMask's Sentry adapter.
 * Numeric `data` fields become tags (measurements); `duration_ms` backdates start.
 *
 * @param data - Span data attributes.
 * @param tags - Caller tags.
 * @param startTime - Optional explicit start override.
 * @returns tags and optional startTime for the TraceRequest.
 */
function buildTraceTiming(
  data: TraceSpanData,
  tags: TraceSpanData,
  startTime?: number,
): { tags: TraceSpanData; startTime?: number } {
  const numericFromData: Record<string, number> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'number') {
      numericFromData[key] = value;
    }
  }
  const requestTags = {
    ...tags,
    ...numericFromData,
  };

  if (startTime !== undefined) {
    return { tags: requestTags, startTime };
  }

  const durationMs =
    typeof data.duration_ms === 'number' ? data.duration_ms : undefined;
  if (durationMs === undefined) {
    return { tags: requestTags };
  }

  return {
    tags: requestTags,
    startTime: performance.timeOrigin + performance.now() - durationMs,
  };
}

/**
 * Fire-and-forget Sentry span. Swallows errors so telemetry never breaks callers.
 * Pass `parentContext` to nest as a subspan. Omit `trace` to skip emission.
 *
 * @param params - Span configuration.
 * @param params.name - Trace / span name visible in Sentry.
 * @param params.trace - Optional client trace callback; omit to no-op.
 * @param params.data - Key-value pairs attached as span data.
 * @param params.tags - Key-value pairs used for Sentry filtering.
 * @param params.parentContext - Optional parent span context for nesting.
 * @param params.startTime - Optional explicit start; else derived from `duration_ms`.
 */
export function emitTrace({
  name,
  trace,
  data,
  tags = DEFAULT_TAGS,
  parentContext,
  startTime: startTimeOverride,
}: EmitTraceParams): void {
  if (!trace) {
    return;
  }

  const { tags: requestTags, startTime } = buildTraceTiming(
    data,
    tags,
    startTimeOverride,
  );

  trace(
    {
      name,
      data,
      tags: requestTags,
      parentContext,
      ...(startTime === undefined ? {} : { startTime }),
    },
    () => undefined,
  )?.catch(() => {
    // Telemetry failure must not break.
  });
}

/**
 * Run work inside a parent Sentry span and pass its context for nested
 * {@link emitTrace} subspans.
 *
 * When `trace` is omitted, runs `fn(undefined)` with no span.
 * Telemetry failures are swallowed; errors from `fn` still propagate.
 *
 * @param params - Parent span config and work callback.
 * @param params.name - Parent span name.
 * @param params.trace - Optional client trace callback; omit to skip wrapping.
 * @param params.data - Key-value pairs attached as span data.
 * @param params.fn - Work to run; receives the parent span context.
 * @param params.tags - Key-value pairs used for Sentry filtering.
 * @param params.startTime - Optional explicit start; else derived from `duration_ms`.
 * @returns The result of `fn`.
 */
export async function withTrace<Result>({
  name,
  trace,
  data,
  fn,
  tags = DEFAULT_TAGS,
  startTime: startTimeOverride,
}: WithTraceParams<Result>): Promise<Result> {
  if (!trace) {
    return fn(undefined);
  }

  const { tags: requestTags, startTime } = buildTraceTiming(
    data,
    tags,
    startTimeOverride,
  );

  let workResult:
    | { ok: true; value: Result }
    | { ok: false; error: unknown }
    | undefined;

  try {
    await trace(
      {
        name,
        data,
        tags: requestTags,
        ...(startTime === undefined ? {} : { startTime }),
      },
      async (parentContext) => {
        try {
          const value = await fn(parentContext);
          workResult = { ok: true, value };
          return value;
        } catch (error) {
          workResult = { ok: false, error };
          throw error;
        }
      },
    );
  } catch {
    // Telemetry failure must not break — unless the work itself failed.
  }

  if (workResult === undefined) {
    // `trace` failed before invoking `fn` (or never called it).
    return fn(undefined);
  }
  if (workResult.ok) {
    return workResult.value;
  }
  throw workResult.error;
}
