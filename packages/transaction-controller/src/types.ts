import type { NetworkType } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';

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
 * @property txReceipt - Transaction receipt
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
  txReceipt?: TransactionReceipt;
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
}

/**
 * @type TransactionReceipt
 *
 * TransactionReceipt representation
 * @property byzantium - True if the block is in a post-Byzantium Hard Fork block.
 * @property contractAddress - Contract address
 * @property confirmations - The number of blocks that have been mined since this transaction
 * @property cumulativeGasUsed - Sum of the gas used by each transaction in the ordered list of transaction
 * @property blockHash - The block hash of the block that this transaction was included in
 * @property effectiveGasPrice - Effective gas price the transaction was charged at
 * @property from - The address this transaction is from
 * @property gasUsed - Gas used in the transaction
 * @property l1Fee - Total used gas in hex
 * @property logs - All the logs emitted by this transaction
 * @property logsBloom - A bloom-filter, which includes all the addresses and topics included in any log in this transaction
 * @property root - The intermediate state root of a receipt
 * @property status - The status of the transaction
 * @property to - The address this transaction is to
 * @property transactionIndex - The index of this transaction in the list of transactions included in the block this transaction was mined in
 * @property type - The EIP-2718 type of this transaction
 */
export interface TransactionReceipt {
  blockHash?: string;
  blockNumber?: number;
  effectiveGasPrice?: string;
  gasUsed?: string;
  l1Fee?: string;
  logs?: Log[];
  status?: string;
  transactionIndex?: number;
}

/**
 * @type Log
 *
 * Log representation
 * @property address - Address of the contract that generated log
 * @property topics - List of topics for log
 */
interface Log {
  address?: string;
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
  fromBlock?: string;

  /**
   * Maximum number of transactions to retrieve.
   */
  limit: number;

  /**
   * The type of the current network.
   */
  networkType: NetworkType;
}

/**
 * An object capable of fetching transaction data from a remote source.
 * Used by the IncomingTransactionHelper to retrieve remote transaction data.
 */
export interface RemoteTransactionSource {
  fetchTransactions: (
    request: RemoteTransactionSourceRequest,
  ) => Promise<TransactionMeta[]>;
}
