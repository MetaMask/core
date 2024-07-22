import { Hardfork } from '@ethereumjs/common';
import type { TypedTransaction } from '@ethereumjs/tx';
import type { AccountsControllerGetSelectedAccountAction } from '@metamask/accounts-controller';
import type { AddApprovalRequest } from '@metamask/approval-controller';
import type { ControllerGetStateAction, ControllerStateChangeEvent, RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { FetchGasFeeEstimateOptions, GasFeeState } from '@metamask/gas-fee-controller';
import type { BlockTracker, NetworkClientId, NetworkController, NetworkControllerStateChangeEvent, NetworkState, Provider, NetworkControllerFindNetworkClientIdByChainIdAction, NetworkControllerGetNetworkClientByIdAction } from '@metamask/network-controller';
import type { NonceLock, Transaction as NonceTrackerTransaction } from '@metamask/nonce-tracker';
import type { Hex } from '@metamask/utils';
import type { IncomingTransactionOptions } from './helpers/IncomingTransactionHelper';
import type { SavedGasFees, SecurityProviderRequest, SendFlowHistoryEntry, TransactionParams, TransactionMeta, TransactionReceipt, WalletDevice, SecurityAlertResponse, GasFeeFlowResponse } from './types';
import { TransactionType, TransactionStatus } from './types';
export declare const HARDFORK = Hardfork.London;
/**
 * Object with new transaction's meta and a promise resolving to the
 * transaction hash if successful.
 *
 * @property result - Promise resolving to a new transaction hash
 * @property transactionMeta - Meta information about this new transaction
 */
export interface Result {
    result: Promise<string>;
    transactionMeta: TransactionMeta;
}
export interface GasPriceValue {
    gasPrice: string;
}
export interface FeeMarketEIP1559Values {
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
}
/**
 * Method data registry object
 *
 * @property registryMethod - Registry method raw string
 * @property parsedRegistryMethod - Registry method object, containing name and method arguments
 */
export type MethodData = {
    registryMethod: string;
    parsedRegistryMethod: {
        name: string;
        args: {
            type: string;
        }[];
    } | {
        name?: any;
        args?: any;
    };
};
/**
 * Transaction controller state
 *
 * @property transactions - A list of TransactionMeta objects
 * @property methodData - Object containing all known method data information
 * @property lastFetchedBlockNumbers - Last fetched block numbers.
 */
export type TransactionControllerState = {
    transactions: TransactionMeta[];
    methodData: Record<string, MethodData>;
    lastFetchedBlockNumbers: {
        [key: string]: number;
    };
};
/**
 * Multiplier used to determine a transaction's increased gas fee during cancellation
 */
export declare const CANCEL_RATE = 1.1;
/**
 * Multiplier used to determine a transaction's increased gas fee during speed up
 */
export declare const SPEED_UP_RATE = 1.1;
/**
 * Represents the `TransactionController:getState` action.
 */
export type TransactionControllerGetStateAction = ControllerGetStateAction<typeof controllerName, TransactionControllerState>;
/**
 * The internal actions available to the TransactionController.
 */
export type TransactionControllerActions = TransactionControllerGetStateAction;
/**
 * Configuration options for the PendingTransactionTracker
 *
 * @property isResubmitEnabled - Whether transaction publishing is automatically retried.
 */
export type PendingTransactionOptions = {
    isResubmitEnabled?: () => boolean;
};
/**
 * TransactionController constructor options.
 *
 * @property blockTracker - The block tracker used to poll for new blocks data.
 * @property disableHistory - Whether to disable storing history in transaction metadata.
 * @property disableSendFlowHistory - Explicitly disable transaction metadata history.
 * @property disableSwaps - Whether to disable additional processing on swaps transactions.
 * @property getCurrentAccountEIP1559Compatibility - Whether or not the account supports EIP-1559.
 * @property getCurrentNetworkEIP1559Compatibility - Whether or not the network supports EIP-1559.
 * @property getExternalPendingTransactions - Callback to retrieve pending transactions from external sources.
 * @property getGasFeeEstimates - Callback to retrieve gas fee estimates.
 * @property getNetworkClientRegistry - Gets the network client registry.
 * @property getNetworkState - Gets the state of the network controller.
 * @property getPermittedAccounts - Get accounts that a given origin has permissions for.
 * @property getSavedGasFees - Gets the saved gas fee config.
 * @property getSelectedAddress - Gets the address of the currently selected account.
 * @property incomingTransactions - Configuration options for incoming transaction support.
 * @property isMultichainEnabled - Enable multichain support.
 * @property isSimulationEnabled - Whether new transactions will be automatically simulated.
 * @property messenger - The controller messenger.
 * @property onNetworkStateChange - Allows subscribing to network controller state changes.
 * @property pendingTransactions - Configuration options for pending transaction support.
 * @property provider - The provider used to create the underlying EthQuery instance.
 * @property securityProviderRequest - A function for verifying a transaction, whether it is malicious or not.
 * @property sign - Function used to sign transactions.
 * @property state - Initial state to set on this controller.
 * @property transactionHistoryLimit - Transaction history limit.
 * @property hooks - The controller hooks.
 * @property hooks.afterSign - Additional logic to execute after signing a transaction. Return false to not change the status to signed.
 * @property hooks.beforeApproveOnInit - Additional logic to execute before starting an approval flow for a transaction during initialization. Return false to skip the transaction.
 * @property hooks.beforeCheckPendingTransaction - Additional logic to execute before checking pending transactions. Return false to prevent the broadcast of the transaction.
 * @property hooks.beforePublish - Additional logic to execute before publishing a transaction. Return false to prevent the broadcast of the transaction.
 * @property hooks.getAdditionalSignArguments - Returns additional arguments required to sign a transaction.
 * @property hooks.publish - Alternate logic to publish a transaction.
 */
export type TransactionControllerOptions = {
    blockTracker: BlockTracker;
    disableHistory: boolean;
    disableSendFlowHistory: boolean;
    disableSwaps: boolean;
    getCurrentAccountEIP1559Compatibility?: () => Promise<boolean>;
    getCurrentNetworkEIP1559Compatibility: () => Promise<boolean>;
    getExternalPendingTransactions?: (address: string, chainId?: string) => NonceTrackerTransaction[];
    getGasFeeEstimates?: (options: FetchGasFeeEstimateOptions) => Promise<GasFeeState>;
    getNetworkClientRegistry: NetworkController['getNetworkClientRegistry'];
    getNetworkState: () => NetworkState;
    getPermittedAccounts: (origin?: string) => Promise<string[]>;
    getSavedGasFees?: (chainId: Hex) => SavedGasFees | undefined;
    incomingTransactions?: IncomingTransactionOptions;
    isMultichainEnabled: boolean;
    isSimulationEnabled?: () => boolean;
    messenger: TransactionControllerMessenger;
    onNetworkStateChange: (listener: (state: NetworkState) => void) => void;
    pendingTransactions?: PendingTransactionOptions;
    provider: Provider;
    securityProviderRequest?: SecurityProviderRequest;
    sign?: (transaction: TypedTransaction, from: string, transactionMeta?: TransactionMeta) => Promise<TypedTransaction>;
    state?: Partial<TransactionControllerState>;
    testGasFeeFlows?: boolean;
    transactionHistoryLimit: number;
    hooks: {
        afterSign?: (transactionMeta: TransactionMeta, signedTx: TypedTransaction) => boolean;
        beforeApproveOnInit?: (transactionMeta: TransactionMeta) => boolean;
        beforeCheckPendingTransaction?: (transactionMeta: TransactionMeta) => boolean;
        beforePublish?: (transactionMeta: TransactionMeta) => boolean;
        getAdditionalSignArguments?: (transactionMeta: TransactionMeta) => (TransactionMeta | undefined)[];
        publish?: (transactionMeta: TransactionMeta) => Promise<{
            transactionHash: string;
        }>;
    };
};
/**
 * The name of the {@link TransactionController}.
 */
declare const controllerName = "TransactionController";
/**
 * The external actions available to the {@link TransactionController}.
 */
export type AllowedActions = AddApprovalRequest | NetworkControllerFindNetworkClientIdByChainIdAction | NetworkControllerGetNetworkClientByIdAction | AccountsControllerGetSelectedAccountAction;
/**
 * The external events available to the {@link TransactionController}.
 */
export type AllowedEvents = NetworkControllerStateChangeEvent;
/**
 * Represents the `TransactionController:stateChange` event.
 */
export type TransactionControllerStateChangeEvent = ControllerStateChangeEvent<typeof controllerName, TransactionControllerState>;
/**
 * Represents the `TransactionController:incomingTransactionBlockReceived` event.
 */
export type TransactionControllerIncomingTransactionBlockReceivedEvent = {
    type: `${typeof controllerName}:incomingTransactionBlockReceived`;
    payload: [blockNumber: number];
};
/**
 * Represents the `TransactionController:postTransactionBalanceUpdated` event.
 */
export type TransactionControllerPostTransactionBalanceUpdatedEvent = {
    type: `${typeof controllerName}:postTransactionBalanceUpdated`;
    payload: [
        {
            transactionMeta: TransactionMeta;
            approvalTransactionMeta?: TransactionMeta;
        }
    ];
};
/**
 * Represents the `TransactionController:speedUpTransactionAdded` event.
 */
export type TransactionControllerSpeedupTransactionAddedEvent = {
    type: `${typeof controllerName}:speedupTransactionAdded`;
    payload: [transactionMeta: TransactionMeta];
};
/**
 * Represents the `TransactionController:transactionApproved` event.
 */
export type TransactionControllerTransactionApprovedEvent = {
    type: `${typeof controllerName}:transactionApproved`;
    payload: [
        {
            transactionMeta: TransactionMeta;
            actionId?: string;
        }
    ];
};
/**
 * Represents the `TransactionController:transactionConfirmed` event.
 */
export type TransactionControllerTransactionConfirmedEvent = {
    type: `${typeof controllerName}:transactionConfirmed`;
    payload: [transactionMeta: TransactionMeta];
};
/**
 * Represents the `TransactionController:transactionDropped` event.
 */
export type TransactionControllerTransactionDroppedEvent = {
    type: `${typeof controllerName}:transactionDropped`;
    payload: [{
        transactionMeta: TransactionMeta;
    }];
};
/**
 * Represents the `TransactionController:transactionFailed` event.
 */
export type TransactionControllerTransactionFailedEvent = {
    type: `${typeof controllerName}:transactionFailed`;
    payload: [
        {
            actionId?: string;
            error: string;
            transactionMeta: TransactionMeta;
        }
    ];
};
/**
 * Represents the `TransactionController:transactionFinished` event.
 */
export type TransactionControllerTransactionFinishedEvent = {
    type: `${typeof controllerName}:transactionFinished`;
    payload: [transactionMeta: TransactionMeta];
};
/**
 * Represents the `TransactionController:transactionNewSwapApproval` event.
 */
export type TransactionControllerTransactionNewSwapApprovalEvent = {
    type: `${typeof controllerName}:transactionNewSwapApproval`;
    payload: [{
        transactionMeta: TransactionMeta;
    }];
};
/**
 * Represents the `TransactionController:transactionNewSwap` event.
 */
export type TransactionControllerTransactionNewSwapEvent = {
    type: `${typeof controllerName}:transactionNewSwap`;
    payload: [{
        transactionMeta: TransactionMeta;
    }];
};
/**
 * Represents the `TransactionController:transactionNewSwapApproval` event.
 */
export type TransactionControllerTransactionNewSwapAndSendEvent = {
    type: `${typeof controllerName}:transactionNewSwapAndSend`;
    payload: [{
        transactionMeta: TransactionMeta;
    }];
};
/**
 * Represents the `TransactionController:transactionPublishingSkipped` event.
 */
export type TransactionControllerTransactionPublishingSkipped = {
    type: `${typeof controllerName}:transactionPublishingSkipped`;
    payload: [transactionMeta: TransactionMeta];
};
/**
 * Represents the `TransactionController:transactionRejected` event.
 */
export type TransactionControllerTransactionRejectedEvent = {
    type: `${typeof controllerName}:transactionRejected`;
    payload: [
        {
            transactionMeta: TransactionMeta;
            actionId?: string;
        }
    ];
};
/**
 * Represents the `TransactionController:transactionStatusUpdated` event.
 */
export type TransactionControllerTransactionStatusUpdatedEvent = {
    type: `${typeof controllerName}:transactionStatusUpdated`;
    payload: [
        {
            transactionMeta: TransactionMeta;
        }
    ];
};
/**
 * Represents the `TransactionController:transactionSubmitted` event.
 */
export type TransactionControllerTransactionSubmittedEvent = {
    type: `${typeof controllerName}:transactionSubmitted`;
    payload: [
        {
            transactionMeta: TransactionMeta;
            actionId?: string;
        }
    ];
};
/**
 * Represents the `TransactionController:unapprovedTransactionAdded` event.
 */
export type TransactionControllerUnapprovedTransactionAddedEvent = {
    type: `${typeof controllerName}:unapprovedTransactionAdded`;
    payload: [transactionMeta: TransactionMeta];
};
/**
 * The internal events available to the {@link TransactionController}.
 */
export type TransactionControllerEvents = TransactionControllerIncomingTransactionBlockReceivedEvent | TransactionControllerPostTransactionBalanceUpdatedEvent | TransactionControllerSpeedupTransactionAddedEvent | TransactionControllerStateChangeEvent | TransactionControllerTransactionApprovedEvent | TransactionControllerTransactionConfirmedEvent | TransactionControllerTransactionDroppedEvent | TransactionControllerTransactionFailedEvent | TransactionControllerTransactionFinishedEvent | TransactionControllerTransactionNewSwapApprovalEvent | TransactionControllerTransactionNewSwapEvent | TransactionControllerTransactionNewSwapAndSendEvent | TransactionControllerTransactionPublishingSkipped | TransactionControllerTransactionRejectedEvent | TransactionControllerTransactionStatusUpdatedEvent | TransactionControllerTransactionSubmittedEvent | TransactionControllerUnapprovedTransactionAddedEvent;
/**
 * The messenger of the {@link TransactionController}.
 */
export type TransactionControllerMessenger = RestrictedControllerMessenger<typeof controllerName, TransactionControllerActions | AllowedActions, TransactionControllerEvents | AllowedEvents, AllowedActions['type'], AllowedEvents['type']>;
/**
 * Possible states of the approve transaction step.
 */
export declare enum ApprovalState {
    Approved = "approved",
    NotApproved = "not-approved",
    SkippedViaBeforePublishHook = "skipped-via-before-publish-hook"
}
/**
 * Controller responsible for submitting and managing transactions.
 */
export declare class TransactionController extends BaseController<typeof controllerName, TransactionControllerState, TransactionControllerMessenger> {
    #private;
    private readonly isHistoryDisabled;
    private readonly isSwapsDisabled;
    private readonly isSendFlowHistoryDisabled;
    private readonly approvingTransactionIds;
    private readonly nonceTracker;
    private readonly registry;
    private readonly mutex;
    private readonly gasFeeFlows;
    private readonly getSavedGasFees;
    private readonly getNetworkState;
    private readonly getCurrentAccountEIP1559Compatibility;
    private readonly getCurrentNetworkEIP1559Compatibility;
    private readonly getGasFeeEstimates;
    private readonly getPermittedAccounts;
    private readonly getExternalPendingTransactions;
    private readonly layer1GasFeeFlows;
    private readonly incomingTransactionHelper;
    private readonly securityProviderRequest?;
    private readonly pendingTransactionTracker;
    private readonly signAbortCallbacks;
    private readonly afterSign;
    private readonly beforeApproveOnInit;
    private readonly beforeCheckPendingTransaction;
    private readonly beforePublish;
    private readonly publish;
    private readonly getAdditionalSignArguments;
    private failTransaction;
    private registryLookup;
    /**
     * Method used to sign transactions
     */
    sign?: (transaction: TypedTransaction, from: string, transactionMeta?: TransactionMeta) => Promise<TypedTransaction>;
    /**
     * Constructs a TransactionController.
     *
     * @param options - The controller options.
     * @param options.blockTracker - The block tracker used to poll for new blocks data.
     * @param options.disableHistory - Whether to disable storing history in transaction metadata.
     * @param options.disableSendFlowHistory - Explicitly disable transaction metadata history.
     * @param options.disableSwaps - Whether to disable additional processing on swaps transactions.
     * @param options.getCurrentAccountEIP1559Compatibility - Whether or not the account supports EIP-1559.
     * @param options.getCurrentNetworkEIP1559Compatibility - Whether or not the network supports EIP-1559.
     * @param options.getExternalPendingTransactions - Callback to retrieve pending transactions from external sources.
     * @param options.getGasFeeEstimates - Callback to retrieve gas fee estimates.
     * @param options.getNetworkClientRegistry - Gets the network client registry.
     * @param options.getNetworkState - Gets the state of the network controller.
     * @param options.getPermittedAccounts - Get accounts that a given origin has permissions for.
     * @param options.getSavedGasFees - Gets the saved gas fee config.
     * @param options.incomingTransactions - Configuration options for incoming transaction support.
     * @param options.isMultichainEnabled - Enable multichain support.
     * @param options.isSimulationEnabled - Whether new transactions will be automatically simulated.
     * @param options.messenger - The controller messenger.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param options.pendingTransactions - Configuration options for pending transaction support.
     * @param options.provider - The provider used to create the underlying EthQuery instance.
     * @param options.securityProviderRequest - A function for verifying a transaction, whether it is malicious or not.
     * @param options.sign - Function used to sign transactions.
     * @param options.state - Initial state to set on this controller.
     * @param options.testGasFeeFlows - Whether to use the test gas fee flow.
     * @param options.transactionHistoryLimit - Transaction history limit.
     * @param options.hooks - The controller hooks.
     */
    constructor({ blockTracker, disableHistory, disableSendFlowHistory, disableSwaps, getCurrentAccountEIP1559Compatibility, getCurrentNetworkEIP1559Compatibility, getExternalPendingTransactions, getGasFeeEstimates, getNetworkClientRegistry, getNetworkState, getPermittedAccounts, getSavedGasFees, incomingTransactions, isMultichainEnabled, isSimulationEnabled, messenger, onNetworkStateChange, pendingTransactions, provider, securityProviderRequest, sign, state, testGasFeeFlows, transactionHistoryLimit, hooks, }: TransactionControllerOptions);
    /**
     * Stops polling and removes listeners to prepare the controller for garbage collection.
     */
    destroy(): void;
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
     * @param txParams - Standard parameters for an Ethereum transaction.
     * @param opts - Additional options to control how the transaction is added.
     * @param opts.actionId - Unique ID to prevent duplicate requests.
     * @param opts.deviceConfirmedOn - An enum to indicate what device confirmed the transaction.
     * @param opts.method - RPC method that requested the transaction.
     * @param opts.origin - The origin of the transaction request, such as a dApp hostname.
     * @param opts.requireApproval - Whether the transaction requires approval by the user, defaults to true unless explicitly disabled.
     * @param opts.securityAlertResponse - Response from security validator.
     * @param opts.sendFlowHistory - The sendFlowHistory entries to add.
     * @param opts.type - Type of transaction to add, such as 'cancel' or 'swap'.
     * @param opts.swaps - Options for swaps transactions.
     * @param opts.swaps.hasApproveTx - Whether the transaction has an approval transaction.
     * @param opts.swaps.meta - Metadata for swap transaction.
     * @param opts.networkClientId - The id of the network client for this transaction.
     * @returns Object containing a promise resolving to the transaction hash if approved.
     */
    addTransaction(txParams: TransactionParams, { actionId, deviceConfirmedOn, method, origin, requireApproval, securityAlertResponse, sendFlowHistory, swaps, type, networkClientId: requestNetworkClientId, }?: {
        actionId?: string;
        deviceConfirmedOn?: WalletDevice;
        method?: string;
        origin?: string;
        requireApproval?: boolean | undefined;
        securityAlertResponse?: SecurityAlertResponse;
        sendFlowHistory?: SendFlowHistoryEntry[];
        swaps?: {
            hasApproveTx?: boolean;
            meta?: Partial<TransactionMeta>;
        };
        type?: TransactionType;
        networkClientId?: NetworkClientId;
    }): Promise<Result>;
    startIncomingTransactionPolling(networkClientIds?: NetworkClientId[]): void;
    stopIncomingTransactionPolling(networkClientIds?: NetworkClientId[]): void;
    stopAllIncomingTransactionPolling(): void;
    updateIncomingTransactions(networkClientIds?: NetworkClientId[]): Promise<void>;
    /**
     * Attempts to cancel a transaction based on its ID by setting its status to "rejected"
     * and emitting a `<tx.id>:finished` hub event.
     *
     * @param transactionId - The ID of the transaction to cancel.
     * @param gasValues - The gas values to use for the cancellation transaction.
     * @param options - The options for the cancellation transaction.
     * @param options.actionId - Unique ID to prevent duplicate requests.
     * @param options.estimatedBaseFee - The estimated base fee of the transaction.
     */
    stopTransaction(transactionId: string, gasValues?: GasPriceValue | FeeMarketEIP1559Values, { estimatedBaseFee, actionId, }?: {
        estimatedBaseFee?: string;
        actionId?: string;
    }): Promise<void>;
    /**
     * Attempts to speed up a transaction increasing transaction gasPrice by ten percent.
     *
     * @param transactionId - The ID of the transaction to speed up.
     * @param gasValues - The gas values to use for the speed up transaction.
     * @param options - The options for the speed up transaction.
     * @param options.actionId - Unique ID to prevent duplicate requests
     * @param options.estimatedBaseFee - The estimated base fee of the transaction.
     */
    speedUpTransaction(transactionId: string, gasValues?: GasPriceValue | FeeMarketEIP1559Values, { actionId, estimatedBaseFee, }?: {
        actionId?: string;
        estimatedBaseFee?: string;
    }): Promise<void>;
    /**
     * Estimates required gas for a given transaction.
     *
     * @param transaction - The transaction to estimate gas for.
     * @param networkClientId - The network client id to use for the estimate.
     * @returns The gas and gas price.
     */
    estimateGas(transaction: TransactionParams, networkClientId?: NetworkClientId): Promise<{
        gas: string;
        simulationFails: {
            reason: any;
            errorKey: any;
            debug: {
                blockNumber: string;
                blockGasLimit: string;
            };
        } | undefined;
    }>;
    /**
     * Estimates required gas for a given transaction and add additional gas buffer with the given multiplier.
     *
     * @param transaction - The transaction params to estimate gas for.
     * @param multiplier - The multiplier to use for the gas buffer.
     * @param networkClientId - The network client id to use for the estimate.
     */
    estimateGasBuffered(transaction: TransactionParams, multiplier: number, networkClientId?: NetworkClientId): Promise<{
        gas: `0x${string}`;
        simulationFails: {
            reason: any;
            errorKey: any;
            debug: {
                blockNumber: string;
                blockGasLimit: string;
            };
        } | undefined;
    }>;
    /**
     * Updates an existing transaction in state.
     *
     * @param transactionMeta - The new transaction to store in state.
     * @param note - A note or update reason to include in the transaction history.
     */
    updateTransaction(transactionMeta: TransactionMeta, note: string): void;
    /**
     * Update the security alert response for a transaction.
     *
     * @param transactionId - ID of the transaction.
     * @param securityAlertResponse - The new security alert response for the transaction.
     */
    updateSecurityAlertResponse(transactionId: string, securityAlertResponse: SecurityAlertResponse): void;
    /**
     * Removes all transactions from state, optionally based on the current network.
     *
     * @param ignoreNetwork - Determines whether to wipe all transactions, or just those on the
     * current network. If `true`, all transactions are wiped.
     * @param address - If specified, only transactions originating from this address will be
     * wiped on current network.
     */
    wipeTransactions(ignoreNetwork?: boolean, address?: string): void;
    /**
     * Adds external provided transaction to state as confirmed transaction.
     *
     * @param transactionMeta - TransactionMeta to add transactions.
     * @param transactionReceipt - TransactionReceipt of the external transaction.
     * @param baseFeePerGas - Base fee per gas of the external transaction.
     */
    confirmExternalTransaction(transactionMeta: TransactionMeta, transactionReceipt: TransactionReceipt, baseFeePerGas: Hex): Promise<void>;
    /**
     * Append new send flow history to a transaction.
     *
     * @param transactionID - The ID of the transaction to update.
     * @param currentSendFlowHistoryLength - The length of the current sendFlowHistory array.
     * @param sendFlowHistoryToAdd - The sendFlowHistory entries to add.
     * @returns The updated transactionMeta.
     */
    updateTransactionSendFlowHistory(transactionID: string, currentSendFlowHistoryLength: number, sendFlowHistoryToAdd: SendFlowHistoryEntry[]): TransactionMeta;
    /**
     * Update the gas values of a transaction.
     *
     * @param transactionId - The ID of the transaction to update.
     * @param gasValues - Gas values to update.
     * @param gasValues.gas - Same as transaction.gasLimit.
     * @param gasValues.gasLimit - Maxmimum number of units of gas to use for this transaction.
     * @param gasValues.gasPrice - Price per gas for legacy transactions.
     * @param gasValues.maxPriorityFeePerGas - Maximum amount per gas to give to validator as incentive.
     * @param gasValues.maxFeePerGas - Maximum amount per gas to pay for the transaction, including the priority fee.
     * @param gasValues.estimateUsed - Which estimate level was used.
     * @param gasValues.estimateSuggested - Which estimate level that the API suggested.
     * @param gasValues.defaultGasEstimates - The default estimate for gas.
     * @param gasValues.originalGasEstimate - Original estimate for gas.
     * @param gasValues.userEditedGasLimit - The gas limit supplied by user.
     * @param gasValues.userFeeLevel - Estimate level user selected.
     * @returns The updated transactionMeta.
     */
    updateTransactionGasFees(transactionId: string, { defaultGasEstimates, estimateUsed, estimateSuggested, gas, gasLimit, gasPrice, maxPriorityFeePerGas, maxFeePerGas, originalGasEstimate, userEditedGasLimit, userFeeLevel, }: {
        defaultGasEstimates?: string;
        estimateUsed?: string;
        estimateSuggested?: string;
        gas?: string;
        gasLimit?: string;
        gasPrice?: string;
        maxPriorityFeePerGas?: string;
        maxFeePerGas?: string;
        originalGasEstimate?: string;
        userEditedGasLimit?: boolean;
        userFeeLevel?: string;
    }): TransactionMeta;
    /**
     * Update the previous gas values of a transaction.
     *
     * @param transactionId - The ID of the transaction to update.
     * @param previousGas - Previous gas values to update.
     * @param previousGas.gasLimit - Maxmimum number of units of gas to use for this transaction.
     * @param previousGas.maxFeePerGas - Maximum amount per gas to pay for the transaction, including the priority fee.
     * @param previousGas.maxPriorityFeePerGas - Maximum amount per gas to give to validator as incentive.
     * @returns The updated transactionMeta.
     */
    updatePreviousGasParams(transactionId: string, { gasLimit, maxFeePerGas, maxPriorityFeePerGas, }: {
        gasLimit?: string;
        maxFeePerGas?: string;
        maxPriorityFeePerGas?: string;
    }): TransactionMeta;
    getNonceLock(address: string, networkClientId?: NetworkClientId): Promise<NonceLock>;
    /**
     * Updates the editable parameters of a transaction.
     *
     * @param txId - The ID of the transaction to update.
     * @param params - The editable parameters to update.
     * @param params.data - Data to pass with the transaction.
     * @param params.gas - Maximum number of units of gas to use for the transaction.
     * @param params.gasPrice - Price per gas for legacy transactions.
     * @param params.from - Address to send the transaction from.
     * @param params.to - Address to send the transaction to.
     * @param params.value - Value associated with the transaction.
     * @returns The updated transaction metadata.
     */
    updateEditableParams(txId: string, { data, gas, gasPrice, from, to, value, }: {
        data?: string;
        gas?: string;
        gasPrice?: string;
        from?: string;
        to?: string;
        value?: string;
    }): Promise<Readonly<TransactionMeta> | undefined>;
    /**
     * Signs and returns the raw transaction data for provided transaction params list.
     *
     * @param listOfTxParams - The list of transaction params to approve.
     * @param opts - Options bag.
     * @param opts.hasNonce - Whether the transactions already have a nonce.
     * @returns The raw transactions.
     */
    approveTransactionsWithSameNonce(listOfTxParams?: (TransactionParams & {
        chainId: Hex;
    })[], { hasNonce }?: {
        hasNonce?: boolean;
    }): Promise<string | string[]>;
    /**
     * Update a custodial transaction.
     *
     * @param transactionId - The ID of the transaction to update.
     * @param options - The custodial transaction options to update.
     * @param options.errorMessage - The error message to be assigned in case transaction status update to failed.
     * @param options.hash - The new hash value to be assigned.
     * @param options.status - The new status value to be assigned.
     */
    updateCustodialTransaction(transactionId: string, { errorMessage, hash, status, }: {
        errorMessage?: string;
        hash?: string;
        status?: TransactionStatus;
    }): void;
    /**
     * Creates approvals for all unapproved transactions persisted.
     */
    initApprovals(): void;
    /**
     * Search transaction metadata for matching entries.
     *
     * @param opts - Options bag.
     * @param opts.searchCriteria - An object containing values or functions for transaction properties to filter transactions with.
     * @param opts.initialList - The transactions to search. Defaults to the current state.
     * @param opts.filterToCurrentNetwork - Whether to filter the results to the current network. Defaults to true.
     * @param opts.limit - The maximum number of transactions to return. No limit by default.
     * @returns An array of transactions matching the provided options.
     */
    getTransactions({ searchCriteria, initialList, filterToCurrentNetwork, limit, }?: {
        searchCriteria?: any;
        initialList?: TransactionMeta[];
        filterToCurrentNetwork?: boolean;
        limit?: number;
    }): TransactionMeta[];
    estimateGasFee({ transactionParams, chainId, networkClientId: requestNetworkClientId, }: {
        transactionParams: TransactionParams;
        chainId?: Hex;
        networkClientId?: NetworkClientId;
    }): Promise<GasFeeFlowResponse>;
    /**
     * Determine the layer 1 gas fee for the given transaction parameters.
     *
     * @param request - The request object.
     * @param request.transactionParams - The transaction parameters to estimate the layer 1 gas fee for.
     * @param request.chainId - The ID of the chain where the transaction will be executed.
     * @param request.networkClientId - The ID of a specific network client to process the transaction.
     */
    getLayer1GasFee({ transactionParams, chainId, networkClientId, }: {
        transactionParams: TransactionParams;
        chainId?: Hex;
        networkClientId?: NetworkClientId;
    }): Promise<Hex | undefined>;
    private signExternalTransaction;
    /**
     * Removes unapproved transactions from state.
     */
    clearUnapprovedTransactions(): void;
    /**
     * Stop the signing process for a specific transaction.
     * Throws an error causing the transaction status to be set to failed.
     * @param transactionId - The ID of the transaction to stop signing.
     */
    abortTransactionSigning(transactionId: string): void;
    private addMetadata;
    private updateGasProperties;
    private onBootCleanup;
    /**
     * Force submit approved transactions for all chains.
     */
    private submitApprovedTransactions;
    private processApproval;
    /**
     * Approves a transaction and updates it's status in state. If this is not a
     * retry transaction, a nonce will be generated. The transaction is signed
     * using the sign configuration property, then published to the blockchain.
     * A `<tx.id>:finished` hub event is fired after success or failure.
     *
     * @param transactionId - The ID of the transaction to approve.
     */
    private approveTransaction;
    private publishTransaction;
    /**
     * Cancels a transaction based on its ID by setting its status to "rejected"
     * and emitting a `<tx.id>:finished` hub event.
     *
     * @param transactionId - The ID of the transaction to cancel.
     * @param actionId - The actionId passed from UI
     */
    private cancelTransaction;
    /**
     * Trim the amount of transactions that are set on the state. Checks
     * if the length of the tx history is longer then desired persistence
     * limit and then if it is removes the oldest confirmed or rejected tx.
     * Pending or unapproved transactions will not be removed by this
     * operation. For safety of presenting a fully functional transaction UI
     * representation, this function will not break apart transactions with the
     * same nonce, created on the same day, per network. Not accounting for
     * transactions of the same nonce, same day and network combo can result in
     * confusing or broken experiences in the UI.
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
     * Whether the transaction has at least completed all local processing.
     *
     * @param status - The transaction status.
     * @returns Whether the transaction is in a final state.
     */
    private isLocalFinalState;
    private requestApproval;
    private getTransaction;
    private getTransactionOrThrow;
    private getApprovalId;
    private isTransactionCompleted;
    private getChainId;
    private prepareUnsignedEthTx;
    /**
     * `@ethereumjs/tx` uses `@ethereumjs/common` as a configuration tool for
     * specifying which chain, network, hardfork and EIPs to support for
     * a transaction. By referencing this configuration, and analyzing the fields
     * specified in txParams, @ethereumjs/tx is able to determine which EIP-2718
     * transaction type to use.
     *
     * @param chainId - The chainId to use for the configuration.
     * @returns common configuration object
     */
    private getCommonConfiguration;
    private onIncomingTransactions;
    private onUpdatedLastFetchedBlockNumbers;
    private generateDappSuggestedGasFees;
    /**
     * Validates and adds external provided transaction to state.
     *
     * @param transactionMeta - Nominated external transaction to be added to state.
     * @returns The new transaction.
     */
    private addExternalTransaction;
    /**
     * Sets other txMeta statuses to dropped if the txMeta that has been confirmed has other transactions
     * in the transactions have the same nonce.
     *
     * @param transactionId - Used to identify original transaction.
     */
    private markNonceDuplicatesDropped;
    /**
     * Method to set transaction status to dropped.
     *
     * @param transactionMeta - TransactionMeta of transaction to be marked as dropped.
     */
    private setTransactionStatusDropped;
    /**
     * Get transaction with provided actionId.
     *
     * @param actionId - Unique ID to prevent duplicate requests
     * @returns the filtered transaction
     */
    private getTransactionWithActionId;
    private waitForTransactionFinished;
    /**
     * Updates the r, s, and v properties of a TransactionMeta object
     * with values from a signed transaction.
     *
     * @param transactionMeta - The TransactionMeta object to update.
     * @param signedTx - The encompassing type for all transaction types containing r, s, and v values.
     * @returns The updated TransactionMeta object.
     */
    private updateTransactionMetaRSV;
    private getEIP1559Compatibility;
    private signTransaction;
    private onTransactionStatusChange;
    private getNonceTrackerTransactions;
    private onConfirmedTransaction;
    private updatePostBalance;
    private publishTransactionForRetry;
    /**
     * Ensures that error is a nonce issue
     *
     * @param error - The error to check
     * @returns Whether or not the error is a nonce issue
     */
    private isTransactionAlreadyConfirmedError;
}
export {};
//# sourceMappingURL=TransactionController.d.ts.map