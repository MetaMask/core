import 'isomorphic-fetch';
import BaseController, { BaseConfig, BaseState } from './BaseController';
import PreferencesController from './PreferencesController';
import NetworkController, { NetworkType } from './NetworkController';
import { Token } from './TokenRatesController';
import { AssetsContractController } from './AssetsContractController';
import { safelyExecute, handleFetch } from './util';

const { toChecksumAddress } = require('ethereumjs-util');
const Mutex = require('await-semaphore').Mutex;

/**
 * @type Collectible
 *
 * Collectible representation
 *
 * @property address - Hex address of a ERC721 contract
 * @property description - The collectible description
 * @property image - URI of custom collectible image associated with this tokenId
 * @property name - Name associated with this tokenId and contract address
 * @property tokenId - The collectible identifier
 */
export interface Collectible {
	address: string;
	description?: string;
	image?: string;
	name?: string;
	tokenId: number;
}

/**
 * @type CollectibleContract
 *
 * Collectible contract information representation
 *
 * @property name - Contract name
 * @property logo - Contract logo
 * @property address - Contract address
 * @property symbol - Contract symbol
 * @property description - Contract description
 * @property totalSupply - Contract total supply
 */
export interface CollectibleContract {
	name?: string;
	logo?: string;
	address: string;
	symbol?: string;
	description?: string;
	totalSupply?: string;
}

/**
 * @type ApiCollectibleContractResponse
 *
 * Collectible contract object coming from OpenSea api
 *
 * @property description - The collectible identifier
 * @property image_url - URI of collectible image associated with this collectible
 * @property name - The collectible name
 * @property description - The collectible description
 * @property total_supply - Contract total supply
 */
export interface ApiCollectibleContractResponse {
	description?: string;
	image_url?: string;
	name?: string;
	symbol?: string;
	total_supply?: string;
}

/**
 * @type CollectibleInformation
 *
 * Collectible custom information
 *
 * @property description - The collectible description
 * @property name - Collectible custom name
 * @property image - Image custom image URI
 */
export interface CollectibleInformation {
	description?: string;
	image?: string;
	name?: string;
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
	networkType: NetworkType;
	selectedAddress: string;
}

/**
 * @type AssetsState
 *
 * Assets controller state
 *
 * @property allTokens - Object containing tokens per account and network
 * @property allCollectibleContracts - Object containing collectibles contract information
 * @property allCollectibles - Object containing collectibles per account and network
 * @property collectibleContracts - List of collectibles contracts associated with the active vault
 * @property collectibles - List of collectibles associated with the active vault
 * @property tokens - List of tokens associated with the active vault
 */
export interface AssetsState extends BaseState {
	allTokens: { [key: string]: { [key: string]: Token[] } };
	allCollectibleContracts: { [key: string]: { [key: string]: CollectibleContract[] } };
	allCollectibles: { [key: string]: { [key: string]: Collectible[] } };
	collectibleContracts: CollectibleContract[];
	collectibles: Collectible[];
	tokens: Token[];
}

/**
 * Controller that stores assets and exposes convenience methods
 */
export class AssetsController extends BaseController<AssetsConfig, AssetsState> {
	private mutex = new Mutex();

	private getCollectibleApi(contractAddress: string, tokenId: number) {
		return `https://api.opensea.io/api/v1/asset/${contractAddress}/${tokenId}`;
	}

	private getCollectibleContractInformationApi(contractAddress: string) {
		return `https://api.opensea.io/api/v1/asset_contract/${contractAddress}`;
	}

	/**
	 * Get collectible tokenURI API following ERC721
	 *
	 * @param contractAddress - ERC721 asset contract address
	 * @param tokenId - ERC721 asset identifier
	 * @returns - Collectible tokenURI
	 */
	private async getCollectibleTokenURI(contractAddress: string, tokenId: number): Promise<string> {
		const assetsContract = this.context.AssetsContractController as AssetsContractController;
		const supportsMetadata = await assetsContract.contractSupportsMetadataInterface(contractAddress);
		/* istanbul ignore if */
		if (!supportsMetadata) {
			return '';
		}
		const tokenURI = await assetsContract.getCollectibleTokenURI(contractAddress, tokenId);
		return tokenURI;
	}

