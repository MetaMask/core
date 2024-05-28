import { Common, type ChainConfig, Hardfork } from '@ethereumjs/common';
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
  BNToHex,
  fractionBN,
  hexToBN,
  safelyExecute,
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
import { mapValues, merge, pickBy, sortBy, isEqual, cloneDeep } from 'lodash';
import type {
  NonceLock,
  Transaction as NonceTrackerTransaction,
} from 'nonce-tracker/dist/NonceTracker';
import { NonceTracker } from 'nonce-tracker/dist/NonceTracker';
import { v1 as random } from 'uuid';

import { EtherscanRemoteTransactionSource } from './EtherscanRemoteTransactionSource';
import { validateConfirmedExternalTransaction } from './external-transactions';
import { LineaGasFeeFlow } from './gas-flows/LineaGasFeeFlow';
import { GasFeePoller } from './helpers/GasFeePoller';
import { addInitialHistorySnapshot, updateTransactionHistory } from './history';
import { IncomingTransactionHelper } from './IncomingTransactionHelper';
import { projectLogger as log } from './logger';
import { determineTransactionType } from './transaction-type';
import type {
  DappSuggestedGasFees,
  TransactionParams,
  TransactionMeta,
  TransactionReceipt,
  SecurityAlertResponse,
  SendFlowHistoryEntry,
  WalletDevice,
  SubmitHistoryEntry,
  GasFeeFlow,
  SimulationData,
  GasFeeEstimates,
} from './types';
import {
  TransactionEnvelopeType,
  TransactionStatus,
  TransactionType,
  SimulationErrorCode,
} from './types';
import {
  getAndFormatTransactionsForNonceTracker,
  normalizeTransactionParams,
  getIncreasedPriceFromExisting,
  isEIP1559Transaction,
  isFeeMarketEIP1559Values,
  isGasPriceValue,
  validateGasValues,
  validateIfTransactionUnapproved,
  validateMinimumIncrease,
  validateTxParams,
  ESTIMATE_GAS_ERROR,
} from './utils';
import { getSimulationData } from './utils/simulation';
import { updatePostTransactionBalance } from './utils/swaps';

const HARDFORK = Hardfork.London;
const SUBMIT_HISTORY_LIMIT = 100;

/**
 * @type Result
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
 * @type TransactionConfig
 *
 * Transaction controller configuration
 * @property interval - Polling interval used to fetch new currency rate
 * @property provider - Provider used to create a new underlying EthQuery instance
 * @property sign - Method used to sign transactions
 */
export interface TransactionConfig extends BaseConfig {
  interval: number;
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
  methodData: { [key: string]: MethodData };
  lastFetchedBlockNumbers: { [key: string]: number };
  submitHistory: SubmitHistoryEntry[];
}

/**
 * Multiplier used to determine a transaction's increased gas fee during cancellation
 */
export const CANCEL_RATE = 1.1;

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

/**
 * Controller responsible for submitting and managing transactions.
 */
export class TransactionController extends BaseController<
  TransactionConfig,
  TransactionState
