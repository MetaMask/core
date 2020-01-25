import { ethers, utils } from 'ethers';
import BaseController, { BaseConfig, BaseState } from '../BaseController';

const BN = require('ethereumjs-util').BN;
const abiERC20 = require('human-standard-token-abi');
const abiERC721 = require('human-standard-collectible-abi');
const abiSingleCallBalancesContract = require('single-call-balance-checker-abi');
const ERC721METADATA_INTERFACE_ID = '0x5b5e139f';
const ERC721ENUMERABLE_INTERFACE_ID = '0x780e9d63';
const SINGLE_CALL_BALANCES_ADDRESS = '0xb1f8e55c7f64d203c1400b9d8555d050f94adf39';

/**
 * @type AssetsContractConfig
 *
 * Assets Contract controller configuration
 *
 * @property provider - Provider instance
 */
export interface AssetsContractConfig extends BaseConfig {
	provider: any;
}

/**
 * Key value object containing the balance for each tokenAddress
 */
export interface BalanceMap {
	[tokenAddress: string]: typeof BN;
}

/**
 * Controller that interacts with contracts on mainnet
 */
export class AssetsContractController extends BaseController<AssetsContractConfig, BaseState> {
	private _web3Provider?: ethers.providers.Web3Provider;

	/**
	 *
	 * Query if a contract implements an interface
	 *
	 * @param address - Asset contract address
	 * @param interfaceId - Interface identifier
	 * @returns - Promise resolving to whether the contract implements `interfaceID`
	 */
	private async contractSupportsInterface(address: string, interfaceId: string): Promise<boolean> {
		const contract = new ethers.Contract(address, abiERC721, this._web3Provider!);
		return await contract.supportsInterface(interfaceId);
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
	 * @property provider - Provider instance
	 */
	set provider(provider: any) {
		this._web3Provider = new ethers.providers.Web3Provider(provider);
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
	 * @returns - Promise resolving to BN object containing balance for current account on specific asset contract
	 */
	async getBalanceOf(address: string, selectedAddress: string): Promise<typeof BN> {
		const contract = new ethers.Contract(address, abiERC20, this._web3Provider!);
		return await contract.balanceOf(selectedAddress);
	}

	/**
	 * Enumerate assets assigned to an owner
	 *
	 * @param address - ERC721 asset contract address
	 * @param selectedAddress - Current account public address
	 * @param index - A collectible counter less than `balanceOf(selectedAddress)`
	 * @returns - Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'
	 */
	async getCollectibleTokenId(address: string, selectedAddress: string, index: number): Promise<number> {
		const contract = new ethers.Contract(address, abiERC721, this._web3Provider!);
		const result = await contract.tokenOfOwnerByIndex(selectedAddress, index);
		return utils.bigNumberify(result).toNumber();
	}

	/**
	 * Query for tokenURI for a given asset
	 *
	 * @param address - ERC721 asset contract address
	 * @param tokenId - ERC721 asset identifier
	 * @returns - Promise resolving to the 'tokenURI'
	 */
	async getCollectibleTokenURI(address: string, tokenId: number): Promise<string> {
		const contract = new ethers.Contract(address, abiERC721, this._web3Provider!);
		return await contract.tokenURI(tokenId);
	}

	/**
	 * Query for name for a given ERC20 asset
	 *
	 * @param address - ERC20 asset contract address
	 * @returns - Promise resolving to the 'decimals'
	 */
	async getTokenDecimals(address: string): Promise<string> {
		const contract = new ethers.Contract(address, abiERC20, this._web3Provider!);
		return await contract.decimals();
	}

	/**
	 * Query for name for a given asset
	 *
	 * @param address - ERC721 or ERC20 asset contract address
	 * @returns - Promise resolving to the 'name'
	 */
	async getAssetName(address: string): Promise<string> {
		const contract = new ethers.Contract(address, abiERC721, this._web3Provider!);
		return await contract.name();
	}

	/**
	 * Query for symbol for a given asset
	 *
	 * @param address - ERC721 or ERC20 asset contract address
	 * @returns - Promise resolving to the 'symbol'
	 */
	async getAssetSymbol(address: string): Promise<string> {
		const contract = new ethers.Contract(address, abiERC721, this._web3Provider!);
		return await contract.symbol();
	}

	/**
	 * Query for owner for a given ERC721 asset
	 *
	 * @param address - ERC721 asset contract address
	 * @param tokenId - ERC721 asset identifier
	 * @returns - Promise resolving to the owner address
	 */
	async getOwnerOf(address: string, tokenId: number): Promise<string> {
		const contract = new ethers.Contract(address, abiERC721, this._web3Provider!);
		return await contract.ownerOf(tokenId);
	}

	/**
	 * Returns contract instance of
	 *
	 * @returns - Promise resolving to the 'tokenURI'
	 */
	async getBalancesInSingleCall(selectedAddress: string, tokensToDetect: string[]): Promise<BalanceMap> {
		const contract = new ethers.Contract(
			SINGLE_CALL_BALANCES_ADDRESS,
			abiSingleCallBalancesContract,
			this._web3Provider!
		);
		const result: any[] = await contract.balances([selectedAddress], tokensToDetect);

		const nonZeroBalances: BalanceMap = {};
		/* istanbul ignore else */
		if (result.length > 0) {
			tokensToDetect.forEach((tokenAddress, index) => {
				const balance: utils.BigNumber = utils.bigNumberify(result[index]);
				/* istanbul ignore else */
				if (!balance.isZero()) {
					nonZeroBalances[tokenAddress] = new BN(balance.toString(), 10);
				}
			});
		}

		return nonZeroBalances;
	}
}

export default AssetsContractController;
