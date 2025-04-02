import { handleFetch } from '@metamask/controller-utils';
import {
  type KeyringAccountType,
  BtcScope,
  SolScope,
  BtcAccountType,
  EthAccountType,
  SolAccountType,
} from '@metamask/keyring-api';
import type { NetworkConfiguration } from '@metamask/network-controller';
import {
  type Hex,
  type CaipChainId,
  type CaipAccountAddress,
  KnownCaipNamespace,
  toCaipChainId,
  parseCaipChainId,
  hexToNumber,
  add0x,
} from '@metamask/utils';
import { isAddress as isSolanaAddress } from '@solana/addresses';

import {
  AVAILABLE_MULTICHAIN_NETWORK_CONFIGURATIONS,
  CAIP_ACCOUNT_PREFIXES,
} from './constants';
import {
  MULTICHAIN_ACCOUNTS_DOMAIN,
  MULTICHAIN_ACCOUNTS_CLIENT_HEADER,
  MULTICHAIN_ACCOUNTS_CLIENT_ID,
} from './constants';
import type {
  SupportedCaipChainId,
  MultichainNetworkConfiguration,
  ActiveNetworksByAddress,
  ActiveNetworksResponse,
  NetworkStringComponents,
} from './types';

/**
 * The type of chain.
 */
export enum ChainType {
  EVM = 'EVM',
  Solana = 'Solana',
  Bitcoin = 'Bitcoin',
}

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

/**
 * Validates CAIP-10 account IDs format.
 *
 * @param accountIds - Array of account IDs to validate
 * @throws Error if any account ID is invalid
 */
export function validateAccountIds(accountIds: string[]): void {
  if (!accountIds.length) {
    throw new Error('At least one account ID is required');
  }

  const caip10Regex =
    /^(eip155:[0-9]+:0x[0-9a-fA-F]{40}|solana:[0-9]+:[1-9A-HJ-NP-Za-km-z]{32,44}|bip122:[0-9]+:(1|3|bc1)[a-zA-Z0-9]{25,62})$/u;
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
export function buildActiveNetworksUrl(accountIds: string[]): URL {
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

    const response: ActiveNetworksResponse = await handleFetch(url, {
      method: 'GET',
      headers: {
        [MULTICHAIN_ACCOUNTS_CLIENT_HEADER]: MULTICHAIN_ACCOUNTS_CLIENT_ID,
        Accept: 'application/json',
      },
    });

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
 * Parses a network string in the format "namespace:chainId:address".
 *
 * @param network - The network string to parse
 * @returns The parsed components or null if invalid
 */
export function parseNetworkString(
  network: string,
): NetworkStringComponents | null {
  const [namespace, chainId, address] = network.split(':');

  if (!namespace || !address) {
    return null;
  }

  // Validate address format based on namespace
  switch (namespace as KnownCaipNamespace) {
    case KnownCaipNamespace.Eip155:
      if (!address.startsWith('0x') || !/^0x[0-9a-fA-F]{40}$/u.test(address)) {
        return null;
      }
      break;
    case KnownCaipNamespace.Solana:
      if (!isSolanaAddress(address)) {
        return null;
      }
      break;
    case KnownCaipNamespace.Bip122:
      // Bitcoin addresses can be legacy, segwit, or native segwit
      // Need a utility function to validate bitcoin addresses
      if (!/^(1|3|bc1)[a-zA-Z0-9]{25,62}$/u.test(address)) {
        return null;
      }
      break;
    default:
      return null;
  }

  return {
    namespace: namespace as KnownCaipNamespace,
    chainId: chainId || '',
    address: address as Hex,
  };
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
    const components = parseNetworkString(network);
    if (!components) {
      return;
    }

    const { namespace, chainId, address } = components;

    if (!networksByAddress[address]) {
      networksByAddress[address] = {
        namespace,
        activeChains: [],
      };
    }

    // Only add chainId to activeChains for EVM networks (non-EVM networks are not supported yet)
    if (namespace === KnownCaipNamespace.Eip155 && chainId) {
      networksByAddress[address].activeChains.push(chainId);
    }
  });

  return networksByAddress;
}

/**
 * Formats an account address with its corresponding CAIP prefix. Used to format the account IDs for the active networks API.
 *
 * @param address - The account address
 * @param chainType - The type of chain (EVM, BTC, or SOLANA)
 * @returns The formatted CAIP-10 account identifier
 */
export function formatCaipAccountId(
  address: CaipAccountAddress,
  chainType: ChainType,
): string {
  switch (chainType) {
    case ChainType.EVM:
      return `${CAIP_ACCOUNT_PREFIXES.EVM}${address}`;
    case ChainType.Bitcoin:
      return `${CAIP_ACCOUNT_PREFIXES.BTC}${address}`;
    case ChainType.Solana:
      return `${CAIP_ACCOUNT_PREFIXES.SOLANA}${address}`;
    default:
      throw new Error('Unsupported chain type');
  }
}

/**
 * Checks account type and returns the corresponding chain type.
 *
 * @param accountType - The account type to check
 * @returns The chain type
 */
export function getChainTypeFromAccountType(
  accountType: KeyringAccountType,
): ChainType {
  switch (accountType) {
    case EthAccountType.Eoa:
    case EthAccountType.Erc4337:
      return ChainType.EVM;
    case BtcAccountType.P2wpkh:
      return ChainType.Bitcoin;
    case SolAccountType.DataAccount:
      return ChainType.Solana;
    default:
      throw new Error(`Unsupported account type: ${accountType}`);
  }
}
