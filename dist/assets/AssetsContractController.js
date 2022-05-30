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
exports.AssetsContractController = exports.MISSING_PROVIDER_ERROR = exports.SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID = void 0;
const web3_1 = __importDefault(require("web3"));
const single_call_balance_checker_abi_1 = __importDefault(require("single-call-balance-checker-abi"));
const BaseController_1 = require("../BaseController");
const constants_1 = require("../constants");
const util_1 = require("../util");
const ERC721Standard_1 = require("./Standards/CollectibleStandards/ERC721/ERC721Standard");
const ERC1155Standard_1 = require("./Standards/CollectibleStandards/ERC1155/ERC1155Standard");
const ERC20Standard_1 = require("./Standards/ERC20Standard");
/**
 * Check if token detection is enabled for certain networks
 *
 * @param chainId - ChainID of network
 * @returns Whether the current network supports token detection
 */
exports.SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID = {
    [util_1.SupportedTokenDetectionNetworks.mainnet]: '0xb1f8e55c7f64d203c1400b9d8555d050f94adf39',
    [util_1.SupportedTokenDetectionNetworks.bsc]: '0x2352c63A83f9Fd126af8676146721Fa00924d7e4',
    [util_1.SupportedTokenDetectionNetworks.polygon]: '0x2352c63A83f9Fd126af8676146721Fa00924d7e4',
    [util_1.SupportedTokenDetectionNetworks.avax]: '0xD023D153a0DFa485130ECFdE2FAA7e612EF94818',
};
exports.MISSING_PROVIDER_ERROR = 'AssetsContractController failed to set the provider correctly. A provider must be set for this method to be available';
/**
 * Controller that interacts with contracts on mainnet through web3
 */
