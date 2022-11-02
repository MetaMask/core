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
exports.NftDetectionController = void 0;
const BaseController_1 = require("../BaseController");
const util_1 = require("../util");
const constants_1 = require("../constants");
const DEFAULT_INTERVAL = 180000;
/**
 * Controller that passively polls on a set interval for NFT auto detection
 */
class NftDetectionController extends BaseController_1.BaseController {
    /**
     * Creates an NftDetectionController instance.
     *
     * @param options - The controller options.
     * @param options.onNftsStateChange - Allows subscribing to assets controller state changes.
     * @param options.onPreferencesStateChange - Allows subscribing to preferences controller state changes.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param options.getOpenSeaApiKey - Gets the OpenSea API key, if one is set.
     * @param options.addNft - Add an NFT.
     * @param options.getNftState - Gets the current state of the Assets controller.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ onPreferencesStateChange, onNetworkStateChange, getOpenSeaApiKey, addNft, getNftState, }, config, state) {
        super(config, state);
        /**
         * Name of this controller used during composition
         */
        this.name = 'NftDetectionController';
        /**
         * Checks whether network is mainnet or not.
         *
         * @returns Whether current network is mainnet.
         */
        this.isMainnet = () => this.config.networkType === constants_1.MAINNET;
        this.defaultConfig = {
            interval: DEFAULT_INTERVAL,
            networkType: constants_1.MAINNET,
            chainId: '1',
            selectedAddress: '',
            disabled: true,
        };
        this.initialize();
        this.getNftState = getNftState;
        onPreferencesStateChange(({ selectedAddress, useNftDetection }) => {
            const { selectedAddress: previouslySelectedAddress, disabled } = this.config;
            if (selectedAddress !== previouslySelectedAddress ||
                !useNftDetection !== disabled) {
                this.configure({ selectedAddress, disabled: !useNftDetection });
            }
            if (useNftDetection !== undefined) {
                if (useNftDetection) {
                    this.start();
                }
                else {
                    this.stop();
                }
            }
        });
        onNetworkStateChange(({ provider }) => {
            this.configure({
                networkType: provider.type,
                chainId: provider.chainId,
            });
        });
        this.getOpenSeaApiKey = getOpenSeaApiKey;
        this.addNft = addNft;
    }
    getOwnerNftApi({ address, offset, useProxy, }) {
        return useProxy
            ? `${constants_1.OPENSEA_PROXY_URL}/assets?owner=${address}&offset=${offset}&limit=50`
            : `${constants_1.OPENSEA_API_URL}/assets?owner=${address}&offset=${offset}&limit=50`;
    }
    getOwnerNfts(address) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            let nftApiResponse;
            let nfts = [];
            const openSeaApiKey = this.getOpenSeaApiKey();
            let offset = 0;
            let pagingFinish = false;
            /* istanbul ignore if */
            do {
                nftApiResponse = yield (0, util_1.fetchWithErrorHandling)({
                    url: this.getOwnerNftApi({ address, offset, useProxy: true }),
                    timeout: 15000,
                });
                if (openSeaApiKey && !nftApiResponse) {
                    nftApiResponse = yield (0, util_1.fetchWithErrorHandling)({
                        url: this.getOwnerNftApi({
                            address,
                            offset,
                            useProxy: false,
                        }),
                        options: { headers: { 'X-API-KEY': openSeaApiKey } },
                        timeout: 15000,
                        // catch 403 errors (in case API key is down we don't want to blow up)
                        errorCodesToCatch: [403],
                    });
                }
                if (!nftApiResponse) {
                    return nfts;
                }
                ((_a = nftApiResponse === null || nftApiResponse === void 0 ? void 0 : nftApiResponse.assets) === null || _a === void 0 ? void 0 : _a.length) !== 0
                    ? (nfts = [...nfts, ...nftApiResponse.assets])
                    : (pagingFinish = true);
                offset += 50;
            } while (!pagingFinish);
            return nfts;
        });
    }
    /**
     * Start polling for the currency rate.
     */
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isMainnet() || this.disabled) {
                return;
            }
            yield this.startPolling();
        });
    }
    /**
     * Stop polling for the currency rate.
     */
    stop() {
        this.stopPolling();
    }
    stopPolling() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
    /**
     * Starts a new polling interval.
     *
     * @param interval - An interval on which to poll.
     */
    startPolling(interval) {
        return __awaiter(this, void 0, void 0, function* () {
            interval && this.configure({ interval }, false, false);
            this.stopPolling();
            yield this.detectNfts();
            this.intervalId = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                yield this.detectNfts();
            }), this.config.interval);
        });
    }
    /**
     * Triggers asset ERC721 token auto detection on mainnet. Any newly detected NFTs are
     * added.
     */
    detectNfts() {
        return __awaiter(this, void 0, void 0, function* () {
            /* istanbul ignore if */
            if (!this.isMainnet() || this.disabled) {
                return;
            }
            const { selectedAddress, chainId } = this.config;
            /* istanbul ignore else */
            if (!selectedAddress) {
                return;
            }
            const apiNfts = yield this.getOwnerNfts(selectedAddress);
            const addNftPromises = apiNfts.map((nft) => __awaiter(this, void 0, void 0, function* () {
                const { token_id, num_sales, background_color, image_url, image_preview_url, image_thumbnail_url, image_original_url, animation_url, animation_original_url, name, description, external_link, creator, asset_contract: { address, schema_name }, last_sale, } = nft;
                let ignored;
                /* istanbul ignore else */
                const { ignoredNfts } = this.getNftState();
                if (ignoredNfts.length) {
                    ignored = ignoredNfts.find((c) => {
                        /* istanbul ignore next */
                        return (c.address === (0, util_1.toChecksumHexAddress)(address) &&
                            c.tokenId === token_id);
                    });
                }
                /* istanbul ignore else */
                if (!ignored) {
                    /* istanbul ignore next */
                    const nftMetadata = Object.assign({}, { name }, creator && { creator }, description && { description }, image_url && { image: image_url }, num_sales && { numberOfSales: num_sales }, background_color && { backgroundColor: background_color }, image_preview_url && { imagePreview: image_preview_url }, image_thumbnail_url && { imageThumbnail: image_thumbnail_url }, image_original_url && { imageOriginal: image_original_url }, animation_url && { animation: animation_url }, animation_original_url && {
                        animationOriginal: animation_original_url,
                    }, schema_name && { standard: schema_name }, external_link && { externalLink: external_link }, last_sale && { lastSale: last_sale });
                    yield this.addNft(address, token_id, nftMetadata, {
                        userAddress: selectedAddress,
                        chainId: chainId,
                    });
                }
            }));
            yield Promise.all(addNftPromises);
        });
    }
}
exports.NftDetectionController = NftDetectionController;
exports.default = NftDetectionController;
//# sourceMappingURL=NftDetectionController.js.map