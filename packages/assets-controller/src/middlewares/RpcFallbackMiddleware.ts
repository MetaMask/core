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
  DataResponse,
  Middleware,
} from '../types.js';
import { mergeDataResponses } from './ParallelMiddleware.js';

const CONTROLLER_NAME = 'RpcFallbackMiddleware';

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

export type RpcFallbackMiddlewareOptions = {
  /** The RPC data source to use as a fallback. */
  rpcDataSource: AssetsDataSource;
};

/**
 * RpcFallbackMiddleware re-reads balances from the RPC data source in two
 * cases:
 *
 * 1. Chains present in `response.errors` (network error, unprocessedNetworks,
 *    timeout, …). Successful RPC results are merged into the response and
 *    their entries are cleared from `response.errors`.
 * 2. EVM assets tracked in state (`state.assetsBalance` or
 *    `state.customAssets`) that this balance response left empty. The Accounts
 *    API omits tokens it does not index, and a returned `0` is
 *    indistinguishable from "not indexed", so the `merge` state update would
 *    otherwise keep a stale amount forever. They are passed to RPC as
 *    `customAssets` so the balance fetcher includes them in its multicall.
 *
 * Place this immediately after `createParallelBalanceMiddleware` in the fast
 * pipeline, after `CustomAssetGraduationMiddleware` so the custom assets RPC
 * carries never trigger graduation.
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
      const staleAssets = collectStaleTrackedAssets(ctx);

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

      const noopNext = async (inner: typeof ctx): Promise<typeof ctx> => inner;
      const rpcResult = await this.#rpcDataSource.assetsMiddleware(
        {
          ...ctx,
          request: filteredRequest,
          response: {},
        },
        noopNext,
      );

      const merged: DataResponse = mergeDataResponses([
        ctx.response,
        rpcResult.response,
      ]);

      // Clear errors only for chains RPC actually recovered a balance for.
      // We must inspect rpcResult.response — NOT merged — because merged
      // also contains balances from the upstream sources (AccountsApi /
      // Websocket / Staked). If those sources returned partial data for
      // a chain that they also flagged as errored (e.g. via
      // unprocessedNetworks), and RPC then failed for that same chain,
      // looking at merged would incorrectly mark the error as recovered.
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

      return next({ ...ctx, response: merged });
    });
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
 * @returns Asset IDs to hand to the RPC data source.
 */
function collectStaleTrackedAssets(ctx: Context): Caip19AssetId[] {
  const { assetsBalance: stateAssetsBalance, customAssets: stateCustomAssets } =
    ctx.getAssetsState();

  const staleAssets = new Set<Caip19AssetId>();

  for (const {
    account,
    supportedChains,
  } of ctx.request.accountsWithSupportedChains) {
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