class AssetsContractController extends BaseController_1.BaseController {
    /**
     * Creates a AssetsContractController instance.
     *
     * @param options - The controller options.
     * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ onPreferencesStateChange, onNetworkStateChange, }, config, state) {
        super(config, state);
        /**
         * Name of this controller used during composition
         */
        this.name = 'AssetsContractController';
        this.defaultConfig = {
            provider: undefined,
            ipfsGateway: constants_1.IPFS_DEFAULT_GATEWAY_URL,
            chainId: util_1.SupportedTokenDetectionNetworks.mainnet,
        };
        this.initialize();
        onPreferencesStateChange(({ ipfsGateway }) => {
            this.configure({ ipfsGateway });
        });
        onNetworkStateChange((networkState) => {
            if (this.config.chainId !== networkState.provider.chainId) {
                this.configure({
                    chainId: networkState.provider.chainId,
                });
            }
        });
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
        this.erc721Standard = new ERC721Standard_1.ERC721Standard(this.web3);
        this.erc1155Standard = new ERC1155Standard_1.ERC1155Standard(this.web3);
        this.erc20Standard = new ERC20Standard_1.ERC20Standard(this.web3);
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
    getERC20BalanceOf(address, selectedAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.erc20Standard) {
                throw new Error(exports.MISSING_PROVIDER_ERROR);
            }
            return this.erc20Standard.getBalanceOf(address, selectedAddress);
        });
    }
    /**
     * Query for the decimals for a given ERC20 asset.
     *
     * @param address - ERC20 asset contract address.
     * @returns Promise resolving to the 'decimals'.
     */
    getERC20TokenDecimals(address) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.erc20Standard === undefined) {
                throw new Error(exports.MISSING_PROVIDER_ERROR);
            }
            return yield this.erc20Standard.getTokenDecimals(address);
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
    getERC721CollectibleTokenId(address, selectedAddress, index) {
        if (this.erc721Standard === undefined) {
            throw new Error(exports.MISSING_PROVIDER_ERROR);
        }
        return this.erc721Standard.getCollectibleTokenId(address, selectedAddress, index);
    }
    /**
     * Enumerate assets assigned to an owner.
     *
     * @param tokenAddress - ERC721 asset contract address.
     * @param userAddress - Current account public address.
     * @param tokenId - ERC721 asset identifier.
     * @returns Promise resolving to an object containing the token standard and a set of details which depend on which standard the token supports.
     */
    getTokenStandardAndDetails(tokenAddress, userAddress, tokenId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.erc721Standard === undefined ||
                this.erc1155Standard === undefined ||
                this.erc20Standard === undefined) {
                throw new Error(exports.MISSING_PROVIDER_ERROR);
            }
            const { ipfsGateway } = this.config;
            // ERC721
            try {
                return Object.assign({}, (yield this.erc721Standard.getDetails(tokenAddress, ipfsGateway, tokenId)));
            }
            catch (_a) {
                // Ignore
            }
            // ERC1155
            try {
                return Object.assign({}, (yield this.erc1155Standard.getDetails(tokenAddress, ipfsGateway, tokenId)));
            }
            catch (_b) {
                // Ignore
            }
            // ERC20
            try {
                return Object.assign({}, (yield this.erc20Standard.getDetails(tokenAddress, userAddress)));
            }
            catch (_c) {
                // Ignore
            }
            throw new Error('Unable to determine contract standard');
        });
    }
    /**
     * Query for tokenURI for a given ERC721 asset.
     *
     * @param address - ERC721 asset contract address.
     * @param tokenId - ERC721 asset identifier.
     * @returns Promise resolving to the 'tokenURI'.
     */
    getERC721TokenURI(address, tokenId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.erc721Standard === undefined) {
                throw new Error(exports.MISSING_PROVIDER_ERROR);
            }
            return this.erc721Standard.getTokenURI(address, tokenId);
        });
    }
    /**
     * Query for name for a given asset.
     *
     * @param address - ERC721 or ERC20 asset contract address.
     * @returns Promise resolving to the 'name'.
     */
    getERC721AssetName(address) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.erc721Standard === undefined) {
                throw new Error(exports.MISSING_PROVIDER_ERROR);
            }
            return this.erc721Standard.getAssetName(address);
        });
    }
    /**
     * Query for symbol for a given asset.
     *
     * @param address - ERC721 or ERC20 asset contract address.
     * @returns Promise resolving to the 'symbol'.
     */
    getERC721AssetSymbol(address) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.erc721Standard === undefined) {
                throw new Error(exports.MISSING_PROVIDER_ERROR);
            }
            return this.erc721Standard.getAssetSymbol(address);
        });
    }
    /**
     * Query for owner for a given ERC721 asset.
     *
     * @param address - ERC721 asset contract address.
     * @param tokenId - ERC721 asset identifier.
     * @returns Promise resolving to the owner address.
     */
    getERC721OwnerOf(address, tokenId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.erc721Standard === undefined) {
                throw new Error(exports.MISSING_PROVIDER_ERROR);
            }
            return this.erc721Standard.getOwnerOf(address, tokenId);
        });
    }
    /**
     * Query for tokenURI for a given asset.
     *
     * @param address - ERC1155 asset contract address.
     * @param tokenId - ERC1155 asset identifier.
     * @returns Promise resolving to the 'tokenURI'.
     */
    getERC1155TokenURI(address, tokenId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.erc1155Standard === undefined) {
                throw new Error(exports.MISSING_PROVIDER_ERROR);
            }
            return this.erc1155Standard.getTokenURI(address, tokenId);
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
    getERC1155BalanceOf(userAddress, collectibleAddress, collectibleId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.erc1155Standard === undefined) {
                throw new Error(exports.MISSING_PROVIDER_ERROR);
            }
            return yield this.erc1155Standard.getBalanceOf(collectibleAddress, userAddress, collectibleId);
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
    transferSingleERC1155(collectibleAddress, senderAddress, recipientAddress, collectibleId, qty) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.erc1155Standard === undefined) {
                throw new Error(exports.MISSING_PROVIDER_ERROR);
            }
            return yield this.erc1155Standard.transferSingle(collectibleAddress, senderAddress, recipientAddress, collectibleId, qty);
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
            if (!(this.config.chainId in exports.SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID)) {
                // Only fetch balance if contract address exists
                return {};
            }
            const contractAddress = exports.SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID[this.config.chainId];
            const contract = this.web3.eth
                .contract(single_call_balance_checker_abi_1.default)
                .at(contractAddress);
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
                            if (String(balance) !== '0') {
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