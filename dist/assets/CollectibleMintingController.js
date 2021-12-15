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
exports.CollectibleMintingController = void 0;
const events_1 = require("events");
const BaseController_1 = require("../BaseController");
const constants_1 = require("../constants");
const util_1 = require("../util");
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
    customMint(collectible) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(collectible);
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
    raribleMint(collectible) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(collectible);
            // Prepare data
            // Mint
            this.addTransaction({
                from: '',
            });
            const result = new Promise((resolve, reject) => {
                this.hub.once(`tx.id:finished`, () => {
                    // if succesful
                    this.addCollectible('test', 'test');
                    return resolve('success');
                    // else show error
                    return reject(new Error());
                });
            });
            return result;
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
    mint(collectible, options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (options.nftType === 'rarible') {
                yield this.raribleMint(collectible);
            }
            else {
                yield this.customMint(collectible);
            }
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
}
exports.CollectibleMintingController = CollectibleMintingController;
exports.default = CollectibleMintingController;
//# sourceMappingURL=CollectibleMintingController.js.map