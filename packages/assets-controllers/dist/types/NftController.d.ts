import type { AccountsControllerSelectedEvmAccountChangeEvent, AccountsControllerGetAccountAction, AccountsControllerGetSelectedAccountAction } from '@metamask/accounts-controller';
import type { AddApprovalRequest } from '@metamask/approval-controller';
import type { RestrictedControllerMessenger, ControllerStateChangeEvent } from '@metamask/base-controller';
import { BaseController, type ControllerGetStateAction } from '@metamask/base-controller';
import type { NetworkClientId, NetworkControllerGetNetworkClientByIdAction, NetworkControllerNetworkDidChangeEvent } from '@metamask/network-controller';
import type { PreferencesControllerStateChangeEvent } from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';
import type { AssetsContractControllerGetERC1155BalanceOfAction, AssetsContractControllerGetERC1155TokenURIAction, AssetsContractControllerGetERC721AssetNameAction, AssetsContractControllerGetERC721AssetSymbolAction, AssetsContractControllerGetERC721OwnerOfAction, AssetsContractControllerGetERC721TokenURIAction } from './AssetsContractController';
import { Source } from './constants';
import type { Collection, Attributes, LastSale, TopBid } from './NftDetectionController';
type NFTStandardType = 'ERC721' | 'ERC1155';
type SuggestedNftMeta = {
    asset: {
        address: string;
        tokenId: string;
    } & NftMetadata;
    id: string;
    time: number;
    type: NFTStandardType;
    interactingAddress: string;
    origin: string;
};
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
export type Nft = {
    tokenId: string;
    address: string;
    isCurrentlyOwned?: boolean;
} & NftMetadata;
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
export type NftContract = {
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
};
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
export type NftMetadata = {
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
    creator?: string;
    transactionId?: string;
    tokenURI?: string | null;
    collection?: Collection;
    address?: string;
    attributes?: Attributes[];
    lastSale?: LastSale;
    rarityRank?: string;
    topBid?: TopBid;
};
/**
 * @type NftControllerState
 *
 * NFT controller state
 * @property allNftContracts - Object containing NFT contract information
 * @property allNfts - Object containing NFTs per account and network
 * @property ignoredNfts - List of NFTs that should be ignored
 */
export type NftControllerState = {
    allNftContracts: {
        [key: string]: {
            [chainId: Hex]: NftContract[];
        };
    };
    allNfts: {
        [key: string]: {
            [chainId: Hex]: Nft[];
        };
    };
    ignoredNfts: Nft[];
};
type NftAsset = {
    address: string;
    tokenId: string;
};
/**
 * The name of the {@link NftController}.
 */
declare const controllerName = "NftController";
export type NftControllerGetStateAction = ControllerGetStateAction<typeof controllerName, NftControllerState>;
export type NftControllerActions = NftControllerGetStateAction;
/**
 * The external actions available to the {@link NftController}.
 */
export type AllowedActions = AddApprovalRequest | AccountsControllerGetAccountAction | AccountsControllerGetSelectedAccountAction | NetworkControllerGetNetworkClientByIdAction | AssetsContractControllerGetERC721AssetNameAction | AssetsContractControllerGetERC721AssetSymbolAction | AssetsContractControllerGetERC721TokenURIAction | AssetsContractControllerGetERC721OwnerOfAction | AssetsContractControllerGetERC1155BalanceOfAction | AssetsContractControllerGetERC1155TokenURIAction;
export type AllowedEvents = PreferencesControllerStateChangeEvent | NetworkControllerNetworkDidChangeEvent | AccountsControllerSelectedEvmAccountChangeEvent;
export type NftControllerStateChangeEvent = ControllerStateChangeEvent<typeof controllerName, NftControllerState>;
export type NftControllerEvents = NftControllerStateChangeEvent;
/**
 * The messenger of the {@link NftController}.
 */
export type NftControllerMessenger = RestrictedControllerMessenger<typeof controllerName, NftControllerActions | AllowedActions, NftControllerEvents | AllowedEvents, AllowedActions['type'], AllowedEvents['type']>;
export declare const getDefaultNftControllerState: () => NftControllerState;
/**
 * Controller that stores assets and exposes convenience methods
 */
