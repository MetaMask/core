import BaseController, { BaseConfig, BaseState } from './BaseController';
import PreferencesController from './PreferencesController';
import { BNToHex, safelyExecute } from './util';

const EthjsQuery = require('ethjs-query');
const BlockTracker = require('eth-block-tracker');

/**
 * @type AccountInformation
 *
 * Account information object
 *
 * @property balance - Hex string of an account balancec in wei
 */
export interface AccountInformation {
	balance: string;
}

/**
 * @type AccountTrackerConfig
 *
 * Account tracker controller configuration
 *
 * @property provider - Provider used to create a new underlying EthQuery instance
 */
export interface AccountTrackerConfig extends BaseConfig {
	provider?: any;
}

/**
 * @type AccountTrackerState
 *
 * Account tracker controller state
 *
 * @property accounts - Map of addresses to account information
 */
export interface AccountTrackerState extends BaseState {
	accounts: { [address: string]: AccountInformation };
}

/**
 * Controller that tracks information for all accounts in the current keychain
 */
export class AccountTrackerController extends BaseController<AccountTrackerConfig, AccountTrackerState> {
	private blockTracker: any;
	private ethjsQuery: any;

	private syncAccounts() {
		const {
			state: { identities }
		} = this.context.PreferencesController as PreferencesController;
		const { accounts } = this.state;
		const addresses = Object.keys(identities);
		const existing = Object.keys(accounts);
		const newAddresses = addresses.filter((address) => existing.indexOf(address) === -1);
		const oldAddresses = existing.filter((address) => addresses.indexOf(address) === -1);
		newAddresses.forEach((address) => {
			accounts[address] = { balance: '0x0' };
		});
		oldAddresses.forEach((address) => {
			delete accounts[address];
		});
		this.update({ accounts });
	}

	/**
	 * List of required sibling controllers this controller needs to function
	 */
	requiredControllers = ['PreferencesController'];

	/**
	 * Creates an AccountTracker instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<AccountTrackerConfig>, state?: Partial<AccountTrackerState>) {
		super(config, state);
		this.defaultConfig = {};
		this.defaultState = { accounts: {} };
		this.initialize();
	}

	/**
	 * Extension point called if and when this controller is composed
	 * with other controllers using a ComposableController
	 */
	onComposed() {
		super.onComposed();
		const preferences = this.context.PreferencesController as PreferencesController;
		preferences.subscribe(this.refresh);
		this.refresh();
	}

	/**
	 * Sets a new provider
	 *
	 * @param provider - Provider used to create a new underlying EthQuery instance
	 */
	set provider(provider: any) {
		this.blockTracker && /* istanbul ignore next */ this.blockTracker.removeAllListeners();
		this.ethjsQuery = new EthjsQuery(provider);
		this.blockTracker = new BlockTracker({ provider });
		this.blockTracker.on('block', this.refresh.bind(this));
		this.blockTracker.start();
	}

	/**
	 * Refreshes all accounts in the current keychain
	 */
	refresh = async () => {
		this.syncAccounts();
		const { accounts } = this.state;
		for (const address in accounts) {
			await safelyExecute(async () => {
				const balance = await this.ethjsQuery.getBalance(address);
				accounts[address] = { balance: BNToHex(balance) };
			});
		}
		/* tslint:disable-next-line */
	};
}

export default AccountTrackerController;
