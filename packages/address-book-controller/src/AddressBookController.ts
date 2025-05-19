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
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.

  externallyOwnedAccounts = 'EXTERNALLY_OWNED_ACCOUNTS',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.

  contractAccounts = 'CONTRACT_ACCOUNTS',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.

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
 */
export type AddressBookEntry = {
  address: string;
  name: string;
  chainId: Hex;
  memo: string;
  isEns: boolean;
  addressType?: AddressType;
};

/**
 * Sync metadata interface used for contacts syncing.
 * This is used by the UserStorageController and not stored in address book.
 */
type SyncMetadata = {
  deleted?: boolean;
  deletedAt?: number;
  lastUpdatedAt?: number;
};

/**
 * Address book entry with sync metadata
 */
export type AddressBookEntryWithSyncMetadata = {
  _syncMetadata?: SyncMetadata;
} & AddressBookEntry;

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
 * The action that can be performed to import contacts from sync to the {@link AddressBookController}.
 */
export type AddressBookControllerImportContactsFromSyncAction = {
  type: `${typeof controllerName}:importContactsFromSync`;
  handler: AddressBookController['importContactsFromSync'];
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
  | AddressBookControllerImportContactsFromSyncAction;

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
      Object.keys(addressBook[chainIdHex]).forEach((address) => {
        const contact = addressBook[chainIdHex][address];
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
      }
    });

    // Skip sending delete event for global contacts with chainId '*'
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
    if (String(chainId) !== '*') {
      this.messagingSystem.publish(
        'AddressBookController:contactUpdated',
        entry,
      );
    }

    return true;
  }

  /**
   * Import contacts from sync without triggering events.
   * This is used during the backup and sync process to avoid infinite event loops.
   *
   * @param contacts - Array of contact entries to import.
   * @returns Boolean indicating if the operation was successful.
   */
  importContactsFromSync(contacts: AddressBookEntry[]): boolean {
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return false;
    }

    this.update((state) => {
      contacts.forEach((contact) => {
        const { address, chainId } = contact;
        const checksumAddress = toChecksumHexAddress(address);

        // Initialize chainId entry if it doesn't exist
        if (!state.addressBook[chainId]) {
          state.addressBook[chainId] = {};
        }

        // Check for sync metadata (added by profile sync controller)
        const contactWithMetadata = contact as AddressBookEntryWithSyncMetadata;
        const syncMetadata = contactWithMetadata._syncMetadata || {};

        if (syncMetadata.deleted) {
          // If this contact is marked as deleted in sync metadata,
          // actually delete it from the address book
          if (state.addressBook[chainId][checksumAddress]) {
            delete state.addressBook[chainId][checksumAddress];
          }
        } else {
          // Update or add the contact (without sync metadata)
          state.addressBook[chainId] = {
            ...state.addressBook[chainId],
            [checksumAddress]: {
              address: checksumAddress,
              name: contact.name,
              chainId: contact.chainId,
              memo: contact.memo || '',
              isEns: contact.isEns || false,
              ...(contact.addressType
                ? { addressType: contact.addressType }
                : {}),
            },
          };
        }
      });
    });

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
      `${controllerName}:importContactsFromSync`,
      this.importContactsFromSync.bind(this),
    );
  }
}

export default AddressBookController;
