import { EventEmitter } from 'events';
import BaseController, { BaseConfig, BaseState } from './BaseController';
import NetworkController from './NetworkController';
import { BNToHex, fractionBN, hexToBN, normalizeTransaction, safelyExecute, validateTransaction } from './util';

const EthQuery = require('eth-query');
const Transaction = require('ethereumjs-tx');
const random = require('uuid/v1');
const { addHexPrefix, bufferToHex, BN } = require('ethereumjs-util');

const NETWORK_API_URLS: any = {
	1: 'https://api.etherscan.io',
	3: 'http://api-ropsten.etherscan.io',
	4: 'https://api-rinkeby.etherscan.io',
	42: 'http://api-kovan.etherscan.io'
};

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
 * @property blockNumber - Number of the block where the transaction has been included
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
	blockNumber?: string;
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
	 * Normalizes the transaction information from etherscan
	 * to be compatible with the TransactionMeta interface
	 *
	 * @param txMeta - Object containing the transaction information
	 * @param currentNetworkID - string representing the current network id
	 * @returns - TransactionMeta
	 */
	private normalizeTxFromEtherscan(txMeta: any, currentNetworkID: string): TransactionMeta {
		const ts = parseInt(txMeta.timeStamp, 10) * 1000;
		/* istanbul ignore next */
		const status = txMeta.isError === '0' ? 'confirmed' : 'failed';
		return {
			blockNumber: txMeta.blockNumber,
			id: random({ msecs: ts }),
			networkID: currentNetworkID,
			rawTransaction: '',
			status,
			time: ts,
			transaction: {
				from: txMeta.from,
				gas: BNToHex(new BN(txMeta.gas)),
				gasPrice: BNToHex(new BN(txMeta.gasPrice)),
				nonce: BNToHex(new BN(txMeta.nonce)),
				to: txMeta.to,
				value: BNToHex(new BN(txMeta.value))
			},
			transactionHash: txMeta.hash
		};
	}

	/**
	 * Gets the etherscan API url based on the current network
	 *
	 * @param currentNetworkID - string representing the current network id
	 * @returns - String representing the etherscan API url for the current network
	 */
	private getEtherscanApiUrl(currentNetworkID: string): string {
		/* istanbul ignore next */
		return NETWORK_API_URLS[currentNetworkID] ? NETWORK_API_URLS[currentNetworkID] : null;
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
	requiredControllers = ['NetworkController'];

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
	 * @param interval - Polling interval used to fetch new transaction statuses
	 */
	set interval(interval: number) {
		this.handle && clearInterval(this.handle);
		safelyExecute(() => this.queryTransactionStatuses());
		this.handle = setInterval(() => {
			safelyExecute(() => this.queryTransactionStatuses());
		}, interval);
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
			networkID: network ? network.state.network : /* istanbul ignore next */ '1',
			origin,
			status: 'unapproved',
			time: Date.now(),
			transaction
		};

		try {
			const { gas, gasPrice } = await this.estimateGas(transaction);
			transaction.gas = gas;
			transaction.gasPrice = gasPrice;
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
		/* istanbul ignore next */
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
	 * @returns - Promise resolving to an object containing gas and gasPrice
	 */
	async estimateGas(transaction: Transaction) {
		const estimatedTransaction = { ...transaction };
		const { gasLimit } = await this.query('getBlockByNumber', ['latest', false]);
		const { gas, gasPrice: providedGasPrice, to, value } = estimatedTransaction;
		const gasPrice = typeof providedGasPrice === 'undefined' ? await this.query('gasPrice') : providedGasPrice;

		// 1. If gas is already defined on the transaction, use it
		if (typeof gas !== 'undefined') {
			return { gas, gasPrice };
		}

		// 2. If to is not defined or this is not a contract address, use 0x5208 / 21000
		/* istanbul ignore next */
		const code = to ? await this.query('getCode', [to]) : undefined;
		/* istanbul ignore next */
		if (!to || (to && (!code || code === '0x'))) {
			return { gas: '0x5208', gasPrice };
		}

		// 3. If this is a contract address, safely estimate gas using RPC
		estimatedTransaction.value = typeof value === 'undefined' ? '0x0' : /* istanbul ignore next */ value;
		const gasLimitBN = hexToBN(gasLimit);
		estimatedTransaction.gas = BNToHex(fractionBN(gasLimitBN, 19, 20));
		const gasHex = await this.query('estimateGas', [estimatedTransaction]);

		// 4. Pad estimated gas without exceeding the most recent block gasLimit
		const gasBN = hexToBN(gasHex);
		const maxGasBN = gasLimitBN.muln(0.9);
		const paddedGasBN = gasBN.muln(1.5);
		/* istanbul ignore next */
		if (gasBN.gt(maxGasBN)) {
			return { gas: addHexPrefix(gasHex), gasPrice };
		}
		/* istanbul ignore next */
		if (paddedGasBN.lt(maxGasBN)) {
			return { gas: addHexPrefix(BNToHex(paddedGasBN)), gasPrice };
		}
		return { gas: addHexPrefix(BNToHex(maxGasBN)), gasPrice };
	}

	/**
	 * Extension point called if and when this controller is composed
	 * with other controllers using a ComposableController
	 */
	onComposed() {
		super.onComposed();
		const network = this.context.NetworkController as NetworkController;
		const onProviderUpdate = () => {
			this.ethQuery = network.provider ? new EthQuery(network.provider) : /* istanbul ignore next */ null;
		};
		onProviderUpdate();
		network.subscribe(onProviderUpdate);
	}

	/**
	 * Resiliently checks all submitted transactions on the blockchain
	 * and verifies that it has been included in a block
	 * when that happens, the tx status is updated to confirmed
	 *
	 * @returns - Promise resolving when this operation completes
	 */
	async queryTransactionStatuses(): Promise<any> {
		const { transactions } = this.state;
		const network = this.context.NetworkController;
		const currentNetworkID = network.state.network;
		safelyExecute(() =>
			Promise.all(
				transactions.map(async (meta, index) => {
					if (meta.status === 'submitted' && meta.networkID === currentNetworkID) {
						const txObj = await this.query('getTransactionByHash', [meta.transactionHash]);
						/* istanbul ignore else */
						if (txObj && txObj.blockNumber) {
							transactions[index].status = 'confirmed';
							this.hub.emit(`${meta.id}:confirmed`, meta);
						}
					}
				})
			)
		);
		this.update({ transactions: [...transactions] });
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
		const network = this.context.NetworkController as NetworkController;
		if (!network) {
			return;
		}
		const currentNetworkID = network.state.network;
		const newTransactions = this.state.transactions.filter(({ networkID }) => networkID !== currentNetworkID);
		this.update({ transactions: newTransactions });
	}

	/**
	 * Gets all transactions from etherscan for a specific address
	 * optionally starting from a specific block
	 *
	 * @param address - string representing the address to fetch the transactions from
	 * @param fromBlock - string representing the block number (optional)
	 * @returns - Promise resolving to an string containing the block number of the latest incoming transaction.
	 */
	async fetchAll(address: string, fromBlock?: string): Promise<any> {
		const network = this.context.NetworkController;
		const currentNetworkID = network.state.network;
		const apiUrl = this.getEtherscanApiUrl(currentNetworkID);
		/* istanbul ignore next */
		if (!apiUrl) {
			return null;
		}
		let url = `${apiUrl}/api?module=account&action=txlist&address=${address}&tag=latest&page=1`;
		/* istanbul ignore next */
		if (fromBlock) {
			url += `&startBlock=${fromBlock}`;
		}
		const response = await fetch(url);
		const parsedResponse = await response.json();
		/* istanbul ignore else */
		if (parsedResponse.status !== '0' && parsedResponse.result.length > 0) {
			const remoteTxList: any = {};
			const remoteTxs = parsedResponse.result.map((tx: any) => {
				remoteTxList[tx.hash] = 1;
				return this.normalizeTxFromEtherscan(tx, currentNetworkID);
			});

			const localTxs = this.state.transactions.filter(
				/* istanbul ignore next */
				(tx: TransactionMeta) => !remoteTxList[`${tx.transactionHash}`]
			);

			const allTxs = [...remoteTxs, ...localTxs];
			allTxs.sort((a, b) => (/* istanbul ignore next */ a.time < b.time ? -1 : 1));

			let latestIncomingTxBlockNumber: any = null;
			allTxs.forEach((tx) => {
				/* istanbul ignore next */
				if (tx.transaction.to.toLowerCase() === address.toLowerCase()) {
					if (
						!latestIncomingTxBlockNumber ||
						parseInt(latestIncomingTxBlockNumber, 10) < parseInt(tx.blockNumber, 10)
					) {
						latestIncomingTxBlockNumber = tx.blockNumber;
					}
				}
			});

			this.update({ transactions: allTxs });
			return latestIncomingTxBlockNumber;
		}
		/* istanbul ignore next */
		return null;
	}
}

export default TransactionController;
