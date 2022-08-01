"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreferencesController = void 0;
const BaseController_1 = require("../BaseController");
const util_1 = require("../util");
/**
 * Controller that stores shared settings and exposes convenience methods
 */
class PreferencesController extends BaseController_1.BaseController {
    /**
     * Creates a PreferencesController instance.
     *
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor(config, state) {
        super(config, state);
        /**
         * Name of this controller used during composition
         */
        this.name = 'PreferencesController';
        this.defaultState = {
            featureFlags: {},
            frequentRpcList: [],
            identities: {},
            ipfsGateway: 'https://ipfs.io/ipfs/',
            lostIdentities: {},
            selectedAddress: '',
            useTokenDetection: true,
            useCollectibleDetection: false,
            openSeaEnabled: false,
        };
        this.initialize();
    }
    /**
     * Adds identities to state.
     *
     * @param addresses - List of addresses to use to generate new identities.
     */
    addIdentities(addresses) {
        const { identities } = this.state;
        addresses.forEach((address) => {
            address = (0, util_1.toChecksumHexAddress)(address);
            if (identities[address]) {
                return;
            }
            const identityCount = Object.keys(identities).length;
            identities[address] = {
                name: `Account ${identityCount + 1}`,
                address,
                importTime: Date.now(),
            };
        });
        this.update({ identities: Object.assign({}, identities) });
    }
    /**
     * Removes an identity from state.
     *
     * @param address - Address of the identity to remove.
     */
    removeIdentity(address) {
        address = (0, util_1.toChecksumHexAddress)(address);
        const { identities } = this.state;
        if (!identities[address]) {
            return;
        }
        delete identities[address];
        this.update({ identities: Object.assign({}, identities) });
        if (address === this.state.selectedAddress) {
            this.update({ selectedAddress: Object.keys(identities)[0] });
        }
    }
    /**
     * Associates a new label with an identity.
     *
     * @param address - Address of the identity to associate.
     * @param label - New label to assign.
     */
    setAccountLabel(address, label) {
        address = (0, util_1.toChecksumHexAddress)(address);
        const { identities } = this.state;
        identities[address] = identities[address] || {};
        identities[address].name = label;
        this.update({ identities: Object.assign({}, identities) });
    }
    /**
     * Enable or disable a specific feature flag.
     *
     * @param feature - Feature to toggle.
     * @param activated - Value to assign.
     */
    setFeatureFlag(feature, activated) {
        const oldFeatureFlags = this.state.featureFlags;
        const featureFlags = Object.assign(Object.assign({}, oldFeatureFlags), { [feature]: activated });
        this.update({ featureFlags: Object.assign({}, featureFlags) });
    }
    /**
     * Synchronizes the current identity list with new identities.
     *
     * @param addresses - List of addresses corresponding to identities to sync.
     * @returns Newly-selected address after syncing.
     */
    syncIdentities(addresses) {
        addresses = addresses.map((address) => (0, util_1.toChecksumHexAddress)(address));
        const { identities, lostIdentities } = this.state;
        const newlyLost = {};
        for (const identity in identities) {
            if (addresses.indexOf(identity) === -1) {
                newlyLost[identity] = identities[identity];
                delete identities[identity];
            }
        }
        if (Object.keys(newlyLost).length > 0) {
            for (const key in newlyLost) {
                lostIdentities[key] = newlyLost[key];
            }
        }
        this.update({
            identities: Object.assign({}, identities),
            lostIdentities: Object.assign({}, lostIdentities),
        });
        this.addIdentities(addresses);
        if (addresses.indexOf(this.state.selectedAddress) === -1) {
            this.update({ selectedAddress: addresses[0] });
        }
        return this.state.selectedAddress;
    }
    /**
     * Generates and stores a new list of stored identities based on address. If the selected address
     * is unset, or if it refers to an identity that was removed, it will be set to the first
     * identity.
     *
     * @param addresses - List of addresses to use as a basis for each identity.
     */
    updateIdentities(addresses) {
        addresses = addresses.map((address) => (0, util_1.toChecksumHexAddress)(address));
        const oldIdentities = this.state.identities;
        const identities = addresses.reduce((ids, address, index) => {
            ids[address] = oldIdentities[address] || {
                address,
                name: `Account ${index + 1}`,
                importTime: Date.now(),
            };
            return ids;
        }, {});
        let { selectedAddress } = this.state;
        if (!Object.keys(identities).includes(selectedAddress)) {
            selectedAddress = Object.keys(identities)[0];
        }
        this.update({ identities: Object.assign({}, identities), selectedAddress });
    }
    /**
     * Adds custom RPC URL to state.
     *
     * @param url - The custom RPC URL.
     * @param chainId - The chain ID of the network, as per EIP-155.
     * @param ticker - Currency ticker.
     * @param nickname - Personalized network name.
     * @param rpcPrefs - Personalized preferences.
     */
    addToFrequentRpcList(url, chainId, ticker, nickname, rpcPrefs) {
        const { frequentRpcList } = this.state;
        const index = frequentRpcList.findIndex(({ rpcUrl }) => {
            return rpcUrl === url;
        });
        if (index !== -1) {
            frequentRpcList.splice(index, 1);
        }
        const newFrequestRpc = {
            rpcUrl: url,
            chainId,
            ticker,
            nickname,
            rpcPrefs,
        };
        frequentRpcList.push(newFrequestRpc);
        this.update({ frequentRpcList: [...frequentRpcList] });
    }
    /**
     * Removes custom RPC URL from state.
     *
     * @param url - Custom RPC URL.
     */
    removeFromFrequentRpcList(url) {
        const { frequentRpcList } = this.state;
        const index = frequentRpcList.findIndex(({ rpcUrl }) => {
            return rpcUrl === url;
        });
        if (index !== -1) {
            frequentRpcList.splice(index, 1);
        }
        this.update({ frequentRpcList: [...frequentRpcList] });
    }
    /**
     * Sets selected address.
     *
     * @param selectedAddress - Ethereum address.
     */
    setSelectedAddress(selectedAddress) {
        this.update({ selectedAddress: (0, util_1.toChecksumHexAddress)(selectedAddress) });
    }
    /**
     * Sets new IPFS gateway.
     *
     * @param ipfsGateway - IPFS gateway string.
     */
    setIpfsGateway(ipfsGateway) {
        this.update({ ipfsGateway });
    }
    /**
     * Toggle the token detection setting.
     *
     * @param useTokenDetection - Boolean indicating user preference on token detection.
     */
    setUseTokenDetection(useTokenDetection) {
        this.update({ useTokenDetection });
    }
    /**
     * Toggle the collectible detection setting.
     *
     * @param useCollectibleDetection - Boolean indicating user preference on collectible detection.
     */
    setUseCollectibleDetection(useCollectibleDetection) {
        if (useCollectibleDetection && !this.state.openSeaEnabled) {
            throw new Error('useCollectibleDetection cannot be enabled if openSeaEnabled is false');
        }
        this.update({ useCollectibleDetection });
    }
    /**
     * Toggle the opensea enabled setting.
     *
     * @param openSeaEnabled - Boolean indicating user preference on using OpenSea's API.
     */
    setOpenSeaEnabled(openSeaEnabled) {
        this.update({ openSeaEnabled });
        if (!openSeaEnabled) {
            this.update({ useCollectibleDetection: false });
        }
    }
}
exports.PreferencesController = PreferencesController;
exports.default = PreferencesController;
//# sourceMappingURL=PreferencesController.js.map