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
exports.CollectibleMintingController = void 0;
const events_1 = require("events");
const web3_1 = __importDefault(require("web3"));
const protocol_ethereum_sdk_1 = require("@rarible/protocol-ethereum-sdk");
const web3_ethereum_1 = require("@rarible/web3-ethereum");
const BaseController_1 = require("../BaseController");
const constants_1 = require("../constants");
const util_1 = require("../util");
class CollectibleMintingController extends BaseController_1.BaseController {
    /**
     * Creates the CollectibleMintingController instance.
     *
     * @param options - The controller options.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
     * @param options.addCollectible - Allows the controlelr to add a collectible to collectible controller.
     * @param options.addTransaction - Allows the controler to add a transaction to transaction controller.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ onPreferencesStateChange, onNetworkStateChange, addCollectible, addTransaction, }, config, state) {
        super(config, state);
        /**
         * EventEmitter instance used to listen to specific transactional events
         */
        this.hub = new events_1.EventEmitter();
        /**
         * Name of this controller used during composition
         */
        this.name = 'CollectibleMintingController';
        this.defaultConfig = {
            networkType: constants_1.MAINNET,
            selectedAddress: '',
            chainId: '',
            ipfsGateway: constants_1.IPFS_DEFAULT_GATEWAY_URL,
            useIPFSSubdomains: true,
            provider: undefined,
        };
        this.defaultState = {
            minting: 'awaiting',
        };
        this.initialize();
        onNetworkStateChange(({ provider }) => {
            const { chainId, type } = provider;
            this.configure({ chainId, networkType: type });
        });
        onPreferencesStateChange(({ selectedAddress }) => {
            this.configure({ selectedAddress });
        });
        this.addCollectible = addCollectible;
        this.addTransaction = addTransaction;
    }
    // private async deployNewERC721(
    //   smartContractBytecode: any,
    //   name: string,
    //   symbol: string,
    // ): Promise<void> {
    //   const payload = {
    //     data: smartContractBytecode,
    //     arguments: [name, symbol],
    //   };
    //   const params = {
    //     from: 'address',
    //     gas: '0x0',
    //     gasPrice: '0x3DFB2E',
    //   };
    //   this.addTransaction({ ...params, ...payload }, 'Contract Deploy');
    // }
    customMintWithMMCollection(tokenUri) {
        return __awaiter(this, void 0, void 0, function* () {
            // ipfs://QmRUA2oJUceyGLxh6yVYQodL5smkP2Xr1u9eHciTM2xLMd
            console.log(tokenUri);
            // // Logic to covert metadat to hex
            // 0x60806040526040518060400160405280600581526020017f2e6a736f6e000000000000000000000000000000000000000000000000000000815250600c90805190602001906200005192919062000de6565b5066470de4df820000600d55612710600e556001600f556000601060..
            // const txParams = {};
            // txParams.from = '0x260416FDEc04AB146464aF833E63835a704C4860';
            // txParams.value = '0x0';
            // txParams.gas = '0x3DFB2E';
            // txParams.data = data;
            // const { transactionMeta } = await TransactionController.addTransaction(
            //     txParams,
            //     'nft',
            //     WalletDevice.MM_MOBILE
            // );
            // await TransactionController.approveTransaction(transactionMeta.id);
        });
    }
    raribleMint(tokenUri, raribleProps) {
        return __awaiter(this, void 0, void 0, function* () {
            const { networkType, selectedAddress } = this.config;
            const { royalties, creatorProfitPercentage, lazy } = raribleProps;
            if (networkType !== constants_1.MAINNET &&
                networkType !== constants_1.RINKEBY &&
                networkType !== constants_1.ROPSTEN) {
                throw new Error(`Network ${networkType} not support by Rarible. Use mainnet, rinkeby or ropsten`);
            }
            const creators = [
                { account: selectedAddress, value: creatorProfitPercentage },
            ];
            const collectionAddress = constants_1.ERC721_RARIBLE_COLLECTIONS[networkType].address;
            const sdk = protocol_ethereum_sdk_1.createRaribleSdk(new web3_ethereum_1.Web3Ethereum({ web3: this.web3 }), networkType);
            const nftCollection = yield sdk.apis.nftCollection.getNftCollectionById({
                collection: collectionAddress,
            });
            return yield sdk.nft.mint({
                collection: nftCollection,
                uri: tokenUri,
                creators,
                royalties,
                lazy,
            });
        });
    }
    /**
     * Method to add and pin data to IPFS.
     *
     * @param data - data objects to be posted on IPFS
     * @returns IPFS response
     */
    uploadDataToIpfs(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const formData = new FormData();
            formData.append('file', JSON.stringify(data));
            const ipfsAddResponse = yield util_1.handleFetch('https://ipfs.infura.io:5001/api/v0/add', {
                method: 'POST',
                body: formData,
            });
            return ipfsAddResponse;
        });
    }
    mint(tokenUri, options, raribleProps) {
        return __awaiter(this, void 0, void 0, function* () {
            if (options.nftType === 'rarible' && raribleProps) {
                yield this.raribleMint(tokenUri, raribleProps);
            }
            else {
                yield this.customMintWithMMCollection(tokenUri);
            }
            // REMOVE
            this.addCollectible('', '');
            this.addTransaction({});
        });
    }
    /**
     * Sets an Infura Project ID to POST collectible information.
     *
     * @param infuraProjectId - Infura Project ID
     */
    setInfuraProjectId(infuraProjectId) {
        this.infuraProjectId = infuraProjectId;
    }
    /**
     * Sets a new provider.
     *
     * @property provider - Provider used to create a new underlying Web3 instance
     */
    set provider(provider) {
        this.web3 = new web3_1.default(provider);
        console.log('New provider created for provider: ', provider);
    }
    get provider() {
        throw new Error('Property only used for setting');
    }
}
exports.CollectibleMintingController = CollectibleMintingController;
exports.default = CollectibleMintingController;
//# sourceMappingURL=CollectibleMintingController.js.map