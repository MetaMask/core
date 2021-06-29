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
exports.AssetsDetectionController = void 0;
const BaseController_1 = __importDefault(require("../BaseController"));
const util_1 = require("../util");
const constants_1 = require("../constants");
const DEFAULT_INTERVAL = 180000;
/**
 * Controller that passively polls on a set interval for assets auto detection
 */
class AssetsDetectionController extends BaseController_1.default {
    /**
     * Creates a AssetsDetectionController instance
     *
     * @param options
     * @param options.onAssetsStateChange - Allows subscribing to assets controller state changes
     * @param options.onPreferencesStateChange - Allows subscribing to preferences controller state changes
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes
     * @param options.getOpenSeaApiKey - Gets the OpenSea API key, if one is set
     * @param options.getBalancesInSingleCall - Gets the balances of a list of tokens for the given address
     * @param options.addTokens - Add a list of tokens
     * @param options.addCollectible - Add a collectible
     * @param options.getAssetsState - Gets the current state of the Assets controller
     * @param config - Initial options used to configure this controller
     * @param state - Initial state to set on this controller
     */
    constructor({ onAssetsStateChange, onPreferencesStateChange, onNetworkStateChange, getOpenSeaApiKey, getBalancesInSingleCall, addTokens, addCollectible, getAssetsState, getTokenListState, }, config, state) {
        super(config, state);
        /**
         * Name of this controller used during composition
         */
        this.name = 'AssetsDetectionController';
        this.defaultConfig = {
            interval: DEFAULT_INTERVAL,
            networkType: constants_1.MAINNET,
            selectedAddress: '',
            tokens: [],
        };
        this.initialize();
        this.getAssetsState = getAssetsState;
        this.getTokenListState = getTokenListState;
        this.addTokens = addTokens;
        onAssetsStateChange(({ tokens }) => {
            this.configure({ tokens });
        });
        onPreferencesStateChange(({ selectedAddress }) => {
            const actualSelectedAddress = this.config.selectedAddress;
            if (selectedAddress !== actualSelectedAddress) {
                this.configure({ selectedAddress });
                this.detectAssets();
            }
        });
        onNetworkStateChange(({ provider }) => {
            this.configure({ networkType: provider.type });
        });
        this.getOpenSeaApiKey = getOpenSeaApiKey;
        this.getBalancesInSingleCall = getBalancesInSingleCall;
        this.addCollectible = addCollectible;
        this.poll();
    }
    getOwnerCollectiblesApi(address) {
        return `https://api.opensea.io/api/v1/assets?owner=${address}&limit=300`;
    }
    getOwnerCollectibles() {
        return __awaiter(this, void 0, void 0, function* () {
            const { selectedAddress } = this.config;
            const api = this.getOwnerCollectiblesApi(selectedAddress);
            let response;
            try {
                const openSeaApiKey = this.getOpenSeaApiKey();
                /* istanbul ignore if */
                if (openSeaApiKey) {
                    response = yield util_1.timeoutFetch(api, { headers: { 'X-API-KEY': openSeaApiKey } }, 15000);
                }
                else {
                    response = yield util_1.timeoutFetch(api, {}, 15000);
                }
            }
            catch (e) {
                /* istanbul ignore next */
                return [];
            }
            const collectiblesArray = yield response.json();
            const collectibles = collectiblesArray.assets;
            return collectibles;
        });
    }
    /**
     * Starts a new polling interval
     *
     * @param interval - Polling interval used to auto detect assets
     */
    poll(interval) {
        return __awaiter(this, void 0, void 0, function* () {
            interval && this.configure({ interval }, false, false);
            this.handle && clearTimeout(this.handle);
            yield this.detectAssets();
            this.handle = setTimeout(() => {
                this.poll(this.config.interval);
            }, this.config.interval);
        });
    }
    /**
     * Checks whether network is mainnet or not
     *
     * @returns - Whether current network is mainnet
     */
    isMainnet() {
        if (this.config.networkType !== constants_1.MAINNET || this.disabled) {
            return false;
        }
        return true;
    }
    /**
     * Detect assets owned by current account on mainnet
     */
    detectAssets() {
        return __awaiter(this, void 0, void 0, function* () {
            /* istanbul ignore if */
            if (!this.isMainnet()) {
                return;
            }
            this.detectTokens();
            this.detectCollectibles();
        });
    }
    /**
     * Triggers asset ERC20 token auto detection for each contract address in contract metadata on mainnet
     */
    detectTokens() {
        return __awaiter(this, void 0, void 0, function* () {
            /* istanbul ignore if */
            if (!this.isMainnet()) {
                return;
            }
            const tokensAddresses = this.config.tokens.map(
            /* istanbul ignore next*/ (token) => token.address.toLowerCase());
            const { tokenList } = this.getTokenListState();
            const tokensToDetect = [];
            for (const address in tokenList) {
                if (!tokensAddresses.includes(address)) {
                    tokensToDetect.push(address);
                }
            }
            const { selectedAddress } = this.config;
            /* istanbul ignore else */
            if (!selectedAddress) {
                return;
            }
            yield util_1.safelyExecute(() => __awaiter(this, void 0, void 0, function* () {
                const balances = yield this.getBalancesInSingleCall(selectedAddress, tokensToDetect);
                const tokensToAdd = [];
                for (const tokenAddress in balances) {
                    let ignored;
                    /* istanbul ignore else */
                    const { ignoredTokens } = this.getAssetsState();
                    if (ignoredTokens.length) {
                        ignored = ignoredTokens.find((token) => token.address === util_1.toChecksumHexAddress(tokenAddress));
                    }
                    if (!ignored) {
                        tokensToAdd.push({
                            address: tokenAddress,
                            decimals: tokenList[tokenAddress].decimals,
                            symbol: tokenList[tokenAddress].symbol,
                        });
                    }
                }
                if (tokensToAdd.length) {
                    yield this.addTokens(tokensToAdd);
                }
            }));
        });
    }
    /**
     * Triggers asset ERC721 token auto detection on mainnet
     * adding new collectibles and removing not owned collectibles
     */
    detectCollectibles() {
        return __awaiter(this, void 0, void 0, function* () {
            /* istanbul ignore if */
            if (!this.isMainnet()) {
                return;
            }
            const requestedSelectedAddress = this.config.selectedAddress;
            /* istanbul ignore else */
            if (!requestedSelectedAddress) {
                return;
            }
            yield util_1.safelyExecute(() => __awaiter(this, void 0, void 0, function* () {
                const apiCollectibles = yield this.getOwnerCollectibles();
                const addCollectiblesPromises = apiCollectibles.map((collectible) => __awaiter(this, void 0, void 0, function* () {
                    const { token_id, num_sales, background_color, image_url, image_preview_url, image_thumbnail_url, image_original_url, animation_url, animation_original_url, name, description, external_link, creator, asset_contract: { address }, last_sale, } = collectible;
                    let ignored;
                    /* istanbul ignore else */
                    const { ignoredCollectibles } = this.getAssetsState();
                    if (ignoredCollectibles.length) {
                        ignored = ignoredCollectibles.find((c) => {
                            /* istanbul ignore next */
                            return (c.address === util_1.toChecksumHexAddress(address) &&
                                c.tokenId === Number(token_id));
                        });
                    }
                    /* istanbul ignore else */
                    if (!ignored &&
                        requestedSelectedAddress === this.config.selectedAddress) {
                        /* istanbul ignore next */
                        const collectibleMetadata = Object.assign({}, { name }, creator && { creator }, description && { description }, image_url && { image: image_url }, num_sales && { numberOfSales: num_sales }, background_color && { backgroundColor: background_color }, image_preview_url && { imagePreview: image_preview_url }, image_thumbnail_url && { imageThumbnail: image_thumbnail_url }, image_original_url && { imageOriginal: image_original_url }, animation_url && { animation: animation_url }, animation_original_url && {
                            animationOriginal: animation_original_url,
                        }, external_link && { externalLink: external_link }, last_sale && { lastSale: last_sale });
                        yield this.addCollectible(address, Number(token_id), collectibleMetadata, true);
                    }
                }));
                yield Promise.all(addCollectiblesPromises);
            }));
        });
    }
}
exports.AssetsDetectionController = AssetsDetectionController;
exports.default = AssetsDetectionController;
//# sourceMappingURL=AssetsDetectionController.js.map