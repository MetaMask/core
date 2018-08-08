import BaseController, { BaseConfig, BaseState } from './BaseController';
import NetworkController from './NetworkController';
import { EventEmitter } from 'events';
import { normalizeTransaction, validateTransaction } from './util';

const EthQuery = require('ethjs-query');
const Transaction = require('ethereumjs-tx');
const ethUtil = require('ethereumjs-util');
const random = require('uuid/v1');

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
	chainId?: string;
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
 * @property rawTransaction - Reference to the raw underlying transaction
 * @property status - String status of this transaction
 * @property time - Timestamp associated with this transaction
 * @property transaction - Underlying Transaction object
 * @property transactionHash - Hash of a successful transaction
 */
export interface TransactionMeta {
	error?: {
		message: string;
		stack: string;
	};
	id: string;
	lastGasPrice?: string;
	networkID?: string;
	origin?: string;
	rawTransaction?: Transaction;
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
 * @property blockTracker - Contains methods for tracking blocks and querying the blockchain
 * @property networkKey - Context key of a sibling network controller
 * @property provider - Provider used to create a new underlying EthQuery instance
 * @property sign - Method used to sign transactions
 */
export interface TransactionConfig extends BaseConfig {
	blockTracker: any;
	networkKey: string;
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

	private async getNonce(address: string): Promise<number> {
		const { number: blockNumber } = await this.blockTracker.awaitCurrentBlock();
		/* istanbul ignore next */
		const transactionCount = await this.ethQuery.getTransactionCount(address, blockNumber || 'latest');
		const currentNetworkNonce = transactionCount.toNumber();

		const confirmedTransactions = this.state.transactions.filter(({ status }) => status === 'confirmed');
		const confirmedNonces = confirmedTransactions.map(({ transaction }) => parseInt(transaction.nonce!, 16));
		const currentConfirmedNonce = Math.max.apply(null, confirmedNonces);

		let suggestedNonce = Math.max(currentNetworkNonce, currentConfirmedNonce);

		const pendingTransactions = this.state.transactions.filter(({ status }) => status === 'submitted');
		const pendingNonces = pendingTransactions.map(({ transaction }) => parseInt(transaction.nonce!, 16));

		while (pendingNonces.indexOf(suggestedNonce) !== -1) {
			/* istanbul ignore next */
			suggestedNonce++;
		}

		return suggestedNonce;
	}

	/**
	 * Contains methods for tracking blocks and querying the blockchain
	 */
	blockTracker?: any;

	/**
	 * EventEmitter instance used to listen to specific transactional events
	 */
	hub = new EventEmitter();

