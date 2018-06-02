import BaseController, { BaseConfig, BaseState } from './BaseController';

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
export class AddressBookController extends BaseController<AddressBookState, BaseConfig> {
	private addressBook = new Map<string, ContactEntry>();

	/**
	 * Creates a AddressBookController instance
	 *
	 * @param state - Initial state to set on this controller
	 */
	constructor(state?: Partial<AddressBookState>) {
		super(state);
		this.defaultState = { addressBook: [] };
		this.initialize();
	}

	/**
	 * Add or update a contact entry by address
	 *
	 * @param address - Recipient address to add or update
	 * @param name - Nickname to associate with this address
	 */
	set(address: string, name: string) {
		this.addressBook.set(address, { address, name });
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
	 * Remove all contract entries
	 */
	clear() {
		this.addressBook.clear();
		this.update({ addressBook: Array.from(this.addressBook.values()) });
	}
}

export default AddressBookController;
