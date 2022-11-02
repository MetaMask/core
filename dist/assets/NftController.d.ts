/// <reference types="node" />
import { EventEmitter } from 'events';
import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type { PreferencesState } from '../user/PreferencesController';
import type { NetworkState, NetworkType } from '../network/NetworkController';
import type { ApiNftCreator, ApiNftLastSale } from './NftDetectionController';
import type { AssetsContractController } from './AssetsContractController';
/**
 * @type Nft
 *
 * NFT representation
 * @property address - Hex address of a ERC721 contract
 * @property description - The NFT description
 * @property image - URI of custom NFT image associated with this tokenId
 * @property name - Name associated with this tokenId and contract address
 * @property tokenId - The NFT identifier
 * @property numberOfSales - Number of sales
 * @property backgroundColor - The background color to be displayed with the item
 * @property imagePreview - URI of a smaller image associated with this NFT
 * @property imageThumbnail - URI of a thumbnail image associated with this NFT
 * @property imageOriginal - URI of the original image associated with this NFT
 * @property animation - URI of a animation associated with this NFT
 * @property animationOriginal - URI of the original animation associated with this NFT
 * @property externalLink - External link containing additional information
 * @property creator - The NFT owner information object
 * @property isCurrentlyOwned - Boolean indicating whether the address/chainId combination where it's currently stored currently owns this NFT
 * @property transactionId - Transaction Id associated with the NFT
 */
export interface Nft extends NftMetadata {
    tokenId: string;
    address: string;
    isCurrentlyOwned?: boolean;
}
/**
 * @type NftContract
 *
 * NFT contract information representation
 * @property name - Contract name
 * @property logo - Contract logo
 * @property address - Contract address
 * @property symbol - Contract symbol
 * @property description - Contract description
 * @property totalSupply - Total supply of NFTs
 * @property assetContractType - The NFT type, it could be `semi-fungible` or `non-fungible`
 * @property createdDate - Creation date
 * @property schemaName - The schema followed by the contract, it could be `ERC721` or `ERC1155`
 * @property externalLink - External link containing additional information
 */
