import { abiERC721 } from '@metamask/metamask-eth-abis';
import {
  ERC721_INTERFACE_ID,
  ERC721_METADATA_INTERFACE_ID,
  ERC721_ENUMERABLE_INTERFACE_ID,
  ERC721,
} from '../../../../constants';
import { getFormattedIpfsUrl, timeoutFetch } from '../../../../util';

export class ERC721Standard {
  private web3: any;

  constructor(web3: any) {
    this.web3 = web3;
  }

  /**
   * Query if contract implements ERC721Metadata interface.
   *
   * @param address - ERC721 asset contract address.
   * @returns Promise resolving to whether the contract implements ERC721Metadata interface.
   */
  contractSupportsMetadataInterface = async (
    address: string,
  ): Promise<boolean> => {
    return await this.contractSupportsInterface(
      address,
      ERC721_METADATA_INTERFACE_ID,
    );
  };

  /**
   * Query if contract implements ERC721Enumerable interface.
   *
   * @param address - ERC721 asset contract address.
   * @returns Promise resolving to whether the contract implements ERC721Enumerable interface.
   */
  contractSupportsEnumerableInterface = async (
    address: string,
  ): Promise<boolean> => {
    return await this.contractSupportsInterface(
      address,
      ERC721_ENUMERABLE_INTERFACE_ID,
    );
  };

  /**
   * Query if contract implements ERC721 interface.
   *
   * @param address - ERC721 asset contract address.
   * @returns Promise resolving to whether the contract implements ERC721 interface.
   */
  contractSupportsBase721Interface = async (
    address: string,
  ): Promise<boolean> => {
    return await this.contractSupportsInterface(address, ERC721_INTERFACE_ID);
  };

  /**
   * Enumerate assets assigned to an owner.
   *
   * @param address - ERC721 asset contract address.
   * @param selectedAddress - Current account public address.
   * @param index - A collectible counter less than `balanceOf(selectedAddress)`.
   * @returns Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'.
   */
  getCollectibleTokenId = async (
    address: string,
    selectedAddress: string,
    index: number,
  ): Promise<string> => {
    const contract = new this.web3.eth.Contract(abiERC721, address);
    return await contract.methods
      .tokenOfOwnerByIndex(selectedAddress, index)
      .call();
  };

  /**
   * Query for tokenURI for a given asset.
   *
   * @param address - ERC721 asset contract address.
   * @param tokenId - ERC721 asset identifier.
   * @returns Promise resolving to the 'tokenURI'.
   */
  getTokenURI = async (address: string, tokenId: string): Promise<string> => {
    const contract = new this.web3.eth.Contract(abiERC721, address);
    const supportsMetadata = await this.contractSupportsMetadataInterface(
      address,
    );
    if (!supportsMetadata) {
      throw new Error('Contract does not support ERC721 metadata interface.');
    }
    return await contract.methods.tokenURI(tokenId).call();
  };

  /**
   * Query for name for a given asset.
   *
   * @param address - ERC721 asset contract address.
   * @returns Promise resolving to the 'name'.
   */
  getAssetName = async (address: string): Promise<string> => {
    const contract = new this.web3.eth.Contract(abiERC721, address);
    return await contract.methods.name().call();
  };

  /**
   * Query for symbol for a given asset.
   *
   * @param address - ERC721 asset contract address.
   * @returns Promise resolving to the 'symbol'.
   */
  getAssetSymbol = async (address: string): Promise<string> => {
    const contract = new this.web3.eth.Contract(abiERC721, address);
    console.log(contract.methods);
    return await contract.methods.symbol().call();
  };

  /**
   * Query for owner for a given ERC721 asset.
   *
   * @param address - ERC721 asset contract address.
   * @param tokenId - ERC721 asset identifier.
   * @returns Promise resolving to the owner address.
   */
  async getOwnerOf(address: string, tokenId: string): Promise<string> {
    const contract = new this.web3.eth.Contract(abiERC721, address);
    return await contract.methods.ownerOf(tokenId).call();
  }

  /**
   * Query if a contract implements an interface.
   *
   * @param address - Asset contract address.
   * @param interfaceId - Interface identifier.
   * @returns Promise resolving to whether the contract implements `interfaceID`.
   */
  private contractSupportsInterface = async (
    address: string,
    interfaceId: string,
  ): Promise<boolean> => {
    console.log(address, interfaceId);
    const contract = new this.web3.eth.Contract(abiERC721, address);
    const result = await contract.methods.supportsInterface(interfaceId).call();
    console.log('contractSupportsInterface', result);
    return result;
  };

  /**
   * Query if a contract implements an interface.
   *
   * @param address - Asset contract address.
   * @param ipfsGateway - The user's preferred IPFS gateway.
   * @param tokenId - tokenId of a given token in the contract.
   * @returns Promise resolving an object containing the standard, tokenURI, symbol and name of the given contract/tokenId pair.
   */
  getDetails = async (
    address: string,
    ipfsGateway: string,
    tokenId?: string,
  ): Promise<{
    standard: string;
    tokenURI: string | undefined;
    symbol: string | undefined;
    name: string | undefined;
    image: string | undefined;
  }> => {
    const [isERC721, supportsMetadata] = await Promise.all([
      this.contractSupportsBase721Interface(address),
      this.contractSupportsMetadataInterface(address),
    ]);
    let tokenURI, symbol, name, image;
    if (supportsMetadata) {
      [symbol, name] = await Promise.all([
        this.getAssetSymbol(address),
        this.getAssetName(address),
      ]);

      if (tokenId) {
        tokenURI = await this.getTokenURI(address, tokenId);
        if (tokenURI.startsWith('ipfs://')) {
          tokenURI = getFormattedIpfsUrl(ipfsGateway, tokenURI, true);
        }

        try {
          const response = await timeoutFetch(tokenURI);
          const object = await response.json();
          image = object?.image;
          if (image?.startsWith('ipfs://')) {
            image = getFormattedIpfsUrl(ipfsGateway, image, true);
          }
        } catch {
          // ignore
        }
      }
    }

    if (isERC721) {
      return {
        standard: ERC721,
        tokenURI,
        symbol,
        name,
        image,
      };
    }

    throw new Error("This isn't a valid ERC721 contract");
  };
}
