import type { NetworkClientId, Provider } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import type { TransactionControllerMessenger } from '../TransactionController';

type ProviderRequestParams = Parameters<Provider['request']>[0]['params'];

/**
 * Get a provider for the specified chain or network client.
 * Resolves chainId to networkClientId if needed, then gets the provider.
 *
 * @param messenger - The TransactionController messenger.
 * @param options - Either chainId or networkClientId (at least one required).
 * @param options.chainId - The chain ID to resolve to a network client.
 * @param options.networkClientId - The network client ID to use directly.
 * @returns The Provider instance.
 */
export function getProvider(
  messenger: TransactionControllerMessenger,
  {
    chainId,
    networkClientId,
  }: { chainId?: Hex; networkClientId?: NetworkClientId },
): Provider {
  const resolvedId = getNetworkClientId(messenger, {
    chainId,
    networkClientId,
  });
  return (
    messenger.call('NetworkController:getNetworkClientById', resolvedId) as {
      provider: Provider;
    }
  ).provider;
}

/**
 * Send an RPC request to the network for the specified chain or network client.
 *
 * @param messenger - The TransactionController messenger.
 * @param options - Either chainId or networkClientId (at least one required).
 * @param options.chainId - The chain ID to resolve to a network client.
 * @param options.networkClientId - The network client ID to use directly.
 * @param method - The JSON-RPC method name.
 * @param params - Optional parameters for the RPC call.
 * @returns The RPC response.
 */
export async function rpcRequest(
  messenger: TransactionControllerMessenger,
  {
    chainId,
    networkClientId,
  }: { chainId?: Hex; networkClientId?: NetworkClientId },
  method: string,
  params?: ProviderRequestParams,
): Promise<unknown> {
  const provider = getProvider(messenger, { chainId, networkClientId });
  return provider.request({ method, params });
}

function getNetworkClientId(
  messenger: TransactionControllerMessenger,
  {
    chainId,
    networkClientId,
  }: { chainId?: Hex; networkClientId?: NetworkClientId },
): NetworkClientId {
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
