import { createModuleLogger, projectLogger } from '../logger';
import type {
  AccountId,
  AssetBalance,
  Caip19AssetId,
  ChainId,
  Context,
  DataResponse,
  Middleware,
  NextFunction,
} from '../types';

// ============================================================================
// LOGGING
// ============================================================================

const LOGGER_NAME = 'ParallelBalanceMiddleware';
const log = createModuleLogger(projectLogger, LOGGER_NAME);

// ============================================================================
// CHAIN / RESPONSE HELPERS
// ============================================================================

/** CAIP-19 asset IDs are "chainId/namespace:reference"; return the chainId prefix. */
function getChainIdFromAssetId(assetId: Caip19AssetId): ChainId {
  const idx = assetId.indexOf('/');
  return (idx === -1 ? assetId : assetId.slice(0, idx)) as ChainId;
}

/** Collect chain IDs that have at least one balance in the response. */
function getChainsWithBalance(response: DataResponse): Set<ChainId> {
  const chains = new Set<ChainId>();
  if (!response.assetsBalance) return chains;
  for (const accountBalances of Object.values(response.assetsBalance)) {
    for (const assetId of Object.keys(accountBalances)) {
      chains.add(getChainIdFromAssetId(assetId as Caip19AssetId));
    }
  }
  return chains;
}

/**
 * Chains that have no balance in the merged response (remaining after primary run).
 * Fallback runs only for these; it does not depend on Promise success or response.errors.
 */
function getRemainingChains(
  requestChainIds: ChainId[],
  mergedResponse: DataResponse,
): ChainId[] {
  const chainsWithBalance = getChainsWithBalance(mergedResponse);
  return requestChainIds.filter((chainId) => !chainsWithBalance.has(chainId));
}

/**
 * Distribute chain IDs across sources by support (same strategy as subscription).
 * Each chain is assigned to the first source that supports it; no overlap.
 *
 * @param requestChainIds - Chains requested.
 * @param sources - Sources with getActiveChains (order = priority).
 * @returns Map of source index -> assigned chain IDs.
 */
function distributeChainsToSources(
  requestChainIds: ChainId[],
  sources: { getActiveChains: () => ChainId[] }[],
): Map<number, ChainId[]> {
  const remaining = new Set(requestChainIds);
  const assignment = new Map<number, ChainId[]>();

  for (let i = 0; i < sources.length; i++) {
    const available = new Set(sources[i].getActiveChains());
    const assigned: ChainId[] = [];
    for (const chainId of remaining) {
      if (available.has(chainId)) {
        assigned.push(chainId);
        remaining.delete(chainId);
      }
    }
    if (assigned.length > 0) {
      assignment.set(i, assigned);
    }
  }

  return assignment;
}

// ============================================================================
// MERGE HELPERS
// ============================================================================

/**
 * Merge multiple DataResponses into one.
 * Later responses overwrite earlier for the same keys (same semantics as sequential chain).
 *
 * @param responses - Array of responses to merge (e.g. from parallel balance middlewares).
 * @returns Single merged DataResponse.
 */
function mergeDataResponses(responses: DataResponse[]): DataResponse {
  const merged: DataResponse = {};

  for (const response of responses) {
    if (response.assetsBalance) {
      merged.assetsBalance ??= {};
      for (const [accountId, accountBalances] of Object.entries(
        response.assetsBalance,
      )) {
        merged.assetsBalance[accountId as AccountId] = {
          ...merged.assetsBalance[accountId as AccountId],
          ...(accountBalances as Record<Caip19AssetId, AssetBalance>),
        };
      }
    }
    if (response.assetsMetadata) {
      merged.assetsMetadata = {
        ...merged.assetsMetadata,
        ...response.assetsMetadata,
      };
    }
    if (response.assetsPrice) {
      merged.assetsPrice = {
        ...merged.assetsPrice,
        ...response.assetsPrice,
      };
    }
    if (response.errors) {
      merged.errors = {
        ...merged.errors,
        ...response.errors,
      };
    }
    if (response.detectedAssets) {
      merged.detectedAssets ??= {};
      for (const [accountId, assetIds] of Object.entries(
        response.detectedAssets,
      )) {
        const existing = merged.detectedAssets[accountId as AccountId] ?? [];
        const combined = [...new Set([...existing, ...assetIds])];
        merged.detectedAssets[accountId as AccountId] = combined;
      }
    }
  }

  return merged;
}

// ============================================================================
// PARALLEL BALANCE MIDDLEWARE
// ============================================================================

