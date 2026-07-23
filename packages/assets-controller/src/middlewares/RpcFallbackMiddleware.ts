import { projectLogger, createModuleLogger } from '../logger';
import { forDataTypes } from '../types';
import type {
  AssetsDataSource,
  Caip19AssetId,
  ChainId,
  Context,
  DataRequest,
  DataResponse,
  Middleware,
} from '../types';
import { normalizeAssetId } from '../utils';
import { mergeDataResponses } from './ParallelMiddleware';

const CONTROLLER_NAME = 'RpcFallbackMiddleware';

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

export type RpcFallbackMiddlewareOptions = {
  /** The RPC data source to use as a fallback. */
  rpcDataSource: AssetsDataSource;
};

const noopNext = async (ctx: Context): Promise<Context> => ctx;

/**
 * RpcFallbackMiddleware recovers what upstream sources left outstanding on the
 * RPC data source, along two axes:
 *
 * - **Chain axis:** any chain present in `response.errors` (network error,
 *   unprocessedNetworks, timeout, …) is re-fetched in full (native + custom
 *   assets). Recovered chains are cleared from `response.errors`.
 * - **Asset axis:** any pinned asset in `response.unprocessedCustomAssets` (e.g.
 *   AccountsApi `unprocessedIncludeAssetIds` the backend could not resolve) is
 *   re-fetched with an RPC request scoped to just those assets (passed as
 *   `customAssets`), rather than re-fetching every pin on the chain. Recovered
 *   assets are removed from `response.unprocessedCustomAssets`. Assets whose chain
 *   was already retried on the chain axis are skipped (that fetch already
 *   covers them).
 *
 * Place this immediately after `createParallelBalanceMiddleware` in the fast
 * pipeline, and in the subscription enrichment pipeline so poll updates recover
 * too.
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

      // Asset axis: recover specific pinned assets the backend could not
      // resolve. Skip assets whose chain was already retried above — that
      // full-chain fetch already includes custom assets.
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

      // Drop asset-axis entries we now have a balance for so downstream sources
      // do not try them again.
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

    // Clear errors only for chains RPC actually recovered a balance for.
    // We must inspect rpcResult.response — NOT merged — because merged also
    // contains balances from the upstream sources (AccountsApi / Websocket /
    // Staked). If those returned partial data for a chain they also flagged as
    // errored, and RPC then failed for that same chain, looking at merged would
    // incorrectly mark the error as recovered.
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

    // Scope the RPC fetch to just the unresolved pins by overriding
    // `customAssets`. RpcDataSource fetches native + these on each chain in a
    // single multicall, so this recovers the pins without re-fetching every
    // other pin on the chain.
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
 * Remove entries from `unprocessedCustomAssets` that now have a balance in the
 * response (recovered by RPC or already covered by a retried chain).
 *
 * @param response - The merged data response.
 * @returns The response with recovered assets pruned from `unprocessedCustomAssets`.
 */
function clearRecoveredAssetIds(response: DataResponse): DataResponse {
  if (!response.unprocessedCustomAssets || response.unprocessedCustomAssets.length === 0) {
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
