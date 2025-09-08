import type { GetCapabilitiesResult } from '@metamask/eth-json-rpc-middleware';
import type {
  IsAtomicBatchSupportedResult,
  IsAtomicBatchSupportedResultEntry,
  TransactionController,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { KEYRING_TYPES_SUPPORTING_7702 } from '../constants';
import type { EIP5792Messenger } from '../types';
import { getAccountKeyringType } from '../utils';

/**
 * Type definition for required controller hooks and utilities of {@link getCapabilities}
 */
export type GetCapabilitiesHooks = {
  /** Function to check if smart account suggestions are disabled */
  getDismissSmartAccountSuggestionEnabled: () => boolean;
  /** Function to check if a chain supports smart transactions */
  getIsSmartTransaction: (chainId: Hex) => boolean;
  /** Function to check if atomic batching is supported */
  isAtomicBatchSupported: TransactionController['isAtomicBatchSupported'];
  /** Function to check if relay is supported on a chain */
  isRelaySupported: (chainId: Hex) => Promise<boolean>;
  /** Function to get chains that support send bundle */
  getSendBundleSupportedChains: (
    chainIds: Hex[],
  ) => Promise<Record<string, boolean>>;
};

/**
 * Retrieves the capabilities for atomic transactions on specified chains.
 *
 * @param hooks - Object containing required controller hooks and utilities.
 * @param messenger - Messenger instance for controller communication.
 * @param address - The account address to check capabilities for.
 * @param chainIds - Array of chain IDs to check capabilities for (if undefined, checks all configured networks).
 * @returns Promise resolving to GetCapabilitiesResult mapping chain IDs to their capabilities.
 */
export async function getCapabilities(
  hooks: GetCapabilitiesHooks,
  messenger: EIP5792Messenger,
  address: Hex,
  chainIds: Hex[] | undefined,
) {
  const {
    getDismissSmartAccountSuggestionEnabled,
    getIsSmartTransaction,
    isAtomicBatchSupported,
    isRelaySupported,
    getSendBundleSupportedChains,
  } = hooks;

  let chainIdsNormalized = chainIds?.map(
    (chainId) => chainId.toLowerCase() as Hex,
  );

  if (!chainIdsNormalized?.length) {
    const networkConfigurations = messenger.call(
      'NetworkController:getState',
    ).networkConfigurationsByChainId;
    chainIdsNormalized = Object.keys(networkConfigurations) as Hex[];
  }

  const batchSupport = await isAtomicBatchSupported({
    address,
    chainIds: chainIdsNormalized,
  });

  const alternateGasFeesAcc = await getAlternateGasFeesCapability(
    chainIdsNormalized,
    batchSupport,
    getIsSmartTransaction,
    isRelaySupported,
    getSendBundleSupportedChains,
    messenger,
  );

  return chainIdsNormalized.reduce<GetCapabilitiesResult>((acc, chainId) => {
    const chainBatchSupport = (batchSupport.find(
      ({ chainId: batchChainId }) => batchChainId === chainId,
    ) ?? {}) as IsAtomicBatchSupportedResultEntry & {
      isRelaySupported: boolean;
    };

    const { delegationAddress, isSupported, upgradeContractAddress } =
      chainBatchSupport;

    const isUpgradeDisabled = getDismissSmartAccountSuggestionEnabled();
    let isSupportedAccount = false;

    try {
      const keyringType = getAccountKeyringType(address, messenger);
      isSupportedAccount = KEYRING_TYPES_SUPPORTING_7702.includes(keyringType);
    } catch {
      // Intentionally empty
    }

    const canUpgrade =
      !isUpgradeDisabled &&
      upgradeContractAddress &&
      !delegationAddress &&
      isSupportedAccount;

    if (!isSupported && !canUpgrade) {
      return acc;
    }

    const status = isSupported ? 'supported' : 'ready';

    if (acc[chainId as Hex] === undefined) {
      acc[chainId as Hex] = {};
    }

    acc[chainId as Hex].atomic = {
      status,
    };

    return acc;
  }, alternateGasFeesAcc);
}

/**
 * Determines alternate gas fees capability for the specified chains.
 *
 * @param chainIds - Array of chain IDs to check for alternate gas fees support.
 * @param batchSupport - Information about atomic batch support for each chain.
 * @param getIsSmartTransaction - Function to check if a chain supports smart transactions.
 * @param isRelaySupported - Function to check if relay is supported on a chain.
 * @param getSendBundleSupportedChains - Function to get chains that support send bundle.
 * @param messenger - Messenger instance for controller communication.
 * @returns Promise resolving to GetCapabilitiesResult with alternate gas fees information.
 */
async function getAlternateGasFeesCapability(
  chainIds: Hex[],
  batchSupport: IsAtomicBatchSupportedResult,
  getIsSmartTransaction: (chainId: Hex) => boolean,
  isRelaySupported: (chainId: Hex) => Promise<boolean>,
  getSendBundleSupportedChains: (
    chainIds: Hex[],
  ) => Promise<Record<string, boolean>>,
  messenger: EIP5792Messenger,
) {
  const simulationEnabled = messenger.call(
    'PreferencesController:getState',
  ).useTransactionSimulations;

  const relaySupportedChains = await Promise.all(
    batchSupport
      .map(({ chainId }) => chainId)
      .map((chainId) => isRelaySupported(chainId)),
  );

  const sendBundleSupportedChains =
    await getSendBundleSupportedChains(chainIds);

  const updatedBatchSupport = batchSupport.map((support, index) => ({
    ...support,
    relaySupportedForChain: relaySupportedChains[index],
  }));

  return chainIds.reduce<GetCapabilitiesResult>((acc, chainId) => {
    const chainBatchSupport = (updatedBatchSupport.find(
      ({ chainId: batchChainId }) => batchChainId === chainId,
    ) ?? {}) as IsAtomicBatchSupportedResultEntry & {
      relaySupportedForChain: boolean;
    };

    const { isSupported = false, relaySupportedForChain } = chainBatchSupport;

    const isSmartTransaction = getIsSmartTransaction(chainId);
    const isSendBundleSupported = sendBundleSupportedChains[chainId] ?? false;

    const alternateGasFees =
      simulationEnabled &&
      ((isSmartTransaction && isSendBundleSupported) ||
        (isSupported && relaySupportedForChain));

    if (alternateGasFees) {
      acc[chainId as Hex] = {
        alternateGasFees: {
          supported: true,
        },
      };
    }

    return acc;
  }, {});
}
