import type { NetworkClientId } from '@metamask/network-controller';
import { SentinelCancellationReason } from '@metamask/sentinel-api-service';
import type {
  SentinelMeta,
  SentinelMinedTxStatus,
  SentinelOriginalTransactionStatus,
} from '@metamask/sentinel-api-service';
import type { CaipChainId, Hex } from '@metamask/utils';

import type { SmartTransactionsNetworkConfig } from './featureFlags/index.js';

/** SmartTransactions */
export enum SmartTransactionStatuses {
  PENDING = 'pending',
  SUCCESS = 'success',
  REVERTED = 'reverted',
  UNKNOWN = 'unknown',
  CANCELLED = 'cancelled',
  CANCELLED_USER_CANCELLED = 'cancelled_user_cancelled',
  RESOLVED = 'resolved',
}

export enum ClientId {
  Mobile = 'mobile',
  Extension = 'extension',
}

export const cancellationReasonToStatusMap = {
  [SentinelCancellationReason.WouldRevert]: SmartTransactionStatuses.CANCELLED,
  [SentinelCancellationReason.TooCheap]: SmartTransactionStatuses.CANCELLED,
  [SentinelCancellationReason.DeadlineMissed]:
    SmartTransactionStatuses.CANCELLED,
  [SentinelCancellationReason.InvalidNonce]: SmartTransactionStatuses.CANCELLED,
  [SentinelCancellationReason.UserCancelled]:
    SmartTransactionStatuses.CANCELLED_USER_CANCELLED,
};

export type SmartTransactionsStatus = {
  error?: string;
  cancellationFeeWei: number;
  cancellationReason?: SentinelCancellationReason;
  originalTransactionStatus?: SentinelOriginalTransactionStatus;
  deadlineRatio: number;
  minedHash: string;
  minedTx: SentinelMinedTxStatus;
  isSettled: boolean;
  duplicated?: boolean;
  timedOut?: boolean;
  proxied?: boolean;
};

export type SmartTransaction = {
  uuid: string;
  txHash?: string;
  txHashes?: string[];
  chainId?: string;
  destinationTokenAddress?: string;
  destinationTokenDecimals?: string;
  destinationTokenSymbol?: string;
  history?: any;
  nonceDetails?: any;
  origin?: string;
  preTxBalance?: string;
  status?: string;
  statusMetadata?: SmartTransactionsStatus;
  sourceTokenSymbol?: string;
  swapMetaData?: any;
  swapTokenValue?: string;
  time?: number; // @deprecated We should use creationTime instead.
  creationTime?: number;
  txParams?: any;
  type?: string;
  confirmed?: boolean;
  cancellable?: boolean;
  accountHardwareType?: string;
  accountType?: string;
  deviceModel?: string;
  transactionId?: string; // It's an ID for a regular transaction from the TransactionController.
  networkClientId?: NetworkClientId;
};

export type Fee = {
  maxFeePerGas: number;
  maxPriorityFeePerGas: number;
};

export type IndividualTxFees = {
  fees: Fee[];
  cancelFees: Fee[];
  feeEstimate: number;
  gasLimit: number;
  gasUsed: number;
};

export type Fees = {
  approvalTxFees: IndividualTxFees | null;
  tradeTxFees: IndividualTxFees | null;
};

// TODO
export type UnsignedTransaction = any;

// TODO
export type SignedTransaction = any;

export type { SentinelMeta };

export type SignedTransactionWithMetadata = {
  tx: Hex;
  metadata?: SentinelMeta;
};

// TODO
export type SignedCanceledTransaction = any;

export type MetaMetricsProps = {
  accountHardwareType?: string;
  accountType?: string;
  deviceModel?: string;
};

export type FeatureFlags = {
  smartTransactions?: {
    mobileReturnTxHashAsap?: boolean;
    extensionReturnTxHashAsap?: boolean;
  };
};

/**
 * Configuration for smart transactions on a specific network.
 * These flags control feature availability and behavior per chain.
 *
 * This type is inferred from the SmartTransactionsNetworkConfigSchema.
 * To add a new field, update the schema in `src/featureFlags/validators.ts`.
 */
export type { SmartTransactionsNetworkConfig };

/**
 * Feature flags configuration for smart transactions across all networks.
 * Contains a default configuration and optional chain-specific overrides.
 */
export type SmartTransactionsFeatureFlagsConfig = {
  /** Default configuration applied to all chains unless overridden */
  default?: SmartTransactionsNetworkConfig;
} & {
  /**
   * Chain-specific configuration overrides, keyed by chain ID.
   * Supports both hex (e.g., "0x1") and CAIP-2 format (e.g., "eip155:1", "solana:...")
   */
  [chainId: Hex | CaipChainId]: SmartTransactionsNetworkConfig | undefined;
};
