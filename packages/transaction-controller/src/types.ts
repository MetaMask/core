import type { Hex } from '@metamask/utils';

/**
 * Representation of transaction metadata.
 */
export type TransactionMeta =
  | ({
      status: Exclude<TransactionStatus, TransactionStatus.failed>;
    } & TransactionMetaBase)
  | ({ status: TransactionStatus.failed; error: Error } & TransactionMetaBase);

/**
 * Information about a single transaction such as status and block number.
 */
type TransactionMetaBase = {
  /**
   * Base fee of the block as a hex value, introduced in EIP-1559.
   */
  baseFeePerGas?: Hex;

  /**
   * Number of the block where the transaction has been included.
   */
  blockNumber?: string;

  /**
   * Network code as per EIP-155 for this transaction.
   */
  chainId?: Hex;

  /**
   * Gas values provided by the dApp.
   */
  dappSuggestedGasFees?: DappSuggestedGasFees;

  /**
   * String to indicate what device the transaction was confirmed on.
   */
  deviceConfirmedOn?: WalletDevice;

  /**
   * The estimated base fee of the transaction.
   */
  estimatedBaseFee?: string;

  /**
   * Generated UUID associated with this transaction.
   */
  id: string;

  /**
   * Whether the transaction is a transfer.
   */
  isTransfer?: boolean;

  /**
   * Network code as per EIP-155 for this transaction.
   */
  networkID?: string;

  /**
   * Origin this transaction was sent from.
   */
  origin?: string;

  /**
   * Hex representation of the underlying transaction.
   */
  rawTransaction?: string;

  /**
   * Timestamp associated with this transaction.
   */
  time: number;

  /**
   * Whether transaction recipient is a smart contract.
   */
  toSmartContract?: boolean;

  /**
   * Underlying Transaction object.
   */
  transaction: Transaction;

  /**
   * Hash of a successful transaction.
   */
  transactionHash?: string;

  /**
   * Additional transfer information.
   */
  transferInformation?: {
    contractAddress: string;
    decimals: number;
    symbol: string;
  };

  /**
   * Transaction receipt.
   */
  txReceipt?: TransactionReceipt;

  /**
   * Whether the transaction is verified on the blockchain.
   */
  verifiedOnBlockchain?: boolean;
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
 * Standard data concerning a transaction to be processed by the blockchain.
 */
export interface Transaction {
  /**
   * Network ID as per EIP-155.
   */
  chainId?: Hex;

  /**
   * Data to pass with this transaction.
   */
  data?: string;

  /**
   * Error message for gas estimation failure.
   */
  estimateGasError?: string;

  /**
   * Estimated base fee for this transaction.
   */
  estimatedBaseFee?: string;

  /**
   * Address to send this transaction from.
   */
  from: string;

  /**
   * Gas to send with this transaction.
   */
  gas?: string;

  /**
   * Price of gas with this transaction.
   */
  gasPrice?: string;

  /**
   * Gas used in the transaction.
   */
  gasUsed?: string;

  /**
   * Maximum fee per gas for this transaction.
   */
  maxFeePerGas?: string;

  /**
   * Maximum priority fee per gas for this transaction.
   */
  maxPriorityFeePerGas?: string;

  /**
   * Unique number to prevent replay attacks.
   */
  nonce?: string;

  /**
   * Address to send this transaction to.
   */
  to?: string;

  /**
   * Value associated with this transaction.
   */
  value?: string;
}

/**
 * Standard data concerning a transaction processed by the blockchain.
 */
export interface TransactionReceipt {
  /**
   * The block hash of the block that this transaction was included in.
   */
  blockHash?: string;

  /**
   * The block number of the block that this transaction was included in.
   */
  blockNumber?: string;

  /**
   * Effective gas price the transaction was charged at.
   */
  effectiveGasPrice?: string;

  /**
   * Gas used in the transaction.
   */
  gasUsed?: string;

  /**
   * Total used gas in hex.
   */
  l1Fee?: string;

  /**
   * All the logs emitted by this transaction.
   */
  logs?: Log[];

  /**
   * The status of the transaction.
   */
  status?: string;

  /**
   * The index of this transaction in the list of transactions included in the block this transaction was mined in.
   */
  transactionIndex?: number;
}

/**
 * Represents an event that has been included in a transaction using the EVM `LOG` opcode.
 */
export interface Log {
  /**
   * Address of the contract that generated log.
   */
  address?: string;
  /**
   * List of topics for log.
   */
  topics?: string;
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
  isSupportedNetwork: (chainId: Hex, networkId: string) => boolean;

  fetchTransactions: (
    request: RemoteTransactionSourceRequest,
  ) => Promise<TransactionMeta[]>;
}

/**
 * Gas values initially suggested by the dApp.
 */
export interface DappSuggestedGasFees {
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}
