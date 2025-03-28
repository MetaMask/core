import { handleFetch } from '@metamask/controller-utils';
import { BtcScope, SolScope } from '@metamask/keyring-api';
import type { NetworkConfiguration } from '@metamask/network-controller';
import {
  type Hex,
  type CaipChainId,
  KnownCaipNamespace,
  toCaipChainId,
  hexToNumber,
} from '@metamask/utils';
import { isAddress as isSolanaAddress } from '@solana/addresses';

import { AVAILABLE_MULTICHAIN_NETWORK_CONFIGURATIONS } from './constants';
import { MULTICHAIN_ACCOUNTS_DOMAIN } from './constants';
import type {
  SupportedCaipChainId,
  MultichainNetworkConfiguration,
  ActiveNetworksByAddress,
  ActiveNetworksResponse,
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
 * Converts a hex chain ID to a Caip chain ID.
 *
 * @param chainId - The hex chain ID to convert.
 * @returns The Caip chain ID.
 */
export const toEvmCaipChainId = (chainId: Hex): CaipChainId =>
  toCaipChainId(KnownCaipNamespace.Eip155, hexToNumber(chainId).toString());

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
  return {
    chainId: toEvmCaipChainId(network.chainId),
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

/**
 * Validates CAIP-10 account IDs format.
 *
 * @param accountIds - Array of account IDs to validate
 * @throws Error if any account ID is invalid
 */
function validateAccountIds(accountIds: string[]): void {
  if (!accountIds.length) {
    throw new Error('At least one account ID is required');
  }

  const caip10Regex = /^(eip155|solana):[0-9]+:0x[0-9a-fA-F]{40}$/u;
  const invalidIds = accountIds.filter((id) => !caip10Regex.test(id));

  if (invalidIds.length > 0) {
    throw new Error(
      `Invalid CAIP-10 account IDs: ${invalidIds.join(', ')}. Expected format: <namespace>:<chainId>:<address>`,
    );
  }
}

/**
 * Constructs the URL for the active networks API endpoint.
 *
 * @param accountIds - Array of account IDs
 * @returns URL object for the API endpoint
 */
function buildActiveNetworksUrl(accountIds: string[]): URL {
  const url = new URL(`${MULTICHAIN_ACCOUNTS_DOMAIN}/v2/activeNetworks`);
  url.searchParams.append('accountIds', accountIds.join(','));
  return url;
}

/**
 * Fetches the active networks for given account IDs.
 *
 * @param accountIds - Array of CAIP-10 account IDs with wildcard chain references
 * @returns Promise resolving to the active networks response
 * @throws Error if the request fails or if account IDs are invalid
 */
export async function fetchNetworkActivityByAccounts(
  accountIds: string[],
): Promise<ActiveNetworksResponse> {
  try {
    validateAccountIds(accountIds);

    const url = buildActiveNetworksUrl(accountIds);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response: ActiveNetworksResponse = await handleFetch(url, {
      signal: controller.signal,
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!Array.isArray(response?.activeNetworks)) {
      throw new Error('Invalid response format from active networks API');
    }

    return response;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout: Failed to fetch active networks');
      }
      throw error;
    }

    throw new Error(`Failed to fetch active networks: ${String(error)}`);
  }
}

/**
 * Formats the API response into our state structure.
 * Example input: ["eip155:1:0x123...", "eip155:137:0x123...", "solana:1:0xabc..."]
 *
 * @param response - The raw API response
 * @returns Formatted networks by address
 */
export function formatNetworkActivityResponse(
  response: ActiveNetworksResponse,
): ActiveNetworksByAddress {
  const networksByAddress: ActiveNetworksByAddress = {};

  response.activeNetworks.forEach((network) => {
    const [namespace, chainId, address] = network.split(':');

    if (!address?.startsWith('0x')) {
      return;
    }

    const hexAddress = address as Hex;
    const caipNamespace = namespace as KnownCaipNamespace;

    if (!networksByAddress[hexAddress]) {
      networksByAddress[hexAddress] = {
        namespace: caipNamespace,
        activeChains: [],
      };
    }

    if (caipNamespace === KnownCaipNamespace.Eip155 && chainId) {
      networksByAddress[hexAddress].activeChains.push(chainId);
    }
  });

  return networksByAddress;
}
