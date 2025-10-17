import type { AccessList } from '@ethereumjs/tx';
import type { AccountsController } from '@metamask/accounts-controller';
import type EthQuery from '@metamask/eth-query';
import type { GasFeeState } from '@metamask/gas-fee-controller';
import type { NetworkClientId, Provider } from '@metamask/network-controller';
import type { Hex, Json } from '@metamask/utils';
import type { Operation } from 'fast-json-patch';

import type { TransactionControllerMessenger } from './TransactionController';

/**
 * Given a record, ensures that each property matches the `Json` type.
 */
type MakeJsonCompatible<T> = T extends Json
  ? T
  : {
      [K in keyof T]: T[K] extends Json ? T[K] : never;
    };

/**
 * `Json` from `@metamask/utils` is defined as a recursive type alias, but
 * `Operation` is defined as an interface, and the two are not compatible with
 * each other. Therefore, this is a variant of Operation from `fast-json-patch`
 * which is guaranteed to be type-compatible with `Json`.
 */
type JsonCompatibleOperation = MakeJsonCompatible<Operation>;

/**
 * Information about a single transaction such as status and block number.
 */
export type TransactionMeta = {
  /**
   * ID of the transaction that approved the swap token transfer.
   */
  approvalTxId?: string;

  /**
   * The fiat value of the transaction to be used to passed metrics.
   */
  assetsFiatValues?: AssetsFiatValues;

  /**
   * Unique ID to prevent duplicate requests.
   */
  actionId?: string;

  /**
   * Base fee of the block as a hex value, introduced in EIP-1559.
   */
  baseFeePerGas?: Hex;

  /**
   * ID of the associated transaction batch.
   */
  batchId?: Hex;

  /**
   * Additional transactions that must also be submitted in a batch.
   */
  batchTransactions?: BatchTransaction[];

  /**
   * Optional configuration when processing `batchTransactions`.
   */
  batchTransactionsOptions?: {
    /**
     * Whether to disable batch transaction processing via an EIP-7702 upgraded account.
     * Defaults to `true` if no options object, `false` otherwise.
     */
    disable7702?: boolean;

    /**
     * Whether to disable batch transaction via the `publishBatch` hook.
     * Defaults to `false`.
     */
    disableHook?: boolean;

    /**
     * Whether to disable batch transaction via sequential transactions.
     * Defaults to `true` if no options object, `false` otherwise.
     */
    disableSequential?: boolean;
  };

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
   * List of container types applied to the original transaction data.
   * For example, through delegations.
   */
  containerTypes?: TransactionContainerType[];

  /**
   * A string representing a name of transaction contract method.
   */
  contractMethodName?: string;

  /**
   * The balance of the token that is being sent.
   */
  currentTokenBalance?: string;

  /** The optional custom nonce override as a decimal string. */
  customNonceValue?: string;

  /**
   * The custom token amount is the amount set by the user.
   */
  customTokenAmount?: string;

  /**
   * The dapp proposed token amount.
   */
  dappProposedTokenAmount?: string;

  /**
   * Gas values provided by the dApp.
   */
  dappSuggestedGasFees?: DappSuggestedGasFees;

  /**
   * The initial gas values set when the transaction was first created.
   */
  defaultGasEstimates?: DefaultGasEstimates;

  /**
   * Address of the sender's current contract code delegation.
   * Introduced in EIP-7702.
   */
  delegationAddress?: Hex;

  /**
   * String to indicate what device the transaction was confirmed on.
   */
  deviceConfirmedOn?: WalletDevice;

  /**
   * The Network ID as per EIP-155 of the destination chain of a bridge transaction.
   */
  destinationChainId?: Hex;

  /**
   * The address of the token being received of swap transaction.
   */
  destinationTokenAddress?: string;

  /**
   * The raw amount of the destination token
   */
  destinationTokenAmount?: string;

  /**
   * The decimals of the token being received of swap transaction.
   */
  destinationTokenDecimals?: number;

  /**
   * The symbol of the token being received with swap.
   */
  destinationTokenSymbol?: string;

  /**
   * Whether to disable the buffer added to gas limit estimations.
   * Defaults to adding the buffer.
   */
  disableGasBuffer?: boolean;

  /**
   * Error that occurred during the transaction processing.
   */
  error?: TransactionError;

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
   * The chosen amount which will be the same as the originally proposed token
   * amount if the user does not edit the  amount or will be a custom token
   * amount set by the user.
   */
  finalApprovalAmount?: string;

  /**
   * The number of the latest block when the transaction submit was first retried.
   */
  firstRetryBlockNumber?: string;

  /** Available tokens that can be used to pay for gas. */
  gasFeeTokens?: GasFeeToken[];

  /**
   * Whether the transaction is active.
   */
  isActive?: boolean;

  /**
   * Whether the transaction is the first time interaction.
   */
  isFirstTimeInteraction?: boolean;

  /**
   * Whether the transaction is sponsored meaning the user does not pay the gas fee.
   */
  isGasFeeSponsored?: boolean;

  /** Alternate EIP-1559 gas fee estimates for multiple priority levels. */
  gasFeeEstimates?: GasFeeEstimates;

  /** Whether the gas fee estimates have been checked at least once. */
  gasFeeEstimatesLoaded?: boolean;

  /**
   * The estimated gas for the transaction without any buffer applied.
   */
  gasLimitNoBuffer?: string;

  /**
   * The estimated gas used by the transaction, after any refunds. Generated from transaction simulation.
   */
  gasUsed?: Hex;

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
   * Whether the transaction is signed externally.
   * No signing will be performed in the client and the `nonce` will be `undefined`.
   */
  isExternalSign?: boolean;

  /** Whether MetaMask will be compensated for the gas fee by the transaction. */
  isGasFeeIncluded?: boolean;

  /**
   * Whether the transaction is an incoming token transfer.
   */
  isTransfer?: boolean;

  /**
   * Whether the transaction entry is generated from a user operation.
   */
  isUserOperation?: boolean;

  /**
   * Additional gas fees to cover the cost of persisting data on layer 1 for layer 2 networks.
   */
  layer1GasFee?: Hex;

  /**
   * Data for any nested transactions.
   * For example, in an atomic batch transaction via EIP-7702.
   */
  nestedTransactions?: NestedTransactionMetadata[];

  /**
   * The ID of the network client used by the transaction.
   */
  networkClientId: NetworkClientId;

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
   * The original dapp proposed token approval amount before edit by user.
   */
  originalApprovalAmount?: string;

  /**
   * The original gas estimation of the transaction.
   */
  originalGasEstimate?: string;

  /**
   * When we speed up a transaction, we set the type as Retry and we lose
   * information about type of transaction that is being set up, so we use
   * original type to track that information.
   */
  originalType?: TransactionType;

  /** Metadata specific to the MetaMask Pay feature. */
  metamaskPay?: MetamaskPayMetadata;

  /**
   * Account transaction balance after swap.
   */
  postTxBalance?: string;

  /**
   * Account transaction balance before swap.
   */
  preTxBalance?: string;

  /**
   * The previous gas properties before they were updated.
   */
  previousGas?: {
    /**
     * Maxmimum number of units of gas to use for this transaction.
     */
    gasLimit?: string;

    /**
     * Maximum amount per gas to pay for the transaction, including the priority fee.
     */
    maxFeePerGas?: string;

    /**
     * Maximum amount per gas to give to validator as incentive.
     */
    maxPriorityFeePerGas?: string;
  };

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
   * IDs of any transactions that must be confirmed before this one is submitted.
   * Unlike a transaction batch, these transactions can be on alternate chains.
   */
  requiredTransactionIds?: string[];

  /**
   * The number of times that the transaction submit has been retried.
   */
  retryCount?: number;

  /**
   * The transaction's 's' value as a hex string.
   */
  s?: string;

  /**
   * Response from security validator.
   */
  securityAlertResponse?: SecurityAlertResponse;

  /**
   * Response from security provider.
   */
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  securityProviderResponse?: Record<string, any>;

  /**
   * The token address of the selected gas fee token.
   * Corresponds to the `gasFeeTokens` property.
   */
  selectedGasFeeToken?: Hex;

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

  /** Current status of the transaction. */
  status: TransactionStatus;

  /**
   * The time the transaction was submitted to the network, in Unix epoch time (ms).
   */
  submittedTime?: number;

  /**
   * The address of the token being swapped
   */
  sourceTokenAddress?: string;

  /**
   * The raw amount of the source swap token
   */
  sourceTokenAmount?: string;

  /**
   * The decimals of the token being swapped.
   */
  sourceTokenDecimals?: number;

  /**
   * The symbol of the token being swapped.
   */
  sourceTokenSymbol?: string;

  /**
   * The address of the swap recipient.
   */
  swapAndSendRecipient?: string;

  /**
   * The metadata of the swap transaction.
   */
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  swapMetaData?: Record<string, any>;

  /**
   * The value of the token being swapped.
   */
  swapTokenValue?: string;

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
    amount?: string;
    contractAddress: string;
    decimals: number;
    symbol: string;
  };

  /**
   * Underlying Transaction object.
   */
  txParams: TransactionParams;

  /**
   * Initial transaction parameters before `afterAdd` hook was invoked.
   */
  txParamsOriginal?: TransactionParams;

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
   * Warning information for the transaction.
   */
  warning?: {
    error: string;
    message: string;
  };
};

