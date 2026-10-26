import { forDataTypes } from '../types.js';
import type {
  AssetsDataSource,
  ChainId,
  Context,
  Middleware,
  NextFunction,
} from '../types.js';
import { filterFailedChainBalances } from '../utils/filterFailedChainBalances.js';
import { mergeDataResponses } from './ParallelMiddleware.js';

const CONTROLLER_NAME = 'RpcFallbackMiddleware';

export type RpcFallbackMiddlewareOptions = {
  /** The RPC data source to use as a fallback. */
  rpcDataSource: AssetsDataSource;
};

const noopNext = async (ctx: Context): Promise<Context> => ctx;

/**
 * RpcFallbackMiddleware recovers chains upstream sources left in
 * `response.errors`. Those chains are refetched in full (native + existing
 * balances + pins + default tracked assets). RPC reads those from state; the
 * request is not scoped via `customAssets`.
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
      return this.#recover(ctx, next);
    });
  }

  async #recover(ctx: Context, next: NextFunction): Promise<Context> {
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
}
