import { Hex } from '@metamask/utils';

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
  chainId: string;
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
  type?: TransactionType;
  replacedBy?: string;
  replacedById?: string;

  /**
   * ID of the transaction that approved the swap token transfer.
   */
  approvalTxId?: string;

  /**
   * Account transaction balance after swap.
   */
  postTxBalance?: string;

  /**
   * Account transaction balance before swap.
   */
  preTxBalance?: string;

  /**
   * The address of the token being received of swap transaction.
   */
  destinationTokenAddress?: string;

  /**
   * If the gas estimation fails, an object containing error and block information.
   */
  simulationFails?: {
    reason?: string;
    errorKey?: string;
    debug: {
      blockNumber?: string;
      blockGasLimit?: string;
    };
  };

  /**
   * The symbol of the token being swapped.
   */
  sourceTokenSymbol?: string;

  /**
   * The decimals of the token being received of swap transaction.
   */
  destinationTokenDecimals?: number;

  /**
   * The symbol of the token being received with swap.
   */
  destinationTokenSymbol?: string;

  /**
   * The metadata of the swap transaction.
   */
  swapMetaData?: Record<string, any>;

  /**
   * The value of the token being swapped.
   */
  swapTokenValue?: string;

  /**
   * Estimated base fee for this transaction.
   */
  estimatedBaseFee?: string;

  /**
   * Base fee of the block as a hex value, introduced in EIP-1559.
   */
  baseFeePerGas?: Hex;

  /**
   * Response from security validator.
   */
  securityAlertResponse?: SecurityAlertResponse;
};

/**
 * The status of the transaction. Each status represents the state of the transaction internally
 * in the wallet. Some of these correspond with the state of the transaction on the network, but
 * some are wallet-specific.
 */
export enum TransactionStatus {
  approved = 'approved',
  /** @deprecated Determined by the clients using the transaction type. No longer used. */
  cancelled = 'cancelled',
  confirmed = 'confirmed',
  dropped = 'dropped',
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
  chainId?: number;
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
  currentChainId: string;

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
  /** The chain ID of the transaction as a decimal string. */
  chainId?: string;

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
   * The hexadecimal index of this transaction in the list of transactions included in the block this transaction was mined in.
   */
  transactionIndex?: string;
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
 * The type of the transaction.
 */
export enum TransactionType {
  /**
   * A transaction sending a network's native asset to a recipient.
   */
  cancel = 'cancel',

  /**
   * A transaction that is interacting with a smart contract's methods that we
   * have not treated as a special case, such as approve, transfer, and
   * transferfrom.
   */
  contractInteraction = 'contractInteraction',

  /**
   * A transaction that deployed a smart contract.
   */
  deployContract = 'contractDeployment',

  /**
   * A transaction for Ethereum decryption.
   */
  ethDecrypt = 'eth_decrypt',

  /**
   * A transaction for getting an encryption public key.
   */
  ethGetEncryptionPublicKey = 'eth_getEncryptionPublicKey',

  /**
   * An incoming (deposit) transaction.
   */
  incoming = 'incoming',

  /**
   * A transaction for personal sign.
   */
  personalSign = 'personal_sign',

  /**
   * When a transaction is failed it can be retried by
   * resubmitting the same transaction with a higher gas fee. This type is also used
   * to speed up pending transactions. This is accomplished by creating a new tx with
   * the same nonce and higher gas fees.
   */
  retry = 'retry',

  /**
   * A transaction sending a network's native asset to a recipient.
   */
  simpleSend = 'simpleSend',

  /**
   * A transaction that is signing a message.
   */
  sign = 'eth_sign',

  /**
   * A transaction that is signing typed data.
   */
  signTypedData = 'eth_signTypedData',

  /**
   * A transaction sending a network's native asset to a recipient.
   */
  smart = 'smart',

  /**
   * A transaction swapping one token for another through MetaMask Swaps.
   */
  swap = 'swap',

  /**
   * Similar to the approve type, a swap approval is a special case of ERC20
   * approve method that requests an allowance of the token to spend on behalf
   * of the user for the MetaMask Swaps contract. The first swap for any token
   * will have an accompanying swapApproval transaction.
   */
  swapApproval = 'swapApproval',

  /**
   * A token transaction requesting an allowance of the token to spend on
   * behalf of the user.
   */
  tokenMethodApprove = 'approve',

  /**
   * A token transaction transferring tokens from an account that the sender
   * has an allowance of. The method is prefixed with safe because when calling
   * this method the contract checks to ensure that the receiver is an address
   * capable of handling the token being sent.
   */
  tokenMethodSafeTransferFrom = 'safetransferfrom',

  /**
   * A token transaction where the user is sending tokens that they own to
   * another address.
   */
  tokenMethodTransfer = 'transfer',

  /**
   * A token transaction transferring tokens from an account that the sender
   * has an allowance of. For more information on allowances, see the approve
   * type.
   */
  tokenMethodTransferFrom = 'transferfrom',

  /**
   * A token transaction requesting an allowance of all of a user's tokens to
   * spend on behalf of the user.
   */
  tokenMethodSetApprovalForAll = 'setapprovalforall',
}

/**
 * Specifies the shape of the base transaction parameters.
 * Added in EIP-2718.
 */
export enum TransactionEnvelopeType {
  /**
   * A legacy transaction, the very first type.
   */
  legacy = '0x0',

  /**
   * EIP-2930 defined the access list transaction type that allowed for
   * specifying the state that a transaction would act upon in advance and
   * theoretically save on gas fees.
   */
  accessList = '0x1',

  /**
   * The type introduced comes from EIP-1559, Fee Market describes the addition
   * of a baseFee to blocks that will be burned instead of distributed to
   * miners. Transactions of this type have both a maxFeePerGas (maximum total
   * amount in gwei per gas to spend on the transaction) which is inclusive of
   * the maxPriorityFeePerGas (maximum amount of gwei per gas from the
   * transaction fee to distribute to miner).
   */
  feeMarket = '0x2',
}