/**
 * Information about a batch transaction.
 */
export type TransactionBatchMeta = {
  /**
   * Network code as per EIP-155 for this transaction.
   */
  chainId: Hex;

  /**
   * Address to send this transaction from.
   */
  from: string;

  /** Alternate EIP-1559 gas fee estimates for multiple priority levels. */
  gasFeeEstimates?: GasFeeEstimates;

  /**
   * Maximum number of units of gas to use for this transaction batch.
   */
  gas?: string;

  /**
   * ID of the associated transaction batch.
   */
  id: string;

  /**
   * The ID of the network client used by the transaction.
   */
  networkClientId: NetworkClientId;

  /**
   * Origin this transaction was sent from.
   */
  origin?: string;

  /** Current status of the transaction. */
  status: TransactionStatus;

  /**
   * Data for any EIP-7702 transactions.
   */
  transactions?: NestedTransactionMetadata[];
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
 * Represents the status of a transaction within the wallet.
 * Each status reflects the state of the transaction internally,
 * with some statuses corresponding to the transaction's state on the network.
 *
 * The typical transaction lifecycle follows this state machine:
 * unapproved -> approved -> signed -> submitted -> FINAL_STATE
 * where FINAL_STATE is one of: confirmed, failed, dropped, or rejected.
 */
export enum TransactionStatus {
  /**
   * The initial state of a transaction before user approval.
   */
  unapproved = 'unapproved',

  /**
   * The transaction has been approved by the user but is not yet signed.
   * This status is usually brief but may be longer for scenarios like hardware wallet usage.
   */
  approved = 'approved',

  /**
   * The transaction is signed and in the process of being submitted to the network.
   * This status is typically short-lived but can be longer for certain cases, such as smart transactions.
   */
  signed = 'signed',

  /**
   * The transaction has been submitted to the network and is awaiting confirmation.
   */
  submitted = 'submitted',

  /**
   * The transaction has been successfully executed and confirmed on the blockchain.
   * This is a final state.
   */
  confirmed = 'confirmed',

  /**
   * The transaction encountered an error during execution on the blockchain and failed.
   * This is a final state.
   */
  failed = 'failed',

  /**
   * The transaction was superseded by another transaction, resulting in its dismissal.
   * This is a final state.
   */
  dropped = 'dropped',

  /**
   * The transaction was rejected by the user and not processed further.
   * This is a final state.
   */
  rejected = 'rejected',

  /**
   * @deprecated This status is no longer used.
   */
  cancelled = 'cancelled',
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
   * A batch transaction that includes multiple nested transactions.
   * Introduced in EIP-7702.
   */
  batch = 'batch',

  /**
   * A transaction that bridges tokens to a different chain through Metamask Bridge.
   */
  bridge = 'bridge',

  /**
   * Similar to the approve type, a bridge approval is a special case of ERC20
   * approve method that requests an allowance of the token to spend on behalf
   * of the user for the MetaMask Bridge contract. The first bridge for any token
   * will have an accompanying bridgeApproval transaction.
   */
  bridgeApproval = 'bridgeApproval',

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
   * Transaction is a token or native transfer to MetaMask to pay for gas fees.
   */
  gasPayment = 'gas_payment',

  /**
   * An incoming (deposit) transaction.
   */
  incoming = 'incoming',

  /**
   * A transaction that deposits tokens into a lending contract.
   */
  lendingDeposit = 'lendingDeposit',

  /**
   * A transaction that withdraws tokens from a lending contract.
   */
  lendingWithdraw = 'lendingWithdraw',

  /**
   * Deposit funds to be available for trading via Perps.
   */
  perpsDeposit = 'perpsDeposit',

  /**
   * A transaction for personal sign.
   */
  personalSign = 'personal_sign',

  /**
   * Buy a position via Predict.
   *
   * @deprecated Not used.
   */
  predictBuy = 'predictBuy',

  /**
   * Claim winnings from a position via Predict.
   */
  predictClaim = 'predictClaim',

  /**
   * Deposit funds to be available for use via Predict.
   */
  predictDeposit = 'predictDeposit',

  /**
   * Sell a position via Predict.
   *
   * @deprecated Not used.
   */
  predictSell = 'predictSell',

  /**
   * Withdraw funds from Predict.
   */
  predictWithdraw = 'predictWithdraw',

  /**
   * When a transaction is failed it can be retried by
   * resubmitting the same transaction with a higher gas fee. This type is also used
   * to speed up pending transactions. This is accomplished by creating a new tx with
   * the same nonce and higher gas fees.
   */
  retry = 'retry',

  /**
   * Remove the code / delegation from an upgraded EOA.
   * Introduced in EIP-7702.
   */
  revokeDelegation = 'revokeDelegation',

  /**
   * A transaction sending a network's native asset to a recipient.
   */
  simpleSend = 'simpleSend',

  /**
   * A transaction that is signing typed data.
   */
  signTypedData = 'eth_signTypedData',

  /**
   * A transaction sending a network's native asset to a recipient.
   */
  smart = 'smart',

  /**
   * A transaction that claims staking rewards.
   */
  stakingClaim = 'stakingClaim',

  /**
   * A transaction that deposits tokens into a staking contract.
   */
  stakingDeposit = 'stakingDeposit',

  /**
   * A transaction that unstakes tokens from a staking contract.
   */
  stakingUnstake = 'stakingUnstake',

  /**
   * A transaction swapping one token for another through MetaMask Swaps.
   */
  swap = 'swap',

  /**
   * A transaction swapping one token for another through MetaMask Swaps, then sending the swapped token to a recipient.
   */
  swapAndSend = 'swapAndSend',

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

  /**
   * Increase the allowance by a given increment
   */
  tokenMethodIncreaseAllowance = 'increaseAllowance',

  /**
   * A token approval transaction subscribing to the shield insurance service
   */
  shieldSubscriptionApprove = 'shieldSubscriptionApprove',
}

export enum TransactionContainerType {
  /** Transaction has been converted to a delegation including caveats to validate the simulated balance changes. */
  EnforcedSimulations = 'enforcedSimulations',
}

/**
 * Standard data concerning a transaction to be processed by the blockchain.
 */
export type TransactionParams = {
  /**
   * A list of addresses and storage keys that the transaction plans to access.
   */
  accessList?: AccessList;

  /**
   * Array of authorizations to set code on EOA accounts.
   * Only supported in `setCode` transactions.
   * Introduced in EIP-7702.
   */
  authorizationList?: AuthorizationList;

  /**
   * Network ID as per EIP-155.
   *
   * @deprecated Ignored.
   * Use `networkClientId` when calling `addTransaction`.
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
   * Which estimate level that the API suggested.
   */
  estimateSuggested?: string;

  /**
   * Which estimate level was used
   */
  estimateUsed?: string;

  /**
   * Address to send this transaction from.
   */
  from: string;

  /**
   * Maximum number of units of gas to use for this transaction.
   */
  gas?: string;

  /**
   * Maximum number of units of gas to use for this transaction.
   *
   * @deprecated Use `gas` instead.
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
   * Value associated with this transaction.
   */
  value?: string;

  /**
   * Type of transaction.
   * 0x0 indicates a legacy transaction.
   */
  type?: string;
};

/**
 * Standard data concerning a transaction processed by the blockchain.
 */
export type TransactionReceipt = {
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

  /** Hash of the associated transaction. */
  transactionHash?: Hex;

  /**
   * The hexadecimal index of this transaction in the list of transactions included in the block this transaction was mined in.
   */
  transactionIndex?: string;
};

/**
 * Represents an event that has been included in a transaction using the EVM `LOG` opcode.
 */
export type Log = {
  /**
   * Address of the contract that generated log.
   */
  address?: string;

  /** Data for the log. */
  data?: Hex;

  /**
   * List of topics for log.
   */
  topics?: string;
};

/**
 * The configuration required to fetch transaction data from a RemoteTransactionSource.
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface RemoteTransactionSourceRequest {
  /**
   * The address of the account to fetch transactions for.
   */
  address: Hex;

  /**
   * Whether to also include incoming token transfers.
   */
  includeTokenTransfers: boolean;

  /**
   * Additional tags to identify the source of the request.
   */
  tags?: string[];

  /**
   * Whether to also retrieve outgoing transactions.
   */
  updateTransactions: boolean;
}

