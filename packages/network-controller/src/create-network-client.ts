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
import { InfuraNetworkType, NetworksChainId } from '@metamask/controller-utils';

const SECOND = 1000;

export enum NetworkClientType {
  Custom = 'custom',
  Infura = 'infura',
}

type CustomNetworkConfiguration = {
  chainId: Hex;
  rpcUrl: string;
  type: NetworkClientType.Custom;
};

type InfuraNetworkConfiguration = {
  network: InfuraNetworkType;
  infuraProjectId: string;
  type: NetworkClientType.Infura;
};

export type NetworkClient = {
  provider: SafeEventEmitterProvider;
  blockTracker: PollingBlockTracker;
};

/**
 * Create a JSON RPC network client for a specific network.
 *
 * @param networkConfig - The network configuration.
 * @returns The network client.
 */
export function createNetworkClient(
  networkConfig: CustomNetworkConfiguration | InfuraNetworkConfiguration,
): NetworkClient {
  const rpcApiMiddleware =
    networkConfig.type === NetworkClientType.Infura
      ? createInfuraMiddleware({
          network: networkConfig.network,
          projectId: networkConfig.infuraProjectId,
          maxAttempts: 5,
          source: 'metamask',
        })
      : createFetchMiddleware({
          btoa: global.btoa,
          fetch: global.fetch,
          rpcUrl: networkConfig.rpcUrl,
        });

  const rpcProvider = providerFromMiddleware(rpcApiMiddleware);

  const blockTrackerOpts =
    // eslint-disable-next-line node/no-process-env
    process.env.IN_TEST && networkConfig.type === 'custom'
      ? { pollingInterval: SECOND }
      : {};
  const blockTracker = new PollingBlockTracker({
    ...blockTrackerOpts,
    provider: rpcProvider,
  });

  const networkMiddleware =
    networkConfig.type === NetworkClientType.Infura
      ? createInfuraNetworkMiddleware({
          blockTracker,
          network: networkConfig.network,
          rpcProvider,
          rpcApiMiddleware,
        })
      : createCustomNetworkMiddleware({
          blockTracker,
          chainId: networkConfig.chainId,
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
  const chainId = NetworksChainId[network];

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
