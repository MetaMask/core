import type { GasFeeState } from '@metamask/gas-fee-controller';
import type { Hex } from '@metamask/utils';
import type { Operation } from 'fast-json-patch';

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
   * Unique ID to prevent duplicate requests.
   */
  actionId?: string;

  /**
   * Base fee of the block as a hex value, introduced in EIP-1559.
   */
  baseFeePerGas?: Hex;

  /**
   * Number of the block where the transaction has been included.
   */
  blockNumber?: string;

  /**
   * The timestamp for when the block was collated.
   */
  blockTimestamp?: string;

  /**
   * Network code as per EIP-155 for this transaction.
   */
  chainId: Hex;

  /**
   * Gas values provided by the dApp.
   */
  dappSuggestedGasFees?: DappSuggestedGasFees;

  /**
   * The default estimate for gas.
   */
  defaultGasEstimates?: string;

  /**
   * String to indicate what device the transaction was confirmed on.
   */
  deviceConfirmedOn?: WalletDevice;

  /**
   * The estimated base fee of the transaction.
   */
  estimatedBaseFee?: string;

  /**
   * Which estimate level that the API suggested.
   */
  estimateSuggested?: string;

  /**
   * Which estimate level was used
   */
  estimateUsed?: string;

  /**
   * A hex string of the transaction hash, used to identify the transaction on the network.
   */
  hash?: string;

  /**
   * A history of mutations to TransactionMeta.
   */
  history?: TransactionHistory;

  /**
   * Generated UUID associated with this transaction.
   */
  id: string;

  /**
   * Whether the transaction is a transfer.
   */
  isTransfer?: boolean;

  /**
   * Network code as per EIP-155 for this transaction
   *
   * @deprecated Use `chainId` instead.
   */
  readonly networkID?: string;

  /**
   * Origin this transaction was sent from.
   */
  origin?: string;

  /**
   * The original gas estimation of the transaction.
   */
  originalGasEstimate?: string;

  /**
   * The transaction's 'r' value as a hex string.
   */
  r?: string;

  /**
   * Hex representation of the underlying transaction.
   */
  rawTx?: string;

  /**
   * When the transaction is dropped, this is the replacement transaction hash.
   */
  replacedBy?: string;

  /**
   * When the transaction is dropped, this is the replacement transaction ID.
   */
  replacedById?: string;

  /**
   * The transaction's 's' value as a hex string.
   */
  s?: string;

  /** Alternate EIP-1559 gas fee estimates for multiple priority levels. */
  gasFeeEstimates?: GasFeeEstimates;

  /** Whether the gas fee estimates have been checked at least once. */
  gasFeeEstimatesLoaded?: boolean;

  /**
   * Response from security validator.
   */
  securityAlertResponse?: SecurityAlertResponse;

  /**
   * An array of entries that describe the user's journey through the send flow.
   * This is purely attached to state logs for troubleshooting and support.
   */
  sendFlowHistory?: SendFlowHistoryEntry[];

  /**
   * Simulation data for the transaction used to predict its outcome.
   */
  simulationData?: SimulationData;

  /**
   * The time the transaction was submitted to the network, in Unix epoch time (ms).
   */
  submittedTime?: number;

  /**
   * Timestamp associated with this transaction.
   */
  time: number;

  /**
   * Whether transaction recipient is a smart contract.
   */
  toSmartContract?: boolean;

  /**
   * Additional transfer information.
   */
  transferInformation?: {
    contractAddress: string;
    decimals: number;
    symbol: string;
  };

  /**
   * Underlying Transaction object.
   */
  txParams: TransactionParams;

  /**
   * Transaction receipt.
   */
  txReceipt?: TransactionReceipt;

  /**
   * The type of transaction such as `cancel` or `swap`.
   */
  type?: TransactionType;

  /**
   * The gas limit supplied by user.
   */
  userEditedGasLimit?: boolean;

  /**
   * Estimate level user selected.
   */
  userFeeLevel?: string;

  /**
   * The transaction's 'v' value as a hex string.
   */
  v?: string;

  /**
   * Whether the transaction is verified on the blockchain.
   */
  verifiedOnBlockchain?: boolean;

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
};

