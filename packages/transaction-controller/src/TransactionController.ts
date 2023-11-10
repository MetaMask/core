import { Hardfork, Common, type ChainConfig } from '@ethereumjs/common';
import type { TypedTransaction } from '@ethereumjs/tx';
import { TransactionFactory } from '@ethereumjs/tx';
import type {
  AcceptResultCallbacks,
  AddApprovalRequest,
  AddResult,
} from '@metamask/approval-controller';
import type {
  BaseConfig,
  BaseState,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import {
  query,
  NetworkType,
  RPC,
  ApprovalType,
  ORIGIN_METAMASK,
  convertHexToDecimal,
} from '@metamask/controller-utils';
import EthQuery from '@metamask/eth-query';
import type { GasFeeState } from '@metamask/gas-fee-controller';
import type {
  BlockTracker,
  NetworkState,
  Provider,
} from '@metamask/network-controller';
import { errorCodes, rpcErrors, providerErrors } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import MethodRegistry from 'eth-method-registry';
import { addHexPrefix, bufferToHex } from 'ethereumjs-util';
import { EventEmitter } from 'events';
import { merge, pickBy } from 'lodash';
import NonceTracker from 'nonce-tracker';
import type { NonceLock } from 'nonce-tracker/dist/NonceTracker';
import { v1 as random } from 'uuid';

import { EtherscanRemoteTransactionSource } from './helpers/EtherscanRemoteTransactionSource';
import { IncomingTransactionHelper } from './helpers/IncomingTransactionHelper';
import { PendingTransactionTracker } from './helpers/PendingTransactionTracker';
import { projectLogger as log } from './logger';
import type {
  Events,
  DappSuggestedGasFees,
  SavedGasFees,
  SecurityProviderRequest,
  SendFlowHistoryEntry,
  TransactionParams,
  TransactionMeta,
  TransactionReceipt,
  WalletDevice,
  SecurityAlertResponse,
} from './types';
import {
  TransactionEnvelopeType,
  TransactionType,
  TransactionStatus,
} from './types';
import { validateConfirmedExternalTransaction } from './utils/external-transactions';
import { addGasBuffer, estimateGas, updateGas } from './utils/gas';
import { updateGasFees } from './utils/gas-fees';
import {
  addInitialHistorySnapshot,
  updateTransactionHistory,
} from './utils/history';
import {
  updatePostTransactionBalance,
  updateSwapsTransaction,
} from './utils/swaps';
import { determineTransactionType } from './utils/transaction-type';
import {
  getAndFormatTransactionsForNonceTracker,
  getIncreasedPriceFromExisting,
  normalizeTxParams,
  isEIP1559Transaction,
  isFeeMarketEIP1559Values,
  isGasPriceValue,
  validateGasValues,
  validateIfTransactionUnapproved,
  validateMinimumIncrease,
  normalizeTxError,
} from './utils/utils';
import {
  validateTransactionOrigin,
  validateTxParams,
} from './utils/validation';

export const HARDFORK = Hardfork.London;

/**
 * @type Result
 * @property result - Promise resolving to a new transaction hash
 * @property transactionMeta - Meta information about this new transaction
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface Result {
  result: Promise<string>;
  transactionMeta: TransactionMeta;
}

// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface GasPriceValue {
  gasPrice: string;
}

// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface FeeMarketEIP1559Values {
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

/**
 * @type TransactionConfig
 *
 * Transaction controller configuration
 * @property provider - Provider used to create a new underlying EthQuery instance
 * @property sign - Method used to sign transactions
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface TransactionConfig extends BaseConfig {
  sign?: (txParams: TransactionParams, from: string) => Promise<any>;
  txHistoryLimit: number;
}

/**
 * @type MethodData
 *
 * Method data registry object
 * @property registryMethod - Registry method raw string
 * @property parsedRegistryMethod - Registry method object, containing name and method arguments
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
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
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface TransactionState extends BaseState {
  transactions: TransactionMeta[];
  methodData: { [key: string]: MethodData };
  lastFetchedBlockNumbers: { [key: string]: number };
}

/**
 * Multiplier used to determine a transaction's increased gas fee during cancellation
 */
export const CANCEL_RATE = 1.5;

/**
 * Multiplier used to determine a transaction's increased gas fee during speed up
 */
export const SPEED_UP_RATE = 1.1;

/**
 * The name of the {@link TransactionController}.
 */
const controllerName = 'TransactionController';

/**
 * The external actions available to the {@link TransactionController}.
 */
type AllowedActions = AddApprovalRequest;

/**
 * The messenger of the {@link TransactionController}.
 */
export type TransactionControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  AllowedActions,
  never,
  AllowedActions['type'],
  never
>;

// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface TransactionControllerEventEmitter extends EventEmitter {
  on<T extends keyof Events>(
    eventName: T,
    listener: (...args: Events[T]) => void,
  ): this;

  emit<T extends keyof Events>(eventName: T, ...args: Events[T]): boolean;
}

/**
 * Controller responsible for submitting and managing transactions.
 */
export class TransactionController extends BaseController<
  TransactionConfig,
  TransactionState
