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
import type {
  BlockTracker,
  NetworkState,
  Provider,
} from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import MethodRegistry from 'eth-method-registry';
import { errorCodes, ethErrors } from 'eth-rpc-errors';
import { addHexPrefix, bufferToHex } from 'ethereumjs-util';
import { EventEmitter } from 'events';
import NonceTracker from 'nonce-tracker';
import { v1 as random } from 'uuid';

import { EtherscanRemoteTransactionSource } from './EtherscanRemoteTransactionSource';
import { validateConfirmedExternalTransaction } from './external-transactions';
import { IncomingTransactionHelper } from './IncomingTransactionHelper';
import type {
  DappSuggestedGasFees,
  Transaction,
  TransactionMeta,
  TransactionReceipt,
  WalletDevice,
} from './types';
import { TransactionStatus } from './types';
import {
  getAndFormatTransactionsForNonceTracker,
  getIncreasedPriceFromExisting,
  normalizeTransaction,
  isEIP1559Transaction,
  isFeeMarketEIP1559Values,
  isGasPriceValue,
  transactionMatchesNetwork,
  validateGasValues,
  validateMinimumIncrease,
  validateTransaction,
  ESTIMATE_GAS_ERROR,
} from './utils';

export const HARDFORK = Hardfork.London;

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

/**
 * Controller responsible for submitting and managing transactions.
 */
export class TransactionController extends BaseController<
  TransactionConfig,
  TransactionState
