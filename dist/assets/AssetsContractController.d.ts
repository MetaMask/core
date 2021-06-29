import { BN } from 'ethereumjs-util';
import BaseController, { BaseConfig, BaseState } from '../BaseController';
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
 * @type BalanceMap
 *
 * Key value object containing the balance for each tokenAddress
 *
 * @property [tokenAddress] - Address of the token
 */
export interface BalanceMap {
    [tokenAddress: string]: BN;
}
/**
 * Controller that interacts with contracts on mainnet through web3
 */
export declare class AssetsContractController extends BaseController<AssetsContractConfig, BaseState> {
    private web3;
    /**
     *
     * Query if a contract implements an interface
     *
     * @param address - Asset contract address
     * @param interfaceId - Interface identifier
     * @returns - Promise resolving to whether the contract implements `interfaceID`
     */
    private contractSupportsInterface;
    /**
     * Name of this controller used during composition
     */
    name: string;
    /**
     * Creates a AssetsContractController instance
     *
     * @param config - Initial options used to configure this controller
     * @param state - Initial state to set on this controller
     */
    constructor(config?: Partial<AssetsContractConfig>, state?: Partial<BaseState>);
    /**
     * Sets a new provider
     *
     * TODO: Replace this wth a method
     *
     * @property provider - Provider used to create a new underlying Web3 instance
     */
    set provider(provider: any);
    get provider(): any;
    /**
     * Query if contract implements ERC721Metadata interface
     *
     * @param address - ERC721 asset contract address
     * @returns - Promise resolving to whether the contract implements ERC721Metadata interface
     */
    contractSupportsMetadataInterface(address: string): Promise<boolean>;
    /**
     * Query if contract implements ERC721Enumerable interface
     *
     * @param address - ERC721 asset contract address
     * @returns - Promise resolving to whether the contract implements ERC721Enumerable interface
     */
    contractSupportsEnumerableInterface(address: string): Promise<boolean>;
    /**
     * Get balance or count for current account on specific asset contract
     *
     * @param address - Asset contract address
     * @param selectedAddress - Current account public address
     * @returns - Promise resolving to BN object containing balance for current account on specific asset contract
     */
    getBalanceOf(address: string, selectedAddress: string): Promise<BN>;
    /**
     * Enumerate assets assigned to an owner
     *
     * @param address - ERC721 asset contract address
     * @param selectedAddress - Current account public address
     * @param index - A collectible counter less than `balanceOf(selectedAddress)`
     * @returns - Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'
     */
    getCollectibleTokenId(address: string, selectedAddress: string, index: number): Promise<number>;
    /**
     * Query for tokenURI for a given asset
     *
     * @param address - ERC721 asset contract address
     * @param tokenId - ERC721 asset identifier
     * @returns - Promise resolving to the 'tokenURI'
     */
    getCollectibleTokenURI(address: string, tokenId: number): Promise<string>;
    /**
     * Query for name for a given ERC20 asset
     *
     * @param address - ERC20 asset contract address
     * @returns - Promise resolving to the 'decimals'
     */
    getTokenDecimals(address: string): Promise<string>;
    /**
     * Query for name for a given asset
     *
     * @param address - ERC721 or ERC20 asset contract address
     * @returns - Promise resolving to the 'name'
     */
    getAssetName(address: string): Promise<string>;
    /**
     * Query for symbol for a given asset
     *
     * @param address - ERC721 or ERC20 asset contract address
     * @returns - Promise resolving to the 'symbol'
     */
    getAssetSymbol(address: string): Promise<string>;
    /**
     * Query for owner for a given ERC721 asset
     *
     * @param address - ERC721 asset contract address
     * @param tokenId - ERC721 asset identifier
     * @returns - Promise resolving to the owner address
     */
    getOwnerOf(address: string, tokenId: number): Promise<string>;
    /**
     * Returns contract instance of
     *
     * @returns - Promise resolving to the 'tokenURI'
     */
    getBalancesInSingleCall(selectedAddress: string, tokensToDetect: string[]): Promise<BalanceMap>;
}
export default AssetsContractController;
