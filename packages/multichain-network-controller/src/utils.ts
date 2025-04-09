import { BtcScope, SolScope, EthScope } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { isBtcMainnetAddress } from '@metamask/keyring-utils';
import type { NetworkConfiguration } from '@metamask/network-controller';
import {
  type Hex,
  type CaipChainId,
  type CaipAccountId,
  KnownCaipNamespace,
  toCaipChainId,
  parseCaipChainId,
  hexToNumber,
  add0x,
  parseCaipAccountId,
  isValidHexAddress,
} from '@metamask/utils';
import { isAddress as isSolanaAddress } from '@solana/addresses';
import log from 'loglevel';

import {
  AVAILABLE_MULTICHAIN_NETWORK_CONFIGURATIONS,
  MULTICHAIN_ALLOWED_ACTIVE_NETWORK_SCOPES,
} from './constants';
import { MULTICHAIN_ACCOUNTS_BASE_URL } from './constants';
import type {
  SupportedCaipChainId,
  MultichainNetworkConfiguration,
  ActiveNetworksByAddress,
  ActiveNetworksResponse,
} from './types';

/**
 * The type of chain.
 */
export enum ChainType {
  Evm = 'Evm',
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

// TODO: Move this function to @metamask/utils
/**
 * Type guard to check if a namespace is a known CAIP namespace.
 *
 * @param namespace - The namespace to check
 * @returns Whether the namespace is a known CAIP namespace
 */
function isKnownCaipNamespace(
  namespace: string,
): namespace is KnownCaipNamespace {
  return Object.values<string>(KnownCaipNamespace).includes(namespace);
}

/**
 * Validates CAIP-10 account IDs format.
 *
 * @param accountIds - Array of account IDs to validate
 * @throws Error if any account ID is invalid
 */
export function assertCaipAccountIds(
  accountIds: string[],
): asserts accountIds is CaipAccountId[] {
  if (!accountIds.length) {
    throw new Error('At least one account ID is required');
  }

  const invalidIds = accountIds.filter((id) => {
    const {
      address,
      chain: { namespace },
    } = parseCaipAccountId(id as CaipAccountId);

    if (!isKnownCaipNamespace(namespace)) {
      return true;
    }

    switch (namespace) {
      case KnownCaipNamespace.Eip155:
        return !isValidHexAddress(address as Hex);
      case KnownCaipNamespace.Solana:
        return !isSolanaAddress(address);
      case KnownCaipNamespace.Bip122:
        return !isBtcMainnetAddress(address);
      default:
        return true;
    }
  });

  if (invalidIds.length > 0) {
    const error = `Invalid CAIP-10 account IDs: ${invalidIds.join(', ')}`;
    log.error('Account ID validation failed: invalid CAIP-10 format', {
      invalidIds,
    });
    throw new Error(error);
  }
}

/**
 * Constructs the URL for the active networks API endpoint.
 *
 * @param accountIds - Array of account IDs
 * @returns URL object for the API endpoint
 */
export function buildActiveNetworksUrl(accountIds: CaipAccountId[]): URL {
  const url = new URL(`${MULTICHAIN_ACCOUNTS_BASE_URL}/v2/activeNetworks`);
  url.searchParams.append('accountIds', accountIds.join(','));
  return url;
}

/**
 * Formats the API response into our state structure.
 * Example input: ["eip155:1:0x123...", "eip155:137:0x123...", "solana:1:0xabc..."]
 *
 * @param response - The raw API response
 * @returns Formatted networks by address
 */
export function toActiveNetworksByAddress(
  response: ActiveNetworksResponse,
): ActiveNetworksByAddress {
  const networksByAddress: ActiveNetworksByAddress = {};

  response.activeNetworks.forEach((network) => {
    const {
      address,
      chain: { namespace, reference },
    } = parseCaipAccountId(network as CaipAccountId);

    if (!networksByAddress[address]) {
      networksByAddress[address] = {
        namespace,
        activeChains: [],
      };
    }
    networksByAddress[address].activeChains.push(reference);
  });

  return networksByAddress;
}

/**
 * Converts an internal account to an array of CAIP-10 account IDs.
 *
 * @param account - The internal account to convert
 * @returns The CAIP-10 account IDs
 */
export function toAllowedCaipAccountIds(
  account: InternalAccount,
): CaipAccountId[] {
  const formattedAccounts: CaipAccountId[] = [];
  for (const scope of account.scopes) {
    if (MULTICHAIN_ALLOWED_ACTIVE_NETWORK_SCOPES.includes(scope)) {
      formattedAccounts.push(`${scope}:${account.address}`);
    }
  }

  return formattedAccounts;
}