	/**
	 * Context key of a sibling network controller
	 */
	networkKey?: string;

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
			blockTracker: undefined,
			networkKey: 'network',
			provider: undefined
		};
		this.defaultState = { transactions: [] };
		this.initialize();
	}

	/**
	 * Add a new unapproved transaction to state. Parameters will be validated and
	 * a unique transaction id will be generated. A `<tx.id>:unapproved` hub event
	 * will be emitted.
	 *
	 * @param transaction - Transaction object to add
	 * @param origin - Domain origin to append to the generated TransactionMeta
	 * @returns - Promise resolving to the transaction hash if approved or an Error if rejected or failed
	 */
	addTransaction(transaction: Transaction, origin?: string) {
		// Normalize transaction parameters
		const network = (this.networkKey && this.context[this.networkKey]) as NetworkController;
		const { transactions } = this.state;
		transaction = normalizeTransaction(transaction);

		// Validate transaction parameters
		validateTransaction(transaction);

		// Build TransactionMeta
		const transactionMeta = {
			id: random(),
			networkID: network ? network.state.network : '0',
			origin,
			status: 'unapproved',
			time: Date.now(),
			transaction
		};

		// TODO: Add gas and gasPrice
		// transaction.gas = this.getGas(transactionMeta);
		// transaction.gasPrice = transaction.gasPrice || await this.ethQuery.gasPrice();

		// Add TransactionMeta to state
		transactions.push(transactionMeta);
		this.update({ transactions });

		// Notify external listeners of the new transaction
		this.hub.emit(`${transactionMeta.id}:unapproved`, transactionMeta);

		// Return a promise resolving once the transaction is submitted, rejected, or fails
		return new Promise((resolve, reject) => {
			this.hub.once(`${transactionMeta.id}:finished`, ({ error, hash, status }, meta) => {
				switch (status) {
					case 'submitted':
						return resolve(hash);
					case 'rejected':
						return reject(new Error('User rejected the transaction.'));
					case 'failed':
						return reject(new Error(error.message));
					default:
						return reject(new Error(`Unknown problem: ${JSON.stringify(meta.transaction)}.`));
				}
			});
		});
	}

	/**
	 * Approves a transaction based on its transaction ID and updates it in state.
	 * If this is not a retry transaction, a nonce will be generated based on
	 * the highest local or remote nonce, plus any pending transactions. The
	 * transaction is signed using the sign configuratoin property, then
	 * published to the blockchain. A `<tx.id>:finished` hub event is fired
	 * after success or failure.
	 *
	 * @param transactionID - ID of the transaction to approve
	 */
	async approveTransaction(transactionID: string) {
		const { transactions } = this.state;
		const network = (this.networkKey && this.context[this.networkKey]) as NetworkController;
		const currentNetworkID = network ? network.state.network : '0';
		const index = transactions.findIndex(({ id }) => transactionID === id);
		const transactionMeta = transactions[index];
		const { from, nonce } = transactionMeta.transaction;

		try {
			// Approve transaction
			transactionMeta.status = 'approved';
			transactionMeta.transaction.nonce = transactionMeta.lastGasPrice ?
				nonce : ethUtil.addHexPrefix((await this.getNonce(from)).toString(16));
			transactionMeta.transaction.chainId = currentNetworkID;

			// Sign transaction
			const ethTransaction = new Transaction({ ...transactionMeta.transaction });
			if (!this.sign) {
				return;
			}
			await this.sign(ethTransaction, transactionMeta.transaction.from!);
			transactionMeta.status = 'signed';
			this.updateTransaction(transactionMeta);
			const rawTransaction = ethUtil.bufferToHex(ethTransaction.serialize());

			// Publish transaction
			transactionMeta.rawTransaction = rawTransaction;
			this.updateTransaction(transactionMeta);
			const transactionHash = await this.ethQuery.sendRawTransaction(rawTransaction);
			transactionMeta.transactionHash = transactionHash;
			transactionMeta.status = 'submitted';
			this.updateTransaction(transactionMeta);
			this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
		} catch (error) {
			// Fail transaction
			transactionMeta.status = 'failed';
			transactionMeta.error = {
				message: error.toString(),
				stack: error.stack
			};
			this.updateTransaction(transactionMeta);
			this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
		}
	}

	/**
	 * Cancels a transaction based on its ID by setting its status to rejected
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
		this.updateTransaction(transactionMeta);
		this.hub.emit(`${transactionMeta.id}:finished`, transactionMeta);
	}

	/**
	 * Retries a transaction by duplicating it and adding it as a new transaction
	 * to state. This allows a transaction to be submitted a second time with a
	 * new gas price. A `<tx.id>:unapproved` hub event will be emitted.
	 *
	 * @param transactionID - ID if the transaction to retry
	 */
	retryTransaction(transactionID: string) {
		const { transactions } = this.state;
		const originalTransactionMeta = this.state.transactions.find(({ id }) => id === transactionID);
		if (!originalTransactionMeta) {
			return;
		}
		const newTransactionMeta: TransactionMeta = { ...originalTransactionMeta };
		newTransactionMeta.lastGasPrice = newTransactionMeta.transaction.gasPrice;
		transactions.push(newTransactionMeta);
		this.update({ transactions });

		// Notify external listeners of the new transaction
		this.hub.emit(`${newTransactionMeta.id}:unapproved`, newTransactionMeta);
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
	 * Updates an existing transaction in state
	 *
	 * @param transactionMeta - New transaction meta to store in state
	 */
	updateTransaction(transactionMeta: TransactionMeta) {
		const { transactions } = this.state;
		validateTransaction(transactionMeta.transaction);
		const index = transactions.findIndex(({ id }) => transactionMeta.id === id);
		transactions[index] = transactionMeta;
		this.update({ transactions });
	}

	/**
	 * Removes all transactions from state based on the current network
	 */
	wipeTransactions() {
		const network = (this.networkKey && this.context[this.networkKey]) as NetworkController;
		if (!network) { return; }
		const currentNetworkID = network.state.network;
		const newTransactions = this.state.transactions.filter(({ networkID }) => networkID !== currentNetworkID);
		this.update({ transactions: newTransactions });
	}
}

export default TransactionController;
