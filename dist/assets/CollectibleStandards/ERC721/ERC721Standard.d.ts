export declare class ERC721Standard {
    /**
     * Query if contract implements ERC721Metadata interface.
     *
     * @param contract - ERC721 asset contract.
     * @returns Promise resolving to whether the contract implements ERC721Metadata interface.
     */
    contractSupportsMetadataInterface: (contract: any) => Promise<boolean>;
    /**
     * Query if contract implements ERC721Enumerable interface.
     *
     * @param contract - ERC721 asset contract.
     * @returns Promise resolving to whether the contract implements ERC721Enumerable interface.
     */
    contractSupportsEnumerableInterface: (contract: any) => Promise<boolean>;
    /**
     * Enumerate assets assigned to an owner.
     *
     * @param contract - ERC721 asset contract.
     * @param selectedAddress - Current account public address.
     * @param index - A collectible counter less than `balanceOf(selectedAddress)`.
     * @returns Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'.
     */
    getCollectibleTokenId: (contract: any, selectedAddress: string, index: number) => Promise<string>;
    /**
     * Query for tokenURI for a given asset.
     *
     * @param contract - ERC721 asset contract.
     * @param tokenId - ERC721 asset identifier.
     * @returns Promise resolving to the 'tokenURI'.
     */
    getCollectibleTokenURI: (contract: any, tokenId: string) => Promise<string>;
    /**
     * Query for name for a given asset.
     *
     * @param contract - ERC721 asset contract.
     * @returns Promise resolving to the 'name'.
     */
    getAssetName: (contract: any) => Promise<string>;
    /**
     * Query for symbol for a given asset.
     *
     * @param contract - ERC721 asset contract address.
     * @returns Promise resolving to the 'symbol'.
     */
    getAssetSymbol: (contract: any) => Promise<string>;
    /**
     * Query for owner for a given ERC721 asset.
     *
     * @param contract - ERC721 asset contract.
     * @param tokenId - ERC721 asset identifier.
     * @returns Promise resolving to the owner address.
     */
    getOwnerOf(contract: any, tokenId: string): Promise<string>;
    /**
     * Query if a contract implements an interface.
     *
     * @param contract - Asset contract.
     * @param interfaceId - Interface identifier.
     * @returns Promise resolving to whether the contract implements `interfaceID`.
     */
    private contractSupportsInterface;
}
