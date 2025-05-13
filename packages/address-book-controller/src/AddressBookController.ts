import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import {
  normalizeEnsName,
  isValidHexAddress,
  isSafeDynamicKey,
  toChecksumHexAddress,
  toHex,
} from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';

/**
 * @type ContactEntry
 *
 * ContactEntry representation
 * @property address - Hex address of a recipient account
 * @property name - Nickname associated with this address
 * @property importTime - Data time when an account as created/imported
 */
export type ContactEntry = {
  address: string;
  name: string;
  importTime?: number;
};

/**
 * The type of address.
 */
export enum AddressType {
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  externallyOwnedAccounts = 'EXTERNALLY_OWNED_ACCOUNTS',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  contractAccounts = 'CONTRACT_ACCOUNTS',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  nonAccounts = 'NON_ACCOUNTS',
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
 * @property addressType - is the type of this address
 * @property lastUpdatedAt - timestamp when the entry was last updated
 * @property deleted - whether this entry has been deleted (tombstone marker)
 * @property deletedAt - timestamp when the entry was deleted
 */
export type AddressBookEntry = {
  address: string;
  name: string;
  chainId: Hex;
  memo: string;
  isEns: boolean;
  addressType?: AddressType;
  lastUpdatedAt?: number;
  deleted?: boolean;
  deletedAt?: number;
};

/**
 * @type AddressBookState
 *
 * Address book controller state
 * @property addressBook - Array of contact entry objects
 */
export type AddressBookControllerState = {
  addressBook: { [chainId: Hex]: { [address: string]: AddressBookEntry } };
};

/**
 * The name of the {@link AddressBookController}.
 */
export const controllerName = 'AddressBookController';

/**
 * The action that can be performed to get the state of the {@link AddressBookController}.
 */
export type AddressBookControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AddressBookControllerState
>;

/**
 * The action that can be performed to list contacts from the {@link AddressBookController}.
 */
export type AddressBookControllerListAction = {
  type: `${typeof controllerName}:list`;
  handler: AddressBookController['list'];
};

/**
 * Event emitted when a contact is added or updated
 */
export type AddressBookControllerContactUpdatedEvent = {
  type: `${typeof controllerName}:contactUpdated`;
  payload: [AddressBookEntry];
};

/**
 * Event emitted when a contact is deleted
 */
export type AddressBookControllerContactDeletedEvent = {
  type: `${typeof controllerName}:contactDeleted`;
  payload: [AddressBookEntry];
};

/**
 * The actions that can be performed using the {@link AddressBookController}.
 */
export type AddressBookControllerActions = 
  | AddressBookControllerGetStateAction
  | AddressBookControllerListAction;

/**
 * The event that {@link AddressBookController} can emit.
 */
export type AddressBookControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AddressBookControllerState
>;

/**
 * The events that {@link AddressBookController} can emit.
 */
export type AddressBookControllerEvents = 
  | AddressBookControllerStateChangeEvent
  | AddressBookControllerContactUpdatedEvent
  | AddressBookControllerContactDeletedEvent;

const addressBookControllerMetadata = {
  addressBook: { persist: true, anonymous: false },
};

/**
 * Get the default {@link AddressBookController} state.
 *
 * @returns The default {@link AddressBookController} state.
 */
export const getDefaultAddressBookControllerState =
  (): AddressBookControllerState => {
    return {
      addressBook: {},
    };
  };

/**
 * The messenger of the {@link AddressBookController} for communication.
 */
export type AddressBookControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  AddressBookControllerActions,
  AddressBookControllerEvents,
  never,
  never
>;

/**
 * Controller that manages a list of recipient addresses associated with nicknames.
 */
export class AddressBookController extends BaseController<
  typeof controllerName,
  AddressBookControllerState,
  AddressBookControllerMessenger
> {
  /**
   * Creates an AddressBookController instance.
   *
   * @param args - The {@link AddressBookController} arguments.
   * @param args.messenger - The controller messenger instance for communication.
   * @param args.state - Initial state to set on this controller.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: AddressBookControllerMessenger;
    state?: Partial<AddressBookControllerState>;
  }) {
    const mergedState = { ...getDefaultAddressBookControllerState(), ...state };
    super({
      messenger,
      metadata: addressBookControllerMetadata,
      name: controllerName,
      state: mergedState,
    });

    this.#registerMessageHandlers();
  }

  /**
   * Returns all address book entries as an array.
   *
   * @param includeDeleted - Whether to include soft-deleted entries (default: false)
   * @returns Array of all address book entries.
   */
  list(includeDeleted: boolean = false): AddressBookEntry[] {
    const { addressBook } = this.state;
    const contacts: AddressBookEntry[] = [];
    
    Object.keys(addressBook).forEach((chainId) => {
      const chainIdHex = chainId as Hex;
      Object.keys(addressBook[chainIdHex]).forEach((address) => {
        const contact = addressBook[chainIdHex][address];
        if (includeDeleted || !contact.deleted) {
          contacts.push(contact);
        }
      });
    });
    
    return contacts;
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
  delete(chainId: Hex, address: string) {
    address = toChecksumHexAddress(address);
    if (
      ![chainId, address].every((key) => isSafeDynamicKey(key)) ||
      !isValidHexAddress(address) ||
      !this.state.addressBook[chainId] ||
      !this.state.addressBook[chainId][address]
    ) {
      return false;
    }

    const deletedEntry = { ...this.state.addressBook[chainId][address] };
    
    // Mark the entry as deleted instead of removing it
    const now = Date.now();
    this.update((state) => {
      state.addressBook[chainId][address] = {
        ...state.addressBook[chainId][address],
        deleted: true,
        deletedAt: now,
      };
    });

    // Include the deleted flag and timestamp in the event payload
    const finalDeletedEntry = { 
      ...deletedEntry,
      deleted: true, 
      deletedAt: now 
    };

    this.messagingSystem.publish(
      'AddressBookController:contactDeleted',
      finalDeletedEntry,
    );

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
   * @param lastUpdatedAt - Optional timestamp when entry was updated (defaults to now).
   * @returns Boolean indicating if the address was successfully set.
   */
  set(
    address: string,
    name: string,
    chainId = toHex(1),
    memo = '',
    addressType?: AddressType
  ) {
    address = toChecksumHexAddress(address);
    if (!isValidHexAddress(address)) {
      return false;
    }

    const entry = {
      address,
      chainId,
      isEns: false,
      deleted: false,
      memo,
      name,
      addressType,
      lastUpdatedAt: Date.now(),
    }
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
          [address]: entry,
        },
      };
    });

    this.messagingSystem.publish(
      'AddressBookController:contactUpdated',
      entry,
    );

    return true;
  }

  /**
   * Registers message handlers for the AddressBookController.
   */
  #registerMessageHandlers() {
    this.messagingSystem.registerActionHandler(
      `${controllerName}:list`,
      this.list.bind(this),
    );
  }
}

export default AddressBookController;