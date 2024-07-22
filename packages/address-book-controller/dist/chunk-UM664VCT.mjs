// src/AddressBookController.ts
import { BaseController } from "@metamask/base-controller";
import {
  normalizeEnsName,
  isValidHexAddress,
  isSafeDynamicKey,
  toChecksumHexAddress,
  toHex
} from "@metamask/controller-utils";
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
var AddressBookController = class extends BaseController {
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
    address = toChecksumHexAddress(address);
    if (![chainId, address].every((key) => isSafeDynamicKey(key)) || !isValidHexAddress(address) || !this.state.addressBook[chainId] || !this.state.addressBook[chainId][address]) {
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
  set(address, name, chainId = toHex(1), memo = "", addressType) {
    address = toChecksumHexAddress(address);
    if (!isValidHexAddress(address)) {
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
    const ensName = normalizeEnsName(name);
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

export {
  AddressType,
  controllerName,
  getDefaultAddressBookControllerState,
  AddressBookController,
  AddressBookController_default
};
//# sourceMappingURL=chunk-UM664VCT.mjs.map