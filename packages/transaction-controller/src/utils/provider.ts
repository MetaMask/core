import type {
  NetworkClient,
  NetworkClientId,
  Provider,
} from '@metamask/network-controller';
import { NetworkClientType } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import { createModuleLogger, projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';

const log = createModuleLogger(projectLogger, 'provider');

type ProviderRequestParams = Parameters<Provider['request']>[0]['params'];

/**
 * Get a provider for the specified chain or network client.
 * Resolves chainId to networkClientId if needed, then gets the provider.
 *
 * @param request - The request object.
 * @param request.messenger - The TransactionController messenger.
 * @param request.chainId - The chain ID to resolve to a network client.
 * @param request.networkClientId - The network client ID to use directly.
 * @returns The Provider instance.
 */
export function getProvider({
  messenger,
  chainId,
  networkClientId,
}: {
  messenger: TransactionControllerMessenger;
  chainId?: Hex;
  networkClientId?: NetworkClientId;
}): Provider {
  const resolvedId = getNetworkClientId({
    messenger,
    chainId,
    networkClientId,
  });

  return getNetworkClient(messenger, resolvedId).provider;
}

/**
 * Send an RPC request to the network for the specified chain or network client.
 *
 * @param request - The request object.
 * @param request.messenger - The TransactionController messenger.
 * @param request.chainId - The chain ID to resolve to a network client.
 * @param request.networkClientId - The network client ID to use directly.
 * @param request.method - The JSON-RPC method name.
 * @param request.params - Optional parameters for the RPC call.
 * @returns The RPC response.
 */
export async function rpcRequest({
  messenger,
  chainId,
  networkClientId,
  method,
  params,
}: {
  messenger: TransactionControllerMessenger;
  chainId?: Hex;
  networkClientId?: NetworkClientId;
  method: string;
  params?: ProviderRequestParams;
}): Promise<unknown> {
  const resolvedNetworkClientId = getNetworkClientId({
    messenger,
    chainId,
    networkClientId,
  });

  const networkClient = getNetworkClient(messenger, resolvedNetworkClientId);
  const { provider } = networkClient;

  let response: unknown;
  try {
    response = await provider.request({ method, params });
  } catch (error) {
    throwWithRpcContext(error, {
      method,
      networkClient,
    });
  }

  log(method, { params, response });

  return response;
}

/**
 * Get the network client ID for the specified chain or network client.
 *
 * @param request - The request object.
 * @param request.messenger - The TransactionController messenger.
 * @param request.chainId - The chain ID to resolve to a network client.
 * @param request.networkClientId - The network client ID to use directly.
 * @returns The network client ID.
 */
export function getNetworkClientId({
  messenger,
  chainId,
  networkClientId,
}: {
  messenger: TransactionControllerMessenger;
  chainId?: Hex;
  networkClientId?: NetworkClientId;
}): NetworkClientId {
  if (networkClientId) {
    return networkClientId;
  }

  if (chainId) {
    return messenger.call(
      'NetworkController:findNetworkClientIdByChainId',
      chainId,
    );
  }

  throw new Error('Either chainId or networkClientId must be provided');
}

/**
 * Get the chain ID for the specified network client.
 *
 * @param request - The request object.
 * @param request.messenger - The TransactionController messenger.
 * @param request.networkClientId - The network client ID.
 * @returns The chain ID.
 */
export function getChainId({
  messenger,
  networkClientId,
}: {
  messenger: TransactionControllerMessenger;
  networkClientId: NetworkClientId;
}): Hex {
  return (
    messenger.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    ) as {
      configuration: { chainId: Hex };
    }
  ).configuration.chainId;
}

function getNetworkClient(
  messenger: TransactionControllerMessenger,
  networkClientId: NetworkClientId,
): NetworkClient {
  return messenger.call(
    'NetworkController:getNetworkClientById',
    networkClientId,
  ) as NetworkClient;
}

function throwWithRpcContext(
  error: unknown,
  {
    method,
    networkClient,
  }: {
    method: string;
    networkClient: NetworkClient;
  },
): never {
  const errorObject = error as {
    data?: { message?: string };
    message?: string;
  };
  const message = errorObject.data?.message ?? errorObject.message;
  const prefix = `RPC ${networkClient.configuration.chainId} ${getEndpointLabel(
    networkClient,
  )} ${method}`;
  const prefixedMessage = `${prefix}: ${message}`;

  errorObject.message = prefixedMessage;
  throw error;
}

function getEndpointLabel(networkClient: NetworkClient): 'Infura' | 'Custom' {
  return networkClient.configuration.type === NetworkClientType.Infura
    ? 'Infura'
    : 'Custom';
}
