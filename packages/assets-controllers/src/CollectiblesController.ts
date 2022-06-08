import { EventEmitter } from 'events';
import { BN, stripHexPrefix } from 'ethereumjs-util';
import { Mutex } from 'async-mutex';
import type { PreferencesState } from '@metamask/user-controllers';
import {
  safelyExecute,
  handleFetch,
  toChecksumHexAddress,
  BNToHex,
  getFormattedIpfsUrl,
  fetchWithErrorHandling,
  MAINNET,
  RINKEBY_CHAIN_ID,
  IPFS_DEFAULT_GATEWAY_URL,
  ERC721,
  ERC1155,
  OPENSEA_API_URL,
  OPENSEA_PROXY_URL,
  OPENSEA_TEST_API_URL,
} from '@metamask/controller-utils';
import type { NetworkState, NetworkType } from '@metamask/network-controller';
import {
  BaseController,
  BaseConfig,
  BaseState,
} from '@metamask/base-controller';
import type {
  ApiCollectible,
  ApiCollectibleCreator,
  ApiCollectibleContract,
  ApiCollectibleLastSale,
} from './CollectibleDetectionController';
import type { AssetsContractController } from './AssetsContractController';
import { compareCollectiblesMetadata } from './assetsUtil';

/**
 * @type Collectible
 *
 * Collectible representation
 * @property address - Hex address of a ERC721 contract
 * @property description - The collectible description
 * @property image - URI of custom collectible image associated with this tokenId
 * @property name - Name associated with this tokenId and contract address
 * @property tokenId - The collectible identifier
 * @property numberOfSales - Number of sales
 * @property backgroundColor - The background color to be displayed with the item
 * @property imagePreview - URI of a smaller image associated with this collectible
 * @property imageThumbnail - URI of a thumbnail image associated with this collectible
 * @property imageOriginal - URI of the original image associated with this collectible
 * @property animation - URI of a animation associated with this collectible
 * @property animationOriginal - URI of the original animation associated with this collectible
 * @property externalLink - External link containing additional information
 * @property creator - The collectible owner information object
 * @property isCurrentlyOwned - Boolean indicating whether the address/chainId combination where it's currently stored currently owns this collectible
 */
export interface Collectible extends CollectibleMetadata {
  tokenId: string;
  address: string;
  isCurrentlyOwned?: boolean;
}

/**
 * @type CollectibleContract
 *
 * Collectible contract information representation
 * @property name - Contract name
 * @property logo - Contract logo
 * @property address - Contract address
 * @property symbol - Contract symbol
 * @property description - Contract description
 * @property totalSupply - Total supply of collectibles
 * @property assetContractType - The collectible type, it could be `semi-fungible` or `non-fungible`
 * @property createdDate - Creation date
 * @property schemaName - The schema followed by the contract, it could be `ERC721` or `ERC1155`
 * @property externalLink - External link containing additional information
 */
export interface CollectibleContract {
  name?: string;
  logo?: string;
  address: string;
  symbol?: string;
  description?: string;
  totalSupply?: string;
  assetContractType?: string;
  createdDate?: string;
  schemaName?: string;
  externalLink?: string;
}

/**
 * @type CollectibleMetadata
 *
 * Collectible custom information
 * @property name - Collectible custom name
 * @property description - The collectible description
 * @property numberOfSales - Number of sales
 * @property backgroundColor - The background color to be displayed with the item
 * @property image - Image custom image URI
 * @property imagePreview - URI of a smaller image associated with this collectible
 * @property imageThumbnail - URI of a thumbnail image associated with this collectible
 * @property imageOriginal - URI of the original image associated with this collectible
 * @property animation - URI of a animation associated with this collectible
 * @property animationOriginal - URI of the original animation associated with this collectible
 * @property externalLink - External link containing additional information
 * @property creator - The collectible owner information object
 * @property standard - NFT standard name for the collectible, e.g., ERC-721 or ERC-1155
 */
export interface CollectibleMetadata {
  name: string | null;
  description: string | null;
  image: string | null;
  standard: string | null;
  favorite?: boolean;
  numberOfSales?: number;
  backgroundColor?: string;
  imagePreview?: string;
  imageThumbnail?: string;
  imageOriginal?: string;
  animation?: string;
  animationOriginal?: string;
  externalLink?: string;
  creator?: ApiCollectibleCreator;
  lastSale?: ApiCollectibleLastSale;
}

interface AccountParams {
  userAddress: string;
  chainId: string;
}

/**
 * @type CollectiblesConfig
 *
 * Collectibles controller configuration
 * @property networkType - Network ID as per net_version
 * @property selectedAddress - Vault selected address
 */
export interface CollectiblesConfig extends BaseConfig {
  networkType: NetworkType;
  selectedAddress: string;
  chainId: string;
  ipfsGateway: string;
  openSeaEnabled: boolean;
  useIPFSSubdomains: boolean;
}

