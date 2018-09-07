import BaseController, { BaseConfig, BaseState } from './BaseController';
import { ContactEntry } from './AddressBookController';
import { Token } from './TokenRatesController';

const { toChecksumAddress } = require('ethereumjs-util');

/**
 * @type PreferencesState
 *
 * Preferences controller state
 *
 * @property featureFlags - Map of specific features to enable or disable
 * @property identities - Map of addresses to ContactEntry objects
 * @property lostIdentities - Map of lost addresses to ContactEntry objects
 * @property selectedAddress - Current coinbase account
 * @property tokens - List of tokens associated with the active vault
 * @property collectibles - List of collectibles associated with the active vault
 */
export interface PreferencesState extends BaseState {
	collectibles: Collectible[];
	featureFlags: { [feature: string]: boolean };
	identities: { [address: string]: ContactEntry };
	lostIdentities: { [address: string]: ContactEntry };
	selectedAddress: string;
	tokens: Token[];
}

/**
 * @type Collectible
 *
 * Collectible representation
 *
 * @property address - Hex address of a ERC721 contract
 * @property tokenId - The NFT identifier
 * @property name - Name associated with this tokenId and contract address
 * @property image - Uri of custom NFT image associated with this tokenId
 */
export interface Collectible {
	address: string;
	tokenId: number;
	name: string;
	image: string;
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
			collectibles: [],
			featureFlags: {},
			identities: {},
			lostIdentities: {},
			selectedAddress: '',
			tokens: []
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
	 * Adds a token to the stored token list
	 *
	 * @param address - Hex address of the token contract
	 * @param symbol - Symbol of the token
	 * @param decimals - Number of decimals the token uses
	 * @returns - Current token list
	 */
	addToken(address: string, symbol: string, decimals: number) {
		address = toChecksumAddress(address);
		const newEntry: Token = { address, symbol, decimals };
		const tokens = this.state.tokens;
		const previousEntry = tokens.find((token) => token.address === address);

		if (previousEntry) {
			const previousIndex = tokens.indexOf(previousEntry);
			tokens[previousIndex] = newEntry;
		} else {
			tokens.push(newEntry);
		}

		const newTokens = [...tokens];
		this.update({ tokens: newTokens });
		return newTokens;
	}

	/**
	 * Adds a collectible to the stored collectible list
	 *
	 * @param address - Hex address of the collectible contract
	 * @param tokenId - The NFT identifier
	 * @returns - Current collectible list
	 */
	addCollectible(address: string, tokenId: number) {
		address = toChecksumAddress(address);
		const { name, image } = this.requestNFTCustomInformation(address, tokenId);
		const newEntry: Collectible = { address, tokenId, name, image };
		const collectibles = this.state.collectibles;

		const newCollectibles = [...collectibles, newEntry];
		this.update({ collectibles: newCollectibles });
		return newCollectibles;
	}

	/**
	 * Request NFT custom information of a collectible
	 *
	 * @param address - Hex address of the collectible contract
	 * @param tokenId - The NFT identifier
	 * @returns - Current collectible list
	 */
	requestNFTCustomInformation(address: string, tokenId: number) {
		// Request custom information, `tokenMetadata` or `tokenURI`
		const randomCK =
			'https://storage.googleapis.com/ck-kitty-image/0x06012c8cf97bead5deae237070f9587f8e7a266d/423007.svg';
		return { name: 'Some name', image: randomCK };
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
	 * Removes a token from the stored token list
	 *
	 * @param address - Hex address of the token contract
	 */
	removeToken(address: string) {
		address = toChecksumAddress(address);
		const oldTokens = this.state.tokens;
		const tokens = oldTokens.filter((token) => token.address !== address);
		this.update({ tokens });
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
}

export default PreferencesController;
