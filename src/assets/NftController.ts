import { EventEmitter } from 'events';
import { BN, stripHexPrefix } from 'ethereumjs-util';
import { Mutex } from 'async-mutex';

import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type { PreferencesState } from '../user/PreferencesController';
import type { NetworkState, NetworkType } from '../network/NetworkController';
import {
  safelyExecute,
  handleFetch,
  toChecksumHexAddress,
  BNToHex,
  getFormattedIpfsUrl,
  fetchWithErrorHandling,
} from '../util';
import {
  MAINNET,
  RINKEBY_CHAIN_ID,
  IPFS_DEFAULT_GATEWAY_URL,
  ERC721,
  ERC1155,
  OPENSEA_API_URL,
  OPENSEA_PROXY_URL,
  OPENSEA_TEST_API_URL,
} from '../constants';

import type {
  ApiNft,
  ApiNftCreator,
  ApiNftContract,
  ApiNftLastSale,
} from './NftDetectionController';
import type { AssetsContractController } from './AssetsContractController';
import { compareNftMetadata } from './assetsUtil';

/**
 * @type Nft
 *
 * NFT representation
 * @property address - Hex address of a ERC721 contract
 * @property description - The NFT description
 * @property image - URI of custom NFT image associated with this tokenId
 * @property name - Name associated with this tokenId and contract address
 * @property tokenId - The NFT identifier
 * @property numberOfSales - Number of sales
 * @property backgroundColor - The background color to be displayed with the item
 * @property imagePreview - URI of a smaller image associated with this NFT
 * @property imageThumbnail - URI of a thumbnail image associated with this NFT
 * @property imageOriginal - URI of the original image associated with this NFT
 * @property animation - URI of a animation associated with this NFT
 * @property animationOriginal - URI of the original animation associated with this NFT
 * @property externalLink - External link containing additional information
 * @property creator - The NFT owner information object
 * @property isCurrentlyOwned - Boolean indicating whether the address/chainId combination where it's currently stored currently owns this NFT
 * @property transactionId - Transaction Id associated with the NFT
 */
export interface Nft extends NftMetadata {
  tokenId: string;
  address: string;
  isCurrentlyOwned?: boolean;
}

/**
 * @type NftContract
 *
 * NFT contract information representation
 * @property name - Contract name
 * @property logo - Contract logo
 * @property address - Contract address
 * @property symbol - Contract symbol
 * @property description - Contract description
 * @property totalSupply - Total supply of NFTs
 * @property assetContractType - The NFT type, it could be `semi-fungible` or `non-fungible`
 * @property createdDate - Creation date
 * @property schemaName - The schema followed by the contract, it could be `ERC721` or `ERC1155`
 * @property externalLink - External link containing additional information
 */
export interface NftContract {
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
 * @type NftMetadata
 *
 * NFT custom information
 * @property name - NFT custom name
 * @property description - The NFT description
 * @property numberOfSales - Number of sales
 * @property backgroundColor - The background color to be displayed with the item
 * @property image - Image custom image URI
 * @property imagePreview - URI of a smaller image associated with this NFT
 * @property imageThumbnail - URI of a thumbnail image associated with this NFT
 * @property imageOriginal - URI of the original image associated with this NFT
 * @property animation - URI of a animation associated with this NFT
 * @property animationOriginal - URI of the original animation associated with this NFT
 * @property externalLink - External link containing additional information
 * @property creator - The NFT owner information object
 * @property standard - NFT standard name for the NFT, e.g., ERC-721 or ERC-1155
 */
export interface NftMetadata {
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
  creator?: ApiNftCreator;
  lastSale?: ApiNftLastSale;
  transactionId?: string;
}

interface AccountParams {
  userAddress: string;
  chainId: string;
}

/**
 * @type NftConfig
 *
 * NFT controller configuration
 * @property networkType - Network ID as per net_version
 * @property selectedAddress - Vault selected address
 */
export interface NftConfig extends BaseConfig {
  networkType: NetworkType;
  selectedAddress: string;
  chainId: string;
  ipfsGateway: string;
  openSeaEnabled: boolean;
  useIPFSSubdomains: boolean;
}

/**
 * @type NftState
 *
 * NFT controller state
 * @property allNftContracts - Object containing NFT contract information
 * @property allNfts - Object containing NFTs per account and network
 * @property ignoredNfts - List of NFTs that should be ignored
 */
export interface NftState extends BaseState {
  allNftContracts: {
    [key: string]: { [key: string]: NftContract[] };
  };
  allNfts: { [key: string]: { [key: string]: Nft[] } };
  ignoredNfts: Nft[];
}

const ALL_NFTS_STATE_KEY = 'allNfts';
const ALL_NFTS_CONTRACTS_STATE_KEY = 'allNftContracts';

/**
 * Controller that stores assets and exposes convenience methods
 */
export class NftController extends BaseController<NftConfig, NftState> {
  private mutex = new Mutex();

