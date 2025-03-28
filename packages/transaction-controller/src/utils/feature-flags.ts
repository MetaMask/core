import { createModuleLogger, type Hex } from '@metamask/utils';

import { isValidSignature } from './signature';
import { padHexToEvenLength } from './utils';
import { projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';

export const FEATURE_FLAG_TRANSACTIONS = 'confirmations_transactions';
export const FEATURE_FLAG_EIP_7702 = 'confirmations_eip_7702';

const DEFAULT_BATCH_SIZE_LIMIT = 10;
const DEFAULT_ACCELERATED_POLLING_COUNT_MAX = 10;
const DEFAULT_ACCELERATED_POLLING_INTERVAL_MS = 3 * 1000;
const DEFAULT_GAS_ESTIMATE_FALLBACK_BLOCK_PERCENT = 35;

type GasEstimateFallback = {
  /**
   * The fixed gas estimate fallback for a transaction.
   */
  fixed?: number;

  /**
   * The percentage multiplier gas estimate fallback for a transaction.
   */
  percentage?: number;
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

    acceleratedPolling?: {
      /**
       * Accelerated polling is used to speed up the polling process for
       * transactions that are not yet confirmed.
       */
      perChainConfig?: {
        /** Accelerated polling parameters on a per-chain basis. */
        [chainId: Hex]: {
          /**
           * Maximum number of polling requests that can be made in a row, before
           * the normal polling resumes.
           */
          countMax?: number;

          /** Interval between polling requests in milliseconds. */
          intervalMs?: number;
        };
      };

      /** Default `countMax` in case no chain-specific parameter is set. */
      defaultCountMax?: number;

      /** Default `intervalMs` in case no chain-specific parameter is set. */
      defaultIntervalMs?: number;
    };

    gasFeeRandomisation?: {
      /** Randomised gas fee digits per chainId. */
      randomisedGasFeeDigits?: Record<Hex, number>;

      /** Number of digits to preserve for randomised gas fee digits. */
      preservedNumberOfDigits?: number;
    };

    /** Gas estimate fallback is used as a fallback in case of failure to obtain the gas estimate values. */
    gasEstimateFallback?: {
      /** Gas estimate fallback per-chain basis. */
      perChainConfig?: {
        [chainId: Hex]: GasEstimateFallback;
      };

      /**
       * Default gas estimate fallback.
       * This value is used when no specific gas estimate fallback is found for a chain ID.
       */
      default?: GasEstimateFallback;
    };
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
        [contract.address, padHexToEvenLength(chainId) as Hex],
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
 * Retrieves the accelerated polling parameters for a given chain ID.
 *
 * @param chainId - The chain ID.
 * @param messenger - The controller messenger instance.
 * @returns The accelerated polling parameters: `countMax` and `intervalMs`.
 */
export function getAcceleratedPollingParams(
  chainId: Hex,
  messenger: TransactionControllerMessenger,
): { countMax: number; intervalMs: number } {
  const featureFlags = getFeatureFlags(messenger);

  const acceleratedPollingParams =
    featureFlags?.[FEATURE_FLAG_TRANSACTIONS]?.acceleratedPolling;

  const countMax =
    acceleratedPollingParams?.perChainConfig?.[chainId]?.countMax ||
    acceleratedPollingParams?.defaultCountMax ||
    DEFAULT_ACCELERATED_POLLING_COUNT_MAX;

  const intervalMs =
    acceleratedPollingParams?.perChainConfig?.[chainId]?.intervalMs ||
    acceleratedPollingParams?.defaultIntervalMs ||
    DEFAULT_ACCELERATED_POLLING_INTERVAL_MS;

  return { countMax, intervalMs };
}

/**
 * Retrieves the gas fee randomisation parameters.
 *
 * @param messenger - The controller messenger instance.
 * @returns The gas fee randomisation parameters.
 */
export function getGasFeeRandomisation(
  messenger: TransactionControllerMessenger,
): {
  randomisedGasFeeDigits: Record<Hex, number>;
  preservedNumberOfDigits: number | undefined;
} {
  const featureFlags = getFeatureFlags(messenger);

  const gasFeeRandomisation =
    featureFlags?.[FEATURE_FLAG_TRANSACTIONS]?.gasFeeRandomisation || {};

  return {
    randomisedGasFeeDigits: gasFeeRandomisation.randomisedGasFeeDigits || {},
    preservedNumberOfDigits: gasFeeRandomisation.preservedNumberOfDigits,
  };
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
  fixed?: number;
  percentage: number;
} {
  const featureFlags = getFeatureFlags(messenger);

  const gasEstimateFallbackFlags =
    featureFlags?.[FEATURE_FLAG_TRANSACTIONS]?.gasEstimateFallback;

  const chainFlags = gasEstimateFallbackFlags?.perChainConfig?.[chainId];

  const percentage =
    chainFlags?.percentage ??
    gasEstimateFallbackFlags?.default?.percentage ??
    DEFAULT_GAS_ESTIMATE_FALLBACK_BLOCK_PERCENT;

  const fixed = chainFlags?.fixed ?? gasEstimateFallbackFlags?.default?.fixed;

  return { fixed, percentage };
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
