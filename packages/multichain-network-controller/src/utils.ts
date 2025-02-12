import { BtcScope, SolScope } from '@metamask/keyring-api';
import type { NetworkConfiguration } from '@metamask/network-controller';
import {
  type CaipChainId,
  KnownCaipNamespace,
  toCaipChainId,
  hexToNumber,
} from '@metamask/utils';
import { isAddress as isSolanaAddress } from '@solana/addresses';

import { AVAILABLE_MULTICHAIN_NETWORK_CONFIGURATIONS } from './constants';
import type {
  SupportedCaipChainId,
  MultichainNetworkConfiguration,
} from './types';

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
 * Updates a network configuration to the format used by the MultichainNetworkController.
 * This method is exclusive for EVM networks with hex identifiers from the NetworkController.
 *
 * @param network - The network configuration to update.
 * @returns The updated network configuration.
 */
export const updateNetworkConfiguration = (
  network: NetworkConfiguration,
): MultichainNetworkConfiguration => {
  return {
    chainId: toCaipChainId(
      KnownCaipNamespace.Eip155,
      hexToNumber(network.chainId).toString(),
    ),
    isEvm: true,
    name: network.name,
    nativeCurrency: network.nativeCurrency,
    blockExplorerUrls: network.blockExplorerUrls,
    defaultBlockExplorerUrlIndex: network.defaultBlockExplorerUrlIndex || 0,
  };
};

/**
 * Updates a record of network configurations to the format used by the MultichainNetworkController.
 * This method is exclusive for EVM networks with hex identifiers from the NetworkController.
 *
 * @param networkConfigurationsByChainId - The network configurations to update.
 * @returns The updated network configurations.
 */
export const updateNetworkConfigurations = (
  networkConfigurationsByChainId: Record<string, NetworkConfiguration>,
): Record<CaipChainId, MultichainNetworkConfiguration> =>
  Object.entries(networkConfigurationsByChainId).reduce(
    (acc, [chainId, network]) => ({
      ...acc,
      [toCaipChainId(
        KnownCaipNamespace.Eip155,
        hexToNumber(chainId).toString(),
      )]: updateNetworkConfiguration(network),
    }),
    {},
  );
