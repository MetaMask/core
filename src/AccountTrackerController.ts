import BaseController, { BaseConfig, BaseState } from './BaseController';
import { Block } from './BlockHistoryController';
import { safelyExecute } from './util';

const EthQuery = require('eth-query');

/**
 * @type AccountTrackerConfig
 *
 * Account tracker controller configuration
 *
 * @property blockTracker - Contains methods for tracking blocks and querying the blockchain
 * @property provider - Provider used to create a new underlying EthQuery instance
 */
export interface AccountTrackerConfig extends BaseConfig {
	blockTracker: any;
	provider: any;
}

/**
 * @type AccountTrackerState
 *
 * Account tracker controller state
 *
 * @property accounts - Network ID as per net_version
 * @property currentBlockGasLimit - Hex string gas limit of the current block
 */
export interface AccountTrackerState extends BaseState {
	accounts: { [address: string]: any };
	currentBlockGasLimit: string;
}

/**
 * Controller that tracks information associated with specific Ethereum accounts
 */
export class AccountTrackerController extends BaseController<AccountTrackerConfig, AccountTrackerState> {
	private currentBlockNumber: string | undefined;
	private ethQuery: any;
	private internalBlockTracker: any;

	private async getAccount(address: string) {
		return new Promise((resolve) => {
			this.ethQuery.getBalance(
				address,
				/* istanbul ignore next */ (balance: string) => {
					resolve(balance);
				}
			);
		});
	}

	private onBlock({ number: blockNumber, gasLimit }: Block) {
		this.currentBlockNumber = blockNumber;
		this.update({ currentBlockGasLimit: gasLimit });
		this.updateAccounts();
	}

	private async updateAccount(address: string) {
		const { accounts } = this.state;
		const account = await this.getAccount(address);
		/* istanbul ignore next */
		if (accounts[address]) {
			accounts[address] = account;
			this.update({ accounts });
		}
	}

	private async updateAccounts() {
		const { accounts } = this.state;
		safelyExecute(async () => {
			for (const address in accounts) {
				await this.updateAccount(address);
			}
		});
	}

	/**
	 * Creates an AccountTrackerController instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<AccountTrackerConfig>, state?: Partial<AccountTrackerState>) {
		super(config, state);
		this.defaultState = {
			accounts: {},
			currentBlockGasLimit: ''
		};
		this.initialize();
	}

	/**
	 * Sets a new BlockTracker instance
	 *
	 * @param blockTracker - Contains methods for tracking blocks and querying the blockchain
	 */
	set blockTracker(blockTracker: any) {
		this.internalBlockTracker && this.internalBlockTracker.removeAllListeners();
		this.internalBlockTracker = blockTracker;
		this.internalBlockTracker.on('block', this.onBlock.bind(this));
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
	 * Tracks a new account, which will have a balance if the current network has a block
	 *
	 * @param address - Hex address of a new account to add
	 */
	add(address: string) {
		const { accounts } = this.state;
		accounts[address] = {};
		this.update({ accounts });
		this.currentBlockNumber && this.updateAccount(address);
	}

	/**
	 * Stops tracking an account
	 *
	 * @param address - Hex address of a old account to remove
	 */
	remove(address: string) {
		const { accounts } = this.state;
		delete accounts[address];
		this.update({ accounts });
	}

	/**
	 * Synchronizes the current address list with external identities
	 *
	 * @param addresses - List of addresses to sync
	 */
	sync(addresses: string[]) {
		const { accounts } = this.state;
		const existing = Object.keys(accounts);
		const newAddresses = addresses.filter((address) => existing.indexOf(address) === -1);
		const oldAddresses = existing.filter((address) => addresses.indexOf(address) === -1);
		newAddresses.forEach((address) => {
			this.add(address);
		});
		oldAddresses.forEach((address) => {
			this.remove(address);
		});
		this.updateAccounts();
	}
}

export default AccountTrackerController;
