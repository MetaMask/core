import { Hex } from '@metamask/utils';
import { GasFeeState } from '@metamask/gas-fee-controller';

/**
 * @type TransactionMeta
 *
 * TransactionMeta representation
 * @property error - Synthesized error information for failed transactions
 * @property id - Generated UUID associated with this transaction
 * @property networkID - Network code as per EIP-155 for this transaction
 * @property origin - Origin this transaction was sent from
 * @property deviceConfirmedOn - string to indicate what device the transaction was confirmed
 * @property rawTransaction - Hex representation of the underlying transaction
 * @property status - String status of this transaction
 * @property time - Timestamp associated with this transaction
 * @property toSmartContract - Whether transaction recipient is a smart contract
 * @property transaction - Underlying Transaction object
 * @property transactionHash - Hash of a successful transaction
 * @property blockNumber - Number of the block where the transaction has been included
 */
export type TransactionMeta =
  | ({
      status: Exclude<TransactionStatus, TransactionStatus.failed>;
    } & TransactionMetaBase)
  | ({ status: TransactionStatus.failed; error: Error } & TransactionMetaBase);

type TransactionMetaBase = {
  isTransfer?: boolean;
  transferInformation?: {
    symbol: string;
    contractAddress: string;
    decimals: number;
  };
  id: string;
  networkID?: string;
  chainId?: Hex;
  origin?: string;
  rawTransaction?: string;
  time: number;
  toSmartContract?: boolean;
  transaction: Transaction;
  transactionHash?: string;
  blockNumber?: string;
  deviceConfirmedOn?: WalletDevice;
  verifiedOnBlockchain?: boolean;

  /**
   * Response from security validator.
   */
  securityAlertResponse?: SecurityAlertResponse;

  /** Alternate EIP-1559 gas fee estimates for multiple priority levels. */
  gasFeeEstimates?: GasFeeEstimates;
};

/**
 * The status of the transaction. Each status represents the state of the transaction internally
 * in the wallet. Some of these correspond with the state of the transaction on the network, but
 * some are wallet-specific.
 */
export enum TransactionStatus {
  approved = 'approved',
  cancelled = 'cancelled',
  confirmed = 'confirmed',
  failed = 'failed',
  rejected = 'rejected',
  signed = 'signed',
  submitted = 'submitted',
  unapproved = 'unapproved',
}

/**
 * Options for wallet device.
 */
export enum WalletDevice {
  MM_MOBILE = 'metamask_mobile',
  MM_EXTENSION = 'metamask_extension',
  OTHER = 'other_device',
}

/**
 * @type Transaction
 *
 * Transaction representation
 * @property chainId - Network ID as per EIP-155
 * @property data - Data to pass with this transaction
 * @property from - Address to send this transaction from
 * @property gas - Gas to send with this transaction
 * @property gasPrice - Price of gas with this transaction
 * @property gasUsed - Gas used in the transaction
 * @property nonce - Unique number to prevent replay attacks
 * @property to - Address to send this transaction to
 * @property value - Value associated with this transaction
 */
export interface Transaction {
  chainId?: Hex;
  data?: string;
  from: string;
  gas?: string;
  gasPrice?: string;
  gasUsed?: string;
  nonce?: string;
  to?: string;
  value?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  estimatedBaseFee?: string;
  estimateGasError?: string;
  type?: string;
}

/**
 * The configuration required to fetch transaction data from a RemoteTransactionSource.
 */
export interface RemoteTransactionSourceRequest {
  /**
   * The address of the account to fetch transactions for.
   */
  address: string;

  /**
   * API key if required by the remote source.
   */
  apiKey?: string;

  /**
   * The chainId of the current network.
   */
  currentChainId: Hex;

  /**
   * The networkId of the current network.
   */
  currentNetworkId: string;

  /**
   * Block number to start fetching transactions from.
   */
  fromBlock?: number;

  /**
   * Maximum number of transactions to retrieve.
   */
  limit?: number;
}

/**
 * An object capable of fetching transaction data from a remote source.
 * Used by the IncomingTransactionHelper to retrieve remote transaction data.
 */
export interface RemoteTransactionSource {
  isSupportedNetwork: (chainId: string, networkId: string) => boolean;

  fetchTransactions: (
    request: RemoteTransactionSourceRequest,
  ) => Promise<TransactionMeta[]>;
}

export type SecurityAlertResponse = {
  reason: string;
  features?: string[];
  result_type: string;
  providerRequestsCount?: Record<string, number>;
};

/**
 * Data concerning a successfully submitted transaction.
 * Used for debugging purposes.
 */
export type SubmitHistoryEntry = {
  /** The chain ID of the transaction as a hexadecimal string. */
  chainId?: Hex;

  /** The hash of the transaction returned from the RPC provider. */
  hash: string;

  /** True if the entry was generated using the migration and existing transaction metadata. */
  migration?: boolean;

  /** The type of the network where the transaction was submitted. */
  networkType?: string;

  /**
   * The URL of the network the transaction was submitted to.
   * A single network URL if it was recorded when submitted.
   * An array of potential network URLs if it cannot be confirmed since the migration was used.
   */
  networkUrl?: string | string[];

  /** The origin of the transaction. */
  origin?: string;

  /** The raw transaction data that was submitted. */
  rawTransaction: string;

  /** When the transaction was submitted. */
  time: number;

  /** The transaction parameters that were submitted. */
  transaction: Record<string, unknown>;
};

/** Gas fee estimates for a specific priority level. */
export type GasFeeEstimatesLevel = {
  /** Maximum amount to pay per gas. */
  maxFeePerGas: string;

  /** Maximum amount per gas to give to the validator as an incentive. */
  maxPriorityFeePerGas: string;
};

/** Gas fee estimates for a transaction. */
export type GasFeeEstimates = {
  /** The gas fee estimate for a low priority transaction. */
  low: GasFeeEstimatesLevel;

  /** The gas fee estimate for a medium priority transaction. */
  medium: GasFeeEstimatesLevel;

  /** The gas fee estimate for a high priority transaction. */
  high: GasFeeEstimatesLevel;
};

/** Request to a gas fee flow to obtain gas fee estimates. */
export type GasFeeFlowRequest = {
  /** An EthQuery instance to enable queries to the associated RPC provider. */
  ethQuery: any;

  /** Callback to get the GasFeeController estimates. */
  getGasFeeControllerEstimates: () => Promise<GasFeeState>;

  /** The metadata of the transaction to obtain estimates for. */
  transactionMeta: TransactionMeta;
};

/** Response from a gas fee flow containing gas fee estimates. */
export type GasFeeFlowResponse = {
  /** The gas fee estimates for the transaction. */
  estimates: GasFeeEstimates;
};

/** A method of obtaining gas fee estimates for a specific transaction. */
export type GasFeeFlow = {
  /**
   * Determine if the gas fee flow supports the specified transaction.
   *
   * @param transactionMeta - The transaction metadata.
   * @returns Whether the gas fee flow supports the transaction.
   */
  matchesTransaction(transactionMeta: TransactionMeta): boolean;

  /**
   * Get gas fee estimates for a specific transaction.
   *
   * @param request - The gas fee flow request.
   * @returns The gas fee flow response containing the gas fee estimates.
   */
  getGasFees: (request: GasFeeFlowRequest) => Promise<GasFeeFlowResponse>;
};
