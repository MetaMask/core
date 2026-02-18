import pLimit from 'p-limit';

import type {
  ChainId,
  Context,
  DataRequest,
  DataResponse,
  Middleware,
} from '../types';

// ============================================================================
// MERGE HELPER
// ============================================================================

/**
 * Deep-merge multiple DataResponses into one.
 * Used when running balance data sources in parallel.
 *
 * @param responses - Array of DataResponse from each source.
 * @returns Single merged DataResponse.
 */
export function mergeDataResponses(responses: DataResponse[]): DataResponse {
  const merged: DataResponse = {};

  for (const response of responses) {
    if (response.assetsBalance) {
      merged.assetsBalance ??= {};
      for (const [accountId, accountBalances] of Object.entries(
        response.assetsBalance,
      )) {
        merged.assetsBalance[accountId] = {
          ...(merged.assetsBalance[accountId] ?? {}),
          ...accountBalances,
        };
      }
    }
    if (response.assetsInfo) {
      merged.assetsInfo = {
        ...(merged.assetsInfo ?? {}),
        ...response.assetsInfo,
      };
    }
    if (response.assetsPrice) {
      merged.assetsPrice = {
        ...(merged.assetsPrice ?? {}),
        ...response.assetsPrice,
      };
    }
    if (response.errors) {
      merged.errors = {
        ...(merged.errors ?? {}),
        ...response.errors,
      };
    }
    if (response.detectedAssets) {
      merged.detectedAssets = {
        ...(merged.detectedAssets ?? {}),
        ...response.detectedAssets,
      };
    }
    if (response.updateMode === 'full') {
      merged.updateMode = 'full';
    }
  }
  merged.updateMode ??= 'merge';

  return merged;
}

// ============================================================================
// PARALLEL BALANCE MIDDLEWARE
// ============================================================================

const PARALLEL_BALANCE_MIDDLEWARE_NAME = 'ParallelBalanceMiddleware';

/** Max concurrent balance source calls (round 1 and fallback). */
const BALANCE_CONCURRENCY = 3;

export type BalanceSource = {
  getName(): string;
  /** Chains this source can fetch (e.g. from getActiveChainsSync()). Used to partition chains with no overlap. */
  getActiveChainsSync(): ChainId[];
  assetsMiddleware: Middleware;
};

/**
 * Partition request.chainIds so each chain is assigned to exactly one source
 * (by source order: first source that supports the chain gets it). Ensures no
 * chain overlap across data source calls.
 *
 * @param request - The data request with chainIds to partition.
 * @param sources - Balance sources in priority order (e.g. AccountsAPI, Snap, Rpc).
 * @returns Array of requests, one per source, each with only that source's assigned chainIds.
 */
function partitionChainsBySource(
  request: DataRequest,
  sources: BalanceSource[],
): DataRequest[] {
  const { chainIds } = request;
  const assigned = new Set<ChainId>();

  return sources.map((source) => {
    const supported = new Set(source.getActiveChainsSync());
    const chainsForSource = chainIds.filter(
      (id) => supported.has(id) && !assigned.has(id),
    );
    chainsForSource.forEach((id) => assigned.add(id));

    return {
      ...request,
      chainIds: chainsForSource,
    };
  });
}

/**
 * Collect chain IDs that failed in the first round (present in response.errors).
 * Used to run a fallback round with remaining sources.
 *
 * @param requests - Partitioned requests, one per source (same order as results).
 * @param results - Results from each source; chain IDs in requests[i] that have errors in results[i].response.errors are considered failed.
 * @returns Set of chain IDs that had errors in the first round.
 */
function getFailedChainIds(
  requests: DataRequest[],
  results: { response: DataResponse }[],
): Set<ChainId> {
  const failed = new Set<ChainId>();
  for (let i = 0; i < results.length; i++) {
    const errors = results[i].response.errors ?? {};
    for (const chainId of requests[i].chainIds) {
      if (errors[chainId]) {
        failed.add(chainId);
      }
    }
  }
  return failed;
}

/**
 * Middleware that runs multiple balance data source middlewares in parallel,
 * with no chain overlap. Chains that fail (response.errors) are re-partitioned
 * and fetched again in a fallback round so lower-priority sources can try them.
 *
 * @param sources - Array of balance sources in priority order (each with getName(), getActiveChainsSync(), assetsMiddleware).
 * @returns A single middleware that runs all sources in parallel and merges responses.
 */