export interface NftContract {
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
 * @type NftMetadata
 *
 * NFT custom information
 * @property name - NFT custom name
 * @property description - The NFT description
 * @property numberOfSales - Number of sales
 * @property backgroundColor - The background color to be displayed with the item
 * @property image - Image custom image URI
 * @property imagePreview - URI of a smaller image associated with this NFT
 * @property imageThumbnail - URI of a thumbnail image associated with this NFT
 * @property imageOriginal - URI of the original image associated with this NFT
 * @property animation - URI of a animation associated with this NFT
 * @property animationOriginal - URI of the original animation associated with this NFT
 * @property externalLink - External link containing additional information
 * @property creator - The NFT owner information object
 * @property standard - NFT standard name for the NFT, e.g., ERC-721 or ERC-1155
 */
export interface NftMetadata {
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
    creator?: ApiNftCreator;
    lastSale?: ApiNftLastSale;
    transactionId?: string;
}
interface AccountParams {
    userAddress: string;
    chainId: string;
}
/**
 * @type NftConfig
 *
 * NFT controller configuration
 * @property networkType - Network ID as per net_version
 * @property selectedAddress - Vault selected address
 */
export interface NftConfig extends BaseConfig {
    networkType: NetworkType;
    selectedAddress: string;
    chainId: string;
    ipfsGateway: string;
    openSeaEnabled: boolean;
    useIPFSSubdomains: boolean;
}
/**
 * @type NftState
 *
 * NFT controller state
 * @property allNftContracts - Object containing NFT contract information
 * @property allNfts - Object containing NFTs per account and network
 * @property ignoredNfts - List of NFTs that should be ignored
 */
export interface NftState extends BaseState {
    allNftContracts: {
        [key: string]: {
            [key: string]: NftContract[];
        };
    };
    allNfts: {
        [key: string]: {
            [key: string]: Nft[];
        };
    };
    ignoredNfts: Nft[];
}
/**
 * Controller that stores assets and exposes convenience methods
 */
export declare class NftController extends BaseController<NftConfig, NftState> {
    private mutex;
    private getNftApi;
    private getNftContractInformationApi;
    /**
     * Helper method to update nested state for allNfts and allNftContracts.
     *
     * @param newCollection - the modified piece of state to update in the controller's store
     * @param baseStateKey - The root key in the store to update.
     * @param passedConfig - An object containing the selectedAddress and chainId that are passed through the auto-detection flow.
     * @param passedConfig.userAddress - the address passed through the NFT detection flow to ensure detected assets are stored to the correct account
     * @param passedConfig.chainId - the chainId passed through the NFT detection flow to ensure detected assets are stored to the correct account
     */
    private updateNestedNftState;
    /**
     * Request individual NFT information from OpenSea API.
     *
     * @param contractAddress - Hex address of the NFT contract.
     * @param tokenId - The NFT identifier.
     * @returns Promise resolving to the current NFT name and image.
     */
    private getNftInformationFromApi;
    /**
     * Request individual NFT information from contracts that follows Metadata Interface.
     *
     * @param contractAddress - Hex address of the NFT contract.
     * @param tokenId - The NFT identifier.
     * @returns Promise resolving to the current NFT name and image.
     */
    private getNftInformationFromTokenURI;
    /**
     * Retrieve NFT uri with  metadata. TODO Update method to use IPFS.
     *
     * @param contractAddress - NFT contract address.
     * @param tokenId - NFT token id.
     * @returns Promise resolving NFT uri and token standard.
     */
    private getNftURIAndStandard;
    /**
     * Request individual NFT information (name, image url and description).
     *
     * @param contractAddress - Hex address of the NFT contract.
     * @param tokenId - The NFT identifier.
     * @returns Promise resolving to the current NFT name and image.
     */
    private getNftInformation;
    /**
     * Request NFT contract information from OpenSea API.
     *
     * @param contractAddress - Hex address of the NFT contract.
     * @returns Promise resolving to the current NFT name and image.
     */
    private getNftContractInformationFromApi;
    /**
     * Request NFT contract information from the contract itself.
     *
     * @param contractAddress - Hex address of the NFT contract.
     * @returns Promise resolving to the current NFT name and image.
     */
    private getNftContractInformationFromContract;
    /**
     * Request NFT contract information from OpenSea API.
     *
     * @param contractAddress - Hex address of the NFT contract.
     * @returns Promise resolving to the NFT contract name, image and description.
     */
    private getNftContractInformation;
    /**
     * Adds an individual NFT to the stored NFT list.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - The NFT identifier.
     * @param nftMetadata - NFT optional information (name, image and description).
     * @param nftContract - An object containing contract data of the NFT being added.
     * @param detection - The chain ID and address of the currently selected network and account at the moment the NFT was detected.
     * @returns Promise resolving to the current NFT list.
     */
    private addIndividualNft;
    /**
     * Adds an NFT contract to the stored NFT contracts list.
     *
     * @param address - Hex address of the NFT contract.
     * @param detection - The chain ID and address of the currently selected network and account at the moment the NFT was detected.
     * @returns Promise resolving to the current NFT contracts list.
     */
    private addNftContract;
    /**
     * Removes an individual NFT from the stored token list and saves it in ignored NFTs list.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - Token identifier of the NFT.
     */
    private removeAndIgnoreIndividualNft;
    /**
     * Removes an individual NFT from the stored token list.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - Token identifier of the NFT.
     */
    private removeIndividualNft;
    /**
     * Removes an NFT contract to the stored NFT contracts list.
     *
     * @param address - Hex address of the NFT contract.
     * @returns Promise resolving to the current NFT contracts list.
     */
    private removeNftContract;
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
    private onNftAdded?;
    /**
     * Creates an NftController instance.
     *
     * @param options - The controller options.
     * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param options.getERC721AssetName - Gets the name of the asset at the given address.
     * @param options.getERC721AssetSymbol - Gets the symbol of the asset at the given address.
     * @param options.getERC721TokenURI - Gets the URI of the ERC721 token at the given address, with the given ID.
     * @param options.getERC721OwnerOf - Get the owner of a ERC-721 NFT.
     * @param options.getERC1155BalanceOf - Gets balance of a ERC-1155 NFT.
     * @param options.getERC1155TokenURI - Gets the URI of the ERC1155 token at the given address, with the given ID.
     * @param options.onNftAdded - Callback that is called when an NFT is added. Currently used pass data
     * for tracking the NFT added event.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ onPreferencesStateChange, onNetworkStateChange, getERC721AssetName, getERC721AssetSymbol, getERC721TokenURI, getERC721OwnerOf, getERC1155BalanceOf, getERC1155TokenURI, onNftAdded, }: {
        onPreferencesStateChange: (listener: (preferencesState: PreferencesState) => void) => void;
        onNetworkStateChange: (listener: (networkState: NetworkState) => void) => void;
        getERC721AssetName: AssetsContractController['getERC721AssetName'];
        getERC721AssetSymbol: AssetsContractController['getERC721AssetSymbol'];
        getERC721TokenURI: AssetsContractController['getERC721TokenURI'];
        getERC721OwnerOf: AssetsContractController['getERC721OwnerOf'];
        getERC1155BalanceOf: AssetsContractController['getERC1155BalanceOf'];
        getERC1155TokenURI: AssetsContractController['getERC1155TokenURI'];
        onNftAdded?: (data: {
            address: string;
            symbol: string | undefined;
            tokenId: string;
            standard: string | null;
            source: string;
        }) => void;
    }, config?: Partial<BaseConfig>, state?: Partial<NftState>);
    /**
     * Sets an OpenSea API key to retrieve NFT information.
     *
     * @param openSeaApiKey - OpenSea API key.
     */
    setApiKey(openSeaApiKey: string): void;
    /**
     * Checks the ownership of a ERC-721 or ERC-1155 NFT for a given address.
     *
     * @param ownerAddress - User public address.
     * @param nftAddress - NFT contract address.
     * @param nftId - NFT token ID.
     * @returns Promise resolving the NFT ownership.
     */
    isNftOwner(ownerAddress: string, nftAddress: string, nftId: string): Promise<boolean>;
    /**
     * Verifies currently selected address owns entered NFT address/tokenId combo and
     * adds the NFT and respective NFT contract to the stored NFT and NFT contracts lists.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - The NFT identifier.
     */
    addNftVerifyOwnership(address: string, tokenId: string): Promise<void>;
    /**
     * Adds an NFT and respective NFT contract to the stored NFT and NFT contracts lists.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - The NFT identifier.
     * @param nftMetadata - NFT optional metadata.
     * @param detection - The chain ID and address of the currently selected network and account at the moment the NFT was detected.
     * @returns Promise resolving to the current NFT list.
     */
    addNft(address: string, tokenId: string, nftMetadata?: NftMetadata, detection?: AccountParams): Promise<void>;
    /**
     * Removes an NFT from the stored token list.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - Token identifier of the NFT.
     */
    removeNft(address: string, tokenId: string): void;
    /**
     * Removes an NFT from the stored token list and saves it in ignored NFTs list.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - Token identifier of the NFT.
     */
    removeAndIgnoreNft(address: string, tokenId: string): void;
    /**
     * Removes all NFTs from the ignored list.
     */
    clearIgnoredNfts(): void;
    /**
     * Checks whether input NFT is still owned by the user
     * And updates the isCurrentlyOwned value on the NFT object accordingly.
     *
     * @param nft - The NFT object to check and update.
     * @param batch - A boolean indicating whether this method is being called as part of a batch or single update.
     * @param accountParams - The userAddress and chainId to check ownership against
     * @param accountParams.userAddress - the address passed through the confirmed transaction flow to ensure detected assets are stored to the correct account
     * @param accountParams.chainId - the chainId passed through the confirmed transaction flow to ensure detected assets are stored to the correct account
     * @returns the NFT with the updated isCurrentlyOwned value
     */
    checkAndUpdateSingleNftOwnershipStatus(nft: Nft, batch: boolean, { userAddress, chainId }?: AccountParams | undefined): Promise<Nft>;
    /**
     * Checks whether NFTs associated with current selectedAddress/chainId combination are still owned by the user
     * And updates the isCurrentlyOwned value on each accordingly.
     */
    checkAndUpdateAllNftsOwnershipStatus(): Promise<void>;
    /**
     * Update NFT favorite status.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - Hex address of the NFT contract.
     * @param favorite - NFT new favorite status.
     */
    updateNftFavoriteStatus(address: string, tokenId: string, favorite: boolean): void;
    /**
     * Returns an NFT by the address and token id.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - Number that represents the id of the token.
     * @param selectedAddress - Hex address of the user account.
     * @param chainId - Id of the current network.
     * @returns Object containing the NFT and its position in the array
     */
    findNftByAddressAndTokenId(address: string, tokenId: string, selectedAddress: string, chainId: string): {
        nft: Nft;
        index: number;
    } | null;
    /**
     * Update NFT data.
     *
     * @param nft - NFT object to find the right NFT to updates.
     * @param updates - NFT partial object to update properties of the NFT.
     * @param selectedAddress - Hex address of the user account.
     * @param chainId - Id of the current network.
     */
    updateNft(nft: Nft, updates: Partial<Nft>, selectedAddress: string, chainId: string): void;
    /**
     * Resets the transaction status of an NFT.
     *
     * @param transactionId - NFT transaction id.
     * @param selectedAddress - Hex address of the user account.
     * @param chainId - Id of the current network.
     * @returns a boolean indicating if the reset was well succeded or not
     */
    resetNftTransactionStatusByTransactionId(transactionId: string, selectedAddress: string, chainId: string): boolean;
}
export default NftController;
