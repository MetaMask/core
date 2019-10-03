import BaseController, { BaseConfig, BaseState } from '../BaseController';
import { safelyExecute, handleFetch } from '../util';

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
export class ShapeShiftController extends BaseController<ShapeShiftConfig, ShapeShiftState> {
	private handle?: NodeJS.Timer;

	private getPendingTransactions() {
		return this.state.shapeShiftTxList.filter((tx) => !tx.response || tx.response.status !== 'complete');
	}

	private getUpdateURL(transaction: ShapeShiftTransaction) {
		return `https://shapeshift.io/txStat/${transaction.depositAddress}`;
	}

	private async updateTransaction(transaction: ShapeShiftTransaction) {
		return safelyExecute(async () => {
			transaction.response = await handleFetch(this.getUpdateURL(transaction));
			if (transaction.response && transaction.response.status === 'complete') {
				transaction.time = Date.now();
			}
			return transaction;
		});
	}

	/**
	 * Name of this controller used during composition
	 */
	name = 'ShapeShiftController';

	/**
	 * Creates a ShapeShiftController instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<ShapeShiftConfig>, state?: Partial<ShapeShiftState>) {
		super(config, state);
		this.defaultConfig = { interval: 3000 };
		this.defaultState = { shapeShiftTxList: [] };
		this.initialize();
		this.poll();
	}

	/**
	 * Starts a new polling interval
	 *
	 * @param interval - Polling interval used to fetch new ShapeShift transactions
	 */
	async poll(interval?: number): Promise<void> {
		interval && this.configure({ interval }, false, false);
		this.handle && clearTimeout(this.handle);
		await safelyExecute(() => this.updateTransactionList());
		this.handle = setTimeout(() => {
			this.poll(this.config.interval);
		}, this.config.interval);
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
		this.update({ shapeShiftTxList: [...shapeShiftTxList] });
	}

	/**
	 * Updates list of ShapeShift transactions
	 *
	 * @returns - Promise resolving when this operation completes
	 */
	async updateTransactionList() {
		const { shapeShiftTxList } = this.state;
		const pendingTx = this.getPendingTransactions();

		if (this.disabled || pendingTx.length === 0) {
			return;
		}
		await Promise.all(pendingTx.map((tx) => this.updateTransaction(tx)));
		this.update({ shapeShiftTxList: [...shapeShiftTxList] });
	}
}

export default ShapeShiftController;
