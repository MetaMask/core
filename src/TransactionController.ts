import { EventEmitter } from 'events';
import BaseController, { BaseConfig, BaseState } from './BaseController';
import BlockHistoryController from './BlockHistoryController';
import NetworkController from './NetworkController';
import PreferencesController from './PreferencesController';
import { BNToHex, fractionBN, hexToBN, normalizeTransaction, safelyExecute, validateTransaction } from './util';

const EthQuery = require('eth-query');
const Transaction = require('ethereumjs-tx');
const random = require('uuid/v1');
const { addHexPrefix, bufferToHex } = require('ethereumjs-util');

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
}

/**
 * @type TransactionMeta
 *
 * TransactionMeta representation
 *
 * @property error - Synthesized error information for failed transactions
 * @property id - Generated UUID associated with this transaction
 * @property networkID - Network code as per EIP-155 for this transaction
 * @property origin - Origin this transaction was sent from
 * @property rawTransaction - Hex representation of the underlying transaction
 * @property status - String status of this transaction
 * @property time - Timestamp associated with this transaction
 * @property transaction - Underlying Transaction object
 * @property transactionHash - Hash of a successful transaction
 */
export interface TransactionMeta {
	error?: {
		message: string;
		stack?: string;
	};
	id: string;
	networkID?: string;
	origin?: string;
	rawTransaction?: string;
	status: string;
	time: number;
	transaction: Transaction;
	transactionHash?: string;
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
	provider: any;
	sign?: (transaction: Transaction, from: string) => Promise<any>;
}

/**
 * @type TransactionState
 *
 * Transaction controller state
 *
 * @property transactions - A list of TransactionMeta objects
 */
export interface TransactionState extends BaseState {
	transactions: TransactionMeta[];
}

/**
 * Controller responsible for submitting and managing transactions
 */
export class TransactionController extends BaseController<TransactionConfig, TransactionState> {
	private ethQuery: any;
	private handle?: NodeJS.Timer;

	private addGasPadding(gas: string, gasLimit: string) {
		const estimatedGas = addHexPrefix(gas);
		const initialGasLimitBN = hexToBN(estimatedGas);
		const blockGasLimitBN = hexToBN(gasLimit);
		const upperGasLimitBN = blockGasLimitBN.muln(0.9);
		const bufferedGasLimitBN = initialGasLimitBN.muln(1.5);

		/* istanbul ignore if */
		if (initialGasLimitBN.gt(upperGasLimitBN)) {
			return BNToHex(initialGasLimitBN);
		}
		/* istanbul ignore if */
		if (bufferedGasLimitBN.lt(upperGasLimitBN)) {
			return BNToHex(bufferedGasLimitBN);
		}
		return BNToHex(upperGasLimitBN);
	}

	private failTransaction(transactionMeta: TransactionMeta, error: Error) {
		transactionMeta.status = 'failed';
		transactionMeta.error = {
			message: error.toString(),
			stack: error.stack
		};
		this.updateTransaction(transactionMeta);
		this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
	}

