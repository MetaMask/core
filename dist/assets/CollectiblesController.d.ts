/// <reference types="node" />
import { EventEmitter } from 'events';
import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type { PreferencesState } from '../user/PreferencesController';
import type { NetworkState, NetworkType } from '../network/NetworkController';
import type { ApiCollectibleCreator, ApiCollectibleLastSale } from './CollectibleDetectionController';
import type { AssetsContractController } from './AssetsContractController';
/**
 * @type Collectible
 *
 * Collectible representation
 * @property address - Hex address of a ERC721 contract
 * @property description - The collectible description
 * @property image - URI of custom collectible image associated with this tokenId
 * @property name - Name associated with this tokenId and contract address
 * @property tokenId - The collectible identifier
 * @property numberOfSales - Number of sales
 * @property backgroundColor - The background color to be displayed with the item
 * @property imagePreview - URI of a smaller image associated with this collectible
 * @property imageThumbnail - URI of a thumbnail image associated with this collectible
 * @property imageOriginal - URI of the original image associated with this collectible
 * @property animation - URI of a animation associated with this collectible
 * @property animationOriginal - URI of the original animation associated with this collectible
 * @property externalLink - External link containing additional information
 * @property creator - The collectible owner information object
 * @property isCurrentlyOwned - Boolean indicating whether the address/chainId combination where it's currently stored currently owns this collectible
 */
export interface Collectible extends CollectibleMetadata {
    tokenId: string;
    address: string;
    isCurrentlyOwned?: boolean;
}
/**
 * @type CollectibleContract
 *
 * Collectible contract information representation
 * @property name - Contract name
 * @property logo - Contract logo
 * @property address - Contract address
 * @property symbol - Contract symbol
 * @property description - Contract description
 * @property totalSupply - Total supply of collectibles
 * @property assetContractType - The collectible type, it could be `semi-fungible` or `non-fungible`
 * @property createdDate - Creation date
 * @property schemaName - The schema followed by the contract, it could be `ERC721` or `ERC1155`
 * @property externalLink - External link containing additional information
 */
export interface CollectibleContract {
    name?: string;
    logo?: string;
    address: string;
    symbol?: string;
    description?: string;
    totalSupply?: string;
    assetContractType?: string;
    createdDate?: string;
    schemaName?: string;
    externalLink?: string;
}
/**
 * @type CollectibleMetadata
 *
 * Collectible custom information
 * @property name - Collectible custom name
 * @property description - The collectible description
 * @property numberOfSales - Number of sales
 * @property backgroundColor - The background color to be displayed with the item
 * @property image - Image custom image URI
 * @property imagePreview - URI of a smaller image associated with this collectible
 * @property imageThumbnail - URI of a thumbnail image associated with this collectible
 * @property imageOriginal - URI of the original image associated with this collectible
 * @property animation - URI of a animation associated with this collectible
 * @property animationOriginal - URI of the original animation associated with this collectible
 * @property externalLink - External link containing additional information
 * @property creator - The collectible owner information object
 * @property standard - NFT standard name for the collectible, e.g., ERC-721 or ERC-1155
 */
export interface CollectibleMetadata {
    name: string | null;
    description: string | null;
    image: string | null;
    standard: string | null;
    favorite?: boolean;
    numberOfSales?: number;
    backgroundColor?: string;
    imagePreview?: string;
    imageThumbnail?: string;
    imageOriginal?: string;
    animation?: string;
    animationOriginal?: string;
    externalLink?: string;
    creator?: ApiCollectibleCreator;
    lastSale?: ApiCollectibleLastSale;
}
interface AccountParams {
    userAddress: string;
    chainId: string;
}
/**
 * @type CollectiblesConfig
 *
 * Collectibles controller configuration
 * @property networkType - Network ID as per net_version
 * @property selectedAddress - Vault selected address
 */
export interface CollectiblesConfig extends BaseConfig {
    networkType: NetworkType;
    selectedAddress: string;
    chainId: string;
    ipfsGateway: string;
    openSeaEnabled: boolean;
    useIPFSSubdomains: boolean;
}
/**
 * @type CollectiblesState
 *
 * Assets controller state
 * @property allCollectibleContracts - Object containing collectibles contract information
 * @property allCollectibles - Object containing collectibles per account and network
 * @property collectibleContracts - List of collectibles contracts associated with the active vault
 * @property collectibles - List of collectibles associated with the active vault
 * @property ignoredCollectibles - List of collectibles that should be ignored
 */
export interface CollectiblesState extends BaseState {
    allCollectibleContracts: {
        [key: string]: {
            [key: string]: CollectibleContract[];
        };
    };
    allCollectibles: {
        [key: string]: {
            [key: string]: Collectible[];
        };
    };
    ignoredCollectibles: Collectible[];
}
/**
 * Controller that stores assets and exposes convenience methods
 */