> {
  private ethQuery: EthQuery;

  private readonly isHistoryDisabled: boolean;

  private readonly isSendFlowHistoryDisabled: boolean;

  private readonly nonceTracker: NonceTracker;

  private registry: any;

  private readonly provider: Provider;

  private handle?: ReturnType<typeof setTimeout>;

  private readonly mutex = new Mutex();

  private readonly lookupRegistryMutex = new Mutex();

  private readonly getNetworkState: () => NetworkState;

  private readonly getCurrentAccountEIP1559Compatibility: () => Promise<boolean>;

  private readonly getCurrentNetworkEIP1559Compatibility: () => Promise<
    boolean | undefined
  >;

  private readonly gasFeeFlows: GasFeeFlow[];

  private readonly getGasFeeEstimates: () => Promise<GasFeeState>;

  private readonly messagingSystem: TransactionControllerMessenger;

  private readonly incomingTransactionHelper: IncomingTransactionHelper;

  #isSimulationEnabled: () => boolean;

  private readonly inProcessOfSigning: Set<string> = new Set();

  private readonly publish: (
    transactionMeta: TransactionMeta,
    rawTx: string,
  ) => Promise<{ transactionHash?: string | undefined }>;

  private readonly getExternalPendingTransactions: (
    address: string,
  ) => NonceTrackerTransaction[];

  private failTransaction(transactionMeta: TransactionMeta, error: Error) {
    const newTransactionMeta = {
      ...transactionMeta,
      error,
      status: TransactionStatus.failed,
    };
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
  hub = new EventEmitter();

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
  ) => Promise<TypedTransaction>;

  /**
   * Creates a TransactionController instance.
   *
   * @param options - The controller options.
   * @param options.blockTracker - The block tracker used to poll for new blocks data.
   * @param options.disableHistory - Whether to disable storing history in transaction metadata.
   * @param options.disableSendFlowHistory - Explicitly disable transaction metadata history.
   * @param options.getCurrentAccountEIP1559Compatibility - Whether or not the account supports EIP-1559.
   * @param options.getCurrentNetworkEIP1559Compatibility - Whether or not the network supports EIP-1559.
   * @param options.getGasFeeEstimates - Callback to retrieve gas fee estimates.
   * @param options.getNetworkState - Gets the state of the network controller.
   * @param options.getSelectedAddress - Gets the address of the currently selected account.
   * @param options.getExternalPendingTransactions - Callback to retrieve pending transactions from external sources.
   * @param options.incomingTransactions - Configuration options for incoming transaction support.
   * @param options.incomingTransactions.includeTokenTransfers - Whether or not to include ERC20 token transfers.
   * @param options.incomingTransactions.isEnabled - Whether or not incoming transaction retrieval is enabled.
   * @param options.incomingTransactions.queryEntireHistory - Whether to initially query the entire transaction history or only recent blocks.
   * @param options.incomingTransactions.updateTransactions - Whether to update local transactions using remote transaction data.
   * @param options.isSimulationEnabled - Whether new transactions will be automatically simulated.
   * @param options.messenger - The controller messenger.
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
   * @param options.provider - The provider used to create the underlying EthQuery instance.
   * @param options.hooks - The controller hooks.
   * @param options.hooks.publish - Alternate logic to publish a transaction.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      blockTracker,
      disableHistory,
      disableSendFlowHistory,
      getCurrentAccountEIP1559Compatibility,
      getCurrentNetworkEIP1559Compatibility,
      getGasFeeEstimates,
      getNetworkState,
      getSelectedAddress,
      getExternalPendingTransactions,
      incomingTransactions = {},
      isSimulationEnabled,
      messenger,
      onNetworkStateChange,
      provider,
      hooks = {},
    }: {
      blockTracker: BlockTracker;
      disableHistory: boolean;
      disableSendFlowHistory: boolean;
      getCurrentAccountEIP1559Compatibility: () => Promise<boolean>;
      getCurrentNetworkEIP1559Compatibility: () => Promise<boolean | undefined>;
      getGasFeeEstimates: () => Promise<GasFeeState>;
      getNetworkState: () => NetworkState;
      getSelectedAddress: () => string;
      getExternalPendingTransactions?: (
        address: string,
      ) => NonceTrackerTransaction[];
      incomingTransactions: {
        includeTokenTransfers?: boolean;
        isEnabled?: () => boolean;
        queryEntireHistory?: boolean;
        updateTransactions?: boolean;
      };
      isSimulationEnabled?: () => boolean;
      messenger: TransactionControllerMessenger;
      onNetworkStateChange: (listener: (state: NetworkState) => void) => void;
      provider: Provider;
      hooks: {
        publish?: (
          transactionMeta: TransactionMeta,
        ) => Promise<{ transactionHash: string | undefined }>;
      };
    },
    config?: Partial<TransactionConfig>,
    state?: Partial<TransactionState>,
  ) {
    super(config, state);

    this.defaultConfig = {
      interval: 15000,
      txHistoryLimit: 40,
    };

    this.defaultState = {
      methodData: {},
      transactions: [],
      lastFetchedBlockNumbers: {},
      submitHistory: [],
    };

    this.initialize();

    this.provider = provider;
    this.messagingSystem = messenger;
    this.getGasFeeEstimates = getGasFeeEstimates;
    this.getNetworkState = getNetworkState;
    this.ethQuery = new EthQuery(provider);
    this.isSendFlowHistoryDisabled = disableSendFlowHistory ?? false;
    this.isHistoryDisabled = disableHistory ?? false;
    this.#isSimulationEnabled = isSimulationEnabled ?? (() => false);
    this.registry = new MethodRegistry({ provider });
    this.getCurrentAccountEIP1559Compatibility =
      getCurrentAccountEIP1559Compatibility;
    this.getCurrentNetworkEIP1559Compatibility =
      getCurrentNetworkEIP1559Compatibility;
    this.getExternalPendingTransactions =
      getExternalPendingTransactions ?? (() => []);
    this.publish =
      hooks?.publish ?? (() => Promise.resolve({ transactionHash: undefined }));

    this.nonceTracker = new NonceTracker({
      provider,
      blockTracker,
      getPendingTransactions:
        this.getNonceTrackerPendingTransactions.bind(this),
      getConfirmedTransactions: this.getNonceTrackerTransactions.bind(
        this,
        TransactionStatus.confirmed,
      ),
    });

    this.incomingTransactionHelper = new IncomingTransactionHelper({
      blockTracker,
      getCurrentAccount: getSelectedAddress,
      getLastFetchedBlockNumbers: () => this.state.lastFetchedBlockNumbers,
      getLocalTransactions: () => this.state.transactions,
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

    this.gasFeeFlows = this.getGasFeeFlows();

    const gasFeePoller = new GasFeePoller({
      gasFeeFlows: this.gasFeeFlows,
      getChainIds: () => [this.getNetworkState().providerConfig.chainId],
      getEthQuery: () => this.ethQuery,
      getGasFeeControllerEstimates: this.getGasFeeEstimates,
      getTransactions: () => this.state.transactions,
      onStateChange: (listener) => {
        this.subscribe(listener);
      },
    });

    gasFeePoller.hub.on(
      'transaction-updated',
      this.#onGasFeePollerTransactionUpdate.bind(this),
    );

    onNetworkStateChange(() => {
      this.ethQuery = new EthQuery(this.provider);
      this.registry = new MethodRegistry({ provider: this.provider });
    });

    this.poll();
  }

  /**
   * Starts a new polling interval.
   *
   * @param interval - The polling interval used to fetch new transaction statuses.
   */
  async poll(interval?: number): Promise<void> {
    interval && this.configure({ interval }, false, false);
    this.handle && clearTimeout(this.handle);
    await safelyExecute(() => this.queryTransactionStatuses());
    this.handle = setTimeout(() => {
      this.poll(this.config.interval);
    }, this.config.interval);
  }

  /**
   * Handle new method data request.
   *
   * @param fourBytePrefix - The method prefix.
   * @returns The method data object corresponding to the given signature prefix.
   */
  async handleMethodData(fourBytePrefix: string): Promise<MethodData> {
    let releaseLock;
    try {
      const { methodData } = this.state;
      const knownMethod = Object.keys(methodData).find(
        (knownFourBytePrefix) => fourBytePrefix === knownFourBytePrefix,
      );
      if (knownMethod) {
        return methodData[fourBytePrefix];
      }

      releaseLock = await this.lookupRegistryMutex.acquire();
      const registry = await this.registryLookup(fourBytePrefix);
      this.update({
        methodData: { ...methodData, ...{ [fourBytePrefix]: registry } },
      });
      return registry;
    } finally {
      if (releaseLock) {
        releaseLock();
      }
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
   * @param opts.origin - The origin of the transaction request, such as a dApp hostname.
   * @param opts.requireApproval - Whether the transaction requires approval by the user, defaults to true unless explicitly disabled.
   * @param opts.securityAlertResponse - Response from security validator.
   * @param opts.sendFlowHistory - The sendFlowHistory entries to add.
   * @param opts.type - Type of transaction to add, such as 'cancel' or 'swap'.
   * @returns Object containing a promise resolving to the transaction hash if approved.
   */
  async addTransaction(
    txParams: TransactionParams,
    {
      actionId,
      deviceConfirmedOn,
      origin,
      requireApproval,
      securityAlertResponse,
      sendFlowHistory,
      type,
    }: {
      actionId?: string;
      deviceConfirmedOn?: WalletDevice;
      origin?: string;
      requireApproval?: boolean | undefined;
      securityAlertResponse?: SecurityAlertResponse;
      sendFlowHistory?: SendFlowHistoryEntry[];
      type?: TransactionType;
    } = {},
  ): Promise<Result> {
    const chainId = this.getChainId();
    const { transactions } = this.state;
    txParams = normalizeTransactionParams(txParams);
    const isEIP1559Compatible = await this.getEIP1559Compatibility();
    validateTxParams(txParams, isEIP1559Compatible);

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

    try {
      const { gas, estimateGasError } = await this.estimateGas(txParams);
      txParams.gas = gas;
      txParams.estimateGasError = estimateGasError;
      transactionMeta.originalGasEstimate = gas;
    } catch (error: any) {
      this.failTransaction(transactionMeta, error);
      return Promise.reject(error);
    }

    // Checks if a transaction already exists with a given actionId
    if (!existingTransactionMeta) {
      if (!this.isSendFlowHistoryDisabled) {
        transactionMeta.sendFlowHistory = sendFlowHistory ?? [];
      }
      // Initial history push
      if (!this.isHistoryDisabled) {
        addInitialHistorySnapshot(transactionMeta);
      }

      if (requireApproval !== false) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.#updateSimulationData(transactionMeta);
      } else {
        log('Skipping simulation as approval not required');
      }

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
   * Creates approvals for all unapproved transactions persisted.
   */
  initApprovals() {
    const chainId = this.getChainId();
    const unapprovedTxs = this.state.transactions.filter(
      (transaction) =>
        transaction.status === TransactionStatus.unapproved &&
        transaction.chainId === chainId,
    );

    for (const txMeta of unapprovedTxs) {
      this.processApproval(txMeta, {
        shouldShowRequest: false,
      }).catch((error) => {
        /* istanbul ignore next */
        console.error('Error during persisted transaction approval', error);
      });
    }
  }

  /**
   * Attempts to cancel a transaction based on its ID by setting its status to "rejected"
   * and emitting a `<tx.id>:finished` hub event.
   *
   * @param transactionId - The ID of the transaction to cancel.
   * @param gasValues - The gas values to use for the cancellation transaction.
   * @param options - The options for the cancellation transaction.
   * @param options.estimatedBaseFee - The estimated base fee of the transaction.
   */
  async stopTransaction(
    transactionId: string,
    gasValues?: GasPriceValue | FeeMarketEIP1559Values,
    { estimatedBaseFee }: { estimatedBaseFee?: string } = {},
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

    const txParams =
      newMaxFeePerGas && newMaxPriorityFeePerGas
        ? {
            from: transactionMeta.txParams.from,
            gasLimit: transactionMeta.txParams.gas,
            maxFeePerGas: newMaxFeePerGas,
            maxPriorityFeePerGas: newMaxPriorityFeePerGas,
            type: 2,
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

    await this.publishTransaction(
      rawTx,
      txParams,
      transactionMeta.chainId,
      'cancel',
    );

    transactionMeta.estimatedBaseFee = estimatedBaseFee;
    transactionMeta.status = TransactionStatus.cancelled;
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

    const txParams =
      newMaxFeePerGas && newMaxPriorityFeePerGas
        ? {
            ...transactionMeta.txParams,
            gasLimit: transactionMeta.txParams.gas,
            maxFeePerGas: newMaxFeePerGas,
            maxPriorityFeePerGas: newMaxPriorityFeePerGas,
            type: 2,
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

    const hash = await this.publishTransaction(
      rawTx,
      txParams,
      transactionMeta.chainId,
      ORIGIN_METAMASK,
    );

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
    this.hub.emit(`${transactionMeta.id}:speedup`, newTransactionMeta);
  }

  /**
   * Estimates required gas for a given transaction.
   *
   * @param transaction - The transaction to estimate gas for.
   * @returns The gas and gas price.
   */
  async estimateGas(transaction: TransactionParams) {
    const estimatedTransaction = { ...transaction };
    const {
      gas,
      gasPrice: providedGasPrice,
      to,
      value,
      data,
    } = estimatedTransaction;
    const gasPrice =
      typeof providedGasPrice === 'undefined'
        ? await query(this.ethQuery, 'gasPrice')
        : providedGasPrice;
    const { providerConfig } = this.getNetworkState();
    const isCustomNetwork = providerConfig.type === NetworkType.rpc;
    // 1. If gas is already defined on the transaction, use it
    if (typeof gas !== 'undefined') {
      return { gas, gasPrice };
    }
    const { gasLimit } = await query(this.ethQuery, 'getBlockByNumber', [
      'latest',
      false,
    ]);

    // 2. If to is not defined or this is not a contract address, and there is no data use 0x5208 / 21000.
    // If the network is a custom network then bypass this check and fetch 'estimateGas'.
    /* istanbul ignore next */
    const code = to ? await query(this.ethQuery, 'getCode', [to]) : undefined;
    /* istanbul ignore next */
    if (
      !isCustomNetwork &&
      (!to || (to && !data && (!code || code === '0x')))
    ) {
      return { gas: '0x5208', gasPrice };
    }

    // if data, should be hex string format
    estimatedTransaction.data = !data
      ? data
      : /* istanbul ignore next */ addHexPrefix(data);

    // 3. If this is a contract address, safely estimate gas using RPC
    estimatedTransaction.value =
      typeof value === 'undefined' ? '0x0' : /* istanbul ignore next */ value;
    const gasLimitBN = hexToBN(gasLimit);
    estimatedTransaction.gas = BNToHex(fractionBN(gasLimitBN, 19, 20));

    let gasHex;
    let estimateGasError;
    try {
      gasHex = await query(this.ethQuery, 'estimateGas', [
        estimatedTransaction,
      ]);
    } catch (error) {
      estimateGasError = ESTIMATE_GAS_ERROR;
      // Fallback to 95% of the block gasLimit.
      gasHex = estimatedTransaction.gas;
    }
    // 4. Pad estimated gas without exceeding the most recent block gasLimit. If the network is a
    // a custom network then return the eth_estimateGas value.
    const gasBN = hexToBN(gasHex);
    const maxGasBN = gasLimitBN.muln(0.9);
    const paddedGasBN = gasBN.muln(1.5);
    /* istanbul ignore next */
    if (gasBN.gt(maxGasBN) || isCustomNetwork) {
      return { gas: addHexPrefix(gasHex), gasPrice, estimateGasError };
    }

    /* istanbul ignore next */
    if (paddedGasBN.lt(maxGasBN)) {
      return {
        gas: addHexPrefix(BNToHex(paddedGasBN)),
        gasPrice,
        estimateGasError,
      };
    }
    return { gas: addHexPrefix(BNToHex(maxGasBN)), gasPrice, estimateGasError };
  }

  /**
   * Check the status of submitted transactions on the network to determine whether they have
   * been included in a block. Any that have been included in a block are marked as confirmed.
   */
  async queryTransactionStatuses() {
    const { transactions } = this.state;
    const currentChainId = this.getChainId();
    let gotUpdates = false;
    await safelyExecute(() =>
      Promise.all(
        transactions.map(async (meta, index) => {
          if (!meta.verifiedOnBlockchain && meta.chainId === currentChainId) {
            const [reconciledTx, updateRequired] =
              await this.blockchainTransactionStateReconciler(meta);
            if (updateRequired) {
              transactions[index] = reconciledTx;
              gotUpdates = updateRequired;
            }
          }
        }),
      ),
    );

    /* istanbul ignore else */
    if (gotUpdates) {
      this.update({
        transactions: this.trimTransactionsForState(transactions),
      });
    }
  }

  updateTransaction(transactionMeta: TransactionMeta, note: string) {
    const { id: transactionId } = transactionMeta;

    this.#updateTransactionInternal(
      { transactionId, note, skipHistory: this.isHistoryDisabled },
      () => ({ ...transactionMeta }),
    );
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
      `${controllerName}:updatesecurityAlertResponse - securityAlertResponse updated`,
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
   * Search transaction metadata for matching entries.
   *
   * @param opts - Options bag.
   * @param opts.searchCriteria - An object containing values or functions for transaction properties to filter transactions with.
   * @param opts.initialList - The transactions to search. Defaults to the current state.
   * @param opts.filterToCurrentNetwork - Whether to filter the results to the current network. Defaults to true.
   * @param opts.limit - The maximum number of transactions to return. No limit by default.
   * @returns An array of transactions matching the provided options.
   */
  getTransactions({
    searchCriteria = {},
    initialList,
    filterToCurrentNetwork = true,
    limit,
  }: {
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    searchCriteria?: any;
    initialList?: TransactionMeta[];
    filterToCurrentNetwork?: boolean;
    limit?: number;
  } = {}): TransactionMeta[] {
    const chainId = this.getChainId();
    // searchCriteria is an object that might have values that aren't predicate
    // methods. When providing any other value type (string, number, etc), we
    // consider this shorthand for "check the value at key for strict equality
    // with the provided value". To conform this object to be only methods, we
    // mapValues (lodash) such that every value on the object is a method that
    // returns a boolean.
    const predicateMethods = mapValues(searchCriteria, (predicate) => {
      return typeof predicate === 'function'
        ? predicate
        : // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (v: any) => v === predicate;
    });

    const transactionsToFilter = initialList ?? this.state.transactions;

    // Combine sortBy and pickBy to transform our state object into an array of
    // matching transactions that are sorted by time.
    const filteredTransactions = sortBy(
      pickBy(transactionsToFilter, (transaction) => {
        if (filterToCurrentNetwork && transaction.chainId !== chainId) {
          return false;
        }
        // iterate over the predicateMethods keys to check if the transaction
        // matches the searchCriteria
        for (const [key, predicate] of Object.entries(predicateMethods)) {
          // We return false early as soon as we know that one of the specified
          // search criteria do not match the transaction. This prevents
          // needlessly checking all criteria when we already know the criteria
          // are not fully satisfied. We check both txParams and the base
          // object as predicate keys can be either.
          if (key in transaction.txParams) {
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (predicate((transaction.txParams as any)[key]) === false) {
              return false;
            }
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } else if (predicate((transaction as any)[key]) === false) {
            return false;
          }
        }

        return true;
      }),
      'time',
    );
    if (limit !== undefined) {
      // We need to have all transactions of a given nonce in order to display
      // necessary details in the UI. We use the size of this set to determine
      // whether we have reached the limit provided, thus ensuring that all
      // transactions of nonces we include will be sent to the UI.
      const nonces = new Set();
      const txs: TransactionMeta[] = [];
      // By default, the transaction list we filter from is sorted by time ASC.
      // To ensure that filtered results prefers the newest transactions we
      // iterate from right to left, inserting transactions into front of a new
      // array. The original order is preserved, but we ensure that newest txs
      // are preferred.
      for (let i = filteredTransactions.length - 1; i > -1; i--) {
        const txMeta = filteredTransactions[i];
        const { nonce } = txMeta.txParams;
        if (!nonces.has(nonce)) {
          if (nonces.size < limit) {
            nonces.add(nonce);
          } else {
            continue;
          }
        }
        // Push transaction into the beginning of our array to ensure the
        // original order is preserved.
        txs.unshift(txMeta);
      }
      return txs;
    }
    return filteredTransactions;
  }

  /**
   * Signs and returns the raw transaction data for provided transaction params list.
   *
   * @param listOfTxParams - The list of transaction params to approve.
   * @param opts - Options bag.
   * @param opts.hasNonce - Whether the transactions already have a nonce.
   * @returns The raw transactions.
   */
  async approveTransactionsWithSameNonce(
    listOfTxParams: TransactionParams[] = [],
    { hasNonce }: { hasNonce?: boolean } = {},
  ): Promise<string | string[]> {
    log('Approving transactions with same nonce', {
      transactions: listOfTxParams,
    });

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
      const requiresNonce = hasNonce !== true;

      nonceLock = requiresNonce
        ? await this.nonceTracker.getNonceLock(fromAddress)
        : undefined;

      const nonce = nonceLock
        ? addHexPrefix(nonceLock.nextNonce.toString(16))
        : initialTx.nonce;

      if (nonceLock) {
        log('Using nonce from nonce tracker', nonce, nonceLock.nonceDetails);
      }

      rawTransactions = await Promise.all(
        listOfTxParams.map((txParams) => {
          txParams.nonce = nonce;
          return this.signExternalTransaction(txParams);
        }),
      );
    } catch (err) {
      log('Error while signing transactions with same nonce', err);
      // Must set transaction to submitted/failed before releasing lock
      // continue with error chain
      throw err;
    } finally {
      nonceLock?.releaseLock();
      this.inProcessOfSigning.delete(initialTxAsSerializedHex);
    }
    return rawTransactions;
  }

  private async processApproval(
    transactionMeta: TransactionMeta,
    {
      isExisting = false,
      requireApproval,
      shouldShowRequest = true,
    }: {
      isExisting?: boolean;
      requireApproval?: boolean | undefined;
      shouldShowRequest?: boolean;
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
        }
      } catch (error: any) {
        const { isCompleted: isTxCompleted } =
          this.isTransactionCompleted(transactionId);
        if (!isTxCompleted) {
          if (error.code === errorCodes.provider.userRejectedRequest) {
            this.cancelTransaction(transactionId);

            throw providerErrors.userRejectedRequest(
              'User rejected the transaction',
            );
          } else {
            this.failTransaction(meta, error);
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
        nonceLock = await this.getNonceLock(from);
        nonceToUse = addHexPrefix(nonceLock.nextNonce.toString(16));
      }

      transactionMeta.status = status;
      transactionMeta.txParams.nonce = nonceToUse;
      transactionMeta.txParams.chainId = chainId;

      const baseTxParams = {
        ...transactionMeta.txParams,
        gasLimit: transactionMeta.txParams.gas,
      };

      const isEIP1559 = isEIP1559Transaction(transactionMeta.txParams);

      const txParams = isEIP1559
        ? {
            ...baseTxParams,
            maxFeePerGas: transactionMeta.txParams.maxFeePerGas,
            maxPriorityFeePerGas: transactionMeta.txParams.maxPriorityFeePerGas,
            estimatedBaseFee: transactionMeta.txParams.estimatedBaseFee,
            // specify type 2 if maxFeePerGas and maxPriorityFeePerGas are set
            type: 2,
          }
        : baseTxParams;

      // delete gasPrice if maxFeePerGas and maxPriorityFeePerGas are set
      if (isEIP1559) {
        delete txParams.gasPrice;
      }

      const unsignedEthTx = this.prepareUnsignedEthTx(txParams);
      this.inProcessOfSigning.add(transactionMeta.id);
      const signedTx = await this.sign(unsignedEthTx, from);
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

      let { transactionHash: hash } = await this.publish(
        transactionMeta,
        rawTx,
      );

      if (hash === undefined) {
        hash = await this.publishTransaction(
          rawTx,
          txParams,
          chainId,
          transactionMeta.origin,
        );
      }

      transactionMeta.hash = hash;
      transactionMeta.status = TransactionStatus.submitted;
      transactionMeta.submittedTime = new Date().getTime();
      this.updateTransaction(
        transactionMeta,
        'TransactionController#approveTransaction - Transaction submitted',
      );
      this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
    } catch (error: any) {
      this.failTransaction(transactionMeta, error);
    } finally {
      this.inProcessOfSigning.delete(transactionId);
      releaseLock();
      if (nonceLock) {
        nonceLock.releaseLock();
      }
    }
  }

  /**
   * Cancels a transaction based on its ID by setting its status to "rejected"
   * and emitting a `<tx.id>:finished` hub event.
   *
   * @param transactionId - The ID of the transaction to cancel.
   */
  private cancelTransaction(transactionId: string) {
    const transactionMeta = this.state.transactions.find(
      ({ id }) => id === transactionId,
    );
    if (!transactionMeta) {
      return;
    }
    transactionMeta.status = TransactionStatus.rejected;
    this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
    const transactions = this.state.transactions.filter(
      ({ id }) => id !== transactionId,
    );
    this.update({ transactions: this.trimTransactionsForState(transactions) });
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

  /**
   * Method to verify the state of a transaction using the Blockchain as a source of truth.
   *
   * @param meta - The local transaction to verify on the blockchain.
   * @returns A tuple containing the updated transaction, and whether or not an update was required.
   */
  private async blockchainTransactionStateReconciler(
    meta: TransactionMeta,
  ): Promise<[TransactionMeta, boolean]> {
    const { status, hash } = meta;
    switch (status) {
      case TransactionStatus.confirmed:
        const txReceipt = await query(this.ethQuery, 'getTransactionReceipt', [
          hash,
        ]);

        if (!txReceipt) {
          return [meta, false];
        }

        const txBlock = await query(this.ethQuery, 'getBlockByHash', [
          txReceipt.blockHash,
        ]);

        meta.verifiedOnBlockchain = true;
        meta.txParams.gasUsed = txReceipt.gasUsed;
        meta.txReceipt = txReceipt;
        meta.baseFeePerGas = txBlock?.baseFeePerGas;
        meta.blockTimestamp = txBlock?.timestamp;

        // According to the Web3 docs:
        // TRUE if the transaction was successful, FALSE if the EVM reverted the transaction.
        if (Number(txReceipt.status) === 0) {
          const error: Error = new Error(
            'Transaction failed. The transaction was reversed',
          );
          this.failTransaction(meta, error);
          return [meta, false];
        }

        return [meta, true];
      case TransactionStatus.submitted:
        const txObj = await query(this.ethQuery, 'getTransactionByHash', [
          hash,
        ]);

        if (!txObj) {
          const receiptShowsFailedStatus =
            await this.checkTxReceiptStatusIsFailed(hash);

          // Case the txObj is evaluated as false, a second check will
          // determine if the tx failed or it is pending or confirmed
          if (receiptShowsFailedStatus) {
            const error: Error = new Error(
              'Transaction failed. The transaction was dropped or replaced by a new one',
            );
            this.failTransaction(meta, error);
          }
        }

        /* istanbul ignore next */
        if (txObj?.blockNumber) {
          // transactions can be added to a block and still fail, so we need to check the transaction status before emitting the confirmed event
          const txStatusFailed = await this.checkTxReceiptStatusIsFailed(hash);
          if (txStatusFailed) {
            const error = new Error(
              'Transaction failed. The transaction was reversed',
            );
            this.failTransaction(meta, error);
          } else {
            meta.status = TransactionStatus.confirmed;
            this.hub.emit(`${meta.id}:confirmed`, meta);
            return [meta, true];
          }
        }

        return [meta, false];
      default:
        return [meta, false];
    }
  }

  /**
   * Method to check if a tx has failed according to their receipt
   * According to the Web3 docs:
   * TRUE if the transaction was successful, FALSE if the EVM reverted the transaction.
   * The receipt is not available for pending transactions and returns null.
   *
   * @param txHash - The transaction hash.
   * @returns Whether the transaction has failed.
   */
  private async checkTxReceiptStatusIsFailed(
    txHash: string | undefined,
  ): Promise<boolean> {
    const txReceipt = await query(this.ethQuery, 'getTransactionReceipt', [
      txHash,
    ]);
    if (!txReceipt) {
      // Transaction is pending
      return false;
    }
    return Number(txReceipt.status) === 0;
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

  private prepareUnsignedEthTx(
    txParams: Record<string, unknown>,
  ): TypedTransaction {
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
      chain !== 'linea-sepolia' &&
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

  private getNonceTrackerTransactions(
    status: TransactionStatus,
    address: string,
  ) {
    const currentChainId = this.getChainId();

    return getAndFormatTransactionsForNonceTracker(
      currentChainId,
      address,
      status,
      this.state.transactions,
    );
  }

  private async publishTransaction(
    rawTransaction: string,
    transaction: Record<string, unknown>,
    chainId?: Hex,
    origin?: string,
  ): Promise<string> {
    const transactionHash = await query(this.ethQuery, 'sendRawTransaction', [
      rawTransaction,
    ]);

    this.updateSubmitHistory(
      rawTransaction,
      transactionHash,
      transaction,
      chainId,
      origin,
    );

    return transactionHash;
  }

  private updateSubmitHistory(
    rawTransaction: string,
    hash: string,
    transaction: Record<string, unknown>,
    chainId?: Hex,
    origin?: string,
  ): void {
    const { rpcUrl: networkUrl, type: networkType } =
      this.getNetworkState().providerConfig;

    const submitHistoryEntry: SubmitHistoryEntry = {
      chainId,
      hash,
      networkType,
      networkUrl,
      origin,
      time: Date.now(),
      transaction,
      rawTransaction,
    };

    const submitHistory = [submitHistoryEntry, ...this.state.submitHistory];

    if (submitHistory.length > SUBMIT_HISTORY_LIMIT) {
      submitHistory.pop();
    }

    this.update({ submitHistory });
  }

  private getGasFeeFlows(): GasFeeFlow[] {
    return [new LineaGasFeeFlow()];
  }

  private getNonceTrackerPendingTransactions(address: string) {
    const standardPendingTransactions = this.getNonceTrackerTransactions(
      TransactionStatus.submitted,
      address,
    );

    const externalPendingTransactions =
      this.getExternalPendingTransactions(address);

    return [...standardPendingTransactions, ...externalPendingTransactions];
  }

  private async updatePostBalance(transactionMeta: TransactionMeta) {
    try {
      if (transactionMeta.type !== TransactionType.swap) {
        return;
      }

      const { updatedTransactionMeta, approvalTransactionMeta } =
        await updatePostTransactionBalance(transactionMeta, {
          ethQuery: this.ethQuery,
          getTransaction: this.getTransaction.bind(this),
          updateTransaction: this.updateTransaction.bind(this),
        });

      this.hub.emit('post-transaction-balance-updated', {
        transactionMeta: updatedTransactionMeta,
        approvalTransactionMeta,
      });
    } catch (error) {
      console.error('Error while updating post transaction balance', error);
    }
  }

  private async signExternalTransaction(
    transactionParams: TransactionParams,
  ): Promise<string> {
    if (!this.sign) {
      throw new Error('No sign method defined.');
    }

    const normalizedTransactionParams =
      normalizeTransactionParams(transactionParams);
    const chainId = this.getChainId();
    const type = isEIP1559Transaction(normalizedTransactionParams)
      ? TransactionEnvelopeType.feeMarket
      : TransactionEnvelopeType.legacy;
    const updatedTransactionParams = {
      ...normalizedTransactionParams,
      type,
      gasLimit: normalizedTransactionParams.gas,
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

  private onTransactionStatusChange(transactionMeta: TransactionMeta) {
    this.hub.emit('transaction-status-update', { transactionMeta });
  }

  #updateTransactionInternal(
    {
      transactionId,
      note,
      skipHistory,
    }: { transactionId: string; note?: string; skipHistory?: boolean },
    callback: (transactionMeta: TransactionMeta) => TransactionMeta | void,
  ): Readonly<TransactionMeta> {
    let updatedTransactionParams: (keyof TransactionParams)[] = [];

    this.#updateWithCallback((state) => {
      const index = state.transactions.findIndex(
        ({ id }: { id: string }) => id === transactionId,
      );

      let transactionMeta = state.transactions[index];

      // eslint-disable-next-line n/callback-return
      transactionMeta = callback(transactionMeta) ?? transactionMeta;

      transactionMeta.txParams = normalizeTransactionParams(
        transactionMeta.txParams,
      );

      validateTxParams(transactionMeta.txParams);

      updatedTransactionParams =
        this.#checkIfTransactionParamsUpdated(transactionMeta);

      if (skipHistory !== true) {
        updateTransactionHistory(
          transactionMeta,
          note ?? 'Transaction updated',
        );
      }
      state.transactions[index] = transactionMeta;
    });

    const transactionMeta = this.getTransaction(
      transactionId,
    ) as TransactionMeta;

    if (updatedTransactionParams.length > 0) {
      this.#onTransactionParamsUpdated(
        transactionMeta,
        updatedTransactionParams,
      );
    }

    return transactionMeta;
  }

  #checkIfTransactionParamsUpdated(newTransactionMeta: TransactionMeta) {
    const { id: transactionId, txParams: newParams } = newTransactionMeta;

    const originalParams = this.getTransaction(transactionId)?.txParams;

    if (!originalParams || isEqual(originalParams, newParams)) {
      return [];
    }

    const params = Object.keys(newParams) as (keyof TransactionParams)[];

    const updatedProperties = params.filter(
      (param) => newParams[param] !== originalParams[param],
    );

    log(
      'Transaction parameters have been updated',
      transactionId,
      updatedProperties,
      originalParams,
      newParams,
    );

    return updatedProperties;
  }

  #onTransactionParamsUpdated(
    transactionMeta: TransactionMeta,
    updatedParams: (keyof TransactionParams)[],
  ) {
    if (
      (['to', 'value', 'data'] as const).some((param) =>
        updatedParams.includes(param),
      )
    ) {
      log('Updating simulation data due to transaction parameter update');
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#updateSimulationData(transactionMeta);
    }
  }

  async #updateSimulationData(transactionMeta: TransactionMeta) {
    const { id: transactionId, chainId, txParams } = transactionMeta;
    const { from, to, value, data } = txParams;

    let simulationData: SimulationData = {
      error: {
        code: SimulationErrorCode.Disabled,
        message: 'Simulation disabled',
      },
      tokenBalanceChanges: [],
    };

    if (this.#isSimulationEnabled()) {
      this.#updateTransactionInternal(
        { transactionId, skipHistory: true },
        (txMeta) => {
          txMeta.simulationData = undefined;
        },
      );

      simulationData = await getSimulationData({
        chainId,
        from: from as Hex,
        to: to as Hex,
        value: value as Hex,
        data: data as Hex,
      });
    }

    const finalTransactionMeta = this.getTransaction(transactionId);

    if (!finalTransactionMeta) {
      log(
        'Cannot update simulation data as transaction not found',
        transactionId,
        simulationData,
      );

      return;
    }

    this.#updateTransactionInternal(
      {
        transactionId,
        note: 'TransactionController#updateSimulationData - Update simulation data',
      },
      (txMeta) => {
        txMeta.simulationData = simulationData;
      },
    );

    log('Updated simulation data', transactionId, simulationData);
  }

  #updateWithCallback(
    callback: (state: TransactionState) => TransactionState | void,
  ) {
    const currentState = cloneDeep(this.state);
    // eslint-disable-next-line n/callback-return
    const updatedState = callback(currentState) ?? currentState;
    this.update(updatedState);
  }

  #onGasFeePollerTransactionUpdate({
    id,
    gasFeeEstimates,
    gasFeeEstimatesLoaded,
  }: {
    id: string;
    gasFeeEstimates?: GasFeeEstimates;
    gasFeeEstimatesLoaded?: boolean;
    layer1GasFee?: Hex;
  }) {
    this.#updateTransactionInternal(
      { transactionId: id, skipHistory: true },
      (txMeta) => {
        if (gasFeeEstimates) {
          txMeta.gasFeeEstimates = gasFeeEstimates;
        }

        if (gasFeeEstimatesLoaded !== undefined) {
          txMeta.gasFeeEstimatesLoaded = gasFeeEstimatesLoaded;
        }
      },
    );
  }
}

export default TransactionController;