/**
 * An object capable of fetching transaction data from a remote source.
 * Used by the IncomingTransactionHelper to retrieve remote transaction data.
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface RemoteTransactionSource {
  /**
   * @returns Array of chain IDs supported by the remote source.
   */
  getSupportedChains: () => Hex[];

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
export type DappSuggestedGasFees = {
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
};

/**
 * Gas values saved by the user for a specific chain.
 */
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface SavedGasFees {
  maxBaseFee: string;
  priorityFee: string;
}

/**
 * A transaction history operation that includes a note and timestamp.
 */
type ExtendedHistoryOperation = JsonCompatibleOperation & {
  note?: string;
  timestamp?: number;
};

/**
 * A transaction history entry that includes the ExtendedHistoryOperation as the first element.
 */
export type TransactionHistoryEntry = [
  ExtendedHistoryOperation,
  ...JsonCompatibleOperation[],
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

/**
 * A function for verifying a transaction, whether it is malicious or not.
 */
export type SecurityProviderRequest = (
  requestData: TransactionMeta,
  messageType: string,
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

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

  /**
   * Adds code to externally owned accounts according to the signed authorizations
   * in the new `authorizationList` parameter.
   * Introduced in EIP-7702.
   */
  setCode = '0x4',
}

/**
 * The source of the gas fee parameters on a transaction.
 */
export enum UserFeeLevel {
  CUSTOM = 'custom',
  DAPP_SUGGESTED = 'dappSuggested',
  MEDIUM = 'medium',
}

/**
 * Initial gas values set when the transaction was first created.
 */
export type DefaultGasEstimates = {
  /**
   * Source of the gas fee values, such as `dappSuggested` or `medium`.
   */
  estimateType?: string;

  /**
   * Maxmimum number of units of gas to use for this transaction.
   */
  gas?: string;

  /**
   * Price per gas for legacy transactions.
   */
  gasPrice?: string;

  /**
   * Maximum amount per gas to pay for the transaction, including the priority fee.
   */
  maxFeePerGas?: string;

  /**
   * Maximum amount per gas to give to validator as incentive.
   */
  maxPriorityFeePerGas?: string;
};

/**
 * Data concerning an error while processing a transaction.
 */
export type TransactionError = {
  /**
   * A descriptive error name.
   */
  name: string;

  /**
   * A descriptive error message providing details about the encountered error.
   */
  message: string;

  /**
   * The stack trace associated with the error, if available.
   */
  stack?: string;

  /**
   * An optional error code associated with the error.
   */
  code?: string;

  /**
   * The rpc property holds additional information related to the error.
   */
  // We are intentionally using `any` here instead of `Json` because it causes
  // `WritableDraft<TransactionMeta>` from Immer to cause TypeScript to error
  // with "Type instantiation is excessively deep and possibly infinite". See:
  // <https://github.com/immerjs/immer/issues/839>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: any;
};

/**
 * Type for security alert response from transaction validator.
 */
export type SecurityAlertResponse = {
  features?: string[];
  providerRequestsCount?: Record<string, number>;
  reason: string;
  result_type: string;
  securityAlertId?: string;
};

/** Alternate priority levels for which values are provided in gas fee estimates. */
export enum GasFeeEstimateLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

/** Type of gas fee estimate generated by a GasFeeFlow. */
export enum GasFeeEstimateType {
  FeeMarket = 'fee-market',
  Legacy = 'legacy',
  GasPrice = 'eth_gasPrice',
}

/** Gas fee estimates for a specific priority level. */
export type FeeMarketGasFeeEstimateForLevel = {
  /** Maximum amount to pay per gas. */
  maxFeePerGas: Hex;

  /** Maximum amount per gas to give to the validator as an incentive. */
  maxPriorityFeePerGas: Hex;
};

/** Gas fee estimates for a EIP-1559 transaction. */
export type FeeMarketGasFeeEstimates = {
  type: GasFeeEstimateType.FeeMarket;
  [GasFeeEstimateLevel.Low]: FeeMarketGasFeeEstimateForLevel;
  [GasFeeEstimateLevel.Medium]: FeeMarketGasFeeEstimateForLevel;
  [GasFeeEstimateLevel.High]: FeeMarketGasFeeEstimateForLevel;
};

/** Gas fee estimates for a legacy transaction. */
export type LegacyGasFeeEstimates = {
  type: GasFeeEstimateType.Legacy;
  [GasFeeEstimateLevel.Low]: Hex;
  [GasFeeEstimateLevel.Medium]: Hex;
  [GasFeeEstimateLevel.High]: Hex;
};

/** Gas fee estimates for a transaction retrieved with the eth_gasPrice method. */
export type GasPriceGasFeeEstimates = {
  type: GasFeeEstimateType.GasPrice;
  gasPrice: Hex;
};

/** Gas fee estimates for a transaction. */
export type GasFeeEstimates =
  | FeeMarketGasFeeEstimates
  | LegacyGasFeeEstimates
  | GasPriceGasFeeEstimates;

/** Request to a gas fee flow to obtain gas fee estimates. */
export type GasFeeFlowRequest = {
  /** An EthQuery instance to enable queries to the associated RPC provider. */
  ethQuery: EthQuery;

  /** Gas fee controller data matching the chain ID of the transaction. */
  gasFeeControllerData: GasFeeState;

  /** The messenger instance. */
  messenger: TransactionControllerMessenger;

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
   * @param args - The arguments for the matcher function.
   * @param args.transactionMeta - The transaction metadata.
   * @param args.messenger - The messenger instance.
   * @returns Whether the gas fee flow supports the transaction.
   */
  matchesTransaction({
    transactionMeta,
    messenger,
  }: {
    transactionMeta: TransactionMeta;
    messenger: TransactionControllerMessenger;
  }): boolean;

  /**
   * Get gas fee estimates for a specific transaction.
   *
   * @param request - The gas fee flow request.
   * @returns The gas fee flow response containing the gas fee estimates.
   */
  getGasFees: (request: GasFeeFlowRequest) => Promise<GasFeeFlowResponse>;
};

/** Request to a layer 1 gas fee flow to obtain layer 1 fee estimate. */
export type Layer1GasFeeFlowRequest = {
  /** RPC Provider instance. */
  provider: Provider;

  /** The metadata of the transaction to obtain estimates for. */
  transactionMeta: TransactionMeta;
};

/** Response from a layer 1 gas fee flow containing layer 1 fee estimate. */
export type Layer1GasFeeFlowResponse = {
  /** The gas fee estimates for the transaction. */
  layer1Fee: Hex;
};

/** A method of obtaining layer 1 gas fee estimates for a specific transaction. */
export type Layer1GasFeeFlow = {
  /**
   * Determine if the gas fee flow supports the specified transaction.
   *
   * @param args - The arguments for the matcher function.
   * @param args.transactionMeta - The transaction metadata.
   * @param args.messenger - The messenger instance.
   * @returns Whether the gas fee flow supports the transaction.
   */
  matchesTransaction({
    transactionMeta,
    messenger,
  }: {
    transactionMeta: TransactionMeta;
    messenger: TransactionControllerMessenger;
  }): boolean;

  /**
   * Get layer 1 gas fee estimates for a specific transaction.
   *
   * @param request - The gas fee flow request.
   * @returns The gas fee flow response containing the layer 1 gas fee estimate.
   */
  getLayer1Fee: (
    request: Layer1GasFeeFlowRequest,
  ) => Promise<Layer1GasFeeFlowResponse>;
};

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

  /** Whether the simulation response changed after a security check triggered a re-simulation. */
  isUpdatedAfterSecurityCheck?: boolean;

  /** Data concerning a change to the user's native balance. */
  nativeBalanceChange?: SimulationBalanceChange;

  /** Data concerning a change to the user's token balances. */
  tokenBalanceChanges: SimulationTokenBalanceChange[];
};

