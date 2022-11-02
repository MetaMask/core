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
exports.NftController = void 0;
const events_1 = require("events");
const ethereumjs_util_1 = require("ethereumjs-util");
const async_mutex_1 = require("async-mutex");
const BaseController_1 = require("../BaseController");
const util_1 = require("../util");
const constants_1 = require("../constants");
const assetsUtil_1 = require("./assetsUtil");
const ALL_NFTS_STATE_KEY = 'allNfts';
const ALL_NFTS_CONTRACTS_STATE_KEY = 'allNftContracts';
/**
 * Controller that stores assets and exposes convenience methods
 */
class NftController extends BaseController_1.BaseController {
    /**
     * Creates an NftController instance.
     *
     * @param options - The controller options.
     * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param options.getERC721AssetName - Gets the name of the asset at the given address.
     * @param options.getERC721AssetSymbol - Gets the symbol of the asset at the given address.
     * @param options.getERC721TokenURI - Gets the URI of the ERC721 token at the given address, with the given ID.
     * @param options.getERC721OwnerOf - Get the owner of a ERC-721 NFT.
     * @param options.getERC1155BalanceOf - Gets balance of a ERC-1155 NFT.
     * @param options.getERC1155TokenURI - Gets the URI of the ERC1155 token at the given address, with the given ID.
     * @param options.onNftAdded - Callback that is called when an NFT is added. Currently used pass data
     * for tracking the NFT added event.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ onPreferencesStateChange, onNetworkStateChange, getERC721AssetName, getERC721AssetSymbol, getERC721TokenURI, getERC721OwnerOf, getERC1155BalanceOf, getERC1155TokenURI, onNftAdded, }, config, state) {
        super(config, state);
        this.mutex = new async_mutex_1.Mutex();
        /**
         * EventEmitter instance used to listen to specific EIP747 events
         */
        this.hub = new events_1.EventEmitter();
        /**
         * Name of this controller used during composition
         */
        this.name = 'NftController';
        this.defaultConfig = {
            networkType: constants_1.MAINNET,
            selectedAddress: '',
            chainId: '',
            ipfsGateway: constants_1.IPFS_DEFAULT_GATEWAY_URL,
            openSeaEnabled: false,
            useIPFSSubdomains: true,
        };
        this.defaultState = {
            allNftContracts: {},
            allNfts: {},
            ignoredNfts: [],
        };
        this.initialize();
        this.getERC721AssetName = getERC721AssetName;
        this.getERC721AssetSymbol = getERC721AssetSymbol;
        this.getERC721TokenURI = getERC721TokenURI;
        this.getERC721OwnerOf = getERC721OwnerOf;
        this.getERC1155BalanceOf = getERC1155BalanceOf;
        this.getERC1155TokenURI = getERC1155TokenURI;
        this.onNftAdded = onNftAdded;
        onPreferencesStateChange(({ selectedAddress, ipfsGateway, openSeaEnabled }) => {
            this.configure({ selectedAddress, ipfsGateway, openSeaEnabled });
        });
        onNetworkStateChange(({ provider }) => {
            const { chainId } = provider;
            this.configure({ chainId });
        });
    }
    getNftApi({ contractAddress, tokenId, useProxy, }) {
        const { chainId } = this.config;
        if (chainId === constants_1.RINKEBY_CHAIN_ID) {
            return `${constants_1.OPENSEA_TEST_API_URL}/asset/${contractAddress}/${tokenId}`;
        }
        return useProxy
            ? `${constants_1.OPENSEA_PROXY_URL}/asset/${contractAddress}/${tokenId}`
            : `${constants_1.OPENSEA_API_URL}/asset/${contractAddress}/${tokenId}`;
    }
    getNftContractInformationApi({ contractAddress, useProxy, }) {
        const { chainId } = this.config;
        if (chainId === constants_1.RINKEBY_CHAIN_ID) {
            return `${constants_1.OPENSEA_TEST_API_URL}/asset_contract/${contractAddress}`;
        }
        return useProxy
            ? `${constants_1.OPENSEA_PROXY_URL}/asset_contract/${contractAddress}`
            : `${constants_1.OPENSEA_API_URL}/asset_contract/${contractAddress}`;
    }
    /**
     * Helper method to update nested state for allNfts and allNftContracts.
     *
     * @param newCollection - the modified piece of state to update in the controller's store
     * @param baseStateKey - The root key in the store to update.
     * @param passedConfig - An object containing the selectedAddress and chainId that are passed through the auto-detection flow.
     * @param passedConfig.userAddress - the address passed through the NFT detection flow to ensure detected assets are stored to the correct account
     * @param passedConfig.chainId - the chainId passed through the NFT detection flow to ensure detected assets are stored to the correct account
     */
    updateNestedNftState(newCollection, baseStateKey, { userAddress, chainId } = {
        userAddress: this.config.selectedAddress,
        chainId: this.config.chainId,
    }) {
        const { [baseStateKey]: oldState } = this.state;
        const addressState = oldState[userAddress];
        const newAddressState = Object.assign(Object.assign({}, addressState), { [chainId]: newCollection });
        const newState = Object.assign(Object.assign({}, oldState), { [userAddress]: newAddressState });
        this.update({
            [baseStateKey]: newState,
        });
    }
    /**
     * Request individual NFT information from OpenSea API.
     *
     * @param contractAddress - Hex address of the NFT contract.
     * @param tokenId - The NFT identifier.
     * @returns Promise resolving to the current NFT name and image.
     */
    getNftInformationFromApi(contractAddress, tokenId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Attempt to fetch the data with the proxy
            let nftInformation = yield (0, util_1.fetchWithErrorHandling)({
                url: this.getNftApi({
                    contractAddress,
                    tokenId,
                    useProxy: true,
                }),
            });
            // if an openSeaApiKey is set we should attempt to refetch calling directly to OpenSea
            if (!nftInformation && this.openSeaApiKey) {
                nftInformation = yield (0, util_1.fetchWithErrorHandling)({
                    url: this.getNftApi({
                        contractAddress,
                        tokenId,
                        useProxy: false,
                    }),
                    options: {
                        headers: { 'X-API-KEY': this.openSeaApiKey },
                    },
                    // catch 403 errors (in case API key is down we don't want to blow up)
                    errorCodesToCatch: [403],
                });
            }
            // if we were still unable to fetch the data we return out the default/null of `NftMetadata`
            if (!nftInformation) {
                return {
                    name: null,
                    description: null,
                    image: null,
                    standard: null,
                };
            }
            // if we've reached this point, we have successfully fetched some data for nftInformation
            // now we reconfigure the data to conform to the `NftMetadata` type for storage.
            const { num_sales, background_color, image_url, image_preview_url, image_thumbnail_url, image_original_url, animation_url, animation_original_url, name, description, external_link, creator, last_sale, asset_contract: { schema_name }, } = nftInformation;
            /* istanbul ignore next */
            const nftMetadata = Object.assign({}, { name: name || null }, { description: description || null }, { image: image_url || null }, creator && { creator }, num_sales && { numberOfSales: num_sales }, background_color && { backgroundColor: background_color }, image_preview_url && { imagePreview: image_preview_url }, image_thumbnail_url && { imageThumbnail: image_thumbnail_url }, image_original_url && { imageOriginal: image_original_url }, animation_url && { animation: animation_url }, animation_original_url && {
                animationOriginal: animation_original_url,
            }, external_link && { externalLink: external_link }, last_sale && { lastSale: last_sale }, schema_name && { standard: schema_name });
            return nftMetadata;
        });
    }
    /**
     * Request individual NFT information from contracts that follows Metadata Interface.
     *
     * @param contractAddress - Hex address of the NFT contract.
     * @param tokenId - The NFT identifier.
     * @returns Promise resolving to the current NFT name and image.
     */
    getNftInformationFromTokenURI(contractAddress, tokenId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { ipfsGateway, useIPFSSubdomains } = this.config;
            const result = yield this.getNftURIAndStandard(contractAddress, tokenId);
            let tokenURI = result[0];
            const standard = result[1];
            if (tokenURI.startsWith('ipfs://')) {
                tokenURI = (0, util_1.getFormattedIpfsUrl)(ipfsGateway, tokenURI, useIPFSSubdomains);
            }
            try {
                const object = yield (0, util_1.handleFetch)(tokenURI);
                // TODO: Check image_url existence. This is not part of EIP721 nor EIP1155
                const image = Object.prototype.hasOwnProperty.call(object, 'image')
                    ? 'image'
                    : /* istanbul ignore next */ 'image_url';
                return {
                    image: object[image],
                    name: object.name,
                    description: object.description,
                    standard,
                    favorite: false,
                };
            }
            catch (_a) {
                return {
                    image: null,
                    name: null,
                    description: null,
                    standard: standard || null,
                    favorite: false,
                };
            }
        });
    }
    /**
     * Retrieve NFT uri with  metadata. TODO Update method to use IPFS.
     *
     * @param contractAddress - NFT contract address.
     * @param tokenId - NFT token id.
     * @returns Promise resolving NFT uri and token standard.
     */
    getNftURIAndStandard(contractAddress, tokenId) {
        return __awaiter(this, void 0, void 0, function* () {
            // try ERC721 uri
            try {
                const uri = yield this.getERC721TokenURI(contractAddress, tokenId);
                return [uri, constants_1.ERC721];
            }
            catch (_a) {
                // Ignore error
            }
            // try ERC1155 uri
            try {
                const tokenURI = yield this.getERC1155TokenURI(contractAddress, tokenId);
                /**
                 * According to EIP1155 the URI value allows for ID substitution
                 * in case the string `{id}` exists.
                 * https://eips.ethereum.org/EIPS/eip-1155#metadata
                 */
                if (!tokenURI.includes('{id}')) {
                    return [tokenURI, constants_1.ERC1155];
                }
                const hexTokenId = (0, ethereumjs_util_1.stripHexPrefix)((0, util_1.BNToHex)(new ethereumjs_util_1.BN(tokenId)))
                    .padStart(64, '0')
                    .toLowerCase();
                return [tokenURI.replace('{id}', hexTokenId), constants_1.ERC1155];
            }
            catch (_b) {
                // Ignore error
            }
            return ['', ''];
        });
    }
    /**
     * Request individual NFT information (name, image url and description).
     *
     * @param contractAddress - Hex address of the NFT contract.
     * @param tokenId - The NFT identifier.
     * @returns Promise resolving to the current NFT name and image.
     */
    getNftInformation(contractAddress, tokenId) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        return __awaiter(this, void 0, void 0, function* () {
            const blockchainMetadata = yield (0, util_1.safelyExecute)(() => __awaiter(this, void 0, void 0, function* () {
                return yield this.getNftInformationFromTokenURI(contractAddress, tokenId);
            }));
            let openSeaMetadata;
            if (this.config.openSeaEnabled) {
                openSeaMetadata = yield (0, util_1.safelyExecute)(() => __awaiter(this, void 0, void 0, function* () {
                    return yield this.getNftInformationFromApi(contractAddress, tokenId);
                }));
            }
            return Object.assign(Object.assign({}, openSeaMetadata), { name: (_b = (_a = blockchainMetadata.name) !== null && _a !== void 0 ? _a : openSeaMetadata === null || openSeaMetadata === void 0 ? void 0 : openSeaMetadata.name) !== null && _b !== void 0 ? _b : null, description: (_d = (_c = blockchainMetadata.description) !== null && _c !== void 0 ? _c : openSeaMetadata === null || openSeaMetadata === void 0 ? void 0 : openSeaMetadata.description) !== null && _d !== void 0 ? _d : null, image: (_f = (_e = blockchainMetadata.image) !== null && _e !== void 0 ? _e : openSeaMetadata === null || openSeaMetadata === void 0 ? void 0 : openSeaMetadata.image) !== null && _f !== void 0 ? _f : null, standard: (_h = (_g = blockchainMetadata.standard) !== null && _g !== void 0 ? _g : openSeaMetadata === null || openSeaMetadata === void 0 ? void 0 : openSeaMetadata.standard) !== null && _h !== void 0 ? _h : null });
        });
    }
    /**
     * Request NFT contract information from OpenSea API.
     *
     * @param contractAddress - Hex address of the NFT contract.
     * @returns Promise resolving to the current NFT name and image.
     */
    getNftContractInformationFromApi(contractAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            /* istanbul ignore if */
            let apiNftContractObject = yield (0, util_1.fetchWithErrorHandling)({
                url: this.getNftContractInformationApi({
                    contractAddress,
                    useProxy: true,
                }),
            });
            // if we successfully fetched return the fetched data immediately
            if (apiNftContractObject) {
                return apiNftContractObject;
            }
            // if we were unsuccessful in fetching from the API and an OpenSea API key is present
            // attempt to refetch directly against the OpenSea API and if successful return the data immediately
            if (this.openSeaApiKey) {
                apiNftContractObject = yield (0, util_1.fetchWithErrorHandling)({
                    url: this.getNftContractInformationApi({
                        contractAddress,
                        useProxy: false,
                    }),
                    options: {
                        headers: { 'X-API-KEY': this.openSeaApiKey },
                    },
                    // catch 403 errors (in case API key is down we don't want to blow up)
                    errorCodesToCatch: [403],
                });
                if (apiNftContractObject) {
                    return apiNftContractObject;
                }
            }
            // If we've reached this point we were unable to fetch data from either the proxy or opensea so we return
            // the default/null of ApiNftContract
            return {
                address: contractAddress,
                asset_contract_type: null,
                created_date: null,
                schema_name: null,
                symbol: null,
                total_supply: null,
                description: null,
                external_link: null,
                collection: {
                    name: null,
                    image_url: null,
                },
            };
        });
    }
    /**
     * Request NFT contract information from the contract itself.
     *
     * @param contractAddress - Hex address of the NFT contract.
     * @returns Promise resolving to the current NFT name and image.
     */
    getNftContractInformationFromContract(contractAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            const name = yield this.getERC721AssetName(contractAddress);
            const symbol = yield this.getERC721AssetSymbol(contractAddress);
            return {
                collection: { name },
                symbol,
                address: contractAddress,
            };
        });
    }
    /**
     * Request NFT contract information from OpenSea API.
     *
     * @param contractAddress - Hex address of the NFT contract.
     * @returns Promise resolving to the NFT contract name, image and description.
     */
    getNftContractInformation(contractAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            const blockchainContractData = yield (0, util_1.safelyExecute)(() => __awaiter(this, void 0, void 0, function* () {
                return yield this.getNftContractInformationFromContract(contractAddress);
            }));
            let openSeaContractData;
            if (this.config.openSeaEnabled) {
                openSeaContractData = yield (0, util_1.safelyExecute)(() => __awaiter(this, void 0, void 0, function* () {
                    return yield this.getNftContractInformationFromApi(contractAddress);
                }));
            }
            if (blockchainContractData || openSeaContractData) {
                return Object.assign(Object.assign(Object.assign({}, openSeaContractData), blockchainContractData), { collection: Object.assign(Object.assign({ image_url: null }, openSeaContractData === null || openSeaContractData === void 0 ? void 0 : openSeaContractData.collection), blockchainContractData === null || blockchainContractData === void 0 ? void 0 : blockchainContractData.collection) });
            }
            /* istanbul ignore next */
            return {
                address: contractAddress,
                asset_contract_type: null,
                created_date: null,
                schema_name: null,
                symbol: null,
                total_supply: null,
                description: null,
                external_link: null,
                collection: { name: null, image_url: null },
            };
        });
    }
    /**
     * Adds an individual NFT to the stored NFT list.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - The NFT identifier.
     * @param nftMetadata - NFT optional information (name, image and description).
     * @param nftContract - An object containing contract data of the NFT being added.
     * @param detection - The chain ID and address of the currently selected network and account at the moment the NFT was detected.
     * @returns Promise resolving to the current NFT list.
     */
    addIndividualNft(address, tokenId, nftMetadata, nftContract, detection) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: Remove unused return
            const releaseLock = yield this.mutex.acquire();
            try {
                address = (0, util_1.toChecksumHexAddress)(address);
                const { allNfts } = this.state;
                let chainId, selectedAddress;
                if (detection) {
                    chainId = detection.chainId;
                    selectedAddress = detection.userAddress;
                }
                else {
                    chainId = this.config.chainId;
                    selectedAddress = this.config.selectedAddress;
                }
                const nfts = ((_a = allNfts[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
                const existingEntry = nfts.find((nft) => nft.address.toLowerCase() === address.toLowerCase() &&
                    nft.tokenId === tokenId);
                if (existingEntry) {
                    const differentMetadata = (0, assetsUtil_1.compareNftMetadata)(nftMetadata, existingEntry);
                    if (differentMetadata) {
                        // TODO: Switch to indexToUpdate
                        const indexToRemove = nfts.findIndex((nft) => nft.address.toLowerCase() === address.toLowerCase() &&
                            nft.tokenId === tokenId);
                        /* istanbul ignore next */
                        if (indexToRemove !== -1) {
                            nfts.splice(indexToRemove, 1);
                        }
                    }
                    else {
                        return nfts;
                    }
                }
                const newEntry = Object.assign({ address,
                    tokenId, favorite: (existingEntry === null || existingEntry === void 0 ? void 0 : existingEntry.favorite) || false, isCurrentlyOwned: true }, nftMetadata);
                const newNfts = [...nfts, newEntry];
                this.updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY, {
                    chainId,
                    userAddress: selectedAddress,
                });
                if (this.onNftAdded) {
                    this.onNftAdded({
                        address,
                        symbol: nftContract.symbol,
                        tokenId: tokenId.toString(),
                        standard: nftMetadata.standard,
                        source: detection ? 'detected' : 'custom',
                    });
                }
                return newNfts;
            }
            finally {
                releaseLock();
            }
        });
    }
    /**
     * Adds an NFT contract to the stored NFT contracts list.
     *
     * @param address - Hex address of the NFT contract.
     * @param detection - The chain ID and address of the currently selected network and account at the moment the NFT was detected.
     * @returns Promise resolving to the current NFT contracts list.
     */
    addNftContract(address, detection) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const releaseLock = yield this.mutex.acquire();
            try {
                address = (0, util_1.toChecksumHexAddress)(address);
                const { allNftContracts } = this.state;
                let chainId, selectedAddress;
                if (detection) {
                    chainId = detection.chainId;
                    selectedAddress = detection.userAddress;
                }
                else {
                    chainId = this.config.chainId;
                    selectedAddress = this.config.selectedAddress;
                }
                const nftContracts = ((_a = allNftContracts[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
                const existingEntry = nftContracts.find((nftContract) => nftContract.address.toLowerCase() === address.toLowerCase());
                if (existingEntry) {
                    return nftContracts;
                }
                const contractInformation = yield this.getNftContractInformation(address);
                const { asset_contract_type, created_date, schema_name, symbol, total_supply, description, external_link, collection: { name, image_url }, } = contractInformation;
                // If being auto-detected opensea information is expected
                // Otherwise at least name from the contract is needed
                if ((detection && !name) ||
                    Object.keys(contractInformation).length === 0) {
                    return nftContracts;
                }
                /* istanbul ignore next */
                const newEntry = Object.assign({}, { address }, description && { description }, name && { name }, image_url && { logo: image_url }, symbol && { symbol }, total_supply !== null &&
                    typeof total_supply !== 'undefined' && { totalSupply: total_supply }, asset_contract_type && { assetContractType: asset_contract_type }, created_date && { createdDate: created_date }, schema_name && { schemaName: schema_name }, external_link && { externalLink: external_link });
                const newNftContracts = [...nftContracts, newEntry];
                this.updateNestedNftState(newNftContracts, ALL_NFTS_CONTRACTS_STATE_KEY, {
                    chainId,
                    userAddress: selectedAddress,
                });
                return newNftContracts;
            }
            finally {
                releaseLock();
            }
        });
    }
    /**
     * Removes an individual NFT from the stored token list and saves it in ignored NFTs list.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - Token identifier of the NFT.
     */
    removeAndIgnoreIndividualNft(address, tokenId) {
        var _a;
        address = (0, util_1.toChecksumHexAddress)(address);
        const { allNfts, ignoredNfts } = this.state;
        const { chainId, selectedAddress } = this.config;
        const newIgnoredNfts = [...ignoredNfts];
        const nfts = ((_a = allNfts[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
        const newNfts = nfts.filter((nft) => {
            if (nft.address.toLowerCase() === address.toLowerCase() &&
                nft.tokenId === tokenId) {
                const alreadyIgnored = newIgnoredNfts.find((c) => c.address === address && c.tokenId === tokenId);
                !alreadyIgnored && newIgnoredNfts.push(nft);
                return false;
            }
            return true;
        });
        this.updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY);
        this.update({
            ignoredNfts: newIgnoredNfts,
        });
    }
    /**
     * Removes an individual NFT from the stored token list.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - Token identifier of the NFT.
     */
    removeIndividualNft(address, tokenId) {
        var _a;
        address = (0, util_1.toChecksumHexAddress)(address);
        const { allNfts } = this.state;
        const { chainId, selectedAddress } = this.config;
        const nfts = ((_a = allNfts[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
        const newNfts = nfts.filter((nft) => !(nft.address.toLowerCase() === address.toLowerCase() &&
            nft.tokenId === tokenId));
        this.updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY);
    }
    /**
     * Removes an NFT contract to the stored NFT contracts list.
     *
     * @param address - Hex address of the NFT contract.
     * @returns Promise resolving to the current NFT contracts list.
     */
    removeNftContract(address) {
        var _a;
        address = (0, util_1.toChecksumHexAddress)(address);
        const { allNftContracts } = this.state;
        const { chainId, selectedAddress } = this.config;
        const nftContracts = ((_a = allNftContracts[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
        const newNftContracts = nftContracts.filter((nftContract) => !(nftContract.address.toLowerCase() === address.toLowerCase()));
        this.updateNestedNftState(newNftContracts, ALL_NFTS_CONTRACTS_STATE_KEY);
        return newNftContracts;
    }
    /**
     * Sets an OpenSea API key to retrieve NFT information.
     *
     * @param openSeaApiKey - OpenSea API key.
     */
    setApiKey(openSeaApiKey) {
        this.openSeaApiKey = openSeaApiKey;
    }
    /**
     * Checks the ownership of a ERC-721 or ERC-1155 NFT for a given address.
     *
     * @param ownerAddress - User public address.
     * @param nftAddress - NFT contract address.
     * @param nftId - NFT token ID.
     * @returns Promise resolving the NFT ownership.
     */
    isNftOwner(ownerAddress, nftAddress, nftId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Checks the ownership for ERC-721.
            try {
                const owner = yield this.getERC721OwnerOf(nftAddress, nftId);
                return ownerAddress.toLowerCase() === owner.toLowerCase();
                // eslint-disable-next-line no-empty
            }
            catch (_a) {
                // Ignore ERC-721 contract error
            }
            // Checks the ownership for ERC-1155.
            try {
                const balance = yield this.getERC1155BalanceOf(ownerAddress, nftAddress, nftId);
                return balance > 0;
                // eslint-disable-next-line no-empty
            }
            catch (_b) {
                // Ignore ERC-1155 contract error
            }
            throw new Error('Unable to verify ownership. Probably because the standard is not supported or the chain is incorrect.');
        });
    }
    /**
     * Verifies currently selected address owns entered NFT address/tokenId combo and
     * adds the NFT and respective NFT contract to the stored NFT and NFT contracts lists.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - The NFT identifier.
     */
    addNftVerifyOwnership(address, tokenId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { selectedAddress } = this.config;
            if (!(yield this.isNftOwner(selectedAddress, address, tokenId))) {
                throw new Error('This NFT is not owned by the user');
            }
            yield this.addNft(address, tokenId);
        });
    }
    /**
     * Adds an NFT and respective NFT contract to the stored NFT and NFT contracts lists.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - The NFT identifier.
     * @param nftMetadata - NFT optional metadata.
     * @param detection - The chain ID and address of the currently selected network and account at the moment the NFT was detected.
     * @returns Promise resolving to the current NFT list.
     */
    addNft(address, tokenId, nftMetadata, detection) {
        return __awaiter(this, void 0, void 0, function* () {
            address = (0, util_1.toChecksumHexAddress)(address);
            const newNftContracts = yield this.addNftContract(address, detection);
            nftMetadata =
                nftMetadata || (yield this.getNftInformation(address, tokenId));
            // If NFT contract was not added, do not add individual NFT
            const nftContract = newNftContracts.find((contract) => contract.address.toLowerCase() === address.toLowerCase());
            // If NFT contract information, add individual NFT
            if (nftContract) {
                yield this.addIndividualNft(address, tokenId, nftMetadata, nftContract, detection);
            }
        });
    }
    /**
     * Removes an NFT from the stored token list.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - Token identifier of the NFT.
     */
    removeNft(address, tokenId) {
        var _a;
        address = (0, util_1.toChecksumHexAddress)(address);
        this.removeIndividualNft(address, tokenId);
        const { allNfts } = this.state;
        const { chainId, selectedAddress } = this.config;
        const nfts = ((_a = allNfts[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
        const remainingNft = nfts.find((nft) => nft.address.toLowerCase() === address.toLowerCase());
        if (!remainingNft) {
            this.removeNftContract(address);
        }
    }
    /**
     * Removes an NFT from the stored token list and saves it in ignored NFTs list.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - Token identifier of the NFT.
     */
    removeAndIgnoreNft(address, tokenId) {
        var _a;
        address = (0, util_1.toChecksumHexAddress)(address);
        this.removeAndIgnoreIndividualNft(address, tokenId);
        const { allNfts } = this.state;
        const { chainId, selectedAddress } = this.config;
        const nfts = ((_a = allNfts[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
        const remainingNft = nfts.find((nft) => nft.address.toLowerCase() === address.toLowerCase());
        if (!remainingNft) {
            this.removeNftContract(address);
        }
    }
    /**
     * Removes all NFTs from the ignored list.
     */
    clearIgnoredNfts() {
        this.update({ ignoredNfts: [] });
    }
    /**
     * Checks whether input NFT is still owned by the user
     * And updates the isCurrentlyOwned value on the NFT object accordingly.
     *
     * @param nft - The NFT object to check and update.
     * @param batch - A boolean indicating whether this method is being called as part of a batch or single update.
     * @param accountParams - The userAddress and chainId to check ownership against
     * @param accountParams.userAddress - the address passed through the confirmed transaction flow to ensure detected assets are stored to the correct account
     * @param accountParams.chainId - the chainId passed through the confirmed transaction flow to ensure detected assets are stored to the correct account
     * @returns the NFT with the updated isCurrentlyOwned value
     */
    checkAndUpdateSingleNftOwnershipStatus(nft, batch, { userAddress, chainId } = {
        userAddress: this.config.selectedAddress,
        chainId: this.config.chainId,
    }) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const { address, tokenId } = nft;
            let isOwned = nft.isCurrentlyOwned;
            try {
                isOwned = yield this.isNftOwner(userAddress, address, tokenId);
            }
            catch (error) {
                if (!(error instanceof Error &&
                    error.message.includes('Unable to verify ownership'))) {
                    throw error;
                }
            }
            nft.isCurrentlyOwned = isOwned;
            if (batch === true) {
                return nft;
            }
            // if this is not part of a batched update we update this one NFT in state
            const { allNfts } = this.state;
            const nfts = ((_a = allNfts[userAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
            const nftToUpdate = nfts.find((item) => item.tokenId === tokenId &&
                item.address.toLowerCase() === address.toLowerCase());
            if (nftToUpdate) {
                nftToUpdate.isCurrentlyOwned = isOwned;
                this.updateNestedNftState(nfts, ALL_NFTS_STATE_KEY, {
                    userAddress,
                    chainId,
                });
            }
            return nft;
        });
    }
    /**
     * Checks whether NFTs associated with current selectedAddress/chainId combination are still owned by the user
     * And updates the isCurrentlyOwned value on each accordingly.
     */
    checkAndUpdateAllNftsOwnershipStatus() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const { allNfts } = this.state;
            const { chainId, selectedAddress } = this.config;
            const nfts = ((_a = allNfts[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
            const updatedNfts = yield Promise.all(nfts.map((nft) => __awaiter(this, void 0, void 0, function* () {
                var _b;
                return ((_b = (yield this.checkAndUpdateSingleNftOwnershipStatus(nft, true))) !== null && _b !== void 0 ? _b : nft);
            })));
            this.updateNestedNftState(updatedNfts, ALL_NFTS_STATE_KEY);
        });
    }
    /**
     * Update NFT favorite status.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - Hex address of the NFT contract.
     * @param favorite - NFT new favorite status.
     */
    updateNftFavoriteStatus(address, tokenId, favorite) {
        var _a;
        const { allNfts } = this.state;
        const { chainId, selectedAddress } = this.config;
        const nfts = ((_a = allNfts[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
        const index = nfts.findIndex((nft) => nft.address === address && nft.tokenId === tokenId);
        if (index === -1) {
            return;
        }
        const updatedNft = Object.assign(Object.assign({}, nfts[index]), { favorite });
        // Update Nfts array
        nfts[index] = updatedNft;
        this.updateNestedNftState(nfts, ALL_NFTS_STATE_KEY);
    }
    /**
     * Returns an NFT by the address and token id.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - Number that represents the id of the token.
     * @param selectedAddress - Hex address of the user account.
     * @param chainId - Id of the current network.
     * @returns Object containing the NFT and its position in the array
     */
    findNftByAddressAndTokenId(address, tokenId, selectedAddress, chainId) {
        var _a;
        const { allNfts } = this.state;
        const nfts = ((_a = allNfts[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
        const index = nfts.findIndex((nft) => nft.address.toLowerCase() === address.toLowerCase() &&
            nft.tokenId === tokenId);
        if (index === -1) {
            return null;
        }
        return { nft: nfts[index], index };
    }
    /**
     * Update NFT data.
     *
     * @param nft - NFT object to find the right NFT to updates.
     * @param updates - NFT partial object to update properties of the NFT.
     * @param selectedAddress - Hex address of the user account.
     * @param chainId - Id of the current network.
     */
    updateNft(nft, updates, selectedAddress, chainId) {
        var _a;
        const { allNfts } = this.state;
        const nfts = ((_a = allNfts[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
        const nftInfo = this.findNftByAddressAndTokenId(nft.address, nft.tokenId, selectedAddress, chainId);
        if (!nftInfo) {
            return;
        }
        const updatedNft = Object.assign(Object.assign({}, nft), updates);
        const newNfts = [
            ...nfts.slice(0, nftInfo.index),
            updatedNft,
            ...nfts.slice(nftInfo.index + 1),
        ];
        this.updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY);
    }
    /**
     * Resets the transaction status of an NFT.
     *
     * @param transactionId - NFT transaction id.
     * @param selectedAddress - Hex address of the user account.
     * @param chainId - Id of the current network.
     * @returns a boolean indicating if the reset was well succeded or not
     */
    resetNftTransactionStatusByTransactionId(transactionId, selectedAddress, chainId) {
        var _a;
        const { allNfts } = this.state;
        const nfts = ((_a = allNfts[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
        const index = nfts.findIndex((nft) => nft.transactionId === transactionId);
        if (index === -1) {
            return false;
        }
        const updatedNft = Object.assign(Object.assign({}, nfts[index]), { transactionId: undefined });
        const newNfts = [
            ...nfts.slice(0, index),
            updatedNft,
            ...nfts.slice(index + 1),
        ];
        this.updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY);
        return true;
    }
}
exports.NftController = NftController;
exports.default = NftController;
//# sourceMappingURL=NftController.js.map