export declare class NftController extends BaseController<typeof controllerName, NftControllerState, NftControllerMessenger> {
    #private;
    /**
     * Optional API key to use with opensea
     */
    openSeaApiKey?: string;
    /**
     * Creates an NftController instance.
     *
     * @param options - The controller options.
     * @param options.chainId - The chain ID of the current network.
     * @param options.ipfsGateway - The configured IPFS gateway.
     * @param options.openSeaEnabled - Controls whether the OpenSea API is used.
     * @param options.useIpfsSubdomains - Controls whether IPFS subdomains are used.
     * @param options.isIpfsGatewayEnabled - Controls whether IPFS is enabled or not.
     * @param options.onNftAdded - Callback that is called when an NFT is added. Currently used pass data
     * for tracking the NFT added event.
     * @param options.messenger - The controller messenger.
     * @param options.state - Initial state to set on this controller.
     */
    constructor({ chainId: initialChainId, ipfsGateway, openSeaEnabled, useIpfsSubdomains, isIpfsGatewayEnabled, onNftAdded, messenger, state, }: {
        chainId: Hex;
        ipfsGateway?: string;
        openSeaEnabled?: boolean;
        useIpfsSubdomains?: boolean;
        isIpfsGatewayEnabled?: boolean;
        onNftAdded?: (data: {
            address: string;
            symbol: string | undefined;
            tokenId: string;
            standard: string | null;
            source: string;
        }) => void;
        messenger: NftControllerMessenger;
        state?: Partial<NftControllerState>;
    });
    getNftApi(): string;
    /**
     * Adds a new suggestedAsset to state. Parameters will be validated according to
     * asset type being watched. A `<suggestedNftMeta.id>:pending` hub event will be emitted once added.
     *
     * @param asset - The asset to be watched. For now ERC721 and ERC1155 tokens are accepted.
     * @param asset.address - The address of the asset contract.
     * @param asset.tokenId - The ID of the asset.
     * @param type - The asset type.
     * @param origin - Domain origin to register the asset from.
     * @param options - Options bag.
     * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
     * @param options.userAddress - The address of the account where the NFT is being added.
     * @returns Object containing a Promise resolving to the suggestedAsset address if accepted.
     */
    watchNft(asset: NftAsset, type: NFTStandardType, origin: string, { networkClientId, userAddress, }?: {
        networkClientId?: NetworkClientId;
        userAddress?: string;
    }): Promise<void>;
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
     * @param tokenId - NFT token ID.
     * @param options - Options bag.
     * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
     * @returns Promise resolving the NFT ownership.
     */
    isNftOwner(ownerAddress: string, nftAddress: string, tokenId: string, { networkClientId, }?: {
        networkClientId?: NetworkClientId;
    }): Promise<boolean>;
    /**
     * Verifies currently selected address owns entered NFT address/tokenId combo and
     * adds the NFT and respective NFT contract to the stored NFT and NFT contracts lists.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - The NFT identifier.
     * @param options - an object of arguments
     * @param options.userAddress - The address of the current user.
     * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
     * @param options.source - Whether the NFT was detected, added manually or suggested by a dapp.
     */
    addNftVerifyOwnership(address: string, tokenId: string, { userAddress, networkClientId, source, }?: {
        userAddress?: string;
        networkClientId?: NetworkClientId;
        source?: Source;
    }): Promise<void>;
    /**
     * Adds an NFT and respective NFT contract to the stored NFT and NFT contracts lists.
     *
     * @param tokenAddress - Hex address of the NFT contract.
     * @param tokenId - The NFT identifier.
     * @param options - an object of arguments
     * @param options.nftMetadata - NFT optional metadata.
     * @param options.userAddress - The address of the current user.
     * @param options.source - Whether the NFT was detected, added manually or suggested by a dapp.
     * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
     * @returns Promise resolving to the current NFT list.
     */
    addNft(tokenAddress: string, tokenId: string, { nftMetadata, userAddress, source, networkClientId, }?: {
        nftMetadata?: NftMetadata;
        userAddress?: string;
        source?: Source;
        networkClientId?: NetworkClientId;
    }): Promise<void>;
    /**
     * Refetches NFT metadata and updates the state
     *
     * @param options - Options for refetching NFT metadata
     * @param options.nfts - nfts to update metadata for.
     * @param options.userAddress - The current user address
     * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
     */
    updateNftMetadata({ nfts, userAddress, networkClientId, }: {
        nfts: Nft[];
        userAddress?: string;
        networkClientId?: NetworkClientId;
    }): Promise<void>;
    /**
     * Removes an NFT from the stored token list.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - Token identifier of the NFT.
     * @param options - an object of arguments
     * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
     * @param options.userAddress - The address of the account where the NFT is being removed.
     */
    removeNft(address: string, tokenId: string, { networkClientId, userAddress, }?: {
        networkClientId?: NetworkClientId;
        userAddress?: string;
    }): void;
    /**
     * Removes an NFT from the stored token list and saves it in ignored NFTs list.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - Token identifier of the NFT.
     * @param options - an object of arguments
     * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
     * @param options.userAddress - The address of the account where the NFT is being removed.
     */
    removeAndIgnoreNft(address: string, tokenId: string, { networkClientId, userAddress, }?: {
        networkClientId?: NetworkClientId;
        userAddress?: string;
    }): void;
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
     * @param accountParams.userAddress - the address passed through the confirmed transaction flow to ensure assets are stored to the correct account
     * @param accountParams.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
     * @returns the NFT with the updated isCurrentlyOwned value
     */
    checkAndUpdateSingleNftOwnershipStatus(nft: Nft, batch: boolean, { userAddress, networkClientId, }?: {
        networkClientId?: NetworkClientId;
        userAddress?: string;
    }): Promise<{
        isCurrentlyOwned: boolean | undefined;
        tokenId: string;
        address: string;
        name: string | null;
        description: string | null;
        image: string | null;
        standard: string | null;
        favorite?: boolean | undefined;
        numberOfSales?: number | undefined;
        backgroundColor?: string | undefined;
        imagePreview?: string | undefined;
        imageThumbnail?: string | undefined;
        imageOriginal?: string | undefined;
        animation?: string | undefined;
        animationOriginal?: string | undefined;
        externalLink?: string | undefined;
        creator?: string | undefined;
        transactionId?: string | undefined;
        tokenURI?: string | null | undefined;
        collection?: Collection | undefined;
        attributes?: Attributes[] | undefined;
        lastSale?: LastSale | undefined;
        rarityRank?: string | undefined;
        topBid?: TopBid | undefined;
    }>;
    /**
     * Checks whether NFTs associated with current selectedAddress/chainId combination are still owned by the user
     * And updates the isCurrentlyOwned value on each accordingly.
     * @param options - an object of arguments
     * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
     * @param options.userAddress - The address of the account where the NFT ownership status is checked/updated.
     */
    checkAndUpdateAllNftsOwnershipStatus({ networkClientId, userAddress, }?: {
        networkClientId?: NetworkClientId;
        userAddress?: string;
    }): Promise<void>;
    /**
     * Update NFT favorite status.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - Hex address of the NFT contract.
     * @param favorite - NFT new favorite status.
     * @param options - an object of arguments
     * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
     * @param options.userAddress - The address of the account where the NFT is being removed.
     */
    updateNftFavoriteStatus(address: string, tokenId: string, favorite: boolean, { networkClientId, userAddress, }?: {
        networkClientId?: NetworkClientId;
        userAddress?: string;
    }): void;
    /**
     * Returns an NFT by the address and token id.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - Number that represents the id of the token.
     * @param selectedAddress - Hex address of the user account.
     * @param chainId - Id of the current network.
     * @returns Object containing the NFT and its position in the array
     */
    findNftByAddressAndTokenId(address: string, tokenId: string, selectedAddress: string, chainId: Hex): {
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
    updateNft(nft: Nft, updates: Partial<Nft>, selectedAddress: string, chainId: Hex): void;
    /**
     * Resets the transaction status of an NFT.
     *
     * @param transactionId - NFT transaction id.
     * @param selectedAddress - Hex address of the user account.
     * @param chainId - Id of the current network.
     * @returns a boolean indicating if the reset was well succeeded or not
     */
    resetNftTransactionStatusByTransactionId(transactionId: string, selectedAddress: string, chainId: Hex): boolean;
    _requestApproval(suggestedNftMeta: SuggestedNftMeta): Promise<unknown>;
}
export default NftController;
//# sourceMappingURL=NftController.d.ts.map