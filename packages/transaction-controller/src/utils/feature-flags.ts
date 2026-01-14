import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { isValidSignature } from './signature';
import { padHexToEvenLength } from './utils';
import { projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';

const DEFAULT_BATCH_SIZE_LIMIT = 10;
const DEFAULT_ACCELERATED_POLLING_COUNT_MAX = 10;
const DEFAULT_ACCELERATED_POLLING_INTERVAL_MS = 3 * 1000;
const DEFAULT_BLOCK_TIME = 12 * 1000;
const DEFAULT_GAS_ESTIMATE_FALLBACK_BLOCK_PERCENT = 35;
const DEFAULT_GAS_ESTIMATE_BUFFER = 1;
const DEFAULT_INCOMING_TRANSACTIONS_POLLING_INTERVAL_MS = 1000 * 60 * 4; // 4 Minutes

/**
 * Feature flags supporting the transaction controller.
 */
export enum FeatureFlag {
  EIP7702 = 'confirmations_eip_7702',
  GasBuffer = 'confirmations_gas_buffer',
  IncomingTransactions = 'confirmations_incoming_transactions',
  Transactions = 'confirmations_transactions',
}

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
  /** Feature flags to support EIP-7702 / type-4 transactions. */
  [FeatureFlag.EIP7702]?: {
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

  /**
   * Buffers added to gas limit estimations.
   * Values are multipliers such as `1.5` meaning 150% of the original gas limit.
   */
  [FeatureFlag.GasBuffer]?: {
    /** Fallback buffer for all chains and transactions. */
    default?: number;

    /**
     * Buffer for included network RPCs only and not those added by user.
     * Takes priority over `default`.
     */
    included?: number;

    /** Buffers for specific chains. */
    perChainConfig?: {
      [chainId: Hex]: {
        /**
         * Buffer for the chain for all transactions.
         * Takes priority over non-chain `included`.
         */
        base?: number;

        /**
         * Buffer if network RPC is included and not added by user.
         * Takes priority over `base`.
         */
        included?: number;

        /**
         * Buffer for the chain for EIP-7702 / type 4 transactions only.
         * Only if `data` included and `to` matches `from`.
         * Takes priority over `included` and `base`.
         */
        eip7702?: number;
      };
    };
  };

  /** Incoming transaction configuration. */
  [FeatureFlag.IncomingTransactions]?: {
    /** Interval between requests to accounts API to retrieve incoming transactions. */
    pollingIntervalMs?: number;
  };

  /** Miscellaneous feature flags to support the transaction controller. */
  [FeatureFlag.Transactions]?: {
    /** Maximum number of transactions that can be in an external batch. */
    batchSizeLimit?: number;

    /**
     * Accelerated polling is used to speed up the polling process for
     * transactions that are not yet confirmed.
     */
    acceleratedPolling?: {
      /** Accelerated polling parameters on a per-chain basis. */
      perChainConfig?: {
        [chainId: Hex]: {
          /**
           * Block time in milliseconds.
           */
          blockTime?: number;

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

    /**
     * Number of attempts to wait before automatically marking a transaction as failed
     * if it has no receipt status and hash is not found on the network.
     */
    timeoutAttempts?: {
      /** Automatic fail threshold on a per-chain basis. */
      perChainConfig?: {
        [chainId: Hex]: number;
      };

      /**
       * Default automatic fail threshold.
       * This value is used when no specific threshold is found for a chain ID.
       */
      default?: number;
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
  return featureFlags?.[FeatureFlag.EIP7702]?.supportedChains ?? [];
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
    featureFlags?.[FeatureFlag.EIP7702]?.contracts?.[
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
    featureFlags?.[FeatureFlag.Transactions]?.batchSizeLimit ??
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
): { blockTime: number; countMax: number; intervalMs: number } {
  const featureFlags = getFeatureFlags(messenger);

  const acceleratedPollingParams =
    featureFlags?.[FeatureFlag.Transactions]?.acceleratedPolling;

  const countMax =
    acceleratedPollingParams?.perChainConfig?.[chainId]?.countMax ??
    acceleratedPollingParams?.defaultCountMax ??
    DEFAULT_ACCELERATED_POLLING_COUNT_MAX;

  const intervalMs =
    acceleratedPollingParams?.perChainConfig?.[chainId]?.intervalMs ??
    acceleratedPollingParams?.defaultIntervalMs ??
    DEFAULT_ACCELERATED_POLLING_INTERVAL_MS;

  const blockTime =
    acceleratedPollingParams?.perChainConfig?.[chainId]?.blockTime ??
    DEFAULT_BLOCK_TIME;

  return { blockTime, countMax, intervalMs };
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
    featureFlags?.[FeatureFlag.Transactions]?.gasFeeRandomisation ?? {};

  return {
    randomisedGasFeeDigits: gasFeeRandomisation.randomisedGasFeeDigits ?? {},
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
    featureFlags?.[FeatureFlag.Transactions]?.gasEstimateFallback;

  const chainFlags = gasEstimateFallbackFlags?.perChainConfig?.[chainId];

  const percentage =
    chainFlags?.percentage ??
    gasEstimateFallbackFlags?.default?.percentage ??
    DEFAULT_GAS_ESTIMATE_FALLBACK_BLOCK_PERCENT;

  const fixed = chainFlags?.fixed ?? gasEstimateFallbackFlags?.default?.fixed;

  return { fixed, percentage };
}

/**
 * Retrieves the gas buffers for a given chain ID.
 *
 * @param request - The request object.
 * @param request.chainId - The chain ID.
 * @param request.isCustomRPC - Whether the network RPC is added by the user.
 * @param request.isUpgradeWithDataToSelf - Whether the transaction is an EIP-7702 upgrade with data to self.
 * @param request.messenger - The controller messenger instance.
 * @returns The gas buffers.
 */
export function getGasEstimateBuffer({
  chainId,
  isCustomRPC,
  isUpgradeWithDataToSelf,
  messenger,
}: {
  chainId: Hex;
  isCustomRPC: boolean;
  isUpgradeWithDataToSelf: boolean;
  messenger: TransactionControllerMessenger;
}): number {
  const featureFlags = getFeatureFlags(messenger);
  const gasBufferFlags = featureFlags?.[FeatureFlag.GasBuffer];
  const chainFlags = gasBufferFlags?.perChainConfig?.[chainId];
  const chainIncludedRPCBuffer = isCustomRPC ? undefined : chainFlags?.included;

  const defaultIncludedRPCBuffer = isCustomRPC
    ? undefined
    : gasBufferFlags?.included;

  const upgradeBuffer = isUpgradeWithDataToSelf
    ? chainFlags?.eip7702
    : undefined;

  return (
    upgradeBuffer ??
    chainIncludedRPCBuffer ??
    chainFlags?.base ??
    defaultIncludedRPCBuffer ??
    gasBufferFlags?.default ??
    DEFAULT_GAS_ESTIMATE_BUFFER
  );
}

/**
 * Retrieves the incoming transactions polling interval.
 * Defaults to 4 minutes if not set.
 *
 * @param messenger - The controller messenger instance.
 * @returns The incoming transactions polling interval in milliseconds.
 */
export function getIncomingTransactionsPollingInterval(
  messenger: TransactionControllerMessenger,
): number {
  const featureFlags = getFeatureFlags(messenger);

  return (
    featureFlags?.[FeatureFlag.IncomingTransactions]?.pollingIntervalMs ??
    DEFAULT_INCOMING_TRANSACTIONS_POLLING_INTERVAL_MS
  );
}

/**
 * Retrieves the number of attempts to wait before automatically marking a transaction as dropped
 * if it has no receipt status.
 *
 * @param chainId - The chain ID.
 * @param messenger - The controller messenger instance.
 * @returns The threshold number of attempts, or undefined if the feature is disabled.
 */
export function getTimeoutAttempts(
  chainId: Hex,
  messenger: TransactionControllerMessenger,
): number | undefined {
  const featureFlags = getFeatureFlags(messenger);

  const timeoutAttemptsFlags =
    featureFlags?.[FeatureFlag.Transactions]?.timeoutAttempts;

  return (
    timeoutAttemptsFlags?.perChainConfig?.[chainId] ??
    timeoutAttemptsFlags?.default
  );
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