/** Gas fee properties for a legacy transaction. */
export type GasPriceValue = {
  /** Price per gas for legacy transactions. */
  gasPrice: string;
};

/** Gas fee properties for an EIP-1559 transaction. */
export type FeeMarketEIP1559Values = {
  /** Maximum amount to pay per gas. */
  maxFeePerGas: string;

  /** Maximum amount per gas to give to the validator as an incentive. */
  maxPriorityFeePerGas: string;
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
  transaction: TransactionParams;
};

export type InternalAccount = ReturnType<
  AccountsController['getSelectedAccount']
>;

/**
 * An authorization to be included in a `setCode` transaction.
 * Specifies code to be added to the authorization signer's EOA account.
 * Introduced in EIP-7702.
 */
export type Authorization = {
  /** Address of a smart contract that contains the code to be set. */
  address: Hex;

  /**
   * Specific chain the authorization applies to.
   * If not provided, defaults to the chain ID of the transaction.
   */
  chainId?: Hex;

  /**
   * Nonce at which the authorization will be valid.
   * If not provided, defaults to the nonce following the transaction's nonce.
   */
  nonce?: Hex;

  /** R component of the signature. */
  r?: Hex;

  /** S component of the signature. */
  s?: Hex;

  /** Y parity generated from the signature. */
  yParity?: Hex;
};

