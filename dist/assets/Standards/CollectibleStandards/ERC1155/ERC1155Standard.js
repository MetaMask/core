"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERC1155Standard = void 0;
const metamask_eth_abis_1 = require("@metamask/metamask-eth-abis");
const constants_1 = require("../../../../constants");
const util_1 = require("../../../../util");
class ERC1155Standard {
    constructor(web3) {
        /**
         * Query if contract implements ERC1155 URI Metadata interface.
         *
         * @param address - ERC1155 asset contract address.
         * @returns Promise resolving to whether the contract implements ERC1155 URI Metadata interface.
         */
        this.contractSupportsURIMetadataInterface = (address) => __awaiter(this, void 0, void 0, function* () {
            return this.contractSupportsInterface(address, constants_1.ERC1155_METADATA_URI_INTERFACE_ID);
        });
        /**
         * Query if contract implements ERC1155 Token Receiver interface.
         *
         * @param address - ERC1155 asset contract address.
         * @returns Promise resolving to whether the contract implements ERC1155 Token Receiver interface.
         */
        this.contractSupportsTokenReceiverInterface = (address) => __awaiter(this, void 0, void 0, function* () {
            return this.contractSupportsInterface(address, constants_1.ERC1155_TOKEN_RECEIVER_INTERFACE_ID);
        });
        /**
         * Query if contract implements ERC1155 interface.
         *
         * @param address - ERC1155 asset contract address.
         * @returns Promise resolving to whether the contract implements the base ERC1155 interface.
         */
        this.contractSupportsBase1155Interface = (address) => __awaiter(this, void 0, void 0, function* () {
            return this.contractSupportsInterface(address, constants_1.ERC1155_INTERFACE_ID);
        });
        /**
         * Query for tokenURI for a given asset.
         *
         * @param address - ERC1155 asset contract address.
         * @param tokenId - ERC1155 asset identifier.
         * @returns Promise resolving to the 'tokenURI'.
         */
        this.getTokenURI = (address, tokenId) => __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(metamask_eth_abis_1.abiERC1155).at(address);
            return new Promise((resolve, reject) => {
                contract.uri(tokenId, (error, result) => {
                    /* istanbul ignore if */
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(result);
                });
            });
        });
        /**
         * Query for balance of a given ERC1155 token.
         *
         * @param contractAddress - ERC1155 asset contract address.
         * @param address - Wallet public address.
         * @param tokenId - ERC1155 asset identifier.
         * @returns Promise resolving to the 'balanceOf'.
         */
        this.getBalanceOf = (contractAddress, address, tokenId) => __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(metamask_eth_abis_1.abiERC1155).at(contractAddress);
            return new Promise((resolve, reject) => {
                contract.balanceOf(address, tokenId, (error, result) => {
                    /* istanbul ignore if */
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(result);
                });
            });
        });
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
        this.transferSingle = (operator, from, to, id, value) => __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(metamask_eth_abis_1.abiERC1155).at(operator);
            return new Promise((resolve, reject) => {
                contract.transferSingle(operator, from, to, id, value, (error, result) => {
                    /* istanbul ignore if */
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(result);
                });
            });
        });
        /**
         * Query if a contract implements an interface.
         *
         * @param address - ERC1155 asset contract address.
         * @param interfaceId - Interface identifier.
         * @returns Promise resolving to whether the contract implements `interfaceID`.
         */
        this.contractSupportsInterface = (address, interfaceId) => __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(metamask_eth_abis_1.abiERC1155).at(address);
            return new Promise((resolve, reject) => {
                contract.supportsInterface(interfaceId, (error, result) => {
                    /* istanbul ignore if */
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(result);
                });
            });
        });
        /**
         * Query if a contract implements an interface.
         *
         * @param address - Asset contract address.
         * @param ipfsGateway - The user's preferred IPFS gateway.
         * @param tokenId - tokenId of a given token in the contract.
         * @returns Promise resolving an object containing the standard, tokenURI, symbol and name of the given contract/tokenId pair.
         */
        this.getDetails = (address, ipfsGateway, tokenId) => __awaiter(this, void 0, void 0, function* () {
            const isERC1155 = yield this.contractSupportsBase1155Interface(address);
            if (!isERC1155) {
                throw new Error("This isn't a valid ERC1155 contract");
            }
            let tokenURI, image;
            if (tokenId) {
                tokenURI = yield this.getTokenURI(address, tokenId);
                if (tokenURI.startsWith('ipfs://')) {
                    tokenURI = (0, util_1.getFormattedIpfsUrl)(ipfsGateway, tokenURI, true);
                }
                try {
                    const response = yield (0, util_1.timeoutFetch)(tokenURI);
                    const object = yield response.json();
                    image = object === null || object === void 0 ? void 0 : object.image;
                    if (image === null || image === void 0 ? void 0 : image.startsWith('ipfs://')) {
                        image = (0, util_1.getFormattedIpfsUrl)(ipfsGateway, image, true);
                    }
                }
                catch (_a) {
                    // ignore
                }
            }
            // TODO consider querying to the metadata to get name.
            return {
                standard: constants_1.ERC1155,
                tokenURI,
                image,
            };
        });
        this.web3 = web3;
    }
}
exports.ERC1155Standard = ERC1155Standard;
//# sourceMappingURL=ERC1155Standard.js.map