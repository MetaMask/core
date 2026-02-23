import { CONNECTIVITY_STATUSES } from '@metamask/connectivity-controller';
import type {
  CockatielFailureReason,
  InfuraNetworkType,
} from '@metamask/controller-utils';
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

import type {
  NetworkClientId,
  NetworkControllerMessenger,
} from './NetworkController';
import type { RpcServiceOptions } from './rpc-service/rpc-service';
import {
  isConnectionError,
  isConnectionResetError,
  isJsonParseError,
  isHttpServerError,
  isTimeoutError,
} from './rpc-service/rpc-service';
import { RpcServiceChain } from './rpc-service/rpc-service-chain';
import type {
  BlockTracker,
  NetworkClientConfiguration,
  Provider,
} from './types';
import { NetworkClientType } from './types';

const SECOND = 1000;

/**
 * Why the degraded event was emitted.
 */
export type DegradedEventType = 'slow_success' | 'retries_exhausted';

/**
 * The category of error that was retried until retries were exhausted.
 */
export type RetryReason =
  | 'connection_failed'
  | 'response_not_json'
  | 'non_successful_http_status'
  | 'timed_out'
  | 'connection_reset'
  | 'unknown';

/**
 * Classifies the error that was being retried when retries were exhausted.
 *
 * @param error - The error from the last retry attempt.
 * @returns A classification string.
 */