/**
 * An array of authorizations to be included in a `setCode` transaction.
 * Introduced in EIP-7702.
 */
export type AuthorizationList = Authorization[];

/**
 * The parameters of a transaction within an atomic batch.
 */
export type BatchTransactionParams = {
  /** Data used to invoke a function on the target smart contract or EOA. */
  data?: Hex;

  /**
   * Maximum number of units of gas to use for the transaction.
   * Not supported in EIP-7702 batches.
   */
  gas?: Hex;

  /**
   * Maximum amount per gas to pay for the transaction, including the priority fee.
   * Not supported in EIP-7702 batches.
   */
  maxFeePerGas?: Hex;

  /**
   * Maximum amount per gas to give to validator as incentive.
   * Not supported in EIP-7702 batches.
   */
  maxPriorityFeePerGas?: Hex;

  /** Address of the target contract or EOA. */
  to?: Hex;

  /** Native balance to transfer with the transaction. */
  value?: Hex;
};

/** Metadata for a nested transaction within a standard transaction. */
export type NestedTransactionMetadata = BatchTransactionParams & {
  /** Type of the nested transaction. */
  type?: TransactionType;
};

/**
 * An additional transaction dynamically added to a standard single transaction to form a batch.
 */
export type BatchTransaction = BatchTransactionParams & {
  /**
   * Whether the transaction is executed after the main transaction.
   * Defaults to `true`.
   */
  isAfter?: boolean;

  /** Type of the batch transaction. */
  type?: TransactionType;
};

