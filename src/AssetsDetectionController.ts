import 'isomorphic-fetch';
import BaseController, { BaseConfig, BaseState } from './BaseController';
import AssetsController from './AssetsController';
import NetworkController from './NetworkController';
import PreferencesController from './PreferencesController';
import AssetsContractController from './AssetsContractController';
import { safelyExecute } from './util';
import { Token } from './TokenRatesController';
import { NetworkType } from './NetworkController';

const contractMap = require('eth-contract-metadata');
const DEFAULT_INTERVAL = 180000;
const MAINNET = 'mainnet';

/**
 * @type CollectibleEntry
 *
 * Collectible minimal representation expected on collectibles api
 *
 * @property id - Collectible identifier
 */
export interface CollectibleEntry {
	id: number;
}

/**
 * @type AssetsConfig
 *
 * Assets controller configuration
 *
 * @property interval - Polling interval used to fetch new token rates
 * @property networkType - Network type ID as per net_version
 * @property selectedAddress - Vault selected address
 * @property tokens - List of tokens associated with the active vault
 */
export interface AssetsDetectionConfig extends BaseConfig {
	interval: number;
	networkType: NetworkType;
	selectedAddress: string;
	tokens: Token[];
}

/**
 * Controller that passively polls on a set interval for assets auto detection
 */
export class AssetsDetectionController extends BaseController<AssetsDetectionConfig, BaseState> {
	private handle?: NodeJS.Timer;

	/**
	 * Get user information API for collectibles based on API provided in contract metadata
	 *
	 * @param address - ERC721 asset contract address
	 * @returns - User information URI
	 */
	private getCollectibleUserApi(address: string) {
		const contract = contractMap[address];
		const { selectedAddress } = this.config;
		const collectibleUserApi = contract.api + contract.owner_api + selectedAddress;
		return collectibleUserApi;
	}

	/**
	 * Get current account collectibles ids, if ERC721Enumerable interface implemented
	 *
	 * @param address - ERC721 asset contract address
	 * @return - Promise resolving to collectibles entries array
	 */
	private async getEnumerableCollectiblesIds(address: string): Promise<CollectibleEntry[]> {
		const assetsContractController = this.context.AssetsContractController as AssetsContractController;
		const collectibleEntries: CollectibleEntry[] = [];
		try {
			const { selectedAddress } = this.config;
			const balance = await assetsContractController.getBalanceOf(address, selectedAddress);
			const indexes: number[] = Array.from(new Array(balance.toNumber()), (_, index) => index);
			const promises = indexes.map((index) => {
				return assetsContractController.getCollectibleTokenId(address, selectedAddress, index);
			});
			const tokenIds = await Promise.all(promises);
			for (const key in tokenIds) {
				collectibleEntries.push({ id: tokenIds[key] });
			}
			return collectibleEntries;
		} catch (error) {
			/* istanbul ignore next */
			return collectibleEntries;
		}
	}

	/**
	 * Get current account collectibles, using collectible API
	 * if there is one defined in contract metadata
	 *
	 * @param address - ERC721 asset contract address
	 * @returns - Promise resolving to collectibles entries array
	 */
	private async getApiCollectiblesIds(address: string): Promise<CollectibleEntry[]> {
		const contract = contractMap[address];
		const collectibleEntries: CollectibleEntry[] = [];
		try {
			const collectibleUserApi = this.getCollectibleUserApi(address);
			const response = await fetch(collectibleUserApi);
			const json = await response.json();
			const collectiblesJson = json[contract.collectibles_entry];
			for (const key in collectiblesJson) {
				const collectibleEntry: CollectibleEntry = collectiblesJson[key];
				collectibleEntries.push({ id: collectibleEntry.id });
			}
			return collectibleEntries;
		} catch (error) {
			/* istanbul ignore next */
			return collectibleEntries;
		}
	}

	/**
	 * Name of this controller used during composition
	 */
	name = 'AssetsDetectionController';

	/**
	 * List of required sibling controllers this controller needs to function
	 */
	requiredControllers = [
		'AssetsContractController',
		'AssetsController',
		'NetworkController',
		'PreferencesController'
	];

	/**
	 * Creates a AssetsDetectionController instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<AssetsDetectionConfig>, state?: Partial<BaseState>) {
		super(config, state);
		this.defaultConfig = {
			interval: DEFAULT_INTERVAL,
			networkType: 'ropsten',
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
		this.handle = setInterval(() => {
			safelyExecute(() => this.detectAssets());
		}, interval);
	}

	/**
	 * Detect if current account is owner of ERC20 token. If is the case, adds it to state
	 *
	 * @param address - Asset ERC20 contract address
	 */
	async detectTokenOwnership(address: string) {
		const assetsController = this.context.AssetsController as AssetsController;
		const assetsContractController = this.context.AssetsContractController as AssetsContractController;
		const { selectedAddress } = this.config;
		const balance = await assetsContractController.getBalanceOf(address, selectedAddress);
		if (balance.toNumber() !== 0) {
			assetsController.addToken(address, contractMap[address].symbol, contractMap[address].decimals);
		}
	}

	/**
	 * Detect if current account is owner of ERC721 token. If is the case, adds it to state
	 *
	 * @param address - ERC721 asset contract address
	 */
	async detectCollectibleOwnership(address: string) {
		const assetsContractController = this.context.AssetsContractController as AssetsContractController;
		const assetsController = this.context.AssetsController as AssetsController;
		const { selectedAddress } = this.config;
		const balance = await assetsContractController.getBalanceOf(address, selectedAddress);
		if (balance.toNumber() !== 0) {
			let collectibleIds: CollectibleEntry[] = [];
			const contractApiDefined =
				contractMap[address] && contractMap[address].api && contractMap[address].owner_api;
			if (contractApiDefined) {
				collectibleIds = await this.getApiCollectiblesIds(address);
			} else {
				const supportsEnumerable = await assetsContractController.contractSupportsEnumerableInterface(address);
				if (supportsEnumerable) {
					collectibleIds = await this.getEnumerableCollectiblesIds(address);
				}
			}
			for (const key in collectibleIds) {
				await assetsController.addCollectible(address, collectibleIds[key].id);
			}
		}
	}

	/**
	 * Detect assets owned by current account on mainnet
	 */
	async detectAssets() {
		/* istanbul ignore if */
		if (this.config.networkType !== MAINNET || this.disabled) {
			return;
		}
		this.detectTokens();
		this.detectCollectibles();
	}

	/**
	 * Triggers asset ERC20 token auto detection for each contract address in contract metadata
	 */
	async detectTokens() {
		const tokensAddresses = this.config.tokens.filter(/* istanbul ignore next*/ (token) => token.address);
		for (const address in contractMap) {
			const contract = contractMap[address];
			if (contract.erc20 && !(address in tokensAddresses)) {
				await this.detectTokenOwnership(address);
			}
		}
	}

	/**
	 * Triggers asset ERC721 token auto detection for each contract address in contract metadata
	 */
	async detectCollectibles() {
		for (const address in contractMap) {
			const contract = contractMap[address];
			if (contract.erc721) {
				await this.detectCollectibleOwnership(address);
			}
		}
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
		assets.subscribe(({ tokens }) => {
			this.configure({ tokens });
		});
		preferences.subscribe(({ selectedAddress }) => {
			const actualSelectedAddress = this.config.selectedAddress;
			if (selectedAddress !== actualSelectedAddress) {
				this.configure({ selectedAddress });
				this.detectAssets();
			}
		});
		network.subscribe(({ provider }) => {
			this.configure({ networkType: provider.type });
		});
	}
}

export default AssetsDetectionController;
