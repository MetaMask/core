import { EventEmitter } from 'events';
import { addHexPrefix, bufferToHex, BN } from 'ethereumjs-util';
import { ethErrors } from 'eth-rpc-errors';
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
} from '@metamask/base-controller';
import type {
  NetworkState,
  NetworkController,
} from '@metamask/network-controller';
import {
  BNToHex,
  fractionBN,
  hexToBN,
  safelyExecute,
  isSmartContractCode,
  query,
  MAINNET,
  RPC,
} from '@metamask/controller-utils';
import {
  normalizeTransaction,
  validateTransaction,
  handleTransactionFetch,
  getIncreasedPriceFromExisting,
  isEIP1559Transaction,
  isGasPriceValue,
  isFeeMarketEIP1559Values,
  validateGasValues,
  validateMinimumIncrease,
  ESTIMATE_GAS_ERROR,
} from './utils';

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
  estimateGasError?: string;
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

type TransactionMetaBase = {
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
export type TransactionMeta =
  | ({
      status: Exclude<TransactionStatus, TransactionStatus.failed>;
    } & TransactionMetaBase)
  | ({ status: TransactionStatus.failed; error: Error } & TransactionMetaBase);

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
  methodData: { [key: string]: MethodData };
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
 * Controller responsible for submitting and managing transactions.
 */
export class TransactionController extends BaseController<
  TransactionConfig,
  TransactionState
> {
  private ethQuery: any;

  private registry: any;

  private handle?: ReturnType<typeof setTimeout>;

  private mutex = new Mutex();

  private getNetworkState: () => NetworkState;

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
   * Normalizes the transaction information from etherscan
   * to be compatible with the TransactionMeta interface.
   *
   * @param txMeta - The transaction.
   * @param currentNetworkID - The current network ID.
   * @param currentChainId - The current chain ID.
   * @returns The normalized transaction.
   */
  private normalizeTx(
    txMeta: EtherscanTransactionMeta,
    currentNetworkID: string,
    currentChainId: string,
  ): TransactionMeta {
    const time = parseInt(txMeta.timeStamp, 10) * 1000;
    const normalizedTransactionBase = {
      blockNumber: txMeta.blockNumber,
      id: random({ msecs: time }),
      networkID: currentNetworkID,
      chainId: currentChainId,
      time,
      transaction: {
        data: txMeta.input,
        from: txMeta.from,
        gas: BNToHex(new BN(txMeta.gas)),
        gasPrice: BNToHex(new BN(txMeta.gasPrice)),
        gasUsed: BNToHex(new BN(txMeta.gasUsed)),
        nonce: BNToHex(new BN(txMeta.nonce)),
        to: txMeta.to,
        value: BNToHex(new BN(txMeta.value)),
      },
      transactionHash: txMeta.hash,
      verifiedOnBlockchain: false,
    };

    /* istanbul ignore else */
    if (txMeta.isError === '0') {
      return {
        ...normalizedTransactionBase,
        status: TransactionStatus.confirmed,
      };
    }

    /* istanbul ignore next */
    return {
      ...normalizedTransactionBase,
      error: new Error('Transaction failed'),
      status: TransactionStatus.failed,
    };
  }

  private normalizeTokenTx = (
    txMeta: EtherscanTransactionMeta,
    currentNetworkID: string,
    currentChainId: string,
  ): TransactionMeta => {
    const time = parseInt(txMeta.timeStamp, 10) * 1000;
    const {
      to,
      from,
      gas,
      gasPrice,
      gasUsed,
      hash,
      contractAddress,
      tokenDecimal,
      tokenSymbol,
      value,
    } = txMeta;
    return {
      id: random({ msecs: time }),
      isTransfer: true,
      networkID: currentNetworkID,
      chainId: currentChainId,
      status: TransactionStatus.confirmed,
      time,
      transaction: {
        chainId: 1,
        from,
        gas,
        gasPrice,
        gasUsed,
        to,
        value,
      },
      transactionHash: hash,
      transferInformation: {
        contractAddress,
        decimals: Number(tokenDecimal),
        symbol: tokenSymbol,
      },
      verifiedOnBlockchain: false,
    };
  };

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
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
   * @param options.getProvider - Returns a provider for the current network.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      getNetworkState,
      onNetworkStateChange,
      getProvider,
    }: {
      getNetworkState: () => NetworkState;
      onNetworkStateChange: (listener: (state: NetworkState) => void) => void;
      getProvider: () => NetworkController['provider'];
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
    };
    this.initialize();
    const provider = getProvider();
    this.getNetworkState = getNetworkState;
    this.ethQuery = new EthQuery(provider);
    this.registry = new MethodRegistry({ provider });
    onNetworkStateChange(() => {
      const newProvider = getProvider();
      this.ethQuery = new EthQuery(newProvider);
      this.registry = new MethodRegistry({ provider: newProvider });
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
    const { providerConfig, network } = this.getNetworkState();
    const { transactions } = this.state;
    transaction = normalizeTransaction(transaction);
    validateTransaction(transaction);

    const transactionMeta: TransactionMeta = {
      id: random(),
      networkID: network,
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

    const result: Promise<string> = new Promise((resolve, reject) => {
      this.hub.once(
        `${transactionMeta.id}:finished`,
        (meta: TransactionMeta) => {
          switch (meta.status) {
            case TransactionStatus.submitted:
              return resolve(meta.transactionHash as string);
            case TransactionStatus.rejected:
              return reject(
                ethErrors.provider.userRejectedRequest(
                  'User rejected the transaction',
                ),
              );
            case TransactionStatus.cancelled:
              return reject(
                ethErrors.rpc.internal('User cancelled the transaction'),
              );
            case TransactionStatus.failed:
              return reject(ethErrors.rpc.internal(meta.error.message));
            /* istanbul ignore next */
            default:
              return reject(
                ethErrors.rpc.internal(
                  `MetaMask Tx Signature: Unknown problem: ${JSON.stringify(
                    meta,
                  )}`,
                ),
              );
          }
        },
      );
    });

    transactions.push(transactionMeta);
    this.update({ transactions: this.trimTransactionsForState(transactions) });
    this.hub.emit(`unapprovedTransaction`, transactionMeta);
    return { result, transactionMeta };
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
      network: networkId,
      providerConfig: { type: chain, chainId, nickname: name },
    } = this.getNetworkState();

    if (chain !== RPC) {
      return new Common({ chain, hardfork: HARDFORK });
    }

    const customChainParams = {
      name,
      chainId: parseInt(chainId, undefined),
      networkId: parseInt(networkId, undefined),
    };

    return Common.forCustomChain(MAINNET, customChainParams, HARDFORK);
  }

  /**
   * Approves a transaction and updates it's status in state. If this is not a
   * retry transaction, a nonce will be generated. The transaction is signed
   * using the sign configuration property, then published to the blockchain.
   * A `<tx.id>:finished` hub event is fired after success or failure.
   *
   * @param transactionID - The ID of the transaction to approve.
   */
  async approveTransaction(transactionID: string) {
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
  cancelTransaction(transactionID: string) {
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
    const { isCustomNetwork } = this.getNetworkState();
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
    const { providerConfig, network: currentNetworkID } =
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
    const { providerConfig, network: currentNetworkID } =
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
   * Get transactions from Etherscan for the given address. By default all transactions are
   * returned, but the `fromBlock` option can be given to filter just for transactions from a
   * specific block onward.
   *
   * @param address - The address to fetch the transactions for.
   * @param opt - Object containing optional data, fromBlock and Etherscan API key.
   * @returns The block number of the latest incoming transaction.
   */
  async fetchAll(
    address: string,
    opt?: FetchAllOptions,
  ): Promise<string | void> {
    const { providerConfig, network: currentNetworkID } =
      this.getNetworkState();
    const { chainId: currentChainId, type: networkType } = providerConfig;
    const { transactions } = this.state;

    const supportedNetworkIds = ['1', '3', '4', '42'];
    /* istanbul ignore next */
    if (supportedNetworkIds.indexOf(currentNetworkID) === -1) {
      return undefined;
    }

    const [etherscanTxResponse, etherscanTokenResponse] =
      await handleTransactionFetch(
        networkType,
        address,
        this.config.txHistoryLimit,
        opt,
      );

    const normalizedTxs = etherscanTxResponse.result.map(
      (tx: EtherscanTransactionMeta) =>
        this.normalizeTx(tx, currentNetworkID, currentChainId),
    );
    const normalizedTokenTxs = etherscanTokenResponse.result.map(
      (tx: EtherscanTransactionMeta) =>
        this.normalizeTokenTx(tx, currentNetworkID, currentChainId),
    );

    const [updateRequired, allTxs] = this.etherscanTransactionStateReconciler(
      [...normalizedTxs, ...normalizedTokenTxs],
      transactions,
    );

    allTxs.sort((a, b) => (a.time < b.time ? -1 : 1));

    let latestIncomingTxBlockNumber: string | undefined;
    allTxs.forEach(async (tx) => {
      /* istanbul ignore next */
      if (
        // Using fallback to networkID only when there is no chainId present. Should be removed when networkID is completely removed.
        (tx.chainId === currentChainId ||
          (!tx.chainId && tx.networkID === currentNetworkID)) &&
        tx.transaction.to &&
        tx.transaction.to.toLowerCase() === address.toLowerCase()
      ) {
        if (
          tx.blockNumber &&
          (!latestIncomingTxBlockNumber ||
            parseInt(latestIncomingTxBlockNumber, 10) <
              parseInt(tx.blockNumber, 10))
        ) {
          latestIncomingTxBlockNumber = tx.blockNumber;
        }
      }

      /* istanbul ignore else */
      if (tx.toSmartContract === undefined) {
        // If not `to` is a contract deploy, if not `data` is send eth
        if (
          tx.transaction.to &&
          (!tx.transaction.data || tx.transaction.data !== '0x')
        ) {
          const code = await query(this.ethQuery, 'getCode', [
            tx.transaction.to,
          ]);
          tx.toSmartContract = isSmartContractCode(code);
        } else {
          tx.toSmartContract = false;
        }
      }
    });

    // Update state only if new transactions were fetched or
    // the status or gas data of a transaction has changed
    if (updateRequired) {
      this.update({ transactions: this.trimTransactionsForState(allTxs) });
    }
    return latestIncomingTxBlockNumber;
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

  /**
   * Method to verify the state of transactions using Etherscan as a source of truth.
   *
   * @param remoteTxs - Transactions to reconcile that are from a remote source.
   * @param localTxs - Transactions to reconcile that are local.
   * @returns A tuple containing a boolean indicating whether or not an update was required, and the updated transaction.
   */
  private etherscanTransactionStateReconciler(
    remoteTxs: TransactionMeta[],
    localTxs: TransactionMeta[],
  ): [boolean, TransactionMeta[]] {
    const updatedTxs: TransactionMeta[] = this.getUpdatedTransactions(
      remoteTxs,
      localTxs,
    );

    const newTxs: TransactionMeta[] = this.getNewTransactions(
      remoteTxs,
      localTxs,
    );

    const updatedLocalTxs = localTxs.map((tx: TransactionMeta) => {
      const txIdx = updatedTxs.findIndex(
        ({ transactionHash }) => transactionHash === tx.transactionHash,
      );
      return txIdx === -1 ? tx : updatedTxs[txIdx];
    });

    const updateRequired = newTxs.length > 0 || updatedLocalTxs.length > 0;

    return [updateRequired, [...newTxs, ...updatedLocalTxs]];
  }

  /**
   * Get all transactions that are in the remote transactions array
   * but not in the local transactions array.
   *
   * @param remoteTxs - Array of transactions from remote source.
   * @param localTxs - Array of transactions stored locally.
   * @returns The new transactions.
   */
  private getNewTransactions(
    remoteTxs: TransactionMeta[],
    localTxs: TransactionMeta[],
  ): TransactionMeta[] {
    return remoteTxs.filter((tx) => {
      const alreadyInTransactions = localTxs.find(
        ({ transactionHash }) => transactionHash === tx.transactionHash,
      );
      return !alreadyInTransactions;
    });
  }

  /**
   * Get all the transactions that are locally outdated with respect
   * to a remote source (etherscan or blockchain). The returned array
   * contains the transactions with the updated data.
   *
   * @param remoteTxs - Array of transactions from remote source.
   * @param localTxs - Array of transactions stored locally.
   * @returns The updated transactions.
   */
  private getUpdatedTransactions(
    remoteTxs: TransactionMeta[],
    localTxs: TransactionMeta[],
  ): TransactionMeta[] {
    return remoteTxs.filter((remoteTx) => {
      const isTxOutdated = localTxs.find((localTx) => {
        return (
          remoteTx.transactionHash === localTx.transactionHash &&
          this.isTransactionOutdated(remoteTx, localTx)
        );
      });
      return isTxOutdated;
    });
  }

  /**
   * Verifies if a local transaction is outdated with respect to the remote transaction.
   *
   * @param remoteTx - The remote transaction from Etherscan.
   * @param localTx - The local transaction.
   * @returns Whether the transaction is outdated.
   */
  private isTransactionOutdated(
    remoteTx: TransactionMeta,
    localTx: TransactionMeta,
  ): boolean {
    const statusOutdated = this.isStatusOutdated(
      remoteTx.transactionHash,
      localTx.transactionHash,
      remoteTx.status,
      localTx.status,
    );
    const gasDataOutdated = this.isGasDataOutdated(
      remoteTx.transaction.gasUsed,
      localTx.transaction.gasUsed,
    );
    return statusOutdated || gasDataOutdated;
  }

  /**
   * Verifies if the status of a local transaction is outdated with respect to the remote transaction.
   *
   * @param remoteTxHash - Remote transaction hash.
   * @param localTxHash - Local transaction hash.
   * @param remoteTxStatus - Remote transaction status.
   * @param localTxStatus - Local transaction status.
   * @returns Whether the status is outdated.
   */
  private isStatusOutdated(
    remoteTxHash: string | undefined,
    localTxHash: string | undefined,
    remoteTxStatus: TransactionStatus,
    localTxStatus: TransactionStatus,
  ): boolean {
    return remoteTxHash === localTxHash && remoteTxStatus !== localTxStatus;
  }

  /**
   * Verifies if the gas data of a local transaction is outdated with respect to the remote transaction.
   *
   * @param remoteGasUsed - Remote gas used in the transaction.
   * @param localGasUsed - Local gas used in the transaction.
   * @returns Whether the gas data is outdated.
   */
  private isGasDataOutdated(
    remoteGasUsed: string | undefined,
    localGasUsed: string | undefined,
  ): boolean {
    return remoteGasUsed !== localGasUsed;
  }
}

export default TransactionController;
