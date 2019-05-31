import BaseController, { BaseConfig, BaseState } from '../BaseController';
const extend = require('xtend');
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
	addressBook: { [address: string]: ContactEntry };
}

/**
 * Controller that manages a list of recipient addresses associated with nicknames
 */
export class AddressBookController extends BaseController<BaseConfig, AddressBookState> {
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

		this.defaultState = { addressBook: {} };

		this.initialize();
	}

	/**
	 * Remove all contract entries
	 */
	clear() {
		this.update({ addressBook: {} });
	}

	/**
	 * Remove a contract entry by address
	 *
	 * @param address - Recipient address to delete
	 */
	delete(address: string) {
		delete this.state.addressBook[address];
		this.update({ addressBook: this.state.addressBook });
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
		const oldAddresses: any = {};
		for (const entry in this.state.addressBook) {
			const oldEntry = {
				address: this.state.addressBook[entry].address,
				name: this.state.addressBook[entry].name
			};
			oldAddresses[entry] = oldEntry;
		}

		const addressEntry = { address, name };
		const newEntry: any = {};
		newEntry[address] = addressEntry;

		const combined = extend(oldAddresses, newEntry);
		this.update({ addressBook: combined });
		return true;
	}
}

export default AddressBookController;
