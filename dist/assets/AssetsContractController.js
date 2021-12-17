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
const human_standard_multi_collectible_abi_1 = __importDefault(require("human-standard-multi-collectible-abi"));
const single_call_balance_checker_abi_1 = __importDefault(require("single-call-balance-checker-abi"));
const BaseController_1 = require("../BaseController");
const ERC721Standard_1 = require("./CollectibleStandards/ERC721/ERC721Standard");
const ERC1155Standard_1 = require("./CollectibleStandards/ERC1155/ERC1155Standard");
const SINGLE_CALL_BALANCES_ADDRESS = '0xb1f8e55c7f64d203c1400b9d8555d050f94adf39';
/**
 * Controller that interacts with contracts on mainnet through web3
 */
class AssetsContractController extends BaseController_1.BaseController {
    /**
     * Creates a AssetsContractController instance.
     *
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor(config, state) {
        super(config, state);
        this.erc721Standard = new ERC721Standard_1.ERC721Standard();
        this.erc1155Standard = new ERC1155Standard_1.ERC1155Standard();
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
     * Sets a new provider.
     *
     * TODO: Replace this wth a method.
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
     * Get balance or count for current account on specific asset contract.
     *
     * @param address - Asset ERC20 contract address.
     * @param selectedAddress - Current account public address.
     * @returns Promise resolving to BN object containing balance for current account on specific asset contract.
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
     * Query for name for a given ERC20 asset.
     *
     * @param address - ERC20 asset contract address.
     * @returns Promise resolving to the 'decimals'.
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
     * Enumerate assets assigned to an owner.
     *
     * @param address - ERC721 asset contract address.
     * @param selectedAddress - Current account public address.
     * @param index - A collectible counter less than `balanceOf(selectedAddress)`.
     * @returns Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'.
     */
    getCollectibleTokenId(address, selectedAddress, index) {
        const contract = this.web3.eth.contract(human_standard_collectible_abi_1.default).at(address);
        return this.erc721Standard.getCollectibleTokenId(contract, selectedAddress, index);
    }
    /**
     * Query for tokenURI for a given asset.
     *
     * @param address - ERC721 asset contract address.
     * @param tokenId - ERC721 asset identifier.
     * @returns Promise resolving to the 'tokenURI'.
     */
    getCollectibleTokenURI(address, tokenId) {
        return __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(human_standard_collectible_abi_1.default).at(address);
            return this.erc721Standard.getCollectibleTokenURI(contract, tokenId);
        });
    }
    /**
     * Query for name for a given asset.
     *
     * @param address - ERC721 or ERC20 asset contract address.
     * @returns Promise resolving to the 'name'.
     */
    getAssetName(address) {
        return __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(human_standard_collectible_abi_1.default).at(address);
            return this.erc721Standard.getAssetName(contract);
        });
    }
    /**
     * Query for symbol for a given asset.
     *
     * @param address - ERC721 or ERC20 asset contract address.
     * @returns Promise resolving to the 'symbol'.
     */
    getAssetSymbol(address) {
        return __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(human_standard_collectible_abi_1.default).at(address);
            return this.erc721Standard.getAssetSymbol(contract);
        });
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
            const contract = this.web3.eth.contract(human_standard_collectible_abi_1.default).at(address);
            return this.erc721Standard.getOwnerOf(contract, tokenId);
        });
    }
    /**
     * Query for tokenURI for a given asset.
     *
     * @param address - ERC1155 asset contract address.
     * @param tokenId - ERC1155 asset identifier.
     * @returns Promise resolving to the 'tokenURI'.
     */
    uriERC1155Collectible(address, tokenId) {
        return __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(human_standard_multi_collectible_abi_1.default).at(address);
            return this.erc1155Standard.uri(contract, tokenId);
        });
    }
    /**
     * Query for balance of a given ERC 1155 token.
     *
     * @param userAddress - Wallet public address.
     * @param collectibleAddress - ERC1155 asset contract address.
     * @param collectibleId - ERC1155 asset identifier.
     * @returns Promise resolving to the 'balanceOf'.
     */
    balanceOfERC1155Collectible(userAddress, collectibleAddress, collectibleId) {
        return __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(human_standard_multi_collectible_abi_1.default).at(collectibleAddress);
            return yield this.erc1155Standard.getBalanceOf(contract, userAddress, collectibleId);
        });
    }
    /**
     * Transfer single ERC1155 token.
     *
     * @param collectibleAddress - ERC1155 token address.
     * @param senderAddress - ERC1155 token sender.
     * @param recipientAddress - ERC1155 token recipient.
     * @param collectibleId - ERC1155 token id.
     * @param qty - Quantity of tokens to be sent.
     * @returns Promise resolving to the 'transferSingle' ERC1155 token.
     */
    transferSingleERC1155Collectible(collectibleAddress, senderAddress, recipientAddress, collectibleId, qty) {
        return __awaiter(this, void 0, void 0, function* () {
            const contract = this.web3.eth.contract(human_standard_multi_collectible_abi_1.default).at(collectibleAddress);
            return yield this.erc1155Standard.transferSingle(contract, collectibleAddress, senderAddress, recipientAddress, collectibleId, qty);
        });
    }
    /**
     * Get the token balance for a list of token addresses in a single call. Only non-zero balances
     * are returned.
     *
     * @param selectedAddress - The address to check token balances for.
     * @param tokensToDetect - The token addresses to detect balances for.
     * @returns The list of non-zero token balances.
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