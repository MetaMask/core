import BaseController, { BaseConfig, BaseState } from './BaseController';
import { ContactEntry } from './AddressBookController';

const { toChecksumAddress } = require('ethereumjs-util');

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
export interface PreferencesState extends BaseState {
	featureFlags: { [feature: string]: boolean };
	frequentRpcList: string[];
	identities: { [address: string]: ContactEntry };
	lostIdentities: { [address: string]: ContactEntry };
	selectedAddress: string;
}

/**
 * Controller that stores shared settings and exposes convenience methods
 */
export class PreferencesController extends BaseController<BaseConfig, PreferencesState> {
	/**
	 * Name of this controller used during composition
	 */
	name = 'PreferencesController';

	/**
	 * Creates a PreferencesController instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<BaseConfig>, state?: Partial<PreferencesState>) {
		super(config, state);
		this.defaultState = {
			featureFlags: {},
			frequentRpcList: [],
			identities: {},
			lostIdentities: {},
			selectedAddress: ''
		};
		this.initialize();
	}

	/**
	 * Adds identities to state
	 *
	 * @param addresses - List of addresses to use to generate new identities
	 */
	addIdentities(addresses: string[]) {
		const { identities } = this.state;
		addresses.forEach((address) => {
			address = toChecksumAddress(address);
			if (identities[address]) {
				return;
			}
			const identityCount = Object.keys(identities).length;
			identities[address] = { name: `Account ${identityCount + 1}`, address };
		});
		this.update({ identities: { ...identities } });
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
		delete identities[address];
		this.update({ identities: { ...identities } });
		if (address === this.state.selectedAddress) {
			this.update({ selectedAddress: Object.keys(identities)[0] });
		}
	}

	/**
	 * Associates a new label with an identity
	 *
	 * @param address - Address of the identity to associate
	 * @param label - New label to assign
	 */
	setAccountLabel(address: string, label: string) {
		address = toChecksumAddress(address);
		const identities = this.state.identities;
		identities[address] = identities[address] || {};
		identities[address].name = label;
		this.update({ identities: { ...identities } });
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
		this.update({ featureFlags });
	}

	/**
	 * Synchronizes the current identity list with new identities
	 *
	 * @param addresses - List of addresses corresponding to identities to sync
	 * @returns - Newly-selected address after syncing
	 */
	syncIdentities(addresses: string[]) {
		addresses = addresses.map((address: string) => toChecksumAddress(address));
		const { identities, lostIdentities } = this.state;
		const newlyLost: { [address: string]: ContactEntry } = {};

		for (const identity in identities) {
			if (addresses.indexOf(identity) === -1) {
				newlyLost[identity] = identities[identity];
				delete identities[identity];
			}
		}

		if (Object.keys(newlyLost).length > 0) {
			for (const key in newlyLost) {
				lostIdentities[key] = newlyLost[key];
			}
		}

		this.update({ identities: { ...identities }, lostIdentities: { ...lostIdentities } });
		this.addIdentities(addresses);

		if (addresses.indexOf(this.state.selectedAddress) === -1) {
			this.update({ selectedAddress: addresses[0] });
		}

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
			ids[address] = {
				address,
				name: `Account ${index + 1}`,
				...(oldIdentities[address] || {})
			};
			return ids;
		}, {});
		this.update({ identities });
	}

	/**
	 * Adds custom RPC URL to state
	 *
	 * @param url - Custom RPC URL
	 */
	addToFrequentRpcList(url: string) {
		if (url === 'http://localhost:8545') {
			return;
		}
		const newFrequentRpcList = this.state.frequentRpcList;
		const index = newFrequentRpcList.findIndex((element) => {
			return element === url;
		});
		if (index !== -1) {
			newFrequentRpcList.splice(index, 1);
		}
		newFrequentRpcList.push(url);
		this.update({ frequentRpcList: newFrequentRpcList });
	}

	/**
	 * Removes custom RPC URL from state
	 *
	 * @param url - Custom RPC URL
	 */
	removeFromFrequentRpcList(url: string) {
		if (url === 'http://localhost:8545') {
			return;
		}
		const newFrequentRpcList = this.state.frequentRpcList;
		const index = newFrequentRpcList.findIndex((element) => {
			return element === url;
		});
		if (index !== -1) {
			newFrequentRpcList.splice(index, 1);
		}
		this.update({ frequentRpcList: newFrequentRpcList });
	}
}

export default PreferencesController;
