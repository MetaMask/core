import { KnownCaipNamespace } from '@metamask/utils';

import { isStakingContractAssetId } from '../data-sources/evm-rpc-services/index.js';
import { projectLogger, createModuleLogger } from '../logger.js';
import { forDataTypes } from '../types.js';
import type {
  AssetBalance,
  AssetsControllerState,
  AssetsDataSource,
  Caip19AssetId,
  ChainId,
  Context,
  DataResponse,
  Middleware,
  NextFunction,
} from '../types.js';
import { filterFailedChainBalances } from '../utils/filterFailedChainBalances.js';
import { mergeDataResponses } from './ParallelMiddleware.js';

const CONTROLLER_NAME = 'RpcFallbackMiddleware';

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

export type RpcFallbackMiddlewareOptions = {
  /** The RPC data source to use as a fallback. */
  rpcDataSource: AssetsDataSource;
  /**
   * When true, recover failed and unprocessed chains with a full RPC refetch
   * (Accounts API v6). When false, re-read stale tracked assets the v5 API
   * omitted (legacy path).
   */
  isBalanceV6Enabled?: () => boolean;
  /** Current AssetsController state. Used to find tracked assets the response left empty. */
  getAssetsState: () => AssetsControllerState;
};

const noopNext = async (ctx: Context): Promise<Context> => ctx;

/**
 * RpcFallbackMiddleware recovers what upstream sources left outstanding on RPC.
 *
 * Accounts API v5: chains in `response.errors`, plus EVM assets tracked in
 * state that this response left empty (the API omits tokens it does not index).
 *
 * Accounts API v6: one RPC retry on the chain axis. Chains in
 * `response.errors` are refetched in full (native + existing balances + pins +
 * default tracked assets). RPC reads those from state; the request is not
 * scoped via `customAssets`.
 */
export class RpcFallbackMiddleware {
  readonly name = CONTROLLER_NAME;

  readonly #rpcDataSource: AssetsDataSource;

  readonly #isBalanceV6Enabled: () => boolean;

  readonly #getAssetsState: () => AssetsControllerState;

  constructor(options: RpcFallbackMiddlewareOptions) {
    this.#rpcDataSource = options.rpcDataSource;
    this.#isBalanceV6Enabled =
      options.isBalanceV6Enabled ?? ((): boolean => false);
    this.#getAssetsState = options.getAssetsState;
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
    const chainsToFetch = ctx.request.chainIds.filter((id) =>
      erroredChains.has(id),
    );

    if (chainsToFetch.length === 0) {
      return next(ctx);
    }

    const rpcResult = await this.#rpcDataSource.assetsMiddleware(
      {
        ...ctx,
        request: { ...ctx.request, chainIds: chainsToFetch },
        response: {},
      },
      noopNext,
    );

    const rpcFailedChains = new Set<ChainId>(
      Object.keys(rpcResult.response.errors ?? {}) as ChainId[],
    );
    const rpcAssetsBalance = filterFailedChainBalances(
      rpcResult.response.assetsBalance,
      rpcFailedChains,
    );

    const merged = mergeDataResponses([
      ctx.response,
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

    return next({ ...ctx, response: merged });
  }

  async #recoverV5(ctx: Context, next: NextFunction): Promise<Context> {
    const erroredChains = new Set<ChainId>(
      Object.keys(ctx.response.errors ?? {}) as ChainId[],
    );
    const staleAssets = collectStaleTrackedAssets(ctx, this.#getAssetsState());

    const chainsToFetch = [
      ...new Set([
        ...ctx.request.chainIds.filter((id) => erroredChains.has(id)),
        // Already restricted to requested chains. Their chain may not be
        // errored: the Accounts API can answer for a chain while omitting a
        // token it does not index.
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

    // A chain RPC itself failed on contributed nothing trustworthy: its
    // balances are failure stubs (native 0) that would overwrite correct
    // upstream amounts and, with replaceCoveredChainBalances, wipe the
    // chain's token slice from state. Drop them before merging — this also
    // keeps failed chains from counting as "recovered" below.
    const rpcFailedChains = new Set<ChainId>(
      Object.keys(rpcResult.response.errors ?? {}) as ChainId[],
    );
    const rpcAssetsBalance = filterFailedChainBalances(
      rpcResult.response.assetsBalance,
      rpcFailedChains,
    );

    // RPC errors are kept only for chains that were already errored
    // upstream. For chains fetched solely for stale tracked assets the
    // upstream response succeeded and stays authoritative — the stale asset
    // keeps its previous amount and is retried on the next pass.
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

    // Clear errors only for chains RPC actually recovered a balance for.
    // We must inspect the (filtered) RPC balances — NOT merged — because
    // merged also contains balances from the upstream sources (AccountsApi /
    // Websocket / Staked). If those sources returned partial data for
    // a chain that they also flagged as errored (e.g. via
    // unprocessedNetworks), and RPC then failed for that same chain,
    // looking at merged would incorrectly mark the error as recovered.
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
}

/**
 * EVM assets tracked in state that this balance response left empty and RPC
 * should re-read.
 *
 * Limited to chains both requested and supported by the owning account:
 * RpcDataSource fetches per account and skips chains outside its supported
 * set, so anything else would be queued and then silently dropped.
 *
 * @param ctx - Pipeline context.
 * @param state - Current AssetsController state.
 * @returns Asset IDs to hand to the RPC data source.
 */
function collectStaleTrackedAssets(
  ctx: Context,
  state: AssetsControllerState,
): Caip19AssetId[] {
  const { assetsBalance: stateAssetsBalance, customAssets: stateCustomAssets } =
    state;

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
        // Staked vault balances belong to StakedBalanceDataSource; an RPC
        // ERC-20 read of the share token would clobber them.
        !isStakingContractAssetId(assetId) &&
        isBalanceEmpty(ctx.response.assetsBalance?.[accountId], assetId)
      ) {
        staleAssets.add(assetId);
      }
    }
  }

  return [...staleAssets];
}

/**
 * Whether a balance response carries no positive amount for an asset. A
 * returned `0` cannot be distinguished from "not indexed", so both count as
 * empty. Asset IDs are matched case-insensitively: state keys ERC-20 assets by
 * checksummed address, while some data sources return them lower-cased.
 *
 * @param balances - Balance map for a single account from the response.
 * @param assetId - Asset ID to check.
 * @returns True when the response holds no positive amount for the asset.
 */
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

/**
 * Whether an asset is an EVM asset on one of the given chains.
 *
 * @param assetId - CAIP-19 asset ID.
 * @param chainIds - Chains to match against.
 * @returns True for EVM assets whose chain is in `chainIds`.
 */
function isEvmAssetOnChains(
  assetId: Caip19AssetId,
  chainIds: ChainId[],
): boolean {
  if (!assetId.startsWith(`${KnownCaipNamespace.Eip155}:`)) {
    return false;
  }
  return chainIds.includes(assetId.split('/')[0] as ChainId);
}