> {
  private ethQuery: EthQuery;

  private readonly isHistoryDisabled: boolean;

  private readonly isSwapsDisabled: boolean;

  private readonly isSendFlowHistoryDisabled: boolean;

  private readonly inProcessOfSigning: Set<string> = new Set();

  private readonly nonceTracker: NonceTracker;

  private registry: any;

  private readonly provider: Provider;

  private readonly mutex = new Mutex();

  private readonly getSavedGasFees: (chainId: Hex) => SavedGasFees | undefined;

  private readonly getNetworkState: () => NetworkState;

  private readonly getCurrentAccountEIP1559Compatibility: () => Promise<boolean>;

  private readonly getCurrentNetworkEIP1559Compatibility: () => Promise<boolean>;

  private readonly getGasFeeEstimates: () => Promise<GasFeeState>;

  private readonly getPermittedAccounts: (origin?: string) => Promise<string[]>;

  private readonly getSelectedAddress: () => string;

  private readonly messagingSystem: TransactionControllerMessenger;

  private readonly incomingTransactionHelper: IncomingTransactionHelper;

  private readonly securityProviderRequest?: SecurityProviderRequest;

  private readonly pendingTransactionTracker: PendingTransactionTracker;

  private readonly afterSign: (
    transactionMeta: TransactionMeta,
    signedTx: TypedTransaction,
  ) => boolean;

  private readonly beforeApproveOnInit: (
    transactionMeta: TransactionMeta,
  ) => boolean;

  private readonly beforeCheckPendingTransaction: (
    transactionMeta: TransactionMeta,
  ) => boolean;

  private readonly beforePublish: (transactionMeta: TransactionMeta) => boolean;

  private readonly getAdditionalSignArguments: (
    transactionMeta: TransactionMeta,
  ) => (TransactionMeta | undefined)[];

  private failTransaction(
    transactionMeta: TransactionMeta,
    error: Error,
    actionId?: string,
  ) {
    const newTransactionMeta = {
      ...transactionMeta,
      error: normalizeTxError(error),
      status: TransactionStatus.failed,
    };
    this.hub.emit('transaction-failed', {
      actionId,
      error: error.message,
      transactionMeta: newTransactionMeta,
    });
    this.updateTransaction(
      newTransactionMeta,
      'TransactionController#failTransaction - Add error message and set status to failed',
    );
    this.hub.emit(`${transactionMeta.id}:finished`, newTransactionMeta);
  }

  private async registryLookup(fourBytePrefix: string): Promise<MethodData> {
    const registryMethod = await this.registry.lookup(fourBytePrefix);
    const parsedRegistryMethod = this.registry.parse(registryMethod);
    return { registryMethod, parsedRegistryMethod };
  }

  /**
   * EventEmitter instance used to listen to specific transactional events
   */
  hub = new EventEmitter() as TransactionControllerEventEmitter;

  /**
   * Name of this controller used during composition
   */
  override name = 'TransactionController';

  /**
   * Method used to sign transactions
   */
  sign?: (
    transaction: TypedTransaction,
    from: string,
    transactionMeta?: TransactionMeta,
  ) => Promise<TypedTransaction>;

  /**
   * Creates a TransactionController instance.
   *
   * @param options - The controller options.
   * @param options.blockTracker - The block tracker used to poll for new blocks data.
   * @param options.disableHistory - Whether to disable storing history in transaction metadata.
   * @param options.disableSendFlowHistory - Explicitly disable transaction metadata history.
   * @param options.disableSwaps - Whether to disable additional processing on swaps transactions.
   * @param options.getSavedGasFees - Gets the saved gas fee config.
   * @param options.getCurrentAccountEIP1559Compatibility - Whether or not the account supports EIP-1559.
   * @param options.getCurrentNetworkEIP1559Compatibility - Whether or not the network supports EIP-1559.
   * @param options.getGasFeeEstimates - Callback to retrieve gas fee estimates.
   * @param options.getNetworkState - Gets the state of the network controller.
   * @param options.getPermittedAccounts - Get accounts that a given origin has permissions for.
   * @param options.getSelectedAddress - Gets the address of the currently selected account.
   * @param options.incomingTransactions - Configuration options for incoming transaction support.
   * @param options.incomingTransactions.includeTokenTransfers - Whether or not to include ERC20 token transfers.
   * @param options.incomingTransactions.isEnabled - Whether or not incoming transaction retrieval is enabled.
   * @param options.incomingTransactions.queryEntireHistory - Whether to initially query the entire transaction history or only recent blocks.
   * @param options.incomingTransactions.updateTransactions - Whether to update local transactions using remote transaction data.
   * @param options.messenger - The controller messenger.
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
   * @param options.pendingTransactions - Configuration options for pending transaction support.
   * @param options.pendingTransactions.isResubmitEnabled - Whether transaction publishing is automatically retried.
   * @param options.provider - The provider used to create the underlying EthQuery instance.
   * @param options.securityProviderRequest - A function for verifying a transaction, whether it is malicious or not.
   * @param options.hooks - The controller hooks.
   * @param options.hooks.afterSign - Additional logic to execute after signing a transaction. Return false to not change the status to signed.
   * @param options.hooks.beforeApproveOnInit - Additional logic to execute before starting an approval flow for a transaction during initialization. Return false to skip the transaction.
   * @param options.hooks.beforeCheckPendingTransaction - Additional logic to execute before checking pending transactions. Return false to prevent the broadcast of the transaction.
   * @param options.hooks.beforePublish - Additional logic to execute before publishing a transaction. Return false to prevent the broadcast of the transaction.
   * @param options.hooks.getAdditionalSignArguments - Returns additional arguments required to sign a transaction.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      blockTracker,
      disableHistory,
      disableSendFlowHistory,
      disableSwaps,
      getSavedGasFees,
      getCurrentAccountEIP1559Compatibility,
      getCurrentNetworkEIP1559Compatibility,
      getGasFeeEstimates,
      getNetworkState,
      getPermittedAccounts,
      getSelectedAddress,
      incomingTransactions = {},
      messenger,
      onNetworkStateChange,
      pendingTransactions = {},
      provider,
      securityProviderRequest,
      hooks = {},
    }: {
      blockTracker: BlockTracker;
      disableHistory: boolean;
      disableSendFlowHistory: boolean;
      disableSwaps: boolean;
      getSavedGasFees?: (chainId: Hex) => SavedGasFees | undefined;
      getCurrentAccountEIP1559Compatibility: () => Promise<boolean>;
      getCurrentNetworkEIP1559Compatibility: () => Promise<boolean>;
      getGasFeeEstimates?: () => Promise<GasFeeState>;
      getNetworkState: () => NetworkState;
      getPermittedAccounts: (origin?: string) => Promise<string[]>;
      getSelectedAddress: () => string;
      incomingTransactions?: {
        includeTokenTransfers?: boolean;
        isEnabled?: () => boolean;
        queryEntireHistory?: boolean;
        updateTransactions?: boolean;
      };
      messenger: TransactionControllerMessenger;
      onNetworkStateChange: (listener: (state: NetworkState) => void) => void;
      pendingTransactions?: {
        isResubmitEnabled?: boolean;
      };
      provider: Provider;
      securityProviderRequest?: SecurityProviderRequest;
      hooks: {
        afterSign?: (
          transactionMeta: TransactionMeta,
          signedTx: TypedTransaction,
        ) => boolean;
        beforeApproveOnInit?: (transactionMeta: TransactionMeta) => boolean;
        beforeCheckPendingTransaction?: (
          transactionMeta: TransactionMeta,
        ) => boolean;
        beforePublish?: (transactionMeta: TransactionMeta) => boolean;
        getAdditionalSignArguments?: (
          transactionMeta: TransactionMeta,
        ) => (TransactionMeta | undefined)[];
      };
    },
    config?: Partial<TransactionConfig>,
    state?: Partial<TransactionState>,
  ) {
    super(config, state);

    this.defaultConfig = {
      txHistoryLimit: 40,
    };

    this.defaultState = {
      methodData: {},
      transactions: [],
      lastFetchedBlockNumbers: {},
    };

    this.initialize();

    this.provider = provider;
    this.messagingSystem = messenger;
    this.getNetworkState = getNetworkState;
    // @ts-expect-error TODO: Provider type alignment
    this.ethQuery = new EthQuery(provider);
    this.isSendFlowHistoryDisabled = disableSendFlowHistory ?? false;
    this.isHistoryDisabled = disableHistory ?? false;
    this.isSwapsDisabled = disableSwaps ?? false;
    this.registry = new MethodRegistry({ provider });
    this.getSavedGasFees = getSavedGasFees ?? ((_chainId) => undefined);
    this.getCurrentAccountEIP1559Compatibility =
      getCurrentAccountEIP1559Compatibility;
    this.getCurrentNetworkEIP1559Compatibility =
      getCurrentNetworkEIP1559Compatibility;
    this.getGasFeeEstimates =
      getGasFeeEstimates || (() => Promise.resolve({} as GasFeeState));
    this.getPermittedAccounts = getPermittedAccounts;
    this.getSelectedAddress = getSelectedAddress;
    this.securityProviderRequest = securityProviderRequest;

    this.afterSign = hooks?.afterSign ?? (() => true);
    this.beforeApproveOnInit = hooks?.beforeApproveOnInit ?? (() => true);
    this.beforeCheckPendingTransaction =
      hooks?.beforeCheckPendingTransaction ??
      /* istanbul ignore next */
      (() => true);
    this.beforePublish = hooks?.beforePublish ?? (() => true);
    this.getAdditionalSignArguments =
      hooks?.getAdditionalSignArguments ?? (() => []);

    this.nonceTracker = new NonceTracker({
      provider,
      blockTracker,
      getPendingTransactions: (address) =>
        getAndFormatTransactionsForNonceTracker(
          address,
          TransactionStatus.submitted,
          this.state.transactions,
        ),
      getConfirmedTransactions: (address) =>
        getAndFormatTransactionsForNonceTracker(
          address,
          TransactionStatus.confirmed,
          this.state.transactions,
        ),
    });

    this.incomingTransactionHelper = new IncomingTransactionHelper({
      blockTracker,
      getCurrentAccount: getSelectedAddress,
      getLastFetchedBlockNumbers: () => this.state.lastFetchedBlockNumbers,
      getNetworkState,
      isEnabled: incomingTransactions.isEnabled,
      queryEntireHistory: incomingTransactions.queryEntireHistory,
      remoteTransactionSource: new EtherscanRemoteTransactionSource({
        includeTokenTransfers: incomingTransactions.includeTokenTransfers,
      }),
      transactionLimit: this.config.txHistoryLimit,
      updateTransactions: incomingTransactions.updateTransactions,
    });

    this.incomingTransactionHelper.hub.on(
      'transactions',
      this.onIncomingTransactions.bind(this),
    );

    this.incomingTransactionHelper.hub.on(
      'updatedLastFetchedBlockNumbers',
      this.onUpdatedLastFetchedBlockNumbers.bind(this),
    );

    this.pendingTransactionTracker = new PendingTransactionTracker({
      approveTransaction: this.approveTransaction.bind(this),
      blockTracker,
      getChainId: this.getChainId.bind(this),
      getEthQuery: () => this.ethQuery,
      getTransactions: () => this.state.transactions,
      isResubmitEnabled: pendingTransactions.isResubmitEnabled,
      nonceTracker: this.nonceTracker,
      onStateChange: this.subscribe.bind(this),
      publishTransaction: this.publishTransaction.bind(this),
      hooks: {
        beforeCheckPendingTransaction:
          this.beforeCheckPendingTransaction.bind(this),
        beforePublish: this.beforePublish.bind(this),
      },
    });

    this.addPendingTransactionTrackerListeners();

    onNetworkStateChange(() => {
      // @ts-expect-error TODO: Provider type alignment
      this.ethQuery = new EthQuery(this.provider);
      this.registry = new MethodRegistry({ provider: this.provider });
      this.onBootCleanup();
    });

    this.onBootCleanup();
  }

  /**
   * Handle new method data request.
   *
   * @param fourBytePrefix - The method prefix.
   * @returns The method data object corresponding to the given signature prefix.
   */
  async handleMethodData(fourBytePrefix: string): Promise<MethodData> {
    const releaseLock = await this.mutex.acquire();
    try {
      const { methodData } = this.state;
      const knownMethod = Object.keys(methodData).find(
        (knownFourBytePrefix) => fourBytePrefix === knownFourBytePrefix,
      );
      if (knownMethod) {
        return methodData[fourBytePrefix];
      }
      const registry = await this.registryLookup(fourBytePrefix);
      this.update({
        methodData: { ...methodData, ...{ [fourBytePrefix]: registry } },
      });
      return registry;
    } finally {
      releaseLock();
    }
  }

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
   * @returns Object containing a promise resolving to the transaction hash if approved.
   */
  async addTransaction(
    txParams: TransactionParams,
    {
      actionId,
      deviceConfirmedOn,
      method,
      origin,
      requireApproval,
      securityAlertResponse,
      sendFlowHistory,
      swaps = {},
      type,
    }: {
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
    } = {},
  ): Promise<Result> {
    const chainId = this.getChainId();
    const { transactions } = this.state;
    txParams = normalizeTxParams(txParams);
    const isEIP1559Compatible = await this.getEIP1559Compatibility();
    validateTxParams(txParams, isEIP1559Compatible);
    if (origin) {
      await validateTransactionOrigin(
        await this.getPermittedAccounts(origin),
        this.getSelectedAddress(),
        txParams.from,
        origin,
      );
    }

    const dappSuggestedGasFees = this.generateDappSuggestedGasFees(
      txParams,
      origin,
    );

    const transactionType =
      type ?? (await determineTransactionType(txParams, this.ethQuery)).type;

    const existingTransactionMeta = this.getTransactionWithActionId(actionId);
    // If a request to add a transaction with the same actionId is submitted again, a new transaction will not be created for it.
    const transactionMeta: TransactionMeta = existingTransactionMeta || {
      // Add actionId to txMeta to check if same actionId is seen again
      actionId,
      chainId,
      dappSuggestedGasFees,
      deviceConfirmedOn,
      id: random(),
      origin,
      securityAlertResponse,
      status: TransactionStatus.unapproved as TransactionStatus.unapproved,
      time: Date.now(),
      txParams,
      userEditedGasLimit: false,
      verifiedOnBlockchain: false,
      type: transactionType,
    };

    await this.updateGasProperties(transactionMeta);

    // Checks if a transaction already exists with a given actionId
    if (!existingTransactionMeta) {
      // Set security provider response
      if (method && this.securityProviderRequest) {
        const securityProviderResponse = await this.securityProviderRequest(
          transactionMeta,
          method,
        );
        transactionMeta.securityProviderResponse = securityProviderResponse;
      }

      if (!this.isSendFlowHistoryDisabled) {
        transactionMeta.sendFlowHistory = sendFlowHistory ?? [];
      }
      // Initial history push
      if (!this.isHistoryDisabled) {
        addInitialHistorySnapshot(transactionMeta);
      }

      await updateSwapsTransaction(transactionMeta, transactionType, swaps, {
        isSwapsDisabled: this.isSwapsDisabled,
        cancelTransaction: this.cancelTransaction.bind(this),
        controllerHubEmitter: this.hub.emit.bind(this.hub) as any,
      });

      transactions.push(transactionMeta);
      this.update({
        transactions: this.trimTransactionsForState(transactions),
      });
      this.hub.emit(`unapprovedTransaction`, transactionMeta);
    }

    return {
      result: this.processApproval(transactionMeta, {
        isExisting: Boolean(existingTransactionMeta),
        requireApproval,
        actionId,
      }),
      transactionMeta,
    };
  }

  startIncomingTransactionPolling() {
    this.incomingTransactionHelper.start();
  }

  stopIncomingTransactionPolling() {
    this.incomingTransactionHelper.stop();
  }

  async updateIncomingTransactions() {
    await this.incomingTransactionHelper.update();
  }

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
  async stopTransaction(
    transactionId: string,
    gasValues?: GasPriceValue | FeeMarketEIP1559Values,
    {
      estimatedBaseFee,
      actionId,
    }: { estimatedBaseFee?: string; actionId?: string } = {},
  ) {
    if (gasValues) {
      validateGasValues(gasValues);
    }
    const transactionMeta = this.state.transactions.find(
      ({ id }) => id === transactionId,
    );
    if (!transactionMeta) {
      return;
    }

    if (!this.sign) {
      throw new Error('No sign method defined.');
    }

    // gasPrice (legacy non EIP1559)
    const minGasPrice = getIncreasedPriceFromExisting(
      transactionMeta.txParams.gasPrice,
      CANCEL_RATE,
    );

    const gasPriceFromValues = isGasPriceValue(gasValues) && gasValues.gasPrice;

    const newGasPrice =
      (gasPriceFromValues &&
        validateMinimumIncrease(gasPriceFromValues, minGasPrice)) ||
      minGasPrice;

    // maxFeePerGas (EIP1559)
    const existingMaxFeePerGas = transactionMeta.txParams?.maxFeePerGas;
    const minMaxFeePerGas = getIncreasedPriceFromExisting(
      existingMaxFeePerGas,
      CANCEL_RATE,
    );
    const maxFeePerGasValues =
      isFeeMarketEIP1559Values(gasValues) && gasValues.maxFeePerGas;
    const newMaxFeePerGas =
      (maxFeePerGasValues &&
        validateMinimumIncrease(maxFeePerGasValues, minMaxFeePerGas)) ||
      (existingMaxFeePerGas && minMaxFeePerGas);

    // maxPriorityFeePerGas (EIP1559)
    const existingMaxPriorityFeePerGas =
      transactionMeta.txParams?.maxPriorityFeePerGas;
    const minMaxPriorityFeePerGas = getIncreasedPriceFromExisting(
      existingMaxPriorityFeePerGas,
      CANCEL_RATE,
    );
    const maxPriorityFeePerGasValues =
      isFeeMarketEIP1559Values(gasValues) && gasValues.maxPriorityFeePerGas;
    const newMaxPriorityFeePerGas =
      (maxPriorityFeePerGasValues &&
        validateMinimumIncrease(
          maxPriorityFeePerGasValues,
          minMaxPriorityFeePerGas,
        )) ||
      (existingMaxPriorityFeePerGas && minMaxPriorityFeePerGas);

    const txParams: TransactionParams =
      newMaxFeePerGas && newMaxPriorityFeePerGas
        ? {
            from: transactionMeta.txParams.from,
            gasLimit: transactionMeta.txParams.gas,
            maxFeePerGas: newMaxFeePerGas,
            maxPriorityFeePerGas: newMaxPriorityFeePerGas,
            type: '2',
            nonce: transactionMeta.txParams.nonce,
            to: transactionMeta.txParams.from,
            value: '0x0',
          }
        : {
            from: transactionMeta.txParams.from,
            gasLimit: transactionMeta.txParams.gas,
            gasPrice: newGasPrice,
            nonce: transactionMeta.txParams.nonce,
            to: transactionMeta.txParams.from,
            value: '0x0',
          };

    const unsignedEthTx = this.prepareUnsignedEthTx(txParams);

    const signedTx = await this.sign(
      unsignedEthTx,
      transactionMeta.txParams.from,
    );
    await this.updateTransactionMetaRSV(transactionMeta, signedTx);
    const rawTx = bufferToHex(signedTx.serialize());
    await query(this.ethQuery, 'sendRawTransaction', [rawTx]);
    transactionMeta.estimatedBaseFee = estimatedBaseFee;
    transactionMeta.status = TransactionStatus.cancelled;

    // stopTransaction has no approval request, so we assume the user has already approved the transaction
    this.hub.emit('transaction-approved', { transactionMeta, actionId });
    this.hub.emit('transaction-submitted', { transactionMeta, actionId });

    this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
  }

  /**
   * Attempts to speed up a transaction increasing transaction gasPrice by ten percent.
   *
   * @param transactionId - The ID of the transaction to speed up.
   * @param gasValues - The gas values to use for the speed up transaction.
   * @param options - The options for the speed up transaction.
   * @param options.actionId - Unique ID to prevent duplicate requests
   * @param options.estimatedBaseFee - The estimated base fee of the transaction.
   */
  async speedUpTransaction(
    transactionId: string,
    gasValues?: GasPriceValue | FeeMarketEIP1559Values,
    {
      actionId,
      estimatedBaseFee,
    }: { actionId?: string; estimatedBaseFee?: string } = {},
  ) {
    // If transaction is found for same action id, do not create a new speed up transaction.
    if (this.getTransactionWithActionId(actionId)) {
      return;
    }

    if (gasValues) {
      validateGasValues(gasValues);
    }
    const transactionMeta = this.state.transactions.find(
      ({ id }) => id === transactionId,
    );
    /* istanbul ignore next */
    if (!transactionMeta) {
      return;
    }

    /* istanbul ignore next */
    if (!this.sign) {
      throw new Error('No sign method defined.');
    }

    const { transactions } = this.state;

    // gasPrice (legacy non EIP1559)
    const minGasPrice = getIncreasedPriceFromExisting(
      transactionMeta.txParams.gasPrice,
      SPEED_UP_RATE,
    );

    const gasPriceFromValues = isGasPriceValue(gasValues) && gasValues.gasPrice;

    const newGasPrice =
      (gasPriceFromValues &&
        validateMinimumIncrease(gasPriceFromValues, minGasPrice)) ||
      minGasPrice;

    // maxFeePerGas (EIP1559)
    const existingMaxFeePerGas = transactionMeta.txParams?.maxFeePerGas;
    const minMaxFeePerGas = getIncreasedPriceFromExisting(
      existingMaxFeePerGas,
      SPEED_UP_RATE,
    );
    const maxFeePerGasValues =
      isFeeMarketEIP1559Values(gasValues) && gasValues.maxFeePerGas;
    const newMaxFeePerGas =
      (maxFeePerGasValues &&
        validateMinimumIncrease(maxFeePerGasValues, minMaxFeePerGas)) ||
      (existingMaxFeePerGas && minMaxFeePerGas);

    // maxPriorityFeePerGas (EIP1559)
    const existingMaxPriorityFeePerGas =
      transactionMeta.txParams?.maxPriorityFeePerGas;
    const minMaxPriorityFeePerGas = getIncreasedPriceFromExisting(
      existingMaxPriorityFeePerGas,
      SPEED_UP_RATE,
    );
    const maxPriorityFeePerGasValues =
      isFeeMarketEIP1559Values(gasValues) && gasValues.maxPriorityFeePerGas;
    const newMaxPriorityFeePerGas =
      (maxPriorityFeePerGasValues &&
        validateMinimumIncrease(
          maxPriorityFeePerGasValues,
          minMaxPriorityFeePerGas,
        )) ||
      (existingMaxPriorityFeePerGas && minMaxPriorityFeePerGas);

    const txParams: TransactionParams =
      newMaxFeePerGas && newMaxPriorityFeePerGas
        ? {
            ...transactionMeta.txParams,
            gasLimit: transactionMeta.txParams.gas,
            maxFeePerGas: newMaxFeePerGas,
            maxPriorityFeePerGas: newMaxPriorityFeePerGas,
            type: '2',
          }
        : {
            ...transactionMeta.txParams,
            gasLimit: transactionMeta.txParams.gas,
            gasPrice: newGasPrice,
          };

    const unsignedEthTx = this.prepareUnsignedEthTx(txParams);

    const signedTx = await this.sign(
      unsignedEthTx,
      transactionMeta.txParams.from,
    );
    await this.updateTransactionMetaRSV(transactionMeta, signedTx);
    const rawTx = bufferToHex(signedTx.serialize());
    const hash = await query(this.ethQuery, 'sendRawTransaction', [rawTx]);
    const baseTransactionMeta = {
      ...transactionMeta,
      estimatedBaseFee,
      id: random(),
      time: Date.now(),
      hash,
      actionId,
      originalGasEstimate: transactionMeta.txParams.gas,
      type: TransactionType.retry,
    };
    const newTransactionMeta =
      newMaxFeePerGas && newMaxPriorityFeePerGas
        ? {
            ...baseTransactionMeta,
            txParams: {
              ...transactionMeta.txParams,
              maxFeePerGas: newMaxFeePerGas,
              maxPriorityFeePerGas: newMaxPriorityFeePerGas,
            },
          }
        : {
            ...baseTransactionMeta,
            txParams: {
              ...transactionMeta.txParams,
              gasPrice: newGasPrice,
            },
          };
    transactions.push(newTransactionMeta);
    this.update({ transactions: this.trimTransactionsForState(transactions) });

    // speedUpTransaction has no approval request, so we assume the user has already approved the transaction
    this.hub.emit('transaction-approved', {
      transactionMeta: newTransactionMeta,
      actionId,
    });
    this.hub.emit('transaction-submitted', {
      transactionMeta: newTransactionMeta,
      actionId,
    });

    this.hub.emit(`${transactionMeta.id}:speedup`, newTransactionMeta);
  }

  /**
   * Estimates required gas for a given transaction.
   *
   * @param transaction - The transaction to estimate gas for.
   * @returns The gas and gas price.
   */
  async estimateGas(transaction: TransactionParams) {
    const { estimatedGas, simulationFails } = await estimateGas(
      transaction,
      this.ethQuery,
    );

    return { gas: estimatedGas, simulationFails };
  }

  /**
   * Estimates required gas for a given transaction and add additional gas buffer with the given multiplier.
   *
   * @param transaction - The transaction params to estimate gas for.
   * @param multiplier - The multiplier to use for the gas buffer.
   */
  async estimateGasBuffered(
    transaction: TransactionParams,
    multiplier: number,
  ) {
    const { blockGasLimit, estimatedGas, simulationFails } = await estimateGas(
      transaction,
      this.ethQuery,
    );

    const gas = addGasBuffer(estimatedGas, blockGasLimit, multiplier);

    return {
      gas,
      simulationFails,
    };
  }

  /**
   * Updates an existing transaction in state.
   *
   * @param transactionMeta - The new transaction to store in state.
   * @param note - A note or update reason to include in the transaction history.
   */
  updateTransaction(transactionMeta: TransactionMeta, note: string) {
    const { transactions } = this.state;
    transactionMeta.txParams = normalizeTxParams(transactionMeta.txParams);
    validateTxParams(transactionMeta.txParams);
    if (!this.isHistoryDisabled) {
      updateTransactionHistory(transactionMeta, note);
    }
    const index = transactions.findIndex(({ id }) => transactionMeta.id === id);
    transactions[index] = transactionMeta;
    this.update({ transactions: this.trimTransactionsForState(transactions) });
  }

  /**
   * Update the security alert response for a transaction.
   *
   * @param transactionId - ID of the transaction.
   * @param securityAlertResponse - The new security alert response for the transaction.
   */
  updateSecurityAlertResponse(
    transactionId: string,
    securityAlertResponse: SecurityAlertResponse,
  ) {
    if (!securityAlertResponse) {
      throw new Error(
        'updateSecurityAlertResponse: securityAlertResponse should not be null',
      );
    }
    const transactionMeta = this.getTransaction(transactionId);
    if (!transactionMeta) {
      throw new Error(
        `Cannot update security alert response as no transaction metadata found`,
      );
    }
    const updatedMeta = merge(transactionMeta, { securityAlertResponse });
    this.updateTransaction(
      updatedMeta,
      'TransactionController:updatesecurityAlertResponse - securityAlertResponse updated',
    );
  }

  /**
   * Removes all transactions from state, optionally based on the current network.
   *
   * @param ignoreNetwork - Determines whether to wipe all transactions, or just those on the
   * current network. If `true`, all transactions are wiped.
   * @param address - If specified, only transactions originating from this address will be
   * wiped on current network.
   */
  wipeTransactions(ignoreNetwork?: boolean, address?: string) {
    /* istanbul ignore next */
    if (ignoreNetwork && !address) {
      this.update({ transactions: [] });
      return;
    }
    const currentChainId = this.getChainId();
    const newTransactions = this.state.transactions.filter(
      ({ chainId, txParams }) => {
        const isMatchingNetwork = ignoreNetwork || chainId === currentChainId;

        if (!isMatchingNetwork) {
          return true;
        }

        const isMatchingAddress =
          !address || txParams.from?.toLowerCase() === address.toLowerCase();

        return !isMatchingAddress;
      },
    );

    this.update({
      transactions: this.trimTransactionsForState(newTransactions),
    });
  }

  startIncomingTransactionProcessing() {
    this.incomingTransactionHelper.start();
  }

  stopIncomingTransactionProcessing() {
    this.incomingTransactionHelper.stop();
  }

  /**
   * Adds external provided transaction to state as confirmed transaction.
   *
   * @param transactionMeta - TransactionMeta to add transactions.
   * @param transactionReceipt - TransactionReceipt of the external transaction.
   * @param baseFeePerGas - Base fee per gas of the external transaction.
   */
  async confirmExternalTransaction(
    transactionMeta: TransactionMeta,
    transactionReceipt: TransactionReceipt,
    baseFeePerGas: Hex,
  ) {
    // Run validation and add external transaction to state.
    this.addExternalTransaction(transactionMeta);

    try {
      const transactionId = transactionMeta.id;

      // Make sure status is confirmed and define gasUsed as in receipt.
      transactionMeta.status = TransactionStatus.confirmed;
      transactionMeta.txReceipt = transactionReceipt;
      if (baseFeePerGas) {
        transactionMeta.baseFeePerGas = baseFeePerGas;
      }

      // Update same nonce local transactions as dropped and define replacedBy properties.
      this.markNonceDuplicatesDropped(transactionId);

      // Update external provided transaction with updated gas values and confirmed status.
      this.updateTransaction(
        transactionMeta,
        'TransactionController:confirmExternalTransaction - Add external transaction',
      );

      if (transactionMeta.type === TransactionType.swap) {
        updatePostTransactionBalance(transactionMeta, {
          ethQuery: this.ethQuery,
          getTransaction: this.getTransaction.bind(this),
          updateTransaction: this.updateTransaction.bind(this),
        })
          .then(({ updatedTransactionMeta, approvalTransactionMeta }) => {
            this.hub.emit('post-transaction-balance-updated', {
              transactionMeta: updatedTransactionMeta,
              approvalTransactionMeta,
            });
          })
          .catch((error) => {
            /* istanbul ignore next */
            log('Error while updating post transaction balance', error);
          });
      }
      this.hub.emit('transaction-confirmed', {
        transactionMeta,
      });
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * Append new send flow history to a transaction.
   *
   * @param transactionID - The ID of the transaction to update.
   * @param currentSendFlowHistoryLength - The length of the current sendFlowHistory array.
   * @param sendFlowHistoryToAdd - The sendFlowHistory entries to add.
   * @returns The updated transactionMeta.
   */
  updateTransactionSendFlowHistory(
    transactionID: string,
    currentSendFlowHistoryLength: number,
    sendFlowHistoryToAdd: SendFlowHistoryEntry[],
  ): TransactionMeta {
    if (this.isSendFlowHistoryDisabled) {
      throw new Error(
        'Send flow history is disabled for the current transaction controller',
      );
    }

    const transactionMeta = this.getTransaction(transactionID);

    if (!transactionMeta) {
      throw new Error(
        `Cannot update send flow history as no transaction metadata found`,
      );
    }

    validateIfTransactionUnapproved(
      transactionMeta,
      'updateTransactionSendFlowHistory',
    );

    if (
      currentSendFlowHistoryLength ===
      (transactionMeta?.sendFlowHistory?.length || 0)
    ) {
      transactionMeta.sendFlowHistory = [
        ...(transactionMeta?.sendFlowHistory ?? []),
        ...sendFlowHistoryToAdd,
      ];
      this.updateTransaction(
        transactionMeta,
        'TransactionController:updateTransactionSendFlowHistory - sendFlowHistory updated',
      );
    }

    return this.getTransaction(transactionID) as TransactionMeta;
  }

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
  updateTransactionGasFees(
    transactionId: string,
    {
      defaultGasEstimates,
      estimateUsed,
      estimateSuggested,
      gas,
      gasLimit,
      gasPrice,
      maxPriorityFeePerGas,
      maxFeePerGas,
      originalGasEstimate,
      userEditedGasLimit,
      userFeeLevel,
    }: {
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
    },
  ): TransactionMeta {
    const transactionMeta = this.getTransaction(transactionId);

    if (!transactionMeta) {
      throw new Error(
        `Cannot update transaction as no transaction metadata found`,
      );
    }

    validateIfTransactionUnapproved(
      transactionMeta,
      'updateTransactionGasFees',
    );

    let transactionGasFees = {
      txParams: {
        gas,
        gasLimit,
        gasPrice,
        maxPriorityFeePerGas,
        maxFeePerGas,
      },
      defaultGasEstimates,
      estimateUsed,
      estimateSuggested,
      originalGasEstimate,
      userEditedGasLimit,
      userFeeLevel,
    } as any;

    // only update what is defined
    transactionGasFees.txParams = pickBy(transactionGasFees.txParams);
    transactionGasFees = pickBy(transactionGasFees);

    // merge updated gas values with existing transaction meta
    const updatedMeta = merge(transactionMeta, transactionGasFees);

    this.updateTransaction(
      updatedMeta,
      'TransactionController:updateTransactionGasFees - gas values updated',
    );

    return this.getTransaction(transactionId) as TransactionMeta;
  }

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
  updatePreviousGasParams(
    transactionId: string,
    {
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
    }: {
      gasLimit?: string;
      maxFeePerGas?: string;
      maxPriorityFeePerGas?: string;
    },
  ): TransactionMeta {
    const transactionMeta = this.getTransaction(transactionId);

    if (!transactionMeta) {
      throw new Error(
        `Cannot update transaction as no transaction metadata found`,
      );
    }

    validateIfTransactionUnapproved(transactionMeta, 'updatePreviousGasParams');

    const transactionPreviousGas = {
      previousGas: {
        gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas,
      },
    } as any;

    // only update what is defined
    transactionPreviousGas.previousGas = pickBy(
      transactionPreviousGas.previousGas,
    );

    // merge updated previous gas values with existing transaction meta
    const updatedMeta = merge(transactionMeta, transactionPreviousGas);

    this.updateTransaction(
      updatedMeta,
      'TransactionController:updatePreviousGasParams - Previous gas values updated',
    );

    return this.getTransaction(transactionId) as TransactionMeta;
  }

  /**
   * Gets the next nonce according to the nonce-tracker.
   * Ensure `releaseLock` is called once processing of the `nonce` value is complete.
   *
   * @param address - The hex string address for the transaction.
   * @returns object with the `nextNonce` `nonceDetails`, and the releaseLock.
   */
  async getNonceLock(address: string): Promise<NonceLock> {
    return this.nonceTracker.getNonceLock(address);
  }

  /**
   * Signs and returns the raw transaction data for provided transaction params list.
   *
   * @param listOfTxParams - The list of transaction params to approve.
   * @returns The raw transactions.
   */
  async approveTransactionsWithSameNonce(
    listOfTxParams: TransactionParams[] = [],
  ): Promise<string | string[]> {
    if (listOfTxParams.length === 0) {
      return '';
    }

    const initialTx = listOfTxParams[0];
    const common = this.getCommonConfiguration();

    const initialTxAsEthTx = TransactionFactory.fromTxData(initialTx, {
      common,
    });

    const initialTxAsSerializedHex = bufferToHex(initialTxAsEthTx.serialize());

    if (this.inProcessOfSigning.has(initialTxAsSerializedHex)) {
      return '';
    }

    this.inProcessOfSigning.add(initialTxAsSerializedHex);

    let rawTransactions, nonceLock;
    try {
      // TODO: we should add a check to verify that all transactions have the same from address
      const fromAddress = initialTx.from;
      nonceLock = await this.nonceTracker.getNonceLock(fromAddress);
      const nonce = nonceLock.nextNonce;

      rawTransactions = await Promise.all(
        listOfTxParams.map((txParams) => {
          txParams.nonce = addHexPrefix(nonce.toString(16));
          return this.signExternalTransaction(txParams);
        }),
      );
    } catch (err) {
      log('Error while signing transactions with same nonce', err);
      // Must set transaction to submitted/failed before releasing lock
      // continue with error chain
      throw err;
    } finally {
      if (nonceLock) {
        nonceLock.releaseLock();
      }
      this.inProcessOfSigning.delete(initialTxAsSerializedHex);
    }
    return rawTransactions;
  }

  private async signExternalTransaction(
    transactionParams: TransactionParams,
  ): Promise<string> {
    if (!this.sign) {
      throw new Error('No sign method defined.');
    }

    const normalizedtransactionParams = normalizeTxParams(transactionParams);
    const chainId = this.getChainId();
    const type = isEIP1559Transaction(normalizedtransactionParams)
      ? TransactionEnvelopeType.feeMarket
      : TransactionEnvelopeType.legacy;
    const updatedTransactionParams = {
      ...normalizedtransactionParams,
      type,
      gasLimit: normalizedtransactionParams.gas,
      chainId,
    };

    const { from } = updatedTransactionParams;
    const common = this.getCommonConfiguration();
    const unsignedTransaction = TransactionFactory.fromTxData(
      updatedTransactionParams,
      { common },
    );
    const signedTransaction = await this.sign(unsignedTransaction, from);

    const rawTransaction = bufferToHex(signedTransaction.serialize());
    return rawTransaction;
  }

  /**
   * Removes unapproved transactions from state.
   */
  clearUnapprovedTransactions() {
    const transactions = this.state.transactions.filter(
      ({ status }) => status !== TransactionStatus.unapproved,
    );
    this.update({ transactions: this.trimTransactionsForState(transactions) });
  }

  private async updateGasProperties(transactionMeta: TransactionMeta) {
    const isEIP1559Compatible = await this.getEIP1559Compatibility();
    const chainId = this.getChainId();

    await updateGas({
      ethQuery: this.ethQuery,
      providerConfig: this.getNetworkState().providerConfig,
      txMeta: transactionMeta,
    });

    await updateGasFees({
      eip1559: isEIP1559Compatible,
      ethQuery: this.ethQuery,
      getSavedGasFees: this.getSavedGasFees.bind(this, chainId),
      getGasFeeEstimates: this.getGasFeeEstimates.bind(this),
      txMeta: transactionMeta,
    });
  }

  private getCurrentChainTransactionsByStatus(status: TransactionStatus) {
    const chainId = this.getChainId();
    return this.state.transactions.filter(
      (transaction) =>
        transaction.status === status && transaction.chainId === chainId,
    );
  }

  private onBootCleanup() {
    this.createApprovalsForUnapprovedTransactions();
    this.loadGasValuesForUnapprovedTransactions();
    this.submitApprovedTransactions();
  }

  /**
   * Create approvals for all unapproved transactions on current chain.
   */
  private createApprovalsForUnapprovedTransactions() {
    const unapprovedTransactions = this.getCurrentChainTransactionsByStatus(
      TransactionStatus.unapproved,
    );

    for (const transactionMeta of unapprovedTransactions) {
      this.processApproval(transactionMeta, {
        shouldShowRequest: false,
      }).catch((error) => {
        if (error?.code === errorCodes.provider.userRejectedRequest) {
          return;
        }
        /* istanbul ignore next */
        console.error('Error during persisted transaction approval', error);
      });
    }
  }

  /**
   * Update the gas values of all unapproved transactions on current chain.
   */
  private async loadGasValuesForUnapprovedTransactions() {
    const unapprovedTransactions = this.getCurrentChainTransactionsByStatus(
      TransactionStatus.unapproved,
    );

    const results = await Promise.allSettled(
      unapprovedTransactions.map(async (transactionMeta) => {
        await this.updateGasProperties(transactionMeta);
        this.updateTransaction(
          transactionMeta,
          'TransactionController:loadGasValuesForUnapprovedTransactions - Gas values updated',
        );
      }),
    );

    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        const transactionMeta = unapprovedTransactions[index];
        this.failTransaction(transactionMeta, result.reason);
        /* istanbul ignore next */
        console.error(
          'Error while loading gas values for persisted transaction id: ',
          transactionMeta.id,
          result.reason,
        );
      }
    }
  }

  /**
   * Force to submit approved transactions on current chain.
   */
  private submitApprovedTransactions() {
    const approvedTransactions = this.getCurrentChainTransactionsByStatus(
      TransactionStatus.approved,
    );
    for (const transactionMeta of approvedTransactions) {
      if (this.beforeApproveOnInit(transactionMeta)) {
        this.approveTransaction(transactionMeta.id).catch((error) => {
          /* istanbul ignore next */
          console.error('Error while submitting persisted transaction', error);
        });
      }
    }
  }

  private async processApproval(
    transactionMeta: TransactionMeta,
    {
      isExisting = false,
      requireApproval,
      shouldShowRequest = true,
      actionId,
    }: {
      isExisting?: boolean;
      requireApproval?: boolean | undefined;
      shouldShowRequest?: boolean;
      actionId?: string;
    },
  ): Promise<string> {
    const transactionId = transactionMeta.id;
    let resultCallbacks: AcceptResultCallbacks | undefined;
    const { meta, isCompleted } = this.isTransactionCompleted(transactionId);
    const finishedPromise = isCompleted
      ? Promise.resolve(meta)
      : this.waitForTransactionFinished(transactionId);

    if (meta && !isExisting && !isCompleted) {
      try {
        if (requireApproval !== false) {
          const acceptResult = await this.requestApproval(transactionMeta, {
            shouldShowRequest,
          });
          resultCallbacks = acceptResult.resultCallbacks;
        }

        const { isCompleted: isTxCompleted } =
          this.isTransactionCompleted(transactionId);

        if (!isTxCompleted) {
          await this.approveTransaction(transactionId);
          const updatedTransactionMeta = this.getTransaction(
            transactionId,
          ) as TransactionMeta;
          this.hub.emit('transaction-approved', {
            transactionMeta: updatedTransactionMeta,
            actionId,
          });
        }
      } catch (error: any) {
        const { isCompleted: isTxCompleted } =
          this.isTransactionCompleted(transactionId);
        if (!isTxCompleted) {
          if (error?.code === errorCodes.provider.userRejectedRequest) {
            this.cancelTransaction(transactionId, actionId);

            throw providerErrors.userRejectedRequest(
              'MetaMask Tx Signature: User denied transaction signature.',
            );
          } else {
            this.failTransaction(meta, error, actionId);
          }
        }
      }
    }

    const finalMeta = await finishedPromise;

    switch (finalMeta?.status) {
      case TransactionStatus.failed:
        resultCallbacks?.error(finalMeta.error);
        throw rpcErrors.internal(finalMeta.error.message);

      case TransactionStatus.cancelled:
        const cancelError = rpcErrors.internal(
          'User cancelled the transaction',
        );
        resultCallbacks?.error(cancelError);
        throw cancelError;

      case TransactionStatus.submitted:
        resultCallbacks?.success();
        return finalMeta.hash as string;

      default:
        const internalError = rpcErrors.internal(
          `MetaMask Tx Signature: Unknown problem: ${JSON.stringify(
            finalMeta || transactionId,
          )}`,
        );

        resultCallbacks?.error(internalError);
        throw internalError;
    }
  }

  /**
   * Approves a transaction and updates it's status in state. If this is not a
   * retry transaction, a nonce will be generated. The transaction is signed
   * using the sign configuration property, then published to the blockchain.
   * A `<tx.id>:finished` hub event is fired after success or failure.
   *
   * @param transactionId - The ID of the transaction to approve.
   */
  private async approveTransaction(transactionId: string) {
    const { transactions } = this.state;
    const releaseLock = await this.mutex.acquire();
    const chainId = this.getChainId();
    const index = transactions.findIndex(({ id }) => transactionId === id);
    const transactionMeta = transactions[index];
    const {
      txParams: { nonce, from },
    } = transactionMeta;
    let nonceLock;
    try {
      if (!this.sign) {
        releaseLock();
        this.failTransaction(
          transactionMeta,
          new Error('No sign method defined.'),
        );
        return;
      } else if (!chainId) {
        releaseLock();
        this.failTransaction(transactionMeta, new Error('No chainId defined.'));
        return;
      }

      if (this.inProcessOfSigning.has(transactionId)) {
        log('Skipping approval as signing in progress', transactionId);
        return;
      }

      const { approved: status } = TransactionStatus;
      let nonceToUse = nonce;
      // if a nonce already exists on the transactionMeta it means this is a speedup or cancel transaction
      // so we want to reuse that nonce and hope that it beats the previous attempt to chain. Otherwise use a new locked nonce
      if (!nonceToUse) {
        nonceLock = await this.nonceTracker.getNonceLock(from);
        nonceToUse = addHexPrefix(nonceLock.nextNonce.toString(16));
      }

      transactionMeta.status = status;
      transactionMeta.txParams.nonce = nonceToUse;
      transactionMeta.txParams.chainId = chainId;

      const baseTxParams = {
        ...transactionMeta.txParams,
        gasLimit: transactionMeta.txParams.gas,
      };
      this.updateTransaction(
        transactionMeta,
        'TransactionController#approveTransaction - Transaction approved',
      );

      const isEIP1559 = isEIP1559Transaction(transactionMeta.txParams);

      const txParams: TransactionParams = isEIP1559
        ? {
            ...baseTxParams,
            maxFeePerGas: transactionMeta.txParams.maxFeePerGas,
            maxPriorityFeePerGas: transactionMeta.txParams.maxPriorityFeePerGas,
            estimatedBaseFee: transactionMeta.txParams.estimatedBaseFee,
            // specify type 2 if maxFeePerGas and maxPriorityFeePerGas are set
            type: '2',
          }
        : baseTxParams;

      // delete gasPrice if maxFeePerGas and maxPriorityFeePerGas are set
      if (isEIP1559) {
        delete txParams.gasPrice;
      }

      const rawTx = await this.signTransaction(transactionMeta);

      if (!this.beforePublish(transactionMeta)) {
        log('Skipping publishing transaction based on hook');
        return;
      }

      if (!rawTx) {
        return;
      }

      const hash = await this.publishTransaction(rawTx);
      transactionMeta.hash = hash;
      transactionMeta.status = TransactionStatus.submitted;
      transactionMeta.submittedTime = new Date().getTime();
      this.hub.emit('transaction-submitted', {
        transactionMeta,
      });
      this.updateTransaction(
        transactionMeta,
        'TransactionController#approveTransaction - Transaction submitted',
      );
      this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
    } catch (error: any) {
      this.failTransaction(transactionMeta, error);
    } finally {
      this.inProcessOfSigning.delete(transactionId);
      // must set transaction to submitted/failed before releasing lock
      if (nonceLock) {
        nonceLock.releaseLock();
      }
      releaseLock();
    }
  }

  private async publishTransaction(rawTransaction: string): Promise<string> {
    return await query(this.ethQuery, 'sendRawTransaction', [rawTransaction]);
  }

  /**
   * Cancels a transaction based on its ID by setting its status to "rejected"
   * and emitting a `<tx.id>:finished` hub event.
   *
   * @param transactionId - The ID of the transaction to cancel.
   * @param actionId - The actionId passed from UI
   */
  private cancelTransaction(transactionId: string, actionId?: string) {
    const transactionMeta = this.state.transactions.find(
      ({ id }) => id === transactionId,
    );
    if (!transactionMeta) {
      return;
    }
    transactionMeta.status = TransactionStatus.rejected;
    this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
    this.hub.emit('transaction-rejected', {
      transactionMeta,
      actionId,
    });
    const transactions = this.state.transactions.filter(
      ({ id }) => id !== transactionId,
    );
    this.update({ transactions: this.trimTransactionsForState(transactions) });
  }

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
  private trimTransactionsForState(
    transactions: TransactionMeta[],
  ): TransactionMeta[] {
    const nonceNetworkSet = new Set();

    const txsToKeep = transactions
      .sort((a, b) => (a.time > b.time ? -1 : 1)) // Descending time order
      .filter((tx) => {
        const { chainId, status, txParams, time } = tx;

        if (txParams) {
          const key = `${txParams.nonce}-${convertHexToDecimal(
            chainId,
          )}-${new Date(time).toDateString()}`;

          if (nonceNetworkSet.has(key)) {
            return true;
          } else if (
            nonceNetworkSet.size < this.config.txHistoryLimit ||
            !this.isFinalState(status)
          ) {
            nonceNetworkSet.add(key);
            return true;
          }
        }

        return false;
      });

    txsToKeep.reverse(); // Ascending time order
    return txsToKeep;
  }

  /**
   * Determines if the transaction is in a final state.
   *
   * @param status - The transaction status.
   * @returns Whether the transaction is in a final state.
   */
  private isFinalState(status: TransactionStatus): boolean {
    return (
      status === TransactionStatus.rejected ||
      status === TransactionStatus.confirmed ||
      status === TransactionStatus.failed ||
      status === TransactionStatus.cancelled
    );
  }

  /**
   * Whether the transaction has at least completed all local processing.
   *
   * @param status - The transaction status.
   * @returns Whether the transaction is in a final state.
   */
  private isLocalFinalState(status: TransactionStatus): boolean {
    return [
      TransactionStatus.cancelled,
      TransactionStatus.confirmed,
      TransactionStatus.failed,
      TransactionStatus.rejected,
      TransactionStatus.submitted,
    ].includes(status);
  }

  private async requestApproval(
    txMeta: TransactionMeta,
    { shouldShowRequest }: { shouldShowRequest: boolean },
  ): Promise<AddResult> {
    const id = this.getApprovalId(txMeta);
    const { origin } = txMeta;
    const type = ApprovalType.Transaction;
    const requestData = { txId: txMeta.id };

    return (await this.messagingSystem.call(
      'ApprovalController:addRequest',
      {
        id,
        origin: origin || ORIGIN_METAMASK,
        type,
        requestData,
        expectsResult: true,
      },
      shouldShowRequest,
    )) as Promise<AddResult>;
  }

  private getTransaction(transactionId: string): TransactionMeta | undefined {
    const { transactions } = this.state;
    return transactions.find(({ id }) => id === transactionId);
  }

  private getApprovalId(txMeta: TransactionMeta) {
    return String(txMeta.id);
  }

  private isTransactionCompleted(transactionId: string): {
    meta?: TransactionMeta;
    isCompleted: boolean;
  } {
    const transaction = this.getTransaction(transactionId);

    if (!transaction) {
      return { meta: undefined, isCompleted: false };
    }

    const isCompleted = this.isLocalFinalState(transaction.status);

    return { meta: transaction, isCompleted };
  }

  private getChainId(): Hex {
    const { providerConfig } = this.getNetworkState();
    return providerConfig.chainId;
  }

  private prepareUnsignedEthTx(txParams: TransactionParams): TypedTransaction {
    return TransactionFactory.fromTxData(txParams, {
      common: this.getCommonConfiguration(),
      freeze: false,
    });
  }

  /**
   * `@ethereumjs/tx` uses `@ethereumjs/common` as a configuration tool for
   * specifying which chain, network, hardfork and EIPs to support for
   * a transaction. By referencing this configuration, and analyzing the fields
   * specified in txParams, @ethereumjs/tx is able to determine which EIP-2718
   * transaction type to use.
   *
   * @returns common configuration object
   */
  private getCommonConfiguration(): Common {
    const {
      providerConfig: { type: chain, chainId, nickname: name },
    } = this.getNetworkState();

    if (
      chain !== RPC &&
      chain !== NetworkType['linea-goerli'] &&
      chain !== NetworkType['linea-mainnet']
    ) {
      return new Common({ chain, hardfork: HARDFORK });
    }

    const customChainParams: Partial<ChainConfig> = {
      name,
      chainId: parseInt(chainId, 16),
      defaultHardfork: HARDFORK,
    };

    return Common.custom(customChainParams);
  }

  private onIncomingTransactions({
    added,
    updated,
  }: {
    added: TransactionMeta[];
    updated: TransactionMeta[];
  }) {
    const { transactions: currentTransactions } = this.state;

    const updatedTransactions = [
      ...added,
      ...currentTransactions.map((originalTransaction) => {
        const updatedTransaction = updated.find(
          ({ hash }) => hash === originalTransaction.hash,
        );

        return updatedTransaction ?? originalTransaction;
      }),
    ];

    this.update({
      transactions: this.trimTransactionsForState(updatedTransactions),
    });
  }

  private onUpdatedLastFetchedBlockNumbers({
    lastFetchedBlockNumbers,
    blockNumber,
  }: {
    lastFetchedBlockNumbers: {
      [key: string]: number;
    };
    blockNumber: number;
  }) {
    this.update({ lastFetchedBlockNumbers });
    this.hub.emit('incomingTransactionBlock', blockNumber);
  }

  private generateDappSuggestedGasFees(
    txParams: TransactionParams,
    origin?: string,
  ): DappSuggestedGasFees | undefined {
    if (!origin || origin === ORIGIN_METAMASK) {
      return undefined;
    }

    const { gasPrice, maxFeePerGas, maxPriorityFeePerGas, gas } = txParams;

    if (
      gasPrice === undefined &&
      maxFeePerGas === undefined &&
      maxPriorityFeePerGas === undefined &&
      gas === undefined
    ) {
      return undefined;
    }

    const dappSuggestedGasFees: DappSuggestedGasFees = {};

    if (gasPrice !== undefined) {
      dappSuggestedGasFees.gasPrice = gasPrice;
    } else if (
      maxFeePerGas !== undefined ||
      maxPriorityFeePerGas !== undefined
    ) {
      dappSuggestedGasFees.maxFeePerGas = maxFeePerGas;
      dappSuggestedGasFees.maxPriorityFeePerGas = maxPriorityFeePerGas;
    }

    if (gas !== undefined) {
      dappSuggestedGasFees.gas = gas;
    }

    return dappSuggestedGasFees;
  }

  /**
   * Validates and adds external provided transaction to state.
   *
   * @param transactionMeta - Nominated external transaction to be added to state.
   */
  private async addExternalTransaction(transactionMeta: TransactionMeta) {
    const chainId = this.getChainId();
    const { transactions } = this.state;
    const fromAddress = transactionMeta?.txParams?.from;
    const sameFromAndNetworkTransactions = transactions.filter(
      (transaction) =>
        transaction.txParams.from === fromAddress &&
        transaction.chainId === chainId,
    );
    const confirmedTxs = sameFromAndNetworkTransactions.filter(
      (transaction) => transaction.status === TransactionStatus.confirmed,
    );
    const pendingTxs = sameFromAndNetworkTransactions.filter(
      (transaction) => transaction.status === TransactionStatus.submitted,
    );

    validateConfirmedExternalTransaction(
      transactionMeta,
      confirmedTxs,
      pendingTxs,
    );

    // Make sure provided external transaction has non empty history array
    if (!(transactionMeta.history ?? []).length) {
      if (!this.isHistoryDisabled) {
        addInitialHistorySnapshot(transactionMeta);
      }
    }

    const updatedTransactions = [...transactions, transactionMeta];
    this.update({
      transactions: this.trimTransactionsForState(updatedTransactions),
    });
  }

  /**
   * Sets other txMeta statuses to dropped if the txMeta that has been confirmed has other transactions
   * in the transactions have the same nonce.
   *
   * @param transactionId - Used to identify original transaction.
   */
  private markNonceDuplicatesDropped(transactionId: string) {
    const chainId = this.getChainId();
    const transactionMeta = this.getTransaction(transactionId);
    const nonce = transactionMeta?.txParams?.nonce;
    const from = transactionMeta?.txParams?.from;
    const sameNonceTxs = this.state.transactions.filter(
      (transaction) =>
        transaction.txParams.from === from &&
        transaction.txParams.nonce === nonce &&
        transaction.chainId === chainId,
    );

    if (!sameNonceTxs.length) {
      return;
    }

    // Mark all same nonce transactions as dropped and give it a replacedBy hash
    for (const transaction of sameNonceTxs) {
      if (transaction.id === transactionId) {
        continue;
      }
      transaction.replacedBy = transactionMeta?.hash;
      transaction.replacedById = transactionMeta?.id;
      // Drop any transaction that wasn't previously failed (off chain failure)
      if (transaction.status !== TransactionStatus.failed) {
        this.setTransactionStatusDropped(transaction);
      }
    }
  }

  /**
   * Method to set transaction status to dropped.
   *
   * @param transactionMeta - TransactionMeta of transaction to be marked as dropped.
   */
  private setTransactionStatusDropped(transactionMeta: TransactionMeta) {
    transactionMeta.status = TransactionStatus.dropped;
    this.hub.emit('transaction-dropped', {
      transactionMeta,
    });
    this.updateTransaction(
      transactionMeta,
      'TransactionController#setTransactionStatusDropped - Transaction dropped',
    );
  }

  /**
   * Get transaction with provided actionId.
   *
   * @param actionId - Unique ID to prevent duplicate requests
   * @returns the filtered transaction
   */
  private getTransactionWithActionId(actionId?: string) {
    return this.state.transactions.find(
      (transaction) => actionId && transaction.actionId === actionId,
    );
  }

  private async waitForTransactionFinished(
    transactionId: string,
  ): Promise<TransactionMeta> {
    return new Promise((resolve) => {
      this.hub.once(`${transactionId}:finished`, (txMeta) => {
        resolve(txMeta);
      });
    });
  }

  /**
   * Updates the r, s, and v properties of a TransactionMeta object
   * with values from a signed transaction.
   *
   * @param transactionMeta - The TransactionMeta object to update.
   * @param signedTx - The encompassing type for all transaction types containing r, s, and v values.
   */
  private async updateTransactionMetaRSV(
    transactionMeta: TransactionMeta,
    signedTx: TypedTransaction,
  ): Promise<void> {
    if (signedTx.r) {
      transactionMeta.r = addHexPrefix(signedTx.r.toString(16));
    }

    if (signedTx.s) {
      transactionMeta.s = addHexPrefix(signedTx.s.toString(16));
    }

    if (signedTx.v) {
      transactionMeta.v = addHexPrefix(signedTx.v.toString(16));
    }
  }

  private async getEIP1559Compatibility() {
    const currentNetworkIsEIP1559Compatible =
      await this.getCurrentNetworkEIP1559Compatibility();
    const currentAccountIsEIP1559Compatible =
      this.getCurrentAccountEIP1559Compatibility?.() ?? true;

    return (
      currentNetworkIsEIP1559Compatible && currentAccountIsEIP1559Compatible
    );
  }

  private addPendingTransactionTrackerListeners() {
    this.pendingTransactionTracker.hub.on(
      'transaction-confirmed',
      (transactionMeta: TransactionMeta) => {
        this.hub.emit('transaction-confirmed', { transactionMeta });
        this.hub.emit(`${transactionMeta.id}:confirmed`, transactionMeta);
      },
    );

    this.pendingTransactionTracker.hub.on(
      'transaction-dropped',
      this.setTransactionStatusDropped.bind(this),
    );

    this.pendingTransactionTracker.hub.on(
      'transaction-failed',
      this.failTransaction.bind(this),
    );

    this.pendingTransactionTracker.hub.on(
      'transaction-updated',
      this.updateTransaction.bind(this),
    );
  }

  private async signTransaction(
    transactionMeta: TransactionMeta,
  ): Promise<string | undefined> {
    const { txParams } = transactionMeta;

    const unsignedEthTx = this.prepareUnsignedEthTx(txParams);
    this.inProcessOfSigning.add(transactionMeta.id);
    const signedTx = await this.sign?.(
      unsignedEthTx,
      txParams.from,
      ...this.getAdditionalSignArguments(transactionMeta),
    );

    if (!signedTx) {
      log('Skipping signed status as no signed transaction');
      return undefined;
    }

    if (!this.afterSign(transactionMeta, signedTx)) {
      log('Skipping signed status based on hook');
      return undefined;
    }

    await this.updateTransactionMetaRSV(transactionMeta, signedTx);
    transactionMeta.status = TransactionStatus.signed;
    this.updateTransaction(
      transactionMeta,
      'TransactionController#approveTransaction - Transaction signed',
    );

    const rawTx = bufferToHex(signedTx.serialize());
    transactionMeta.rawTx = rawTx;
    this.updateTransaction(
      transactionMeta,
      'TransactionController#approveTransaction - RawTransaction added',
    );
    return rawTx;
  }
}

export default TransactionController;
