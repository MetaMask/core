import 'isomorphic-fetch';
import BaseController, { BaseConfig, BaseState } from './BaseController';
import AssetsController, { Collectible } from './AssetsController';
import NetworkController from './NetworkController';
import PreferencesController from './PreferencesController';
import { safelyExecute } from './util';
const contractMap = require('eth-contract-metadata');
const { toChecksumAddress } = require('ethereumjs-util');
import Web3 = require('web3');
import { Token } from './TokenRatesController';

const DEFAULT_INTERVAL = 18000;
const MAINNET = 'mainnet';

/**
 * @type AssetsConfig
 *
 * Assets controller configuration
 *
 * @property collectibles - List of collectibles associated with the active vault
 * @property interval - Polling interval used to fetch new token rates
 * @property networkType - Network ID as per net_version
 * @property selectedAddress - Vault selected address
 * @property tokens - List of tokens associated with the active vault
 */
export interface AssetsDetectionConfig extends BaseConfig {
	collectibles: Collectible[];
	interval: number;
	networkType: string;
	selectedAddress: string;
	tokens: Token[];
}

/**
 * Controller that passively polls on a set interval for assets auto detection
 */
export class AssetsDetectionController extends BaseController<AssetsDetectionConfig, BaseState> {
	private handle?: NodeJS.Timer;

	/**
	 * Name of this controller used during composition
	 */
	name = 'AssetsDetectionController';

	/**
	 * List of required sibling controllers this controller needs to function
	 */
	requiredControllers = ['AssetsController', 'NetworkController', 'PreferencesController'];

	/**
	 * Creates a AssetsDetectionController instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<AssetsDetectionConfig>, state?: Partial<BaseState>) {
		super(config, state);
		this.defaultConfig = {
			collectibles: [],
			interval: DEFAULT_INTERVAL,
			networkType: '',
			selectedAddress: '',
			tokens: []
		};
		this.initialize();
	}

	/**
	 * Sets a new polling interval
	 *
	 * @param interval - Polling interval used to auto detect assets
	 */
	set interval(interval: number) {
		this.handle && clearInterval(this.handle);
		safelyExecute(() => this.detectAssets());
		this.handle = setInterval(() => {
			safelyExecute(() => this.detectAssets());
		}, interval);
	}

	async detectAssets() {
		if (this.config.networkType !== MAINNET) {
			return;
		}
		this.detectTokens();
		this.detectCollectibles();
	}

	async detectTokens() {
		const tokensAddresses = this.config.tokens.filter((token) => token.address);
		for (const contractAddress in contractMap) {
			const contract = contractMap[contractAddress];
			if (contract.erc20 && !(contractAddress in tokensAddresses)) {
				this.detectTokenBalance();
			}
		}
	}

	async detectTokenBalance() {
		return;
	}

	async detectCollectibles() {
		return;
	}

	/**
	 * Extension point called if and when this controller is composed
	 * with other controllers using a ComposableController
	 */
	onComposed() {
		super.onComposed();
		const preferences = this.context.PreferencesController as PreferencesController;
		const network = this.context.NetworkController as NetworkController;
		const assets = this.context.AssetsController as AssetsController;
		assets.subscribe(({ collectibles, tokens }) => {
			this.config({ collectibles, tokens });
		});
		preferences.subscribe(({ selectedAddress }) => {
			this.configure({ selectedAddress, interval: DEFAULT_INTERVAL });
			this.detectAssets();
		});
		network.subscribe(({ provider }) => {
			const networkType = provider.type;
			this.configure({ networkType, interval: DEFAULT_INTERVAL });
			this.detectAssets();
		});
	}
}

export default AssetsDetectionController;
