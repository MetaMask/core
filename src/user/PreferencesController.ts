import { toChecksumAddress } from 'ethereumjs-util';
import BaseController from '../base-controller-v2';
import { call } from '../controller-messaging-system';
import { ContactEntry } from './AddressBookController';

/**
 * Custom RPC network information
 *
 * @param rpcUrl - RPC target URL
 * @param chainId? - Network ID as per EIP-155
 * @param ticker? - Currency ticker
 * @param nickname? - Personalized network name
 * @param rpcPrefs? - Personalized preferences
 */
export interface FrequentRpc {
  rpcUrl: string;
  chainId?: number;
  nickname?: string;
  ticker?: string;
  rpcPrefs?: RpcPreferences;
}

/**
 * Custom RPC network preferences
 *
 * @param blockExplorerUrl - Block explorer URL
 */
export interface RpcPreferences {
  blockExplorerUrl: string;
}

/**
 * @type PreferencesState
 *
 * Preferences controller state
 *
 * @property featureFlags - Map of specific features to enable or disable
 * @property frequentRpcList - A list of custom RPCs to provide the user
 * @property identities - Map of addresses to ContactEntry objects
 * @property lostIdentities - Map of lost addresses to ContactEntry objects
 * @property selectedAddress - Current coinbase account
 */
export interface PreferencesState {
  featureFlags: { [feature: string]: boolean };
  frequentRpcList: FrequentRpc[];
  ipfsGateway: string;
  identities: { [address: string]: ContactEntry };
  lostIdentities: { [address: string]: ContactEntry };
  selectedAddress: string;
}

const schema = {
  featureFlags: { persist: true, anonymous: true },
  frequentRpcList: { persist: true, anonymous: true },
  ipfsGateway: { persist: true, anonymous: true },
  identities: { persist: true, anonymous: true },
  lostIdentities: { persist: true, anonymous: true },
  selectedAddress: { persist: true, anonymous: true },
};

const CONTROLLER_NAME = 'PreferencesController';

/**
 * Controller action constants
 */
export const GET_PREFERENCES_STATE = `${CONTROLLER_NAME}.getState`;
export const SET_SELECTED_ADDRESS = `${CONTROLLER_NAME}.setSelectedAddress`;
export const UPDATE_IDENTITIES = `${CONTROLLER_NAME}.updateIdentities`;
export const REMOVE_IDENTITY = `${CONTROLLER_NAME}.removeIdentity`;
export const SYNC_IDENTITIES = `${CONTROLLER_NAME}.syncIdentities`;

/**
 * Controller event constants
 */
export const PREFERENCES_STATE_CHANGED = `${CONTROLLER_NAME}.state-changed`;

/**
 * Controller actions
 */
export function getPreferencesState(): PreferencesState {
  return call(GET_PREFERENCES_STATE);
}

export function setSelectedAddress(selectedAddress: string): void {
  return call(SET_SELECTED_ADDRESS, selectedAddress);
}

export function updateIdentities(addresses: string[]): void {
  return call(UPDATE_IDENTITIES, addresses);
}

export function removeIdentity(address: string): void {
  return call(REMOVE_IDENTITY, address);
}

export function syncIdentities(addresses: string[]): void {
  return call(SYNC_IDENTITIES, addresses);
}

/**
 * Controller that stores shared settings and exposes convenience methods
 */
export class PreferencesController extends BaseController<PreferencesState> {
  private static defaultState = {
    featureFlags: {},
    frequentRpcList: [],
    identities: {},
    ipfsGateway: 'https://ipfs.io/ipfs/',
    lostIdentities: {},
    selectedAddress: '',
  };

  /**
   * Creates a PreferencesController instance
   *
   * @param config - Initial options used to configure this controller
   * @param state - Initial state to set on this controller
   */
  constructor(state?: Partial<PreferencesState>) {
    super({ ...PreferencesController.defaultState, ...state }, PREFERENCES_STATE_CHANGED, schema);
    this.registerActions({
      [GET_PREFERENCES_STATE]: () => this.state,
      [SET_SELECTED_ADDRESS]: this.setSelectedAddress,
      [UPDATE_IDENTITIES]: this.updateIdentities,
      [REMOVE_IDENTITY]: this.removeIdentity,
      [SYNC_IDENTITIES]: this.syncIdentities,
    });
  }

  /**
   * Adds identities to state
   *
   * @param addresses - List of addresses to use to generate new identities
   */
  addIdentities(addresses: string[]) {
    this.update((state) => {
      addresses.forEach((address) => {
        address = toChecksumAddress(address);
        if (state.identities[address]) {
          return;
        }
        const identityCount = Object.keys(state.identities).length;
        state.identities[address] = { name: `Account ${identityCount + 1}`, address };
      });
    });
  }

