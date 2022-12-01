import { createScaffoldMiddleware, mergeMiddleware } from 'json-rpc-engine';
import {
  createFetchMiddleware,
  createBlockRefRewriteMiddleware,
  createBlockCacheMiddleware,
  createInflightCacheMiddleware,
  createBlockTrackerInspectorMiddleware,
  providerFromMiddleware,
} from 'eth-json-rpc-middleware';
import { PollingBlockTracker } from 'eth-block-tracker';
import { CreateClientResult } from './types';

/**
 * Create client middleware for a custom rpc endpoint.
 *
 * @param rpcUrl - url of the rpc endpoint.
 * @param chainId - the chain id for the rpc endpoint. This value will always be returned by eth_chainId.
 * @returns The network middleware and the block tracker.
 */
export default function createJsonRpcClient(
  rpcUrl: string,
  chainId?: string,
): CreateClientResult {
  const fetchMiddleware = createFetchMiddleware({ rpcUrl });
  const blockProvider = providerFromMiddleware(fetchMiddleware);
  const blockTracker = new PollingBlockTracker({
    provider: blockProvider as any,
  });

  const scaffolded = [];

  if (chainId !== undefined) {
    scaffolded.push(createScaffoldMiddleware({ eth_chainId: chainId }));
  }

  const networkMiddleware = mergeMiddleware([
    ...scaffolded,
    createBlockRefRewriteMiddleware({
      blockTracker: blockTracker as any,
    }) as any,
    createBlockCacheMiddleware({ blockTracker: blockTracker as any }),
    createInflightCacheMiddleware(),
    createBlockTrackerInspectorMiddleware({
      blockTracker: blockTracker as any,
    }),
    fetchMiddleware,
  ]);

  return { networkMiddleware, blockTracker };
}
