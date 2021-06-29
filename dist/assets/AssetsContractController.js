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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssetsContractController = void 0;
const web3_1 = __importDefault(require("web3"));
const human_standard_token_abi_1 = __importDefault(require("human-standard-token-abi"));
const human_standard_collectible_abi_1 = __importDefault(require("human-standard-collectible-abi"));
const single_call_balance_checker_abi_1 = __importDefault(require("single-call-balance-checker-abi"));
const BaseController_1 = __importDefault(require("../BaseController"));
const ERC721METADATA_INTERFACE_ID = '0x5b5e139f';
const ERC721ENUMERABLE_INTERFACE_ID = '0x780e9d63';
const SINGLE_CALL_BALANCES_ADDRESS = '0xb1f8e55c7f64d203c1400b9d8555d050f94adf39';
/**
 * Controller that interacts with contracts on mainnet through web3
 */
class AssetsContractController extends BaseController_1.default {
    /**
     * Creates a AssetsContractController instance
     *
     * @param config - Initial options used to configure this controller
     * @param state - Initial state to set on this controller
     */
    constructor(config, state) {
        super(config, state);
        /**
         * Name of this controller used during composition
         */
        this.name = 'AssetsContractController';
        this.defaultConfig = {
            provider: undefined,
        };
        this.initialize();
    }
    /**
     *
     * Query if a contract implements an interface
     *
     * @param address - Asset contract address
     * @param interfaceId - Interface identifier
     * @returns - Promise resolving to whether the contract implements `interfaceID`
     */
    contractSupportsInterface(address, interfaceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(human_standard_collectible_abi_1.default).at(address);
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
     * Sets a new provider
     *
     * TODO: Replace this wth a method
     *
     * @property provider - Provider used to create a new underlying Web3 instance
     */
    set provider(provider) {
        this.web3 = new web3_1.default(provider);
    }
    get provider() {
        throw new Error('Property only used for setting');
    }
    /**
     * Query if contract implements ERC721Metadata interface
     *
     * @param address - ERC721 asset contract address
     * @returns - Promise resolving to whether the contract implements ERC721Metadata interface
     */
    contractSupportsMetadataInterface(address) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.contractSupportsInterface(address, ERC721METADATA_INTERFACE_ID);
        });
    }
    /**
     * Query if contract implements ERC721Enumerable interface
     *
     * @param address - ERC721 asset contract address
     * @returns - Promise resolving to whether the contract implements ERC721Enumerable interface
     */
    contractSupportsEnumerableInterface(address) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.contractSupportsInterface(address, ERC721ENUMERABLE_INTERFACE_ID);
        });
    }
    /**
     * Get balance or count for current account on specific asset contract
     *
     * @param address - Asset contract address
     * @param selectedAddress - Current account public address
     * @returns - Promise resolving to BN object containing balance for current account on specific asset contract
     */
    getBalanceOf(address, selectedAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(human_standard_token_abi_1.default).at(address);
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
     * Enumerate assets assigned to an owner
     *
     * @param address - ERC721 asset contract address
     * @param selectedAddress - Current account public address
     * @param index - A collectible counter less than `balanceOf(selectedAddress)`
     * @returns - Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'
     */
    getCollectibleTokenId(address, selectedAddress, index) {
        const contract = this.web3.eth.contract(human_standard_collectible_abi_1.default).at(address);
        return new Promise((resolve, reject) => {
            contract.tokenOfOwnerByIndex(selectedAddress, index, (error, result) => {
                /* istanbul ignore if */
                if (error) {
                    reject(error);
                    return;
                }
                resolve(result.toNumber());
            });
        });
    }
    /**
     * Query for tokenURI for a given asset
     *
     * @param address - ERC721 asset contract address
     * @param tokenId - ERC721 asset identifier
     * @returns - Promise resolving to the 'tokenURI'
     */
    getCollectibleTokenURI(address, tokenId) {
        return __awaiter(this, void 0, void 0, function* () {
            const supportsMetadata = yield this.contractSupportsMetadataInterface(address);
            if (!supportsMetadata) {
                return '';
            }
            const contract = this.web3.eth.contract(human_standard_collectible_abi_1.default).at(address);
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
    }
    /**
     * Query for name for a given ERC20 asset
     *
     * @param address - ERC20 asset contract address
     * @returns - Promise resolving to the 'decimals'
     */
    getTokenDecimals(address) {
        return __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(human_standard_token_abi_1.default).at(address);
            return new Promise((resolve, reject) => {
                contract.decimals((error, result) => {
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
     * Query for name for a given asset
     *
     * @param address - ERC721 or ERC20 asset contract address
     * @returns - Promise resolving to the 'name'
     */
    getAssetName(address) {
        return __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(human_standard_collectible_abi_1.default).at(address);
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
    }
    /**
     * Query for symbol for a given asset
     *
     * @param address - ERC721 or ERC20 asset contract address
     * @returns - Promise resolving to the 'symbol'
     */
    getAssetSymbol(address) {
        return __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(human_standard_collectible_abi_1.default).at(address);
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
    }
    /**
     * Query for owner for a given ERC721 asset
     *
     * @param address - ERC721 asset contract address
     * @param tokenId - ERC721 asset identifier
     * @returns - Promise resolving to the owner address
     */
    getOwnerOf(address, tokenId) {
        return __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(human_standard_collectible_abi_1.default).at(address);
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
    /**
     * Returns contract instance of
     *
     * @returns - Promise resolving to the 'tokenURI'
     */
    getBalancesInSingleCall(selectedAddress, tokensToDetect) {
        return __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth
                .contract(single_call_balance_checker_abi_1.default)
                .at(SINGLE_CALL_BALANCES_ADDRESS);
            return new Promise((resolve, reject) => {
                contract.balances([selectedAddress], tokensToDetect, (error, result) => {
                    /* istanbul ignore if */
                    if (error) {
                        reject(error);
                        return;
                    }
                    const nonZeroBalances = {};
                    /* istanbul ignore else */
                    if (result.length > 0) {
                        tokensToDetect.forEach((tokenAddress, index) => {
                            const balance = result[index];
                            /* istanbul ignore else */
                            if (!balance.isZero()) {
                                nonZeroBalances[tokenAddress] = balance;
                            }
                        });
                    }
                    resolve(nonZeroBalances);
                });
            });
        });
    }
}
exports.AssetsContractController = AssetsContractController;
exports.default = AssetsContractController;
//# sourceMappingURL=AssetsContractController.js.map