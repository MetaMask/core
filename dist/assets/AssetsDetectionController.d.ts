import BaseController, { BaseConfig, BaseState } from '../BaseController';
import type { NetworkState, NetworkType } from '../network/NetworkController';
import type { PreferencesState } from '../user/PreferencesController';
import type { AssetsController, AssetsState } from './AssetsController';
import type { AssetsContractController } from './AssetsContractController';
import { Token } from './TokenRatesController';
import { TokenListState } from './TokenListController';
/**
 * @type ApiCollectible
 *
 * Collectible object coming from OpenSea api
 *
 * @property token_id - The collectible identifier
 * @property num_sales - Number of sales
 * @property background_color - The background color to be displayed with the item
 * @property image_url - URI of an image associated with this collectible
 * @property image_preview_url - URI of a smaller image associated with this collectible
 * @property image_thumbnail_url - URI of a thumbnail image associated with this collectible
 * @property image_original_url - URI of the original image associated with this collectible
 * @property animation_url - URI of a animation associated with this collectible
 * @property animation_original_url - URI of the original animation associated with this collectible
 * @property name - The collectible name
 * @property description - The collectible description
 * @property external_link - External link containing additional information
 * @property assetContract - The collectible contract information object
 * @property creator - The collectible owner information object
 * @property lastSale - When this item was last sold
 */
export interface ApiCollectible {
    token_id: string;
    num_sales: number | null;
    background_color: string | null;
    image_url: string | null;
    image_preview_url: string | null;
    image_thumbnail_url: string | null;
    image_original_url: string | null;
    animation_url: string | null;
    animation_original_url: string | null;
    name: string | null;
    description: string | null;
    external_link: string | null;
    asset_contract: ApiCollectibleContract;
    creator: ApiCollectibleCreator;
    last_sale: ApiCollectibleLastSale | null;
}
/**
 * @type ApiCollectibleContract
 *
 * Collectible contract object coming from OpenSea api
 *
 * @property address - Address of the collectible contract
 * @property asset_contract_type - The collectible type, it could be `semi-fungible` or `non-fungible`
 * @property created_date - Creation date
 * @property name - The collectible contract name
 * @property schema_name - The schema followed by the contract, it could be `ERC721` or `ERC1155`
 * @property symbol - The collectible contract symbol
 * @property total_supply - Total supply of collectibles
 * @property description - The collectible contract description
 * @property external_link - External link containing additional information
 * @property image_url - URI of an image associated with this collectible contract
 */
export interface ApiCollectibleContract {
    address: string;
    asset_contract_type: string | null;
    created_date: string | null;
    name: string | null;
    schema_name: string | null;
    symbol: string | null;
    total_supply: string | null;
    description: string | null;
    external_link: string | null;
    image_url: string | null;
}
/**
 * @type ApiCollectibleLastSale
 *
 * Collectible sale object coming from OpenSea api
 *
 * @property event_timestamp - Object containing a `username`
 * @property total_price - URI of collectible image associated with this owner
 * @property transaction - Object containing transaction_hash and block_hash
 */
export interface ApiCollectibleLastSale {
    event_timestamp: string;
    total_price: string;
    transaction: {
        transaction_hash: string;
        block_hash: string;
    };
}
/**
 * @type ApiCollectibleCreator
 *
 * Collectible creator object coming from OpenSea api
 *
 * @property user - Object containing a `username`
 * @property profile_img_url - URI of collectible image associated with this owner
 * @property address - The owner address
 */
export interface ApiCollectibleCreator {
    user: {
        username: string;
    };
    profile_img_url: string;
    address: string;
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
export declare class AssetsDetectionController extends BaseController<AssetsDetectionConfig, BaseState> {
    private handle?;
    private getOwnerCollectiblesApi;
    private getOwnerCollectibles;
    /**
     * Name of this controller used during composition
     */
    name: string;
    private getOpenSeaApiKey;
    private getBalancesInSingleCall;
    private addTokens;
    private addCollectible;
    private getAssetsState;
    private getTokenListState;
    /**
     * Creates a AssetsDetectionController instance
     *
     * @param options
     * @param options.onAssetsStateChange - Allows subscribing to assets controller state changes
     * @param options.onPreferencesStateChange - Allows subscribing to preferences controller state changes
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes
     * @param options.getOpenSeaApiKey - Gets the OpenSea API key, if one is set
     * @param options.getBalancesInSingleCall - Gets the balances of a list of tokens for the given address
     * @param options.addTokens - Add a list of tokens
     * @param options.addCollectible - Add a collectible
     * @param options.getAssetsState - Gets the current state of the Assets controller
     * @param config - Initial options used to configure this controller
     * @param state - Initial state to set on this controller
     */
    constructor({ onAssetsStateChange, onPreferencesStateChange, onNetworkStateChange, getOpenSeaApiKey, getBalancesInSingleCall, addTokens, addCollectible, getAssetsState, getTokenListState, }: {
        onAssetsStateChange: (listener: (assetsState: AssetsState) => void) => void;
        onPreferencesStateChange: (listener: (preferencesState: PreferencesState) => void) => void;
        onNetworkStateChange: (listener: (networkState: NetworkState) => void) => void;
        getOpenSeaApiKey: () => string | undefined;
        getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];
        addTokens: AssetsController['addTokens'];
        addCollectible: AssetsController['addCollectible'];
        getAssetsState: () => AssetsState;
        getTokenListState: () => TokenListState;
    }, config?: Partial<AssetsDetectionConfig>, state?: Partial<BaseState>);
    /**
     * Starts a new polling interval
     *
     * @param interval - Polling interval used to auto detect assets
     */
    poll(interval?: number): Promise<void>;
    /**
     * Checks whether network is mainnet or not
     *
     * @returns - Whether current network is mainnet
     */
    isMainnet(): boolean;
    /**
     * Detect assets owned by current account on mainnet
     */
    detectAssets(): Promise<void>;
    /**
     * Triggers asset ERC20 token auto detection for each contract address in contract metadata on mainnet
     */
    detectTokens(): Promise<void>;
    /**
     * Triggers asset ERC721 token auto detection on mainnet
     * adding new collectibles and removing not owned collectibles
     */
    detectCollectibles(): Promise<void>;
}
export default AssetsDetectionController;
