import { BN } from 'ethereumjs-util';
import { BaseController, BaseConfig, BaseState } from '../BaseController';
/**
 * @type AssetsContractConfig
 *
 * Assets Contract controller configuration
 * @property provider - Provider used to create a new web3 instance
 */
export interface AssetsContractConfig extends BaseConfig {
    provider: any;
}
/**
 * @type BalanceMap
 *
 * Key value object containing the balance for each tokenAddress
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
    private erc721Standard;
    private erc1155Standard;
    /**
     * Name of this controller used during composition
     */
    name: string;
    /**
     * Creates a AssetsContractController instance.
     *
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor(config?: Partial<AssetsContractConfig>, state?: Partial<BaseState>);
    /**
     * Sets a new provider.
     *
     * TODO: Replace this wth a method.
     *
     * @property provider - Provider used to create a new underlying Web3 instance
     */
    set provider(provider: any);
    get provider(): any;
    /**
     * Get balance or count for current account on specific asset contract.
     *
     * @param address - Asset ERC20 contract address.
     * @param selectedAddress - Current account public address.
     * @returns Promise resolving to BN object containing balance for current account on specific asset contract.
     */
    getBalanceOf(address: string, selectedAddress: string): Promise<BN>;
    /**
     * Query for name for a given ERC20 asset.
     *
     * @param address - ERC20 asset contract address.
     * @returns Promise resolving to the 'decimals'.
     */
    getTokenDecimals(address: string): Promise<string>;
    /**
     * Enumerate assets assigned to an owner.
     *
     * @param address - ERC721 asset contract address.
     * @param selectedAddress - Current account public address.
     * @param index - A collectible counter less than `balanceOf(selectedAddress)`.
     * @returns Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'.
     */
    getCollectibleTokenId(address: string, selectedAddress: string, index: number): Promise<string>;
    /**
     * Query for tokenURI for a given asset.
     *
     * @param address - ERC721 asset contract address.
     * @param tokenId - ERC721 asset identifier.
     * @returns Promise resolving to the 'tokenURI'.
     */
    getCollectibleTokenURI(address: string, tokenId: string): Promise<string>;
    /**
     * Query for name for a given asset.
     *
     * @param address - ERC721 or ERC20 asset contract address.
     * @returns Promise resolving to the 'name'.
     */
    getAssetName(address: string): Promise<string>;
    /**
     * Query for symbol for a given asset.
     *
     * @param address - ERC721 or ERC20 asset contract address.
     * @returns Promise resolving to the 'symbol'.
     */
    getAssetSymbol(address: string): Promise<string>;
    /**
     * Query for owner for a given ERC721 asset.
     *
     * @param address - ERC721 asset contract address.
     * @param tokenId - ERC721 asset identifier.
     * @returns Promise resolving to the owner address.
     */
    getOwnerOf(address: string, tokenId: string): Promise<string>;
    /**
     * Query for tokenURI for a given asset.
     *
     * @param address - ERC1155 asset contract address.
     * @param tokenId - ERC1155 asset identifier.
     * @returns Promise resolving to the 'tokenURI'.
     */
    uriERC1155Collectible(address: string, tokenId: string): Promise<string>;
    /**
     * Query for balance of a given ERC 1155 token.
     *
     * @param userAddress - Wallet public address.
     * @param collectibleAddress - ERC1155 asset contract address.
     * @param collectibleId - ERC1155 asset identifier.
     * @returns Promise resolving to the 'balanceOf'.
     */
    balanceOfERC1155Collectible(userAddress: string, collectibleAddress: string, collectibleId: string): Promise<number>;
    /**
     * Transfer single ERC1155 token.
     *
     * @param collectibleAddress - ERC1155 token address.
     * @param senderAddress - ERC1155 token sender.
     * @param recipientAddress - ERC1155 token recipient.
     * @param collectibleId - ERC1155 token id.
     * @param qty - Quantity of tokens to be sent.
     * @returns Promise resolving to the 'transferSingle' ERC1155 token.
     */
    transferSingleERC1155Collectible(collectibleAddress: string, senderAddress: string, recipientAddress: string, collectibleId: string, qty: string): Promise<void>;
    /**
     * Get the token balance for a list of token addresses in a single call. Only non-zero balances
     * are returned.
     *
     * @param selectedAddress - The address to check token balances for.
     * @param tokensToDetect - The token addresses to detect balances for.
     * @returns The list of non-zero token balances.
     */
    getBalancesInSingleCall(selectedAddress: string, tokensToDetect: string[]): Promise<BalanceMap>;
}
export default AssetsContractController;
