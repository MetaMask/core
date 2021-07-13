import { EventEmitter } from 'events';
import { addHexPrefix, bufferToHex, BN } from 'ethereumjs-util';
import { ethErrors } from 'eth-rpc-errors';
import MethodRegistry from 'eth-method-registry';
import EthQuery from 'eth-query';
import Common from '@ethereumjs/common';
import { TransactionFactory, TypedTransaction } from '@ethereumjs/tx';
import { v1 as random } from 'uuid';
import { Mutex } from 'async-mutex';
import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type {
  NetworkState,
  NetworkController,
} from '../network/NetworkController';
import {
  BNToHex,
  fractionBN,
  hexToBN,
  normalizeTransaction,
  safelyExecute,
  validateTransaction,
  isSmartContractCode,
  handleTransactionFetch,
  query,
  getIncreasedPriceFromExisting,
} from '../util';
import { MAINNET, RPC } from '../constants';

const HARDFORK = 'london';

/**
 * @type Result
 *
 * @property result - Promise resolving to a new transaction hash
 * @property transactionMeta - Meta information about this new transaction
 */
export interface Result {
  result: Promise<string>;
  transactionMeta: TransactionMeta;
}

/**
 * @type Fetch All Options
 *
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
 *
 * @property chainId - Network ID as per EIP-155
 * @property data - Data to pass with this transaction
 * @property from - Address to send this transaction from
 * @property gas - Gas to send with this transaction
 * @property gasPrice - Price of gas with this transaction
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
  nonce?: string;
  to?: string;
  value?: string;
  // type?: number;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
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
};

/**
 * @type TransactionMeta
 *
 * TransactionMeta representation
 *
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
 *
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
  isError: string;
  txreceipt_status: string;
  input: string;
  contractAddress: string;
  cumulativeGasUsed: string;
  gasUsed: string;
  confirmations: string;
  tokenDecimal: string;
  tokenSymbol: string;
}

/**
 * @type TransactionConfig
 *
 * Transaction controller configuration
 *
 * @property interval - Polling interval used to fetch new currency rate
 * @property provider - Provider used to create a new underlying EthQuery instance
 * @property sign - Method used to sign transactions
 */
export interface TransactionConfig extends BaseConfig {
  interval: number;
  sign?: (transaction: Transaction, from: string) => Promise<any>;
}

/**
 * @type MethodData
 *
 * Method data registry object
 *
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
 *
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
 * Controller responsible for submitting and managing transactions
 */
export class TransactionController extends BaseController<
  TransactionConfig,
  TransactionState
