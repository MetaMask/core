import { projectLogger, createModuleLogger } from '../logger.js';
import { forDataTypes } from '../types.js';
import type {
  AssetsDataSource,
  Caip19AssetId,
  ChainId,
  Context,
  DataResponse,
  Middleware,
} from '../types.js';
import { isUpstreamBalanceEmpty } from '../utils/index.js';
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
 * 2. Assets in `response.detectedAssets` that the upstream response left empty.
 *    `DetectionMiddleware` lists assets tracked in state that the Accounts API
 *    omitted (or reported as an untrusted `0`), which would otherwise keep a
 *    stale amount in state. They are passed to RPC as `customAssets` so the
 *    balance fetcher includes them in its multicall.
 *
 * Place this after `DetectionMiddleware` in the fast pipeline so
 * `detectedAssets` is populated, and after `CustomAssetGraduationMiddleware` so
 * the custom assets RPC carries never trigger graduation.
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
      const emptyAssets = collectEmptyDetectedAssets(ctx);

      const chainsToFetch = [
        ...new Set([
          ...ctx.request.chainIds.filter((id) => erroredChains.has(id)),
          // DetectionMiddleware already restricted these to requested chains.
          // Their chain may not be errored: the Accounts API can answer for a
          // chain while omitting a token it does not index.
          ...emptyAssets.map((assetId) => assetId.split('/')[0] as ChainId),
        ]),
      ];

      if (chainsToFetch.length === 0) {
        return next(ctx);
      }

      log('Re-reading balances on RPC', {
        erroredChains: [...erroredChains],
        emptyAssets,
        chains: chainsToFetch,
      });

      const filteredRequest = {
        ...ctx.request,
        chainIds: chainsToFetch,
        customAssets: [
          ...new Set([...(ctx.request.customAssets ?? []), ...emptyAssets]),
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
 * Detected assets that still have no positive balance in the response.
 *
 * Brand-new assets that arrived with a real amount are skipped — only the ones
 * the upstream source left empty need an RPC read.
 *
 * @param ctx - Pipeline context.
 * @returns Asset IDs to hand to the RPC data source.
 */
function collectEmptyDetectedAssets(ctx: Context): Caip19AssetId[] {
  const { detectedAssets, assetsBalance } = ctx.response;
  if (!detectedAssets) {
    return [];
  }

  const emptyAssets = new Set<Caip19AssetId>();
  for (const [accountId, assetIds] of Object.entries(detectedAssets)) {
    for (const assetId of assetIds) {
      if (isUpstreamBalanceEmpty(assetsBalance?.[accountId], assetId)) {
        emptyAssets.add(assetId);
      }
    }
  }

  return [...emptyAssets];
}
