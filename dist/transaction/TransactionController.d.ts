/// <reference types="node" />
import { EventEmitter } from 'events';
import Common from '@ethereumjs/common';
import { TypedTransaction } from '@ethereumjs/tx';
import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type { NetworkState, NetworkController } from '../network/NetworkController';
/**
 * @type Result
 * @property result - Promise resolving to a new transaction hash
 * @property transactionMeta - Meta information about this new transaction
 */
export interface Result {
    result: Promise<string>;
    transactionMeta: TransactionMeta;
}
/**
 * @type Fetch All Options
 * @property fromBlock - String containing a specific block decimal number
 * @property etherscanApiKey - API key to be used to fetch token transactions
 */
export interface FetchAllOptions {
    fromBlock?: string;
    etherscanApiKey?: string;
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
 * @property gasUsed -  Gas used in the transaction
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
}
export interface GasPriceValue {
    gasPrice: string;
}
export interface FeeMarketEIP1559Values {
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
}
/**
 * The status of the transaction. Each status represents the state of the transaction internally
 * in the wallet. Some of these correspond with the state of the transaction on the network, but
 * some are wallet-specific.
 */
export declare enum TransactionStatus {
    approved = "approved",
    cancelled = "cancelled",
    confirmed = "confirmed",
    failed = "failed",
    rejected = "rejected",
    signed = "signed",
    submitted = "submitted",
    unapproved = "unapproved"
}
/**
 * Options for wallet device.
 */
export declare enum WalletDevice {
    MM_MOBILE = "metamask_mobile",
    MM_EXTENSION = "metamask_extension",
    OTHER = "other_device"
}
declare type TransactionMetaBase = {
    isTransfer?: boolean;
    transferInformation?: {
        symbol: string;
        contractAddress: string;
        decimals: number;
    };
    id: string;
    networkID?: string;
    chainId?: string;
    origin?: string;
    rawTransaction?: string;
    time: number;
    toSmartContract?: boolean;
    transaction: Transaction;
    transactionHash?: string;
    blockNumber?: string;
    deviceConfirmedOn?: WalletDevice;
    verifiedOnBlockchain?: boolean;
};
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
export declare type TransactionMeta = ({
    status: Exclude<TransactionStatus, TransactionStatus.failed>;
} & TransactionMetaBase) | ({
    status: TransactionStatus.failed;
    error: Error;
} & TransactionMetaBase);
/**
 * @type EtherscanTransactionMeta
 *
 * EtherscanTransactionMeta representation
 * @property blockNumber - Number of the block where the transaction has been included
 * @property timeStamp - Timestamp associated with this transaction
 * @property hash - Hash of a successful transaction
 * @property nonce - Nonce of the transaction
 * @property blockHash - Hash of the block where the transaction has been included
 * @property transactionIndex - Etherscan internal index for this transaction
 * @property from - Address to send this transaction from
 * @property to - Address to send this transaction to
 * @property gas - Gas to send with this transaction
 * @property gasPrice - Price of gas with this transaction
 * @property isError - Synthesized error information for failed transactions
 * @property txreceipt_status - Receipt status for this transaction
 * @property input - input of the transaction
 * @property contractAddress - Address of the contract
 * @property cumulativeGasUsed - Amount of gas used
 * @property confirmations - Number of confirmations
 */
export interface EtherscanTransactionMeta {
    blockNumber: string;
    timeStamp: string;
    hash: string;
    nonce: string;
    blockHash: string;
    transactionIndex: string;
    from: string;
    to: string;
    value: string;
    gas: string;
    gasPrice: string;
    cumulativeGasUsed: string;
    gasUsed: string;
    isError: string;
    txreceipt_status: string;
    input: string;
    contractAddress: string;
    confirmations: string;
    tokenDecimal: string;
    tokenSymbol: string;
}
/**
 * @type TransactionConfig
 *
 * Transaction controller configuration
 * @property interval - Polling interval used to fetch new currency rate
 * @property provider - Provider used to create a new underlying EthQuery instance
 * @property sign - Method used to sign transactions
 */
export interface TransactionConfig extends BaseConfig {
    interval: number;
    sign?: (transaction: Transaction, from: string) => Promise<any>;
    txHistoryLimit: number;
}
/**
 * @type MethodData
 *
 * Method data registry object
 * @property registryMethod - Registry method raw string
 * @property parsedRegistryMethod - Registry method object, containing name and method arguments
 */
export interface MethodData {
    registryMethod: string;
    parsedRegistryMethod: Record<string, unknown>;
}
/**
 * @type TransactionState
 *
 * Transaction controller state
 * @property transactions - A list of TransactionMeta objects
 * @property methodData - Object containing all known method data information
 */
