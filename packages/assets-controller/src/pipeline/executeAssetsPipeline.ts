import type { TraceCallback, TraceContext } from '@metamask/controller-utils';

import { AssetsDataSourceError } from '../errors.js';
import type {
  AssetsControllerStateInternal,
  AssetsDataSource,
  DataRequest,
  DataResponse,
  FetchContext,
  FetchNextFunction,
  Middleware,
  NextFunction,
} from '../types.js';
import { emitTrace } from '../utils/trace.js';

const TRACE_DATA_SOURCE_TIMING = 'AssetsDataSourceTiming';
const TRACE_DATA_SOURCE_ERROR = 'AssetsDataSourceError';

export type ExecuteAssetsPipelineParams = {
  /** Data sources or middlewares with getName() and assetsMiddleware. */
  sources: AssetsDataSource[];
  /** The data request. */
  request: DataRequest;
  /** Optional initial response (for enriching existing data). */
  initialResponse?: DataResponse;
  /** Reads the current controller state, exposed to every middleware via context. */
  getAssetsState: () => AssetsControllerStateInternal;
  /** Reports middleware failures as an issue. Never allowed to throw. */
  captureException?: (error: Error) => void;
  /** Optional parent Sentry span; per-source timings nest under it. */
  parentContext?: TraceContext;
  /** Omit after unlock/first-init so timing spans are not emitted. */
  trace?: TraceCallback;
};

/**
 * Execute middlewares with request/response context.
 * Returns response and exclusive duration per source (sum ≈ wall time).
 *
 * Extracted from `AssetsController` so a pipeline can be composed and driven
 * without booting the controller (see `buildFastFetchSources`).
 *
 * @param params - Middleware execution options.
 * @returns Response and durationByDataSource (exclusive ms per source name).
 */
export async function executeAssetsPipeline(
  params: ExecuteAssetsPipelineParams,
): Promise<{
  response: DataResponse;
  durationByDataSource: Record<string, number>;
}> {
  const {
    sources,
    request,
    initialResponse = {},
    getAssetsState,
    captureException,
    parentContext,
    trace,
  } = params;
  const names = sources.map((source) => source.getName());
  const middlewares = sources.map((source) => source.assetsMiddleware);
  const inclusive: number[] = [];
  const wrapped = middlewares.map(
    (middleware, i) =>
      (async (
        ctx: FetchContext,
        next: FetchNextFunction,
      ): Promise<{
        request: DataRequest;
        response: DataResponse;
        getAssetsState: () => AssetsControllerStateInternal;
      }> => {
        const start = performance.now();
        try {
          return await middleware(ctx, next);
        } finally {
          inclusive[i] = performance.now() - start;
        }
      }) as Middleware,
  );

  const middlewareErrors: string[] = [];
  const chain = wrapped.reduceRight<NextFunction>(
    (next, middleware, index) =>
      async (
        ctx,
      ): Promise<{
        request: DataRequest;
        response: DataResponse;
        getAssetsState: () => AssetsControllerStateInternal;
      }> => {
        try {
          return await middleware(ctx, next);
        } catch (error) {
          const sourceName = names[index] ?? `middleware_${index}`;
          middlewareErrors.push(sourceName);
          console.error('[AssetsController] Middleware failed:', error);
          return next(ctx);
        }
      },
    async (ctx) => ctx,
  );

  const result = await chain({
    request,
    response: initialResponse,
    getAssetsState,
  });

  const durationByDataSource: Record<string, number> = {};
  for (let i = 0; i < inclusive.length; i++) {
    const nextInc = i + 1 < inclusive.length ? (inclusive[i + 1] ?? 0) : 0;
    const exclusive = Math.max(0, (inclusive[i] ?? 0) - nextInc);
    const name = names[i];
    if (name !== undefined) {
      durationByDataSource[name] = exclusive;
    }
  }
  if (result.durationByDataSource) {
    for (const [key, ms] of Object.entries(result.durationByDataSource)) {
      durationByDataSource[key] = ms;
    }
  }

  // Emit per-source timing as subspans under the parent fetch/update span
  // (no-op when `trace` is omitted — unlock/first-init only).
  for (const [sourceName, durationMs] of Object.entries(durationByDataSource)) {
    emitTrace({
      name: TRACE_DATA_SOURCE_TIMING,
      trace,
      data: {
        source: sourceName,
        duration_ms: durationMs,
        chain_count: request.chainIds.length,
        account_count: request.accountsWithSupportedChains.length,
      },
      tags: {
        controller: 'AssetsController',
        // String tag so Spans widgets can group by `source`.
        source: sourceName,
      },
      parentContext,
    });
  }

  // Failed middlewares: Issues (optional) + perf/Dashboard spans
  if (middlewareErrors.length > 0) {
    const failedSources = middlewareErrors.join(',');
    const assetsError = new AssetsDataSourceError({
      failedSources,
      errorCount: middlewareErrors.length,
      chainCount: request.chainIds.length,
    });
    try {
      captureException?.(assetsError);
    } catch {
      // Never let telemetry throw.
    }
    emitTrace({
      name: TRACE_DATA_SOURCE_ERROR,
      trace,
      data: {
        failed_sources: failedSources,
        error_count: middlewareErrors.length,
        chain_count: request.chainIds.length,
      },
      tags: {
        controller: 'AssetsController',
        severity: 'error',
        error_type: assetsError.name,
      },
      parentContext,
    });
  }

  return { response: result.response, durationByDataSource };
}