	/**
	 * Request individual collectible information from OpenSea api
	 *
	 * @param contractAddress - Hex address of the collectible contract
	 * @param tokenId - The collectible identifier
	 * @returns - Promise resolving to the current collectible name and image
	 */
	private async getCollectibleInformationFromApi(
		contractAddress: string,
		tokenId: number
	): Promise<CollectibleInformation> {
		const tokenURI = this.getCollectibleApi(contractAddress, tokenId);
		const { name, description, image_preview_url } = await handleFetch(tokenURI);
		return { image: image_preview_url, name, description };
	}

	/**
	 * Request individual collectible information from contracts that follows Metadata Interface
	 *
	 * @param contractAddress - Hex address of the collectible contract
	 * @param tokenId - The collectible identifier
	 * @returns - Promise resolving to the current collectible name and image
	 */
	private async getCollectibleInformationFromTokenURI(
		contractAddress: string,
		tokenId: number
	): Promise<CollectibleInformation> {
		const tokenURI = await this.getCollectibleTokenURI(contractAddress, tokenId);
		const object = await handleFetch(tokenURI);
		const image = object.hasOwnProperty('image') ? 'image' : /* istanbul ignore next */ 'image_url';
		return { image: object[image], name: object.name };
	}

	/**
	 * Request individual collectible information (name, image url and description)
	 *
	 * @param contractAddress - Hex address of the collectible contract
	 * @param tokenId - The collectible identifier
	 * @returns - Promise resolving to the current collectible name and image
	 */
	private async getCollectibleInformation(contractAddress: string, tokenId: number): Promise<CollectibleInformation> {
		let information;
		// First try with OpenSea
		information = await safelyExecute(async () => {
			return await this.getCollectibleInformationFromApi(contractAddress, tokenId);
		});
		if (information) {
			return information;
		}
		// Then following ERC721 standard
		information = await safelyExecute(async () => {
			return await this.getCollectibleInformationFromTokenURI(contractAddress, tokenId);
		});
		/* istanbul ignore next */
		if (information) {
			return information;
		}
		/* istanbul ignore next */
		return {};
	}

	/**
	 * Request collectible contract information from OpenSea api
	 *
	 * @param contractAddress - Hex address of the collectible contract
	 * @returns - Promise resolving to the current collectible name and image
	 */
	private async getCollectibleContractInformationFromApi(
		contractAddress: string
	): Promise<ApiCollectibleContractResponse> {
		const api = this.getCollectibleContractInformationApi(contractAddress);
		const collectibleContractObject = await handleFetch(api);
		const { name, symbol, image_url, description, total_supply } = collectibleContractObject;
		return { name, symbol, image_url, description, total_supply };
	}

	/**
	 * Request collectible contract information from the contract itself
	 *
	 * @param contractAddress - Hex address of the collectible contract
	 * @returns - Promise resolving to the current collectible name and image
	 */
	private async getCollectibleContractInformationFromContract(
		contractAddress: string
	): Promise<ApiCollectibleContractResponse> {
		const assetsContractController = this.context.AssetsContractController as AssetsContractController;
		const name = await assetsContractController.getAssetName(contractAddress);
		const symbol = await assetsContractController.getAssetSymbol(contractAddress);
		return { name, symbol };
	}

	/**
	 * Request collectible contract information from OpenSea api
	 *
	 * @param contractAddress - Hex address of the collectible contract
	 * @returns - Promise resolving to the collectible contract name, image and description
	 */
	private async getCollectibleContractInformation(contractAddress: string): Promise<ApiCollectibleContractResponse> {
		let information;
		// First try with OpenSea
		information = await safelyExecute(async () => {
			return await this.getCollectibleContractInformationFromApi(contractAddress);
		});
		if (information) {
			return information;
		}
		// Then following ERC721 standard
		information = await safelyExecute(async () => {
			return await this.getCollectibleContractInformationFromContract(contractAddress);
		});
		if (information) {
			return information;
		}
		/* istanbul ignore next */
		return {};
	}