export interface TransactionState extends BaseState {
    transactions: TransactionMeta[];
    methodData: {
        [key: string]: MethodData;
    };
}
/**
 * Multiplier used to determine a transaction's increased gas fee during cancellation
 */
export declare const CANCEL_RATE = 1.5;
/**
 * Multiplier used to determine a transaction's increased gas fee during speed up
 */
export declare const SPEED_UP_RATE = 1.1;
/**
 * Controller responsible for submitting and managing transactions
 */
export declare class TransactionController extends BaseController<TransactionConfig, TransactionState> {
    private ethQuery;
    private registry;
    private handle?;
    private mutex;
    private getNetworkState;
    private failTransaction;
    private registryLookup;
    /**
     * Normalizes the transaction information from etherscan
     * to be compatible with the TransactionMeta interface.
     *
     * @param txMeta - The transaction.
     * @param currentNetworkID - The current network ID.
     * @param currentChainId - The current chain ID.
     * @returns The normalized transaction.
     */
    private normalizeTx;
    private normalizeTokenTx;
    /**
     * EventEmitter instance used to listen to specific transactional events
     */
    hub: EventEmitter;
    /**
     * Name of this controller used during composition
     */
    name: string;
    /**
     * Method used to sign transactions
     */
    sign?: (transaction: TypedTransaction, from: string) => Promise<TypedTransaction>;
    /**
     * Creates a TransactionController instance.
     *
     * @param options - The controller options.
     * @param options.getNetworkState - Gets the state of the network controller.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param options.getProvider - Returns a provider for the current network.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ getNetworkState, onNetworkStateChange, getProvider, }: {
        getNetworkState: () => NetworkState;
        onNetworkStateChange: (listener: (state: NetworkState) => void) => void;
        getProvider: () => NetworkController['provider'];
    }, config?: Partial<TransactionConfig>, state?: Partial<TransactionState>);
    /**
     * Starts a new polling interval.
     *
     * @param interval - The polling interval used to fetch new transaction statuses.
     */
    poll(interval?: number): Promise<void>;
    /**
     * Handle new method data request.
     *
     * @param fourBytePrefix - The method prefix.
     * @returns The method data object corresponding to the given signature prefix.
     */
    handleMethodData(fourBytePrefix: string): Promise<MethodData>;
    /**
     * Add a new unapproved transaction to state. Parameters will be validated, a
     * unique transaction id will be generated, and gas and gasPrice will be calculated
     * if not provided. If A `<tx.id>:unapproved` hub event will be emitted once added.
     *
     * @param transaction - The transaction object to add.
     * @param origin - The domain origin to append to the generated TransactionMeta.
     * @param deviceConfirmedOn - An enum to indicate what device the transaction was confirmed to append to the generated TransactionMeta.
     * @returns Object containing a promise resolving to the transaction hash if approved.
     */
    addTransaction(transaction: Transaction, origin?: string, deviceConfirmedOn?: WalletDevice): Promise<Result>;
    prepareUnsignedEthTx(txParams: Record<string, unknown>): TypedTransaction;
    /**
     * `@ethereumjs/tx` uses `@ethereumjs/common` as a configuration tool for
     * specifying which chain, network, hardfork and EIPs to support for
     * a transaction. By referencing this configuration, and analyzing the fields
     * specified in txParams, @ethereumjs/tx is able to determine which EIP-2718
     * transaction type to use.
     *
     * @returns {Common} common configuration object
     */
    getCommonConfiguration(): Common;
    /**
     * Approves a transaction and updates it's status in state. If this is not a
     * retry transaction, a nonce will be generated. The transaction is signed
     * using the sign configuration property, then published to the blockchain.
     * A `<tx.id>:finished` hub event is fired after success or failure.
     *
     * @param transactionID - The ID of the transaction to approve.
     */
    approveTransaction(transactionID: string): Promise<void>;
    /**
     * Cancels a transaction based on its ID by setting its status to "rejected"
     * and emitting a `<tx.id>:finished` hub event.
     *
     * @param transactionID - The ID of the transaction to cancel.
     */
    cancelTransaction(transactionID: string): void;
    /**
     * Attempts to cancel a transaction based on its ID by setting its status to "rejected"
     * and emitting a `<tx.id>:finished` hub event.
     *
     * @param transactionID - The ID of the transaction to cancel.
     * @param gasValues - The gas values to use for the cancellation transation.
     */
    stopTransaction(transactionID: string, gasValues?: GasPriceValue | FeeMarketEIP1559Values): Promise<void>;
    /**
     * Attempts to speed up a transaction increasing transaction gasPrice by ten percent.
     *
     * @param transactionID - The ID of the transaction to speed up.
     * @param gasValues - The gas values to use for the speed up transation.
     */
    speedUpTransaction(transactionID: string, gasValues?: GasPriceValue | FeeMarketEIP1559Values): Promise<void>;
    /**
     * Estimates required gas for a given transaction.
     *
     * @param transaction - The transaction to estimate gas for.
     * @returns The gas and gas price.
     */
    estimateGas(transaction: Transaction): Promise<{
        gas: string;
        gasPrice: any;
    }>;
    /**
     * Check the status of submitted transactions on the network to determine whether they have
     * been included in a block. Any that have been included in a block are marked as confirmed.
     */
    queryTransactionStatuses(): Promise<void>;
    /**
     * Updates an existing transaction in state.
     *
     * @param transactionMeta - The new transaction to store in state.
     */
    updateTransaction(transactionMeta: TransactionMeta): void;
    /**
     * Removes all transactions from state, optionally based on the current network.
     *
     * @param ignoreNetwork - Determines whether to wipe all transactions, or just those on the
     * current network. If `true`, all transactions are wiped.
     */
    wipeTransactions(ignoreNetwork?: boolean): void;
    /**
     * Get transactions from Etherscan for the given address. By default all transactions are
     * returned, but the `fromBlock` option can be given to filter just for transactions from a
     * specific block onward.
     *
     * @param address - The address to fetch the transactions for.
     * @param opt - Object containing optional data, fromBlock and Etherscan API key.
     * @returns The block number of the latest incoming transaction.
     */
    fetchAll(address: string, opt?: FetchAllOptions): Promise<string | void>;
    /**
     * Trim the amount of transactions that are set on the state. Checks
     * if the length of the tx history is longer then desired persistence
     * limit and then if it is removes the oldest confirmed or rejected tx.
     * Pending or unapproved transactions will not be removed by this
     * operation. For safety of presenting a fully functional transaction UI
     * representation, this function will not break apart transactions with the
     * same nonce, created on the same day, per network. Not accounting for transactions of the same
     * nonce, same day and network combo can result in confusing or broken experiences
     * in the UI. The transactions are then updated using the BaseController update.
     *
     * @param transactions - The transactions to be applied to the state.
     * @returns The trimmed list of transactions.
     */
    private trimTransactionsForState;
    /**
     * Determines if the transaction is in a final state.
     *
     * @param status - The transaction status.
     * @returns Whether the transaction is in a final state.
     */
    private isFinalState;
    /**
     * Method to verify the state of a transaction using the Blockchain as a source of truth.
     *
     * @param meta - The local transaction to verify on the blockchain.
     * @returns A tuple containing the updated transaction, and whether or not an update was required.
     */
    private blockchainTransactionStateReconciler;
    /**
     * Method to check if a tx has failed according to their receipt
     * According to the Web3 docs:
     * TRUE if the transaction was successful, FALSE if the EVM reverted the transaction.
     * The receipt is not available for pending transactions and returns null.
     *
     * @param txHash - The transaction hash.
     * @returns Whether the transaction has failed.
     */
    private checkTxReceiptStatusIsFailed;
    /**
     * Method to verify the state of transactions using Etherscan as a source of truth.
     *
     * @param remoteTxs - Transactions to reconcile that are from a remote source.
     * @param localTxs - Transactions to reconcile that are local.
     * @returns A tuple containing a boolean indicating whether or not an update was required, and the updated transaction.
     */
    private etherscanTransactionStateReconciler;
    /**
     * Get all transactions that are in the remote transactions array
     * but not in the local transactions array.
     *
     * @param remoteTxs - Array of transactions from remote source.
     * @param localTxs - Array of transactions stored locally.
     * @returns The new transactions.
     */
    private getNewTransactions;
    /**
     * Get all the transactions that are locally outdated with respect
     * to a remote source (etherscan or blockchain). The returned array
     * contains the transactions with the updated data.
     *
     * @param remoteTxs - Array of transactions from remote source.
     * @param localTxs - Array of transactions stored locally.
     * @returns The updated transactions.
     */
    private getUpdatedTransactions;
    /**
     * Verifies if a local transaction is outdated with respect to the remote transaction.
     *
     * @param remoteTx - The remote transaction from Etherscan.
     * @param localTx - The local transaction.
     * @returns Whether the transaction is outdated.
     */
    private isTransactionOutdated;
    /**
     * Verifies if the status of a local transaction is outdated with respect to the remote transaction.
     *
     * @param remoteTxHash - Remote transaction hash.
     * @param localTxHash - Local transaction hash.
     * @param remoteTxStatus - Remote transaction status.
     * @param localTxStatus - Local transaction status.
     * @returns Whether the status is outdated.
     */
    private isStatusOutdated;
    /**
     * Verifies if the gas data of a local transaction is outdated with respect to the remote transaction.
     *
     * @param remoteGasUsed - Remote gas used in the transaction.
     * @param localGasUsed - Local gas used in the transaction.
     * @returns Whether the gas data is outdated.
     */
    private isGasDataOutdated;
}
export default TransactionController;
