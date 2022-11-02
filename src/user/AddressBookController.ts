import {
  normalizeEnsName,
  isValidHexAddress,
  toChecksumHexAddress,
} from '../util';
import { BaseController } from '../BaseControllerV2';
import type { RestrictedControllerMessenger } from '../ControllerMessenger';

/**
 * @type ContactEntry
 *
 * ContactEntry representation
 * @property address - Hex address of a recipient account
 * @property name - Nickname associated with this address
 * @property importTime - Data time when an account as created/imported
 */
export interface ContactEntry {
  address: string;
  name: string;
  importTime?: number;
}

/**
 * @type AddressBookEntry
 *
 * AddressBookEntry representation
 * @property address - Hex address of a recipient account
 * @property name - Nickname associated with this address
 * @property chainId - Chain id identifies the current chain
 * @property memo - User's note about address
 * @property isEns - is the entry an ENS name
 */
export type AddressBookEntry = {
  address: string;
  name: string;
  chainId: string;
  memo: string;
  isEns: boolean;
}

/**
 * @type AddressBookState
 *
 * Address book controller state
 * @property addressBook - Array of contact entry objects
 */
export type AddressBookState = {
  addressBook: { [chainId: string]: { [address: string]: AddressBookEntry } };
}

type AddressBookMessenger = RestrictedControllerMessenger<
  typeof name,
  never,
  never,
  never,
  never
>;


const name =  'AddressBookController';

const defaultState = { addressBook: {} };

const metadata = {
  addressBook: {
    persist: true,
    anonymous: false,
  }
}

/**
 * Controller that manages a list of recipient addresses associated with nicknames.
 */
export class AddressBookController extends BaseController<
  typeof name,
  AddressBookState,
  AddressBookMessenger
> {
  /**
   * Creates an AddressBookController instance.
   *
   * @param state - Initial state to set on this controller.
   */
  constructor({ messenger, state }: { messenger: AddressBookMessenger, state?: AddressBookState }) {
    super({ messenger, metadata, name, state: { ...defaultState, ...state} });
  }

  /**
   * Remove all contract entries.
   */
  clear() {
    this.update(() => defaultState);
  }

  /**
   * Remove a contract entry by address.
   *
   * @param chainId - Chain id identifies the current chain.
   * @param address - Recipient address to delete.
   * @returns Whether the entry was deleted.
   */
  delete(chainId: string, address: string) {
    address = toChecksumHexAddress(address);
    if (
      !isValidHexAddress(address) ||
      !this.state.addressBook[chainId] ||
      !this.state.addressBook[chainId][address]
    ) {
      return false;
    }

    this.update(({ addressBook }) => {
      delete addressBook[chainId][address];

      if (Object.keys(addressBook[chainId]).length === 0) {
        delete addressBook[chainId];
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
   * @returns Boolean indicating if the address was successfully set.
   */
  set(address: string, name: string, chainId = '1', memo = '') {
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
    };

    const ensName = normalizeEnsName(name);
    if (ensName) {
      entry.name = ensName;
      entry.isEns = true;
    }

    this.update(({ addressBook }) => {
      if (!addressBook.chainId) {
        addressBook.chainId = {};
      }
      addressBook.chainId.address = entry;
    });

    return true;
  }
}

export default AddressBookController;
