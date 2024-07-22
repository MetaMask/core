"use strict";Object.defineProperty(exports, "__esModule", {value: true});


var _chunkMZI3SDQNjs = require('./chunk-MZI3SDQN.js');

// src/Standards/NftStandards/ERC1155/ERC1155Standard.ts
var _contracts = require('@ethersproject/contracts');







var _controllerutils = require('@metamask/controller-utils');
var _metamaskethabis = require('@metamask/metamask-eth-abis');
var ERC1155Standard = class {
  constructor(provider) {
    this.provider = provider;
  }
  /**
   * Query if contract implements ERC1155 URI Metadata interface.
   *
   * @param address - ERC1155 asset contract address.
   * @returns Promise resolving to whether the contract implements ERC1155 URI Metadata interface.
   */
  async contractSupportsURIMetadataInterface(address) {
    return this.contractSupportsInterface(
      address,
      _controllerutils.ERC1155_METADATA_URI_INTERFACE_ID
    );
  }
  /**
   * Query if contract implements ERC1155 Token Receiver interface.
   *
   * @param address - ERC1155 asset contract address.
   * @returns Promise resolving to whether the contract implements ERC1155 Token Receiver interface.
   */
  async contractSupportsTokenReceiverInterface(address) {
    return this.contractSupportsInterface(
      address,
      _controllerutils.ERC1155_TOKEN_RECEIVER_INTERFACE_ID
    );
  }
  /**
   * Query if contract implements ERC1155 interface.
   *
   * @param address - ERC1155 asset contract address.
   * @returns Promise resolving to whether the contract implements the base ERC1155 interface.
   */
  async contractSupportsBase1155Interface(address) {
    return this.contractSupportsInterface(address, _controllerutils.ERC1155_INTERFACE_ID);
  }
  /**
   * Query for tokenURI for a given asset.
   *
   * @param address - ERC1155 asset contract address.
   * @param tokenId - ERC1155 asset identifier.
   * @returns Promise resolving to the 'tokenURI'.
   */
  async getTokenURI(address, tokenId) {
    const contract = new (0, _contracts.Contract)(address, _metamaskethabis.abiERC1155, this.provider);
    return contract.uri(tokenId);
  }
  /**
   * Query for balance of a given ERC1155 token.
   *
   * @param contractAddress - ERC1155 asset contract address.
   * @param address - Wallet public address.
   * @param tokenId - ERC1155 asset identifier.
   * @returns Promise resolving to the 'balanceOf'.
   */
  async getBalanceOf(contractAddress, address, tokenId) {
    const contract = new (0, _contracts.Contract)(contractAddress, _metamaskethabis.abiERC1155, this.provider);
    const balance = await contract.balanceOf(address, tokenId);
    return _chunkMZI3SDQNjs.ethersBigNumberToBN.call(void 0, balance);
  }
  /**
   * Transfer single ERC1155 token.
   * When minting/creating tokens, the from arg MUST be set to 0x0 (i.e. zero address).
   * When burning/destroying tokens, the to arg MUST be set to 0x0 (i.e. zero address).
   *
   * @param operator - ERC1155 token address.
   * @param from - ERC1155 token holder.
   * @param to - ERC1155 token recipient.
   * @param id - ERC1155 token id.
   * @param value - Number of tokens to be sent.
   * @returns Promise resolving to the 'transferSingle'.
   */
  async transferSingle(operator, from, to, id, value) {
    const contract = new (0, _contracts.Contract)(operator, _metamaskethabis.abiERC1155, this.provider);
    return new Promise((resolve, reject) => {
      contract.transferSingle(
        operator,
        from,
        to,
        id,
        value,
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(result);
        }
      );
    });
  }
  /**
   * Query for symbol for a given asset.
   *
   * @param address - ERC1155 asset contract address.
   * @returns Promise resolving to the 'symbol'.
   */
  async getAssetSymbol(address) {
    const contract = new (0, _contracts.Contract)(
      address,
      // Contract ABI fragment containing only the symbol method to fetch the symbol of the contract.
      [
        {
          inputs: [],
          name: "symbol",
          outputs: [{ name: "_symbol", type: "string" }],
          stateMutability: "view",
          type: "function",
          payable: false
        }
      ],
      this.provider
    );
    return contract.symbol();
  }
  /**
   * Query for name for a given asset.
   *
   * @param address - ERC1155 asset contract address.
   * @returns Promise resolving to the 'name'.
   */
  async getAssetName(address) {
    const contract = new (0, _contracts.Contract)(
      address,
      // Contract ABI fragment containing only the name method to fetch the name of the contract.
      [
        {
          inputs: [],
          name: "name",
          outputs: [{ name: "_name", type: "string" }],
          stateMutability: "view",
          type: "function",
          payable: false
        }
      ],
      this.provider
    );
    return contract.name();
  }
  /**
   * Query if a contract implements an interface.
   *
   * @param address - ERC1155 asset contract address.
   * @param interfaceId - Interface identifier.
   * @returns Promise resolving to whether the contract implements `interfaceID`.
   */
  async contractSupportsInterface(address, interfaceId) {
    const contract = new (0, _contracts.Contract)(address, _metamaskethabis.abiERC1155, this.provider);
    return contract.supportsInterface(interfaceId);
  }
  /**
   * Query if a contract implements an interface.
   *
   * @param address - Asset contract address.
   * @param ipfsGateway - The user's preferred IPFS gateway.
   * @param tokenId - tokenId of a given token in the contract.
   * @returns Promise resolving an object containing the standard, tokenURI, symbol and name of the given contract/tokenId pair.
   */
  async getDetails(address, ipfsGateway, tokenId) {
    const isERC1155 = await this.contractSupportsBase1155Interface(address);
    if (!isERC1155) {
      throw new Error("This isn't a valid ERC1155 contract");
    }
    let image;
    const [symbol, name, tokenURI] = await Promise.all([
      _controllerutils.safelyExecute.call(void 0, () => this.getAssetSymbol(address)),
      _controllerutils.safelyExecute.call(void 0, () => this.getAssetName(address)),
      tokenId ? _controllerutils.safelyExecute.call(void 0, 
        () => this.getTokenURI(address, tokenId).then(
          (uri) => uri.startsWith("ipfs://") ? _chunkMZI3SDQNjs.getFormattedIpfsUrl.call(void 0, ipfsGateway, uri, true) : uri
        )
      ) : void 0
    ]);
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
      standard: _controllerutils.ERC1155,
      tokenURI,
      image,
      symbol,
      name
    };
  }
};



exports.ERC1155Standard = ERC1155Standard;
//# sourceMappingURL=chunk-5QLC2MHV.js.map