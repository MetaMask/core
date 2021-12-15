export declare class ERC1155Standard {
    /**
     * Query if contract implements ERC1155 URI Metadata interface.
     *
     * @param contract - ERC1155 asset contract.
     * @returns Promise resolving to whether the contract implements ERC1155 URI Metadata interface.
     */
    contractSupportsURIMetadataInterface: (contract: any) => Promise<boolean>;
    /**
     * Query if contract implements ERC1155 Token Receiver interface.
     *
     * @param contract - ERC1155 asset contract.
     * @returns Promise resolving to whether the contract implements ERC1155 Token Receiver interface.
     */
    contractSupportsTokenReceiverInterface: (contract: any) => Promise<boolean>;
    /**
     * Query for tokenURI for a given asset.
     *
     * @param contract - ERC1155 asset contract.
     * @param tokenId - ERC1155 asset identifier.
     * @returns Promise resolving to the 'tokenURI'.
     */
    uri: (contract: any, tokenId: string) => Promise<string>;
    /**
     * Query for balance of a given ERC1155 token.
     *
     * @param contract - ERC1155 asset contract.
     * @param address - Wallet public address.
     * @param tokenId - ERC1155 asset identifier.
     * @returns Promise resolving to the 'balanceOf'.
     */
    getBalanceOf: (contract: any, address: string, tokenId: string) => Promise<number>;
    /**
     * Transfer single ERC1155 token.
     * When minting/creating tokens, the from arg MUST be set to 0x0 (i.e. zero address).
     * When burning/destroying tokens, the to arg MUST be set to 0x0 (i.e. zero address).
     *
     * @param contract - ERC1155 asset contract.
     * @param operator - ERC1155 token address.
     * @param from - ERC1155 token holder.
     * @param to - ERC1155 token recipient.
     * @param id - ERC1155 token id.
     * @param value - Number of tokens to be sent.
     * @returns Promise resolving to the 'transferSingle'.
     */
    transferSingle: (contract: any, operator: string, from: string, to: string, id: string, value: string) => Promise<void>;
    /**
     * Query if a contract implements an interface.
     *
     * @param contract - ERC1155 asset contract.
     * @param interfaceId - Interface identifier.
     * @returns Promise resolving to whether the contract implements `interfaceID`.
     */
    private contractSupportsInterface;
}
