import type { InfuraNetworkType } from '@metamask/controller-utils';
import { ChainId } from '@metamask/controller-utils';
import { PollingBlockTracker } from '@metamask/eth-block-tracker';
import { createInfuraMiddleware } from '@metamask/eth-json-rpc-infura';
import {
  createBlockCacheMiddleware,
  createBlockRefMiddleware,
  createBlockRefRewriteMiddleware,
  createBlockTrackerInspectorMiddleware,
  createInflightCacheMiddleware,
  createFetchMiddleware,
  createRetryOnEmptyMiddleware,
} from '@metamask/eth-json-rpc-middleware';
import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import {
  providerFromEngine,
  providerFromMiddleware,
} from '@metamask/eth-json-rpc-provider';
import {
  createAsyncMiddleware,
  createScaffoldMiddleware,
  JsonRpcEngine,
  mergeMiddleware,
} from '@metamask/json-rpc-engine';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type { Hex, Json, JsonRpcParams } from '@metamask/utils';

import { RpcService } from './rpc-service/rpc-service';
import type {
  BlockTracker,
  NetworkClientConfiguration,
  Provider,
} from './types';
import { NetworkClientType } from './types';

const SECOND = 1000;

/**
 * The pair of provider / block tracker that can be used to interface with the
 * network and respond to new activity.
 */
export type NetworkClient = {
  configuration: NetworkClientConfiguration;
  provider: Provider;
  blockTracker: BlockTracker;
  destroy: () => void;
};

/**
 * Create a JSON RPC network client for a specific network.
 *
 * @param args - The arguments.
 * @param args.configuration - The network configuration.
 * @param args.fetch - A function that can be used to make an HTTP request,
 * compatible with the Fetch API.
 * @param args.btoa - A function that can be used to convert a binary string
 * into base-64.
 * @returns The network client.
 */
export function createNetworkClient({
  configuration,
  fetch: givenFetch,
  btoa: givenBtoa,
}: {
  configuration: NetworkClientConfiguration;
  fetch: typeof fetch;
  btoa: typeof btoa;
}): NetworkClient {
  const rpcService =
    configuration.type === NetworkClientType.Infura
      ? new RpcService({
          fetch: givenFetch,
          btoa: givenBtoa,
          endpointUrl: `https://${configuration.network}.infura.io/v3/${configuration.infuraProjectId}`,
        })
      : new RpcService({
          fetch: givenFetch,
          btoa: givenBtoa,
          endpointUrl: configuration.rpcUrl,
        });

  const rpcApiMiddleware =
    configuration.type === NetworkClientType.Infura
      ? createInfuraMiddleware({
          rpcService,
          options: {
            source: 'metamask',
          },
        })
      : createFetchMiddleware({ rpcService });

  const rpcProvider = providerFromMiddleware(rpcApiMiddleware);

  const blockTrackerOpts =
    process.env.IN_TEST && configuration.type === NetworkClientType.Custom
      ? { pollingInterval: SECOND }
      : {};
  const blockTracker = new PollingBlockTracker({
    ...blockTrackerOpts,
    provider: rpcProvider,
  });

  const networkMiddleware =
    configuration.type === NetworkClientType.Infura
      ? createInfuraNetworkMiddleware({
          blockTracker,
          network: configuration.network,
          rpcProvider,
          rpcApiMiddleware,
        })
      : createCustomNetworkMiddleware({
          blockTracker,
          chainId: configuration.chainId,
          rpcApiMiddleware,
        });

  const engine = new JsonRpcEngine();

  engine.push(networkMiddleware);

  const provider = providerFromEngine(engine);

  const destroy = () => {
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    blockTracker.destroy();
  };

  return { configuration, provider, blockTracker, destroy };
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
  rpcApiMiddleware: JsonRpcMiddleware<JsonRpcParams, Json>;
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
 * @returns The middleware that implements the eth_chainId method.
 */
function createNetworkAndChainIdMiddleware({
  network,
}: {
  network: InfuraNetworkType;
}) {
  return createScaffoldMiddleware({
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    eth_chainId: ChainId[network],
  });
}

const createChainIdMiddleware = (
  chainId: Hex,
): JsonRpcMiddleware<JsonRpcParams, Json> => {
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
  chainId: Hex;
  rpcApiMiddleware: JsonRpcMiddleware<JsonRpcParams, Json>;
}): JsonRpcMiddleware<JsonRpcParams, Json> {
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