export function createParallelBalanceMiddleware(sources: BalanceSource[]): {
  getName(): string;
  assetsMiddleware: Middleware;
} {
  return {
    getName(): string {
      return PARALLEL_BALANCE_MIDDLEWARE_NAME;
    },

    assetsMiddleware: async (context, next): Promise<Context> => {
      if (sources.length === 0) {
        return next(context);
      }

      const noopNext = async (ctx: typeof context): Promise<typeof context> =>
        ctx;
      const limit = pLimit(BALANCE_CONCURRENCY);

      // Round 1: partition chains (no overlap), run with limited concurrency
      const requests = partitionChainsBySource(context.request, sources);
      const results = await Promise.all(
        sources.map((source, i) =>
          limit(() =>
            source.assetsMiddleware(
              {
                request: requests[i],
                response: {},
                getAssetsState: context.getAssetsState,
              },
              noopNext,
            ),
          ),
        ),
      );

      let mergedResponse = mergeDataResponses(
        results.map((result) => result.response),
      );

      // Fallback: chains that failed (in errors) get re-partitioned and tried again
      const failedChainIds = getFailedChainIds(requests, results);
      if (failedChainIds.size > 0) {
        const fallbackRequest: DataRequest = {
          ...context.request,
          chainIds: [...failedChainIds],
        };
        const fallbackRequests = partitionChainsBySource(
          fallbackRequest,
          sources,
        );
        const fallbackResults = await Promise.all(
          sources.map((source, i) =>
            limit(() =>
              source.assetsMiddleware(
                {
                  request: fallbackRequests[i],
                  response: {},
                  getAssetsState: context.getAssetsState,
                },
                noopNext,
              ),
            ),
          ),
        );
        const fallbackMerged = mergeDataResponses(
          fallbackResults.map((result) => result.response),
        );
        mergedResponse = mergeDataResponses([mergedResponse, fallbackMerged]);
        // Remove errors for chains we successfully got balance for in fallback
        if (mergedResponse.errors && mergedResponse.assetsBalance) {
          const chainsWithBalance = new Set<ChainId>();
          for (const accountBalances of Object.values(
            mergedResponse.assetsBalance,
          )) {
            for (const assetId of Object.keys(accountBalances)) {
              const chainId = assetId.split('/')[0] as ChainId;
              chainsWithBalance.add(chainId);
            }
          }
          for (const chainId of failedChainIds) {
            if (chainsWithBalance.has(chainId)) {
              delete mergedResponse.errors[chainId];
            }
          }
        }
      }

      return next({
        ...context,
        response: mergeDataResponses([context.response, mergedResponse]),
      });
    },
  };
}

// ============================================================================
// PARALLEL TOKEN/PRICE MIDDLEWARE
// ============================================================================

const PARALLEL_MIDDLEWARE_NAME = 'ParallelMiddleware';

/** Max concurrent token/price source calls. */
const CONCURRENCY = 2;

export type TokenPriceSource = {
  getName(): string;
  assetsMiddleware: Middleware;
};

/**
 * Middleware that runs multiple data source middlewares (e.g. TokenDataSource,
 * PriceDataSource) in parallel with the same request. Responses are merged so
 * that assetsInfo (token metadata) and assetsPrice are combined. Use this to
 * fetch token and price data concurrently instead of sequentially.
 *
 * @param sources - Array of sources with getName() and assetsMiddleware.
 * @returns A single middleware that runs all sources in parallel and merges responses.
 */
export function createParallelMiddleware(sources: TokenPriceSource[]): {
  getName(): string;
  assetsMiddleware: Middleware;
} {
  return {
    getName(): string {
      return PARALLEL_MIDDLEWARE_NAME;
    },

    assetsMiddleware: async (context, next): Promise<Context> => {
      if (sources.length === 0) {
        return next(context);
      }

      const noopNext = async (ctx: typeof context): Promise<typeof context> =>
        ctx;
      const limit = pLimit(CONCURRENCY);

      const results = await Promise.all(
        sources.map((source) =>
          limit(() =>
            source.assetsMiddleware(
              {
                request: context.request,
                response: { ...context.response },
                getAssetsState: context.getAssetsState,
              },
              noopNext,
            ),
          ),
        ),
      );

      const mergedResponse = mergeDataResponses(
        results.map((result) => result.response),
      );

      return next({
        ...context,
        response: mergeDataResponses([context.response, mergedResponse]),
      });
    },
  };
}
