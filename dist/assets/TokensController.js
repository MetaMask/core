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
exports.TokensController = void 0;
const events_1 = require("events");
const contract_metadata_1 = __importDefault(require("@metamask/contract-metadata"));
const metamask_eth_abis_1 = require("@metamask/metamask-eth-abis");
const uuid_1 = require("uuid");
const async_mutex_1 = require("async-mutex");
const ethers_1 = require("ethers");
const abort_controller_1 = require("abort-controller");
const BaseController_1 = require("../BaseController");
const util_1 = require("../util");
const constants_1 = require("../constants");
const token_service_1 = require("../apis/token-service");
const assetsUtil_1 = require("./assetsUtil");
var SuggestedAssetStatus;
(function (SuggestedAssetStatus) {
    SuggestedAssetStatus["accepted"] = "accepted";
    SuggestedAssetStatus["failed"] = "failed";
    SuggestedAssetStatus["pending"] = "pending";
    SuggestedAssetStatus["rejected"] = "rejected";
})(SuggestedAssetStatus || (SuggestedAssetStatus = {}));
/**
 * Controller that stores assets and exposes convenience methods
 */
class TokensController extends BaseController_1.BaseController {
    /**
     * Creates a TokensController instance.
     *
     * @param options - The controller options.
     * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param options.config - Initial options used to configure this controller.
     * @param options.state - Initial state to set on this controller.
     */
    constructor({ onPreferencesStateChange, onNetworkStateChange, config, state, }) {
        super(config, state);
        this.mutex = new async_mutex_1.Mutex();
        /**
         * EventEmitter instance used to listen to specific EIP747 events
         */
        this.hub = new events_1.EventEmitter();
        /**
         * Name of this controller used during composition
         */
        this.name = 'TokensController';
        this.defaultConfig = Object.assign({ networkType: constants_1.MAINNET, selectedAddress: '', chainId: '', provider: undefined }, config);
        this.defaultState = Object.assign({ tokens: [], ignoredTokens: [], detectedTokens: [], allTokens: {}, allIgnoredTokens: {}, allDetectedTokens: {}, suggestedAssets: [] }, state);
        this.initialize();
        this.abortController = new abort_controller_1.AbortController();
        onPreferencesStateChange(({ selectedAddress }) => {
            var _a, _b, _c;
            const { allTokens, allIgnoredTokens, allDetectedTokens } = this.state;
            const { chainId } = this.config;
            this.configure({ selectedAddress });
            this.update({
                tokens: ((_a = allTokens[chainId]) === null || _a === void 0 ? void 0 : _a[selectedAddress]) || [],
                ignoredTokens: ((_b = allIgnoredTokens[chainId]) === null || _b === void 0 ? void 0 : _b[selectedAddress]) || [],
                detectedTokens: ((_c = allDetectedTokens[chainId]) === null || _c === void 0 ? void 0 : _c[selectedAddress]) || [],
            });
        });
        onNetworkStateChange(({ provider }) => {
            var _a, _b, _c;
            const { allTokens, allIgnoredTokens, allDetectedTokens } = this.state;
            const { selectedAddress } = this.config;
            const { chainId } = provider;
            this.abortController.abort();
            this.abortController = new abort_controller_1.AbortController();
            this.configure({ chainId });
            this.ethersProvider = this._instantiateNewEthersProvider();
            this.update({
                tokens: ((_a = allTokens[chainId]) === null || _a === void 0 ? void 0 : _a[selectedAddress]) || [],
                ignoredTokens: ((_b = allIgnoredTokens[chainId]) === null || _b === void 0 ? void 0 : _b[selectedAddress]) || [],
                detectedTokens: ((_c = allDetectedTokens[chainId]) === null || _c === void 0 ? void 0 : _c[selectedAddress]) || [],
            });
        });
    }
    failSuggestedAsset(suggestedAssetMeta, error) {
        const failedSuggestedAssetMeta = Object.assign(Object.assign({}, suggestedAssetMeta), { status: SuggestedAssetStatus.failed, error });
        this.hub.emit(`${suggestedAssetMeta.id}:finished`, failedSuggestedAssetMeta);
    }
    /**
     * Fetch metadata for a token.
     *
     * @param tokenAddress - The address of the token.
     * @returns The token metadata.
     */
    fetchTokenMetadata(tokenAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const token = yield (0, token_service_1.fetchTokenMetadata)(this.config.chainId, tokenAddress, this.abortController.signal);
                return token;
            }
            catch (error) {
                if (error instanceof Error &&
                    error.message.includes(token_service_1.TOKEN_METADATA_NO_SUPPORT_ERROR)) {
                    return undefined;
                }
                throw error;
            }
        });
    }
    _instantiateNewEthersProvider() {
        var _a;
        return new ethers_1.ethers.providers.Web3Provider((_a = this.config) === null || _a === void 0 ? void 0 : _a.provider);
    }
    /**
     * Adds a token to the stored token list.
     *
     * @param address - Hex address of the token contract.
     * @param symbol - Symbol of the token.
     * @param decimals - Number of decimals the token uses.
     * @param image - Image of the token.
     * @returns Current token list.
     */
    addToken(address, symbol, decimals, image) {
        return __awaiter(this, void 0, void 0, function* () {
            const currentChainId = this.config.chainId;
            const releaseLock = yield this.mutex.acquire();
            try {
                address = (0, util_1.toChecksumHexAddress)(address);
                const { tokens, ignoredTokens, detectedTokens } = this.state;
                const newTokens = [...tokens];
                const [isERC721, tokenMetadata] = yield Promise.all([
                    this._detectIsERC721(address),
                    this.fetchTokenMetadata(address),
                ]);
                if (currentChainId !== this.config.chainId) {
                    throw new Error('TokensController Error: Switched networks while adding token');
                }
                const newEntry = {
                    address,
                    symbol,
                    decimals,
                    image: image ||
                        (0, assetsUtil_1.formatIconUrlWithProxy)({
                            chainId: this.config.chainId,
                            tokenAddress: address,
                        }),
                    isERC721,
                    aggregators: (0, assetsUtil_1.formatAggregatorNames)((tokenMetadata === null || tokenMetadata === void 0 ? void 0 : tokenMetadata.aggregators) || []),
                };
                const previousEntry = newTokens.find((token) => token.address.toLowerCase() === address.toLowerCase());
                if (previousEntry) {
                    const previousIndex = newTokens.indexOf(previousEntry);
                    newTokens[previousIndex] = newEntry;
                }
                else {
                    newTokens.push(newEntry);
                }
                const newIgnoredTokens = ignoredTokens.filter((tokenAddress) => tokenAddress.toLowerCase() !== address.toLowerCase());
                const newDetectedTokens = detectedTokens.filter((token) => token.address.toLowerCase() !== address.toLowerCase());
                const { newAllTokens, newAllIgnoredTokens, newAllDetectedTokens } = this._getNewAllTokensState({
                    newTokens,
                    newIgnoredTokens,
                    newDetectedTokens,
                });
                this.update({
                    tokens: newTokens,
                    ignoredTokens: newIgnoredTokens,
                    detectedTokens: newDetectedTokens,
                    allTokens: newAllTokens,
                    allIgnoredTokens: newAllIgnoredTokens,
                    allDetectedTokens: newAllDetectedTokens,
                });
                return newTokens;
            }
            finally {
                releaseLock();
            }
        });
    }
    /**
     * Add a batch of tokens.
     *
     * @param tokensToImport - Array of tokens to import.
     */
    addTokens(tokensToImport) {
        return __awaiter(this, void 0, void 0, function* () {
            const releaseLock = yield this.mutex.acquire();
            const { tokens, detectedTokens, ignoredTokens } = this.state;
            const importedTokensMap = {};
            // Used later to dedupe imported tokens
            const newTokensMap = tokens.reduce((output, current) => {
                output[current.address] = current;
                return output;
            }, {});
            try {
                tokensToImport.forEach((tokenToAdd) => {
                    const { address, symbol, decimals, image, aggregators } = tokenToAdd;
                    const checksumAddress = (0, util_1.toChecksumHexAddress)(address);
                    const formattedToken = {
                        address: checksumAddress,
                        symbol,
                        decimals,
                        image,
                        aggregators,
                    };
                    newTokensMap[address] = formattedToken;
                    importedTokensMap[address.toLowerCase()] = true;
                    return formattedToken;
                });
                const newTokens = Object.values(newTokensMap);
                const newDetectedTokens = detectedTokens.filter((token) => !importedTokensMap[token.address.toLowerCase()]);
                const newIgnoredTokens = ignoredTokens.filter((tokenAddress) => !newTokensMap[tokenAddress.toLowerCase()]);
                const { newAllTokens, newAllDetectedTokens, newAllIgnoredTokens } = this._getNewAllTokensState({
                    newTokens,
                    newDetectedTokens,
                    newIgnoredTokens,
                });
                this.update({
                    tokens: newTokens,
                    allTokens: newAllTokens,
                    detectedTokens: newDetectedTokens,
                    allDetectedTokens: newAllDetectedTokens,
                    ignoredTokens: newIgnoredTokens,
                    allIgnoredTokens: newAllIgnoredTokens,
                });
            }
            finally {
                releaseLock();
            }
        });
    }
    /**
     * Ignore a batch of tokens.
     *
     * @param tokenAddressesToIgnore - Array of token addresses to ignore.
     */
    ignoreTokens(tokenAddressesToIgnore) {
        const { ignoredTokens, detectedTokens, tokens } = this.state;
        const ignoredTokensMap = {};
        let newIgnoredTokens = [...ignoredTokens];
        const checksummedTokenAddresses = tokenAddressesToIgnore.map((address) => {
            const checksumAddress = (0, util_1.toChecksumHexAddress)(address);
            ignoredTokensMap[address.toLowerCase()] = true;
            return checksumAddress;
        });
        newIgnoredTokens = [...ignoredTokens, ...checksummedTokenAddresses];
        const newDetectedTokens = detectedTokens.filter((token) => !ignoredTokensMap[token.address.toLowerCase()]);
        const newTokens = tokens.filter((token) => !ignoredTokensMap[token.address.toLowerCase()]);
        const { newAllIgnoredTokens, newAllDetectedTokens, newAllTokens } = this._getNewAllTokensState({
            newIgnoredTokens,
            newDetectedTokens,
            newTokens,
        });
        this.update({
            ignoredTokens: newIgnoredTokens,
            tokens: newTokens,
            detectedTokens: newDetectedTokens,
            allIgnoredTokens: newAllIgnoredTokens,
            allDetectedTokens: newAllDetectedTokens,
            allTokens: newAllTokens,
        });
    }
    /**
     * Adds a batch of detected tokens to the stored token list.
     *
     * @param incomingDetectedTokens - Array of detected tokens to be added or updated.
     */
    addDetectedTokens(incomingDetectedTokens) {
        return __awaiter(this, void 0, void 0, function* () {
            const releaseLock = yield this.mutex.acquire();
            const { tokens, detectedTokens, ignoredTokens } = this.state;
            const newTokens = [...tokens];
            const newDetectedTokens = [...detectedTokens];
            try {
                incomingDetectedTokens.forEach((tokenToAdd) => {
                    const { address, symbol, decimals, image, aggregators, isERC721 } = tokenToAdd;
                    const checksumAddress = (0, util_1.toChecksumHexAddress)(address);
                    const newEntry = {
                        address: checksumAddress,
                        symbol,
                        decimals,
                        image,
                        isERC721,
                        aggregators,
                    };
                    const previousImportedEntry = newTokens.find((token) => token.address.toLowerCase() === checksumAddress.toLowerCase());
                    if (previousImportedEntry) {
                        // Update existing data of imported token
                        const previousImportedIndex = newTokens.indexOf(previousImportedEntry);
                        newTokens[previousImportedIndex] = newEntry;
                    }
                    else {
                        const ignoredTokenIndex = ignoredTokens.indexOf(address);
                        if (ignoredTokenIndex === -1) {
                            // Add detected token
                            const previousDetectedEntry = newDetectedTokens.find((token) => token.address.toLowerCase() === checksumAddress.toLowerCase());
                            if (previousDetectedEntry) {
                                const previousDetectedIndex = newDetectedTokens.indexOf(previousDetectedEntry);
                                newDetectedTokens[previousDetectedIndex] = newEntry;
                            }
                            else {
                                newDetectedTokens.push(newEntry);
                            }
                        }
                    }
                });
                const { newAllTokens, newAllDetectedTokens } = this._getNewAllTokensState({
                    newTokens,
                    newDetectedTokens,
                });
                this.update({
                    tokens: newTokens,
                    allTokens: newAllTokens,
                    detectedTokens: newDetectedTokens,
                    allDetectedTokens: newAllDetectedTokens,
                });
            }
            finally {
                releaseLock();
            }
        });
    }
    /**
     * Adds isERC721 field to token object. This is called when a user attempts to add tokens that
     * were previously added which do not yet had isERC721 field.
     *
     * @param tokenAddress - The contract address of the token requiring the isERC721 field added.
     * @returns The new token object with the added isERC721 field.
     */
    updateTokenType(tokenAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            const isERC721 = yield this._detectIsERC721(tokenAddress);
            const { tokens } = this.state;
            const tokenIndex = tokens.findIndex((token) => {
                return token.address.toLowerCase() === tokenAddress.toLowerCase();
            });
            tokens[tokenIndex].isERC721 = isERC721;
            this.update({ tokens });
            return tokens[tokenIndex];
        });
    }
    /**
     * Detects whether or not a token is ERC-721 compatible.
     *
     * @param tokenAddress - The token contract address.
     * @returns A boolean indicating whether the token address passed in supports the EIP-721
     * interface.
     */
    _detectIsERC721(tokenAddress) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const checksumAddress = (0, util_1.toChecksumHexAddress)(tokenAddress);
            // if this token is already in our contract metadata map we don't need
            // to check against the contract
            if (((_a = contract_metadata_1.default[checksumAddress]) === null || _a === void 0 ? void 0 : _a.erc721) === true) {
                return Promise.resolve(true);
            }
            else if (((_b = contract_metadata_1.default[checksumAddress]) === null || _b === void 0 ? void 0 : _b.erc20) === true) {
                return Promise.resolve(false);
            }
            const tokenContract = yield this._createEthersContract(tokenAddress, metamask_eth_abis_1.abiERC721, this.ethersProvider);
            try {
                return yield tokenContract.supportsInterface(constants_1.ERC721_INTERFACE_ID);
            }
            catch (error) {
                // currently we see a variety of errors across different networks when
                // token contracts are not ERC721 compatible. We need to figure out a better
                // way of differentiating token interface types but for now if we get an error
                // we have to assume the token is not ERC721 compatible.
                return false;
            }
        });
    }
    _createEthersContract(tokenAddress, abi, ethersProvider) {
        return __awaiter(this, void 0, void 0, function* () {
            const tokenContract = yield new ethers_1.ethers.Contract(tokenAddress, abi, ethersProvider);
            return tokenContract;
        });
    }
    _generateRandomId() {
        return (0, uuid_1.v1)();
    }
    /**
     * Adds a new suggestedAsset to state. Parameters will be validated according to
     * asset type being watched. A `<suggestedAssetMeta.id>:pending` hub event will be emitted once added.
     *
     * @param asset - The asset to be watched. For now only ERC20 tokens are accepted.
     * @param type - The asset type.
     * @returns Object containing a Promise resolving to the suggestedAsset address if accepted.
     */
    watchAsset(asset, type) {
        return __awaiter(this, void 0, void 0, function* () {
            const suggestedAssetMeta = {
                asset,
                id: this._generateRandomId(),
                status: SuggestedAssetStatus.pending,
                time: Date.now(),
                type,
            };
            try {
                switch (type) {
                    case 'ERC20':
                        (0, util_1.validateTokenToWatch)(asset);
                        break;
                    default:
                        throw new Error(`Asset of type ${type} not supported`);
                }
            }
            catch (error) {
                this.failSuggestedAsset(suggestedAssetMeta, error);
                return Promise.reject(error);
            }
            const result = new Promise((resolve, reject) => {
                this.hub.once(`${suggestedAssetMeta.id}:finished`, (meta) => {
                    switch (meta.status) {
                        case SuggestedAssetStatus.accepted:
                            return resolve(meta.asset.address);
                        case SuggestedAssetStatus.rejected:
                            return reject(new Error('User rejected to watch the asset.'));
                        case SuggestedAssetStatus.failed:
                            return reject(new Error(meta.error.message));
                        /* istanbul ignore next */
                        default:
                            return reject(new Error(`Unknown status: ${meta.status}`));
                    }
                });
            });
            const { suggestedAssets } = this.state;
            suggestedAssets.push(suggestedAssetMeta);
            this.update({ suggestedAssets: [...suggestedAssets] });
            this.hub.emit('pendingSuggestedAsset', suggestedAssetMeta);
            return { result, suggestedAssetMeta };
        });
    }
    /**
     * Accepts to watch an asset and updates it's status and deletes the suggestedAsset from state,
     * adding the asset to corresponding asset state. In this case ERC20 tokens.
     * A `<suggestedAssetMeta.id>:finished` hub event is fired after accepted or failure.
     *
     * @param suggestedAssetID - The ID of the suggestedAsset to accept.
     */
    acceptWatchAsset(suggestedAssetID) {
        return __awaiter(this, void 0, void 0, function* () {
            const { suggestedAssets } = this.state;
            const index = suggestedAssets.findIndex(({ id }) => suggestedAssetID === id);
            const suggestedAssetMeta = suggestedAssets[index];
            try {
                switch (suggestedAssetMeta.type) {
                    case 'ERC20':
                        const { address, symbol, decimals, image } = suggestedAssetMeta.asset;
                        yield this.addToken(address, symbol, decimals, image);
                        suggestedAssetMeta.status = SuggestedAssetStatus.accepted;
                        this.hub.emit(`${suggestedAssetMeta.id}:finished`, suggestedAssetMeta);
                        break;
                    default:
                        throw new Error(`Asset of type ${suggestedAssetMeta.type} not supported`);
                }
            }
            catch (error) {
                this.failSuggestedAsset(suggestedAssetMeta, error);
            }
            const newSuggestedAssets = suggestedAssets.filter(({ id }) => id !== suggestedAssetID);
            this.update({ suggestedAssets: [...newSuggestedAssets] });
        });
    }
    /**
     * Rejects a watchAsset request based on its ID by setting its status to "rejected"
     * and emitting a `<suggestedAssetMeta.id>:finished` hub event.
     *
     * @param suggestedAssetID - The ID of the suggestedAsset to accept.
     */
    rejectWatchAsset(suggestedAssetID) {
        const { suggestedAssets } = this.state;
        const index = suggestedAssets.findIndex(({ id }) => suggestedAssetID === id);
        const suggestedAssetMeta = suggestedAssets[index];
        if (!suggestedAssetMeta) {
            return;
        }
        suggestedAssetMeta.status = SuggestedAssetStatus.rejected;
        this.hub.emit(`${suggestedAssetMeta.id}:finished`, suggestedAssetMeta);
        const newSuggestedAssets = suggestedAssets.filter(({ id }) => id !== suggestedAssetID);
        this.update({ suggestedAssets: [...newSuggestedAssets] });
    }
    /**
     * Takes a new tokens and ignoredTokens array for the current network/account combination
     * and returns new allTokens and allIgnoredTokens state to update to.
     *
     * @param params - Object that holds token params.
     * @param params.newTokens - The new tokens to set for the current network and selected account.
     * @param params.newIgnoredTokens - The new ignored tokens to set for the current network and selected account.
     * @param params.newDetectedTokens - The new detected tokens to set for the current network and selected account.
     * @returns The updated `allTokens` and `allIgnoredTokens` state.
     */
    _getNewAllTokensState(params) {
        const { newTokens, newIgnoredTokens, newDetectedTokens } = params;
        const { allTokens, allIgnoredTokens, allDetectedTokens } = this.state;
        const { chainId, selectedAddress } = this.config;
        let newAllTokens = allTokens;
        if (newTokens) {
            const networkTokens = allTokens[chainId];
            const newNetworkTokens = Object.assign(Object.assign({}, networkTokens), { [selectedAddress]: newTokens });
            newAllTokens = Object.assign(Object.assign({}, allTokens), { [chainId]: newNetworkTokens });
        }
        let newAllIgnoredTokens = allIgnoredTokens;
        if (newIgnoredTokens) {
            const networkIgnoredTokens = allIgnoredTokens[chainId];
            const newIgnoredNetworkTokens = Object.assign(Object.assign({}, networkIgnoredTokens), { [selectedAddress]: newIgnoredTokens });
            newAllIgnoredTokens = Object.assign(Object.assign({}, allIgnoredTokens), { [chainId]: newIgnoredNetworkTokens });
        }
        let newAllDetectedTokens = allDetectedTokens;
        if (newDetectedTokens) {
            const networkDetectedTokens = allDetectedTokens[chainId];
            const newDetectedNetworkTokens = Object.assign(Object.assign({}, networkDetectedTokens), { [selectedAddress]: newDetectedTokens });
            newAllDetectedTokens = Object.assign(Object.assign({}, allDetectedTokens), { [chainId]: newDetectedNetworkTokens });
        }
        return { newAllTokens, newAllIgnoredTokens, newAllDetectedTokens };
    }
    /**
     * Removes all tokens from the ignored list.
     */
    clearIgnoredTokens() {
        this.update({ ignoredTokens: [], allIgnoredTokens: {} });
    }
}
exports.TokensController = TokensController;
exports.default = TokensController;
//# sourceMappingURL=TokensController.js.map