import {
  createScaffoldMiddleware,
  JsonRpcMiddleware,
  mergeMiddleware,
} from 'json-rpc-engine';
import {
  createBlockRefMiddleware,
  createRetryOnEmptyMiddleware,
  createBlockCacheMiddleware,
  createInflightCacheMiddleware,
  createBlockTrackerInspectorMiddleware,
} from '@metamask/eth-json-rpc-middleware';
import { providerFromMiddleware } from '@metamask/eth-json-rpc-provider';

import { NetworksChainId } from '@metamask/controller-utils';

import { createInfuraMiddleware } from '@metamask/eth-json-rpc-infura';
import { PollingBlockTracker } from 'eth-block-tracker';

// could improve this type... this is not a very complete list
export type InfuraNetworkType = 'mainnet' | 'goerli' | 'sepolia';

/**
 * Construct middleware to manage calls to infura.
 *
 * @param network - type of network
 * @param projectId - infura project id (api key)
 * @returns middleware and a blockTracker
 */
export function createInfuraClient(
  network: InfuraNetworkType,
  projectId: string,
) {
  const infuraMiddleware = createInfuraMiddleware({
    network,
    projectId,
    maxAttempts: 5,
    source: 'metamask',
  });
  const infuraProvider = providerFromMiddleware(infuraMiddleware);
  const blockTracker = new PollingBlockTracker({ provider: infuraProvider });

  const networkMiddleware = mergeMiddleware([
    createNetworkAndChainIdMiddleware(network),
    createBlockCacheMiddleware({ blockTracker }),
    createInflightCacheMiddleware(),
    createBlockRefMiddleware({ blockTracker, provider: infuraProvider }),
    createRetryOnEmptyMiddleware({ blockTracker, provider: infuraProvider }),
    createBlockTrackerInspectorMiddleware({ blockTracker }),
    infuraMiddleware,
  ]);
  return { networkMiddleware, blockTracker };
}

/**
 * Create middleware to implement static / scafolded methods.
 *
 * @param network - type of network
 * @returns the middleware
 */
function createNetworkAndChainIdMiddleware(
  network: InfuraNetworkType,
): JsonRpcMiddleware<unknown, unknown> {
  const chainId = NetworksChainId[network];

  if (typeof chainId === undefined) {
    throw new Error(`createInfuraClient - unknown network "${network}"`);
  }

  return createScaffoldMiddleware({
    eth_chainId: `0x${parseInt(chainId, 10).toString(16)}`,
    net_version: chainId,
  });
}
