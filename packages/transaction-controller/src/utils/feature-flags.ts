import { createModuleLogger, type Hex } from '@metamask/utils';

import { projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';

export const FEATURE_FLAG_EIP_7702 = 'confirmations-eip-7702';

export type TransactionControllerFeatureFlags = {
  [FEATURE_FLAG_EIP_7702]: {
    /**
     * All contract addresses that support EIP-7702 batch transactions.
     * Keyed by chain ID.
     * First address in each array is the contract that standard EOAs will be upgraded to.
     */
    contractAddresses: Record<Hex, Hex[]>;

    /** Chains enabled for EIP-7702 batch transactions. */
    supportedChains: Hex[];
  };
};

const log = createModuleLogger(projectLogger, 'feature-flags');

/**
 * Retrieves the supported EIP-7702 chains.
 *
 * @param messenger - The controller messenger instance.
 * @returns The supported chains.
 */
export function getEIP7702SupportedChains(
  messenger: TransactionControllerMessenger,
): Hex[] {
  const featureFlags = getFeatureFlags(messenger);
  return featureFlags?.[FEATURE_FLAG_EIP_7702]?.supportedChains ?? [];
}

/**
 * Retrieves the supported EIP-7702 contract addresses for a given chain ID.
 *
 * @param chainId - The chain ID.
 * @param messenger - The controller messenger instance.
 * @returns The supported contract addresses.
 */
export function getEIP7702ContractAddresses(
  chainId: Hex,
  messenger: TransactionControllerMessenger,
): Hex[] {
  const featureFlags = getFeatureFlags(messenger);

  return (
    featureFlags?.[FEATURE_FLAG_EIP_7702]?.contractAddresses?.[
      chainId.toLowerCase() as Hex
    ] ?? []
  );
}

/**
 * Retrieves the EIP-7702 upgrade contract address.
 *
 * @param chainId - The chain ID.
 * @param messenger - The controller messenger instance.
 * @returns The upgrade contract address.
 */
export function getEIP7702UpgradeContractAddress(
  chainId: Hex,
  messenger: TransactionControllerMessenger,
): Hex | undefined {
  return getEIP7702ContractAddresses(chainId, messenger)?.[0];
}

/**
 * Retrieves the relevant feature flags from the remote feature flag controller.
 *
 * @param messenger - The messenger instance.
 * @returns The feature flags.
 */
function getFeatureFlags(
  messenger: TransactionControllerMessenger,
): TransactionControllerFeatureFlags {
  const featureFlags = messenger.call(
    'RemoteFeatureFlagController:getState',
  ).remoteFeatureFlags;

  log('Retrieved feature flags', featureFlags);

  return featureFlags as TransactionControllerFeatureFlags;
}
