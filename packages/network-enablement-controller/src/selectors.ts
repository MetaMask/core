import { toHex } from '@metamask/controller-utils';
import { toEvmCaipChainId } from '@metamask/multichain-network-controller';
import type { CaipChainId, CaipNamespace, Hex } from '@metamask/utils';
import {
  isHexString,
  parseCaipChainId,
  KnownCaipNamespace,
} from '@metamask/utils';
import { createSelector } from 'reselect';

import type { NetworkEnablementControllerState } from './NetworkEnablementController';

/**
 * Base selector to get the enabled network map from the controller state.
 *
 * @param state - The NetworkEnablementController state
 * @returns The enabled network map
 */
export const selectEnabledNetworkMap = (
  state: NetworkEnablementControllerState,
) => state.enabledNetworkMap;

/**
 * Selector to check if a specific network is enabled.
 *
 * This selector accepts either a Hex chain ID (for EVM networks) or a CAIP-2 chain ID
 * (for any blockchain network) and returns whether the network is currently enabled.
 * It returns false for unknown networks or if there's an error parsing the chain ID.
 *
 * @param chainId - The chain ID to check (Hex or CAIP-2 format)
 * @returns A selector function that returns true if the network is enabled, false otherwise
 */
export const selectIsNetworkEnabled = (chainId: Hex | CaipChainId) =>
  createSelector(selectEnabledNetworkMap, (enabledNetworkMap) => {
    try {
      const caipId: CaipChainId = isHexString(chainId)
        ? toEvmCaipChainId(chainId as Hex)
        : (chainId as CaipChainId);
      const { namespace, reference } = parseCaipChainId(caipId);
      let storageKey: string;
      if (namespace === (KnownCaipNamespace.Eip155 as string)) {
        storageKey = isHexString(chainId)
          ? (chainId as string)
          : toHex(reference);
      } else {
        storageKey = caipId;
      }
      return (
        namespace in enabledNetworkMap &&
        storageKey in enabledNetworkMap[namespace]
      );
    } catch {
      return false;
    }
  });

/**
 * Selector builder to get all enabled networks for a specific namespace.
 *
 * The selector returned by this function returns an array of chain IDs (as strings) for all enabled networks
 * within the specified namespace (e.g., 'eip155' for EVM networks, 'solana' for Solana).
 *
 * @param namespace - The CAIP namespace to get enabled networks for (e.g., 'eip155', 'solana')
 * @returns A selector function that returns an array of chain ID strings for enabled networks in the namespace
 */
export const createSelectorForEnabledNetworksForNamespace = (
  namespace: CaipNamespace,
) =>
  createSelector(selectEnabledNetworkMap, (enabledNetworkMap) => {
    return Object.entries(enabledNetworkMap[namespace] ?? {})
      .filter(([, enabled]) => enabled)
      .map(([id]) => id);
  });

/**
 * Selector to get all enabled networks across all namespaces.
 *
 * This selector returns a record where keys are CAIP namespaces and values are arrays
 * of enabled chain IDs within each namespace.
 *
 * @returns A selector function that returns a record mapping namespace to array of enabled chain IDs
 */
export const selectAllEnabledNetworks = createSelector(
  selectEnabledNetworkMap,
  (enabledNetworkMap) => {
    return (Object.keys(enabledNetworkMap) as CaipNamespace[]).reduce(
      (acc, ns) => {
        acc[ns] = Object.entries(enabledNetworkMap[ns] ?? {})
          .filter(([, enabled]) => enabled)
          .map(([id]) => id);
        return acc;
      },
      {} as Record<CaipNamespace, string[]>,
    );
  },
);

/**
 * Selector to get the total count of enabled networks across all namespaces.
 *
 * @returns A selector function that returns the total number of enabled networks
 */
export const selectEnabledNetworksCount = createSelector(
  selectAllEnabledNetworks,
  (allEnabledNetworks) => {
    return Object.values(allEnabledNetworks).flat().length;
  },
);

/**
 * Selector to get all enabled EVM networks.
 *
 * This is a convenience selector that specifically targets EIP-155 networks.
 *
 * @returns A selector function that returns an array of enabled EVM chain IDs
 */
export const selectEnabledEvmNetworks = createSelector(
  createSelectorForEnabledNetworksForNamespace(KnownCaipNamespace.Eip155),
  (enabledEvmNetworks) => enabledEvmNetworks,
);

/**
 * Selector to get all enabled Solana networks.
 *
 * This is a convenience selector that specifically targets Solana networks.
 *
 * @returns A selector function that returns an array of enabled Solana chain IDs
 */
export const selectEnabledSolanaNetworks = createSelector(
  createSelectorForEnabledNetworksForNamespace(KnownCaipNamespace.Solana),
  (enabledSolanaNetworks) => enabledSolanaNetworks,
);
