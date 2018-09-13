import 'isomorphic-fetch';
import BaseController, { BaseConfig, BaseState } from './BaseController';
import PreferencesController from './PreferencesController';
import { Token } from './TokenRatesController';
import { NetworkController } from './NetworkController';

const contractMap = require('eth-contract-metadata');
const { toChecksumAddress } = require('ethereumjs-util');

/**
 * @type Collectible
 *
 * Collectible representation
 *
 * @property address - Hex address of a ERC721 contract
 * @property tokenId - The NFT identifier
 * @property name - Name associated with this tokenId and contract address
 * @property image - URI of custom NFT image associated with this tokenId
 */
export interface Collectible {
	address: string;
	tokenId: number;
	name: string;
	image: string;
}

/**
 * @type CollectibleCustomInformation
 *
 * Collectible custom information
 *
 * @property name - Collectible custom name
 * @property image - Image custom image URI
 */
export interface CollectibleCustomInformation {
	name: string;
	image: string;
}

/**
 * @type AssetsConfig
 *
 * Assets controller configuration
 *
 * @property networkType - Network ID as per net_version
 * @property selectedAddress - Vault selected address
 */
export interface AssetsConfig extends BaseConfig {
	networkType: string;
	selectedAddress: string;
}

/**
 * @type AssetsState
 *
 * Assets controller state
 *
 * @property collectibles - List of collectibles associated with the active vault
 * @property tokens - List of tokens associated with the active vault
 */
export interface AssetsState extends BaseState {
	allTokens: { [key: string]: { [key: string]: Token[] } };
	allCollectibles: { [key: string]: { [key: string]: Collectible[] } };
	collectibles: Collectible[];
	tokens: Token[];
}

/**
 * Controller that stores assets and exposes convenience methods
 */
export class AssetsController extends BaseController<AssetsConfig, AssetsState> {
	private getCollectibleApi(api: string, tokenId: number): string {
		return `${api}${tokenId}`;
	}

	/**
	 * Name of this controller used during composition
	 */
	name = 'AssetsController';

	/**
	 * List of required sibling controllers this controller needs to function
	 */
	requiredControllers = ['NetworkController', 'PreferencesController'];

	/**
	 * Creates a AssetsController instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<BaseConfig>, state?: Partial<AssetsState>) {
		super(config, state);
		this.defaultConfig = {
			networkType: '',
			selectedAddress: ''
		};
		this.defaultState = {
			allCollectibles: {},
			allTokens: {},
			collectibles: [],
			tokens: []
		};
		this.initialize();
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
		const tokens = this.state.tokens;
		const allTokens = this.state.allTokens;
		const selectedAddress = this.config.selectedAddress;
		const networkType = this.config.networkType;
		const newEntry: Token = { address, symbol, decimals };
		const previousEntry = tokens.find((token) => token.address === address);
		if (previousEntry) {
			const previousIndex = tokens.indexOf(previousEntry);
			tokens[previousIndex] = newEntry;
		} else {
			tokens.push(newEntry);
		}
		const addressTokens = allTokens[selectedAddress];
		const newAddressTokens = { ...addressTokens, ...{ [networkType]: tokens } };
		const newAllTokens = { ...allTokens, ...{ [selectedAddress]: newAddressTokens } };
		const newTokens = [...tokens];
		this.update({ allTokens: newAllTokens, tokens: newTokens });
		return newTokens;
	}

	/**
	 * Adds a collectible to the stored collectible list
	 *
	 * @param address - Hex address of the collectible contract
	 * @param tokenId - The NFT identifier
	 * @returns - Current collectible list
	 */
	async addCollectible(address: string, tokenId: number): Promise<Collectible[]> {
		address = toChecksumAddress(address);
		const collectibles = this.state.collectibles;
		const allCollectibles = this.state.allCollectibles;
		const selectedAddress = this.config.selectedAddress;
		const networkType = this.config.networkType;
		const existingEntry = collectibles.find(
			(collectible) => collectible.address === address && collectible.tokenId === tokenId
		);
		if (existingEntry) {
			return collectibles;
		}
		const { name, image } = await this.requestNFTCustomInformation(address, tokenId);
		const newEntry: Collectible = { address, tokenId, name, image };
		const newCollectibles = [...collectibles, newEntry];
		const addressCollectibles = allCollectibles[selectedAddress];
		const newAddressCollectibles = { ...addressCollectibles, ...{ [networkType]: newCollectibles } };
		const newAllCollectibles = { ...allCollectibles, ...{ [selectedAddress]: newAddressCollectibles } };
		this.update({ allCollectibles: newAllCollectibles, collectibles: newCollectibles });
		return newCollectibles;
	}

