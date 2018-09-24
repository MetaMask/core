import 'isomorphic-fetch';
import BaseController, { BaseConfig, BaseState } from './BaseController';
import AssetsController, { Collectible } from './AssetsController';
import NetworkController from './NetworkController';
import PreferencesController from './PreferencesController';
import { safelyExecute } from './util';

const contractMap = require('eth-contract-metadata');
const abiERC20 = require('human-standard-token-abi');
const Web3 = require('web3');
import { Token } from './TokenRatesController';

const DEFAULT_INTERVAL = 180000;
const MAINNET = 'mainnet';

/**
 * @type AssetsConfig
 *
 * Assets controller configuration
 *
 * @property collectibles - List of collectibles associated with the active vault
 * @property interval - Polling interval used to fetch new token rates
 * @property networkType - Network ID as per net_version
 * @property provider - Provider used to create a new web3 instance
 * @property selectedAddress - Vault selected address
 * @property tokens - List of tokens associated with the active vault
 */
export interface AssetsDetectionConfig extends BaseConfig {
	collectibles: Collectible[];
	interval: number;
	networkType: string;
	selectedAddress: string;
	provider: any;
	tokens: Token[];
}

/**
 * Controller that passively polls on a set interval for assets auto detection
 */
export class AssetsDetectionController extends BaseController<AssetsDetectionConfig, BaseState> {
	private handle?: NodeJS.Timer;
	private web3: any;

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
			provider: undefined,
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

	/**
	 * Sets a new provider
	 *
	 * @property provider - Provider used to create a new underlying EthQuery instance
	 */
	set provider(provider: any) {
		this.web3 = new Web3(provider);
	}

	/**
	 * Detect assets owned by current account on mainnet
	 */
	async detectAssets() {
		if (this.config.networkType !== MAINNET) {
			return;
		}
		this.detectTokens();
		this.detectCollectibles();
	}

	/**
	 * For each token that is not owned by current account on mainnet
	 * trigger balance detection for it
	 */
	async detectTokens() {
		const tokensAddresses = this.config.tokens.filter((token) => token.address);
		for (const contractAddress in contractMap) {
			const contract = contractMap[contractAddress];
			if (contract.erc20 && !(contractAddress in tokensAddresses)) {
				this.detectTokenBalance(contractAddress);
			}
		}
	}

	/**
	 * Detect balance of current account in token contract
	 */
	async detectTokenBalance(contractAddress: string) {
		const selectedAddress = this.config.selectedAddress;
		const contract = this.web3.eth.contract(abiERC20).at(contractAddress);
		const assetsController = this.context.AssetsController as AssetsController;
		contract.balanceOf(selectedAddress, (error: any, result: any) => {
			/* istanbul ignore next */
			if (!error) {
				if (!result.isZero()) {
					assetsController.addToken(
						contractAddress,
						contractMap[contractAddress].symbol,
						contractMap[contractAddress].decimals
					);
				}
			} else {
				throw new Error(`${this.name} in detectTokenBalance.`);
			}
		});
	}

	/**
	 * For each collectible contract checks if there are new collectibles owned
	 * by current account on mainnet, triggering ownership detection for each contract
	 */
	async detectCollectibles() {
		for (const contractAddress in contractMap) {
			const contract = contractMap[contractAddress];
			if (contract.erc721) {
				this.detectCollectibleOwnership();
			}
		}
	}

	/**
	 * Detect new collectibles owned by current account in collectible contract
	 */
	async detectCollectibleOwnership() {
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
			this.configure({ collectibles, tokens });
		});
		preferences.subscribe(({ selectedAddress }) => {
			this.configure({ selectedAddress, interval: DEFAULT_INTERVAL });
			this.detectAssets();
		});
		network.subscribe(({ provider }) => {
			const networkType = provider.type;
			this.configure({ provider, networkType, interval: DEFAULT_INTERVAL });
			this.detectAssets();
		});
	}
}

export default AssetsDetectionController;
