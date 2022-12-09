import { applyPatches, enablePatches, Patch, produceWithPatches } from 'immer';
import {
  BaseConfig,
  BaseController,
  BaseState,
} from '@metamask/base-controller';
import {
  isValidHexAddress,
  normalizeEnsName,
  toChecksumHexAddress,
} from '@metamask/controller-utils';
import type { PreferencesState } from '@metamask/preferences-controller';
import type {
  NetworkResponse,
  ExternalProvider,
} from './get-current-network-id';
import { getCurrentNetworkId } from './get-current-network-id';
import type { FrequentRpcChange } from './frequent-rpc-diff-utils';
import {
  buildFrequentRpcDiff,
  isFrequentRpcChange,
} from './frequent-rpc-diff-utils';
import { createModuleLogger, projectLogger } from './logging-utils';

enablePatches();
const log = createModuleLogger(projectLogger, 'AddressBookController');

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

/**
 * @type AddressBookEntry
 *
 * AddressBookEntry representation
 * @property address - Hex address of a recipient account
 * @property name - Nickname associated with this address
 * @property chainId - The id of a chain as per EIP-155, expressed as a decimal,
 * encoded as a string. Note that the extension (and sometimes the mobile app)
 * calls this the "network id".
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
 * @property addressBook - Array of contact entry objects
 */
export interface AddressBookState extends BaseState {
  addressBook: { [chainId: string]: { [address: string]: AddressBookEntry } };
}

/**
 * Address book config
 *
 * @property onNetworkStateChange - A function that is called when the state
 * of the network controller changes (such as when the network is switched).
 */
export interface AddressBookConfig extends BaseConfig {
  syncWithRpcChanges: boolean;
  onPreferencesStateChange?: (
    listener: (
      preferencesState: PreferencesState,
      previousPreferencesState: PreferencesState,
    ) => Promise<void> | void,
  ) => void;
  getProvider?: () => ExternalProvider;
}

/**
 * Controller that manages a list of recipient addresses associated with nicknames.
 */
