import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
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
 * The actions that can be performed using the {@link AddressBookController}.
 */
export type AddressBookControllerActions = AddressBookControllerGetStateAction;

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
export type AddressBookControllerEvents = AddressBookControllerStateChangeEvent;

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
export type AddressBookControllerMessenger = RestrictedControllerMessenger<
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

    this.update((state) => {
      delete state.addressBook[chainId][address];
      if (Object.keys(state.addressBook[chainId]).length === 0) {
        delete state.addressBook[chainId];
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

    return true;
  }
}

export default AddressBookController;
