import BaseController, { BaseConfig, BaseState } from './BaseController';

/**
 * @type ShapeShiftTransaction
 *
 * ShapeShift transaction object
 *
 * @property depositAddress - Address where coins should be deposited
 * @property depositType - Abbreviation of the type of crypto currency to be deposited
 * @property key - Unique string to identify this transaction as a ShapeShift transaction
 * @property response - Populated with a ShapeShiftResponse object upon transaction completion
 * @property time - Timestamp when this transction was last updated
 */
export interface ShapeShiftTransaction {
	depositAddress: string;
	depositType: string;
	key: string;
	response?: ShapeShiftResponse;
	time: number;
}

/**
 * @type ShapeShiftResponse
 *
 * ShapeShift transaction response object
 *
 * @property status - String indicating transactional status
 */
export interface ShapeShiftResponse {
	status: 'complete' | 'failed' | 'no_deposits' | 'received';
}

/**
 * @type ShapeShiftConfig
 *
 * ShapeShift controller configuration
 *
 * @property interval - Polling interval used to fetch ShapeShift transactions
 */
export interface ShapeShiftConfig extends BaseConfig {
	interval: number;
}

/**
 * @type ShapeShiftState
 *
 * ShapeShift controller state
 *
 * @property shapeShiftTxList - List of ShapeShift transactions
 */
export interface ShapeShiftState extends BaseState {
	shapeShiftTxList: ShapeShiftTransaction[];
}

/**
 * Controller that passively polls on a set interval for ShapeShift transactions
 */
export class ShapeShiftController extends BaseController<ShapeShiftState, ShapeShiftConfig> {
	private handle?: NodeJS.Timer;

	private getPendingTransactions() {
		return this.state.shapeShiftTxList.filter((tx) => !tx.response || tx.response.status !== 'complete');
	}

	private getUpdateURL(transaction: ShapeShiftTransaction) {
		return `https://shapeshift.io/txStat/${transaction.depositAddress}`;
	}

	private async updateTransaction(transaction: ShapeShiftTransaction) {
		try {
			const response = await fetch(this.getUpdateURL(transaction));
			transaction.response = await response.json();
			if (transaction.response && transaction.response.status === 'complete') {
				transaction.time = Date.now();
			}
			return transaction;
		} catch (error) {
			/* tslint:disable-next-line:no-empty */
		}
	}

	/**
	 * Creates a ShapeShiftController instance
	 *
	 * @param state - Initial state to set on this controller
	 * @param config - Initial options used to configure this controller
	 */
	constructor(state?: Partial<ShapeShiftState>, config?: Partial<ShapeShiftConfig>) {
		super(state, config);
		this.defaultConfig = { interval: 3000 };
		this.defaultState = { shapeShiftTxList: [] };
		this.initialize();
	}

	/**
	 * Sets a new polling interval
	 *
	 * @param interval - Polling interval used to fetch new ShapeShift transactions
	 */
	set interval(interval: number) {
		this.handle && clearInterval(this.handle);
		this.updateTransactionList();
		this.handle = setInterval(() => {
			this.updateTransactionList();
		}, interval);
	}

	/**
	 * Creates a new ShapeShift transaction
	 *
	 * @param depositAddress - Address where coins should be deposited
	 * @param depositType - Abbreviation of the type of crypto currency to be deposited
	 */
	createTransaction(depositAddress: string, depositType: string) {
		const { shapeShiftTxList } = this.state;
		const transaction = {
			depositAddress,
			depositType,
			key: 'shapeshift',
			response: undefined,
			time: Date.now()
		};

		shapeShiftTxList.push(transaction);
		this.update({ shapeShiftTxList });
	}

	/**
	 * Updates list of ShapeShift transactions
	 */
	async updateTransactionList() {
		const { shapeShiftTxList } = this.state;
		const pendingTx = this.getPendingTransactions();

		if (this.disabled || pendingTx.length === 0) {
			return;
		}
		await Promise.all(pendingTx.map((tx) => this.updateTransaction(tx)));
		this.update({ shapeShiftTxList });
	}
}

export default ShapeShiftController;
