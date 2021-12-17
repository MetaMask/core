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
const ERC721_METADATA_INTERFACE_ID = '0x5b5e139f';
const ERC721_ENUMERABLE_INTERFACE_ID = '0x780e9d63';
class ERC721Standard {
    constructor() {
        /**
         * Query if contract implements ERC721Metadata interface.
         *
         * @param contract - ERC721 asset contract.
         * @returns Promise resolving to whether the contract implements ERC721Metadata interface.
         */
        this.contractSupportsMetadataInterface = (contract) => __awaiter(this, void 0, void 0, function* () {
            return this.contractSupportsInterface(contract, ERC721_METADATA_INTERFACE_ID);
        });
        /**
         * Query if contract implements ERC721Enumerable interface.
         *
         * @param contract - ERC721 asset contract.
         * @returns Promise resolving to whether the contract implements ERC721Enumerable interface.
         */
        this.contractSupportsEnumerableInterface = (contract) => __awaiter(this, void 0, void 0, function* () {
            return this.contractSupportsInterface(contract, ERC721_ENUMERABLE_INTERFACE_ID);
        });
        /**
         * Enumerate assets assigned to an owner.
         *
         * @param contract - ERC721 asset contract.
         * @param selectedAddress - Current account public address.
         * @param index - A collectible counter less than `balanceOf(selectedAddress)`.
         * @returns Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'.
         */
        this.getCollectibleTokenId = (contract, selectedAddress, index) => __awaiter(this, void 0, void 0, function* () {
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
         * @param contract - ERC721 asset contract.
         * @param tokenId - ERC721 asset identifier.
         * @returns Promise resolving to the 'tokenURI'.
         */
        this.getCollectibleTokenURI = (contract, tokenId) => __awaiter(this, void 0, void 0, function* () {
            const supportsMetadata = yield this.contractSupportsMetadataInterface(contract);
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
         * @param contract - ERC721 asset contract.
         * @returns Promise resolving to the 'name'.
         */
        this.getAssetName = (contract) => __awaiter(this, void 0, void 0, function* () {
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
         * @param contract - ERC721 asset contract address.
         * @returns Promise resolving to the 'symbol'.
         */
        this.getAssetSymbol = (contract) => __awaiter(this, void 0, void 0, function* () {
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
         * @param contract - Asset contract.
         * @param interfaceId - Interface identifier.
         * @returns Promise resolving to whether the contract implements `interfaceID`.
         */
        this.contractSupportsInterface = (contract, interfaceId) => __awaiter(this, void 0, void 0, function* () {
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
    }
    /**
     * Query for owner for a given ERC721 asset.
     *
     * @param contract - ERC721 asset contract.
     * @param tokenId - ERC721 asset identifier.
     * @returns Promise resolving to the owner address.
     */
    getOwnerOf(contract, tokenId) {
        return __awaiter(this, void 0, void 0, function* () {
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