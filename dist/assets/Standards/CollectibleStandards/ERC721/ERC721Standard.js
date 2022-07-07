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
exports.ERC721Standard = void 0;
const metamask_eth_abis_1 = require("@metamask/metamask-eth-abis");
const util_1 = require("../../../../util");
const constants_1 = require("../../../../constants");
class ERC721Standard {
    constructor(web3) {
        /**
         * Query if contract implements ERC721Metadata interface.
         *
         * @param address - ERC721 asset contract address.
         * @returns Promise resolving to whether the contract implements ERC721Metadata interface.
         */
        this.contractSupportsMetadataInterface = (address) => __awaiter(this, void 0, void 0, function* () {
            return this.contractSupportsInterface(address, constants_1.ERC721_METADATA_INTERFACE_ID);
        });
        /**
         * Query if contract implements ERC721Enumerable interface.
         *
         * @param address - ERC721 asset contract address.
         * @returns Promise resolving to whether the contract implements ERC721Enumerable interface.
         */
        this.contractSupportsEnumerableInterface = (address) => __awaiter(this, void 0, void 0, function* () {
            return this.contractSupportsInterface(address, constants_1.ERC721_ENUMERABLE_INTERFACE_ID);
        });
        /**
         * Query if contract implements ERC721 interface.
         *
         * @param address - ERC721 asset contract address.
         * @returns Promise resolving to whether the contract implements ERC721 interface.
         */
        this.contractSupportsBase721Interface = (address) => __awaiter(this, void 0, void 0, function* () {
            return this.contractSupportsInterface(address, constants_1.ERC721_INTERFACE_ID);
        });
        /**
         * Enumerate assets assigned to an owner.
         *
         * @param address - ERC721 asset contract address.
         * @param selectedAddress - Current account public address.
         * @param index - A collectible counter less than `balanceOf(selectedAddress)`.
         * @returns Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'.
         */
        this.getCollectibleTokenId = (address, selectedAddress, index) => __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(metamask_eth_abis_1.abiERC721).at(address);
            return new Promise((resolve, reject) => {
                contract.tokenOfOwnerByIndex(selectedAddress, index, (error, result) => {
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
         * Query for tokenURI for a given asset.
         *
         * @param address - ERC721 asset contract address.
         * @param tokenId - ERC721 asset identifier.
         * @returns Promise resolving to the 'tokenURI'.
         */
        this.getTokenURI = (address, tokenId) => __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(metamask_eth_abis_1.abiERC721).at(address);
            const supportsMetadata = yield this.contractSupportsMetadataInterface(address);
            if (!supportsMetadata) {
                throw new Error('Contract does not support ERC721 metadata interface.');
            }
            return new Promise((resolve, reject) => {
                contract.tokenURI(tokenId, (error, result) => {
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
         * Query for name for a given asset.
         *
         * @param address - ERC721 asset contract address.
         * @returns Promise resolving to the 'name'.
         */
        this.getAssetName = (address) => __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(metamask_eth_abis_1.abiERC721).at(address);
            return new Promise((resolve, reject) => {
                contract.name((error, result) => {
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
         * Query for symbol for a given asset.
         *
         * @param address - ERC721 asset contract address.
         * @returns Promise resolving to the 'symbol'.
         */
        this.getAssetSymbol = (address) => __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(metamask_eth_abis_1.abiERC721).at(address);
            return new Promise((resolve, reject) => {
                contract.symbol((error, result) => {
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
         * @param interfaceId - Interface identifier.
         * @returns Promise resolving to whether the contract implements `interfaceID`.
         */
        this.contractSupportsInterface = (address, interfaceId) => __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(metamask_eth_abis_1.abiERC721).at(address);
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
            const isERC721 = yield this.contractSupportsBase721Interface(address);
            if (!isERC721) {
                throw new Error("This isn't a valid ERC721 contract");
            }
            let tokenURI, image, symbol, name;
            // TODO upgrade to use Promise.allSettled for name/symbol when we can refactor to use es2020 in tsconfig
            try {
                symbol = yield this.getAssetSymbol(address);
            }
            catch (_a) {
                // ignore
            }
            try {
                name = yield this.getAssetName(address);
            }
            catch (_b) {
                // ignore
            }
            if (tokenId) {
                try {
                    tokenURI = yield this.getTokenURI(address, tokenId);
                    if (tokenURI.startsWith('ipfs://')) {
                        tokenURI = (0, util_1.getFormattedIpfsUrl)(ipfsGateway, tokenURI, true);
                    }
                    const response = yield (0, util_1.timeoutFetch)(tokenURI);
                    const object = yield response.json();
                    image = object === null || object === void 0 ? void 0 : object.image;
                    if (image === null || image === void 0 ? void 0 : image.startsWith('ipfs://')) {
                        image = (0, util_1.getFormattedIpfsUrl)(ipfsGateway, image, true);
                    }
                }
                catch (_c) {
                    // ignore
                }
            }
            return {
                standard: constants_1.ERC721,
                tokenURI,
                symbol,
                name,
                image,
            };
        });
        this.web3 = web3;
    }
    /**
     * Query for owner for a given ERC721 asset.
     *
     * @param address - ERC721 asset contract address.
     * @param tokenId - ERC721 asset identifier.
     * @returns Promise resolving to the owner address.
     */
    getOwnerOf(address, tokenId) {
        return __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(metamask_eth_abis_1.abiERC721).at(address);
            return new Promise((resolve, reject) => {
                contract.ownerOf(tokenId, (error, result) => {
                    /* istanbul ignore if */
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(result);
                });
            });
        });
    }
}
exports.ERC721Standard = ERC721Standard;
//# sourceMappingURL=ERC721Standard.js.map