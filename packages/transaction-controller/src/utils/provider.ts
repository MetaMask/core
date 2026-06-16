import type { NetworkClientId, Provider } from '@metamask/network-controller';
import { RpcEndpointType } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import { createModuleLogger, projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';

const log = createModuleLogger(projectLogger, 'provider');

type ProviderRequestParams = Parameters<Provider['request']>[0]['params'];

type NetworkClient = {
  configuration: {
    chainId: Hex;
    rpcEndpoints?: { networkClientId: NetworkClientId; type?: string }[];
  };
  provider: Provider;
};

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
      chainId: networkClient.configuration.chainId,
      method,
      networkClient,
      networkClientId: resolvedNetworkClientId,
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
    chainId,
    method,
    networkClient,
    networkClientId,
  }: {
    chainId: Hex;
    method: string;
    networkClient: NetworkClient;
    networkClientId: NetworkClientId;
  },
): never {
  const message = error instanceof Error ? error.message : String(error);
  const prefix = `RPC ${chainId} ${getEndpointLabel(
    networkClient,
    networkClientId,
  )} ${method}`;

  if (error instanceof Error) {
    error.message = `${prefix}: ${message}`;
    throw error;
  }

  throw new Error(`${prefix}: ${message}`);
}

function getEndpointLabel(
  networkClient: NetworkClient,
  networkClientId: NetworkClientId,
): 'Infura' | 'Custom' {
  const endpoint = networkClient.configuration.rpcEndpoints?.find(
    (rpcEndpoint) => rpcEndpoint.networkClientId === networkClientId,
  );

  return endpoint?.type === RpcEndpointType.Infura ? 'Infura' : 'Custom';
}
