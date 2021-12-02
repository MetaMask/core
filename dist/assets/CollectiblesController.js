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
exports.CollectiblesController = void 0;
const events_1 = require("events");
const ethereumjs_util_1 = require("ethereumjs-util");
const async_mutex_1 = require("async-mutex");
const BaseController_1 = require("../BaseController");
const util_1 = require("../util");
const constants_1 = require("../constants");
const assetsUtil_1 = require("./assetsUtil");
/**
 * Controller that stores assets and exposes convenience methods
 */
class CollectiblesController extends BaseController_1.BaseController {
    /**
     * Creates a CollectiblesController instance.
     *
     * @param options - The controller options.
     * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param options.getAssetName - Gets the name of the asset at the given address.
     * @param options.getAssetSymbol - Gets the symbol of the asset at the given address.
     * @param options.getCollectibleTokenURI - Gets the URI of the ERC721 token at the given address, with the given ID.
     * @param options.getOwnerOf - Get the owner of a ERC-721 collectible.
     * @param options.balanceOfERC1155Collectible - Gets balance of a ERC-1155 collectible.
     * @param options.uriERC1155Collectible - Gets the URI of the ERC1155 token at the given address, with the given ID.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ onPreferencesStateChange, onNetworkStateChange, getAssetName, getAssetSymbol, getCollectibleTokenURI, getOwnerOf, balanceOfERC1155Collectible, uriERC1155Collectible, }, config, state) {
        super(config, state);
        this.mutex = new async_mutex_1.Mutex();
        /**
         * EventEmitter instance used to listen to specific EIP747 events
         */
        this.hub = new events_1.EventEmitter();
        /**
         * Name of this controller used during composition
         */
        this.name = 'CollectiblesController';
        this.defaultConfig = {
            networkType: constants_1.MAINNET,
            selectedAddress: '',
            chainId: '',
            ipfsGateway: constants_1.IPFS_DEFAULT_GATEWAY_URL,
            openSeaEnabled: false,
        };
        this.defaultState = {
            allCollectibleContracts: {},
            allCollectibles: {},
            ignoredCollectibles: [],
        };
        this.initialize();
        this.getAssetName = getAssetName;
        this.getAssetSymbol = getAssetSymbol;
        this.getCollectibleTokenURI = getCollectibleTokenURI;
        this.getOwnerOf = getOwnerOf;
        this.balanceOfERC1155Collectible = balanceOfERC1155Collectible;
        this.uriERC1155Collectible = uriERC1155Collectible;
        onPreferencesStateChange(({ selectedAddress, ipfsGateway, openSeaEnabled }) => {
            this.configure({ selectedAddress, ipfsGateway, openSeaEnabled });
        });
        onNetworkStateChange(({ provider }) => {
            const { chainId } = provider;
            this.configure({ chainId });
        });
    }
    getCollectibleApi(contractAddress, tokenId) {
        const { chainId } = this.config;
        switch (chainId) {
            case constants_1.RINKEBY_CHAIN_ID:
                return `https://testnets-api.opensea.io/api/v1/asset/${contractAddress}/${tokenId}`;
            default:
                return `https://api.opensea.io/api/v1/asset/${contractAddress}/${tokenId}`;
        }
    }
    getCollectibleContractInformationApi(contractAddress) {
        const { chainId } = this.config;
        switch (chainId) {
            case constants_1.RINKEBY_CHAIN_ID:
                return `https://testnets-api.opensea.io/api/v1/asset_contract/${contractAddress}`;
            default:
                return `https://api.opensea.io/api/v1/asset_contract/${contractAddress}`;
        }
    }
    /**
     * Request individual collectible information from OpenSea API.
     *
     * @param contractAddress - Hex address of the collectible contract.
     * @param tokenId - The collectible identifier.
     * @returns Promise resolving to the current collectible name and image.
     */
    getCollectibleInformationFromApi(contractAddress, tokenId) {
        return __awaiter(this, void 0, void 0, function* () {
            const tokenURI = this.getCollectibleApi(contractAddress, tokenId);
            let collectibleInformation;
            /* istanbul ignore if */
            if (this.openSeaApiKey) {
                collectibleInformation = yield util_1.handleFetch(tokenURI, {
                    headers: { 'X-API-KEY': this.openSeaApiKey },
                });
            }
            else {
                collectibleInformation = yield util_1.handleFetch(tokenURI);
            }
            const { num_sales, background_color, image_url, image_preview_url, image_thumbnail_url, image_original_url, animation_url, animation_original_url, name, description, external_link, creator, last_sale, asset_contract: { schema_name }, } = collectibleInformation;
            /* istanbul ignore next */
            const collectibleMetadata = Object.assign({}, { name: name || null }, { description: description || null }, { image: image_url || null }, creator && { creator }, num_sales && { numberOfSales: num_sales }, background_color && { backgroundColor: background_color }, image_preview_url && { imagePreview: image_preview_url }, image_thumbnail_url && { imageThumbnail: image_thumbnail_url }, image_original_url && { imageOriginal: image_original_url }, animation_url && { animation: animation_url }, animation_original_url && {
                animationOriginal: animation_original_url,
            }, external_link && { externalLink: external_link }, last_sale && { lastSale: last_sale }, schema_name && { standard: schema_name });
            return collectibleMetadata;
        });
    }
    getValidIpfsGatewayFormat() {
        const { ipfsGateway } = this.config;
        if (ipfsGateway.endsWith('/ipfs/')) {
            return ipfsGateway;
        }
        else if (ipfsGateway.endsWith('/')) {
            return `${ipfsGateway}ipfs/`;
        }
        return `${ipfsGateway}/ipfs/`;
    }
    /**
     * Request individual collectible information from contracts that follows Metadata Interface.
     *
     * @param contractAddress - Hex address of the collectible contract.
     * @param tokenId - The collectible identifier.
     * @returns Promise resolving to the current collectible name and image.
     */
    getCollectibleInformationFromTokenURI(contractAddress, tokenId) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.getCollectibleURIAndStandard(contractAddress, tokenId);
            let tokenURI = result[0];
            const standard = result[1];
            if (tokenURI.startsWith('ipfs://')) {
                const contentId = util_1.getIpfsUrlContentIdentifier(tokenURI);
                tokenURI = `${this.getValidIpfsGatewayFormat()}${contentId}`;
            }
            try {
                const object = yield util_1.handleFetch(tokenURI);
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
     * Retrieve collectible uri with  metadata. TODO Update method to use IPFS.
     *
     * @param contractAddress - Collectible contract address.
     * @param tokenId - Collectible token id.
     * @returns Promise resolving collectible uri and token standard.
     */
    getCollectibleURIAndStandard(contractAddress, tokenId) {
        return __awaiter(this, void 0, void 0, function* () {
            // try ERC721 uri
            try {
                const uri = yield this.getCollectibleTokenURI(contractAddress, tokenId);
                return [uri, constants_1.ERC721];
            }
            catch (_a) {
                // Ignore error
            }
            // try ERC1155 uri
            try {
                const tokenURI = yield this.uriERC1155Collectible(contractAddress, tokenId);
                /**
                 * According to EIP1155 the URI value allows for ID substitution
                 * in case the string `{id}` exists.
                 * https://eips.ethereum.org/EIPS/eip-1155#metadata
                 */
                if (!tokenURI.includes('{id}')) {
                    return [tokenURI, constants_1.ERC1155];
                }
                const hexTokenId = ethereumjs_util_1.stripHexPrefix(util_1.BNToHex(new ethereumjs_util_1.BN(tokenId)))
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
     * Request individual collectible information (name, image url and description).
     *
     * @param contractAddress - Hex address of the collectible contract.
     * @param tokenId - The collectible identifier.
     * @returns Promise resolving to the current collectible name and image.
     */
    getCollectibleInformation(contractAddress, tokenId) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        return __awaiter(this, void 0, void 0, function* () {
            const blockchainMetadata = yield util_1.safelyExecute(() => __awaiter(this, void 0, void 0, function* () {
                return yield this.getCollectibleInformationFromTokenURI(contractAddress, tokenId);
            }));
            let openSeaMetadata;
            if (this.config.openSeaEnabled) {
                openSeaMetadata = yield util_1.safelyExecute(() => __awaiter(this, void 0, void 0, function* () {
                    return yield this.getCollectibleInformationFromApi(contractAddress, tokenId);
                }));
            }
            return Object.assign(Object.assign({}, openSeaMetadata), { name: (_b = (_a = blockchainMetadata.name) !== null && _a !== void 0 ? _a : openSeaMetadata === null || openSeaMetadata === void 0 ? void 0 : openSeaMetadata.name) !== null && _b !== void 0 ? _b : null, description: (_d = (_c = blockchainMetadata.description) !== null && _c !== void 0 ? _c : openSeaMetadata === null || openSeaMetadata === void 0 ? void 0 : openSeaMetadata.description) !== null && _d !== void 0 ? _d : null, image: (_f = (_e = blockchainMetadata.image) !== null && _e !== void 0 ? _e : openSeaMetadata === null || openSeaMetadata === void 0 ? void 0 : openSeaMetadata.image) !== null && _f !== void 0 ? _f : null, standard: (_h = (_g = blockchainMetadata.standard) !== null && _g !== void 0 ? _g : openSeaMetadata === null || openSeaMetadata === void 0 ? void 0 : openSeaMetadata.standard) !== null && _h !== void 0 ? _h : null });
        });
    }
    /**
     * Request collectible contract information from OpenSea API.
     *
     * @param contractAddress - Hex address of the collectible contract.
     * @returns Promise resolving to the current collectible name and image.
     */
    getCollectibleContractInformationFromApi(contractAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            const api = this.getCollectibleContractInformationApi(contractAddress);
            let apiCollectibleContractObject;
            /* istanbul ignore if */
            if (this.openSeaApiKey) {
                apiCollectibleContractObject = yield util_1.handleFetch(api, {
                    headers: { 'X-API-KEY': this.openSeaApiKey },
                });
            }
            else {
                apiCollectibleContractObject = yield util_1.handleFetch(api);
            }
            return apiCollectibleContractObject;
        });
    }
    /**
     * Request collectible contract information from the contract itself.
     *
     * @param contractAddress - Hex address of the collectible contract.
     * @returns Promise resolving to the current collectible name and image.
     */
    getCollectibleContractInformationFromContract(contractAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            const name = yield this.getAssetName(contractAddress);
            const symbol = yield this.getAssetSymbol(contractAddress);
            return {
                collection: { name },
                symbol,
                address: contractAddress,
            };
        });
    }
    /**
     * Request collectible contract information from OpenSea API.
     *
     * @param contractAddress - Hex address of the collectible contract.
     * @returns Promise resolving to the collectible contract name, image and description.
     */
    getCollectibleContractInformation(contractAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            const blockchainContractData = yield util_1.safelyExecute(() => __awaiter(this, void 0, void 0, function* () {
                return yield this.getCollectibleContractInformationFromContract(contractAddress);
            }));
            let openSeaContractData;
            if (this.config.openSeaEnabled) {
                openSeaContractData = yield util_1.safelyExecute(() => __awaiter(this, void 0, void 0, function* () {
                    return yield this.getCollectibleContractInformationFromApi(contractAddress);
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
     * Adds an individual collectible to the stored collectible list.
     *
     * @param address - Hex address of the collectible contract.
     * @param tokenId - The collectible identifier.
     * @param collectibleMetadata - Collectible optional information (name, image and description).
     * @param detection - The chain ID and address of the currently selected network and account at the moment the collectible was detected.
     * @returns Promise resolving to the current collectible list.
     */
    addIndividualCollectible(address, tokenId, collectibleMetadata, detection) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: Remove unused return
            const releaseLock = yield this.mutex.acquire();
            try {
                address = util_1.toChecksumHexAddress(address);
                const { allCollectibles } = this.state;
                let chainId, selectedAddress;
                if (detection) {
                    chainId = detection.chainId;
                    selectedAddress = detection.userAddress;
                }
                else {
                    chainId = this.config.chainId;
                    selectedAddress = this.config.selectedAddress;
                }
                const collectibles = ((_a = allCollectibles[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
                const existingEntry = collectibles.find((collectible) => collectible.address.toLowerCase() === address.toLowerCase() &&
                    collectible.tokenId === tokenId);
                if (existingEntry) {
                    const differentMetadata = assetsUtil_1.compareCollectiblesMetadata(collectibleMetadata, existingEntry);
                    if (differentMetadata) {
                        // TODO: Switch to indexToUpdate
                        const indexToRemove = collectibles.findIndex((collectible) => collectible.address.toLowerCase() === address.toLowerCase() &&
                            collectible.tokenId === tokenId);
                        /* istanbul ignore next */
                        if (indexToRemove !== -1) {
                            collectibles.splice(indexToRemove, 1);
                        }
                    }
                    else {
                        return collectibles;
                    }
                }
                const newEntry = Object.assign(Object.assign({ address,
                    tokenId }, collectibleMetadata), { favorite: (existingEntry === null || existingEntry === void 0 ? void 0 : existingEntry.favorite) || false });
                const newCollectibles = [...collectibles, newEntry];
                const addressCollectibles = allCollectibles[selectedAddress];
                const newAddressCollectibles = Object.assign(Object.assign({}, addressCollectibles), { [chainId]: newCollectibles });
                const newAllCollectibles = Object.assign(Object.assign({}, allCollectibles), { [selectedAddress]: newAddressCollectibles });
                this.update({
                    allCollectibles: newAllCollectibles,
                });
                return newCollectibles;
            }
            finally {
                releaseLock();
            }
        });
    }
    /**
     * Adds a collectible contract to the stored collectible contracts list.
     *
     * @param address - Hex address of the collectible contract.
     * @param detection - The chain ID and address of the currently selected network and account at the moment the collectible was detected.
     * @returns Promise resolving to the current collectible contracts list.
     */
    addCollectibleContract(address, detection) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const releaseLock = yield this.mutex.acquire();
            try {
                address = util_1.toChecksumHexAddress(address);
                const { allCollectibleContracts } = this.state;
                let chainId, selectedAddress;
                if (detection) {
                    chainId = detection.chainId;
                    selectedAddress = detection.userAddress;
                }
                else {
                    chainId = this.config.chainId;
                    selectedAddress = this.config.selectedAddress;
                }
                const collectibleContracts = ((_a = allCollectibleContracts[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
                const existingEntry = collectibleContracts.find((collectibleContract) => collectibleContract.address.toLowerCase() === address.toLowerCase());
                if (existingEntry) {
                    return collectibleContracts;
                }
                const contractInformation = yield this.getCollectibleContractInformation(address);
                const { asset_contract_type, created_date, schema_name, symbol, total_supply, description, external_link, collection: { name, image_url }, } = contractInformation;
                // If being auto-detected opensea information is expected
                // Otherwise at least name and symbol from contract is needed
                if ((detection && !name) ||
                    Object.keys(contractInformation).length === 0) {
                    return collectibleContracts;
                }
                /* istanbul ignore next */
                const newEntry = Object.assign({}, { address }, description && { description }, name && { name }, image_url && { logo: image_url }, symbol && { symbol }, total_supply !== null &&
                    typeof total_supply !== 'undefined' && { totalSupply: total_supply }, asset_contract_type && { assetContractType: asset_contract_type }, created_date && { createdDate: created_date }, schema_name && { schemaName: schema_name }, external_link && { externalLink: external_link });
                const newCollectibleContracts = [...collectibleContracts, newEntry];
                const addressCollectibleContracts = allCollectibleContracts[selectedAddress];
                const newAddressCollectibleContracts = Object.assign(Object.assign({}, addressCollectibleContracts), { [chainId]: newCollectibleContracts });
                const newAllCollectibleContracts = Object.assign(Object.assign({}, allCollectibleContracts), { [selectedAddress]: newAddressCollectibleContracts });
                this.update({
                    allCollectibleContracts: newAllCollectibleContracts,
                });
                return newCollectibleContracts;
            }
            finally {
                releaseLock();
            }
        });
    }
    /**
     * Removes an individual collectible from the stored token list and saves it in ignored collectibles list.
     *
     * @param address - Hex address of the collectible contract.
     * @param tokenId - Token identifier of the collectible.
     */
    removeAndIgnoreIndividualCollectible(address, tokenId) {
        var _a;
        address = util_1.toChecksumHexAddress(address);
        const { allCollectibles, ignoredCollectibles } = this.state;
        const { chainId, selectedAddress } = this.config;
        const newIgnoredCollectibles = [...ignoredCollectibles];
        const collectibles = ((_a = allCollectibles[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
        const newCollectibles = collectibles.filter((collectible) => {
            if (collectible.address.toLowerCase() === address.toLowerCase() &&
                collectible.tokenId === tokenId) {
                const alreadyIgnored = newIgnoredCollectibles.find((c) => c.address === address && c.tokenId === tokenId);
                !alreadyIgnored && newIgnoredCollectibles.push(collectible);
                return false;
            }
            return true;
        });
        const addressCollectibles = allCollectibles[selectedAddress];
        const newAddressCollectibles = Object.assign(Object.assign({}, addressCollectibles), { [chainId]: newCollectibles });
        const newAllCollectibles = Object.assign(Object.assign({}, allCollectibles), { [selectedAddress]: newAddressCollectibles });
        this.update({
            allCollectibles: newAllCollectibles,
            ignoredCollectibles: newIgnoredCollectibles,
        });
    }
    /**
     * Removes an individual collectible from the stored token list.
     *
     * @param address - Hex address of the collectible contract.
     * @param tokenId - Token identifier of the collectible.
     */
    removeIndividualCollectible(address, tokenId) {
        var _a;
        address = util_1.toChecksumHexAddress(address);
        const { allCollectibles } = this.state;
        const { chainId, selectedAddress } = this.config;
        const collectibles = ((_a = allCollectibles[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
        const newCollectibles = collectibles.filter((collectible) => !(collectible.address.toLowerCase() === address.toLowerCase() &&
            collectible.tokenId === tokenId));
        const addressCollectibles = allCollectibles[selectedAddress];
        const newAddressCollectibles = Object.assign(Object.assign({}, addressCollectibles), { [chainId]: newCollectibles });
        const newAllCollectibles = Object.assign(Object.assign({}, allCollectibles), { [selectedAddress]: newAddressCollectibles });
        this.update({
            allCollectibles: newAllCollectibles,
        });
    }
    /**
     * Removes a collectible contract to the stored collectible contracts list.
     *
     * @param address - Hex address of the collectible contract.
     * @returns Promise resolving to the current collectible contracts list.
     */
    removeCollectibleContract(address) {
        var _a;
        address = util_1.toChecksumHexAddress(address);
        const { allCollectibleContracts } = this.state;
        const { chainId, selectedAddress } = this.config;
        const collectibleContracts = ((_a = allCollectibleContracts[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
        const newCollectibleContracts = collectibleContracts.filter((collectibleContract) => !(collectibleContract.address.toLowerCase() === address.toLowerCase()));
        const addressCollectibleContracts = allCollectibleContracts[selectedAddress];
        const newAddressCollectibleContracts = Object.assign(Object.assign({}, addressCollectibleContracts), { [chainId]: newCollectibleContracts });
        const newAllCollectibleContracts = Object.assign(Object.assign({}, allCollectibleContracts), { [selectedAddress]: newAddressCollectibleContracts });
        this.update({
            allCollectibleContracts: newAllCollectibleContracts,
        });
        return newCollectibleContracts;
    }
    /**
     * Sets an OpenSea API key to retrieve collectible information.
     *
     * @param openSeaApiKey - OpenSea API key.
     */
    setApiKey(openSeaApiKey) {
        this.openSeaApiKey = openSeaApiKey;
    }
    /**
     * Checks the ownership of a ERC-721 or ERC-1155 collectible for a given address.
     *
     * @param ownerAddress - User public address.
     * @param collectibleAddress - Collectible contract address.
     * @param collectibleId - Collectible token ID.
     * @returns Promise resolving the collectible ownership.
     */
    isCollectibleOwner(ownerAddress, collectibleAddress, collectibleId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Checks the ownership for ERC-721.
            try {
                const owner = yield this.getOwnerOf(collectibleAddress, collectibleId);
                return ownerAddress.toLowerCase() === owner.toLowerCase();
                // eslint-disable-next-line no-empty
            }
            catch (_a) {
                // Ignore ERC-721 contract error
            }
            // Checks the ownership for ERC-1155.
            try {
                const balance = yield this.balanceOfERC1155Collectible(ownerAddress, collectibleAddress, collectibleId);
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
     * Verifies currently selected address owns entered collectible address/tokenId combo and
     * adds the collectible and respective collectible contract to the stored collectible and collectible contracts lists.
     *
     * @param address - Hex address of the collectible contract.
     * @param tokenId - The collectible identifier.
     */
    addCollectibleVerifyOwnership(address, tokenId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { selectedAddress } = this.config;
            if (!(yield this.isCollectibleOwner(selectedAddress, address, tokenId))) {
                throw new Error('This collectible is not owned by the user');
            }
            yield this.addCollectible(address, tokenId);
        });
    }
    /**
     * Adds a collectible and respective collectible contract to the stored collectible and collectible contracts lists.
     *
     * @param address - Hex address of the collectible contract.
     * @param tokenId - The collectible identifier.
     * @param collectibleMetadata - Collectible optional metadata.
     * @param detection - The chain ID and address of the currently selected network and account at the moment the collectible was detected.
     * @returns Promise resolving to the current collectible list.
     */
    addCollectible(address, tokenId, collectibleMetadata, detection) {
        return __awaiter(this, void 0, void 0, function* () {
            address = util_1.toChecksumHexAddress(address);
            const newCollectibleContracts = yield this.addCollectibleContract(address, detection);
            collectibleMetadata =
                collectibleMetadata ||
                    (yield this.getCollectibleInformation(address, tokenId));
            // If collectible contract was not added, do not add individual collectible
            const collectibleContract = newCollectibleContracts.find((contract) => contract.address.toLowerCase() === address.toLowerCase());
            // If collectible contract information, add individual collectible
            if (collectibleContract) {
                yield this.addIndividualCollectible(address, tokenId, collectibleMetadata, detection);
            }
        });
    }
    /**
     * Removes a collectible from the stored token list.
     *
     * @param address - Hex address of the collectible contract.
     * @param tokenId - Token identifier of the collectible.
     */
    removeCollectible(address, tokenId) {
        var _a;
        address = util_1.toChecksumHexAddress(address);
        this.removeIndividualCollectible(address, tokenId);
        const { allCollectibles } = this.state;
        const { chainId, selectedAddress } = this.config;
        const collectibles = ((_a = allCollectibles[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
        const remainingCollectible = collectibles.find((collectible) => collectible.address.toLowerCase() === address.toLowerCase());
        if (!remainingCollectible) {
            this.removeCollectibleContract(address);
        }
    }
    /**
     * Removes a collectible from the stored token list and saves it in ignored collectibles list.
     *
     * @param address - Hex address of the collectible contract.
     * @param tokenId - Token identifier of the collectible.
     */
    removeAndIgnoreCollectible(address, tokenId) {
        var _a;
        address = util_1.toChecksumHexAddress(address);
        this.removeAndIgnoreIndividualCollectible(address, tokenId);
        const { allCollectibles } = this.state;
        const { chainId, selectedAddress } = this.config;
        const collectibles = ((_a = allCollectibles[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
        const remainingCollectible = collectibles.find((collectible) => collectible.address.toLowerCase() === address.toLowerCase());
        if (!remainingCollectible) {
            this.removeCollectibleContract(address);
        }
    }
    /**
     * Removes all collectibles from the ignored list.
     */
    clearIgnoredCollectibles() {
        this.update({ ignoredCollectibles: [] });
    }
    /**
     * Update collectible favorite status.
     *
     * @param collectible - Collectible to update.
     * @param favorite - Collectible new favorite status.
     */
    updateCollectibleFavoriteStatus(collectible, favorite) {
        var _a;
        const { allCollectibles } = this.state;
        const { chainId, selectedAddress } = this.config;
        const collectibles = ((_a = allCollectibles[selectedAddress]) === null || _a === void 0 ? void 0 : _a[chainId]) || [];
        const index = collectibles.indexOf(collectible);
        if (index === -1) {
            return;
        }
        const updatedCollectible = Object.assign(Object.assign({}, collectibles[index]), { favorite });
        // Update Collectibles array
        collectibles[index] = updatedCollectible;
        const addressCollectibles = allCollectibles[selectedAddress];
        const newAddressCollectibles = Object.assign(Object.assign({}, addressCollectibles), { [chainId]: collectibles });
        const newAllCollectiblesState = Object.assign(Object.assign({}, allCollectibles), { [selectedAddress]: newAddressCollectibles });
        this.update({
            allCollectibles: newAllCollectiblesState,
        });
    }
}
exports.CollectiblesController = CollectiblesController;
exports.default = CollectiblesController;
//# sourceMappingURL=CollectiblesController.js.map