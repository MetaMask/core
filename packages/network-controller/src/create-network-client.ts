import {
  createAsyncMiddleware,
  createScaffoldMiddleware,
  JsonRpcEngine,
  mergeMiddleware,
  JsonRpcMiddleware,
} from 'json-rpc-engine';
import {
  createBlockCacheMiddleware,
  createBlockRefMiddleware,
  createBlockRefRewriteMiddleware,
  createBlockTrackerInspectorMiddleware,
  createInflightCacheMiddleware,
  createFetchMiddleware,
  createRetryOnEmptyMiddleware,
} from '@metamask/eth-json-rpc-middleware';
import {
  providerFromEngine,
  providerFromMiddleware,
  SafeEventEmitterProvider,
} from '@metamask/eth-json-rpc-provider';
import { createInfuraMiddleware } from '@metamask/eth-json-rpc-infura';
import type { Hex } from '@metamask/utils';
import { PollingBlockTracker } from 'eth-block-tracker';
import { InfuraNetworkType, ChainId } from '@metamask/controller-utils';
import type { BlockTracker, Provider } from './types';

const SECOND = 1000;

/**
 * The type of network client that can be created.
 */
export enum NetworkClientType {
  Custom = 'custom',
  Infura = 'infura',
}

/**
 * A configuration object that can be used to create a provider for a custom
 * network.
 */
type CustomNetworkClientConfiguration = {
  chainId: Hex;
  rpcUrl: string;
  type: NetworkClientType.Custom;
};

/**
 * A configuration object that can be used to create a provider for an Infura
 * network.
 */
type InfuraNetworkClientConfiguration = {
  network: InfuraNetworkType;
  infuraProjectId: string;
  type: NetworkClientType.Infura;
};

/**
 * A configuration object that can be used to create a provider for any network.
 */
export type NetworkClientConfiguration =
  | CustomNetworkClientConfiguration
  | InfuraNetworkClientConfiguration;

/**
 * Create a JSON RPC network client for a specific network.
 *
 * @param networkClientConfig - The network configuration.
 * @returns The network client.
 */
export function createNetworkClient(
  networkClientConfig: NetworkClientConfiguration,
): { provider: Provider; blockTracker: BlockTracker } {
  const rpcApiMiddleware =
    networkClientConfig.type === NetworkClientType.Infura
      ? createInfuraMiddleware({
          network: networkClientConfig.network,
          projectId: networkClientConfig.infuraProjectId,
          maxAttempts: 5,
          source: 'metamask',
        })
      : createFetchMiddleware({
          btoa: global.btoa,
          fetch: global.fetch,
          rpcUrl: networkClientConfig.rpcUrl,
        });

  const rpcProvider = providerFromMiddleware(rpcApiMiddleware);

  const blockTrackerOpts =
    // eslint-disable-next-line node/no-process-env
    process.env.IN_TEST && networkClientConfig.type === 'custom'
      ? { pollingInterval: SECOND }
      : {};
  const blockTracker = new PollingBlockTracker({
    ...blockTrackerOpts,
    provider: rpcProvider,
  });

  const networkMiddleware =
    networkClientConfig.type === NetworkClientType.Infura
      ? createInfuraNetworkMiddleware({
          blockTracker,
          network: networkClientConfig.network,
          rpcProvider,
          rpcApiMiddleware,
        })
      : createCustomNetworkMiddleware({
          blockTracker,
          chainId: networkClientConfig.chainId,
          rpcApiMiddleware,
        });

  const engine = new JsonRpcEngine();

  engine.push(networkMiddleware);

  const provider = providerFromEngine(engine);

  return { provider, blockTracker };
}

/**
 * Create middleware for infura.
 *
 * @param args - The arguments.
 * @param args.blockTracker - The block tracker to use.
 * @param args.network - The Infura network to use.
 * @param args.rpcProvider - The RPC provider to use.
 * @param args.rpcApiMiddleware - Additional middleware.
 * @returns The collection of middleware that makes up the Infura client.
 */
function createInfuraNetworkMiddleware({
  blockTracker,
  network,
  rpcProvider,
  rpcApiMiddleware,
}: {
  blockTracker: PollingBlockTracker;
  network: InfuraNetworkType;
  rpcProvider: SafeEventEmitterProvider;
  rpcApiMiddleware: JsonRpcMiddleware<unknown, unknown>;
}) {
  return mergeMiddleware([
    createNetworkAndChainIdMiddleware({ network }),
    createBlockCacheMiddleware({ blockTracker }),
    createInflightCacheMiddleware(),
    createBlockRefMiddleware({ blockTracker, provider: rpcProvider }),
    createRetryOnEmptyMiddleware({ blockTracker, provider: rpcProvider }),
    createBlockTrackerInspectorMiddleware({ blockTracker }),
    rpcApiMiddleware,
  ]);
}

/**
 * Creates static method middleware.
 *
 * @param args - The Arguments.
 * @param args.network - The Infura network to use.
 * @returns The middleware that implements eth_chainId & net_version methods.
 */
function createNetworkAndChainIdMiddleware({
  network,
}: {
  network: InfuraNetworkType;
}) {
  const chainId = ChainId[network];

  return createScaffoldMiddleware({
    eth_chainId: `0x${parseInt(chainId, 10).toString(16)}`,
    net_version: chainId,
  });
}

const createChainIdMiddleware = (
  chainId: string,
): JsonRpcMiddleware<unknown, unknown> => {
  return (req, res, next, end) => {
    if (req.method === 'eth_chainId') {
      res.result = chainId;
      return end();
    }
    return next();
  };
};

/**
 * Creates custom middleware.
 *
 * @param args - The arguments.
 * @param args.blockTracker - The block tracker to use.
 * @param args.chainId - The chain id to use.
 * @param args.rpcApiMiddleware - Additional middleware.
 * @returns The collection of middleware that makes up the Infura client.
 */
function createCustomNetworkMiddleware({
  blockTracker,
  chainId,
  rpcApiMiddleware,
}: {
  blockTracker: PollingBlockTracker;
  chainId: string;
  rpcApiMiddleware: any;
}) {
  // eslint-disable-next-line node/no-process-env
  const testMiddlewares = process.env.IN_TEST
    ? [createEstimateGasDelayTestMiddleware()]
    : [];

  return mergeMiddleware([
    ...testMiddlewares,
    createChainIdMiddleware(chainId),
    createBlockRefRewriteMiddleware({ blockTracker }),
    createBlockCacheMiddleware({ blockTracker }),
    createInflightCacheMiddleware(),
    createBlockTrackerInspectorMiddleware({ blockTracker }),
    rpcApiMiddleware,
  ]);
}

/**
 * For use in tests only.
 * Adds a delay to `eth_estimateGas` calls.
 *
 * @returns The middleware for delaying gas estimation calls by 2 seconds when in test.
 */
function createEstimateGasDelayTestMiddleware() {
  return createAsyncMiddleware(async (req, _, next) => {
    if (req.method === 'eth_estimateGas') {
      await new Promise((resolve) => setTimeout(resolve, SECOND * 2));
    }
    return next();
  });
}
