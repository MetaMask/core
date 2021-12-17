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
const ERC1155_METADATA_URI_INTERFACE_ID = '0x0e89341c';
const ERC1155_TOKEN_RECEIVER_INTERFACE_ID = '0x4e2312e0';
class ERC1155Standard {
    constructor() {
        /**
         * Query if contract implements ERC1155 URI Metadata interface.
         *
         * @param contract - ERC1155 asset contract.
         * @returns Promise resolving to whether the contract implements ERC1155 URI Metadata interface.
         */
        this.contractSupportsURIMetadataInterface = (contract) => __awaiter(this, void 0, void 0, function* () {
            return this.contractSupportsInterface(contract, ERC1155_METADATA_URI_INTERFACE_ID);
        });
        /**
         * Query if contract implements ERC1155 Token Receiver interface.
         *
         * @param contract - ERC1155 asset contract.
         * @returns Promise resolving to whether the contract implements ERC1155 Token Receiver interface.
         */
        this.contractSupportsTokenReceiverInterface = (contract) => __awaiter(this, void 0, void 0, function* () {
            return this.contractSupportsInterface(contract, ERC1155_TOKEN_RECEIVER_INTERFACE_ID);
        });
        /**
         * Query for tokenURI for a given asset.
         *
         * @param contract - ERC1155 asset contract.
         * @param tokenId - ERC1155 asset identifier.
         * @returns Promise resolving to the 'tokenURI'.
         */
        this.uri = (contract, tokenId) => __awaiter(this, void 0, void 0, function* () {
            const { uri } = contract.methods;
            return yield uri(tokenId).call();
        });
        /**
         * Query for balance of a given ERC1155 token.
         *
         * @param contract - ERC1155 asset contract.
         * @param address - Wallet public address.
         * @param tokenId - ERC1155 asset identifier.
         * @returns Promise resolving to the 'balanceOf'.
         */
        this.getBalanceOf = (contract, address, tokenId) => __awaiter(this, void 0, void 0, function* () {
            const { balanceOf } = contract.methods;
            return yield balanceOf(address, tokenId).call();
        });
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
        this.transferSingle = (contract, operator, from, to, id, value) => __awaiter(this, void 0, void 0, function* () {
            const { transferSingle } = contract.methods;
            return yield transferSingle(operator, from, to, id, value);
        });
        /**
         * Query if a contract implements an interface.
         *
         * @param contract - ERC1155 asset contract.
         * @param interfaceId - Interface identifier.
         * @returns Promise resolving to whether the contract implements `interfaceID`.
         */
        this.contractSupportsInterface = (contract, interfaceId) => __awaiter(this, void 0, void 0, function* () {
            const { supportsInterface } = contract.methods;
            return supportsInterface(interfaceId).call();
        });
    }
}
exports.ERC1155Standard = ERC1155Standard;
//# sourceMappingURL=ERC1155Standard.js.map