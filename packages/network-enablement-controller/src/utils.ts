import { toHex } from '@metamask/controller-utils';
import { toEvmCaipChainId } from '@metamask/multichain-network-controller';
import type { CaipChainId, CaipNamespace, Hex } from '@metamask/utils';
import {
  isCaipChainId,
  isHexString,
  KnownCaipNamespace,
  parseCaipChainId,
} from '@metamask/utils';

import { POPULAR_NETWORKS } from './constants';
import type { NetworkEnablementControllerState } from './NetworkEnablementController';

/**
 * Represents the parsed keys derived from a chain ID.
 */
export type DerivedKeys = {
  namespace: CaipNamespace;
  storageKey: Hex | CaipChainId;
  caipChainId: CaipChainId;
  reference: string;
};

/**
 * Derives the namespace, storage key, and CAIP chain ID from a given chain ID.
 *
 * This utility function handles the conversion between different chain ID formats.
 * For EVM networks, it converts Hex chain IDs to CAIP-2 format and determines
 * the appropriate storage key. For non-EVM networks, it parses the CAIP-2 chain ID
 * and uses the full chain ID as the storage key.
 *
 * @param chainId - The chain ID to derive keys from (Hex or CAIP-2 format)
 * @returns An object containing namespace, storageKey, and caipId
 * @throws Error if the chain ID cannot be parsed
 */
export function deriveKeys(chainId: Hex | CaipChainId): DerivedKeys {
  const caipChainId = isCaipChainId(chainId)
    ? chainId
    : toEvmCaipChainId(chainId);

  const { namespace, reference } = parseCaipChainId(caipChainId);
  let storageKey;
  if (namespace === (KnownCaipNamespace.Eip155 as string)) {
    storageKey = isHexString(chainId) ? chainId : toHex(reference);
  } else {
    storageKey = caipChainId;
  }
  return { namespace, storageKey, caipChainId, reference };
}

/**
 * Checks if the specified network is the only enabled network in its namespace.
 *
 * This function is used to prevent unnecessary state updates when trying to enable
 * This method is used to prevent the last network in a namespace from being removed.
 *
 * @param state - The current controller state
 * @param derivedKeys - The parsed keys object containing namespace and storageKey
 * @returns True if the network is the only enabled network in the namespace, false otherwise
 */
export function isOnlyNetworkEnabledInNamespace(
  state: NetworkEnablementControllerState,
  derivedKeys: DerivedKeys,
): boolean {
  const { namespace, storageKey } = derivedKeys;

  // Early return if namespace doesn't exist
  if (!state.enabledNetworkMap[namespace]) {
    return false;
  }

  const networks = state.enabledNetworkMap[namespace];

  // Get all enabled networks in this namespace
  const enabledNetworks = Object.entries(networks).filter(
    ([_, enabled]) => enabled,
  );

  // Check if there's exactly one enabled network and it matches our target
  if (enabledNetworks.length === 1) {
    const [onlyEnabledKey] = enabledNetworks[0];
    return onlyEnabledKey === storageKey;
  }

  // Return false if there are zero or multiple enabled networks
  return false;
}

/**
 * Checks if a network is considered popular based on its reference.
 *
 * @param reference - The network reference (typically the chain ID reference part)
 * @returns True if the network is popular, false otherwise
 */
export function isPopularNetwork(reference: string): boolean {
  try {
    return POPULAR_NETWORKS.includes(toHex(reference));
  } catch {
    // If toHex fails (e.g., for non-decimal references like Bitcoin hashes),
    // the network is not popular
    return false;
  }
}
