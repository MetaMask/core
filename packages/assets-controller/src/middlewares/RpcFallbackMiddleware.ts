import { projectLogger, createModuleLogger } from '../logger';
import { forDataTypes } from '../types';
import type {
  AssetsDataSource,
  ChainId,
  DataResponse,
  Middleware,
} from '../types';
import { mergeDataResponses } from './ParallelMiddleware';

const CONTROLLER_NAME = 'RpcFallbackMiddleware';

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

export type RpcFallbackMiddlewareOptions = {
  /** The RPC data source to use as a fallback. */
  rpcDataSource: AssetsDataSource;
};

/**
 * RpcFallbackMiddleware retries chains that failed upstream on the RPC data
 * source. Any chain present in `response.errors` (network error,
 * unprocessedNetworks, timeout, …) is handed off to RPC with the request
 * filtered to just those chains. Successful RPC results are merged into the
 * response and their entries are cleared from `response.errors`.
 *
 * Place this immediately after `createParallelBalanceMiddleware` in the fast
 * pipeline.
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
      if (erroredChains.size === 0) {
        return next(ctx);
      }

      log('Retrying failed chains on RPC', {
        chains: [...erroredChains],
      });

      const filteredRequest = {
        ...ctx.request,
        chainIds: ctx.request.chainIds.filter((id) => erroredChains.has(id)),
      };

      const noopNext = async (
        inner: typeof ctx,
      ): Promise<typeof ctx> => inner;
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

      // Clear errors for chains RPC successfully retrieved a balance for.
      if (merged.errors && merged.assetsBalance) {
        const chainsWithBalance = new Set<string>();
        for (const accountBalances of Object.values(merged.assetsBalance)) {
          for (const assetId of Object.keys(accountBalances)) {
            chainsWithBalance.add(assetId.split('/')[0]);
          }
        }
        for (const chainId of erroredChains) {
          if (chainsWithBalance.has(chainId)) {
            delete merged.errors[chainId];
          }
        }
      }

      return next({ ...ctx, response: merged });
    });
  }
}
