import {
  createAsyncMiddleware,
  JsonRpcMiddleware,
  mergeMiddleware,
} from 'json-rpc-engine';
import {
  createFetchMiddleware,
  createBlockRefRewriteMiddleware,
  createBlockCacheMiddleware,
  createInflightCacheMiddleware,
  createBlockTrackerInspectorMiddleware,
} from '@metamask/eth-json-rpc-middleware';
import { PollingBlockTracker } from 'eth-block-tracker';
import { providerFromMiddleware } from '@metamask/eth-json-rpc-provider';
import { CreateClientResult } from './types';

const SECOND = 1000;

/**
 * Create client middleware for a custom rpc endpoint.
 *
 * @param rpcUrl - url of the rpc endpoint.
 * @param chainId - the chain id for the rpc endpoint. This value will always be returned by eth_chainId.
 * @returns The network middleware and the block tracker.
 */
export function createJsonRpcClient(
  rpcUrl: string,
  chainId?: string,
): CreateClientResult {
  const blockTrackerOpts = process.env.IN_TEST // eslint-disable-line node/no-process-env
    ? { pollingInterval: SECOND }
    : {};
  const fetchMiddleware = createFetchMiddleware({
    rpcUrl,
    fetch,
    btoa,
  });
  const blockProvider = providerFromMiddleware(fetchMiddleware);
  const blockTracker = new PollingBlockTracker({
    ...blockTrackerOpts,
    provider: blockProvider,
  });
  const testMiddlewares = process.env.IN_TEST // eslint-disable-line node/no-process-env
    ? [createEstimateGasDelayTestMiddleware()]
    : [];

  const networkMiddleware = mergeMiddleware([
    ...testMiddlewares,
    createChainIdMiddleware(chainId),
    createBlockRefRewriteMiddleware({ blockTracker }),
    createBlockCacheMiddleware({ blockTracker }),
    createInflightCacheMiddleware(),
    createBlockTrackerInspectorMiddleware({ blockTracker }),
    fetchMiddleware,
  ]);

  return { networkMiddleware, blockTracker };
}

/**
 * Create middleware to catch calls to eth_chainId.
 *
 * @param chainId - the chain id to use as the response
 * @returns the middleware
 */
function createChainIdMiddleware(
  chainId?: string,
): JsonRpcMiddleware<unknown, unknown> {
  return (req, res, next, end) => {
    if (req.method === 'eth_chainId') {
      res.result = chainId;
      return end();
    }
    return next();
  };
}

/**
 * For use in tests only.
 * Adds a delay to `eth_estimateGas` calls.
 *
 * @returns the middleware implementing estimate gas
 */
function createEstimateGasDelayTestMiddleware() {
  return createAsyncMiddleware(async (req, _, next) => {
    if (req.method === 'eth_estimateGas') {
      await new Promise((resolve) => setTimeout(resolve, SECOND * 2));
    }
    return next();
  });
}
