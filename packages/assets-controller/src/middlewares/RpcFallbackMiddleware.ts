import { KnownCaipNamespace } from '@metamask/utils';

import { isStakingContractAssetId } from '../data-sources/evm-rpc-services/index.js';
import { projectLogger, createModuleLogger } from '../logger.js';
import { forDataTypes } from '../types.js';
import type {
  AssetBalance,
  AssetsDataSource,
  Caip19AssetId,
  ChainId,
  Context,
  DataRequest,
  DataResponse,
  Middleware,
  NextFunction,
} from '../types.js';
import { normalizeAssetId } from '../utils/index.js';
import { mergeDataResponses } from './ParallelMiddleware.js';

const CONTROLLER_NAME = 'RpcFallbackMiddleware';

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

export type RpcFallbackMiddlewareOptions = {
  /** The RPC data source to use as a fallback. */
  rpcDataSource: AssetsDataSource;
  /**
   * When true, recover `unprocessedCustomAssets` (Accounts API v6). When false,
   * re-read stale tracked assets the v5 API omitted (legacy path).
   */
  isBalanceV6Enabled?: () => boolean;
};

const noopNext = async (ctx: Context): Promise<Context> => ctx;

/**
 * RpcFallbackMiddleware recovers what upstream sources left outstanding on RPC.
 *
 * Accounts API v5: chains in `response.errors`, plus EVM assets tracked in
 * state that this response left empty (the API omits tokens it does not index).
 *
 * Accounts API v6: chains in `response.errors`, plus pins in
 * `response.unprocessedCustomAssets`.
 */
export class RpcFallbackMiddleware {
  readonly name = CONTROLLER_NAME;

  readonly #rpcDataSource: AssetsDataSource;

  readonly #isBalanceV6Enabled: () => boolean;

  constructor(options: RpcFallbackMiddlewareOptions) {
    this.#rpcDataSource = options.rpcDataSource;
    this.#isBalanceV6Enabled =
      options.isBalanceV6Enabled ?? ((): boolean => false);
  }

  getName(): string {
    return this.name;
  }

  get assetsMiddleware(): Middleware {
    return forDataTypes(['balance'], async (ctx, next) => {
      if (this.#isBalanceV6Enabled()) {
        return this.#recoverV6(ctx, next);
      }
      return this.#recoverV5(ctx, next);
    });
  }

  async #recoverV6(ctx: Context, next: NextFunction): Promise<Context> {
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

    if (erroredChains.size > 0) {
      merged = await this.#recoverErroredChains(ctx, merged, erroredChains);
    }

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

    merged = clearRecoveredAssetIds(merged);

    return next({ ...ctx, response: merged });
  }

  async #recoverV5(ctx: Context, next: NextFunction): Promise<Context> {
    const erroredChains = new Set<ChainId>(
      Object.keys(ctx.response.errors ?? {}) as ChainId[],
    );
    const staleAssets = collectStaleTrackedAssets(ctx);

    const chainsToFetch = [
      ...new Set([
        ...ctx.request.chainIds.filter((id) => erroredChains.has(id)),
        ...staleAssets.map((assetId) => assetId.split('/')[0] as ChainId),
      ]),
    ];

    if (chainsToFetch.length === 0) {
      return next(ctx);
    }

    log('Re-reading balances on RPC', {
      erroredChains: [...erroredChains],
      staleAssets,
      chains: chainsToFetch,
    });

    const filteredRequest = {
      ...ctx.request,
      chainIds: chainsToFetch,
      customAssets: [
        ...new Set([...(ctx.request.customAssets ?? []), ...staleAssets]),
      ],
    };

    const rpcResult = await this.#rpcDataSource.assetsMiddleware(
      {
        ...ctx,
        request: filteredRequest,
        response: {},
      },
      noopNext,
    );

    const rpcFailedChains = new Set<ChainId>(
      Object.keys(rpcResult.response.errors ?? {}) as ChainId[],
    );
    const rpcAssetsBalance = filterOutChainBalances(
      rpcResult.response.assetsBalance,
      rpcFailedChains,
    );

    const rpcErrors = Object.fromEntries(
      Object.entries(rpcResult.response.errors ?? {}).filter(([chainId]) =>
        erroredChains.has(chainId as ChainId),
      ),
    );

    const merged: DataResponse = mergeDataResponses([
      ctx.response,
      {
        ...rpcResult.response,
        assetsBalance: rpcAssetsBalance,
        errors: rpcErrors,
      },
    ]);

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

    return next({ ...ctx, response: merged });
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

    const rpcFailedChains = new Set<ChainId>(
      Object.keys(rpcResult.response.errors ?? {}) as ChainId[],
    );
    const rpcAssetsBalance = filterOutChainBalances(
      rpcResult.response.assetsBalance,
      rpcFailedChains,
    );

    const merged = mergeDataResponses([
      currentResponse,
      {
        ...rpcResult.response,
        assetsBalance: rpcAssetsBalance,
      },
    ]);

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