/**
 * Specification for a single transaction within a batch request.
 */
export type TransactionBatchSingleRequest = {
  /** The total fiat values of the transaction, to support client metrics. */
  assetsFiatValues?: AssetsFiatValues;

  /** Data if the transaction already exists. */
  existingTransaction?: {
    /** ID of the existing transaction. */
    id: string;

    /** Optional callback to be invoked once the transaction is published. */
    onPublish?: (request: {
      /** Updated signature for the transaction, if applicable. */
      newSignature?: Hex;

      /** Hash of the transaction on the network. */
      transactionHash?: string;
    }) => void;

    /** Signed transaction data. */
    signedTransaction: Hex;
  };

  /** Parameters of the single transaction. */
  params: BatchTransactionParams;

  /** Type of the transaction. */
  type?: TransactionType;
};

/**
 * Request to submit a batch of transactions.
 * Currently only atomic batches are supported via EIP-7702.
 */
export type TransactionBatchRequest = {
  batchId?: Hex;

  /** Whether to disable batch transaction processing via an EIP-7702 upgraded account. */
  disable7702?: boolean;

  /** Whether to disable batch transaction via the `publishBatch` hook. */
  disableHook?: boolean;

  /** Whether to disable batch transaction via sequential transactions. */
  disableSequential?: boolean;

  /** Address of the account to submit the transaction batch. */
  from: Hex;

  /** Whether MetaMask will be compensated for the gas fee by the transaction. */
  isGasFeeIncluded?: boolean;

  /** ID of the network client to submit the transaction. */
  networkClientId: NetworkClientId;

  /** Origin of the request, such as a dApp hostname or `ORIGIN_METAMASK` if internal. */
  origin?: string;

  /** Whether an approval request should be created to require confirmation from the user. */
  requireApproval?: boolean;

  /** Security alert ID to persist on the transaction. */
  securityAlertId?: string;

  /** Transactions to be submitted as part of the batch. */
  transactions: TransactionBatchSingleRequest[];

  /**
   * Whether to use the publish batch hook to submit the batch.
   * Defaults to false.
   *
   * @deprecated This is no longer used and will be removed in a future version.
   * Use `disableHook`, `disable7702` and `disableSequential`.
   */
  useHook?: boolean;

  /**
   * Callback to trigger security validation in the client.
   *
   * @param request - The JSON-RPC request to validate.
   * @param chainId - The chain ID of the transaction batch.
   */
  validateSecurity?: (
    request: ValidateSecurityRequest,
    chainId: Hex,
  ) => Promise<void>;
};

