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
const ERC20EIP = '20';
const ERC721EIP = '721';

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
	 * @property provider - Provider used to create a new underlying EthQuery instance
	 */
	set provider(provider: any) {
		this.web3 = new Web3(provider);
	}

	/**
	 * Gets balance or count for current account on specific asset contract, defaults to ERC20
	 *
	 * @param contractAddress - Asset contract address
	 * @param EIP - Asset EIP identifier
	 * @returns - Balance for current account on specific asset contract
	 */
	private async detectContractBalance(contractAddress: string, EIP?: string): Promise<number> {
		if (!this.web3) {
			return 0;
		}
		let abi;
		switch (EIP) {
			case ERC721EIP:
				abi = abiERC721;
			default:
				abi = abiERC20;
		}
		const contract = this.web3.eth.contract(abi).at(contractAddress);
		const selectedAddress = this.config.selectedAddress;
		try {
			const bigNumber = (await new Promise((resolve, reject) => {
				contract.balanceOf(selectedAddress, (error: Error, result: any) => {
					/* istanbul ignore next */
					if (error) {
						reject(error);
						return;
					}
					resolve(result);
				});
			})) as any;
			const balance = bigNumber.toNumber();
			return balance;
		} catch (error) {
			return 0;
		}
	}

	/**
	 *
	 * Query if a contract implements an interface
	 *
	 * @param interfaceId - Interface identifier
	 * @param contractAddress - Asset contract address
	 * @returns - If the contract implements `interfaceID`
	 */
	private async contractSupportsInterface(interfaceId: string, contractAddress: string): Promise<boolean> {
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
			/* Ignoring errors, waiting for */
			/* https://github.com/ethereum/web3.js/issues/1119 */
			/* istanbul ignore next */
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
		return new Promise<any>((resolve, reject) => {
			contract.tokenOfOwnerByIndex(selectedAddress, index, (error: Error, result: any) => {
				/* istanbul ignore next */
				if (error) {
					reject(error);
					return;
				}
				const tokenId = result.toNumber();
				resolve(tokenId);
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
		const balance = await this.detectContractBalance(contractAddress, ERC20EIP);
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
			const supports = await this.contractSupportsInterface(ERC721METADATA_INTERFACE_ID, contractAddress);
			if (supports) {
				const URI = await new Promise<string>((resolve, reject) => {
					contract.tokenURI(tokenId, (error: Error, result: any) => {
						/* istanbul ignore next */
						if (error) {
							reject(error);
							return;
						}
						resolve(result);
					});
				});
				if (URI) {
					return URI;
				}
			}
			return '';
		} catch (error) {
			/* Ignoring errors, waiting for */
			/* https://github.com/ethereum/web3.js/issues/1119 */
			/* istanbul ignore next */
			return '';
		}
	}

	/**
	 * Detect collectibles owned by current account
	 *
	 * @param contractAddress - ERC721 asset contract address
	 */
	async detectCollectibleOwnership(contractAddress: string) {
		const supportsEnumerable = await this.contractSupportsInterface(ERC721ENUMERABLE_INTERFACE_ID, contractAddress);
		if (supportsEnumerable) {
			const balance = await this.detectContractBalance(contractAddress, ERC721EIP);
			console.log('detectContractBalance', balance);
			if (balance !== 0) {
				const assetsController = this.context.AssetsController as AssetsController;
				const bal = balance > 10 ? 10 : balance;
				const indexes: number[] = Array.from(Array(bal).keys());
				const promises = indexes.map((index) => {
					return this.getCollectibleTokenId(contractAddress, index);
				});
				const tokenIds = await Promise.all(promises);
				let tokenId: any;
				for (tokenId in tokenIds) {
					await assetsController.addCollectible(contractAddress, tokenIds[tokenId]);
				}
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
