import { createModuleLogger, type Hex } from '@metamask/utils';

import { isValidSignature } from './signature';
import { projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';

export const FEATURE_FLAG_TRANSACTIONS = 'confirmations_transactions';
export const FEATURE_FLAG_EIP_7702 = 'confirmations_eip_7702';

const DEFAULT_BATCH_SIZE_LIMIT = 10;
const DEFAULT_GAS_ESTIMATE_FALLBACK_BLOCK_PERCENT = 35;

type GasEstimateFallback = {
  /**
   * The fallback gas estimate for a transaction.
   * This value is either a fixed hexadecimal number or a percentage multiplier.
   */
  value: number | Hex;

  /**
   * Indicates whether the gas estimate is a fixed hexadecimal number or a percentage multiplier.
   * - `true`: The gas estimate is a fixed hexadecimal number.
   * - `false`: The gas estimate is a percentage multiplier.
   */
  isFixedGas: boolean;
};

export type TransactionControllerFeatureFlags = {
  [FEATURE_FLAG_EIP_7702]?: {
    /**
     * All contracts that support EIP-7702 batch transactions.
     * Keyed by chain ID.
     * First entry in each array is the contract that standard EOAs will be upgraded to.
     */
    contracts?: Record<
      Hex,
      {
        /** Address of the smart contract. */
        address: Hex;

        /** Signature to verify the contract is authentic. */
        signature: Hex;
      }[]
    >;

    /** Chains enabled for EIP-7702 batch transactions. */
    supportedChains?: Hex[];
  };

  [FEATURE_FLAG_TRANSACTIONS]?: {
    /** Maximum number of transactions that can be in an external batch. */
    batchSizeLimit?: number;

    /** Fallback gas estimation configurations per chain. */
    gasEstimateFallbacks?: {
      [chainId: Hex]: GasEstimateFallback;
    };

    /**
     * Default gas estimate fallback.
     * This value is used when no specific gas estimate fallback is found for a chain ID.
     */
    defaultGasEstimateFallback?: GasEstimateFallback;
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
 * @param publicKey - The public key used to validate the contract authenticity.
 * @returns The supported contract addresses.
 */
export function getEIP7702ContractAddresses(
  chainId: Hex,
  messenger: TransactionControllerMessenger,
  publicKey: Hex,
): Hex[] {
  const featureFlags = getFeatureFlags(messenger);

  const contracts =
    featureFlags?.[FEATURE_FLAG_EIP_7702]?.contracts?.[
      chainId.toLowerCase() as Hex
    ] ?? [];

  return contracts
    .filter((contract) =>
      isValidSignature(
        [contract.address, chainId],
        contract.signature,
        publicKey,
      ),
    )
    .map((contract) => contract.address);
}

/**
 * Retrieves the EIP-7702 upgrade contract address.
 *
 * @param chainId - The chain ID.
 * @param messenger - The controller messenger instance.
 * @param publicKey - The public key used to validate the contract authenticity.
 * @returns The upgrade contract address.
 */
export function getEIP7702UpgradeContractAddress(
  chainId: Hex,
  messenger: TransactionControllerMessenger,
  publicKey: Hex,
): Hex | undefined {
  return getEIP7702ContractAddresses(chainId, messenger, publicKey)?.[0];
}

/**
 * Retrieves the batch size limit.
 * Defaults to 10 if not set.
 *
 * @param messenger - The controller messenger instance.
 * @returns  The batch size limit.
 */
export function getBatchSizeLimit(
  messenger: TransactionControllerMessenger,
): number {
  const featureFlags = getFeatureFlags(messenger);
  return (
    featureFlags?.[FEATURE_FLAG_TRANSACTIONS]?.batchSizeLimit ??
    DEFAULT_BATCH_SIZE_LIMIT
  );
}

/**
 * Retrieves the gas estimate fallback for a given chain ID.
 * Defaults to the default gas estimate fallback if not set.
 *
 * @param chainId - The chain ID.
 * @param messenger - The controller messenger instance.
 * @returns The gas estimate fallback.
 */
export function getGasEstimateFallback(
  chainId: Hex,
  messenger: TransactionControllerMessenger,
): {
  gasEstimateFallback: number | Hex;
  isFixedGas: boolean;
} {
  const featureFlags = getFeatureFlags(messenger);

  const gasEstimateFallbackPerChain =
    featureFlags?.[FEATURE_FLAG_TRANSACTIONS]?.gasEstimateFallbacks?.[chainId];

  if (gasEstimateFallbackPerChain) {
    return {
      gasEstimateFallback: gasEstimateFallbackPerChain.value,
      isFixedGas: gasEstimateFallbackPerChain.isFixedGas,
    };
  }

  return getDefaultGasEstimateFallback(messenger);
}

/**
 * Retrieves the default gas estimate fallback.
 *
 * @param messenger - The controller messenger instance.
 * @returns The default gas estimate fallback.
 */
export function getDefaultGasEstimateFallback(
  messenger: TransactionControllerMessenger,
): {
  gasEstimateFallback: number | Hex;
  isFixedGas: boolean;
} {
  const featureFlags = getFeatureFlags(messenger);

  const defaultGasEstimateFallback =
    featureFlags?.[FEATURE_FLAG_TRANSACTIONS]?.defaultGasEstimateFallback;

  return {
    gasEstimateFallback:
      defaultGasEstimateFallback?.value ??
      DEFAULT_GAS_ESTIMATE_FALLBACK_BLOCK_PERCENT,
    isFixedGas: defaultGasEstimateFallback?.isFixedGas ?? false,
  };
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
