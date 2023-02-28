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
  providerFromMiddleware,
} from 'eth-json-rpc-middleware';

import { createInfuraMiddleware, CreateInfuraMiddlewareOptions } from '@metamask/eth-json-rpc-infura';

import { InfuraJsonRpcSupportedNetwork } from '@metamask/eth-json-rpc-infura/dist/types'; // todo: export this from main?
import { PollingBlockTracker } from 'eth-block-tracker';

import { NetworksChainId, NetworkType } from '@metamask/controller-utils';
import { CreateClientResult } from './types';

export type InfuraNetworkType =
  | 'kovan'
  | 'mainnet'
  | 'rinkeby'
  | 'goerli'
  | 'ropsten';

/**
 * Create client middleware for infura.
 *
 * @param network - the network name.
 * @param projectId - infura project id.
 * @returns The network middleware and the block tracker.
 */
export default function createInfuraClient(
  network: NetworkType,
  projectId: CreateInfuraMiddlewareOptions["projectId"],
): CreateClientResult {
  const infuraMiddleware = createInfuraMiddleware({
    network: network as InfuraJsonRpcSupportedNetwork,
    projectId,
    maxAttempts: 5,
    source: 'metamask',
  });
  const infuraProvider = providerFromMiddleware(infuraMiddleware);
  // there is a type mismatch for Provider & SafeEventEmitter.
  const blockTracker = new PollingBlockTracker({
    provider: infuraProvider,
  });

  const networkMiddleware = mergeMiddleware([
    createNetworkAndChainIdMiddleware(network as NetworkType),
    createBlockCacheMiddleware({ blockTracker: blockTracker as any }) as any, // something wrong with typing
    createInflightCacheMiddleware(),
    createBlockRefMiddleware({
      blockTracker: blockTracker as any,
      provider: infuraProvider,
    }),
    createRetryOnEmptyMiddleware({
      blockTracker: blockTracker as any,
      provider: infuraProvider,
    }),
    createBlockTrackerInspectorMiddleware({
      blockTracker: blockTracker as any,
    }),
    infuraMiddleware,
  ]);
  return { networkMiddleware, blockTracker };
}

/**
 * Create middleware that will trap calls to get network or chain id.
 *
 * @param network - network type that we are connecting to.
 * @returns json-rpc-engine middleware
 */
function createNetworkAndChainIdMiddleware(
  network: NetworkType,
): JsonRpcMiddleware<any, any> {
  const chainId = NetworksChainId[network];

  if (typeof chainId === undefined) {
    throw new Error(`createInfuraClient - unknown network "${network}"`);
  }

  // For infura networks, networkId is always the same as chainId.
  return createScaffoldMiddleware({
    eth_chainId: chainId,
    net_version: chainId,
  });
}
