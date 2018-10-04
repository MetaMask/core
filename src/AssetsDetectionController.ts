import 'isomorphic-fetch';
import BaseController, { BaseConfig, BaseState } from './BaseController';
import AssetsController, { Collectible } from './AssetsController';
import NetworkController from './NetworkController';
import PreferencesController from './PreferencesController';
import { safelyExecute } from './util';
import { Token } from './TokenRatesController';

const Web3 = require('web3');
const contractMap = require('eth-contract-metadata');
const abiERC20 = require('human-standard-token-abi');
const abiERC721 = require('human-standard-collectible-abi');
const DEFAULT_INTERVAL = 180000;
const MAINNET = 'mainnet';
const ERC721METADATA_INTERFACE_ID = '0x5b5e139f';
const ERC721ENUMERABLE_INTERFACE_ID = '0x780e9d63';

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
	 * Get user information API for collectibles based on API provided in contract metadata
	 *
	 * @param contractAddress - ERC721 asset contract address
	 * @returns - User information URI
	 */
	private getCollectibleUserApi(contractAddress: string) {
		const contract = contractMap[contractAddress];
		const selectedAddress = this.config.selectedAddress;
		const collectibleUserApi = contract.api + contract.owner_api + selectedAddress;
		return collectibleUserApi;
	}

	/**
	 *
	 * Query if a contract implements an interface
	 *
	 * @param contractAddress - Asset contract address
	 * @param interfaceId - Interface identifier
	 * @returns - Promise resolving to if the contract implements `interfaceID`
	 */
	private async contractSupportsInterface(contractAddress: string, interfaceId: string): Promise<boolean> {
		try {
			const contract = this.web3.eth.contract(abiERC721).at(contractAddress);
			const supports = (await new Promise<boolean>((resolve, reject) => {
				contract.supportsInterface(interfaceId, (error: Error, result: any) => {
					/* istanbul ignore if */
					if (error) {
						reject(error);
						return;
					}
					resolve(result);
				});
			})) as boolean;
			return supports;
		} catch (error) {
			/* istanbul ignore next */
			return false;
		}
	}

	/**
	 * Enumerate assets assigned to an owner
	 *
	 * @param contractAddress - ERC721 asset contract address
	 * @param index - A collectible counter less than `balanceOf(owner)`
	 * @returns - Promise resolving to token identifier for the 'index'th asset assigned to 'contractAddress'
	 */
	private async getCollectibleTokenId(contractAddress: string, index: number): Promise<number> {
		const contract = this.web3.eth.contract(abiERC721).at(contractAddress);
		const selectedAddress = this.config.selectedAddress;
		return new Promise<number>((resolve, reject) => {
			contract.tokenOfOwnerByIndex(selectedAddress, index, (error: Error, result: any) => {
				/* istanbul ignore if */
				if (error) {
					reject(error);
					return;
				}
				resolve(result.toNumber());
			});
		});
	}

	/**
	 * Get current account collectibles ids, if ERC721Enumerable interface implemented
	 *
	 * @param contractAddress - ERC721 asset contract address
	 * @return - Promise resolving to collectibles entries array
	 */
	private async getAccountEnumerableCollectiblesIds(contractAddress: string): Promise<CollectibleEntry[]> {
		const collectibleEntries: CollectibleEntry[] = [];
		try {
			const balance = await this.contractBalanceOf(contractAddress);
			if (balance !== 0) {
				const indexes: number[] = Array.from(new Array(balance), (_, index) => index);
				const promises = indexes.map((index) => {
					return this.getCollectibleTokenId(contractAddress, index);
				});
				const tokenIds = await Promise.all(promises);
				for (const key in tokenIds) {
					collectibleEntries.push({ id: tokenIds[key] });
				}
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
	 * @param contractAddress - ERC721 asset contract address
	 * @returns - Promise resolving to collectibles entries array
	 */
	private async getAccountApiCollectiblesIds(contractAddress: string): Promise<CollectibleEntry[]> {
		const collectibleEntries: CollectibleEntry[] = [];
		try {
			const balance = await this.contractBalanceOf(contractAddress);
			const contract = contractMap[contractAddress];
			if (balance !== 0 && contract.api && contract.owner_api) {
				const collectibleUserApi = this.getCollectibleUserApi(contractAddress);
				const response = await fetch(collectibleUserApi);
				const json = await response.json();
				const collectiblesJson = json[contract.collectibles_entry];
				for (const key in collectiblesJson) {
					const collectibleEntry: CollectibleEntry = collectiblesJson[key];
					collectibleEntries.push({ id: collectibleEntry.id });
				}
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
		this.handle = setInterval(() => {
			safelyExecute(() => this.detectAssets());
		}, interval);
	}

	/**
	 * Sets a new provider
	 *
	 * @property provider - Provider used to create a new underlying Web3 instance
	 */
	set provider(provider: any) {
		this.web3 = new Web3(provider);
	}

	/**
	 * Get balance or count for current account on specific asset contract
	 *
	 * @param contractAddress - Asset contract address
	 * @returns - Promise resolving to balance for current account on specific asset contract
	 */
	async contractBalanceOf(contractAddress: string): Promise<number> {
		try {
			const contract = this.web3.eth.contract(abiERC20).at(contractAddress);
			const selectedAddress = this.config.selectedAddress;
			const balance = (await new Promise((resolve, reject) => {
				contract.balanceOf(selectedAddress, (error: Error, result: any) => {
					/* istanbul ignore if */
					if (error) {
						reject(error);
						return;
					}
					resolve(result);
				});
			})) as any;
			return balance.toNumber();
		} catch (error) {
			/* istanbul ignore next */
			return 0;
		}
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
	 * Triggers asset ERC20 token auto detection for each contract address in contract metadata
	 */
	async detectTokens() {
		const tokensAddresses = this.config.tokens.filter((token) => token.address);
		for (const contractAddress in contractMap) {
			const contract = contractMap[contractAddress];
			if (contract.erc20 && !(contractAddress in tokensAddresses)) {
				await this.detectTokenOwnership(contractAddress);
			}
		}
	}

	/**
	 * Detect if current account is owner of ERC20 token, if that is the case, adds it to state
	 *
	 * @param contractAddress - Asset ERC20 contract address
	 */
	async detectTokenOwnership(contractAddress: string) {
		const assetsController = this.context.AssetsController as AssetsController;
		const balance = await this.contractBalanceOf(contractAddress);
		if (balance !== 0) {
			assetsController.addToken(
				contractAddress,
				contractMap[contractAddress].symbol,
				contractMap[contractAddress].decimals
			);
		}
	}

	/**
	 * Triggers asset ERC721 token auto detection for each contract address in contract metadata
	 */
	async detectCollectibles() {
		for (const contractAddress in contractMap) {
			const contract = contractMap[contractAddress];
			if (contract.erc721) {
				await this.detectCollectibleOwnership(contractAddress);
			}
		}
	}

	/**
	 * Query for tokenURI for a given asset
	 *
	 * @param contractAddress - ERC721 asset contract address
	 * @param tokenId - ERC721 asset identifier
	 * @returns - Promise resolving to the 'tokenURI'
	 */
	async getCollectibleTokenURI(contractAddress: string, tokenId: number): Promise<string> {
		try {
			const supports = await this.contractSupportsInterface(contractAddress, ERC721METADATA_INTERFACE_ID);
			/* istanbul ignore if */
			if (!supports) {
				return '';
			}
			const contract = this.web3.eth.contract(abiERC721).at(contractAddress);
			const URI = (await new Promise<string>((resolve, reject) => {
				contract.tokenURI(tokenId, (error: Error, result: any) => {
					/* istanbul ignore if */
					if (error) {
						reject(error);
						return;
					}
					resolve(result);
				});
			})) as string;
			return URI;
		} catch (error) {
			/* istanbul ignore next */
			return '';
		}
	}

	/**
	 * Detect if current account is owner of ERC721 token, if that is the case, adds it to state
	 *
	 * @param contractAddress - ERC721 asset contract address
	 */
	async detectCollectibleOwnership(contractAddress: string) {
		const supportsEnumerable = await this.contractSupportsInterface(contractAddress, ERC721ENUMERABLE_INTERFACE_ID);
		let collectibleIds: CollectibleEntry[] = [];
		if (supportsEnumerable) {
			collectibleIds = await this.getAccountEnumerableCollectiblesIds(contractAddress);
		} else if (contractMap[contractAddress] && contractMap[contractAddress].api) {
			collectibleIds = await this.getAccountApiCollectiblesIds(contractAddress);
		}
		const assetsController = this.context.AssetsController as AssetsController;
		for (const key in collectibleIds) {
			await assetsController.addCollectible(contractAddress, collectibleIds[key].id);
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
		assets.subscribe(({ collectibles, tokens }) => {
			this.configure({ collectibles, tokens });
		});
		preferences.subscribe(({ selectedAddress }) => {
			const actualSelectedAddress = this.config.selectedAddress;
			if (selectedAddress !== actualSelectedAddress) {
				this.configure({ selectedAddress });
				this.detectAssets();
			}
		});
		network.subscribe(({ provider }) => {
			const lastNetworkType = this.config.networkType;
			if (lastNetworkType !== provider.type) {
				const networkType = provider.type;
				this.configure({ provider, networkType });
				this.detectAssets();
			}
		});
	}
}

export default AssetsDetectionController;
