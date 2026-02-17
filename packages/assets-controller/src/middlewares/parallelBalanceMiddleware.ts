import type { ChainId, DataRequest, DataResponse, Middleware } from '../types';

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

  for (const r of responses) {
    if (r.assetsBalance) {
      merged.assetsBalance ??= {};
      for (const [accountId, accountBalances] of Object.entries(
        r.assetsBalance,
      )) {
        merged.assetsBalance[accountId] = {
          ...(merged.assetsBalance[accountId] ?? {}),
          ...accountBalances,
        };
      }
    }
    if (r.assetsInfo) {
      merged.assetsInfo = {
        ...(merged.assetsInfo ?? {}),
        ...r.assetsInfo,
      };
    }
    if (r.assetsPrice) {
      merged.assetsPrice = {
        ...(merged.assetsPrice ?? {}),
        ...r.assetsPrice,
      };
    }
    if (r.errors) {
      merged.errors = {
        ...(merged.errors ?? {}),
        ...r.errors,
      };
    }
    if (r.detectedAssets) {
      merged.detectedAssets = {
        ...(merged.detectedAssets ?? {}),
        ...r.detectedAssets,
      };
    }
    if (r.updateMode === 'full') {
      merged.updateMode = 'full';
    }
  }
  if (merged.updateMode === undefined) {
    merged.updateMode = 'merge';
  }

  return merged;
}

// ============================================================================
// PARALLEL BALANCE MIDDLEWARE
// ============================================================================

const PARALLEL_BALANCE_MIDDLEWARE_NAME = 'ParallelBalanceMiddleware';

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
  const chainIds = request.chainIds;
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
export function createParallelBalanceMiddleware(
  sources: BalanceSource[],
): { getName(): string; assetsMiddleware: Middleware } {
  return {
    getName(): string {
      return PARALLEL_BALANCE_MIDDLEWARE_NAME;
    },

    assetsMiddleware: async (context, next) => {
      if (sources.length === 0) {
        return next(context);
      }

      const noopNext = async (ctx: typeof context): Promise<typeof context> =>
        ctx;

      // Round 1: partition chains (no overlap), run all in parallel
      const requests = partitionChainsBySource(context.request, sources);
      const results = await Promise.all(
        sources.map((source, i) =>
          source.assetsMiddleware(
            {
              request: requests[i],
              response: {},
              getAssetsState: context.getAssetsState,
            },
            noopNext,
          ),
        ),
      );

      let mergedResponse = mergeDataResponses(
        results.map((r) => r.response),
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
            source.assetsMiddleware(
              {
                request: fallbackRequests[i],
                response: {},
                getAssetsState: context.getAssetsState,
              },
              noopNext,
            ),
          ),
        );
        const fallbackMerged = mergeDataResponses(
          fallbackResults.map((r) => r.response),
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