/**
 * Result from submitting a transaction batch.
 */
export type TransactionBatchResult = {
  /** ID of the batch to locate related transactions. */
  batchId: Hex;
};

/**
 * Request parameters for updating a custodial transaction.
 */
export type UpdateCustodialTransactionRequest = {
  /** The ID of the transaction to update. */
  transactionId: string;

  /** The error message to be assigned in case transaction status update to failed. */
  errorMessage?: string;

  /** The new hash value to be assigned. */
  hash?: string;

  /** The new status value to be assigned. */
  status?: TransactionStatus;

  /** The new gas limit value to be assigned. */
  gasLimit?: string;

  /** The new gas price value to be assigned. */
  gasPrice?: string;

  /** The new max fee per gas value to be assigned. */
  maxFeePerGas?: string;

  /** The new max priority fee per gas value to be assigned. */
  maxPriorityFeePerGas?: string;

  /** The new nonce value to be assigned. */
  nonce?: string;

  /** The new transaction type (hardfork) to be assigned. */
  type?: TransactionEnvelopeType;
};

/**
 * Data returned from custom logic to publish a transaction.
 */
export type PublishHookResult = {
  /**
   * The hash of the transaction on the network.
   */
  transactionHash?: string;
};

/**
 * Custom logic to publish a transaction.
 *
 * @param transactionMeta - The metadata of the transaction to publish.
 * @param signedTx - The signed transaction data to publish.
 * @returns The result of the publish operation.
 */
export type PublishHook = (
  transactionMeta: TransactionMeta,
  signedTx: string,
) => Promise<PublishHookResult>;

/** Single transaction in a publish batch hook request. */
export type PublishBatchHookTransaction = {
  /** ID of the transaction. */
  id?: string;

  /** Parameters of the nested transaction. */
  params: BatchTransactionParams;

  /** Signed transaction data to publish. */
  signedTx: Hex;
};

/**
 * Data required to call a publish batch hook.
 */
export type PublishBatchHookRequest = {
  /** Address of the account to submit the transaction batch. */
  from: Hex;

  /** ID of the network client associated with the transaction batch. */
  networkClientId: string;

  /** Nested transactions to be submitted as part of the batch. */
  transactions: PublishBatchHookTransaction[];
};

/** Result of calling a publish batch hook. */
export type PublishBatchHookResult =
  | {
      /** Result data for each transaction in the batch. */
      results: {
        /** Hash of the transaction on the network. */
        transactionHash: Hex;
      }[];
    }
  | undefined;

/** Custom logic to publish a transaction batch. */
export type PublishBatchHook = (
  /** Data required to call the hook. */
  request: PublishBatchHookRequest,
) => Promise<PublishBatchHookResult>;

/**
 * Request to validate security of a transaction in the client.
 */
export type ValidateSecurityRequest = {
  /** JSON-RPC method to validate. */
  method: string;

  /** Parameters of the JSON-RPC method to validate. */
  params: unknown[];

  /** Optional EIP-7702 delegation to mock for the transaction sender. */
  delegationMock?: Hex;

  /** Origin of the request, such as a dApp hostname or `ORIGIN_METAMASK` if internal. */
  origin?: string;
};

/** Data required to pay for transaction gas using an ERC-20 token. */
export type GasFeeToken = {
  /** Amount needed for the gas fee. */
  amount: Hex;

  /** Current token balance of the sender. */
  balance: Hex;

  /** Decimals of the token. */
  decimals: number;

  /** Portion of the amount that is the fee paid to MetaMask. */
  fee?: Hex;

  /** Estimated gas limit required for original transaction. */
  gas: Hex;

  /** Estimated gas limit required for fee transfer. */
  gasTransfer?: Hex;

  /** The corresponding maxFeePerGas this token fee would equal. */
  maxFeePerGas: Hex;

  /** The corresponding maxPriorityFeePerGas this token fee would equal. */
  maxPriorityFeePerGas: Hex;

  /** Conversion rate of 1 token to native WEI. */
  rateWei: Hex;

  /** Account address to send the token to. */
  recipient: Hex;

  /** Symbol of the token. */
  symbol: string;

  /** Address of the token contract. */
  tokenAddress: Hex;
};

