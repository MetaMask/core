"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/AddressBookController.ts
var _basecontroller = require('@metamask/base-controller');






var _controllerutils = require('@metamask/controller-utils');
var AddressType = /* @__PURE__ */ ((AddressType2) => {
  AddressType2["externallyOwnedAccounts"] = "EXTERNALLY_OWNED_ACCOUNTS";
  AddressType2["contractAccounts"] = "CONTRACT_ACCOUNTS";
  AddressType2["nonAccounts"] = "NON_ACCOUNTS";
  return AddressType2;
})(AddressType || {});
var controllerName = "AddressBookController";
var addressBookControllerMetadata = {
  addressBook: { persist: true, anonymous: false }
};
var getDefaultAddressBookControllerState = () => {
  return {
    addressBook: {}
  };
};
var AddressBookController = class extends _basecontroller.BaseController {
  /**
   * Creates an AddressBookController instance.
   *
   * @param args - The {@link AddressBookController} arguments.
   * @param args.messenger - The controller messenger instance for communication.
   * @param args.state - Initial state to set on this controller.
   */
  constructor({
    messenger,
    state
  }) {
    const mergedState = { ...getDefaultAddressBookControllerState(), ...state };
    super({
      messenger,
      metadata: addressBookControllerMetadata,
      name: controllerName,
      state: mergedState
    });
  }
  /**
   * Remove all contract entries.
   */
  clear() {
    this.update((state) => {
      state.addressBook = {};
    });
  }
  /**
   * Remove a contract entry by address.
   *
   * @param chainId - Chain id identifies the current chain.
   * @param address - Recipient address to delete.
   * @returns Whether the entry was deleted.
   */
  delete(chainId, address) {
    address = _controllerutils.toChecksumHexAddress.call(void 0, address);
    if (![chainId, address].every((key) => _controllerutils.isSafeDynamicKey.call(void 0, key)) || !_controllerutils.isValidHexAddress.call(void 0, address) || !this.state.addressBook[chainId] || !this.state.addressBook[chainId][address]) {
      return false;
    }
    this.update((state) => {
      delete state.addressBook[chainId][address];
      if (Object.keys(state.addressBook[chainId]).length === 0) {
        delete state.addressBook[chainId];
      }
    });
    return true;
  }
  /**
   * Add or update a contact entry by address.
   *
   * @param address - Recipient address to add or update.
   * @param name - Nickname to associate with this address.
   * @param chainId - Chain id identifies the current chain.
   * @param memo - User's note about address.
   * @param addressType - Contact's address type.
   * @returns Boolean indicating if the address was successfully set.
   */
  set(address, name, chainId = _controllerutils.toHex.call(void 0, 1), memo = "", addressType) {
    address = _controllerutils.toChecksumHexAddress.call(void 0, address);
    if (!_controllerutils.isValidHexAddress.call(void 0, address)) {
      return false;
    }
    const entry = {
      address,
      chainId,
      isEns: false,
      memo,
      name,
      addressType
    };
    const ensName = _controllerutils.normalizeEnsName.call(void 0, name);
    if (ensName) {
      entry.name = ensName;
      entry.isEns = true;
    }
    this.update((state) => {
      state.addressBook = {
        ...this.state.addressBook,
        [chainId]: {
          ...this.state.addressBook[chainId],
          [address]: entry
        }
      };
    });
    return true;
  }
};
var AddressBookController_default = AddressBookController;







exports.AddressType = AddressType; exports.controllerName = controllerName; exports.getDefaultAddressBookControllerState = getDefaultAddressBookControllerState; exports.AddressBookController = AddressBookController; exports.AddressBookController_default = AddressBookController_default;
//# sourceMappingURL=chunk-QIOW2RCR.js.map