	private query(method: string, args: any[] = []): Promise<any> {
		return new Promise((resolve, reject) => {
			this.ethQuery[method](...args, (error: Error, result: any) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(result);
			});
		});
	}

	/**
	 * EventEmitter instance used to listen to specific transactional events
	 */
	hub = new EventEmitter();

	/**
	 * Name of this controller used during composition
	 */
	name = 'TransactionController';

	/**
	 * List of required sibling controllers this controller needs to function
	 */
	requiredControllers = ['BlockHistoryController', 'NetworkController', 'PreferencesController'];

	/**
	 * Method used to sign transactions
	 */
	sign?: (transaction: Transaction, from: string) => Promise<void>;

	/**
	 * Creates a TransactionController instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<TransactionConfig>, state?: Partial<TransactionState>) {
		super(config, state);
		this.defaultConfig = {
			interval: 5000,
			provider: undefined
		};
		this.defaultState = { transactions: [] };
		this.initialize();
	}

	/**
	 * Sets a new polling interval
	 *
	 * @param interval - Polling interval used to fetch new exchange rate
	 */
	set interval(interval: number) {
		this.handle && clearInterval(this.handle);
		safelyExecute(() => this.queryTransactionStatuses());
		this.handle = setInterval(() => {
			safelyExecute(() => this.queryTransactionStatuses());
		}, interval);
	}

	/**
	 * Sets a new provider
	 *
	 * @param provider - Provider used to create a new underlying EthQuery instance
	 */
	set provider(provider: any) {
		this.ethQuery = new EthQuery(provider);
	}

	/**
	 * Add a new unapproved transaction to state. Parameters will be validated, a
	 * unique transaction id will be generated, and gas and gasPrice will be calculated
	 * if not provided. If A `<tx.id>:unapproved` hub event will be emitted once added.
	 *
	 * @param transaction - Transaction object to add
	 * @param origin - Domain origin to append to the generated TransactionMeta
	 * @returns - Object containing a promise resolving to the transaction hash if approved
	 */
	async addTransaction(transaction: Transaction, origin?: string): Promise<Result> {
		const network = this.context.NetworkController as NetworkController;
		const { transactions } = this.state;
		transaction = normalizeTransaction(transaction);
		validateTransaction(transaction);

		const transactionMeta = {
			id: random(),
			networkID: network ? network.state.network : '1',
			origin,
			status: 'unapproved',
			time: Date.now(),
			transaction
		};

		try {
			if (typeof transaction.gasPrice === 'undefined') {
				transaction.gasPrice = await this.query('gasPrice');
			}
			transaction.gas = await this.estimateGas(transaction);
		} catch (error) {
			this.failTransaction(transactionMeta, error);
			return Promise.reject(error);
		}

		const result: Promise<string> = new Promise((resolve, reject) => {
			this.hub.once(`${transactionMeta.id}:finished`, (meta: TransactionMeta) => {
				switch (meta.status) {
					case 'submitted':
						return resolve(meta.transactionHash);
					case 'rejected':
						return reject(new Error('User rejected the transaction.'));
					case 'failed':
						return reject(new Error(meta.error!.message));
				}
			});
		});

		transactions.push(transactionMeta);
		this.update({ transactions: [...transactions] });
		this.hub.emit(`unapprovedTransaction`, transactionMeta);
		return { result, transactionMeta };
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
		const network = this.context.NetworkController as NetworkController;
		const currentNetworkID = network ? network.state.network : '1';
		const index = transactions.findIndex(({ id }) => transactionID === id);
		const transactionMeta = transactions[index];
		const { from } = transactionMeta.transaction;

		try {
			if (!this.sign) {
				throw new Error('No sign method defined.');
			}
			transactionMeta.status = 'approved';
			transactionMeta.transaction.nonce = await this.query('getTransactionCount', [from, 'pending']);
			transactionMeta.transaction.chainId = parseInt(currentNetworkID, undefined);

			const ethTransaction = new Transaction({ ...transactionMeta.transaction });
			await this.sign(ethTransaction, transactionMeta.transaction.from);
			transactionMeta.status = 'signed';
			this.updateTransaction(transactionMeta);
			const rawTransaction = bufferToHex(ethTransaction.serialize());

			transactionMeta.rawTransaction = rawTransaction;
			this.updateTransaction(transactionMeta);
			const transactionHash = await this.query('sendRawTransaction', [rawTransaction]);
			transactionMeta.transactionHash = transactionHash;
			transactionMeta.status = 'submitted';
			this.updateTransaction(transactionMeta);
			this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
		} catch (error) {
			this.failTransaction(transactionMeta, error);
		}
	}

	/**
	 * Cancels a transaction based on its ID by setting its status to "rejected"
	 * and emitting a `<tx.id>:finished` hub event.
	 *
	 * @param transactionID - ID of the transaction to cancel
	 */
	cancelTransaction(transactionID: string) {
		const transactionMeta = this.state.transactions.find(({ id }) => id === transactionID);
		if (!transactionMeta) {
			return;
		}
		transactionMeta.status = 'rejected';
		this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
		const transactions = this.state.transactions.filter(({ id }) => id !== transactionID);
		this.update({ transactions });
	}

	/**
	 * Estimates required gas for a given transaction
	 *
	 * @param transaction - Transaction object to estimate gas for
	 * @returns - Promise resolving to estimated gas price in hex
	 */
	async estimateGas(transaction: Transaction) {
		const blockHistory = this.context.BlockHistoryController as BlockHistoryController;
		const { gasLimit } = await blockHistory.getLatestBlock();
		const { gas, to, value } = transaction;

		if (typeof value === 'undefined') {
			transaction.value = '0x0';
		}

		if (typeof gas !== 'undefined') {
			return gas;
		}

		/* istanbul ignore next */
		const code = to ? await this.query('getCode', [to]) : undefined;
		/* istanbul ignore if */
		if (to && (!code || code === '0x')) {
			return '0x5208';
		}

		const gasLimitBN = hexToBN(gasLimit);
		const saferGasLimitBN = fractionBN(gasLimitBN, 19, 20);
		transaction.gas = BNToHex(saferGasLimitBN);
		const gasHex = await this.query('estimateGas', [transaction]);
		return this.addGasPadding(addHexPrefix(gasHex), gasLimit);
	}

	/**
	 * Resiliently checks all submitted transactions for confirmations in the past 100
	 * blocks and updates their state accordingly
	 *
	 * @returns - Promise resolving when this operation completes
	 */
	async queryTransactionStatuses() {
		const { transactions } = this.state;

		const preferences = this.context.PreferencesController as PreferencesController;
		const selectedAddress = preferences && preferences.state.selectedAddress;
		if (!selectedAddress) {
			return;
		}

		const blockHistory = this.context.BlockHistoryController as BlockHistoryController;
		const network = this.context.NetworkController as NetworkController;
		/* istanbul ignore next */
		const currentNetworkID = network ? network.state.network : '1';

		const confirmedHashes = blockHistory.state.recentBlocks
			.reduce((hashes: string[], block) => {
				return hashes.concat(block.transactions);
			}, [])
			.map((transaction: any) => transaction && transaction.hash);

		transactions.forEach((meta, index) => {
			const isConfirmed = confirmedHashes.indexOf(meta.transactionHash!) > -1;
			if (meta.networkID === currentNetworkID && meta.status === 'submitted' && isConfirmed) {
				transactions[index].status = 'confirmed';
				this.hub.emit(`${meta.id}:confirmed`, meta);
			}
		});
	}

	/**
	 * Updates an existing transaction in state
	 *
	 * @param transactionMeta - New transaction meta to store in state
	 */
	updateTransaction(transactionMeta: TransactionMeta) {
		const { transactions } = this.state;
		transactionMeta.transaction = normalizeTransaction(transactionMeta.transaction);
		validateTransaction(transactionMeta.transaction);
		const index = transactions.findIndex(({ id }) => transactionMeta.id === id);
		transactions[index] = transactionMeta;
		this.update({ transactions: [...transactions] });
	}

	/**
	 * Removes all transactions from state based on the current network
	 */
	wipeTransactions() {
		const network = this.context.NetworkController as NetworkController;
		if (!network) {
			return;
		}
		const currentNetworkID = network.state.network;
		const newTransactions = this.state.transactions.filter(({ networkID }) => networkID !== currentNetworkID);
		this.update({ transactions: newTransactions });
	}
}

export default TransactionController;