/** Request to check if atomic batch is supported for an account. */
export type IsAtomicBatchSupportedRequest = {
  /** Address of the account to check. */
  address: Hex;

  /**
   * IDs of specific chains to check.
   * If not provided, all supported chains will be checked.
   */
  chainIds?: Hex[];
};

/** Result of checking if atomic batch is supported for an account. */
export type IsAtomicBatchSupportedResult = IsAtomicBatchSupportedResultEntry[];

/** Info about atomic batch support for a single chain. */
export type IsAtomicBatchSupportedResultEntry = {
  /** ID of the chain. */
  chainId: Hex;

  /** Address of the contract that the account was upgraded to. */
  delegationAddress?: Hex;

  /** Whether the upgraded contract is supported. */
  isSupported: boolean;

  /** Address of the contract that the account would be upgraded to. */
  upgradeContractAddress?: Hex;
};

/**
 * Custom logic to be executed after a transaction is added.
 * Can optionally update the transaction by returning the `updateTransaction` callback.
 */
export type AfterAddHook = (request: {
  transactionMeta: TransactionMeta;
}) => Promise<{
  updateTransaction?: (transaction: TransactionMeta) => void;
}>;

/**
 * Custom logic to be executed after a transaction is simulated.
 * Can optionally update the transaction by returning the `updateTransaction` callback.
 */
export type AfterSimulateHook = (request: {
  transactionMeta: TransactionMeta;
}) => Promise<
  | {
      skipSimulation?: boolean;
      updateTransaction?: (transaction: TransactionMeta) => void;
    }
  | undefined
>;

/**
 * Custom logic to be executed before a transaction is signed.
 * Can optionally update the transaction by returning the `updateTransaction` callback.
 */
export type BeforeSignHook = (request: {
  transactionMeta: TransactionMeta;
}) => Promise<
  | {
      updateTransaction?: (transaction: TransactionMeta) => void;
    }
  | undefined
>;

/**
 * The total fiat values of the transaction, to support client metrics.
 */
export type AssetsFiatValues = {
  /**
   * The fiat value of the receiving assets.
   */
  receiving?: string;

  /**
   * The fiat value of the sending assets.
   */
  sending?: string;
};

/** Metadata specific to the MetaMask Pay feature. */
export type MetamaskPayMetadata = {
  /** Total fee from any bridge transactions, in fiat currency. */
  bridgeFeeFiat?: string;

  /** Chain ID of the payment token. */
  chainId?: Hex;

  /** Total network fee in fiat currency, including the original and bridge transactions. */
  networkFeeFiat?: string;

  /** Address of the payment token that the transaction funds were sourced from. */
  tokenAddress?: Hex;

  /** Total cost of the transaction in fiat currency, including gas, fees, and the funds themselves. */
  totalFiat?: string;
};

/**
 * Parameters for the transaction simulation API.
 */
export type GetSimulationConfig = (
  url: string,
  opts?: {
    txMeta?: TransactionMeta;
  },
) => Promise<{
  newUrl?: string;
  authorization?: string;
}>;

/**
 * Options for adding a transaction.
 */
export type AddTransactionOptions = {
  /** Unique ID to prevent duplicate requests.  */
  actionId?: string;

  /** Fiat values of the assets being sent and received. */
  assetsFiatValues?: AssetsFiatValues;

  /** Custom ID for the batch this transaction belongs to. */
  batchId?: Hex;

  /** Enum to indicate what device confirmed the transaction. */
  deviceConfirmedOn?: WalletDevice;

  /** Whether to disable the gas estimation buffer. */
  disableGasBuffer?: boolean;

  /** Whether MetaMask will be compensated for the gas fee by the transaction. */
  isGasFeeIncluded?: boolean;

  /** RPC method that requested the transaction. */
  method?: string;

  /** Params for any nested transactions encoded in the data. */
  nestedTransactions?: NestedTransactionMetadata[];

  /** ID of the network client for this transaction. */
  networkClientId: NetworkClientId;

  /** Origin of the transaction request, such as a dApp hostname. */
  origin?: string;

  /** Custom logic to publish the transaction. */
  publishHook?: PublishHook;

  /** Whether the transaction requires approval by the user, defaults to true unless explicitly disabled. */
  requireApproval?: boolean | undefined;

  /** Response from security validator. */
  securityAlertResponse?: SecurityAlertResponse;

  /** Entries to add to the `sendFlowHistory`. */
  sendFlowHistory?: SendFlowHistoryEntry[];

  /** Options for swaps transactions. */
  swaps?: {
    /** Whether the transaction has an approval transaction. */
    hasApproveTx?: boolean;

    /** Metadata for swap transaction. */
    meta?: Partial<TransactionMeta>;
  };

  /** Parent context for any new traces. */
  traceContext?: unknown;

  /** Type of transaction to add, such as 'cancel' or 'swap'. */
  type?: TransactionType;
};
