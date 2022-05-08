"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnsController = void 0;
const BaseController_1 = require("../BaseController");
const util_1 = require("../util");
/**
 * Controller that manages a list ENS names and their resolved addresses
 * by chainId. A null address indicates an unresolved ENS name.
 */
class EnsController extends BaseController_1.BaseController {
    /**
     * Creates an EnsController instance.
     *
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor(config, state) {
        super(config, state);
        /**
         * Name of this controller used during composition
         */
        this.name = 'EnsController';
        this.defaultState = { ensEntries: {} };
        this.initialize();
    }
    /**
     * Remove all chain Ids and ENS entries from state.
     */
    clear() {
        this.update({ ensEntries: {} });
    }
    /**
     * Delete an ENS entry.
     *
     * @param chainId - Parent chain of the ENS entry to delete.
     * @param ensName - Name of the ENS entry to delete.
     * @returns Boolean indicating if the entry was deleted.
     */
    delete(chainId, ensName) {
        const normalizedEnsName = (0, util_1.normalizeEnsName)(ensName);
        if (!normalizedEnsName ||
            !this.state.ensEntries[chainId] ||
            !this.state.ensEntries[chainId][normalizedEnsName]) {
            return false;
        }
        const ensEntries = Object.assign({}, this.state.ensEntries);
        delete ensEntries[chainId][normalizedEnsName];
        if (Object.keys(ensEntries[chainId]).length === 0) {
            delete ensEntries[chainId];
        }
        this.update({ ensEntries });
        return true;
    }
    /**
     * Retrieve a DNS entry.
     *
     * @param chainId - Parent chain of the ENS entry to retrieve.
     * @param ensName - Name of the ENS entry to retrieve.
     * @returns The EnsEntry or null if it does not exist.
     */
    get(chainId, ensName) {
        const normalizedEnsName = (0, util_1.normalizeEnsName)(ensName);
        // TODO Explicitly handle the case where `normalizedEnsName` is `null`
        // eslint-disable-next-line no-implicit-coercion
        return !!normalizedEnsName && this.state.ensEntries[chainId]
            ? this.state.ensEntries[chainId][normalizedEnsName] || null
            : null;
    }
    /**
     * Add or update an ENS entry by chainId and ensName.
     *
     * A null address indicates that the ENS name does not resolve.
     *
     * @param chainId - Id of the associated chain.
     * @param ensName - The ENS name.
     * @param address - Associated address (or null) to add or update.
     * @returns Boolean indicating if the entry was set.
     */
    set(chainId, ensName, address) {
        if (!Number.isInteger(Number.parseInt(chainId, 10)) ||
            !ensName ||
            typeof ensName !== 'string' ||
            (address && !(0, util_1.isValidHexAddress)(address))) {
            throw new Error(`Invalid ENS entry: { chainId:${chainId}, ensName:${ensName}, address:${address}}`);
        }
        const normalizedEnsName = (0, util_1.normalizeEnsName)(ensName);
        if (!normalizedEnsName) {
            throw new Error(`Invalid ENS name: ${ensName}`);
        }
        const normalizedAddress = address ? (0, util_1.toChecksumHexAddress)(address) : null;
        const subState = this.state.ensEntries[chainId];
        if ((subState === null || subState === void 0 ? void 0 : subState[normalizedEnsName]) &&
            subState[normalizedEnsName].address === normalizedAddress) {
            return false;
        }
        this.update({
            ensEntries: Object.assign(Object.assign({}, this.state.ensEntries), { [chainId]: Object.assign(Object.assign({}, this.state.ensEntries[chainId]), { [normalizedEnsName]: {
                        address: normalizedAddress,
                        chainId,
                        ensName: normalizedEnsName,
                    } }) }),
        });
        return true;
    }
}
exports.EnsController = EnsController;
exports.default = EnsController;
//# sourceMappingURL=EnsController.js.map