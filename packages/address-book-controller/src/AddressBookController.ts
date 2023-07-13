import type { CaipChainId } from '@metamask/utils';
import {
  normalizeEnsName,
  isValidHexAddress,
  toChecksumHexAddress,
} from '@metamask/controller-utils';
import {
  BaseController,
  BaseConfig,
  BaseState,
} from '@metamask/base-controller';

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

export enum AddressType {
  externallyOwnedAccounts = 'EXTERNALLY_OWNED_ACCOUNTS',
  contractAccounts = 'CONTRACT_ACCOUNTS',
  nonAccounts = 'NON_ACCOUNTS',
}

/**
 * @type AddressBookEntry
 *
 * AddressBookEntry representation
 * @property address - Hex address of a recipient account
 * @property name - Nickname associated with this address
 * @property caipChainId - Caip chain id identifies the current chain
 * @property memo - User's note about address
 * @property isEns - is the entry an ENS name
 * @property addressType - is the type of this address
 */
export interface AddressBookEntry {
  address: string;
  name: string;
  caipChainId: CaipChainId;
  memo: string;
  isEns: boolean;
  addressType?: AddressType;
}

/**
 * @type AddressBookState
 *
 * Address book controller state
 * @property addressBook - Array of contact entry objects
 */
export interface AddressBookState extends BaseState {
  addressBook: {
    [caipChainId: CaipChainId]: { [address: string]: AddressBookEntry };
  };
}

/**
 * Controller that manages a list of recipient addresses associated with nicknames.
 */
export class AddressBookController extends BaseController<
  BaseConfig,
  AddressBookState
> {
  /**
   * Name of this controller used during composition
   */
  override name = 'AddressBookController';

  /**
   * Creates an AddressBookController instance.
   *
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(config?: Partial<BaseConfig>, state?: Partial<AddressBookState>) {
    super(config, state);

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
   * @param caipChainId - Caip chain id identifies the current chain.
   * @param address - Recipient address to delete.
   * @returns Whether the entry was deleted.
   */
  delete(caipChainId: CaipChainId, address: string) {
    address = toChecksumHexAddress(address);
    if (
      !isValidHexAddress(address) ||
      !this.state.addressBook[caipChainId] ||
      !this.state.addressBook[caipChainId][address]
    ) {
      return false;
    }

    const addressBook = Object.assign({}, this.state.addressBook);
    delete addressBook[caipChainId][address];

    if (Object.keys(addressBook[caipChainId]).length === 0) {
      delete addressBook[caipChainId];
    }

    this.update({ addressBook });
    return true;
  }

  /**
   * Add or update a contact entry by address.
   *
   * @param address - Recipient address to add or update.
   * @param name - Nickname to associate with this address.
   * @param caipChainId - Caip chain id identifies the current chain.
   * @param memo - User's note about address.
   * @param addressType - Contact's address type.
   * @returns Boolean indicating if the address was successfully set.
   */
  set(
    address: string,
    name: string,
    caipChainId: CaipChainId = 'eip155:1',
    memo = '',
    addressType?: AddressType,
  ) {
    address = toChecksumHexAddress(address);
    if (!isValidHexAddress(address)) {
      return false;
    }

    const entry = {
      address,
      caipChainId,
      isEns: false,
      memo,
      name,
      addressType,
    };

    const ensName = normalizeEnsName(name);
    if (ensName) {
      entry.name = ensName;
      entry.isEns = true;
    }

    this.update({
      addressBook: {
        ...this.state.addressBook,
        [caipChainId]: {
          ...this.state.addressBook[caipChainId],
          [address]: entry,
        },
      },
    });

    return true;
  }
}

export default AddressBookController;
