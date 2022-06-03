import { abiERC721 } from '@metamask/metamask-eth-abis';
import { Contract } from 'ethers';
import {
  timeoutFetch,
  ERC721_INTERFACE_ID,
  ERC721_METADATA_INTERFACE_ID,
  ERC721_ENUMERABLE_INTERFACE_ID,
  ERC721,
} from '@metamask/controller-utils';
import { getFormattedIpfsUrl } from '../../../assetsUtil';

export class ERC721Standard {
  private provider: StaticWeb3Provider;

  constructor(provider: StaticWeb3Provider) {
    this.provider = provider;
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
    return this.contractSupportsInterface(
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
    return this.contractSupportsInterface(
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
    return this.contractSupportsInterface(address, ERC721_INTERFACE_ID);
  };

  /**
   * Enumerate assets assigned to an owner.
   *
   * @param address - ERC721 asset contract address.
   * @param selectedAddress - Current account public address.
   * @param index - An NFT counter less than `balanceOf(selectedAddress)`.
   * @returns Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'.
   */
  getNftTokenId = async (
    address: string,
    selectedAddress: string,
    index: number,
  ): Promise<string> => {
    const contract = new Contract(address, abiERC721, this.provider);
    return contract.tokenOfOwnerByIndex(selectedAddress, index);
  };

  /**
   * Query for tokenURI for a given asset.
   *
   * @param address - ERC721 asset contract address.
   * @param tokenId - ERC721 asset identifier.
   * @returns Promise resolving to the 'tokenURI'.
   */
  getTokenURI = async (address: string, tokenId: string): Promise<string> => {
    const contract = new Contract(address, abiERC721, this.provider);
    const supportsMetadata = await this.contractSupportsMetadataInterface(
      address,
    );
    if (!supportsMetadata) {
      throw new Error('Contract does not support ERC721 metadata interface.');
    }
    return contract.tokenURI(tokenId);
  };

  /**
   * Query for name for a given asset.
   *
   * @param address - ERC721 asset contract address.
   * @returns Promise resolving to the 'name'.
   */
  getAssetName = async (address: string): Promise<string> => {
    const contract = new Contract(address, abiERC721, this.provider);
    return contract.name();
  };

  /**
   * Query for symbol for a given asset.
   *
   * @param address - ERC721 asset contract address.
   * @returns Promise resolving to the 'symbol'.
   */
  getAssetSymbol = async (address: string): Promise<string> => {
    const contract = new Contract(address, abiERC721, this.provider);
    return contract.symbol();
  };

  /**
   * Query for owner for a given ERC721 asset.
   *
   * @param address - ERC721 asset contract address.
   * @param tokenId - ERC721 asset identifier.
   * @returns Promise resolving to the owner address.
   */
  async getOwnerOf(address: string, tokenId: string): Promise<string> {
    const contract = new Contract(address, abiERC721, this.provider);
    return contract.ownerOf(tokenId);
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
    const contract = new Contract(address, abiERC721, this.provider);
    return contract.supportsInterface(interfaceId);
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
    const isERC721 = await this.contractSupportsBase721Interface(address);
    if (!isERC721) {
      throw new Error("This isn't a valid ERC721 contract");
    }

    let tokenURI, image, symbol, name;

    // TODO upgrade to use Promise.allSettled for name/symbol when we can refactor to use es2020 in tsconfig
    try {
      symbol = await this.getAssetSymbol(address);
    } catch {
      // ignore
    }

    try {
      name = await this.getAssetName(address);
    } catch {
      // ignore
    }

    if (tokenId) {
      try {
        tokenURI = await this.getTokenURI(address, tokenId);
        if (tokenURI.startsWith('ipfs://')) {
          tokenURI = getFormattedIpfsUrl(ipfsGateway, tokenURI, true);
        }

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

    return {
      standard: ERC721,
      tokenURI,
      symbol,
      name,
      image,
    };
  };
}
