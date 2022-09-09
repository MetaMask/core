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
exports.ERC20Standard = void 0;
const metamask_eth_abis_1 = require("@metamask/metamask-eth-abis");
const ethereumjs_util_1 = require("ethereumjs-util");
const utils_1 = require("ethers/lib/utils");
const constants_1 = require("../../constants");
class ERC20Standard {
    constructor(web3) {
        this.web3 = web3;
    }
    /**
     * Get balance or count for current account on specific asset contract.
     *
     * @param address - Asset ERC20 contract address.
     * @param selectedAddress - Current account public address.
     * @returns Promise resolving to BN object containing balance for current account on specific asset contract.
     */
    getBalanceOf(address, selectedAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(metamask_eth_abis_1.abiERC20).at(address);
            return new Promise((resolve, reject) => {
                contract.balanceOf(selectedAddress, (error, result) => {
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
     * Query for the decimals for a given ERC20 asset.
     *
     * @param address - ERC20 asset contract string.
     * @returns Promise resolving to the 'decimals'.
     */
    getTokenDecimals(address) {
        return __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(metamask_eth_abis_1.abiERC20).at(address);
            return new Promise((resolve, reject) => {
                contract.decimals((error, result) => {
                    /* istanbul ignore if */
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(result.toString());
                });
            });
        });
    }
    /**
     * Query for symbol for a given ERC20 asset.
     *
     * @param address - ERC20 asset contract address.
     * @returns Promise resolving to the 'symbol'.
     */
    getTokenSymbol(address) {
        return __awaiter(this, void 0, void 0, function* () {
            // Signature for calling `symbol()`
            const payload = { to: address, data: '0x95d89b41' };
            return new Promise((resolve, reject) => {
                this.web3.eth.call(payload, undefined, (error, result) => {
                    /* istanbul ignore if */
                    if (error) {
                        reject(error);
                        return;
                    }
                    const abiCoder = new utils_1.AbiCoder();
                    // Parse as string
                    try {
                        const decoded = abiCoder.decode(['string'], result)[0];
                        if (decoded) {
                            resolve(decoded);
                            return;
                        }
                    }
                    catch (_a) {
                        // Ignore error
                    }
                    // Parse as bytes
                    try {
                        const utf8 = (0, ethereumjs_util_1.toUtf8)(result);
                        resolve(utf8);
                        return;
                    }
                    catch (_b) {
                        // Ignore error
                    }
                    reject(new Error('Failed to parse token symbol'));
                });
            });
        });
    }
    /**
     * Query if a contract implements an interface.
     *
     * @param address - Asset contract address.
     * @param userAddress - The public address for the currently active user's account.
     * @returns Promise resolving an object containing the standard, decimals, symbol and balance of the given contract/userAddress pair.
     */
    getDetails(address, userAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            const [decimals, symbol] = yield Promise.all([
                this.getTokenDecimals(address),
                this.getTokenSymbol(address),
            ]);
            let balance;
            if (userAddress) {
                balance = yield this.getBalanceOf(address, userAddress);
            }
            return {
                decimals,
                symbol,
                balance,
                standard: constants_1.ERC20,
            };
        });
    }
}
exports.ERC20Standard = ERC20Standard;
//# sourceMappingURL=ERC20Standard.js.map