export function classifyRetryReason(error: unknown): RetryReason {
  if (!(error instanceof Error)) {
    return 'unknown';
  }
  if (isConnectionError(error)) {
    return 'connection_failed';
  }
  if (isJsonParseError(error)) {
    return 'response_not_json';
  }
  if (isHttpServerError(error)) {
    return 'non_successful_http_status';
  }
  if (isTimeoutError(error)) {
    return 'timed_out';
  }
  if (isConnectionResetError(error)) {
    return 'connection_reset';
  }
  return 'unknown';
}

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
 * @param args.id - The ID that will be assigned to the new network client in
 * the registry.
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
  id,
  configuration,
  getRpcServiceOptions,
  getBlockTrackerOptions,
  messenger,
  isRpcFailoverEnabled,
  logger,
}: {
  id: NetworkClientId;
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
  const rpcServiceChain = createRpcServiceChain({
    id,
    primaryEndpointUrl,
    configuration,
    getRpcServiceOptions,
    messenger,
    isRpcFailoverEnabled,
    logger,
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

  const destroy = (): void => {
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    blockTracker.destroy();
  };

  return { configuration, provider, blockTracker, destroy };
}

/**
 * Creates an RPC service chain, which represents the primary endpoint URL for
 * the network as well as its failover URLs.
 *
 * @param args - The arguments.
 * @param args.id - The ID that will be assigned to the new network client in
 * the registry.
 * @param args.primaryEndpointUrl - The primary endpoint URL.
 * @param args.configuration - The network configuration.
 * @param args.getRpcServiceOptions - Factory for constructing RPC service
 * options. See {@link NetworkControllerOptions.getRpcServiceOptions}.
 * @param args.messenger - The network controller messenger.
 * @param args.isRpcFailoverEnabled - Whether or not requests sent to the
 * primary RPC endpoint for this network should be automatically diverted to
 * provided failover endpoints if the primary is unavailable. This effectively
 * causes the `failoverRpcUrls` property of the network client configuration
 * to be honored or ignored.
 * @param args.logger - A `loglevel` logger.
 * @returns The RPC service chain.
 */
function createRpcServiceChain({
  id,
  primaryEndpointUrl,
  configuration,
  getRpcServiceOptions,
  messenger,
  isRpcFailoverEnabled,
  logger,
}: {
  id: NetworkClientId;
  primaryEndpointUrl: string;
  configuration: NetworkClientConfiguration;
  getRpcServiceOptions: (
    rpcEndpointUrl: string,
  ) => Omit<RpcServiceOptions, 'failoverService' | 'endpointUrl'>;
  messenger: NetworkControllerMessenger;
  isRpcFailoverEnabled: boolean;
  logger?: Logger;
}): RpcServiceChain {
  const availableEndpointUrls: [string, ...string[]] = isRpcFailoverEnabled
    ? [primaryEndpointUrl, ...(configuration.failoverRpcUrls ?? [])]
    : [primaryEndpointUrl];

  const isOffline = (): boolean => {
    const connectivityState = messenger.call('ConnectivityController:getState');
    return (
      connectivityState.connectivityStatus === CONNECTIVITY_STATUSES.Offline
    );
  };

  const rpcServiceConfigurations = availableEndpointUrls.map((endpointUrl) => ({
    ...getRpcServiceOptions(endpointUrl),
    endpointUrl,
    logger,
    isOffline,
  }));

  /**
   * Extracts the error from Cockatiel's `FailureReason` type received in
   * circuit breaker event handlers.
   *
   * The `FailureReason` object can have two possible shapes:
   * - `{ error: Error }` - When the RPC service throws an error (the common
   * case for RPC failures).
   * - `{ value: T }` - When the RPC service returns a value that the retry
   * filter policy considers a failure.
   *
   * @param value - The event data object from the circuit breaker event
   * listener (after destructuring known properties like `endpointUrl`). This
   * represents Cockatiel's `FailureReason` type.
   * @returns The error or failure value, or `undefined` if neither property
   * exists (which shouldn't happen in practice unless the circuit breaker is
   * manually isolated).
   */
  const getError = (
    value: CockatielFailureReason<unknown> | Record<never, never>,
  ): Error | unknown | undefined => {
    if ('error' in value) {
      return value.error;
    } else if ('value' in value) {
      return value.value;
    }
    return undefined;
  };

  const rpcServiceChain = new RpcServiceChain([
    rpcServiceConfigurations[0],
    ...rpcServiceConfigurations.slice(1),
  ]);

  rpcServiceChain.onBreak((data) => {
    const error = getError(data);

    if (error === undefined) {
      // This error shouldn't happen in practice because we never call `.isolate`
      // on the circuit breaker policy, but we need to appease TypeScript.
      throw new Error('Could not make request to endpoint.');
    }

    messenger.publish('NetworkController:rpcEndpointChainUnavailable', {
      chainId: configuration.chainId,
      networkClientId: id,
      error,
    });
  });

  rpcServiceChain.onServiceBreak(
    ({
      endpointUrl,
      primaryEndpointUrl: primaryEndpointUrlFromEvent,
      ...rest
    }) => {
      const error = getError(rest);

      if (error === undefined) {
        // This error shouldn't happen in practice because we never call `.isolate`
        // on the circuit breaker policy, but we need to appease TypeScript.
        throw new Error('Could not make request to endpoint.');
      }

      messenger.publish('NetworkController:rpcEndpointUnavailable', {
        chainId: configuration.chainId,
        networkClientId: id,
        primaryEndpointUrl: primaryEndpointUrlFromEvent,
        endpointUrl,
        error,
      });
    },
  );

  rpcServiceChain.onDegraded(({ rpcMethodName, ...rest }) => {
    const error = getError(rest);
    const type: DegradedEventType =
      error === undefined ? 'slow_success' : 'retries_exhausted';
    messenger.publish('NetworkController:rpcEndpointChainDegraded', {
      chainId: configuration.chainId,
      networkClientId: id,
      error,
      rpcMethodName,
      type,
      retryReason: error === undefined ? undefined : classifyRetryReason(error),
    });
  });

  rpcServiceChain.onServiceDegraded(
    ({
      endpointUrl,
      primaryEndpointUrl: primaryEndpointUrlFromEvent,
      rpcMethodName,
      ...rest
    }) => {
      const error = getError(rest);
      const type: DegradedEventType =
        error === undefined ? 'slow_success' : 'retries_exhausted';

      messenger.publish('NetworkController:rpcEndpointDegraded', {
        chainId: configuration.chainId,
        networkClientId: id,
        primaryEndpointUrl: primaryEndpointUrlFromEvent,
        endpointUrl,
        error,
        rpcMethodName,
        type,
        retryReason:
          error === undefined ? undefined : classifyRetryReason(error),
      });
    },
  );

  rpcServiceChain.onAvailable(() => {
    messenger.publish('NetworkController:rpcEndpointChainAvailable', {
      chainId: configuration.chainId,
      networkClientId: id,
    });
  });

  rpcServiceChain.onServiceRetry(
    ({
      attempt,
      endpointUrl,
      primaryEndpointUrl: primaryEndpointUrlFromEvent,
    }) => {
      messenger.publish('NetworkController:rpcEndpointRetried', {
        chainId: configuration.chainId,
        networkClientId: id,
        primaryEndpointUrl: primaryEndpointUrlFromEvent,
        endpointUrl,
        attempt,
      });
    },
  );

  return rpcServiceChain;
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
}): PollingBlockTracker {
  const testOptions =
    // Needed for testing.
    // eslint-disable-next-line no-restricted-globals
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
}): JsonRpcMiddleware<
  JsonRpcRequest,
  Json,
  MiddlewareContext<{ origin: string; skipCache: boolean }>
> {
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
}): JsonRpcMiddleware<JsonRpcRequest> {
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
}): JsonRpcMiddleware<
  JsonRpcRequest,
  Json,
  MiddlewareContext<{ origin: string; skipCache: boolean }>
> {
  // Needed for testing.
  // eslint-disable-next-line no-restricted-globals
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