/**
 * @type CollectiblesState
 *
 * Assets controller state
 * @property allCollectibleContracts - Object containing collectibles contract information
 * @property allCollectibles - Object containing collectibles per account and network
 * @property collectibleContracts - List of collectibles contracts associated with the active vault
 * @property collectibles - List of collectibles associated with the active vault
 * @property ignoredCollectibles - List of collectibles that should be ignored
 */
export interface CollectiblesState extends BaseState {
  allCollectibleContracts: {
    [key: string]: { [key: string]: CollectibleContract[] };
  };
  allCollectibles: { [key: string]: { [key: string]: Collectible[] } };
  ignoredCollectibles: Collectible[];
}

const ALL_COLLECTIBLES_STATE_KEY = 'allCollectibles';
const ALL_COLLECTIBLES_CONTRACTS_STATE_KEY = 'allCollectibleContracts';

/**
 * Controller that stores assets and exposes convenience methods
 */
export class CollectiblesController extends BaseController<
  CollectiblesConfig,
  CollectiblesState
> {
  private mutex = new Mutex();

  private getCollectibleApi({
    contractAddress,
    tokenId,
    useProxy,
  }: {
    contractAddress: string;
    tokenId: string;
    useProxy: boolean;
  }) {
    const { chainId } = this.config;

    if (chainId === RINKEBY_CHAIN_ID) {
      return `${OPENSEA_TEST_API_URL}/asset/${contractAddress}/${tokenId}`;
    }
    return useProxy
      ? `${OPENSEA_PROXY_URL}/asset/${contractAddress}/${tokenId}`
      : `${OPENSEA_API_URL}/asset/${contractAddress}/${tokenId}`;
  }

  private getCollectibleContractInformationApi({
    contractAddress,
    useProxy,
  }: {
    contractAddress: string;
    useProxy: boolean;
  }) {
    const { chainId } = this.config;

    if (chainId === RINKEBY_CHAIN_ID) {
      return `${OPENSEA_TEST_API_URL}/asset_contract/${contractAddress}`;
    }

    return useProxy
      ? `${OPENSEA_PROXY_URL}/asset_contract/${contractAddress}`
      : `${OPENSEA_API_URL}/asset_contract/${contractAddress}`;
  }

  /**
   * Helper method to update nested state for allCollectibles and allCollectibleContracts.
   *
   * @param newCollection - the modified piece of state to update in the controller's store
   * @param baseStateKey - The root key in the store to update.
   * @param passedConfig - An object containing the selectedAddress and chainId that are passed through the auto-detection flow.
   * @param passedConfig.userAddress - the address passed through the collectible detection flow to ensure detected assets are stored to the correct account
   * @param passedConfig.chainId - the chainId passed through the collectible detection flow to ensure detected assets are stored to the correct account
   */
  private updateNestedCollectibleState(
    newCollection: Collectible[] | CollectibleContract[],
    baseStateKey: 'allCollectibles' | 'allCollectibleContracts',
    { userAddress, chainId }: AccountParams | undefined = {
      userAddress: this.config.selectedAddress,
      chainId: this.config.chainId,
    },
  ) {
    const { [baseStateKey]: oldState } = this.state;

    const addressState = oldState[userAddress];
    const newAddressState = {
      ...addressState,
      ...{ [chainId]: newCollection },
    };
    const newState = {
      ...oldState,
      ...{ [userAddress]: newAddressState },
    };

    this.update({
      [baseStateKey]: newState,
    });
  }

  /**
   * Request individual collectible information from OpenSea API.
   *
   * @param contractAddress - Hex address of the collectible contract.
   * @param tokenId - The collectible identifier.
   * @returns Promise resolving to the current collectible name and image.
   */
  private async getCollectibleInformationFromApi(
    contractAddress: string,
    tokenId: string,
  ): Promise<CollectibleMetadata> {
    // Attempt to fetch the data with the proxy
    let collectibleInformation: ApiCollectible | undefined =
      await fetchWithErrorHandling({
        url: this.getCollectibleApi({
          contractAddress,
          tokenId,
          useProxy: true,
        }),
      });

    // if an openSeaApiKey is set we should attempt to refetch calling directly to OpenSea
    if (!collectibleInformation && this.openSeaApiKey) {
      collectibleInformation = await fetchWithErrorHandling({
        url: this.getCollectibleApi({
          contractAddress,
          tokenId,
          useProxy: false,
        }),
        options: {
          headers: { 'X-API-KEY': this.openSeaApiKey },
        },
        // catch 403 errors (in case API key is down we don't want to blow up)
        errorCodesToCatch: [403],
      });
    }

    // if we were still unable to fetch the data we return out the default/null of `CollectibleMetadata`
    if (!collectibleInformation) {
      return {
        name: null,
        description: null,
        image: null,
        standard: null,
      };
    }

    // if we've reached this point, we have successfully fetched some data for collectibleInformation
    // now we reconfigure the data to conform to the `CollectibleMetadata` type for storage.
    const {
      num_sales,
      background_color,
      image_url,
      image_preview_url,
      image_thumbnail_url,
      image_original_url,
      animation_url,
      animation_original_url,
      name,
      description,
      external_link,
      creator,
      last_sale,
      asset_contract: { schema_name },
    } = collectibleInformation;

    /* istanbul ignore next */
    const collectibleMetadata: CollectibleMetadata = Object.assign(
      {},
      { name: name || null },
      { description: description || null },
      { image: image_url || null },
      creator && { creator },
      num_sales && { numberOfSales: num_sales },
      background_color && { backgroundColor: background_color },
      image_preview_url && { imagePreview: image_preview_url },
      image_thumbnail_url && { imageThumbnail: image_thumbnail_url },
      image_original_url && { imageOriginal: image_original_url },
      animation_url && { animation: animation_url },
      animation_original_url && {
        animationOriginal: animation_original_url,
      },
      external_link && { externalLink: external_link },
      last_sale && { lastSale: last_sale },
      schema_name && { standard: schema_name },
    );

    return collectibleMetadata;
  }

  /**
   * Request individual collectible information from contracts that follows Metadata Interface.
   *
   * @param contractAddress - Hex address of the collectible contract.
   * @param tokenId - The collectible identifier.
   * @returns Promise resolving to the current collectible name and image.
   */
  private async getCollectibleInformationFromTokenURI(
    contractAddress: string,
    tokenId: string,
  ): Promise<CollectibleMetadata> {
    const { ipfsGateway, useIPFSSubdomains } = this.config;
    const result = await this.getCollectibleURIAndStandard(
      contractAddress,
      tokenId,
    );
    let tokenURI = result[0];
    const standard = result[1];

    if (tokenURI.startsWith('ipfs://')) {
      tokenURI = getFormattedIpfsUrl(ipfsGateway, tokenURI, useIPFSSubdomains);
    }

    try {
      const object = await handleFetch(tokenURI);
      // TODO: Check image_url existence. This is not part of EIP721 nor EIP1155
      const image = Object.prototype.hasOwnProperty.call(object, 'image')
        ? 'image'
        : /* istanbul ignore next */ 'image_url';

      return {
        image: object[image],
        name: object.name,
        description: object.description,
        standard,
        favorite: false,
      };
    } catch {
      return {
        image: null,
        name: null,
        description: null,
        standard: standard || null,
        favorite: false,
      };
    }
  }

  /**
   * Retrieve collectible uri with  metadata. TODO Update method to use IPFS.
   *
   * @param contractAddress - Collectible contract address.
   * @param tokenId - Collectible token id.
   * @returns Promise resolving collectible uri and token standard.
   */
  private async getCollectibleURIAndStandard(
    contractAddress: string,
    tokenId: string,
  ): Promise<[string, string]> {
    // try ERC721 uri
    try {
      const uri = await this.getERC721TokenURI(contractAddress, tokenId);
      return [uri, ERC721];
    } catch {
      // Ignore error
    }

    // try ERC1155 uri
    try {
      const tokenURI = await this.getERC1155TokenURI(contractAddress, tokenId);

      /**
       * According to EIP1155 the URI value allows for ID substitution
       * in case the string `{id}` exists.
       * https://eips.ethereum.org/EIPS/eip-1155#metadata
       */

      if (!tokenURI.includes('{id}')) {
        return [tokenURI, ERC1155];
      }

      const hexTokenId = stripHexPrefix(BNToHex(new BN(tokenId)))
        .padStart(64, '0')
        .toLowerCase();
      return [tokenURI.replace('{id}', hexTokenId), ERC1155];
    } catch {
      // Ignore error
    }

    return ['', ''];
  }

  /**
   * Request individual collectible information (name, image url and description).
   *
   * @param contractAddress - Hex address of the collectible contract.
   * @param tokenId - The collectible identifier.
   * @returns Promise resolving to the current collectible name and image.
   */
  private async getCollectibleInformation(
    contractAddress: string,
    tokenId: string,
  ): Promise<CollectibleMetadata> {
    const blockchainMetadata = await safelyExecute(async () => {
      return await this.getCollectibleInformationFromTokenURI(
        contractAddress,
        tokenId,
      );
    });

    let openSeaMetadata;
    if (this.config.openSeaEnabled) {
      openSeaMetadata = await safelyExecute(async () => {
        return await this.getCollectibleInformationFromApi(
          contractAddress,
          tokenId,
        );
      });
    }
    return {
      ...openSeaMetadata,
      name: blockchainMetadata.name ?? openSeaMetadata?.name ?? null,
      description:
        blockchainMetadata.description ?? openSeaMetadata?.description ?? null,
      image: blockchainMetadata.image ?? openSeaMetadata?.image ?? null,
      standard:
        blockchainMetadata.standard ?? openSeaMetadata?.standard ?? null,
    };
  }

  /**
   * Request collectible contract information from OpenSea API.
   *
   * @param contractAddress - Hex address of the collectible contract.
   * @returns Promise resolving to the current collectible name and image.
   */
  private async getCollectibleContractInformationFromApi(
    contractAddress: string,
  ): Promise<ApiCollectibleContract> {
    /* istanbul ignore if */
    let apiCollectibleContractObject: ApiCollectibleContract | undefined =
      await fetchWithErrorHandling({
        url: this.getCollectibleContractInformationApi({
          contractAddress,
          useProxy: true,
        }),
      });

    // if we successfully fetched return the fetched data immediately
    if (apiCollectibleContractObject) {
      return apiCollectibleContractObject;
    }

    // if we were unsuccessful in fetching from the API and an OpenSea API key is present
    // attempt to refetch directly against the OpenSea API and if successful return the data immediately
    if (this.openSeaApiKey) {
      apiCollectibleContractObject = await fetchWithErrorHandling({
        url: this.getCollectibleContractInformationApi({
          contractAddress,
          useProxy: false,
        }),
        options: {
          headers: { 'X-API-KEY': this.openSeaApiKey },
        },
        // catch 403 errors (in case API key is down we don't want to blow up)
        errorCodesToCatch: [403],
      });

      if (apiCollectibleContractObject) {
        return apiCollectibleContractObject;
      }
    }

    // If we've reached this point we were unable to fetch data from either the proxy or opensea so we return
    // the default/null of ApiCollectibleContract
    return {
      address: contractAddress,
      asset_contract_type: null,
      created_date: null,
      schema_name: null,
      symbol: null,
      total_supply: null,
      description: null,
      external_link: null,
      collection: {
        name: null,
        image_url: null,
      },
    };
  }

  /**
   * Request collectible contract information from the contract itself.
   *
   * @param contractAddress - Hex address of the collectible contract.
   * @returns Promise resolving to the current collectible name and image.
   */
  private async getCollectibleContractInformationFromContract(
    contractAddress: string,
  ): Promise<
    Partial<ApiCollectibleContract> &
      Pick<ApiCollectibleContract, 'address'> &
      Pick<ApiCollectibleContract, 'collection'>
  > {
    const name = await this.getERC721AssetName(contractAddress);
    const symbol = await this.getERC721AssetSymbol(contractAddress);
    return {
      collection: { name },
      symbol,
      address: contractAddress,
    };
  }

  /**
   * Request collectible contract information from OpenSea API.
   *
   * @param contractAddress - Hex address of the collectible contract.
   * @returns Promise resolving to the collectible contract name, image and description.
   */
  private async getCollectibleContractInformation(
    contractAddress: string,
  ): Promise<
    Partial<ApiCollectibleContract> &
      Pick<ApiCollectibleContract, 'address'> &
      Pick<ApiCollectibleContract, 'collection'>
  > {
    const blockchainContractData: Partial<ApiCollectibleContract> &
      Pick<ApiCollectibleContract, 'address'> &
      Pick<ApiCollectibleContract, 'collection'> = await safelyExecute(
      async () => {
        return await this.getCollectibleContractInformationFromContract(
          contractAddress,
        );
      },
    );

    let openSeaContractData: Partial<ApiCollectibleContract> | undefined;
    if (this.config.openSeaEnabled) {
      openSeaContractData = await safelyExecute(async () => {
        return await this.getCollectibleContractInformationFromApi(
          contractAddress,
        );
      });
    }

    if (blockchainContractData || openSeaContractData) {
      return {
        ...openSeaContractData,
        ...blockchainContractData,
        collection: {
          image_url: null,
          ...openSeaContractData?.collection,
          ...blockchainContractData?.collection,
        },
      };
    }

    /* istanbul ignore next */
    return {
      address: contractAddress,
      asset_contract_type: null,
      created_date: null,
      schema_name: null,
      symbol: null,
      total_supply: null,
      description: null,
      external_link: null,
      collection: { name: null, image_url: null },
    };
  }

  /**
   * Adds an individual collectible to the stored collectible list.
   *
   * @param address - Hex address of the collectible contract.
   * @param tokenId - The collectible identifier.
   * @param collectibleMetadata - Collectible optional information (name, image and description).
   * @param collectibleContract - An object containing contract data of the collectible being added.
   * @param detection - The chain ID and address of the currently selected network and account at the moment the collectible was detected.
   * @returns Promise resolving to the current collectible list.
   */
  private async addIndividualCollectible(
    address: string,
    tokenId: string,
    collectibleMetadata: CollectibleMetadata,
    collectibleContract: CollectibleContract,
    detection?: AccountParams,
  ): Promise<Collectible[]> {
    // TODO: Remove unused return
    const releaseLock = await this.mutex.acquire();
    try {
      address = toChecksumHexAddress(address);
      const { allCollectibles } = this.state;
      let chainId, selectedAddress;

      if (detection) {
        chainId = detection.chainId;
        selectedAddress = detection.userAddress;
      } else {
        chainId = this.config.chainId;
        selectedAddress = this.config.selectedAddress;
      }

      const collectibles = allCollectibles[selectedAddress]?.[chainId] || [];

      const existingEntry: Collectible | undefined = collectibles.find(
        (collectible) =>
          collectible.address.toLowerCase() === address.toLowerCase() &&
          collectible.tokenId === tokenId,
      );

      if (existingEntry) {
        const differentMetadata = compareCollectiblesMetadata(
          collectibleMetadata,
          existingEntry,
        );
        if (differentMetadata) {
          // TODO: Switch to indexToUpdate
          const indexToRemove = collectibles.findIndex(
            (collectible) =>
              collectible.address.toLowerCase() === address.toLowerCase() &&
              collectible.tokenId === tokenId,
          );
          /* istanbul ignore next */
          if (indexToRemove !== -1) {
            collectibles.splice(indexToRemove, 1);
          }
        } else {
          return collectibles;
        }
      }

      const newEntry: Collectible = {
        address,
        tokenId,
        favorite: existingEntry?.favorite || false,
        isCurrentlyOwned: true,
        ...collectibleMetadata,
      };

      const newCollectibles = [...collectibles, newEntry];
      this.updateNestedCollectibleState(
        newCollectibles,
        ALL_COLLECTIBLES_STATE_KEY,
        { chainId, userAddress: selectedAddress },
      );

      this.onCollectibleAdded({
        address,
        symbol: collectibleContract.symbol,
        tokenId: tokenId.toString(),
        standard: collectibleMetadata.standard,
        source: detection ? 'detected' : 'custom',
      });

      return newCollectibles;
    } finally {
      releaseLock();
    }
  }

  /**
   * Adds a collectible contract to the stored collectible contracts list.
   *
   * @param address - Hex address of the collectible contract.
   * @param detection - The chain ID and address of the currently selected network and account at the moment the collectible was detected.
   * @returns Promise resolving to the current collectible contracts list.
   */
  private async addCollectibleContract(
    address: string,
    detection?: AccountParams,
  ): Promise<CollectibleContract[]> {
    const releaseLock = await this.mutex.acquire();
    try {
      address = toChecksumHexAddress(address);
      const { allCollectibleContracts } = this.state;

      let chainId, selectedAddress;
      if (detection) {
        chainId = detection.chainId;
        selectedAddress = detection.userAddress;
      } else {
        chainId = this.config.chainId;
        selectedAddress = this.config.selectedAddress;
      }

      const collectibleContracts =
        allCollectibleContracts[selectedAddress]?.[chainId] || [];

      const existingEntry = collectibleContracts.find(
        (collectibleContract) =>
          collectibleContract.address.toLowerCase() === address.toLowerCase(),
      );
      if (existingEntry) {
        return collectibleContracts;
      }
      const contractInformation = await this.getCollectibleContractInformation(
        address,
      );

      const {
        asset_contract_type,
        created_date,
        schema_name,
        symbol,
        total_supply,
        description,
        external_link,
        collection: { name, image_url },
      } = contractInformation;
      // If being auto-detected opensea information is expected
      // Otherwise at least name from the contract is needed
      if (
        (detection && !name) ||
        Object.keys(contractInformation).length === 0
      ) {
        return collectibleContracts;
      }

      /* istanbul ignore next */
      const newEntry: CollectibleContract = Object.assign(
        {},
        { address },
        description && { description },
        name && { name },
        image_url && { logo: image_url },
        symbol && { symbol },
        total_supply !== null &&
          typeof total_supply !== 'undefined' && { totalSupply: total_supply },
        asset_contract_type && { assetContractType: asset_contract_type },
        created_date && { createdDate: created_date },
        schema_name && { schemaName: schema_name },
        external_link && { externalLink: external_link },
      );
      const newCollectibleContracts = [...collectibleContracts, newEntry];
      this.updateNestedCollectibleState(
        newCollectibleContracts,
        ALL_COLLECTIBLES_CONTRACTS_STATE_KEY,
        { chainId, userAddress: selectedAddress },
      );

      return newCollectibleContracts;
    } finally {
      releaseLock();
    }
  }

  /**
   * Removes an individual collectible from the stored token list and saves it in ignored collectibles list.
   *
   * @param address - Hex address of the collectible contract.
   * @param tokenId - Token identifier of the collectible.
   */
  private removeAndIgnoreIndividualCollectible(
    address: string,
    tokenId: string,
  ) {
    address = toChecksumHexAddress(address);
    const { allCollectibles, ignoredCollectibles } = this.state;
    const { chainId, selectedAddress } = this.config;
    const newIgnoredCollectibles = [...ignoredCollectibles];
    const collectibles = allCollectibles[selectedAddress]?.[chainId] || [];
    const newCollectibles = collectibles.filter((collectible) => {
      if (
        collectible.address.toLowerCase() === address.toLowerCase() &&
        collectible.tokenId === tokenId
      ) {
        const alreadyIgnored = newIgnoredCollectibles.find(
          (c) => c.address === address && c.tokenId === tokenId,
        );
        !alreadyIgnored && newIgnoredCollectibles.push(collectible);
        return false;
      }
      return true;
    });

    this.updateNestedCollectibleState(
      newCollectibles,
      ALL_COLLECTIBLES_STATE_KEY,
    );

    this.update({
      ignoredCollectibles: newIgnoredCollectibles,
    });
  }

  /**
   * Removes an individual collectible from the stored token list.
   *
   * @param address - Hex address of the collectible contract.
   * @param tokenId - Token identifier of the collectible.
   */
  private removeIndividualCollectible(address: string, tokenId: string) {
    address = toChecksumHexAddress(address);
    const { allCollectibles } = this.state;
    const { chainId, selectedAddress } = this.config;
    const collectibles = allCollectibles[selectedAddress]?.[chainId] || [];
    const newCollectibles = collectibles.filter(
      (collectible) =>
        !(
          collectible.address.toLowerCase() === address.toLowerCase() &&
          collectible.tokenId === tokenId
        ),
    );
    this.updateNestedCollectibleState(
      newCollectibles,
      ALL_COLLECTIBLES_STATE_KEY,
    );
  }

  /**
   * Removes a collectible contract to the stored collectible contracts list.
   *
   * @param address - Hex address of the collectible contract.
   * @returns Promise resolving to the current collectible contracts list.
   */
  private removeCollectibleContract(address: string): CollectibleContract[] {
    address = toChecksumHexAddress(address);
    const { allCollectibleContracts } = this.state;
    const { chainId, selectedAddress } = this.config;
    const collectibleContracts =
      allCollectibleContracts[selectedAddress]?.[chainId] || [];

    const newCollectibleContracts = collectibleContracts.filter(
      (collectibleContract) =>
        !(collectibleContract.address.toLowerCase() === address.toLowerCase()),
    );
    this.updateNestedCollectibleState(
      newCollectibleContracts,
      ALL_COLLECTIBLES_CONTRACTS_STATE_KEY,
    );

    return newCollectibleContracts;
  }

  /**
   * EventEmitter instance used to listen to specific EIP747 events
   */
  hub = new EventEmitter();

  /**
   * Optional API key to use with opensea
   */
  openSeaApiKey?: string;

  /**
   * Name of this controller used during composition
   */
  override name = 'CollectiblesController';

  private getERC721AssetName: AssetsContractController['getERC721AssetName'];

  private getERC721AssetSymbol: AssetsContractController['getERC721AssetSymbol'];

  private getERC721TokenURI: AssetsContractController['getERC721TokenURI'];

  private getERC721OwnerOf: AssetsContractController['getERC721OwnerOf'];

  private getERC1155BalanceOf: AssetsContractController['getERC1155BalanceOf'];

  private getERC1155TokenURI: AssetsContractController['getERC1155TokenURI'];

  private onCollectibleAdded: (data: {
    address: string;
    symbol: string | undefined;
    tokenId: string;
    standard: string | null;
    source: string;
  }) => void;

  /**
   * Creates a CollectiblesController instance.
   *
   * @param options - The controller options.
   * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
   * @param options.getERC721AssetName - Gets the name of the asset at the given address.
   * @param options.getERC721AssetSymbol - Gets the symbol of the asset at the given address.
   * @param options.getERC721TokenURI - Gets the URI of the ERC721 token at the given address, with the given ID.
   * @param options.getERC721OwnerOf - Get the owner of a ERC-721 collectible.
   * @param options.getERC1155BalanceOf - Gets balance of a ERC-1155 collectible.
   * @param options.getERC1155TokenURI - Gets the URI of the ERC1155 token at the given address, with the given ID.
   * @param options.onCollectibleAdded - Callback that is called when a collectible is added. Currently used pass data
   * for tracking the collectible added event.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      onPreferencesStateChange,
      onNetworkStateChange,
      getERC721AssetName,
      getERC721AssetSymbol,
      getERC721TokenURI,
      getERC721OwnerOf,
      getERC1155BalanceOf,
      getERC1155TokenURI,
      onCollectibleAdded,
    }: {
      onPreferencesStateChange: (
        listener: (preferencesState: PreferencesState) => void,
      ) => void;
      onNetworkStateChange: (
        listener: (networkState: NetworkState) => void,
      ) => void;
      getERC721AssetName: AssetsContractController['getERC721AssetName'];
      getERC721AssetSymbol: AssetsContractController['getERC721AssetSymbol'];
      getERC721TokenURI: AssetsContractController['getERC721TokenURI'];
      getERC721OwnerOf: AssetsContractController['getERC721OwnerOf'];
      getERC1155BalanceOf: AssetsContractController['getERC1155BalanceOf'];
      getERC1155TokenURI: AssetsContractController['getERC1155TokenURI'];
      onCollectibleAdded: (data: {
        address: string;
        symbol: string | undefined;
        tokenId: string;
        standard: string | null;
        source: string;
      }) => void;
    },
    config?: Partial<BaseConfig>,
    state?: Partial<CollectiblesState>,
  ) {
    super(config, state);
    this.defaultConfig = {
      networkType: MAINNET,
      selectedAddress: '',
      chainId: '',
      ipfsGateway: IPFS_DEFAULT_GATEWAY_URL,
      openSeaEnabled: false,
      useIPFSSubdomains: true,
    };

    this.defaultState = {
      allCollectibleContracts: {},
      allCollectibles: {},
      ignoredCollectibles: [],
    };
    this.initialize();
    this.getERC721AssetName = getERC721AssetName;
    this.getERC721AssetSymbol = getERC721AssetSymbol;
    this.getERC721TokenURI = getERC721TokenURI;
    this.getERC721OwnerOf = getERC721OwnerOf;
    this.getERC1155BalanceOf = getERC1155BalanceOf;
    this.getERC1155TokenURI = getERC1155TokenURI;
    this.onCollectibleAdded = onCollectibleAdded;

    onPreferencesStateChange(
      ({ selectedAddress, ipfsGateway, openSeaEnabled }) => {
        this.configure({ selectedAddress, ipfsGateway, openSeaEnabled });
      },
    );

    onNetworkStateChange(({ provider }) => {
      const { chainId } = provider;
      this.configure({ chainId });
    });
  }

  /**
   * Sets an OpenSea API key to retrieve collectible information.
   *
   * @param openSeaApiKey - OpenSea API key.
   */
  setApiKey(openSeaApiKey: string) {
    this.openSeaApiKey = openSeaApiKey;
  }

  /**
   * Checks the ownership of a ERC-721 or ERC-1155 collectible for a given address.
   *
   * @param ownerAddress - User public address.
   * @param collectibleAddress - Collectible contract address.
   * @param collectibleId - Collectible token ID.
   * @returns Promise resolving the collectible ownership.
   */
  async isCollectibleOwner(
    ownerAddress: string,
    collectibleAddress: string,
    collectibleId: string,
  ): Promise<boolean> {
    // Checks the ownership for ERC-721.
    try {
      const owner = await this.getERC721OwnerOf(
        collectibleAddress,
        collectibleId,
      );
      return ownerAddress.toLowerCase() === owner.toLowerCase();
      // eslint-disable-next-line no-empty
    } catch {
      // Ignore ERC-721 contract error
    }

    // Checks the ownership for ERC-1155.
    try {
      const balance = await this.getERC1155BalanceOf(
        ownerAddress,
        collectibleAddress,
        collectibleId,
      );
      return balance > 0;
      // eslint-disable-next-line no-empty
    } catch {
      // Ignore ERC-1155 contract error
    }

    throw new Error(
      'Unable to verify ownership. Probably because the standard is not supported or the chain is incorrect.',
    );
  }

  /**
   * Verifies currently selected address owns entered collectible address/tokenId combo and
   * adds the collectible and respective collectible contract to the stored collectible and collectible contracts lists.
   *
   * @param address - Hex address of the collectible contract.
   * @param tokenId - The collectible identifier.
   */
  async addCollectibleVerifyOwnership(address: string, tokenId: string) {
    const { selectedAddress } = this.config;
    if (!(await this.isCollectibleOwner(selectedAddress, address, tokenId))) {
      throw new Error('This collectible is not owned by the user');
    }
    await this.addCollectible(address, tokenId);
  }

  /**
   * Adds a collectible and respective collectible contract to the stored collectible and collectible contracts lists.
   *
   * @param address - Hex address of the collectible contract.
   * @param tokenId - The collectible identifier.
   * @param collectibleMetadata - Collectible optional metadata.
   * @param detection - The chain ID and address of the currently selected network and account at the moment the collectible was detected.
   * @returns Promise resolving to the current collectible list.
   */
  async addCollectible(
    address: string,
    tokenId: string,
    collectibleMetadata?: CollectibleMetadata,
    detection?: AccountParams,
  ) {
    address = toChecksumHexAddress(address);
    const newCollectibleContracts = await this.addCollectibleContract(
      address,
      detection,
    );
    collectibleMetadata =
      collectibleMetadata ||
      (await this.getCollectibleInformation(address, tokenId));

    // If collectible contract was not added, do not add individual collectible
    const collectibleContract = newCollectibleContracts.find(
      (contract) => contract.address.toLowerCase() === address.toLowerCase(),
    );

    // If collectible contract information, add individual collectible
    if (collectibleContract) {
      await this.addIndividualCollectible(
        address,
        tokenId,
        collectibleMetadata,
        collectibleContract,
        detection,
      );
    }
  }

  /**
   * Removes a collectible from the stored token list.
   *
   * @param address - Hex address of the collectible contract.
   * @param tokenId - Token identifier of the collectible.
   */
  removeCollectible(address: string, tokenId: string) {
    address = toChecksumHexAddress(address);
    this.removeIndividualCollectible(address, tokenId);
    const { allCollectibles } = this.state;
    const { chainId, selectedAddress } = this.config;
    const collectibles = allCollectibles[selectedAddress]?.[chainId] || [];
    const remainingCollectible = collectibles.find(
      (collectible) =>
        collectible.address.toLowerCase() === address.toLowerCase(),
    );
    if (!remainingCollectible) {
      this.removeCollectibleContract(address);
    }
  }

  /**
   * Removes a collectible from the stored token list and saves it in ignored collectibles list.
   *
   * @param address - Hex address of the collectible contract.
   * @param tokenId - Token identifier of the collectible.
   */
  removeAndIgnoreCollectible(address: string, tokenId: string) {
    address = toChecksumHexAddress(address);
    this.removeAndIgnoreIndividualCollectible(address, tokenId);
    const { allCollectibles } = this.state;
    const { chainId, selectedAddress } = this.config;
    const collectibles = allCollectibles[selectedAddress]?.[chainId] || [];
    const remainingCollectible = collectibles.find(
      (collectible) =>
        collectible.address.toLowerCase() === address.toLowerCase(),
    );
    if (!remainingCollectible) {
      this.removeCollectibleContract(address);
    }
  }

  /**
   * Removes all collectibles from the ignored list.
   */
  clearIgnoredCollectibles() {
    this.update({ ignoredCollectibles: [] });
  }

  /**
   * Checks whether input collectible is still owned by the user
   * And updates the isCurrentlyOwned value on the collectible object accordingly.
   *
   * @param collectible - The collectible object to check and update.
   * @param batch - A boolean indicating whether this method is being called as part of a batch or single update.
   * @param accountParams - The userAddress and chainId to check ownership against
   * @param accountParams.userAddress - the address passed through the confirmed transaction flow to ensure detected assets are stored to the correct account
   * @param accountParams.chainId - the chainId passed through the confirmed transaction flow to ensure detected assets are stored to the correct account
   * @returns the collectible with the updated isCurrentlyOwned value
   */
  async checkAndUpdateSingleCollectibleOwnershipStatus(
    collectible: Collectible,
    batch: boolean,
    { userAddress, chainId }: AccountParams | undefined = {
      userAddress: this.config.selectedAddress,
      chainId: this.config.chainId,
    },
  ) {
    const { address, tokenId } = collectible;
    let isOwned = collectible.isCurrentlyOwned;
    try {
      isOwned = await this.isCollectibleOwner(userAddress, address, tokenId);
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          error.message.includes('Unable to verify ownership')
        )
      ) {
        throw error;
      }
    }

    collectible.isCurrentlyOwned = isOwned;

    if (batch === true) {
      return collectible;
    }

    // if this is not part of a batched update we update this one collectible in state
    const { allCollectibles } = this.state;
    const collectibles = allCollectibles[userAddress]?.[chainId] || [];
    const collectibleToUpdate = collectibles.find(
      (item) =>
        item.tokenId === tokenId &&
        item.address.toLowerCase() === address.toLowerCase(),
    );
    if (collectibleToUpdate) {
      collectibleToUpdate.isCurrentlyOwned = isOwned;
      this.updateNestedCollectibleState(
        collectibles,
        ALL_COLLECTIBLES_STATE_KEY,
        { userAddress, chainId },
      );
    }
    return collectible;
  }

  /**
   * Checks whether Collectibles associated with current selectedAddress/chainId combination are still owned by the user
   * And updates the isCurrentlyOwned value on each accordingly.
   */
  async checkAndUpdateAllCollectiblesOwnershipStatus() {
    const { allCollectibles } = this.state;
    const { chainId, selectedAddress } = this.config;
    const collectibles = allCollectibles[selectedAddress]?.[chainId] || [];
    const updatedCollectibles = await Promise.all(
      collectibles.map(async (collectible) => {
        return (
          (await this.checkAndUpdateSingleCollectibleOwnershipStatus(
            collectible,
            true,
          )) ?? collectible
        );
      }),
    );

    this.updateNestedCollectibleState(
      updatedCollectibles,
      ALL_COLLECTIBLES_STATE_KEY,
    );
  }

  /**
   * Update collectible favorite status.
   *
   * @param address - Hex address of the collectible contract.
   * @param tokenId - Hex address of the collectible contract.
   * @param favorite - Collectible new favorite status.
   */
  updateCollectibleFavoriteStatus(
    address: string,
    tokenId: string,
    favorite: boolean,
  ) {
    const { allCollectibles } = this.state;
    const { chainId, selectedAddress } = this.config;
    const collectibles = allCollectibles[selectedAddress]?.[chainId] || [];
    const index: number = collectibles.findIndex(
      (collectible) =>
        collectible.address === address && collectible.tokenId === tokenId,
    );

    if (index === -1) {
      return;
    }

    const updatedCollectible: Collectible = {
      ...collectibles[index],
      favorite,
    };

    // Update Collectibles array
    collectibles[index] = updatedCollectible;

    this.updateNestedCollectibleState(collectibles, ALL_COLLECTIBLES_STATE_KEY);
  }
}

export default CollectiblesController;