export type SendFlowHistoryEntry = {
  /**
   * String to indicate user interaction information.
   */
  entry: string;

  /**
   * Timestamp associated with this entry.
   */
  timestamp: number;
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
 * Standard data concerning a transaction to be processed by the blockchain.
 */
export interface TransactionParams {
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
   * same as gasLimit?
   */
  gas?: string;

  /**
   * Maxmimum number of units of gas to use for this transaction.
   */
  gasLimit?: string;

  /**
   * Price per gas for legacy txs
   */
  gasPrice?: string;

  /**
   * Gas used in the transaction.
   */
  gasUsed?: string;

  /**
   * Maximum amount per gas to pay for the transaction, including the priority
   * fee.
   */
  maxFeePerGas?: string;

  /**
   * Maximum amount per gas to give to validator as incentive.
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
   * Type of transaction.
   * 0x0 indicates a legacy transaction.
   */
  type?: string;

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
   * The chainId of the current network.
   */
  currentChainId: Hex;

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
  /**
   * @param chainId - The chainId of the current network.
   * @returns Whether the remote transaction source supports the specified network.
   */
  isSupportedNetwork: (chainId: Hex) => boolean;

  /**
   * @returns An array of additional keys to use when caching the last fetched block number.
   */
  getLastBlockVariations?: () => string[];

  /**
   * @param request - A request object containing data such as the address and chain ID.
   * @returns An array of transaction metadata for the retrieved transactions.
   */
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

/**
 * A transaction history operation that includes a note and timestamp.
 */
type ExtendedHistoryOperation = Operation & {
  note?: string;
  timestamp?: number;
};

/**
 * A transaction history entry that includes the ExtendedHistoryOperation as the first element.
 */
export type TransactionHistoryEntry = [
  ExtendedHistoryOperation,
  ...Operation[],
];

/**
 * A transaction history that includes the transaction meta as the first element.
 * And the rest of the elements are the operation arrays that were applied to the transaction meta.
 */
export type TransactionHistory = [
  TransactionMeta,
  ...TransactionHistoryEntry[],
];

/**
 * Result of inferring the transaction type.
 */
export type InferTransactionTypeResult = {
  /**
   * The contract code, in hex format if it exists. '0x0' or
   * '0x' are also indicators of non-existent contract code.
   */
  getCodeResponse?: string | null;

  /**
   * The type of transaction
   */
  type: TransactionType;
};

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
export type GasFeeEstimatesForLevel = {
  /** Maximum amount to pay per gas. */
  maxFeePerGas: Hex;

  /** Maximum amount per gas to give to the validator as an incentive. */
  maxPriorityFeePerGas: Hex;
};

/** Alternate priority levels for which values are provided in gas fee estimates. */
export enum GasFeeEstimateLevel {
  low = 'low',
  medium = 'medium',
  high = 'high',
}

/** Gas fee estimates for a transaction. */
export type GasFeeEstimates = {
  /** The gas fee estimate for a low priority transaction. */
  [GasFeeEstimateLevel.low]: GasFeeEstimatesForLevel;

  /** The gas fee estimate for a medium priority transaction. */
  [GasFeeEstimateLevel.medium]: GasFeeEstimatesForLevel;

  /** The gas fee estimate for a high priority transaction. */
  [GasFeeEstimateLevel.high]: GasFeeEstimatesForLevel;
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

/** Simulation data concerning an update to a native or token balance. */
export type SimulationBalanceChange = {
  /** The balance before the transaction. */
  previousBalance: Hex;

  /** The balance after the transaction. */
  newBalance: Hex;

  /** The difference in balance. */
  difference: Hex;

  /** Whether the balance is increasing or decreasing. */
  isDecrease: boolean;
};

/** Token standards supported by simulation. */
export enum SimulationTokenStandard {
  erc20 = 'erc20',
  erc721 = 'erc721',
  erc1155 = 'erc1155',
}

/** Simulation data concerning an updated token. */
export type SimulationToken = {
  /** The token's contract address. */
  address: Hex;

  /** The standard of the token. */
  standard: SimulationTokenStandard;

  /** The ID of the token if supported by the standard. */
  id?: Hex;
};

/** Simulation data concerning a change to the a token balance. */
export type SimulationTokenBalanceChange = SimulationToken &
  SimulationBalanceChange;

export enum SimulationErrorCode {
  ChainNotSupported = 'chain-not-supported',
  Disabled = 'disabled',
  InvalidResponse = 'invalid-response',
  Reverted = 'reverted',
}

/** Error data for a failed simulation. */
export type SimulationError = {
  /** Error code to identify the error type. */
  code?: string | number;

  /** Error message to describe the error. */
  message?: string;
};

/** Simulation data for a transaction. */
export type SimulationData = {
  /** Error data if the simulation failed or the transaction reverted. */
  error?: SimulationError;

  /** Data concerning a change to the user's native balance. */
  nativeBalanceChange?: SimulationBalanceChange;

  /** Data concerning a change to the user's token balances. */
  tokenBalanceChanges: SimulationTokenBalanceChange[];
};