function chainIdOfAsset(assetId: Caip19AssetId): ChainId {
  return assetId.split('/')[0] as ChainId;
}

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

function filterOutChainBalances(
  assetsBalance: DataResponse['assetsBalance'],
  chainIds: Set<ChainId>,
): DataResponse['assetsBalance'] {
  if (!assetsBalance || chainIds.size === 0) {
    return assetsBalance;
  }

  const filtered: NonNullable<DataResponse['assetsBalance']> = {};
  for (const [accountId, accountBalances] of Object.entries(assetsBalance)) {
    const kept = Object.fromEntries(
      Object.entries(accountBalances).filter(
        ([assetId]) => !chainIds.has(assetId.split('/')[0] as ChainId),
      ),
    ) as Record<Caip19AssetId, AssetBalance>;
    if (Object.keys(kept).length > 0) {
      filtered[accountId] = kept;
    }
  }
  return filtered;
}

function collectStaleTrackedAssets(ctx: Context): Caip19AssetId[] {
  const { assetsBalance: stateAssetsBalance, customAssets: stateCustomAssets } =
    ctx.getAssetsState();

  const staleAssets = new Set<Caip19AssetId>();

  for (const { account, supportedChains } of ctx.request
    .accountsWithSupportedChains) {
    const accountId = account.id;
    const trackedAssetIds = new Set<Caip19AssetId>([
      ...(Object.keys(stateAssetsBalance[accountId] ?? {}) as Caip19AssetId[]),
      ...(stateCustomAssets?.[accountId] ?? []),
    ]);

    const chainsForAccount = supportedChains.filter((chainId) =>
      ctx.request.chainIds.includes(chainId),
    );

    for (const assetId of trackedAssetIds) {
      if (
        isEvmAssetOnChains(assetId, chainsForAccount) &&
        !isStakingContractAssetId(assetId) &&
        isBalanceEmpty(ctx.response.assetsBalance?.[accountId], assetId)
      ) {
        staleAssets.add(assetId);
      }
    }
  }

  return [...staleAssets];
}

function isBalanceEmpty(
  balances: Record<string, AssetBalance> | undefined,
  assetId: Caip19AssetId,
): boolean {
  let amount = balances?.[assetId]?.amount;
  if (amount === undefined && balances) {
    const lowerCasedAssetId = assetId.toLowerCase();
    amount = Object.entries(balances).find(
      ([id]) => id.toLowerCase() === lowerCasedAssetId,
    )?.[1]?.amount;
  }
  return !(Number(amount) > 0);
}

function isEvmAssetOnChains(
  assetId: Caip19AssetId,
  chainIds: ChainId[],
): boolean {
  if (!assetId.startsWith(`${KnownCaipNamespace.Eip155}:`)) {
    return false;
  }
  return chainIds.includes(assetId.split('/')[0] as ChainId);
}
