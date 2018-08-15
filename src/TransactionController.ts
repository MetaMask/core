import { EventEmitter } from 'events';
import BaseController, { BaseConfig, BaseState } from './BaseController';
import BlockHistoryController from './BlockHistoryController';
import NetworkController from './NetworkController';
import PreferencesController from './PreferencesController';
import {
	BNToHex,
	fractionBN,
	getEtherscanURL,
	hexToBN,
	normalizeTransaction,
	safelyExecute,
	validateTransaction
} from './util';

const EthQuery = require('ethjs-query');
const Transaction = require('ethereumjs-tx');
const random = require('uuid/v1');
const { addHexPrefix, bufferToHex } = require('ethereumjs-util');

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
 * @property lastGasPrice - Last gas price used for retried transactions
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
	lastGasPrice?: string;
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
export class TransactionController extends BaseController<TransactionState, TransactionConfig> {
	private ethQuery: any;
	private handle?: NodeJS.Timer;

	private addGasPadding(gas: string, gasLimit: string) {
		const estimatedGas = addHexPrefix(gas);
		const initialGasLimitBN = hexToBN(estimatedGas);
		const blockGasLimitBN = hexToBN(gasLimit);
		const upperGasLimitBN = blockGasLimitBN.muln(0.9);
		const bufferedGasLimitBN = initialGasLimitBN.muln(1.5);

		if (initialGasLimitBN.gt(upperGasLimitBN)) {
			return BNToHex(initialGasLimitBN);
		}
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

	async getGas(transactionMeta: TransactionMeta) {
		const { gasLimit } = await this.ethQuery.getBlockByNumber('latest', true);
		const {
			transaction: { gas, to, value },
			transaction
		} = transactionMeta;

		if (typeof value === 'undefined') {
			transaction.value = '0x0';
		}

		if (typeof gas !== 'undefined') {
			return gas;
		}

		const code = to ? await this.ethQuery.getCode(to) : undefined;
		if (to && (!code || code === '0x')) {
			return '0x5208';
		}

		const gasLimitBN = hexToBN(gasLimit);
		const saferGasLimitBN = fractionBN(gasLimitBN, 19, 20);
		transaction.gas = BNToHex(saferGasLimitBN);
		const gasHex = await this.ethQuery.estimateGas(transaction);
		return this.addGasPadding(addHexPrefix(gasHex), gasLimit);
	}

	private async queryTransactionStatuses() {
		const { transactions } = this.state;

		const preferences = this.context.PreferencesController as PreferencesController;
		const selectedAddress = preferences && preferences.state.selectedAddress;
		if (!selectedAddress) {
			return;
		}

		const blockHistory = this.context.BlockHistoryController as BlockHistoryController;
		const { number: blockNumber } = blockHistory.state.recentBlocks[blockHistory.state.recentBlocks.length - 1];
		const start = Math.max(0, parseInt(blockNumber, 16) - 100);
		const end = parseInt(blockNumber, 16) + 10;
		const network = this.context.NetworkController as NetworkController;
		const currentNetworkID = network ? network.state.network : '1';
		const root = getEtherscanURL(currentNetworkID);

		const response = await fetch(
			`${root}?module=account&action=txlist&address=${selectedAddress}&startblock=${start}&endblock=${end}&sort=asc&apikey=1YW9UKTPGGV9K9GR7E916UQ5W26A1P42T5`
		);
		const json = await response.json();
		const confirmedHashes = json.result.map(({ hash }: any) => hash);
		transactions.forEach((meta, index) => {
			const isConfirmed = confirmedHashes.indexOf(meta.transactionHash);
			if (meta.networkID === currentNetworkID && meta.status === 'submitted' && isConfirmed) {
				transactions[index].status = 'confirmed';
				this.hub.emit(`${meta.id}:confirmed`, meta);
			}
		});
	}

	/**
	 * EventEmitter instance used to listen to specific transactional events
	 */
	hub = new EventEmitter();

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
	 * @param state - Initial state to set on this controller
	 * @param config - Initial options used to configure this controller
	 */
	constructor(state?: Partial<TransactionState>, config?: Partial<TransactionConfig>) {
		super(state, config);
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
	 * @returns - Promise resolving to the transaction hash if approved or an Error if rejected or failed
	 */
	async addTransaction(transaction: Transaction, origin?: string) {
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
				transaction.gasPrice = addHexPrefix((await this.ethQuery.gasPrice()).toString(16));
			}
			transaction.gas = await this.getGas(transactionMeta);
		} catch (error) {
			this.failTransaction(transactionMeta, error);
			return Promise.reject(error);
		}

		transactions.push(transactionMeta);
		this.update({ transactions });
		this.hub.emit(`unapprovedTransaction`, transactionMeta);

		return new Promise((resolve, reject) => {
			this.hub.once(`${transactionMeta.id}:finished`, (meta: TransactionMeta) => {
				switch (meta.status) {
					case 'submitted':
						return resolve(meta.transactionHash);
					case 'rejected':
						return reject(new Error('User rejected the transaction.'));
					case 'failed':
						return reject(new Error(meta.error!.message));
					default:
						return reject(new Error(`Unknown problem: ${JSON.stringify(meta.transaction)}.`));
				}
			});
		});
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
		const { from, nonce } = transactionMeta.transaction;

		try {
			if (!this.sign) {
				throw new Error('No sign method defined.');
			}
			transactionMeta.status = 'approved';
			transactionMeta.transaction.nonce = transactionMeta.lastGasPrice
				? nonce
				: addHexPrefix((await this.ethQuery.getTransactionCount(from, 'pending')).toNumber().toString(16));
			transactionMeta.transaction.chainId = parseInt(currentNetworkID, undefined);

			const ethTransaction = new Transaction({ ...transactionMeta.transaction });
			await this.sign(ethTransaction, transactionMeta.transaction.from);
			transactionMeta.status = 'signed';
			this.updateTransaction(transactionMeta);
			const rawTransaction = bufferToHex(ethTransaction.serialize());

			transactionMeta.rawTransaction = rawTransaction;
			this.updateTransaction(transactionMeta);
			const transactionHash = await this.ethQuery.sendRawTransaction(rawTransaction);
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
		this.update({ transactions });
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
