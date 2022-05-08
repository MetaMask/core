import { Web3 } from '../../standards-types';
export declare class ERC721Standard {
    private web3;
    constructor(web3: Web3);
    /**
     * Query if contract implements ERC721Metadata interface.
     *
     * @param address - ERC721 asset contract address.
     * @returns Promise resolving to whether the contract implements ERC721Metadata interface.
     */
    contractSupportsMetadataInterface: (address: string) => Promise<boolean>;
    /**
     * Query if contract implements ERC721Enumerable interface.
     *
     * @param address - ERC721 asset contract address.
     * @returns Promise resolving to whether the contract implements ERC721Enumerable interface.
     */
    contractSupportsEnumerableInterface: (address: string) => Promise<boolean>;
    /**
     * Query if contract implements ERC721 interface.
     *
     * @param address - ERC721 asset contract address.
     * @returns Promise resolving to whether the contract implements ERC721 interface.
     */
    contractSupportsBase721Interface: (address: string) => Promise<boolean>;
    /**
     * Enumerate assets assigned to an owner.
     *
     * @param address - ERC721 asset contract address.
     * @param selectedAddress - Current account public address.
     * @param index - A collectible counter less than `balanceOf(selectedAddress)`.
     * @returns Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'.
     */
    getCollectibleTokenId: (address: string, selectedAddress: string, index: number) => Promise<string>;
    /**
     * Query for tokenURI for a given asset.
     *
     * @param address - ERC721 asset contract address.
     * @param tokenId - ERC721 asset identifier.
     * @returns Promise resolving to the 'tokenURI'.
     */
    getTokenURI: (address: string, tokenId: string) => Promise<string>;
    /**
     * Query for name for a given asset.
     *
     * @param address - ERC721 asset contract address.
     * @returns Promise resolving to the 'name'.
     */
    getAssetName: (address: string) => Promise<string>;
    /**
     * Query for symbol for a given asset.
     *
     * @param address - ERC721 asset contract address.
     * @returns Promise resolving to the 'symbol'.
     */
    getAssetSymbol: (address: string) => Promise<string>;
    /**
     * Query for owner for a given ERC721 asset.
     *
     * @param address - ERC721 asset contract address.
     * @param tokenId - ERC721 asset identifier.
     * @returns Promise resolving to the owner address.
     */
    getOwnerOf(address: string, tokenId: string): Promise<string>;
    /**
     * Query if a contract implements an interface.
     *
     * @param address - Asset contract address.
     * @param interfaceId - Interface identifier.
     * @returns Promise resolving to whether the contract implements `interfaceID`.
     */
    private contractSupportsInterface;
    /**
     * Query if a contract implements an interface.
     *
     * @param address - Asset contract address.
     * @param ipfsGateway - The user's preferred IPFS gateway.
     * @param tokenId - tokenId of a given token in the contract.
     * @returns Promise resolving an object containing the standard, tokenURI, symbol and name of the given contract/tokenId pair.
     */
    getDetails: (address: string, ipfsGateway: string, tokenId?: string | undefined) => Promise<{
        standard: string;
        tokenURI: string | undefined;
        symbol: string | undefined;
        name: string | undefined;
        image: string | undefined;
    }>;
}
