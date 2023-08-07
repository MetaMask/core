import { EventEmitter } from 'events';
import { addHexPrefix, bufferToHex } from 'ethereumjs-util';
import { errorCodes, ethErrors } from 'eth-rpc-errors';
import MethodRegistry from 'eth-method-registry';
import EthQuery from 'eth-query';
import Common from '@ethereumjs/common';
import { TransactionFactory, TypedTransaction } from '@ethereumjs/tx';
import { v1 as random } from 'uuid';
import { Mutex } from 'async-mutex';
import {
  BaseController,
  BaseConfig,
  BaseState,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import type {
  NetworkState,
  ProviderProxy,
  BlockTrackerProxy,
} from '@metamask/network-controller';
import {
  BNToHex,
  fractionBN,
  hexToBN,
  safelyExecute,
  query,
  NetworkType,
  RPC,
} from '@metamask/controller-utils';
import NonceTracker from 'nonce-tracker';
import {
  AcceptResultCallbacks,
  AddApprovalRequest,
  AddResult,
} from '@metamask/approval-controller';
import { PollingBlockTracker as BlockTracker } from 'eth-block-tracker';
import { createEventEmitterProxy } from '@metamask/swappable-obj-proxy';
import type { SwappableProxy } from '@metamask/swappable-obj-proxy';
import {
  getAndFormatTransactionsForNonceTracker,
  normalizeTransaction,
  validateTransaction,
  getIncreasedPriceFromExisting,
  isEIP1559Transaction,
  isGasPriceValue,
  isFeeMarketEIP1559Values,
  validateGasValues,
  validateMinimumIncrease,
  ESTIMATE_GAS_ERROR,
} from './utils';
import { IncomingTransactionHelper } from './IncomingTransactionHelper';
import { EtherscanRemoteTransactionSource } from './EtherscanRemoteTransactionSource';
import {
  Transaction,
  TransactionMeta,
  TransactionStatus,
  WalletDevice,
} from './types';

const HARDFORK = 'london';

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

export type BlockTrackerProxy = SwappableProxy<BlockTracker>;

/**
 * Multiplier used to determine a transaction's increased gas fee during cancellation
 */
export const CANCEL_RATE = 1.5;

/**
 * Multiplier used to determine a transaction's increased gas fee during speed up
 */
export const SPEED_UP_RATE = 1.1;

/**
 * Controller responsible for submitting and managing transactions.
 */
export class TransactionController extends BaseController<
  TransactionConfig,
  TransactionState
> {
  private ethQuery: any;

  private nonceTracker: NonceTracker;

  private registry: any;

  private provider: ProviderProxy;

  private handle?: ReturnType<typeof setTimeout>;

  private mutex = new Mutex();

  private getNetworkState: () => NetworkState;

  private messagingSystem: TransactionControllerMessenger;

  private incomingTransactionHelper: IncomingTransactionHelper;

  private blockTracker: BlockTrackerProxy;

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
   * @param options.getNetworkState - Gets the state of the network controller.
   * @param options.provider - The provider used to create the underlying EthQuery instance.
   * @param options.blockTracker - The block tracker used to poll for new blocks data.
   * @param options.getSelectedAddress - Gets the address of the currently selected account.
   * @param options.incomingTransactions - Configuration options for incoming transaction support.
   * @param options.incomingTransactions.includeTokenTransfers - Whether or not to include ERC20 token transfers.
   * @param options.incomingTransactions.isEnabled - Whether or not incoming transaction retrieval is enabled.
   * @param options.incomingTransactions.updateTransactions - Whether or not to update local transactions using remote transaction data.
   * @param options.messenger - The controller messenger.
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      getNetworkState,
      provider,
      blockTracker,
      getSelectedAddress,
      incomingTransactions = {},
      messenger,
      onNetworkStateChange,
    }: {
      getNetworkState: () => NetworkState;
      provider: ProviderProxy;
      blockTracker: BlockTrackerProxy;
      getSelectedAddress: () => string;
      incomingTransactions: {
        apiKey?: string;
        includeTokenTransfers?: boolean;
        isEnabled?: () => boolean;
        updateTransactions?: boolean;
      };
      messenger: TransactionControllerMessenger;
      onNetworkStateChange: (listener: (state: NetworkState) => void) => void;
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

    this.messagingSystem = messenger;
    this.blockTracker = createEventEmitterProxy(new BlockTracker({ provider }));

    this.incomingTransactionHelper = new IncomingTransactionHelper({
      blockTracker: this.blockTracker,
      getCurrentAccount: getSelectedAddress,
      getNetworkState,
      isEnabled: incomingTransactions.isEnabled,
      lastFetchedBlockNumbers: this.state.lastFetchedBlockNumbers,
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
      this.blockTracker.setTarget(
        new BlockTracker({ provider: this.provider }),
      );
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
   * @param origin - The domain origin to append to the generated TransactionMeta.
   * @param deviceConfirmedOn - An enum to indicate what device the transaction was confirmed to append to the generated TransactionMeta.
   * @returns Object containing a promise resolving to the transaction hash if approved.
   */
  async addTransaction(
    transaction: Transaction,
    origin?: string,
    deviceConfirmedOn?: WalletDevice,
  ): Promise<Result> {
    const { providerConfig, networkId } = this.getNetworkState();
    const { transactions } = this.state;
    transaction = normalizeTransaction(transaction);
    validateTransaction(transaction);

    const transactionMeta: TransactionMeta = {
      id: random(),
      networkID: networkId ?? undefined,
      chainId: providerConfig.chainId,
      origin,
      status: TransactionStatus.unapproved as TransactionStatus.unapproved,
      time: Date.now(),
      transaction,
      deviceConfirmedOn,
      verifiedOnBlockchain: false,
    };

    try {
      const { gas, estimateGasError } = await this.estimateGas(transaction);
      transaction.gas = gas;
      transaction.estimateGasError = estimateGasError;
    } catch (error: any) {
      this.failTransaction(transactionMeta, error);
      return Promise.reject(error);
    }

    transactions.push(transactionMeta);
    this.update({ transactions: this.trimTransactionsForState(transactions) });
    this.hub.emit(`unapprovedTransaction`, transactionMeta);

    return {
      result: this.processApproval(transactionMeta),
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

  prepareUnsignedEthTx(txParams: Record<string, unknown>): TypedTransaction {
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
   * @returns {Common} common configuration object
   */

  getCommonConfiguration(): Common {
    const {
      networkId,
      providerConfig: { type: chain, chainId, nickname: name },
    } = this.getNetworkState();

    if (
      chain !== RPC &&
      chain !== 'linea-goerli' &&
      chain !== 'linea-mainnet'
    ) {
      return new Common({ chain, hardfork: HARDFORK });
    }

    const customChainParams = {
      name,
      chainId: parseInt(chainId, undefined),
      networkId: networkId === null ? NaN : parseInt(networkId, undefined),
    };

    return Common.forCustomChain(
      NetworkType.mainnet,
      customChainParams,
      HARDFORK,
    );
  }

  /**
   * Attempts to cancel a transaction based on its ID by setting its status to "rejected"
   * and emitting a `<tx.id>:finished` hub event.
   *
   * @param transactionID - The ID of the transaction to cancel.
   * @param gasValues - The gas values to use for the cancellation transation.
   */
  async stopTransaction(
    transactionID: string,
    gasValues?: GasPriceValue | FeeMarketEIP1559Values,
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
    transactionMeta.status = TransactionStatus.cancelled;
    this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
  }

  /**
   * Attempts to speed up a transaction increasing transaction gasPrice by ten percent.
   *
   * @param transactionID - The ID of the transaction to speed up.
   * @param gasValues - The gas values to use for the speed up transation.
   */
  async speedUpTransaction(
    transactionID: string,
    gasValues?: GasPriceValue | FeeMarketEIP1559Values,
  ) {
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
      id: random(),
      time: Date.now(),
      transactionHash,
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
    return { gas: addHexPrefix(BNToHex(maxGasBN)), gasPrice };
  }

  /**
   * Check the status of submitted transactions on the network to determine whether they have
   * been included in a block. Any that have been included in a block are marked as confirmed.
   */
  async queryTransactionStatuses() {
    const { transactions } = this.state;
    const { providerConfig, networkId: currentNetworkID } =
      this.getNetworkState();
    const { chainId: currentChainId } = providerConfig;
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
   */
  wipeTransactions(ignoreNetwork?: boolean) {
    /* istanbul ignore next */
    if (ignoreNetwork) {
      this.update({ transactions: [] });
      return;
    }
    const { providerConfig, networkId: currentNetworkID } =
      this.getNetworkState();
    const { chainId: currentChainId } = providerConfig;
    const newTransactions = this.state.transactions.filter(
      ({ networkID, chainId }) => {
        // Using fallback to networkID only when there is no chainId present. Should be removed when networkID is completely removed.
        const isCurrentNetwork =
          chainId === currentChainId ||
          (!chainId && networkID === currentNetworkID);
        return !isCurrentNetwork;
      },
    );

    this.update({
      transactions: this.trimTransactionsForState(newTransactions),
    });
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
        const key = `${transaction.nonce}-${chainId ?? networkID}-${new Date(
          time,
        ).toDateString()}`;
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

        meta.verifiedOnBlockchain = true;
        meta.transaction.gasUsed = txReceipt.gasUsed;

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

  private async processApproval(
    transactionMeta: TransactionMeta,
  ): Promise<string> {
    const transactionId = transactionMeta.id;
    let resultCallbacks: AcceptResultCallbacks | undefined;

    try {
      const acceptResult = await this.requestApproval(transactionMeta);
      resultCallbacks = acceptResult.resultCallbacks;

      const { meta, isCompleted } = this.isTransactionCompleted(transactionId);

      if (meta && !isCompleted) {
        await this.approveTransaction(transactionId);
      }
    } catch (error: any) {
      const { meta, isCompleted } = this.isTransactionCompleted(transactionId);

      if (meta && !isCompleted) {
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

    const finalMeta = this.getTransaction(transactionId);

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

  private async requestApproval(txMeta: TransactionMeta): Promise<AddResult> {
    const id = this.getApprovalId(txMeta);
    const { origin } = txMeta;
    const type = 'transaction';
    const requestData = { txId: txMeta.id };

    return this.messagingSystem.call(
      'ApprovalController:addRequest',
      {
        id,
        origin: origin || 'metamask',
        type,
        requestData,
        expectsResult: true,
      },
      true,
    ) as Promise<AddResult>;
  }

  private getApprovalId(txMeta: TransactionMeta) {
    return String(txMeta.id);
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
    const { providerConfig } = this.getNetworkState();
    const { chainId: currentChainId } = providerConfig;
    const index = transactions.findIndex(({ id }) => transactionID === id);
    const transactionMeta = transactions[index];
    const { nonce } = transactionMeta.transaction;

    try {
      const { from } = transactionMeta.transaction;
      if (!this.sign) {
        releaseLock();
        this.failTransaction(
          transactionMeta,
          new Error('No sign method defined.'),
        );
        return;
      } else if (!currentChainId) {
        releaseLock();
        this.failTransaction(transactionMeta, new Error('No chainId defined.'));
        return;
      }

      const chainId = parseInt(currentChainId, undefined);
      const { approved: status } = TransactionStatus;

      const txNonce =
        nonce ||
        (await query(this.ethQuery, 'getTransactionCount', [from, 'pending']));

      transactionMeta.status = status;
      transactionMeta.transaction.nonce = txNonce;
      transactionMeta.transaction.chainId = chainId;

      const baseTxParams = {
        ...transactionMeta.transaction,
        gasLimit: transactionMeta.transaction.gas,
        chainId,
        nonce: txNonce,
        status,
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

  private getTransaction(transactionID: string): TransactionMeta | undefined {
    const { transactions } = this.state;
    return transactions.find(({ id }) => id === transactionID);
  }

  private isTransactionCompleted(transactionid: string): {
    meta?: TransactionMeta;
    isCompleted: boolean;
  } {
    const transaction = this.getTransaction(transactionid);

    if (!transaction) {
      return { meta: undefined, isCompleted: false };
    }

    const isCompleted = this.isLocalFinalState(transaction.status);

    return { meta: transaction, isCompleted };
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

    this.hub.emit('incomingTransactions', { added, updated });
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
}

export default TransactionController;
