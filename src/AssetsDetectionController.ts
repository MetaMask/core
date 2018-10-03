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
	 * Get user information API for collectibles based on API
	 *
	 * @param contractAddress - ERC721 asset contract address
	 */
	private getCollectibleUserApi(contractAddress: string) {
		const selectedAddress = this.config.selectedAddress;
		const contract = contractMap[contractAddress];
		const collectibleUserApi = contract.api + contract.owner_api + selectedAddress;
		return collectibleUserApi;
	}

	/**
	 * Gets balance or count for current account on specific asset contract
	 *
	 * @param contractAddress - Asset contract address
	 * @returns - Balance for current account on specific asset contract
	 */
	private async contractBalanceOf(contractAddress: string): Promise<number> {
		if (!this.web3) {
			return 0;
		}
		const contract = this.web3.eth.contract(abiERC20).at(contractAddress);
		const selectedAddress = this.config.selectedAddress;
		try {
			const balance = (await new Promise((resolve, reject) => {
				contract.balanceOf(selectedAddress, (error: Error, result: any) => {
					/* istanbul ignore next */
					if (error) {
						reject(error);
						return;
					}
					resolve(result);
				});
			})) as any;
			return balance.toNumber();
		} catch (error) {
			return 0;
		}
	}

	/**
	 *
	 * Query if a contract implements an interface
	 *
	 * @param contractAddress - Asset contract address
	 * @param interfaceId - Interface identifier
	 * @returns - If the contract implements `interfaceID`
	 */
	private async contractSupportsInterface(contractAddress: string, interfaceId: string): Promise<boolean> {
		if (!this.web3) {
			return false;
		}
		try {
			const contract = this.web3.eth.contract(abiERC721).at(contractAddress);
			const supports = await new Promise<boolean>((resolve, reject) => {
				contract.supportsInterface(interfaceId, (error: Error, result: any) => {
					/* istanbul ignore next */
					if (error) {
						reject(error);
						return;
					}
					resolve(result);
				});
			});
			return supports;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Enumerate assets assigned to an owner
	 *
	 * @param contractAddress - ERC721 asset contract address
	 * @param index - A counter less than `balanceOf(owner)`
	 * @returns - Token identifier for the 'index'th asset assigned to 'contractAddress'
	 */
	private getCollectibleTokenId(contractAddress: string, index: number): Promise<number> {
		const contract = this.web3.eth.contract(abiERC721).at(contractAddress);
		const selectedAddress = this.config.selectedAddress;
		return new Promise<number>((resolve, reject) => {
			contract.tokenOfOwnerByIndex(selectedAddress, index, (error: Error, result: any) => {
				/* istanbul ignore next */
				if (error) {
					reject(error);
					return;
				}
				resolve(result.toNumber());
			});
		});
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
	 * Triggers asset ERC20 token auto detection for each contract address on contract metadata
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
	 * Detect if current account has balance on ERC20 asset contract. I
	 * If that is the case, it adds the token to state
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
	 * Triggers asset ERC721 token auto detection for each contract address on contract metadata
	 *
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
	 * Query for a URI for a given asset
	 *
	 * @param contractAddress - ERC721 asset contract address
	 * @param tokenId - ERC721 asset identifier
	 * @returns - Promise resolving to the 'tokenURI'
	 */
	async getCollectibleTokenURI(contractAddress: string, tokenId: number): Promise<string> {
		if (!this.web3) {
			return '';
		}
		try {
			const contract = this.web3.eth.contract(abiERC721).at(contractAddress);
			const supports = await this.contractSupportsInterface(contractAddress, ERC721METADATA_INTERFACE_ID);
			if (supports) {
				const URI = (await new Promise<string>((resolve, reject) => {
					contract.tokenURI(tokenId, (error: Error, result: any) => {
						/* istanbul ignore next */
						if (error) {
							reject(error);
							return;
						}
						resolve(result);
					});
				})) as string;
				return URI;
			}
			return '';
		} catch (error) {
			return '';
		}
	}

	/**
	 * Detect collectibles owned by current account
	 *
	 * @param contractAddress - ERC721 asset contract address
	 */
	async detectCollectibleOwnership(contractAddress: string) {
		const supportsEnumerable = await this.contractSupportsInterface(contractAddress, ERC721ENUMERABLE_INTERFACE_ID);
		if (supportsEnumerable) {
			const balance = await this.contractBalanceOf(contractAddress);
			if (balance !== 0) {
				const assetsController = this.context.AssetsController as AssetsController;
				const indexes: number[] = Array.from(new Array(balance), (_, index) => index);
				const promises = indexes.map((index) => {
					return this.getCollectibleTokenId(contractAddress, index);
				});
				const tokenIds = await Promise.all(promises);
				for (const tokenId in tokenIds) {
					await assetsController.addCollectible(contractAddress, tokenIds[tokenId]);
				}
			}
		} else if (contractMap[contractAddress].api) {
			await this.fetchUserCollectibles(contractAddress);
		}
	}

	/**
	 * Fetch collectible basic information, name and image url from API provided in contract metadata
	 *
	 * @param contractAddress - ERC721 asset contract address
	 */
	private async fetchUserCollectibles(contractAddress: string) {
		try {
			const assetsController = this.context.AssetsController as AssetsController;
			const contract = contractMap[contractAddress];
			const collectibleUserApi = this.getCollectibleUserApi(contractAddress);
			const response = await fetch(collectibleUserApi);
			const json = await response.json();
			const collectiblesJson = json[contract.collectibles_entry];
			for (const key in collectiblesJson) {
				const collectibleEntry: CollectibleEntry = collectiblesJson[key];
				await assetsController.addCollectible(contractAddress, collectibleEntry.id);
			}
		} catch (error) {
			/* istanbul ignore next */
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
