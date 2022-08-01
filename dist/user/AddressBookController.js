"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddressBookController = void 0;
const util_1 = require("../util");
const BaseController_1 = require("../BaseController");
/**
 * Controller that manages a list of recipient addresses associated with nicknames
 */
class AddressBookController extends BaseController_1.BaseController {
    /**
     * Creates an AddressBookController instance.
     *
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor(config, state) {
        super(config, state);
        /**
         * Name of this controller used during composition
         */
        this.name = 'AddressBookController';
        this.defaultState = { addressBook: {} };
        this.initialize();
    }
    /**
     * Remove all contract entries.
     */
    clear() {
        this.update({ addressBook: {} });
    }
    /**
     * Remove a contract entry by address.
     *
     * @param chainId - Chain id identifies the current chain.
     * @param address - Recipient address to delete.
     * @returns Whether the entry was deleted.
     */
    delete(chainId, address) {
        address = (0, util_1.toChecksumHexAddress)(address);
        if (!(0, util_1.isValidHexAddress)(address) ||
            !this.state.addressBook[chainId] ||
            !this.state.addressBook[chainId][address]) {
            return false;
        }
        const addressBook = Object.assign({}, this.state.addressBook);
        delete addressBook[chainId][address];
        if (Object.keys(addressBook[chainId]).length === 0) {
            delete addressBook[chainId];
        }
        this.update({ addressBook });
        return true;
    }
    /**
     * Add or update a contact entry by address.
     *
     * @param address - Recipient address to add or update.
     * @param name - Nickname to associate with this address.
     * @param chainId - Chain id identifies the current chain.
     * @param memo - User's note about address.
     * @returns Boolean indicating if the address was successfully set.
     */
    set(address, name, chainId = '1', memo = '') {
        address = (0, util_1.toChecksumHexAddress)(address);
        if (!(0, util_1.isValidHexAddress)(address)) {
            return false;
        }
        const entry = {
            address,
            chainId,
            isEns: false,
            memo,
            name,
        };
        const ensName = (0, util_1.normalizeEnsName)(name);
        if (ensName) {
            entry.name = ensName;
            entry.isEns = true;
        }
        this.update({
            addressBook: Object.assign(Object.assign({}, this.state.addressBook), { [chainId]: Object.assign(Object.assign({}, this.state.addressBook[chainId]), { [address]: entry }) }),
        });
        return true;
    }
}
exports.AddressBookController = AddressBookController;
exports.default = AddressBookController;
//# sourceMappingURL=AddressBookController.js.map