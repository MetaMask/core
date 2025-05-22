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
 * The type of address.
 */
export enum AddressType {
  externallyOwnedAccounts = 'EXTERNALLY_OWNED_ACCOUNTS',
  contractAccounts = 'CONTRACT_ACCOUNTS',
  nonAccounts = 'NON_ACCOUNTS',
}

/**
 * AddressBookEntry
 *
 * AddressBookEntry representation
 *
 * address - Hex address of a recipient account
 *
 * name - Nickname associated with this address
 *
 * chainId - Chain id identifies the current chain
 *
 * memo - User's note about address
 *
 * isEns - is the entry an ENS name
 *
 * addressType - is the type of this address
 *
 * lastUpdatedAt - timestamp of when this entry was last updated
 */
export type AddressBookEntry = {
  address: string;
  name: string;
  chainId: Hex;
  memo: string;
  isEns: boolean;
  addressType?: AddressType;
  lastUpdatedAt?: number;
};

/**
 * AddressBookState
 *
 * Address book controller state
 *
 * addressBook - Array of contact entry objects
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
 * The action that can be performed to set a contact in the {@link AddressBookController}.
 */
export type AddressBookControllerSetAction = {
  type: `${typeof controllerName}:set`;
  handler: AddressBookController['set'];
};

/**
 * The action that can be performed to delete a contact from the {@link AddressBookController}.
 */
export type AddressBookControllerDeleteAction = {
  type: `${typeof controllerName}:delete`;
  handler: AddressBookController['delete'];
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
  | AddressBookControllerListAction
  | AddressBookControllerSetAction
  | AddressBookControllerDeleteAction;

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
   * @returns Array of all address book entries.
   */
  list(): AddressBookEntry[] {
    const { addressBook } = this.state;
    const contacts: AddressBookEntry[] = [];

    Object.keys(addressBook).forEach((chainId) => {
      const chainIdHex = chainId as Hex;
      Object.entries(addressBook[chainIdHex]).forEach(([_, contact]) => {
        contacts.push(contact);
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

    this.update((state) => {
      if (state.addressBook[chainId] && state.addressBook[chainId][address]) {
        delete state.addressBook[chainId][address];

        // Clean up empty chainId objects
        if (Object.keys(state.addressBook[chainId]).length === 0) {
          delete state.addressBook[chainId];
        }
      }
    });

    // Skip sending delete event for global contacts with chainId '*'
    // These entries with chainId='*' are the wallet's own accounts (internal MetaMask accounts),
    // not user-created contacts. They don't need to trigger sync events.
    if (String(chainId) !== '*') {
      this.messagingSystem.publish(
        'AddressBookController:contactDeleted',
        deletedEntry,
      );
    }

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
  set(
    address: string,
    name: string,
    chainId = toHex(1),
    memo = '',
    addressType?: AddressType,
  ) {
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
      addressType,
      lastUpdatedAt: Date.now(),
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
          [address]: entry,
        },
      };
    });

    // Skip sending update event for global contacts with chainId '*'
    // These entries with chainId='*' are the wallet's own accounts (internal MetaMask accounts),
    // not user-created contacts. They don't need to trigger sync events.
    if (String(chainId) !== '*') {
      this.messagingSystem.publish(
        'AddressBookController:contactUpdated',
        entry,
      );
    }

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
    this.messagingSystem.registerActionHandler(
      `${controllerName}:set`,
      this.set.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:delete`,
      this.delete.bind(this),
    );
  }
}

export default AddressBookController;
