import 'isomorphic-fetch';
import BaseController, { BaseConfig, BaseState } from './BaseController';

const BN = require('ethereumjs-util').BN;
const Web3 = require('web3');
const abiERC20 = require('human-standard-token-abi');
const abiERC721 = require('human-standard-collectible-abi');
const ERC721METADATA_INTERFACE_ID = '0x5b5e139f';
const ERC721ENUMERABLE_INTERFACE_ID = '0x780e9d63';

/**
 * @type AssetsContractConfig
 *
 * Assets Contract controller configuration
 *
 * @property provider - Provider used to create a new web3 instance
 */
export interface AssetsContractConfig extends BaseConfig {
	provider: any;
}

/**
 * Controller that interacts with contracts on mainnet through web3
 */
export class AssetsContractController extends BaseController<AssetsContractConfig, BaseState> {
	private web3: any;

	/**
	 *
	 * Query if a contract implements an interface
	 *
	 * @param address - Asset contract address
	 * @param interfaceId - Interface identifier
	 * @returns - Promise resolving to whether the contract implements `interfaceID`
	 */
	private async contractSupportsInterface(address: string, interfaceId: string): Promise<boolean> {
		const contract = this.web3.eth.contract(abiERC721).at(address);
		return new Promise<boolean>((resolve, reject) => {
			contract.supportsInterface(interfaceId, (error: Error, result: boolean) => {
				/* istanbul ignore if */
				if (error) {
					reject(error);
					return;
				}
				resolve(result);
			});
		});
	}

	/**
	 * Name of this controller used during composition
	 */
	name = 'AssetsContractController';

	/**
	 * Creates a AssetsContractController instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<AssetsContractConfig>, state?: Partial<BaseState>) {
		super(config, state);
		this.defaultConfig = {
			provider: undefined
		};
		this.initialize();
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
	 * Query if contract implements ERC721Metadata interface
	 *
	 * @param address - ERC721 asset contract address
	 * @returns - Promise resolving to whether the contract implements ERC721Metadata interface
	 */
	async contractSupportsMetadataInterface(address: string): Promise<boolean> {
		return this.contractSupportsInterface(address, ERC721METADATA_INTERFACE_ID);
	}

	/**
	 * Query if contract implements ERC721Enumerable interface
	 *
	 * @param address - ERC721 asset contract address
	 * @returns - Promise resolving to whether the contract implements ERC721Enumerable interface
	 */
	async contractSupportsEnumerableInterface(address: string): Promise<boolean> {
		return this.contractSupportsInterface(address, ERC721ENUMERABLE_INTERFACE_ID);
	}

	/**
	 * Get balance or count for current account on specific asset contract
	 *
	 * @param address - Asset contract address
	 * @param selectedAddress - Current account public address
	 * @returns - Promise resolving to balance for current account on specific asset contract
	 */
	async getBalanceOf(address: string, selectedAddress: string): Promise<typeof BN> {
		const contract = this.web3.eth.contract(abiERC20).at(address);
		return new Promise<typeof BN>((resolve, reject) => {
			contract.balanceOf(selectedAddress, (error: Error, result: typeof BN) => {
				/* istanbul ignore if */
				if (error) {
					reject(error);
					return;
				}
				resolve(result);
			});
		});
	}

	/**
	 * Enumerate assets assigned to an owner
	 *
	 * @param address - ERC721 asset contract address
	 * @param selectedAddress - Current account public address
	 * @param index - A collectible counter less than `balanceOf(selectedAddress)`
	 * @returns - Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'
	 */
	getCollectibleTokenId(address: string, selectedAddress: string, index: number): Promise<number> {
		const contract = this.web3.eth.contract(abiERC721).at(address);
		return new Promise<number>((resolve, reject) => {
			contract.tokenOfOwnerByIndex(selectedAddress, index, (error: Error, result: typeof BN) => {
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
	 * Query for tokenURI for a given asset
	 *
	 * @param address - ERC721 asset contract address
	 * @param tokenId - ERC721 asset identifier
	 * @returns - Promise resolving to the 'tokenURI'
	 */
	async getCollectibleTokenURI(address: string, tokenId: number): Promise<string> {
		const contract = this.web3.eth.contract(abiERC721).at(address);
		return new Promise<string>((resolve, reject) => {
			contract.tokenURI(tokenId, (error: Error, result: string) => {
				/* istanbul ignore if */
				if (error) {
					reject(error);
					return;
				}
				resolve(result);
			});
		});
	}
}

export default AssetsContractController;
