import { isValidAddress, toChecksumAddress } from 'ethereumjs-util';
import { isValidEnsName } from '../util';
import BaseController, { BaseConfig, BaseState } from '../BaseController';

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
 * @type AddressBookEntry
 *
 * AddressBookEntry representation
 *
 * @property address - Hex address of a recipient account
 * @property name - Nickname associated with this address
 * @property chainId - Chain id identifies the current chain
 * @property memo - User's note about address
 * @property isEns - is the entry an ENS name
 */
export interface AddressBookEntry {
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
 *
 * @property addressBook - Array of contact entry objects
 */
export interface AddressBookState extends BaseState {
	addressBook: { [chainId: string]: { [address: string]: AddressBookEntry } };
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
	delete(chainId: string, address: string) {
		address = toChecksumAddress(address);
		if (!isValidAddress(address) || !this.state.addressBook[chainId] || !this.state.addressBook[chainId][address]) {
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
	 * Add or update a contact entry by address
	 *
	 * @param address - Recipient address to add or update
	 * @param name - Nickname to associate with this address
	 * @param chainId - Chain id identifies the current chain
	 * @param memo - User's note about address
	 * @returns - Boolean indicating if the address was successfully set
	 */
	set(address: string, name: string, chainId = '1', memo = '') {
		address = toChecksumAddress(address);
		if (!isValidAddress(address)) {
			return false;
		}

		let isEns = false;
		if (isValidEnsName(name)) {
			isEns = true;
		}

		this.update({
			addressBook: {
				...this.state.addressBook,
				[chainId]: {
					...this.state.addressBook[chainId],
					[address]: {
						address,
						chainId,
						isEns,
						// isEns: isValidEnsName(name),
						memo,
						name
					}
				}
			}
		});

		return true;
	}
}

export default AddressBookController;