  /**
   * Removes an identity from state
   *
   * @param address - Address of the identity to remove
   */
  removeIdentity(address: string) {
    address = toChecksumAddress(address);
    const { identities } = this.state;
    if (!identities[address]) {
      return;
    }
    this.update((state) => {
      delete state.identities[address];
      if (address === state.selectedAddress) {
        state.selectedAddress = Object.keys(state.identities)[0];
      }
    });
  }

  /**
   * Associates a new label with an identity
   *
   * @param address - Address of the identity to associate
   * @param label - New label to assign
   */
  setAccountLabel(address: string, label: string) {
    address = toChecksumAddress(address);
    this.update((state) => {
      state.identities[address] = state.identities[address] || {};
      state.identities[address].name = label;
    });
  }

  /**
   * Enable or disable a specific feature flag
   *
   * @param feature - Feature to toggle
   * @param activated - Value to assign
   */
  setFeatureFlag(feature: string, activated: boolean) {
    const oldFeatureFlags = this.state.featureFlags;
    const featureFlags = { ...oldFeatureFlags, ...{ [feature]: activated } };
    this.update((state) => {
      state.featureFlags = featureFlags;
    });
  }

  /**
   * Synchronizes the current identity list with new identities
   *
   * @param addresses - List of addresses corresponding to identities to sync
   * @returns - Newly-selected address after syncing
   */
  syncIdentities(addresses: string[]) {
    addresses = addresses.map((address: string) => toChecksumAddress(address));
    this.update((state) => {
      const newlyLost: { [address: string]: ContactEntry } = {};

      for (const identity in state.identities) {
        if (addresses.indexOf(identity) === -1) {
          newlyLost[identity] = state.identities[identity];
          delete state.identities[identity];
        }
      }

      if (Object.keys(newlyLost).length > 0) {
        for (const key in newlyLost) {
          state.lostIdentities[key] = newlyLost[key];
        }
      }

      this.addIdentities(addresses);

      if (addresses.indexOf(this.state.selectedAddress) === -1) {
        state.selectedAddress = addresses[0];
      }
    });

    return this.state.selectedAddress;
  }

  /**
   * Generates and stores a new list of stored identities based on address
   *
   * @param addresses - List of addresses to use as a basis for each identity
   */
  updateIdentities(addresses: string[]) {
    addresses = addresses.map((address: string) => toChecksumAddress(address));
    const oldIdentities = this.state.identities;
    const identities = addresses.reduce((ids: { [address: string]: ContactEntry }, address, index) => {
      ids[address] = oldIdentities[address] || {
        address,
        name: `Account ${index + 1}`,
      };
      return ids;
    }, {});
    this.update((state) => {
      state.identities = identities;
    });
  }

  /**
   * Adds custom RPC URL to state
   *
   * @param url - Custom RPC URL
   * @param chainId? - Network ID as per EIP-155
   * @param ticker? - Currency ticker
   * @param nickname? - Personalized network name
   * @param rpcPrefs? - Personalized preferences
   *
   */
  addToFrequentRpcList(url: string, chainId?: number, ticker?: string, nickname?: string, rpcPrefs?: RpcPreferences) {
    this.update((state) => {
      const index = state.frequentRpcList.findIndex(({ rpcUrl }) => {
        return rpcUrl === url;
      });
      if (index !== -1) {
        state.frequentRpcList.splice(index, 1);
      }
      const newFrequestRpc: FrequentRpc = { rpcUrl: url, chainId, ticker, nickname, rpcPrefs };
      state.frequentRpcList.push(newFrequestRpc);
    });
  }

  /**
   * Removes custom RPC URL from state
   *
   * @param url - Custom RPC URL
   */
  removeFromFrequentRpcList(url: string) {
    this.update((state) => {
      const index = state.frequentRpcList.findIndex(({ rpcUrl }) => {
        return rpcUrl === url;
      });
      if (index !== -1) {
        state.frequentRpcList.splice(index, 1);
      }
    });
  }

  /**
   * Sets selected address
   *
   * @param selectedAddress - Ethereum address
   */
  setSelectedAddress(selectedAddress: string) {
    this.update((state) => {
      state.selectedAddress = toChecksumAddress(selectedAddress);
    });
  }

  /**
   * Sets new IPFS gateway
   *
   * @param ipfsGateway - IPFS gateway string
   */
  setIpfsGateway(ipfsGateway: string) {
    this.update((state) => {
      state.ipfsGateway = ipfsGateway;
    });
  }
}

export default PreferencesController;
