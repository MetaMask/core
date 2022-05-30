/// <reference types="bn.js" />
import { BN } from 'ethereumjs-util';
import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type { PreferencesState } from '../user/PreferencesController';
import { NetworkState } from '../network/NetworkController';
/**
 * Check if token detection is enabled for certain networks
 *
 * @param chainId - ChainID of network
 * @returns Whether the current network supports token detection
 */
export declare const SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID: Record<string, string>;
export declare const MISSING_PROVIDER_ERROR = "AssetsContractController failed to set the provider correctly. A provider must be set for this method to be available";
/**
 * @type AssetsContractConfig
 *
 * Assets Contract controller configuration
 * @property provider - Provider used to create a new web3 instance
 */
export interface AssetsContractConfig extends BaseConfig {
    provider: any;
    ipfsGateway: string;
    chainId: string;
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
    private erc721Standard?;
    private erc1155Standard?;
    private erc20Standard?;
    /**
     * Name of this controller used during composition
     */
    name: string;
    /**
     * Creates a AssetsContractController instance.
     *
     * @param options - The controller options.
     * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ onPreferencesStateChange, onNetworkStateChange, }: {
        onPreferencesStateChange: (listener: (preferencesState: PreferencesState) => void) => void;
        onNetworkStateChange: (listener: (networkState: NetworkState) => void) => void;
    }, config?: Partial<AssetsContractConfig>, state?: Partial<BaseState>);
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
    getERC20BalanceOf(address: string, selectedAddress: string): Promise<BN>;
    /**
     * Query for the decimals for a given ERC20 asset.
     *
     * @param address - ERC20 asset contract address.
     * @returns Promise resolving to the 'decimals'.
     */
    getERC20TokenDecimals(address: string): Promise<string>;
    /**
     * Enumerate assets assigned to an owner.
     *
     * @param address - ERC721 asset contract address.
     * @param selectedAddress - Current account public address.
     * @param index - A collectible counter less than `balanceOf(selectedAddress)`.
     * @returns Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'.
     */
    getERC721CollectibleTokenId(address: string, selectedAddress: string, index: number): Promise<string>;
    /**
     * Enumerate assets assigned to an owner.
     *
     * @param tokenAddress - ERC721 asset contract address.
     * @param userAddress - Current account public address.
     * @param tokenId - ERC721 asset identifier.
     * @returns Promise resolving to an object containing the token standard and a set of details which depend on which standard the token supports.
     */
    getTokenStandardAndDetails(tokenAddress: string, userAddress?: string, tokenId?: string): Promise<{
        standard: string;
        tokenURI?: string | undefined;
        symbol?: string | undefined;
        name?: string | undefined;
        decimals?: string | undefined;
        balance?: BN | undefined;
    }>;
    /**
     * Query for tokenURI for a given ERC721 asset.
     *
     * @param address - ERC721 asset contract address.
     * @param tokenId - ERC721 asset identifier.
     * @returns Promise resolving to the 'tokenURI'.
     */
    getERC721TokenURI(address: string, tokenId: string): Promise<string>;
    /**
     * Query for name for a given asset.
     *
     * @param address - ERC721 or ERC20 asset contract address.
     * @returns Promise resolving to the 'name'.
     */
    getERC721AssetName(address: string): Promise<string>;
    /**
     * Query for symbol for a given asset.
     *
     * @param address - ERC721 or ERC20 asset contract address.
     * @returns Promise resolving to the 'symbol'.
     */
    getERC721AssetSymbol(address: string): Promise<string>;
    /**
     * Query for owner for a given ERC721 asset.
     *
     * @param address - ERC721 asset contract address.
     * @param tokenId - ERC721 asset identifier.
     * @returns Promise resolving to the owner address.
     */
    getERC721OwnerOf(address: string, tokenId: string): Promise<string>;
    /**
     * Query for tokenURI for a given asset.
     *
     * @param address - ERC1155 asset contract address.
     * @param tokenId - ERC1155 asset identifier.
     * @returns Promise resolving to the 'tokenURI'.
     */
    getERC1155TokenURI(address: string, tokenId: string): Promise<string>;
    /**
     * Query for balance of a given ERC 1155 token.
     *
     * @param userAddress - Wallet public address.
     * @param collectibleAddress - ERC1155 asset contract address.
     * @param collectibleId - ERC1155 asset identifier.
     * @returns Promise resolving to the 'balanceOf'.
     */
    getERC1155BalanceOf(userAddress: string, collectibleAddress: string, collectibleId: string): Promise<number>;
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
    transferSingleERC1155(collectibleAddress: string, senderAddress: string, recipientAddress: string, collectibleId: string, qty: string): Promise<void>;
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