export declare class CollectiblesController extends BaseController<CollectiblesConfig, CollectiblesState> {
    private mutex;
    private getCollectibleApi;
    private getCollectibleContractInformationApi;
    /**
     * Helper method to update nested state for allCollectibles and allCollectibleContracts.
     *
     * @param newCollection - the modified piece of state to update in the controller's store
     * @param baseStateKey - The root key in the store to update.
     * @param passedConfig - An object containing the selectedAddress and chainId that are passed through the auto-detection flow.
     * @param passedConfig.userAddress - the address passed through the collectible detection flow to ensure detected assets are stored to the correct account
     * @param passedConfig.chainId - the chainId passed through the collectible detection flow to ensure detected assets are stored to the correct account
     */
    private updateNestedCollectibleState;
    /**
     * Request individual collectible information from OpenSea API.
     *
     * @param contractAddress - Hex address of the collectible contract.
     * @param tokenId - The collectible identifier.
     * @returns Promise resolving to the current collectible name and image.
     */
    private getCollectibleInformationFromApi;
    /**
     * Request individual collectible information from contracts that follows Metadata Interface.
     *
     * @param contractAddress - Hex address of the collectible contract.
     * @param tokenId - The collectible identifier.
     * @returns Promise resolving to the current collectible name and image.
     */
    private getCollectibleInformationFromTokenURI;
    /**
     * Retrieve collectible uri with  metadata. TODO Update method to use IPFS.
     *
     * @param contractAddress - Collectible contract address.
     * @param tokenId - Collectible token id.
     * @returns Promise resolving collectible uri and token standard.
     */
    private getCollectibleURIAndStandard;
    /**
     * Request individual collectible information (name, image url and description).
     *
     * @param contractAddress - Hex address of the collectible contract.
     * @param tokenId - The collectible identifier.
     * @returns Promise resolving to the current collectible name and image.
     */
    private getCollectibleInformation;
    /**
     * Request collectible contract information from OpenSea API.
     *
     * @param contractAddress - Hex address of the collectible contract.
     * @returns Promise resolving to the current collectible name and image.
     */
    private getCollectibleContractInformationFromApi;
    /**
     * Request collectible contract information from the contract itself.
     *
     * @param contractAddress - Hex address of the collectible contract.
     * @returns Promise resolving to the current collectible name and image.
     */
    private getCollectibleContractInformationFromContract;
    /**
     * Request collectible contract information from OpenSea API.
     *
     * @param contractAddress - Hex address of the collectible contract.
     * @returns Promise resolving to the collectible contract name, image and description.
     */
    private getCollectibleContractInformation;
    /**
     * Adds an individual collectible to the stored collectible list.
     *
     * @param address - Hex address of the collectible contract.
     * @param tokenId - The collectible identifier.
     * @param collectibleMetadata - Collectible optional information (name, image and description).
     * @param collectibleContract - An object containing contract data of the collectible being added.
     * @param detection - The chain ID and address of the currently selected network and account at the moment the collectible was detected.
     * @returns Promise resolving to the current collectible list.
     */
    private addIndividualCollectible;
    /**
     * Adds a collectible contract to the stored collectible contracts list.
     *
     * @param address - Hex address of the collectible contract.
     * @param detection - The chain ID and address of the currently selected network and account at the moment the collectible was detected.
     * @returns Promise resolving to the current collectible contracts list.
     */
    private addCollectibleContract;
    /**
     * Removes an individual collectible from the stored token list and saves it in ignored collectibles list.
     *
     * @param address - Hex address of the collectible contract.
     * @param tokenId - Token identifier of the collectible.
     */
    private removeAndIgnoreIndividualCollectible;
    /**
     * Removes an individual collectible from the stored token list.
     *
     * @param address - Hex address of the collectible contract.
     * @param tokenId - Token identifier of the collectible.
     */
    private removeIndividualCollectible;
    /**
     * Removes a collectible contract to the stored collectible contracts list.
     *
     * @param address - Hex address of the collectible contract.
     * @returns Promise resolving to the current collectible contracts list.
     */
    private removeCollectibleContract;
    /**
     * EventEmitter instance used to listen to specific EIP747 events
     */
    hub: EventEmitter;
    /**
     * Optional API key to use with opensea
     */
    openSeaApiKey?: string;
    /**
     * Name of this controller used during composition
     */
    name: string;
    private getERC721AssetName;
    private getERC721AssetSymbol;
    private getERC721TokenURI;
    private getERC721OwnerOf;
    private getERC1155BalanceOf;
    private getERC1155TokenURI;
    private onCollectibleAdded?;
    /**
     * Creates a CollectiblesController instance.
     *
     * @param options - The controller options.
     * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param options.getERC721AssetName - Gets the name of the asset at the given address.
     * @param options.getERC721AssetSymbol - Gets the symbol of the asset at the given address.
     * @param options.getERC721TokenURI - Gets the URI of the ERC721 token at the given address, with the given ID.
     * @param options.getERC721OwnerOf - Get the owner of a ERC-721 collectible.
     * @param options.getERC1155BalanceOf - Gets balance of a ERC-1155 collectible.
     * @param options.getERC1155TokenURI - Gets the URI of the ERC1155 token at the given address, with the given ID.
     * @param options.onCollectibleAdded - Callback that is called when a collectible is added. Currently used pass data
     * for tracking the collectible added event.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ onPreferencesStateChange, onNetworkStateChange, getERC721AssetName, getERC721AssetSymbol, getERC721TokenURI, getERC721OwnerOf, getERC1155BalanceOf, getERC1155TokenURI, onCollectibleAdded, }: {
        onPreferencesStateChange: (listener: (preferencesState: PreferencesState) => void) => void;
        onNetworkStateChange: (listener: (networkState: NetworkState) => void) => void;
        getERC721AssetName: AssetsContractController['getERC721AssetName'];
        getERC721AssetSymbol: AssetsContractController['getERC721AssetSymbol'];
        getERC721TokenURI: AssetsContractController['getERC721TokenURI'];
        getERC721OwnerOf: AssetsContractController['getERC721OwnerOf'];
        getERC1155BalanceOf: AssetsContractController['getERC1155BalanceOf'];
        getERC1155TokenURI: AssetsContractController['getERC1155TokenURI'];
        onCollectibleAdded?: (data: {
            address: string;
            symbol: string | undefined;
            tokenId: string;
            standard: string | null;
            source: string;
        }) => void;
    }, config?: Partial<BaseConfig>, state?: Partial<CollectiblesState>);
    /**
     * Sets an OpenSea API key to retrieve collectible information.
     *
     * @param openSeaApiKey - OpenSea API key.
     */
    setApiKey(openSeaApiKey: string): void;
    /**
     * Checks the ownership of a ERC-721 or ERC-1155 collectible for a given address.
     *
     * @param ownerAddress - User public address.
     * @param collectibleAddress - Collectible contract address.
     * @param collectibleId - Collectible token ID.
     * @returns Promise resolving the collectible ownership.
     */
    isCollectibleOwner(ownerAddress: string, collectibleAddress: string, collectibleId: string): Promise<boolean>;
    /**
     * Verifies currently selected address owns entered collectible address/tokenId combo and
     * adds the collectible and respective collectible contract to the stored collectible and collectible contracts lists.
     *
     * @param address - Hex address of the collectible contract.
     * @param tokenId - The collectible identifier.
     */
    addCollectibleVerifyOwnership(address: string, tokenId: string): Promise<void>;
    /**
     * Adds a collectible and respective collectible contract to the stored collectible and collectible contracts lists.
     *
     * @param address - Hex address of the collectible contract.
     * @param tokenId - The collectible identifier.
     * @param collectibleMetadata - Collectible optional metadata.
     * @param detection - The chain ID and address of the currently selected network and account at the moment the collectible was detected.
     * @returns Promise resolving to the current collectible list.
     */
    addCollectible(address: string, tokenId: string, collectibleMetadata?: CollectibleMetadata, detection?: AccountParams): Promise<void>;
    /**
     * Removes a collectible from the stored token list.
     *
     * @param address - Hex address of the collectible contract.
     * @param tokenId - Token identifier of the collectible.
     */
    removeCollectible(address: string, tokenId: string): void;
    /**
     * Removes a collectible from the stored token list and saves it in ignored collectibles list.
     *
     * @param address - Hex address of the collectible contract.
     * @param tokenId - Token identifier of the collectible.
     */
    removeAndIgnoreCollectible(address: string, tokenId: string): void;
    /**
     * Removes all collectibles from the ignored list.
     */
    clearIgnoredCollectibles(): void;
    /**
     * Checks whether input collectible is still owned by the user
     * And updates the isCurrentlyOwned value on the collectible object accordingly.
     *
     * @param collectible - The collectible object to check and update.
     * @param batch - A boolean indicating whether this method is being called as part of a batch or single update.
     * @param accountParams - The userAddress and chainId to check ownership against
     * @param accountParams.userAddress - the address passed through the confirmed transaction flow to ensure detected assets are stored to the correct account
     * @param accountParams.chainId - the chainId passed through the confirmed transaction flow to ensure detected assets are stored to the correct account
     * @returns the collectible with the updated isCurrentlyOwned value
     */
    checkAndUpdateSingleCollectibleOwnershipStatus(collectible: Collectible, batch: boolean, { userAddress, chainId }?: AccountParams | undefined): Promise<Collectible>;
    /**
     * Checks whether Collectibles associated with current selectedAddress/chainId combination are still owned by the user
     * And updates the isCurrentlyOwned value on each accordingly.
     */
    checkAndUpdateAllCollectiblesOwnershipStatus(): Promise<void>;
    /**
     * Update collectible favorite status.
     *
     * @param address - Hex address of the collectible contract.
     * @param tokenId - Hex address of the collectible contract.
     * @param favorite - Collectible new favorite status.
     */
    updateCollectibleFavoriteStatus(address: string, tokenId: string, favorite: boolean): void;
}
export default CollectiblesController;
