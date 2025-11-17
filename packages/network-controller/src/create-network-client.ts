import type { InfuraNetworkType } from '@metamask/controller-utils';
import { ChainId } from '@metamask/controller-utils';
import type { PollingBlockTrackerOptions } from '@metamask/eth-block-tracker';
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
import { InternalProvider } from '@metamask/eth-json-rpc-provider';
import { providerFromMiddlewareV2 } from '@metamask/eth-json-rpc-provider';
import { asV2Middleware } from '@metamask/json-rpc-engine';
import {
  createScaffoldMiddleware,
  JsonRpcEngineV2,
} from '@metamask/json-rpc-engine/v2';
import type {
  JsonRpcMiddleware,
  MiddlewareContext,
} from '@metamask/json-rpc-engine/v2';
import type { Hex, Json, JsonRpcRequest } from '@metamask/utils';
import type { Logger } from 'loglevel';

import type { NetworkControllerMessenger } from './NetworkController';
import type { RpcServiceOptions } from './rpc-service/rpc-service';
import { RpcServiceChain } from './rpc-service/rpc-service-chain';
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

type RpcApiMiddleware = JsonRpcMiddleware<
  JsonRpcRequest,
  Json,
  MiddlewareContext<{ origin: string }>
>;

/**
 * Create a JSON RPC network client for a specific network.
 *
 * @param args - The arguments.
 * @param args.configuration - The network configuration.
 * @param args.getRpcServiceOptions - Factory for constructing RPC service
 * options. See {@link NetworkControllerOptions.getRpcServiceOptions}.
 * @param args.getBlockTrackerOptions - Factory for constructing block tracker
 * options. See {@link NetworkControllerOptions.getBlockTrackerOptions}.
 * @param args.messenger - The network controller messenger.
 * @param args.isRpcFailoverEnabled - Whether or not requests sent to the
 * primary RPC endpoint for this network should be automatically diverted to
 * provided failover endpoints if the primary is unavailable. This effectively
 * causes the `failoverRpcUrls` property of the network client configuration
 * to be honored or ignored.
 * @param args.logger - A `loglevel` logger.
 * @returns The network client.
 */
