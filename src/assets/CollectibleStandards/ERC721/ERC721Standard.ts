const ERC721_METADATA_INTERFACE_ID = '0x5b5e139f';
const ERC721_ENUMERABLE_INTERFACE_ID = '0x780e9d63';

export class ERC721Standard {
  /**
   * Query if contract implements ERC721Metadata interface.
   *
   * @param contract - ERC721 asset contract.
   * @returns Promise resolving to whether the contract implements ERC721Metadata interface.
   */
  contractSupportsMetadataInterface = async (
    contract: any,
  ): Promise<boolean> => {
    return this.contractSupportsInterface(
      contract,
      ERC721_METADATA_INTERFACE_ID,
    );
  };

  /**
   * Query if contract implements ERC721Enumerable interface.
   *
   * @param contract - ERC721 asset contract.
   * @returns Promise resolving to whether the contract implements ERC721Enumerable interface.
   */
  contractSupportsEnumerableInterface = async (
    contract: any,
  ): Promise<boolean> => {
    return await this.contractSupportsInterface(
      contract,
      ERC721_ENUMERABLE_INTERFACE_ID,
    );
  };

  /**
   * Enumerate assets assigned to an owner.
   *
   * @param contract - ERC721 asset contract.
   * @param selectedAddress - Current account public address.
   * @param index - A collectible counter less than `balanceOf(selectedAddress)`.
   * @returns Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'.
   */
  getCollectibleTokenId = async (
    contract: any,
    selectedAddress: string,
    index: number,
  ): Promise<string> => {
    const { tokenOfOwnerByIndex } = contract.methods;
    return await tokenOfOwnerByIndex(selectedAddress, index).call();
  };

  /**
   * Query for tokenURI for a given asset.
   *
   * @param contract - ERC721 asset contract.
   * @param tokenId - ERC721 asset identifier.
   * @returns Promise resolving to the 'tokenURI'.
   */
  getCollectibleTokenURI = async (
    contract: any,
    tokenId: string,
  ): Promise<string> => {
    const supportsMetadata = await this.contractSupportsMetadataInterface(
      contract,
    );
    if (!supportsMetadata) {
      throw new Error('Contract does not support ERC721 metadata interface.');
    }
    const { tokenURI } = contract.methods;
    return await tokenURI(tokenId).call();
  };

  /**
   * Query for name for a given asset.
   *
   * @param contract - ERC721 asset contract.
   * @returns Promise resolving to the 'name'.
   */
  getAssetName = async (contract: any): Promise<string> => {
    const { name } = contract.methods;
    return await name().call();
  };

  /**
   * Query for symbol for a given asset.
   *
   * @param contract - ERC721 asset contract address.
   * @returns Promise resolving to the 'symbol'.
   */
  getAssetSymbol = async (contract: any): Promise<string> => {
    const { symbol } = contract.methods;
    return await symbol().call();
  };

  /**
   * Query for owner for a given ERC721 asset.
   *
   * @param contract - ERC721 asset contract.
   * @param tokenId - ERC721 asset identifier.
   * @returns Promise resolving to the owner address.
   */
  async getOwnerOf(contract: any, tokenId: string): Promise<string> {
    const { ownerOf } = contract.methods;
    return await ownerOf(tokenId).call();
  }

  /**
   * Query if a contract implements an interface.
   *
   * @param contract - Asset contract.
   * @param interfaceId - Interface identifier.
   * @returns Promise resolving to whether the contract implements `interfaceID`.
   */
  private contractSupportsInterface = async (
    contract: any,
    interfaceId: string,
  ): Promise<boolean> => {
    const { supportsInterface } = contract.methods;
    return await supportsInterface(interfaceId).call();
  };
}
