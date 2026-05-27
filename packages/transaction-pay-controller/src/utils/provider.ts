import type { NetworkClientId, Provider } from '@metamask/network-controller';
import { RpcEndpointType } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger';
import type { TransactionPayControllerMessenger } from '../types';

const log = createModuleLogger(projectLogger, 'provider');

type ProviderRequestParams = Parameters<Provider['request']>[0]['params'];

/**
 * Options for network client resolution.
 */
export type GetNetworkClientIdOptions = {
  /**
   * When true, attempts to resolve to an Infura endpoint for the chain before
   * falling back to the default selected endpoint. Useful for calls that use
   * block tags (e.g. `pending`) that may not be supported by custom RPCs.
   */
  preferInfura?: boolean;
};

/**
 * Parameters for {@link rpcRequest}.
 */
export type RpcRequestParams = {
  /** The TransactionPayController messenger. */
  messenger: TransactionPayControllerMessenger;
  /** The chain ID to resolve. */
  chainId: Hex;
  /** The JSON-RPC method name. */
  method: string;
  /** Optional parameters for the RPC call. */
  params?: ProviderRequestParams;
  /** Resolution options forwarded to {@link getNetworkClientId}. */
  options?: GetNetworkClientIdOptions;
};

/**
 * Resolve the network client ID for a chain.
 *
 * When `preferInfura` is true the method tries to locate an Infura endpoint
 * in the chain's network configuration and returns its `networkClientId`.
 * If no Infura endpoint is configured, or if the configuration lookup throws,
 * it falls back to `findNetworkClientIdByChainId`.
 *
 * @param messenger - The TransactionPayController messenger.
 * @param chainId - The chain ID to resolve.
 * @param options - Resolution options.
 * @param options.preferInfura - Prefer the Infura endpoint when available.
 * @returns The resolved network client ID.
 */
export function getNetworkClientId(
  messenger: TransactionPayControllerMessenger,
  chainId: Hex,
  { preferInfura = false }: GetNetworkClientIdOptions = {},
): NetworkClientId {
  if (preferInfura) {
    try {
      const networkConfiguration = messenger.call(
        'NetworkController:getNetworkConfigurationByChainId',
        chainId,
      );

      const infuraEndpoint = networkConfiguration?.rpcEndpoints.find(
        (endpoint) => endpoint.type === RpcEndpointType.Infura,
      );

      if (infuraEndpoint) {
        return infuraEndpoint.networkClientId;
      }
    } catch {
      // empty
    }
  }

  return messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    chainId,
  );
}

/**
 * Send an RPC request to the network for the specified chain.
 *
 * @param request - Request parameters.
 * @param request.messenger - The TransactionPayController messenger.
 * @param request.chainId - The chain ID to resolve.
 * @param request.method - The JSON-RPC method name.
 * @param request.params - Optional parameters for the RPC call.
 * @param request.options - Resolution options forwarded to {@link getNetworkClientId}.
 * @returns The RPC response typed as `TResponse`.
 */
export async function rpcRequest<TResponse = unknown>({
  messenger,
  chainId,
  method,
  params,
  options,
}: RpcRequestParams): Promise<TResponse> {
  const networkClientId = getNetworkClientId(messenger, chainId, options);

  const { provider } = messenger.call(
    'NetworkController:getNetworkClientById',
    networkClientId,
  );

  const response = await provider.request({ method, params });

  log(method, { params, response });

  return response as TResponse;
}
