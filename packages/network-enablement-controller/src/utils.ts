import { toHex } from '@metamask/controller-utils';
import { toEvmCaipChainId } from '@metamask/multichain-network-controller';
import type { CaipChainId, CaipNamespace, Hex } from '@metamask/utils';
import {
  isCaipChainId,
  isHexString,
  KnownCaipNamespace,
  parseCaipChainId,
} from '@metamask/utils';

import type { NetworkEnablementControllerState } from './NetworkEnablementController';

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
export function deriveKeys(chainId: Hex | CaipChainId) {
  const caipId: CaipChainId = isCaipChainId(chainId)
    ? chainId
    : toEvmCaipChainId(chainId);
  const { namespace, reference } = parseCaipChainId(caipId);
  let storageKey: string;
  if (namespace === (KnownCaipNamespace.Eip155 as string)) {
    storageKey = isHexString(chainId) ? chainId : toHex(reference);
  } else {
    storageKey = caipId;
  }
  return { namespace, storageKey, caipId, reference };
}

/**
 * Checks if the specified network is the only enabled network in its namespace.
 *
 * This function is used to prevent unnecessary state updates when trying to enable
 * This method is used to prevent the last network in a namespace from being removed.
 *
 * @param state - The current controller state
 * @param namespace - The namespace to check
 * @param chainIdToCheck - The chain ID to check if it's the only enabled network
 * @returns True if the network is the only enabled network in the namespace, false otherwise
 */
export function isOnlyNetworkEnabledInNamespace(
  state: NetworkEnablementControllerState,
  namespace: CaipNamespace,
  chainIdToCheck: Hex | CaipChainId,
): boolean {
  // Early return if namespace doesn't exist
  if (!state.enabledNetworkMap[namespace]) {
    return false;
  }

  // Parse the chain ID to get the storage key
  const caipId = isCaipChainId(chainIdToCheck)
    ? chainIdToCheck
    : toEvmCaipChainId(chainIdToCheck);

  const { namespace: parsedNamespace, storageKey: targetStorageKey } =
    deriveKeys(caipId);

  // Early return if namespaces don't match
  if (parsedNamespace !== namespace) {
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
    return onlyEnabledKey === targetStorageKey;
  }

  // Return false if there are zero or multiple enabled networks
  return false;
}