  private getNftApi({
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

  private getNftContractInformationApi({
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
   * Helper method to update nested state for allNfts and allNftContracts.
   *
   * @param newCollection - the modified piece of state to update in the controller's store
   * @param baseStateKey - The root key in the store to update.
   * @param passedConfig - An object containing the selectedAddress and chainId that are passed through the auto-detection flow.
   * @param passedConfig.userAddress - the address passed through the NFT detection flow to ensure detected assets are stored to the correct account
   * @param passedConfig.chainId - the chainId passed through the NFT detection flow to ensure detected assets are stored to the correct account
   */
  private updateNestedNftState(
    newCollection: Nft[] | NftContract[],
    baseStateKey: 'allNfts' | 'allNftContracts',
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
   * Request individual NFT information from OpenSea API.
   *
   * @param contractAddress - Hex address of the NFT contract.
   * @param tokenId - The NFT identifier.
   * @returns Promise resolving to the current NFT name and image.
   */
  private async getNftInformationFromApi(
    contractAddress: string,
    tokenId: string,
  ): Promise<NftMetadata> {
    // Attempt to fetch the data with the proxy
    let nftInformation: ApiNft | undefined = await fetchWithErrorHandling({
      url: this.getNftApi({
        contractAddress,
        tokenId,
        useProxy: true,
      }),
    });

    // if an openSeaApiKey is set we should attempt to refetch calling directly to OpenSea
    if (!nftInformation && this.openSeaApiKey) {
      nftInformation = await fetchWithErrorHandling({
        url: this.getNftApi({
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

    // if we were still unable to fetch the data we return out the default/null of `NftMetadata`
    if (!nftInformation) {
      return {
        name: null,
        description: null,
        image: null,
        standard: null,
      };
    }

    // if we've reached this point, we have successfully fetched some data for nftInformation
    // now we reconfigure the data to conform to the `NftMetadata` type for storage.
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
    } = nftInformation;

    /* istanbul ignore next */
    const nftMetadata: NftMetadata = Object.assign(
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

    return nftMetadata;
  }

  /**
   * Request individual NFT information from contracts that follows Metadata Interface.
   *
   * @param contractAddress - Hex address of the NFT contract.
   * @param tokenId - The NFT identifier.
   * @returns Promise resolving to the current NFT name and image.
   */
  private async getNftInformationFromTokenURI(
    contractAddress: string,
    tokenId: string,
  ): Promise<NftMetadata> {
    const { ipfsGateway, useIPFSSubdomains } = this.config;
    const result = await this.getNftURIAndStandard(contractAddress, tokenId);
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
   * Retrieve NFT uri with  metadata. TODO Update method to use IPFS.
   *
   * @param contractAddress - NFT contract address.
   * @param tokenId - NFT token id.
   * @returns Promise resolving NFT uri and token standard.
   */
  private async getNftURIAndStandard(
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
   * Request individual NFT information (name, image url and description).
   *
   * @param contractAddress - Hex address of the NFT contract.
   * @param tokenId - The NFT identifier.
   * @returns Promise resolving to the current NFT name and image.
   */
  private async getNftInformation(
    contractAddress: string,
    tokenId: string,
  ): Promise<NftMetadata> {
    const blockchainMetadata = await safelyExecute(async () => {
      return await this.getNftInformationFromTokenURI(contractAddress, tokenId);
    });

    let openSeaMetadata;
    if (this.config.openSeaEnabled) {
      openSeaMetadata = await safelyExecute(async () => {
        return await this.getNftInformationFromApi(contractAddress, tokenId);
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
   * Request NFT contract information from OpenSea API.
   *
   * @param contractAddress - Hex address of the NFT contract.
   * @returns Promise resolving to the current NFT name and image.
   */
  private async getNftContractInformationFromApi(
    contractAddress: string,
  ): Promise<ApiNftContract> {
    /* istanbul ignore if */
    let apiNftContractObject: ApiNftContract | undefined =
      await fetchWithErrorHandling({
        url: this.getNftContractInformationApi({
          contractAddress,
          useProxy: true,
        }),
      });

    // if we successfully fetched return the fetched data immediately
    if (apiNftContractObject) {
      return apiNftContractObject;
    }

    // if we were unsuccessful in fetching from the API and an OpenSea API key is present
    // attempt to refetch directly against the OpenSea API and if successful return the data immediately
    if (this.openSeaApiKey) {
      apiNftContractObject = await fetchWithErrorHandling({
        url: this.getNftContractInformationApi({
          contractAddress,
          useProxy: false,
        }),
        options: {
          headers: { 'X-API-KEY': this.openSeaApiKey },
        },
        // catch 403 errors (in case API key is down we don't want to blow up)
        errorCodesToCatch: [403],
      });

      if (apiNftContractObject) {
        return apiNftContractObject;
      }
    }

    // If we've reached this point we were unable to fetch data from either the proxy or opensea so we return
    // the default/null of ApiNftContract
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
   * Request NFT contract information from the contract itself.
   *
   * @param contractAddress - Hex address of the NFT contract.
   * @returns Promise resolving to the current NFT name and image.
   */
  private async getNftContractInformationFromContract(
    contractAddress: string,
  ): Promise<
    Partial<ApiNftContract> &
      Pick<ApiNftContract, 'address'> &
      Pick<ApiNftContract, 'collection'>
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
   * Request NFT contract information from OpenSea API.
   *
   * @param contractAddress - Hex address of the NFT contract.
   * @returns Promise resolving to the NFT contract name, image and description.
   */
  private async getNftContractInformation(
    contractAddress: string,
  ): Promise<
    Partial<ApiNftContract> &
      Pick<ApiNftContract, 'address'> &
      Pick<ApiNftContract, 'collection'>
  > {
    const blockchainContractData: Partial<ApiNftContract> &
      Pick<ApiNftContract, 'address'> &
      Pick<ApiNftContract, 'collection'> = await safelyExecute(async () => {
      return await this.getNftContractInformationFromContract(contractAddress);
    });

    let openSeaContractData: Partial<ApiNftContract> | undefined;
    if (this.config.openSeaEnabled) {
      openSeaContractData = await safelyExecute(async () => {
        return await this.getNftContractInformationFromApi(contractAddress);
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
   * Adds an individual NFT to the stored NFT list.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - The NFT identifier.
   * @param nftMetadata - NFT optional information (name, image and description).
   * @param nftContract - An object containing contract data of the NFT being added.
   * @param detection - The chain ID and address of the currently selected network and account at the moment the NFT was detected.
   * @returns Promise resolving to the current NFT list.
   */
  private async addIndividualNft(
    address: string,
    tokenId: string,
    nftMetadata: NftMetadata,
    nftContract: NftContract,
    detection?: AccountParams,
  ): Promise<Nft[]> {
    // TODO: Remove unused return
    const releaseLock = await this.mutex.acquire();
    try {
      address = toChecksumHexAddress(address);
      const { allNfts } = this.state;
      let chainId, selectedAddress;

      if (detection) {
        chainId = detection.chainId;
        selectedAddress = detection.userAddress;
      } else {
        chainId = this.config.chainId;
        selectedAddress = this.config.selectedAddress;
      }

      const nfts = allNfts[selectedAddress]?.[chainId] || [];

      const existingEntry: Nft | undefined = nfts.find(
        (nft) =>
          nft.address.toLowerCase() === address.toLowerCase() &&
          nft.tokenId === tokenId,
      );

      if (existingEntry) {
        const differentMetadata = compareNftMetadata(
          nftMetadata,
          existingEntry,
        );
        if (differentMetadata) {
          // TODO: Switch to indexToUpdate
          const indexToRemove = nfts.findIndex(
            (nft) =>
              nft.address.toLowerCase() === address.toLowerCase() &&
              nft.tokenId === tokenId,
          );
          /* istanbul ignore next */
          if (indexToRemove !== -1) {
            nfts.splice(indexToRemove, 1);
          }
        } else {
          return nfts;
        }
      }

      const newEntry: Nft = {
        address,
        tokenId,
        favorite: existingEntry?.favorite || false,
        isCurrentlyOwned: true,
        ...nftMetadata,
      };

      const newNfts = [...nfts, newEntry];
      this.updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY, {
        chainId,
        userAddress: selectedAddress,
      });

      if (this.onNftAdded) {
        this.onNftAdded({
          address,
          symbol: nftContract.symbol,
          tokenId: tokenId.toString(),
          standard: nftMetadata.standard,
          source: detection ? 'detected' : 'custom',
        });
      }

      return newNfts;
    } finally {
      releaseLock();
    }
  }

  /**
   * Adds an NFT contract to the stored NFT contracts list.
   *
   * @param address - Hex address of the NFT contract.
   * @param detection - The chain ID and address of the currently selected network and account at the moment the NFT was detected.
   * @returns Promise resolving to the current NFT contracts list.
   */
  private async addNftContract(
    address: string,
    detection?: AccountParams,
  ): Promise<NftContract[]> {
    const releaseLock = await this.mutex.acquire();
    try {
      address = toChecksumHexAddress(address);
      const { allNftContracts } = this.state;

      let chainId, selectedAddress;
      if (detection) {
        chainId = detection.chainId;
        selectedAddress = detection.userAddress;
      } else {
        chainId = this.config.chainId;
        selectedAddress = this.config.selectedAddress;
      }

      const nftContracts = allNftContracts[selectedAddress]?.[chainId] || [];

      const existingEntry = nftContracts.find(
        (nftContract) =>
          nftContract.address.toLowerCase() === address.toLowerCase(),
      );
      if (existingEntry) {
        return nftContracts;
      }
      const contractInformation = await this.getNftContractInformation(address);

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
        return nftContracts;
      }

      /* istanbul ignore next */
      const newEntry: NftContract = Object.assign(
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
      const newNftContracts = [...nftContracts, newEntry];
      this.updateNestedNftState(newNftContracts, ALL_NFTS_CONTRACTS_STATE_KEY, {
        chainId,
        userAddress: selectedAddress,
      });

      return newNftContracts;
    } finally {
      releaseLock();
    }
  }

  /**
   * Removes an individual NFT from the stored token list and saves it in ignored NFTs list.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - Token identifier of the NFT.
   */
  private removeAndIgnoreIndividualNft(address: string, tokenId: string) {
    address = toChecksumHexAddress(address);
    const { allNfts, ignoredNfts } = this.state;
    const { chainId, selectedAddress } = this.config;
    const newIgnoredNfts = [...ignoredNfts];
    const nfts = allNfts[selectedAddress]?.[chainId] || [];
    const newNfts = nfts.filter((nft) => {
      if (
        nft.address.toLowerCase() === address.toLowerCase() &&
        nft.tokenId === tokenId
      ) {
        const alreadyIgnored = newIgnoredNfts.find(
          (c) => c.address === address && c.tokenId === tokenId,
        );
        !alreadyIgnored && newIgnoredNfts.push(nft);
        return false;
      }
      return true;
    });

    this.updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY);

    this.update({
      ignoredNfts: newIgnoredNfts,
    });
  }

  /**
   * Removes an individual NFT from the stored token list.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - Token identifier of the NFT.
   */
  private removeIndividualNft(address: string, tokenId: string) {
    address = toChecksumHexAddress(address);
    const { allNfts } = this.state;
    const { chainId, selectedAddress } = this.config;
    const nfts = allNfts[selectedAddress]?.[chainId] || [];
    const newNfts = nfts.filter(
      (nft) =>
        !(
          nft.address.toLowerCase() === address.toLowerCase() &&
          nft.tokenId === tokenId
        ),
    );
    this.updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY);
  }

  /**
   * Removes an NFT contract to the stored NFT contracts list.
   *
   * @param address - Hex address of the NFT contract.
   * @returns Promise resolving to the current NFT contracts list.
   */
  private removeNftContract(address: string): NftContract[] {
    address = toChecksumHexAddress(address);
    const { allNftContracts } = this.state;
    const { chainId, selectedAddress } = this.config;
    const nftContracts = allNftContracts[selectedAddress]?.[chainId] || [];

    const newNftContracts = nftContracts.filter(
      (nftContract) =>
        !(nftContract.address.toLowerCase() === address.toLowerCase()),
    );
    this.updateNestedNftState(newNftContracts, ALL_NFTS_CONTRACTS_STATE_KEY);

    return newNftContracts;
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
  override name = 'NftController';

  private getERC721AssetName: AssetsContractController['getERC721AssetName'];

  private getERC721AssetSymbol: AssetsContractController['getERC721AssetSymbol'];

  private getERC721TokenURI: AssetsContractController['getERC721TokenURI'];

  private getERC721OwnerOf: AssetsContractController['getERC721OwnerOf'];

  private getERC1155BalanceOf: AssetsContractController['getERC1155BalanceOf'];

  private getERC1155TokenURI: AssetsContractController['getERC1155TokenURI'];

  private onNftAdded?: (data: {
    address: string;
    symbol: string | undefined;
    tokenId: string;
    standard: string | null;
    source: string;
  }) => void;

  /**
   * Creates an NftController instance.
   *
   * @param options - The controller options.
   * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
   * @param options.getERC721AssetName - Gets the name of the asset at the given address.
   * @param options.getERC721AssetSymbol - Gets the symbol of the asset at the given address.
   * @param options.getERC721TokenURI - Gets the URI of the ERC721 token at the given address, with the given ID.
   * @param options.getERC721OwnerOf - Get the owner of a ERC-721 NFT.
   * @param options.getERC1155BalanceOf - Gets balance of a ERC-1155 NFT.
   * @param options.getERC1155TokenURI - Gets the URI of the ERC1155 token at the given address, with the given ID.
   * @param options.onNftAdded - Callback that is called when an NFT is added. Currently used pass data
   * for tracking the NFT added event.
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
      onNftAdded,
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
      onNftAdded?: (data: {
        address: string;
        symbol: string | undefined;
        tokenId: string;
        standard: string | null;
        source: string;
      }) => void;
    },
    config?: Partial<BaseConfig>,
    state?: Partial<NftState>,
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
      allNftContracts: {},
      allNfts: {},
      ignoredNfts: [],
    };
    this.initialize();
    this.getERC721AssetName = getERC721AssetName;
    this.getERC721AssetSymbol = getERC721AssetSymbol;
    this.getERC721TokenURI = getERC721TokenURI;
    this.getERC721OwnerOf = getERC721OwnerOf;
    this.getERC1155BalanceOf = getERC1155BalanceOf;
    this.getERC1155TokenURI = getERC1155TokenURI;
    this.onNftAdded = onNftAdded;

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
   * Sets an OpenSea API key to retrieve NFT information.
   *
   * @param openSeaApiKey - OpenSea API key.
   */
  setApiKey(openSeaApiKey: string) {
    this.openSeaApiKey = openSeaApiKey;
  }

  /**
   * Checks the ownership of a ERC-721 or ERC-1155 NFT for a given address.
   *
   * @param ownerAddress - User public address.
   * @param nftAddress - NFT contract address.
   * @param nftId - NFT token ID.
   * @returns Promise resolving the NFT ownership.
   */
  async isNftOwner(
    ownerAddress: string,
    nftAddress: string,
    nftId: string,
  ): Promise<boolean> {
    // Checks the ownership for ERC-721.
    try {
      const owner = await this.getERC721OwnerOf(nftAddress, nftId);
      return ownerAddress.toLowerCase() === owner.toLowerCase();
      // eslint-disable-next-line no-empty
    } catch {
      // Ignore ERC-721 contract error
    }

    // Checks the ownership for ERC-1155.
    try {
      const balance = await this.getERC1155BalanceOf(
        ownerAddress,
        nftAddress,
        nftId,
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
   * Verifies currently selected address owns entered NFT address/tokenId combo and
   * adds the NFT and respective NFT contract to the stored NFT and NFT contracts lists.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - The NFT identifier.
   */
  async addNftVerifyOwnership(address: string, tokenId: string) {
    const { selectedAddress } = this.config;
    if (!(await this.isNftOwner(selectedAddress, address, tokenId))) {
      throw new Error('This NFT is not owned by the user');
    }
    await this.addNft(address, tokenId);
  }

  /**
   * Adds an NFT and respective NFT contract to the stored NFT and NFT contracts lists.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - The NFT identifier.
   * @param nftMetadata - NFT optional metadata.
   * @param detection - The chain ID and address of the currently selected network and account at the moment the NFT was detected.
   * @returns Promise resolving to the current NFT list.
   */
  async addNft(
    address: string,
    tokenId: string,
    nftMetadata?: NftMetadata,
    detection?: AccountParams,
  ) {
    address = toChecksumHexAddress(address);
    const newNftContracts = await this.addNftContract(address, detection);
    nftMetadata =
      nftMetadata || (await this.getNftInformation(address, tokenId));

    // If NFT contract was not added, do not add individual NFT
    const nftContract = newNftContracts.find(
      (contract) => contract.address.toLowerCase() === address.toLowerCase(),
    );

    // If NFT contract information, add individual NFT
    if (nftContract) {
      await this.addIndividualNft(
        address,
        tokenId,
        nftMetadata,
        nftContract,
        detection,
      );
    }
  }

  /**
   * Removes an NFT from the stored token list.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - Token identifier of the NFT.
   */
  removeNft(address: string, tokenId: string) {
    address = toChecksumHexAddress(address);
    this.removeIndividualNft(address, tokenId);
    const { allNfts } = this.state;
    const { chainId, selectedAddress } = this.config;
    const nfts = allNfts[selectedAddress]?.[chainId] || [];
    const remainingNft = nfts.find(
      (nft) => nft.address.toLowerCase() === address.toLowerCase(),
    );
    if (!remainingNft) {
      this.removeNftContract(address);
    }
  }

  /**
   * Removes an NFT from the stored token list and saves it in ignored NFTs list.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - Token identifier of the NFT.
   */
  removeAndIgnoreNft(address: string, tokenId: string) {
    address = toChecksumHexAddress(address);
    this.removeAndIgnoreIndividualNft(address, tokenId);
    const { allNfts } = this.state;
    const { chainId, selectedAddress } = this.config;
    const nfts = allNfts[selectedAddress]?.[chainId] || [];
    const remainingNft = nfts.find(
      (nft) => nft.address.toLowerCase() === address.toLowerCase(),
    );
    if (!remainingNft) {
      this.removeNftContract(address);
    }
  }

  /**
   * Removes all NFTs from the ignored list.
   */
  clearIgnoredNfts() {
    this.update({ ignoredNfts: [] });
  }

  /**
   * Checks whether input NFT is still owned by the user
   * And updates the isCurrentlyOwned value on the NFT object accordingly.
   *
   * @param nft - The NFT object to check and update.
   * @param batch - A boolean indicating whether this method is being called as part of a batch or single update.
   * @param accountParams - The userAddress and chainId to check ownership against
   * @param accountParams.userAddress - the address passed through the confirmed transaction flow to ensure detected assets are stored to the correct account
   * @param accountParams.chainId - the chainId passed through the confirmed transaction flow to ensure detected assets are stored to the correct account
   * @returns the NFT with the updated isCurrentlyOwned value
   */
  async checkAndUpdateSingleNftOwnershipStatus(
    nft: Nft,
    batch: boolean,
    { userAddress, chainId }: AccountParams | undefined = {
      userAddress: this.config.selectedAddress,
      chainId: this.config.chainId,
    },
  ) {
    const { address, tokenId } = nft;
    let isOwned = nft.isCurrentlyOwned;
    try {
      isOwned = await this.isNftOwner(userAddress, address, tokenId);
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

    nft.isCurrentlyOwned = isOwned;

    if (batch === true) {
      return nft;
    }

    // if this is not part of a batched update we update this one NFT in state
    const { allNfts } = this.state;
    const nfts = allNfts[userAddress]?.[chainId] || [];
    const nftToUpdate = nfts.find(
      (item) =>
        item.tokenId === tokenId &&
        item.address.toLowerCase() === address.toLowerCase(),
    );
    if (nftToUpdate) {
      nftToUpdate.isCurrentlyOwned = isOwned;
      this.updateNestedNftState(nfts, ALL_NFTS_STATE_KEY, {
        userAddress,
        chainId,
      });
    }
    return nft;
  }

  /**
   * Checks whether NFTs associated with current selectedAddress/chainId combination are still owned by the user
   * And updates the isCurrentlyOwned value on each accordingly.
   */
  async checkAndUpdateAllNftsOwnershipStatus() {
    const { allNfts } = this.state;
    const { chainId, selectedAddress } = this.config;
    const nfts = allNfts[selectedAddress]?.[chainId] || [];
    const updatedNfts = await Promise.all(
      nfts.map(async (nft) => {
        return (
          (await this.checkAndUpdateSingleNftOwnershipStatus(nft, true)) ?? nft
        );
      }),
    );

    this.updateNestedNftState(updatedNfts, ALL_NFTS_STATE_KEY);
  }

  /**
   * Update NFT favorite status.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - Hex address of the NFT contract.
   * @param favorite - NFT new favorite status.
   */
  updateNftFavoriteStatus(address: string, tokenId: string, favorite: boolean) {
    const { allNfts } = this.state;
    const { chainId, selectedAddress } = this.config;
    const nfts = allNfts[selectedAddress]?.[chainId] || [];
    const index: number = nfts.findIndex(
      (nft) => nft.address === address && nft.tokenId === tokenId,
    );

    if (index === -1) {
      return;
    }

    const updatedNft: Nft = {
      ...nfts[index],
      favorite,
    };

    // Update Nfts array
    nfts[index] = updatedNft;

    this.updateNestedNftState(nfts, ALL_NFTS_STATE_KEY);
  }

  /**
   * Returns an NFT by the address and token id.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - Number that represents the id of the token.
   * @param selectedAddress - Hex address of the user account.
   * @param chainId - Id of the current network.
   * @returns Object containing the NFT and its position in the array
   */
  findNftByAddressAndTokenId(
    address: string,
    tokenId: string,
    selectedAddress: string,
    chainId: string,
  ): { nft: Nft; index: number } | null {
    const { allNfts } = this.state;
    const nfts = allNfts[selectedAddress]?.[chainId] || [];

    const index: number = nfts.findIndex(
      (nft) =>
        nft.address.toLowerCase() === address.toLowerCase() &&
        nft.tokenId === tokenId,
    );

    if (index === -1) {
      return null;
    }

    return { nft: nfts[index], index };
  }

  /**
   * Update NFT data.
   *
   * @param nft - NFT object to find the right NFT to updates.
   * @param updates - NFT partial object to update properties of the NFT.
   * @param selectedAddress - Hex address of the user account.
   * @param chainId - Id of the current network.
   */
  updateNft(
    nft: Nft,
    updates: Partial<Nft>,
    selectedAddress: string,
    chainId: string,
  ) {
    const { allNfts } = this.state;
    const nfts = allNfts[selectedAddress]?.[chainId] || [];
    const nftInfo = this.findNftByAddressAndTokenId(
      nft.address,
      nft.tokenId,
      selectedAddress,
      chainId,
    );

    if (!nftInfo) {
      return;
    }

    const updatedNft: Nft = {
      ...nft,
      ...updates,
    };

    const newNfts = [
      ...nfts.slice(0, nftInfo.index),
      updatedNft,
      ...nfts.slice(nftInfo.index + 1),
    ];

    this.updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY);
  }

  /**
   * Resets the transaction status of an NFT.
   *
   * @param transactionId - NFT transaction id.
   * @param selectedAddress - Hex address of the user account.
   * @param chainId - Id of the current network.
   * @returns a boolean indicating if the reset was well succeded or not
   */
  resetNftTransactionStatusByTransactionId(
    transactionId: string,
    selectedAddress: string,
    chainId: string,
  ): boolean {
    const { allNfts } = this.state;
    const nfts = allNfts[selectedAddress]?.[chainId] || [];
    const index: number = nfts.findIndex(
      (nft) => nft.transactionId === transactionId,
    );

    if (index === -1) {
      return false;
    }
    const updatedNft: Nft = {
      ...nfts[index],
      transactionId: undefined,
    };

    const newNfts = [
      ...nfts.slice(0, index),
      updatedNft,
      ...nfts.slice(index + 1),
    ];

    this.updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY);
    return true;
  }
}

export default NftController;
