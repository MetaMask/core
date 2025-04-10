import { BtcScope, SolScope } from '@metamask/keyring-api';
import type { NetworkConfiguration } from '@metamask/network-controller';
import {
  type Hex,
  type CaipChainId,
  KnownCaipNamespace,
  toCaipChainId,
  parseCaipChainId,
  hexToNumber,
  add0x,
} from '@metamask/utils';
import { isAddress as isSolanaAddress } from '@solana/addresses';

import { AVAILABLE_MULTICHAIN_NETWORK_CONFIGURATIONS } from './constants';
import type {
  SupportedCaipChainId,
  MultichainNetworkConfiguration,
} from './types';

/**
 * Checks if the chain ID is EVM.
 *
 * @param chainId - The account type to check.
 * @returns Whether the network is EVM.
 */
export function isEvmCaipChainId(chainId: CaipChainId): boolean {
  const { namespace } = parseCaipChainId(chainId);
  return namespace === (KnownCaipNamespace.Eip155 as string);
}

/**
 * Returns the chain id of the non-EVM network based on the account address.
 *
 * @param address - The address to check.
 * @returns The caip chain id of the non-EVM network.
 */
export function getChainIdForNonEvmAddress(
  address: string,
): SupportedCaipChainId {
  // This condition is not the most robust. Once we support more networks, we will need to update this logic.
  if (isSolanaAddress(address)) {
    return SolScope.Mainnet;
  }
  return BtcScope.Mainnet;
}

/**
 * Checks if the Caip chain ID is supported.
 *
 * @param id - The Caip chain IDto check.
 * @returns Whether the chain ID is supported.
 */
export function checkIfSupportedCaipChainId(
  id: CaipChainId,
): id is SupportedCaipChainId {
  // Check if the chain id is supported
  return Object.keys(AVAILABLE_MULTICHAIN_NETWORK_CONFIGURATIONS).includes(id);
}

/**
 * Converts a hex chain ID to a Caip chain ID.
 *
 * @param chainId - The hex chain ID to convert.
 * @returns The Caip chain ID.
 */
export const toEvmCaipChainId = (chainId: Hex): CaipChainId =>
  toCaipChainId(KnownCaipNamespace.Eip155, hexToNumber(chainId).toString());

/**
 * Convert an eip155 CAIP chain ID to a hex chain ID.
 *
 * @param chainId - The CAIP chain ID to convert.
 * @returns The hex chain ID.
 */
export function convertEvmCaipToHexChainId(chainId: CaipChainId): Hex {
  const { namespace, reference } = parseCaipChainId(chainId);
  if (namespace === (KnownCaipNamespace.Eip155 as string)) {
    return add0x(parseInt(reference, 10).toString(16));
  }

  throw new Error(
    `Unsupported CAIP chain ID namespace: ${namespace}. Only eip155 is supported.`,
  );
}

/**
 * Updates a network configuration to the format used by the MultichainNetworkController.
 * This method is exclusive for EVM networks with hex identifiers from the NetworkController.
 *
 * @param network - The network configuration to update.
 * @returns The updated network configuration.
 */
export const toMultichainNetworkConfiguration = (
  network: NetworkConfiguration,
): MultichainNetworkConfiguration => {
  const {
    chainId,
    name,
    rpcEndpoints,
    defaultRpcEndpointIndex,
    nativeCurrency,
    blockExplorerUrls,
    defaultBlockExplorerUrlIndex,
  } = network;
  return {
    chainId: toEvmCaipChainId(chainId),
    isEvm: true,
    name: name || rpcEndpoints[defaultRpcEndpointIndex].url,
    nativeCurrency,
    blockExplorerUrls,
    defaultBlockExplorerUrlIndex: defaultBlockExplorerUrlIndex || 0,
  };
};

/**
 * Updates a record of network configurations to the format used by the MultichainNetworkController.
 * This method is exclusive for EVM networks with hex identifiers from the NetworkController.
 *
 * @param networkConfigurationsByChainId - The network configurations to update.
 * @returns The updated network configurations.
 */
export const toMultichainNetworkConfigurationsByChainId = (
  networkConfigurationsByChainId: Record<string, NetworkConfiguration>,
): Record<CaipChainId, MultichainNetworkConfiguration> =>
  Object.entries(networkConfigurationsByChainId).reduce(
    (acc, [, network]) => ({
      ...acc,
      [toEvmCaipChainId(network.chainId)]:
        toMultichainNetworkConfiguration(network),
    }),
    {},
  );

// TODO: This currently isn't being used anymore but could benefit from being moved to @metamask/utils
/**
 * Type guard to check if a namespace is a known CAIP namespace.
 *
 * @param namespace - The namespace to check
 * @returns Whether the namespace is a known CAIP namespace
 */
export function isKnownCaipNamespace(
  namespace: string,
): namespace is KnownCaipNamespace {
  return Object.values<string>(KnownCaipNamespace).includes(namespace);
}
