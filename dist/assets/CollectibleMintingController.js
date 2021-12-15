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
class CollectibleMintingController extends BaseController_1.BaseController {
    /**
     * Creates the CollectibleMintingController instance.
     *
     * @param options - The controller options.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param options.addCollectible - Allows the controlelr to add a collectible to collectible controller.
     * @param options.addTransaction - Allows the controler to add a transaction to transaction controller.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ onNetworkStateChange, addCollectible, addTransaction, }, config, state) {
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
            const { chainId } = provider;
            this.configure({ chainId });
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
    customMint(tokenUri) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(tokenUri);
        });
    }
    raribleMint(tokenUri, royalties) {
        return __awaiter(this, void 0, void 0, function* () {
            const { networkType, selectedAddress } = this.config;
            if (networkType !== constants_1.MAINNET &&
                networkType !== constants_1.RINKEBY &&
                networkType !== constants_1.ROPSTEN) {
                throw new Error(`Network ${networkType} not support by Rarible. Use mainnet, rinkeby or ropsten`);
            }
            const creators = [{ account: selectedAddress, value: 10000 }];
            const collectionAddress = constants_1.ERC721_RARIBLE_COLLECTIONS[networkType];
            const sdk = protocol_ethereum_sdk_1.createRaribleSdk(new web3_ethereum_1.Web3Ethereum({ web3: this.web3 }), 'rinkeby');
            const nftCollection = yield sdk.apis.nftCollection.getNftCollectionById({
                collection: collectionAddress,
            });
            console.log(Object.keys(sdk.apis));
            console.log(Object.keys(sdk.nft));
            const mintingTx = yield sdk.nft.mint({
                collection: nftCollection,
                uri: tokenUri,
                creators,
                royalties,
                lazy: true,
            });
            console.log('mintingTx -> ', mintingTx);
            return mintingTx;
        });
    }
    mint(tokenUri, options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (options.nftType === 'rarible') {
                yield this.raribleMint(tokenUri, []);
            }
            else {
                yield this.customMint(tokenUri);
            }
        });
    }
    /**
     * Sets a new provider.
     *
     * @property provider - Provider used to create a new underlying Web3 instance
     */
    set provider(provider) {
        this.web3 = new web3_1.default(provider);
    }
    get provider() {
        throw new Error('Property only used for setting');
    }
}
exports.CollectibleMintingController = CollectibleMintingController;
exports.default = CollectibleMintingController;
//# sourceMappingURL=CollectibleMintingController.js.map