export class AddressBookController extends BaseController<
  AddressBookConfig,
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
  constructor(
    config?: Partial<AddressBookConfig>,
    state?: Partial<AddressBookState>,
  ) {
    super(config, state);

    this.defaultConfig = {
      syncWithRpcChanges: false,
    };
    this.defaultState = { addressBook: {} };
    this.initialize();

    this.#handleChainIdChanges();
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
   * @param chainId - Chain id identifies the current chain.
   * @param address - Recipient address to delete.
   * @returns Whether the entry was deleted.
   */
  delete(chainId: string, address: string) {
    address = toChecksumHexAddress(address);
    if (
      !isValidHexAddress(address) ||
      !this.state.addressBook[chainId] ||
      !this.state.addressBook[chainId][address]
    ) {
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
   * Add or update a contact entry by address.
   *
   * @param address - Recipient address to add or update.
   * @param name - Nickname to associate with this address.
   * @param chainId - Chain id identifies the current chain.
   * @param memo - User's note about address.
   * @returns Boolean indicating if the address was successfully set.
   */
  set(address: string, name: string, chainId = '1', memo = '') {
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
    };

    const ensName = normalizeEnsName(name);
    if (ensName) {
      entry.name = ensName;
      entry.isEns = true;
    }

    this.update({
      addressBook: {
        ...this.state.addressBook,
        [chainId]: {
          ...this.state.addressBook[chainId],
          [address]: entry,
        },
      },
    });

    return true;
  }

  /**
   * Initialization step which optionally listens to changes to frequent RPC
   * chain IDs in {@link PreferencesController}) state and ensures that
   * addresses are filed under the correct chain.
   */
  #handleChainIdChanges() {
    const { getProvider } = this.config;

    if (
      this.config.syncWithRpcChanges &&
      this.config.onPreferencesStateChange !== undefined &&
      getProvider !== undefined
    ) {
      this.config.onPreferencesStateChange(
        (newPreferencesState, previousPreferencesState) => {
          return this.#handlePreferencesStateChange(
            previousPreferencesState,
            newPreferencesState,
            getProvider,
          ).catch((error) => {
            // TODO: Should this use log?
            console.error(error);
          });
        },
      );
    }
  }

  /**
   * Callback to `onPreferencesStateChange` which detects changes to frequent
   * RPC chain IDs within {@link PreferencesController} state and migrates
   * addresses from one chain to another appropriately.
   *
   * @param previousPreferencesState - The PreferencesController state prior to
   * being changed.
   * @param newPreferencesState - The PreferencesController state after being
   * changed.
   * @param getProvider - A function which returns either a legacy or
   * EIP-1193-compatible web3 provider object.
   */
  async #handlePreferencesStateChange(
    previousPreferencesState: PreferencesState,
    newPreferencesState: PreferencesState,
    getProvider: () => ExternalProvider,
  ): Promise<void> {
    const currentNetworkIdResponse = await getCurrentNetworkId(getProvider);
    const frequentRpcChanges = this.#determineFrequentRpcChanges(
      previousPreferencesState,
      newPreferencesState,
      currentNetworkIdResponse,
    );
    const patches =
      this.#determineStatePatchesForFrequentRpcChanges(frequentRpcChanges);
    const newState = applyPatches(this.state, patches);
    this.update(newState, true);
  }

  /**
   * Detects changes to frequent RPC chain IDs within {@link PreferencesController}
   * state.
   *
   * @param previousPreferencesState - The PreferencesController state prior to
   * being changed.
   * @param newPreferencesState - The PreferencesController state after being
   * changed.
   * @param currentNetworkIdResponse - Represents the result of accessing the
   * network id of the current network.
   * @returns RPC entries whose chain IDs have been changed, along with their
   * previous versions.
   */
  #determineFrequentRpcChanges(
    previousPreferencesState: PreferencesState,
    newPreferencesState: PreferencesState,
    currentNetworkIdResponse: NetworkResponse,
  ) {
    return newPreferencesState.frequentRpcList
      .map((frequentRpc) => {
        return buildFrequentRpcDiff({
          frequentRpc,
          previousFrequentRpcList: previousPreferencesState.frequentRpcList,
          currentNetworkIdResponse,
          log,
        });
      })
      .filter(isFrequentRpcChange);
  }

  /**
   * Returns a set of `immer` patches that can be applied to the state in order
   * to migrate addresses from old chains to new chains.
   *
   * @param frequentRpcChanges - A set of objects obtained in a previous step
   * which contain RPC entries whose chain IDs have changed.
   * @returns The patches.
   */
  #determineStatePatchesForFrequentRpcChanges(
    frequentRpcChanges: FrequentRpcChange[],
  ): Patch[] {
    return frequentRpcChanges.flatMap((frequentRpcChange) => {
      return [
        ...this.#copyAddressBookEntriesToNewChainId(frequentRpcChange),
        ...this.#removeAddressBookForOriginalChainId(frequentRpcChange),
      ];
    });
  }

  /**
   * Returns a set of `immer` patches which, after being applied to the state,
   * will result in addresses filed under an old chain ID to also appear under a
   * new chain ID.
   *
   * @param frequentRpcChange - Represents an RPC entry whose chain ID has
   * changed.
   * @param frequentRpcChange.originalChainId - The chain ID before being
   * changed.
   * @param frequentRpcChange.newChainId - The chain ID after being changed.
   * @returns The patches.
   */
  #copyAddressBookEntriesToNewChainId({
    originalChainId,
    newChainId,
  }: FrequentRpcChange): Patch[] {
    const [, patches] = produceWithPatches(this.state, (draft) => {
      const { addressBook } = draft;
      const existingChainAddressBook = addressBook[originalChainId];

      if (existingChainAddressBook !== undefined) {
        addressBook[newChainId] = addressBook[newChainId] ?? {};

        for (const address of Object.keys(existingChainAddressBook)) {
          addressBook[newChainId][address] = {
            ...addressBook[originalChainId][address],
            chainId: newChainId.toString(),
          };
        }
      }
    });

    return patches;
  }

  /**
   * Returns a set of `immer` patches which, after being applied to the state,
   * may result in addresses filed under an old chain ID to be removed (depending
   * on the flag given).
   *
   * @param frequentRpcChange - Represents an RPC entry whose chain ID has
   * changed.
   * @param frequentRpcChange.originalChainId - The chain ID before being
   * changed.
   * @param frequentRpcChange.shouldRemoveAddressBookForOriginalChainId - A flag
   * that governs whether this function should run.
   * @returns The patches (if any).
   */
  #removeAddressBookForOriginalChainId({
    originalChainId,
    shouldRemoveAddressBookForOriginalChainId,
  }: FrequentRpcChange): Patch[] {
    if (shouldRemoveAddressBookForOriginalChainId) {
      const [, patches] = produceWithPatches(this.state, (draft) => {
        delete draft.addressBook[originalChainId];
      });

      return patches;
    }
    return [];
  }
}

export default AddressBookController;
