import { projectLogger, createModuleLogger } from '../logger.js';
import { forDataTypes } from '../types.js';
import type {
  AssetsDataSource,
  Caip19AssetId,
  ChainId,
  Context,
  DataRequest,
  DataResponse,
  Middleware,
} from '../types.js';
import { normalizeAssetId } from '../utils/index.js';
import { mergeDataResponses } from './ParallelMiddleware.js';

const CONTROLLER_NAME = 'RpcFallbackMiddleware';

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

export type RpcFallbackMiddlewareOptions = {
  /** The RPC data source to use as a fallback. */
  rpcDataSource: AssetsDataSource;
};

const noopNext = async (ctx: Context): Promise<Context> => ctx;

/**
 * RpcFallbackMiddleware recovers what upstream sources left outstanding on
 * RPC, along two axes:
 *
 * - **Chain axis:** chains in `response.errors` are re-fetched in full and
 *   cleared from `response.errors` on recovery.
 * - **Asset axis:** pins in `response.unprocessedCustomAssets` are re-fetched
 *   with an RPC request scoped to just those assets; recovered entries are
 *   pruned. Assets on chains already retried above are skipped.
 *
 * Place immediately after `createParallelBalanceMiddleware` in the fast and
 * subscription enrichment pipelines.
 */
export class RpcFallbackMiddleware {
  readonly name = CONTROLLER_NAME;

  readonly #rpcDataSource: AssetsDataSource;

  constructor(options: RpcFallbackMiddlewareOptions) {
    this.#rpcDataSource = options.rpcDataSource;
  }

  getName(): string {
    return this.name;
  }

  get assetsMiddleware(): Middleware {
    return forDataTypes(['balance'], async (ctx, next) => {
      const erroredChains = new Set<ChainId>(
        Object.keys(ctx.response.errors ?? {}) as ChainId[],
      );
      const unprocessedCustomAssets = [
        ...new Set(ctx.response.unprocessedCustomAssets ?? []),
      ];

      if (erroredChains.size === 0 && unprocessedCustomAssets.length === 0) {
        return next(ctx);
      }

      let merged: DataResponse = ctx.response;

      // Chain axis: retry whole errored chains on RPC.
      if (erroredChains.size > 0) {
        merged = await this.#recoverErroredChains(ctx, merged, erroredChains);
      }

      // Asset axis: recover unresolved pins; chains retried above already
      // cover theirs.
      const assetsToRecover = unprocessedCustomAssets.filter(
        (assetId) => !erroredChains.has(chainIdOfAsset(assetId)),
      );
      if (assetsToRecover.length > 0) {
        merged = await this.#recoverUnprocessedAssets(
          ctx,
          merged,
          assetsToRecover,
        );
      }

      // Prune asset-axis entries that now have a balance.
      merged = clearRecoveredAssetIds(merged);

      return next({ ...ctx, response: merged });
    });
  }

  async #recoverErroredChains(
    ctx: Context,
    currentResponse: DataResponse,
    erroredChains: Set<ChainId>,
  ): Promise<DataResponse> {
    log('Retrying failed chains on RPC', { chains: [...erroredChains] });

    const chainRequest: DataRequest = {
      ...ctx.request,
      chainIds: ctx.request.chainIds.filter((id) => erroredChains.has(id)),
    };
    const rpcResult = await this.#rpcDataSource.assetsMiddleware(
      { ...ctx, request: chainRequest, response: {} },
      noopNext,
    );

    const merged = mergeDataResponses([currentResponse, rpcResult.response]);

    // Clear errors only for chains RPC itself recovered. Inspect
    // rpcResult.response — NOT merged — or partial upstream data for an
    // errored chain would mark it recovered even when RPC failed.
    const rpcAssetsBalance = rpcResult.response.assetsBalance;
    if (merged.errors && rpcAssetsBalance) {
      const chainsRecoveredByRpc = new Set<string>();
      for (const accountBalances of Object.values(rpcAssetsBalance)) {
        for (const assetId of Object.keys(accountBalances)) {
          chainsRecoveredByRpc.add(assetId.split('/')[0]);
        }
      }
      for (const chainId of erroredChains) {
        if (chainsRecoveredByRpc.has(chainId)) {
          delete merged.errors[chainId];
        }
      }
    }

    return merged;
  }

  async #recoverUnprocessedAssets(
    ctx: Context,
    currentResponse: DataResponse,
    assetsToRecover: Caip19AssetId[],
  ): Promise<DataResponse> {
    const assetChains = [
      ...new Set(assetsToRecover.map((assetId) => chainIdOfAsset(assetId))),
    ];

    log('Recovering unprocessed pinned assets on RPC', {
      assetIds: assetsToRecover,
    });

    // Override `customAssets` so RPC fetches just the unresolved pins
    // (native + pins in one multicall) instead of every pin on the chain.
    const assetRequest: DataRequest = {
      ...ctx.request,
      chainIds: assetChains,
      customAssets: assetsToRecover,
    };
    const rpcResult = await this.#rpcDataSource.assetsMiddleware(
      { ...ctx, request: assetRequest, response: {} },
      noopNext,
    );

    return mergeDataResponses([currentResponse, rpcResult.response]);
  }
}

/**
 * Extract the CAIP-2 chain ID from a CAIP-19 asset ID.
 *
 * @param assetId - The CAIP-19 asset ID.
 * @returns The CAIP-2 chain ID portion.
 */
function chainIdOfAsset(assetId: Caip19AssetId): ChainId {
  return assetId.split('/')[0] as ChainId;
}

/**
 * Remove entries from `unprocessedCustomAssets` that now have a balance in
 * the response.
 *
 * @param response - The merged data response.
 * @returns The response with recovered assets pruned.
 */
function clearRecoveredAssetIds(response: DataResponse): DataResponse {
  if (
    !response.unprocessedCustomAssets ||
    response.unprocessedCustomAssets.length === 0
  ) {
    return response;
  }

  const recovered = new Set<Caip19AssetId>();
  for (const accountBalances of Object.values(response.assetsBalance ?? {})) {
    for (const assetId of Object.keys(accountBalances)) {
      recovered.add(normalizeAssetId(assetId as Caip19AssetId));
    }
  }

  const stillUnprocessed = response.unprocessedCustomAssets.filter(
    (assetId) => !recovered.has(normalizeAssetId(assetId)),
  );

  if (stillUnprocessed.length === response.unprocessedCustomAssets.length) {
    return response;
  }

  const next = { ...response };
  if (stillUnprocessed.length === 0) {
    delete next.unprocessedCustomAssets;
  } else {
    next.unprocessedCustomAssets = stillUnprocessed;
  }
  return next;
}