	/**
	 * Adds an individual collectible to the stored collectible list
	 *
	 * @param address - Hex address of the collectible contract
	 * @param tokenId - The collectible identifier
	 * @param opts - Collectible optional information (name, image and description)
	 * @param detection? - Whether the collectible is manually added or autodetected
	 * @returns - Promise resolving to the current collectible list
	 */
	private async addIndividualCollectible(
		address: string,
		tokenId: number,
		opts?: CollectibleInformation,
		detection?: boolean
	): Promise<Collectible[]> {
		const releaseLock = await this.mutex.acquire();
		address = toChecksumAddress(address);
		const { allCollectibles, collectibles } = this.state;
		const { networkType, selectedAddress } = this.config;
		const existingEntry = collectibles.find(
			(collectible) => collectible.address === address && collectible.tokenId === tokenId
		);
		if (existingEntry) {
			releaseLock();
			return collectibles;
		}
		const { name, image, description } = opts ? opts : await this.getCollectibleInformation(address, tokenId);
		// if there is no collectible name or image when auto detecting assets, do not add it and wait for next auto detection
		if (detection && (!name || !image)) {
			releaseLock();
			return collectibles;
		}
		const newEntry: Collectible = { address, tokenId, name, image, description };
		const newCollectibles = [...collectibles, newEntry];
		const addressCollectibles = allCollectibles[selectedAddress];
		const newAddressCollectibles = { ...addressCollectibles, ...{ [networkType]: newCollectibles } };
		const newAllCollectibles = { ...allCollectibles, ...{ [selectedAddress]: newAddressCollectibles } };
		this.update({ allCollectibles: newAllCollectibles, collectibles: newCollectibles });
		releaseLock();
		return newCollectibles;
	}

	/**
	 * Adds a collectible contract to the stored collectible contracts list
	 *
	 * @param address - Hex address of the collectible contract
	 * @param detection? - Whether the collectible is manually added or auto-detected
	 * @returns - Promise resolving to the current collectible contracts list
	 */
	private async addCollectibleContract(address: string, detection?: boolean): Promise<CollectibleContract[]> {
		const releaseLock = await this.mutex.acquire();
		address = toChecksumAddress(address);
		const { allCollectibleContracts, collectibleContracts } = this.state;
		const { networkType, selectedAddress } = this.config;
		const existingEntry = collectibleContracts.find(
			(collectibleContract) => collectibleContract.address === address
		);
		if (existingEntry) {
			releaseLock();
			return collectibleContracts;
		}
		const contractInformation = await this.getCollectibleContractInformation(address);
		const { name, symbol, image_url, description, total_supply } = contractInformation;
		// If being auto-detected opensea information is expected
		// Oherwise at least name and symbol from contract is needed
		if ((detection && !image_url) || Object.keys(contractInformation).length === 0) {
			releaseLock();
			return collectibleContracts;
		}
		const newEntry: CollectibleContract = {
			address,
			description,
			logo: image_url,
			name,
			symbol,
			totalSupply: total_supply
		};
		const newCollectibleContracts = [...collectibleContracts, newEntry];
		const addressCollectibleContracts = allCollectibleContracts[selectedAddress];
		const newAddressCollectibleContracts = {
			...addressCollectibleContracts,
			...{ [networkType]: newCollectibleContracts }
		};
		const newAllCollectibleContracts = {
			...allCollectibleContracts,
			...{ [selectedAddress]: newAddressCollectibleContracts }
		};
		this.update({
			allCollectibleContracts: newAllCollectibleContracts,
			collectibleContracts: newCollectibleContracts
		});
		releaseLock();
		return newCollectibleContracts;
	}

	/**
	 * Removes an individual collectible from the stored token list
	 *
	 * @param address - Hex address of the collectible contract
	 * @param tokenId - Token identifier of the collectible
	 */
	private removeIndividualCollectible(address: string, tokenId: number) {
		address = toChecksumAddress(address);
		const { allCollectibles, collectibles } = this.state;
		const { networkType, selectedAddress } = this.config;
		const newCollectibles = collectibles.filter(
			(collectible) => !(collectible.address === address && collectible.tokenId === tokenId)
		);
		const addressCollectibles = allCollectibles[selectedAddress];
		const newAddressCollectibles = { ...addressCollectibles, ...{ [networkType]: newCollectibles } };
		const newAllCollectibles = { ...allCollectibles, ...{ [selectedAddress]: newAddressCollectibles } };
		this.update({ allCollectibles: newAllCollectibles, collectibles: newCollectibles });
	}

