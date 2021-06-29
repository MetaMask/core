import BaseController, { BaseConfig, BaseState } from '../BaseController';
/**
 * @type ContactEntry
 *
 * ContactEntry representation
 *
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
    addressBook: {
        [chainId: string]: {
            [address: string]: AddressBookEntry;
        };
    };
}
/**
 * Controller that manages a list of recipient addresses associated with nicknames
 */
export declare class AddressBookController extends BaseController<BaseConfig, AddressBookState> {
    /**
     * Name of this controller used during composition
     */
    name: string;
    /**
     * Creates an AddressBookController instance
     *
     * @param config - Initial options used to configure this controller
     * @param state - Initial state to set on this controller
     */
    constructor(config?: Partial<BaseConfig>, state?: Partial<AddressBookState>);
    /**
     * Remove all contract entries
     */
    clear(): void;
    /**
     * Remove a contract entry by address
     *
     * @param chainId - Chain id identifies the current chain
     * @param address - Recipient address to delete
     */
    delete(chainId: string, address: string): boolean;
    /**
     * Add or update a contact entry by address
     *
     * @param address - Recipient address to add or update
     * @param name - Nickname to associate with this address
     * @param chainId - Chain id identifies the current chain
     * @param memo - User's note about address
     * @returns - Boolean indicating if the address was successfully set
     */
    set(address: string, name: string, chainId?: string, memo?: string): boolean;
}
export default AddressBookController;