> {
  private ethQuery: EthQuery;

  private readonly nonceTracker: NonceTracker;

  private registry: any;

  private readonly provider: Provider;

  private handle?: ReturnType<typeof setTimeout>;

  private readonly mutex = new Mutex();

  private readonly getNetworkState: () => NetworkState;

  private readonly messagingSystem: TransactionControllerMessenger;

  private readonly incomingTransactionHelper: IncomingTransactionHelper;

  private failTransaction(transactionMeta: TransactionMeta, error: Error) {
    const newTransactionMeta = {
      ...transactionMeta,
      error,
      status: TransactionStatus.failed,
    };
    this.updateTransaction(newTransactionMeta);
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
   * @param options.getNetworkState - Gets the state of the network controller.
   * @param options.getSelectedAddress - Gets the address of the currently selected account.
   * @param options.incomingTransactions - Configuration options for incoming transaction support.
   * @param options.incomingTransactions.apiKey - An optional API key to use when fetching remote transaction data.
   * @param options.incomingTransactions.includeTokenTransfers - Whether or not to include ERC20 token transfers.
   * @param options.incomingTransactions.isEnabled - Whether or not incoming transaction retrieval is enabled.
   * @param options.incomingTransactions.updateTransactions - Whether or not to update local transactions using remote transaction data.
   * @param options.messenger - The controller messenger.
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
   * @param options.provider - The provider used to create the underlying EthQuery instance.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      blockTracker,
      getNetworkState,
      getSelectedAddress,
      incomingTransactions = {},
      messenger,
      onNetworkStateChange,
      provider,
    }: {
      blockTracker: BlockTracker;
      getNetworkState: () => NetworkState;
      getSelectedAddress: () => string;
      incomingTransactions: {
        apiKey?: string;
        includeTokenTransfers?: boolean;
        isEnabled?: () => boolean;
        updateTransactions?: boolean;
      };
      messenger: TransactionControllerMessenger;
      onNetworkStateChange: (listener: (state: NetworkState) => void) => void;
      provider: Provider;
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
    };

    this.initialize();

    this.provider = provider;
    this.messagingSystem = messenger;
    this.getNetworkState = getNetworkState;
    this.ethQuery = new EthQuery(provider);
    this.registry = new MethodRegistry({ provider });

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
      getNetworkState,
      isEnabled: incomingTransactions.isEnabled,
      remoteTransactionSource: new EtherscanRemoteTransactionSource({
        apiKey: incomingTransactions.apiKey,
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
   * @param transaction - The transaction object to add.
   * @param opts - Additional options to control how the transaction is added.
   * @param opts.actionId - Unique ID to prevent duplicate requests.
   * @param opts.deviceConfirmedOn - An enum to indicate what device confirmed the transaction.
   * @param opts.origin - The origin of the transaction request, such as a dApp hostname.
   * @param opts.requireApproval - Whether the transaction requires approval by the user, defaults to true unless explicitly disabled.
   * @param opts.securityAlertResponse - Response from security validator.
   * @returns Object containing a promise resolving to the transaction hash if approved.
   */
  async addTransaction(
    transaction: Transaction,
    {
      actionId,
      deviceConfirmedOn,
      origin,
      requireApproval,
      securityAlertResponse,
    }: {
      actionId?: string;
      deviceConfirmedOn?: WalletDevice;
      origin?: string;
      requireApproval?: boolean | undefined;
      securityAlertResponse?: Record<string, unknown>;
    } = {},
  ): Promise<Result> {
    const { chainId, networkId } = this.getChainAndNetworkId();
    const { transactions } = this.state;
    transaction = normalizeTransaction(transaction);
    validateTransaction(transaction);

    const dappSuggestedGasFees = this.generateDappSuggestedGasFees(
      transaction,
      origin,
    );

    const existingTransactionMeta = this.getTransactionWithActionId(actionId);
    // If a request to add a transaction with the same actionId is submitted again, a new transaction will not be created for it.
    const transactionMeta: TransactionMeta = existingTransactionMeta || {
      id: random(),
      networkID: networkId ?? undefined,
      chainId,
      origin,
      status: TransactionStatus.unapproved as TransactionStatus.unapproved,
      time: Date.now(),
      transaction,
      deviceConfirmedOn,
      verifiedOnBlockchain: false,
      dappSuggestedGasFees,
      securityAlertResponse,
      // Add actionId to txMeta to check if same actionId is seen again
      actionId,
    };

    try {
      const { gas, estimateGasError } = await this.estimateGas(transaction);
      transaction.gas = gas;
      transaction.estimateGasError = estimateGasError;
    } catch (error: any) {
      this.failTransaction(transactionMeta, error);
      return Promise.reject(error);
    }
    // Checks if a transaction already exists with a given actionId
    if (!existingTransactionMeta) {
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
    const { networkId, chainId } = this.getChainAndNetworkId();
    const unapprovedTxs = this.state.transactions.filter(
      (transaction) =>
        transaction.status === TransactionStatus.unapproved &&
        transactionMatchesNetwork(transaction, chainId, networkId),
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
   * @param transactionID - The ID of the transaction to cancel.
   * @param gasValues - The gas values to use for the cancellation transaction.
   * @param options - The options for the cancellation transaction.
   * @param options.estimatedBaseFee - The estimated base fee of the transaction.
   */
  async stopTransaction(
    transactionID: string,
    gasValues?: GasPriceValue | FeeMarketEIP1559Values,
    { estimatedBaseFee }: { estimatedBaseFee?: string } = {},
  ) {
    if (gasValues) {
      validateGasValues(gasValues);
    }
    const transactionMeta = this.state.transactions.find(
      ({ id }) => id === transactionID,
    );
    if (!transactionMeta) {
      return;
    }

    if (!this.sign) {
      throw new Error('No sign method defined.');
    }

    // gasPrice (legacy non EIP1559)
    const minGasPrice = getIncreasedPriceFromExisting(
      transactionMeta.transaction.gasPrice,
      CANCEL_RATE,
    );

    const gasPriceFromValues = isGasPriceValue(gasValues) && gasValues.gasPrice;

    const newGasPrice =
      (gasPriceFromValues &&
        validateMinimumIncrease(gasPriceFromValues, minGasPrice)) ||
      minGasPrice;

    // maxFeePerGas (EIP1559)
    const existingMaxFeePerGas = transactionMeta.transaction?.maxFeePerGas;
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
      transactionMeta.transaction?.maxPriorityFeePerGas;
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
            from: transactionMeta.transaction.from,
            gasLimit: transactionMeta.transaction.gas,
            maxFeePerGas: newMaxFeePerGas,
            maxPriorityFeePerGas: newMaxPriorityFeePerGas,
            type: 2,
            nonce: transactionMeta.transaction.nonce,
            to: transactionMeta.transaction.from,
            value: '0x0',
          }
        : {
            from: transactionMeta.transaction.from,
            gasLimit: transactionMeta.transaction.gas,
            gasPrice: newGasPrice,
            nonce: transactionMeta.transaction.nonce,
            to: transactionMeta.transaction.from,
            value: '0x0',
          };

    const unsignedEthTx = this.prepareUnsignedEthTx(txParams);

    const signedTx = await this.sign(
      unsignedEthTx,
      transactionMeta.transaction.from,
    );
    const rawTransaction = bufferToHex(signedTx.serialize());
    await query(this.ethQuery, 'sendRawTransaction', [rawTransaction]);
    transactionMeta.estimatedBaseFee = estimatedBaseFee;
    transactionMeta.status = TransactionStatus.cancelled;
    this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
  }

  /**
   * Attempts to speed up a transaction increasing transaction gasPrice by ten percent.
   *
   * @param transactionID - The ID of the transaction to speed up.
   * @param gasValues - The gas values to use for the speed up transaction.
   * @param options - The options for the speed up transaction.
   * @param options.actionId - Unique ID to prevent duplicate requests
   * @param options.estimatedBaseFee - The estimated base fee of the transaction.
   */
  async speedUpTransaction(
    transactionID: string,
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
      ({ id }) => id === transactionID,
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
      transactionMeta.transaction.gasPrice,
      SPEED_UP_RATE,
    );

    const gasPriceFromValues = isGasPriceValue(gasValues) && gasValues.gasPrice;

    const newGasPrice =
      (gasPriceFromValues &&
        validateMinimumIncrease(gasPriceFromValues, minGasPrice)) ||
      minGasPrice;

    // maxFeePerGas (EIP1559)
    const existingMaxFeePerGas = transactionMeta.transaction?.maxFeePerGas;
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
      transactionMeta.transaction?.maxPriorityFeePerGas;
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
            ...transactionMeta.transaction,
            gasLimit: transactionMeta.transaction.gas,
            maxFeePerGas: newMaxFeePerGas,
            maxPriorityFeePerGas: newMaxPriorityFeePerGas,
            type: 2,
          }
        : {
            ...transactionMeta.transaction,
            gasLimit: transactionMeta.transaction.gas,
            gasPrice: newGasPrice,
          };

    const unsignedEthTx = this.prepareUnsignedEthTx(txParams);

    const signedTx = await this.sign(
      unsignedEthTx,
      transactionMeta.transaction.from,
    );
    const rawTransaction = bufferToHex(signedTx.serialize());
    const transactionHash = await query(this.ethQuery, 'sendRawTransaction', [
      rawTransaction,
    ]);
    const baseTransactionMeta = {
      ...transactionMeta,
      estimatedBaseFee,
      id: random(),
      time: Date.now(),
      transactionHash,
      actionId,
    };
    const newTransactionMeta =
      newMaxFeePerGas && newMaxPriorityFeePerGas
        ? {
            ...baseTransactionMeta,
            transaction: {
              ...transactionMeta.transaction,
              maxFeePerGas: newMaxFeePerGas,
              maxPriorityFeePerGas: newMaxPriorityFeePerGas,
            },
          }
        : {
            ...baseTransactionMeta,
            transaction: {
              ...transactionMeta.transaction,
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
  async estimateGas(transaction: Transaction) {
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
    // If the newtwork is a custom network then bypass this check and fetch 'estimateGas'.
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
    const { chainId: currentChainId, networkId: currentNetworkID } =
      this.getChainAndNetworkId();
    let gotUpdates = false;
    await safelyExecute(() =>
      Promise.all(
        transactions.map(async (meta, index) => {
          // Using fallback to networkID only when there is no chainId present.
          // Should be removed when networkID is completely removed.
          const txBelongsToCurrentChain =
            meta.chainId === currentChainId ||
            (!meta.chainId && meta.networkID === currentNetworkID);

          if (!meta.verifiedOnBlockchain && txBelongsToCurrentChain) {
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

  /**
   * Updates an existing transaction in state.
   *
   * @param transactionMeta - The new transaction to store in state.
   */
  updateTransaction(transactionMeta: TransactionMeta) {
    const { transactions } = this.state;
    transactionMeta.transaction = normalizeTransaction(
      transactionMeta.transaction,
    );
    validateTransaction(transactionMeta.transaction);
    const index = transactions.findIndex(({ id }) => transactionMeta.id === id);
    transactions[index] = transactionMeta;
    this.update({ transactions: this.trimTransactionsForState(transactions) });
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
    const { chainId: currentChainId, networkId: currentNetworkID } =
      this.getChainAndNetworkId();
    const newTransactions = this.state.transactions.filter(
      ({ networkID, chainId, transaction }) => {
        // Using fallback to networkID only when there is no chainId present. Should be removed when networkID is completely removed.
        const isMatchingNetwork =
          ignoreNetwork ||
          chainId === currentChainId ||
          (!chainId && networkID === currentNetworkID);

        if (!isMatchingNetwork) {
          return true;
        }

        const isMatchingAddress =
          !address || transaction.from?.toLowerCase() === address.toLowerCase();

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
      this.updateTransaction(transactionMeta);
    } catch (error) {
      console.error(error);
    }
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

            throw ethErrors.provider.userRejectedRequest(
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
        throw ethErrors.rpc.internal(finalMeta.error.message);

      case TransactionStatus.cancelled:
        const cancelError = ethErrors.rpc.internal(
          'User cancelled the transaction',
        );

        resultCallbacks?.error(cancelError);
        throw cancelError;

      case TransactionStatus.submitted:
        resultCallbacks?.success();
        return finalMeta.transactionHash as string;

      default:
        const internalError = ethErrors.rpc.internal(
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
   * @param transactionID - The ID of the transaction to approve.
   */
  private async approveTransaction(transactionID: string) {
    const { transactions } = this.state;
    const releaseLock = await this.mutex.acquire();
    const { chainId } = this.getChainAndNetworkId();
    const index = transactions.findIndex(({ id }) => transactionID === id);
    const transactionMeta = transactions[index];
    const {
      transaction: { nonce, from },
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

      const { approved: status } = TransactionStatus;
      let nonceToUse = nonce;
      // if a nonce already exists on the transactionMeta it means this is a speedup or cancel transaction
      // so we want to reuse that nonce and hope that it beats the previous attempt to chain. Otherwise use a new locked nonce
      if (!nonceToUse) {
        nonceLock = await this.nonceTracker.getNonceLock(from);
        nonceToUse = addHexPrefix(nonceLock.nextNonce.toString(16));
      }

      transactionMeta.status = status;
      transactionMeta.transaction.nonce = nonceToUse;
      transactionMeta.transaction.chainId = chainId;

      const baseTxParams = {
        ...transactionMeta.transaction,
        gasLimit: transactionMeta.transaction.gas,
      };

      const isEIP1559 = isEIP1559Transaction(transactionMeta.transaction);

      const txParams = isEIP1559
        ? {
            ...baseTxParams,
            maxFeePerGas: transactionMeta.transaction.maxFeePerGas,
            maxPriorityFeePerGas:
              transactionMeta.transaction.maxPriorityFeePerGas,
            estimatedBaseFee: transactionMeta.transaction.estimatedBaseFee,
            // specify type 2 if maxFeePerGas and maxPriorityFeePerGas are set
            type: 2,
          }
        : baseTxParams;

      // delete gasPrice if maxFeePerGas and maxPriorityFeePerGas are set
      if (isEIP1559) {
        delete txParams.gasPrice;
      }

      const unsignedEthTx = this.prepareUnsignedEthTx(txParams);
      const signedTx = await this.sign(unsignedEthTx, from);
      transactionMeta.status = TransactionStatus.signed;
      this.updateTransaction(transactionMeta);
      const rawTransaction = bufferToHex(signedTx.serialize());

      transactionMeta.rawTransaction = rawTransaction;
      this.updateTransaction(transactionMeta);
      const transactionHash = await query(this.ethQuery, 'sendRawTransaction', [
        rawTransaction,
      ]);
      transactionMeta.transactionHash = transactionHash;
      transactionMeta.status = TransactionStatus.submitted;
      this.updateTransaction(transactionMeta);
      this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
    } catch (error: any) {
      this.failTransaction(transactionMeta, error);
    } finally {
      // must set transaction to submitted/failed before releasing lock
      if (nonceLock) {
        nonceLock.releaseLock();
      }
      releaseLock();
    }
  }

  /**
   * Cancels a transaction based on its ID by setting its status to "rejected"
   * and emitting a `<tx.id>:finished` hub event.
   *
   * @param transactionID - The ID of the transaction to cancel.
   */
  private cancelTransaction(transactionID: string) {
    const transactionMeta = this.state.transactions.find(
      ({ id }) => id === transactionID,
    );
    if (!transactionMeta) {
      return;
    }
    transactionMeta.status = TransactionStatus.rejected;
    this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
    const transactions = this.state.transactions.filter(
      ({ id }) => id !== transactionID,
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
    const txsToKeep = transactions.reverse().filter((tx) => {
      const { chainId, networkID, status, transaction, time } = tx;
      if (transaction) {
        const key = `${transaction.nonce}-${
          chainId ? convertHexToDecimal(chainId) : networkID
        }-${new Date(time).toDateString()}`;
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
    txsToKeep.reverse();
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
    const { status, transactionHash } = meta;
    switch (status) {
      case TransactionStatus.confirmed:
        const txReceipt = await query(this.ethQuery, 'getTransactionReceipt', [
          transactionHash,
        ]);

        if (!txReceipt) {
          return [meta, false];
        }

        const txBlock = await query(this.ethQuery, 'getBlockByHash', [
          txReceipt.blockHash,
        ]);

        meta.verifiedOnBlockchain = true;
        meta.transaction.gasUsed = txReceipt.gasUsed;
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
          transactionHash,
        ]);

        if (!txObj) {
          const receiptShowsFailedStatus =
            await this.checkTxReceiptStatusIsFailed(transactionHash);

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
          meta.status = TransactionStatus.confirmed;
          this.hub.emit(`${meta.id}:confirmed`, meta);
          return [meta, true];
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

  private getChainAndNetworkId(): {
    networkId: string | null;
    chainId: Hex;
  } {
    const { networkId, providerConfig } = this.getNetworkState();
    const chainId = providerConfig?.chainId;
    return { networkId, chainId };
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
      networkId,
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
      networkId: networkId === null ? NaN : parseInt(networkId, undefined),
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
          ({ transactionHash }) =>
            transactionHash === originalTransaction.transactionHash,
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
    transaction: Transaction,
    origin?: string,
  ): DappSuggestedGasFees | undefined {
    if (!origin || origin === ORIGIN_METAMASK) {
      return undefined;
    }

    const { gasPrice, maxFeePerGas, maxPriorityFeePerGas, gas } = transaction;

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
    const { networkId, chainId } = this.getChainAndNetworkId();
    const { transactions } = this.state;
    const fromAddress = transactionMeta?.transaction?.from;
    const sameFromAndNetworkTransactions = transactions.filter(
      (transaction) =>
        transaction.transaction.from === fromAddress &&
        transactionMatchesNetwork(transaction, chainId, networkId),
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
    const { networkId, chainId } = this.getChainAndNetworkId();
    const transactionMeta = this.getTransaction(transactionId);
    const nonce = transactionMeta?.transaction?.nonce;
    const from = transactionMeta?.transaction?.from;
    const sameNonceTxs = this.state.transactions.filter(
      (transaction) =>
        transaction.transaction.from === from &&
        transaction.transaction.nonce === nonce &&
        transactionMatchesNetwork(transaction, chainId, networkId),
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
    this.updateTransaction(transactionMeta);
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
}

export default TransactionController;