	/**
	 * Removes a token from the stored token list
	 *
	 * @param address - Hex address of the token contract
	 */
	removeToken(address: string) {
		address = toChecksumAddress(address);
		const oldTokens = this.state.tokens;
		const allTokens = this.state.allTokens;
		const selectedAddress = this.config.selectedAddress;
		const networkType = this.config.networkType;
		const newTokens = oldTokens.filter((token) => token.address !== address);
		const addressTokens = allTokens[selectedAddress];
		const newAddressTokens = { ...addressTokens, ...{ [networkType]: newTokens } };
		const newAllTokens = { ...allTokens, ...{ [selectedAddress]: newAddressTokens } };
		this.update({ allTokens: newAllTokens, tokens: newTokens });
	}

	/**
	 * Removes a collectible from the stored token list
	 *
	 * @param address - Hex address of the collectible contract
	 * @param tokenId - Token identifier of the collectible
	 */
	removeCollectible(address: string, tokenId: number) {
		address = toChecksumAddress(address);
		const oldCollectibles = this.state.collectibles;
		const allCollectibles = this.state.allCollectibles;
		const selectedAddress = this.config.selectedAddress;
		const networkType = this.config.networkType;
		const newCollectibles = oldCollectibles.filter(
			(collectible) => !(collectible.address === address && collectible.tokenId === tokenId)
		);
		const addressCollectibles = allCollectibles[selectedAddress];
		const newAddressCollectibles = { ...addressCollectibles, ...{ [networkType]: newCollectibles } };
		const newAllCollectibles = { ...allCollectibles, ...{ [selectedAddress]: newAddressCollectibles } };
		this.update({ allCollectibles: newAllCollectibles, collectibles: newCollectibles });
	}

	/**
	 * Request NFT custom information of a collectible
	 *
	 * @param address - Hex address of the collectible contract
	 * @param tokenId - The NFT identifier
	 * @returns - Current collectible name and image
	 */
	async requestNFTCustomInformation(address: string, tokenId: number): Promise<CollectibleCustomInformation> {
		if (address in contractMap && contractMap[address].erc721) {
			const contract = contractMap[address];
			const api = contract.api;
			const { name, image } = await this.fetchCollectibleBasicInformation(api, tokenId);
			return { name, image };
		} else {
			return { name: '', image: '' };
		}
	}

	/**
	 * Fetch NFT basic information, name and image url
	 *
	 * @param api - API url to fetch custom collectible information
	 * @param tokenId - The NFT identifier
	 * @returns - Current collectible name and image
	 */
	async fetchCollectibleBasicInformation(api: string, tokenId: number): Promise<CollectibleCustomInformation> {
		try {
			const response = await fetch(this.getCollectibleApi(api, tokenId));
			const json = await response.json();
			return { image: json.image_url, name: json.name };
		} catch (error) {
			/* istanbul ignore next */
			return { image: '', name: '' };
		}
	}

	/**
	 * Extension point called if and when this controller is composed
	 * with other controllers using a ComposableController
	 */
	onComposed() {
		super.onComposed();
		const preferences = this.context.PreferencesController as PreferencesController;
		const network = this.context.NetworkController as NetworkController;
		preferences.subscribe(({ selectedAddress }) => {
			const allTokens = this.state.allTokens;
			const allCollectibles = this.state.allCollectibles;
			const networkType = this.config.networkType;
			this.configure({ selectedAddress });
			this.update({
				collectibles: (allCollectibles[selectedAddress] && allCollectibles[selectedAddress][networkType]) || [],
				tokens: (allTokens[selectedAddress] && allTokens[selectedAddress][networkType]) || []
			});
		});
		network.subscribe(({ provider }) => {
			const allTokens = this.state.allTokens;
			const allCollectibles = this.state.allCollectibles;
			const selectedAddress = this.config.selectedAddress;
			const networkType = provider.type;
			this.configure({ networkType });
			this.update({
				collectibles: (allCollectibles[selectedAddress] && allCollectibles[selectedAddress][networkType]) || [],
				tokens: (allTokens[selectedAddress] && allTokens[selectedAddress][networkType]) || []
			});
		});
	}
}

export default AssetsController;
