import BaseController, { BaseConfig, BaseState } from '../src/BaseController';

const { isValidAddress } = require('ethereumjs-util');

/**
 * @type ContactEntry
 *
 * ContactEntry representation
 *
 * @property address - Hex address of a recipient account
 * @property name - Nickname associated with this address
 */
export interface ContactEntry {
	address: string;
	name: string;
}

/**
 * @type AddressBookState
 *
 * Address book controller state
 *
 * @property addressBook - Array of contact entry objects
 */
export interface AddressBookState extends BaseState {
	addressBook: ContactEntry[];
}

/**
 * Controller that manages a list of recipient addresses associated with nicknames
 */
export class AddressBookController extends BaseController<BaseConfig, AddressBookState> {
	private addressBook = new Map<string, ContactEntry>();

	/**
	 * Name of this controller used during composition
	 */
	name = 'AddressBookController';

	/**
	 * Creates an AddressBookController instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<BaseConfig>, state?: Partial<AddressBookState>) {
		super(config, state);
		this.defaultState = { addressBook: [] };
		this.initialize();
	}

	/**
	 * Remove all contract entries
	 */
	clear() {
		this.addressBook.clear();
		this.update({ addressBook: Array.from(this.addressBook.values()) });
	}

	/**
	 * Remove a contract entry by address
	 *
	 * @param address - Recipient address to delete
	 */
	delete(address: string) {
		this.addressBook.delete(address);
		this.update({ addressBook: Array.from(this.addressBook.values()) });
	}

	/**
	 * Add or update a contact entry by address
	 *
	 * @param address - Recipient address to add or update
	 * @param name - Nickname to associate with this address
	 * @returns - Boolean indicating if the address was successfully set
	 */
	set(address: string, name: string) {
		if (!isValidAddress(address)) {
			return false;
		}
		this.addressBook.set(address, { address, name });
		this.update({ addressBook: Array.from(this.addressBook.values()) });
		return true;
	}
}

export default AddressBookController;