	/**
	 * Removes a collectible contract to the stored collectible contracts list
	 *
	 * @param address - Hex address of the collectible contract
	 * @returns - Promise resolving to the current collectible contracts list
	 */
	private removeCollectibleContract(address: string): CollectibleContract[] {
		address = toChecksumAddress(address);
		const { allCollectibleContracts, collectibleContracts } = this.state;
		const { networkType, selectedAddress } = this.config;
		const newCollectibleContracts = collectibleContracts.filter(
			(collectibleContract) => !(collectibleContract.address === address)
		);
		const addressCollectibleContracts = allCollectibleContracts[selectedAddress];
		const newAddressCollectibleContracts = {
			...addressCollectibleContracts,
			...{ [networkType]: newCollectibleContracts }
		};
		const newAllCollectibleContracts = {
			...allCollectibleContracts,
			...{ [selectedAddress]: newAddressCollectibleContracts }
		};
		this.update({
			allCollectibleContracts: newAllCollectibleContracts,
			collectibleContracts: newCollectibleContracts
		});
		return newCollectibleContracts;
	}

	/**
	 * Name of this controller used during composition
	 */
	name = 'AssetsController';

	/**
	 * List of required sibling controllers this controller needs to function
	 */
	requiredControllers = ['AssetsContractController', 'NetworkController', 'PreferencesController'];

	/**
	 * Creates a AssetsController instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<BaseConfig>, state?: Partial<AssetsState>) {
		super(config, state);
		this.defaultConfig = {
			networkType: 'mainnet',
			selectedAddress: ''
		};
		this.defaultState = {
			allCollectibleContracts: {},
			allCollectibles: {},
			allTokens: {},
			collectibleContracts: [],
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
	async addToken(address: string, symbol: string, decimals: number): Promise<Token[]> {
		const releaseLock = await this.mutex.acquire();
		address = toChecksumAddress(address);
		const { allTokens, tokens } = this.state;
		const { networkType, selectedAddress } = this.config;
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
		releaseLock();
		return newTokens;
	}

	/**
	 * Adds a collectible and respective collectible contract to the stored collectible and collectible contracts lists
	 *
	 * @param address - Hex address of the collectible contract
	 * @param tokenId - The collectible identifier
	 * @param opts - Collectible optional information (name, image and description)
	 * @param detection? - Whether the collectible is manually added or autodetected
	 * @returns - Promise resolving to the current collectible list
	 */
	async addCollectible(address: string, tokenId: number, opts?: CollectibleInformation, detection?: boolean) {
		address = toChecksumAddress(address);
		const newCollectibleContracts = await this.addCollectibleContract(address, detection);
		// If collectible contract was not added, do not add individual collectible
		const collectibleContract = newCollectibleContracts.find((contract) => contract.address === address);
		// If collectible contract information, add individual collectible
		if (collectibleContract) {
			await this.addIndividualCollectible(address, tokenId, opts, detection);
		}
	}

	/**
	 * Removes a token from the stored token list
	 *
	 * @param address - Hex address of the token contract
	 */
	removeToken(address: string) {
		address = toChecksumAddress(address);
		const { allTokens, tokens } = this.state;
		const { networkType, selectedAddress } = this.config;
		const newTokens = tokens.filter((token) => token.address !== address);
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
		this.removeIndividualCollectible(address, tokenId);
		const { collectibles } = this.state;
		const remainingCollectible = collectibles.find((collectible) => collectible.address === address);
		if (!remainingCollectible) {
			this.removeCollectibleContract(address);
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
			const { allCollectibleContracts, allCollectibles, allTokens } = this.state;
			const { networkType } = this.config;
			this.configure({ selectedAddress });
			this.update({
				collectibleContracts:
					(allCollectibleContracts[selectedAddress] &&
						allCollectibleContracts[selectedAddress][networkType]) ||
					[],
				collectibles: (allCollectibles[selectedAddress] && allCollectibles[selectedAddress][networkType]) || [],
				tokens: (allTokens[selectedAddress] && allTokens[selectedAddress][networkType]) || []
			});
		});
		network.subscribe(({ provider }) => {
			const { allCollectibleContracts, allCollectibles, allTokens } = this.state;
			const { selectedAddress } = this.config;
			const networkType = provider.type;
			this.configure({ networkType });
			this.update({
				collectibleContracts:
					(allCollectibleContracts[selectedAddress] &&
						allCollectibleContracts[selectedAddress][networkType]) ||
					[],
				collectibles: (allCollectibles[selectedAddress] && allCollectibles[selectedAddress][networkType]) || [],
				tokens: (allTokens[selectedAddress] && allTokens[selectedAddress][networkType]) || []
			});
		});
	}
}

export default AssetsController;
