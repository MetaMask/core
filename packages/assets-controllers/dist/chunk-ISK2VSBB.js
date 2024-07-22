"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkMZI3SDQNjs = require('./chunk-MZI3SDQN.js');

// src/Standards/NftStandards/ERC721/ERC721Standard.ts
var _contracts = require('@ethersproject/contracts');







var _controllerutils = require('@metamask/controller-utils');
var _metamaskethabis = require('@metamask/metamask-eth-abis');
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
        _controllerutils.ERC721_METADATA_INTERFACE_ID
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
        _controllerutils.ERC721_ENUMERABLE_INTERFACE_ID
      );
    };
    /**
     * Query if contract implements ERC721 interface.
     *
     * @param address - ERC721 asset contract address.
     * @returns Promise resolving to whether the contract implements ERC721 interface.
     */
    this.contractSupportsBase721Interface = async (address) => {
      return this.contractSupportsInterface(address, _controllerutils.ERC721_INTERFACE_ID);
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
      const contract = new (0, _contracts.Contract)(address, _metamaskethabis.abiERC721, this.provider);
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
      const contract = new (0, _contracts.Contract)(address, _metamaskethabis.abiERC721, this.provider);
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
      const contract = new (0, _contracts.Contract)(address, _metamaskethabis.abiERC721, this.provider);
      return contract.name();
    };
    /**
     * Query for symbol for a given asset.
     *
     * @param address - ERC721 asset contract address.
     * @returns Promise resolving to the 'symbol'.
     */
    this.getAssetSymbol = async (address) => {
      const contract = new (0, _contracts.Contract)(address, _metamaskethabis.abiERC721, this.provider);
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
      const contract = new (0, _contracts.Contract)(address, _metamaskethabis.abiERC721, this.provider);
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
        _controllerutils.safelyExecute.call(void 0, () => this.getAssetSymbol(address)),
        _controllerutils.safelyExecute.call(void 0, () => this.getAssetName(address)),
        tokenId ? _controllerutils.safelyExecute.call(void 0, 
          () => this.getTokenURI(address, tokenId).then(
            (uri) => uri.startsWith("ipfs://") ? _chunkMZI3SDQNjs.getFormattedIpfsUrl.call(void 0, ipfsGateway, uri, true) : uri
          )
        ) : void 0
      ]);
      let image;
      if (tokenURI) {
        try {
          const response = await _controllerutils.timeoutFetch.call(void 0, tokenURI);
          const object = await response.json();
          image = object?.image;
          if (image?.startsWith("ipfs://")) {
            image = _chunkMZI3SDQNjs.getFormattedIpfsUrl.call(void 0, ipfsGateway, image, true);
          }
        } catch {
        }
      }
      return {
        standard: _controllerutils.ERC721,
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
    const contract = new (0, _contracts.Contract)(address, _metamaskethabis.abiERC721, this.provider);
    return contract.ownerOf(tokenId);
  }
};



exports.ERC721Standard = ERC721Standard;
//# sourceMappingURL=chunk-ISK2VSBB.js.map