> {
  private ethQuery: any;

  private registry: any;

  private handle?: NodeJS.Timer;

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
   * to be compatible with the TransactionMeta interface
   *
   * @param txMeta - Object containing the transaction information
   * @param currentNetworkID - string representing the current network id
   * @param currentChainId - string representing the current chain id
   * @returns - TransactionMeta
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
        nonce: BNToHex(new BN(txMeta.nonce)),
        to: txMeta.to,
        value: BNToHex(new BN(txMeta.value)),
      },
      transactionHash: txMeta.hash,
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
        to,
        value,
      },
      transactionHash: hash,
      transferInformation: {
        contractAddress,
        decimals: Number(tokenDecimal),
        symbol: tokenSymbol,
      },
    };
  };

  /**
   * EventEmitter instance used to listen to specific transactional events
   */
  hub = new EventEmitter();

  /**
   * Name of this controller used during composition
   */
  name = 'TransactionController';

  /**
   * Method used to sign transactions
   */
  sign?: (
    transaction: TypedTransaction,
    from: string,
  ) => Promise<TypedTransaction>;

  /**
   * Creates a TransactionController instance
   *
   * @param options
   * @param options.getNetworkState - Gets the state of the network controller
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes
   * @param options.getProvider - Returns a provider for the current network
   * @param config - Initial options used to configure this controller
   * @param state - Initial state to set on this controller
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
      interval: 5000,
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
   * Starts a new polling interval
   *
   * @param interval - Polling interval used to fetch new transaction statuses
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
   * Handle new method data request
   *
   * @param fourBytePrefix - String corresponding to method prefix
   * @returns - Promise resolving to method data object corresponding to signature prefix
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
   * @param transaction - Transaction object to add
   * @param origin - Domain origin to append to the generated TransactionMeta
   * @param deviceConfirmedOn - enum to indicate what device the transaction was confirmed to append to the generated TransactionMeta
   * @returns - Object containing a promise resolving to the transaction hash if approved
   */
  async addTransaction(
    transaction: Transaction,
    origin?: string,
    deviceConfirmedOn?: WalletDevice,
  ): Promise<Result> {
    const { provider, network } = this.getNetworkState();
    const { transactions } = this.state;
    transaction = normalizeTransaction(transaction);
    validateTransaction(transaction);

    const transactionMeta = {
      id: random(),
      networkID: network,
      chainId: provider.chainId,
      origin,
      status: TransactionStatus.unapproved as TransactionStatus.unapproved,
      time: Date.now(),
      transaction,
      deviceConfirmedOn,
    };

    try {
      const { gas } = await this.estimateGas(transaction);
      transaction.gas = gas;

      // TODO(eip1559) check if this is not needed for legacy
      // transaction.gasPrice = gasPrice;
    } catch (error) {
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
    this.update({ transactions: [...transactions] });
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
   * @ethereumjs/tx uses @ethereumjs/common as a configuration tool for
   * specifying which chain, network, hardfork and EIPs to support for
   * a transaction. By referencing this configuration, and analyzing the fields
   * specified in txParams, @ethereumjs/tx is able to determine which EIP-2718
   * transaction type to use.
   * @returns {Common} common configuration object
   */

  getCommonConfiguration(): Common {
    const {
      network: networkId,
      provider: { type: chain, chainId, nickname: name },
    } = this.getNetworkState();

    if (chain !== RPC) {
      const common = new Common({ chain, hardfork: HARDFORK, eips: [1559] });
      return common;
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
   * @param transactionID - ID of the transaction to approve
   * @returns - Promise resolving when this operation completes
   */
  async approveTransaction(transactionID: string) {
    const { transactions } = this.state;
    const releaseLock = await this.mutex.acquire();
    const { provider } = this.getNetworkState();
    const { chainId: currentChainId } = provider;
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

      const {
        maxFeePerGas = undefined,
        maxPriorityFeePerGas = undefined,
      } = transactionMeta.transaction;

      const baseTxParams = {
        ...transactionMeta.transaction,
        gasLimit: transactionMeta.transaction.gas,
        chainId,
        nonce: txNonce,
        status,
      };

      const txParams =
        maxFeePerGas && maxPriorityFeePerGas
          ? {
              ...baseTxParams,
              maxFeePerGas,
              maxPriorityFeePerGas,
              // specify type 2 if maxFeePerGas and maxPriorityFeePerGas are set
              type: 2,
            }
          : baseTxParams;

      // delete gasPrice if maxFeePerGas and maxPriorityFeePerGas are set
      if (maxFeePerGas && maxPriorityFeePerGas) {
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
    } catch (error) {
      this.failTransaction(transactionMeta, error);
    } finally {
      releaseLock();
    }
  }

  /**
   * Cancels a transaction based on its ID by setting its status to "rejected"
   * and emitting a `<tx.id>:finished` hub event.
   *
   * @param transactionID - ID of the transaction to cancel
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
    this.update({ transactions: [...transactions] });
  }

  /**
   * Attempts to cancel a transaction based on its ID by setting its status to "rejected"
   * and emitting a `<tx.id>:finished` hub event.
   *
   * @param transactionID - ID of the transaction to cancel
   */
  async stopTransaction(transactionID: string) {
    const transactionMeta = this.state.transactions.find(
      ({ id }) => id === transactionID,
    );
    if (!transactionMeta) {
      return;
    }

    if (!this.sign) {
      throw new Error('No sign method defined.');
    }

    const gasPrice = getIncreasedPriceFromExisting(
      transactionMeta.transaction.gasPrice,
      CANCEL_RATE,
    );

    const txParams = {
      from: transactionMeta.transaction.from,
      gasLimit: transactionMeta.transaction.gas,
      gasPrice,
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
   * Attemps to speed up a transaction increasing transaction gasPrice by ten percent
   *
   * @param transactionID - ID of the transaction to speed up
   */
  async speedUpTransaction(transactionID: string) {
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
    const gasPrice = getIncreasedPriceFromExisting(
      transactionMeta.transaction.gasPrice,
      SPEED_UP_RATE,
    );

    const existingMaxFeePerGas = transactionMeta.transaction?.maxFeePerGas;
    const existingMaxPriorityFeePerGas =
      transactionMeta.transaction?.maxPriorityFeePerGas;

    const newMaxFeePerGas =
      existingMaxFeePerGas &&
      getIncreasedPriceFromExisting(existingMaxFeePerGas, SPEED_UP_RATE);
    const newMaxPriorityFeePerGas =
      existingMaxPriorityFeePerGas &&
      getIncreasedPriceFromExisting(
        existingMaxPriorityFeePerGas,
        SPEED_UP_RATE,
      );

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
            gasPrice,
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
              gasPrice,
            },
          };
    transactions.push(newTransactionMeta);
    this.update({ transactions: [...transactions] });
    this.hub.emit(`${transactionMeta.id}:speedup`, newTransactionMeta);
  }

  /**
   * Estimates required gas for a given transaction
   *
   * @param transaction - Transaction object to estimate gas for
   * @returns - Promise resolving to an object containing gas and gasPrice
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
    const gasHex = await query(this.ethQuery, 'estimateGas', [
      estimatedTransaction,
    ]);

    // 4. Pad estimated gas without exceeding the most recent block gasLimit. If the network is a
    // a custom network then return the eth_estimateGas value.
    const gasBN = hexToBN(gasHex);
    const maxGasBN = gasLimitBN.muln(0.9);
    const paddedGasBN = gasBN.muln(1.5);
    /* istanbul ignore next */
    if (gasBN.gt(maxGasBN) || isCustomNetwork) {
      return { gas: addHexPrefix(gasHex), gasPrice };
    }
    /* istanbul ignore next */
    if (paddedGasBN.lt(maxGasBN)) {
      return { gas: addHexPrefix(BNToHex(paddedGasBN)), gasPrice };
    }
    return { gas: addHexPrefix(BNToHex(maxGasBN)), gasPrice };
  }

  /**
   * Resiliently checks all submitted transactions on the blockchain
   * and verifies that it has been included in a block
   * when that happens, the tx status is updated to confirmed
   *
   * @returns - Promise resolving when this operation completes
   */
  async queryTransactionStatuses() {
    const { transactions } = this.state;
    const { provider, network: currentNetworkID } = this.getNetworkState();
    const { chainId: currentChainId } = provider;
    let gotUpdates = false;
    await safelyExecute(() =>
      Promise.all(
        transactions.map(async (meta, index) => {
          // Using fallback to networkID only when there is no chainId present. Should be removed when networkID is completely removed.
          if (
            meta.status === TransactionStatus.submitted &&
            (meta.chainId === currentChainId ||
              (!meta.chainId && meta.networkID === currentNetworkID))
          ) {
            const txObj = await query(this.ethQuery, 'getTransactionByHash', [
              meta.transactionHash,
            ]);
            /* istanbul ignore next */
            if (txObj?.blockNumber) {
              transactions[index].status = TransactionStatus.confirmed;
              this.hub.emit(`${meta.id}:confirmed`, meta);
              gotUpdates = true;
            }
          }
        }),
      ),
    );
    /* istanbul ignore else */
    if (gotUpdates) {
      this.update({ transactions: [...transactions] });
    }
  }

  /**
   * Updates an existing transaction in state
   *
   * @param transactionMeta - New transaction meta to store in state
   */
  updateTransaction(transactionMeta: TransactionMeta) {
    const { transactions } = this.state;
    transactionMeta.transaction = normalizeTransaction(
      transactionMeta.transaction,
    );
    validateTransaction(transactionMeta.transaction);
    const index = transactions.findIndex(({ id }) => transactionMeta.id === id);
    transactions[index] = transactionMeta;
    this.update({ transactions: [...transactions] });
  }

  /**
   * Removes all transactions from state, optionally based on the current network
   *
   * @param ignoreNetwork - Ignores network
   */
  wipeTransactions(ignoreNetwork?: boolean) {
    /* istanbul ignore next */
    if (ignoreNetwork) {
      this.update({ transactions: [] });
      return;
    }
    const { provider, network: currentNetworkID } = this.getNetworkState();
    const { chainId: currentChainId } = provider;
    const newTransactions = this.state.transactions.filter(
      ({ networkID, chainId }) => {
        // Using fallback to networkID only when there is no chainId present. Should be removed when networkID is completely removed.
        const isCurrentNetwork =
          chainId === currentChainId ||
          (!chainId && networkID === currentNetworkID);
        return !isCurrentNetwork;
      },
    );

    this.update({ transactions: newTransactions });
  }

  /**
   * Gets all transactions from etherscan for a specific address
   * optionally starting from a specific block
   *
   * @param address - string representing the address to fetch the transactions from
   * @param opt - Object containing optional data, fromBlock and Alethio API key
   * @returns - Promise resolving to an string containing the block number of the latest incoming transaction.
   */
  async fetchAll(
    address: string,
    opt?: FetchAllOptions,
  ): Promise<string | void> {
    const { provider, network: currentNetworkID } = this.getNetworkState();
    const { chainId: currentChainId, type: networkType } = provider;

    const supportedNetworkIds = ['1', '3', '4', '42'];
    /* istanbul ignore next */
    if (supportedNetworkIds.indexOf(currentNetworkID) === -1) {
      return undefined;
    }

    const [
      etherscanTxResponse,
      etherscanTokenResponse,
    ] = await handleTransactionFetch(networkType, address, opt);

    const normalizedTxs = etherscanTxResponse.result.map(
      (tx: EtherscanTransactionMeta) =>
        this.normalizeTx(tx, currentNetworkID, currentChainId),
    );
    const normalizedTokenTxs = etherscanTokenResponse.result.map(
      (tx: EtherscanTransactionMeta) =>
        this.normalizeTokenTx(tx, currentNetworkID, currentChainId),
    );

    const remoteTxs = [...normalizedTxs, ...normalizedTokenTxs].filter((tx) => {
      const alreadyInTransactions = this.state.transactions.find(
        ({ transactionHash }) => transactionHash === tx.transactionHash,
      );
      return !alreadyInTransactions;
    });

    const allTxs = [...remoteTxs, ...this.state.transactions];
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
    // Update state only if new transactions were fetched
    if (allTxs.length > this.state.transactions.length) {
      this.update({ transactions: allTxs });
    }
    return latestIncomingTxBlockNumber;
  }
}

export default TransactionController;
