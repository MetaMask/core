import {
  getFormattedIpfsUrl
} from "./chunk-BZEAPSD5.mjs";

// src/Standards/NftStandards/ERC721/ERC721Standard.ts
import { Contract } from "@ethersproject/contracts";
import {
  timeoutFetch,
  ERC721_INTERFACE_ID,
  ERC721_METADATA_INTERFACE_ID,
  ERC721_ENUMERABLE_INTERFACE_ID,
  ERC721,
  safelyExecute
} from "@metamask/controller-utils";
import { abiERC721 } from "@metamask/metamask-eth-abis";
var ERC721Standard = class {
  constructor(provider) {
    /**
     * Query if contract implements ERC721Metadata interface.
     *
     * @param address - ERC721 asset contract address.
     * @returns Promise resolving to whether the contract implements ERC721Metadata interface.
     */
    this.contractSupportsMetadataInterface = async (address) => {
      return this.contractSupportsInterface(
        address,
        ERC721_METADATA_INTERFACE_ID
      );
    };
    /**
     * Query if contract implements ERC721Enumerable interface.
     *
     * @param address - ERC721 asset contract address.
     * @returns Promise resolving to whether the contract implements ERC721Enumerable interface.
     */
    this.contractSupportsEnumerableInterface = async (address) => {
      return this.contractSupportsInterface(
        address,
        ERC721_ENUMERABLE_INTERFACE_ID
      );
    };
    /**
     * Query if contract implements ERC721 interface.
     *
     * @param address - ERC721 asset contract address.
     * @returns Promise resolving to whether the contract implements ERC721 interface.
     */
    this.contractSupportsBase721Interface = async (address) => {
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
    this.getNftTokenId = async (address, selectedAddress, index) => {
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
    this.getTokenURI = async (address, tokenId) => {
      const contract = new Contract(address, abiERC721, this.provider);
      const supportsMetadata = await this.contractSupportsMetadataInterface(
        address
      );
      if (!supportsMetadata) {
        console.error("Contract does not support ERC721 metadata interface.");
      }
      return contract.tokenURI(tokenId);
    };
    /**
     * Query for name for a given asset.
     *
     * @param address - ERC721 asset contract address.
     * @returns Promise resolving to the 'name'.
     */
    this.getAssetName = async (address) => {
      const contract = new Contract(address, abiERC721, this.provider);
      return contract.name();
    };
    /**
     * Query for symbol for a given asset.
     *
     * @param address - ERC721 asset contract address.
     * @returns Promise resolving to the 'symbol'.
     */
    this.getAssetSymbol = async (address) => {
      const contract = new Contract(address, abiERC721, this.provider);
      return contract.symbol();
    };
    /**
     * Query if a contract implements an interface.
     *
     * @param address - Asset contract address.
     * @param interfaceId - Interface identifier.
     * @returns Promise resolving to whether the contract implements `interfaceID`.
     */
    this.contractSupportsInterface = async (address, interfaceId) => {
      const contract = new Contract(address, abiERC721, this.provider);
      try {
        return await contract.supportsInterface(interfaceId);
      } catch (err) {
        if (err instanceof Error && err.message.includes("call revert exception")) {
          return false;
        }
        throw err;
      }
    };
    /**
     * Query if a contract implements an interface.
     *
     * @param address - Asset contract address.
     * @param ipfsGateway - The user's preferred IPFS gateway.
     * @param tokenId - tokenId of a given token in the contract.
     * @returns Promise resolving an object containing the standard, tokenURI, symbol and name of the given contract/tokenId pair.
     */
    this.getDetails = async (address, ipfsGateway, tokenId) => {
      const isERC721 = await this.contractSupportsBase721Interface(address);
      if (!isERC721) {
        throw new Error("This isn't a valid ERC721 contract");
      }
      const [symbol, name, tokenURI] = await Promise.all([
        safelyExecute(() => this.getAssetSymbol(address)),
        safelyExecute(() => this.getAssetName(address)),
        tokenId ? safelyExecute(
          () => this.getTokenURI(address, tokenId).then(
            (uri) => uri.startsWith("ipfs://") ? getFormattedIpfsUrl(ipfsGateway, uri, true) : uri
          )
        ) : void 0
      ]);
      let image;
      if (tokenURI) {
        try {
          const response = await timeoutFetch(tokenURI);
          const object = await response.json();
          image = object?.image;
          if (image?.startsWith("ipfs://")) {
            image = getFormattedIpfsUrl(ipfsGateway, image, true);
          }
        } catch {
        }
      }
      return {
        standard: ERC721,
        tokenURI,
        symbol,
        name,
        image
      };
    };
    this.provider = provider;
  }
  /**
   * Query for owner for a given ERC721 asset.
   *
   * @param address - ERC721 asset contract address.
   * @param tokenId - ERC721 asset identifier.
   * @returns Promise resolving to the owner address.
   */
  async getOwnerOf(address, tokenId) {
    const contract = new Contract(address, abiERC721, this.provider);
    return contract.ownerOf(tokenId);
  }
};

export {
  ERC721Standard
};
//# sourceMappingURL=chunk-3QDXAE2D.mjs.map