/**
 * A balance source that can be assigned a subset of chains (same idea as subscription).
 */
export type BalanceMiddlewareSource = {
  middleware: Middleware;
  getActiveChains: () => ChainId[];
};

export type ParallelBalanceMiddlewareOptions = {
  /**
   * Middlewares to run only for remaining chains (chains with no balance after
   * the primary run), e.g. RPC when Accounts API did not return balance for those chains.
   */
  fallbackMiddlewares?: Middleware[];
};

/**
 * Creates a single middleware that distributes chains across balance sources (like
 * subscription), runs each source in parallel with only its assigned chains, and
 * merges responses. No overlap: each chain is assigned to at most one source.
 *
 * If `options.fallbackMiddlewares` is set, they run only for remaining chains
 * (chains with no balance after the primary run).
 *
 * @param sources - Balance sources (middleware + getActiveChains), in priority order.
 * @param options - Optional; fallbackMiddlewares run for remaining chains only.
 * @returns A middleware that distributes chains, runs primary in parallel, then fallback, and merges.
 */
export function createParallelBalanceMiddleware(
  sources: BalanceMiddlewareSource[],
  options: ParallelBalanceMiddlewareOptions = {},
): Middleware {
  const { fallbackMiddlewares = [] } = options;

  return async (context: Context, next: NextFunction): Promise<Context> => {
    if (sources.length === 0 && fallbackMiddlewares.length === 0) {
      return next(context);
    }

    const noopNext: NextFunction = async (ctx) => ctx;

    const runOne = async (
      middleware: Middleware,
      ctx: Context,
    ): Promise<Context | null> => {
      try {
        return await middleware(ctx, noopNext);
      } catch (error) {
        log('Balance middleware failed', { error });
        return null;
      }
    };

    // Primary: distribute chains to sources (no overlap), then run in parallel
    let mergedResponse: DataResponse = context.response;
    if (sources.length > 0 && context.request.chainIds.length > 0) {
      const assignment = distributeChainsToSources(
        context.request.chainIds,
        sources,
      );
      const results = await Promise.allSettled(
        Array.from(assignment.entries()).map(([index, chainIds]) =>
          runOne(sources[index].middleware, {
            ...context,
            request: { ...context.request, chainIds },
            response: {},
          }),
        ),
      );
      const contextsToMerge: Context[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value !== null) {
          contextsToMerge.push(result.value);
        }
      }
      mergedResponse =
        contextsToMerge.length > 0
          ? mergeDataResponses(contextsToMerge.map((ctx) => ctx.response))
          : context.response;
    }

    // Fallback: for remaining chains (no balance from primary), run fallback middlewares
    if (fallbackMiddlewares.length > 0 && context.request.chainIds.length > 0) {
      const remainingChains = getRemainingChains(
        context.request.chainIds,
        mergedResponse,
      );
      if (remainingChains.length > 0) {
        log('Fallback for remaining chains', {
          chainIds: remainingChains,
        });
        const fallbackContext: Context = {
          ...context,
          request: {
            ...context.request,
            chainIds: remainingChains,
          },
          response: {},
        };
        const fallbackResults = await Promise.allSettled(
          fallbackMiddlewares.map((m) =>
            runOne(m, { ...fallbackContext, response: {} }),
          ),
        );
        const fallbackContexts: Context[] = [];
        for (const result of fallbackResults) {
          if (result.status === 'fulfilled' && result.value !== null) {
            fallbackContexts.push(result.value);
          }
        }
        if (fallbackContexts.length > 0) {
          const fallbackMerged = mergeDataResponses(
            fallbackContexts.map((ctx) => ctx.response),
          );
          mergedResponse = mergeDataResponses([
            mergedResponse,
            fallbackMerged,
          ]);
          // Drop errors for chains that now have balance from fallback
          if (mergedResponse.errors && Object.keys(mergedResponse.errors).length > 0) {
            const chainsWithBalanceAfterFallback =
              getChainsWithBalance(mergedResponse);
            const stillFailing: Record<ChainId, string> = {};
            for (const [chainId, message] of Object.entries(
              mergedResponse.errors,
            )) {
              if (!chainsWithBalanceAfterFallback.has(chainId as ChainId)) {
                stillFailing[chainId as ChainId] = message;
              }
            }
            mergedResponse.errors =
              Object.keys(stillFailing).length > 0 ? stillFailing : undefined;
          }
        }
      }
    }

    return next({
      ...context,
      response: mergedResponse,
    });
  };
}