export function createNetworkClient({
  configuration,
  getRpcServiceOptions,
  getBlockTrackerOptions,
  messenger,
  isRpcFailoverEnabled,
  logger,
}: {
  configuration: NetworkClientConfiguration;
  getRpcServiceOptions: (
    rpcEndpointUrl: string,
  ) => Omit<RpcServiceOptions, 'failoverService' | 'endpointUrl'>;
  getBlockTrackerOptions: (
    rpcEndpointUrl: string,
  ) => Omit<PollingBlockTrackerOptions, 'provider'>;
  messenger: NetworkControllerMessenger;
  isRpcFailoverEnabled: boolean;
  logger?: Logger;
}): NetworkClient {
  const primaryEndpointUrl =
    configuration.type === NetworkClientType.Infura
      ? `https://${configuration.network}.infura.io/v3/${configuration.infuraProjectId}`
      : configuration.rpcUrl;
  const availableEndpointUrls = isRpcFailoverEnabled
    ? [primaryEndpointUrl, ...(configuration.failoverRpcUrls ?? [])]
    : [primaryEndpointUrl];
  const rpcServiceChain = new RpcServiceChain(
    availableEndpointUrls.map((endpointUrl) => ({
      ...getRpcServiceOptions(endpointUrl),
      endpointUrl,
      logger,
    })),
  );
  rpcServiceChain.onBreak(({ endpointUrl, failoverEndpointUrl, ...rest }) => {
    let error: unknown;
    if ('error' in rest) {
      error = rest.error;
    } else if ('value' in rest) {
      error = rest.value;
    }

    messenger.publish('NetworkController:rpcEndpointUnavailable', {
      chainId: configuration.chainId,
      endpointUrl,
      failoverEndpointUrl,
      error,
    });
  });
  rpcServiceChain.onDegraded(({ endpointUrl, ...rest }) => {
    let error: unknown;
    if ('error' in rest) {
      error = rest.error;
    } else if ('value' in rest) {
      error = rest.value;
    }

    messenger.publish('NetworkController:rpcEndpointDegraded', {
      chainId: configuration.chainId,
      endpointUrl,
      error,
    });
  });
  rpcServiceChain.onRetry(({ endpointUrl, attempt }) => {
    messenger.publish('NetworkController:rpcEndpointRequestRetried', {
      endpointUrl,
      attempt,
    });
  });

  let rpcApiMiddleware: RpcApiMiddleware;
  if (configuration.type === NetworkClientType.Infura) {
    rpcApiMiddleware = asV2Middleware(
      createInfuraMiddleware({
        rpcService: rpcServiceChain,
        options: {
          source: 'metamask',
        },
      }),
    );
  } else {
    rpcApiMiddleware = createFetchMiddleware({ rpcService: rpcServiceChain });
  }

  const rpcProvider = providerFromMiddlewareV2(rpcApiMiddleware);

  const blockTracker = createBlockTracker({
    networkClientType: configuration.type,
    endpointUrl: primaryEndpointUrl,
    getOptions: getBlockTrackerOptions,
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

  const provider: Provider = new InternalProvider({
    engine: JsonRpcEngineV2.create({
      middleware: [networkMiddleware],
    }),
  });

  const destroy = () => {
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    blockTracker.destroy();
  };

  return { configuration, provider, blockTracker, destroy };
}

/**
 * Create the block tracker for the network.
 *
 * @param args - The arguments.
 * @param args.networkClientType - The type of the network client ("infura" or
 * "custom").
 * @param args.endpointUrl - The URL of the endpoint.
 * @param args.getOptions - Factory for the block tracker options.
 * @param args.provider - The EIP-1193 provider for the network's JSON-RPC
 * middleware stack.
 * @returns The created block tracker.
 */
function createBlockTracker({
  networkClientType,
  endpointUrl,
  getOptions,
  provider,
}: {
  networkClientType: NetworkClientType;
  endpointUrl: string;
  getOptions: (
    rpcEndpointUrl: string,
  ) => Omit<PollingBlockTrackerOptions, 'provider'>;
  provider: InternalProvider;
}) {
  const testOptions =
    process.env.IN_TEST && networkClientType === NetworkClientType.Custom
      ? { pollingInterval: SECOND }
      : {};

  return new PollingBlockTracker({
    ...testOptions,
    ...getOptions(endpointUrl),
    provider,
  });
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
  rpcProvider: InternalProvider;
  rpcApiMiddleware: RpcApiMiddleware;
}) {
  return JsonRpcEngineV2.create({
    middleware: [
      createNetworkAndChainIdMiddleware({ network }),
      createBlockCacheMiddleware({ blockTracker }),
      createInflightCacheMiddleware(),
      createBlockRefMiddleware({ blockTracker, provider: rpcProvider }),
      createRetryOnEmptyMiddleware({ blockTracker, provider: rpcProvider }),
      createBlockTrackerInspectorMiddleware({ blockTracker }),
      rpcApiMiddleware,
    ],
  }).asMiddleware();
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
    eth_chainId: ChainId[network],
  });
}

const createChainIdMiddleware = (
  chainId: Hex,
): JsonRpcMiddleware<JsonRpcRequest, Json> => {
  return ({ request, next }) => {
    if (request.method === 'eth_chainId') {
      return chainId;
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
  rpcApiMiddleware: RpcApiMiddleware;
}) {
  const testMiddlewares = process.env.IN_TEST
    ? [createEstimateGasDelayTestMiddleware()]
    : [];

  return JsonRpcEngineV2.create({
    middleware: [
      ...testMiddlewares,
      createChainIdMiddleware(chainId),
      createBlockRefRewriteMiddleware({ blockTracker }),
      createBlockCacheMiddleware({ blockTracker }),
      createInflightCacheMiddleware(),
      createBlockTrackerInspectorMiddleware({ blockTracker }),
      rpcApiMiddleware,
    ],
  }).asMiddleware();
}

/**
 * For use in tests only.
 * Adds a delay to `eth_estimateGas` calls.
 *
 * @returns The middleware for delaying gas estimation calls by 2 seconds when in test.
 */
function createEstimateGasDelayTestMiddleware(): JsonRpcMiddleware<
  JsonRpcRequest,
  Json
> {
  return async ({ request, next }) => {
    if (request.method === 'eth_estimateGas') {
      await new Promise((resolve) => setTimeout(resolve, SECOND * 2));
    }
    return next();
  };
}
