import { isAddress } from '@ethersproject/address';
import type { AddApprovalRequest } from '@metamask/approval-controller';
import type {
  BaseConfig,
  BaseState,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseControllerV1 } from '@metamask/base-controller';
import {
  safelyExecute,
  handleFetch,
  toChecksumHexAddress,
  BNToHex,
  fetchWithErrorHandling,
  IPFS_DEFAULT_GATEWAY_URL,
  ERC721,
  ERC1155,
  OPENSEA_PROXY_URL,
  ApprovalType,
} from '@metamask/controller-utils';
import type {
  NetworkClientId,
  NetworkController,
  NetworkState,
} from '@metamask/network-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';
import { remove0x } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import BN from 'bn.js';
import { EventEmitter } from 'events';
import { v4 as random } from 'uuid';

import type { AssetsContractController } from './AssetsContractController';
import {
  compareNftMetadata,
  getFormattedIpfsUrl,
  mapOpenSeaContractV2ToV1,
  mapOpenSeaDetailedNftV2ToV1,
} from './assetsUtil';
import { Source } from './constants';
import type {
  ApiNftCreator,
  ApiNftContract,
  ApiNftLastSale,
} from './NftDetectionController';

type NFTStandardType = 'ERC721' | 'ERC1155';

type SuggestedNftMeta = {
  asset: { address: string; tokenId: string } & NftMetadata;
  id: string;
  time: number;
  type: NFTStandardType;
  interactingAddress: string;
  origin: string;
};

export enum OpenSeaV2ChainIds {
  ethereum = 'ethereum',
}

export type OpenSeaV2GetNftResponse = { nft: OpenSeaV2DetailedNft };

export type OpenSeaV2Nft = {
  identifier: string;
  collection: string;
  contract: string;
  token_standard: string;
  name: string;
  description: string;
  image_url?: string;
  metadata_url?: string;
  updated_at: string;
  is_disabled: boolean;
  is_nsfw: boolean;
};

export type OpenSeaV2DetailedNft = OpenSeaV2Nft & {
  animation_url?: string;
  is_suspicious: boolean;
  creator: string;
  traits: {
    trait_type: string;
    display_type?: string;
    max_value: string;
    trait_count?: number;
    value: number | string;
  }[];
  owners: {
    address: string;
    quantity: number;
  }[];
  rarity: { rank: number };
};

export type OpenSeaV2ListNftsResponse = {
  nfts: OpenSeaV2Nft[];
  next?: string;
};

export type OpenSeaV2Contract = {
  address: string;
  chain: string;
  collection: string;
  contract_standard: string;
  name: string;
  total_supply?: number;
};

export type OpenSeaV2Collection = {
  collection: string;
  name: string;
  description?: string;
  image_url?: string;
  owner: string;
  category: string;
  is_disabled: boolean;
  is_nsfw: boolean;
  trait_offers_enabled: boolean;
  opensea_url: string;
  project_url?: string;
  wiki_url?: string;
  discord_url?: string;
  telegram_url?: string;
  twitter_username?: string;
  instagram_username?: string;
  total_supply?: number;
};

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
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
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
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
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
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
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
  tokenURI?: string | null;
}

/**
 * @type NftConfig
 *
 * NFT controller configuration
 * @property selectedAddress - Vault selected address
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface NftConfig extends BaseConfig {
  selectedAddress: string;
  chainId: Hex;
  ipfsGateway: string;
  openSeaEnabled: boolean;
  useIPFSSubdomains: boolean;
  isIpfsGatewayEnabled: boolean;
}

/**
 * @type NftState
 *
 * NFT controller state
 * @property allNftContracts - Object containing NFT contract information
 * @property allNfts - Object containing NFTs per account and network
 * @property ignoredNfts - List of NFTs that should be ignored
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface NftState extends BaseState {
  allNftContracts: {
    [key: string]: { [chainId: Hex]: NftContract[] };
  };
  allNfts: { [key: string]: { [chainId: Hex]: Nft[] } };
  ignoredNfts: Nft[];
}

const ALL_NFTS_STATE_KEY = 'allNfts';
const ALL_NFTS_CONTRACTS_STATE_KEY = 'allNftContracts';

// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface NftAsset {
  address: string;
  tokenId: string;
}

/**
 * The name of the {@link NftController}.
 */
const controllerName = 'NftController';

/**
 * The external actions available to the {@link NftController}.
 */
type AllowedActions = AddApprovalRequest;

/**
 * The messenger of the {@link NftController}.
 */
export type NftControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  AllowedActions,
  never,
  AllowedActions['type'],
  never
>;

export const getDefaultNftState = (): NftState => {
  return {
    allNftContracts: {},
    allNfts: {},
    ignoredNfts: [],
  };
};

/**
 * Controller that stores assets and exposes convenience methods
 */
export class NftController extends BaseControllerV1<NftConfig, NftState> {
  private readonly mutex = new Mutex();

  private readonly messagingSystem: NftControllerMessenger;

  getNftApi({
    contractAddress,
    tokenId,
  }: {
    contractAddress: string;
    tokenId: string;
  }) {
    return `${OPENSEA_PROXY_URL}/chain/${OpenSeaV2ChainIds.ethereum}/contract/${contractAddress}/nfts/${tokenId}`;
  }

  private getNftContractInformationApi({
    contractAddress,
  }: {
    contractAddress: string;
  }) {
    return `${OPENSEA_PROXY_URL}/chain/${OpenSeaV2ChainIds.ethereum}/contract/${contractAddress}`;
  }

  private getNftCollectionInformationApi({
    collectionSlug,
  }: {
    collectionSlug: string;
  }) {
    return `${OPENSEA_PROXY_URL}/collections/${collectionSlug}`;
  }

  /**
   * Helper method to update nested state for allNfts and allNftContracts.
   *
   * @param newCollection - the modified piece of state to update in the controller's store
   * @param baseStateKey - The root key in the store to update.
   * @param passedConfig - An object containing the selectedAddress and chainId that are passed through the auto-detection flow.
   * @param passedConfig.userAddress - the address passed through the NFT detection flow to ensure assets are stored to the correct account
   * @param passedConfig.chainId - the chainId passed through the NFT detection flow to ensure assets are stored to the correct account
   */
  private updateNestedNftState(
    newCollection: Nft[] | NftContract[],
    baseStateKey: 'allNfts' | 'allNftContracts',
    { userAddress, chainId }: { userAddress: string; chainId: Hex },
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
    // TODO Parameterize this by chainId for non-mainnet token detection
    // Attempt to fetch the data with the proxy
    const nftInformation: OpenSeaV2GetNftResponse | undefined =
      await fetchWithErrorHandling({
        url: this.getNftApi({
          contractAddress,
          tokenId,
        }),
      });

    // if we were still unable to fetch the data we return out the default/null of `NftMetadata`
    if (!nftInformation?.nft) {
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
    } = mapOpenSeaDetailedNftV2ToV1(nftInformation.nft);

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
   * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @returns Promise resolving to the current NFT name and image.
   */
  private async getNftInformationFromTokenURI(
    contractAddress: string,
    tokenId: string,
    networkClientId?: NetworkClientId,
  ): Promise<NftMetadata> {
    const { ipfsGateway, useIPFSSubdomains, isIpfsGatewayEnabled } =
      this.config;
    const result = await this.getNftURIAndStandard(
      contractAddress,
      tokenId,
      networkClientId,
    );
    let tokenURI = result[0];
    const standard = result[1];

    const hasIpfsTokenURI = tokenURI.startsWith('ipfs://');

    if (hasIpfsTokenURI && !isIpfsGatewayEnabled) {
      return {
        image: null,
        name: null,
        description: null,
        standard: standard || null,
        favorite: false,
        tokenURI: tokenURI ?? null,
      };
    }

    const isDisplayNFTMediaToggleEnabled = this.config.openSeaEnabled;
    if (!hasIpfsTokenURI && !isDisplayNFTMediaToggleEnabled) {
      return {
        image: null,
        name: null,
        description: null,
        standard: standard || null,
        favorite: false,
        tokenURI: tokenURI ?? null,
      };
    }

    if (hasIpfsTokenURI) {
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
        tokenURI: tokenURI ?? null,
      };
    } catch {
      return {
        image: null,
        name: null,
        description: null,
        standard: standard || null,
        favorite: false,
        tokenURI: tokenURI ?? null,
      };
    }
  }

  /**
   * Retrieve NFT uri with  metadata. TODO Update method to use IPFS.
   *
   * @param contractAddress - NFT contract address.
   * @param tokenId - NFT token id.
   * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @returns Promise resolving NFT uri and token standard.
   */
  private async getNftURIAndStandard(
    contractAddress: string,
    tokenId: string,
    networkClientId?: NetworkClientId,
  ): Promise<[string, string]> {
    // try ERC721 uri
    try {
      const uri = await this.getERC721TokenURI(
        contractAddress,
        tokenId,
        networkClientId,
      );
      return [uri, ERC721];
    } catch {
      // Ignore error
    }

    // try ERC1155 uri
    try {
      const tokenURI = await this.getERC1155TokenURI(
        contractAddress,
        tokenId,
        networkClientId,
      );

      /**
       * According to EIP1155 the URI value allows for ID substitution
       * in case the string `{id}` exists.
       * https://eips.ethereum.org/EIPS/eip-1155#metadata
       */

      if (!tokenURI.includes('{id}')) {
        return [tokenURI, ERC1155];
      }

      const hexTokenId = remove0x(BNToHex(new BN(tokenId)))
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
   * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @returns Promise resolving to the current NFT name and image.
   */
  private async getNftInformation(
    contractAddress: string,
    tokenId: string,
    networkClientId?: NetworkClientId,
  ): Promise<NftMetadata> {
    const chainId = this.getCorrectChainId({
      networkClientId,
    });

    const [blockchainMetadata, openSeaMetadata] = await Promise.all([
      safelyExecute(() =>
        this.getNftInformationFromTokenURI(
          contractAddress,
          tokenId,
          networkClientId,
        ),
      ),
      this.config.openSeaEnabled && chainId === '0x1'
        ? safelyExecute(() =>
            this.getNftInformationFromApi(contractAddress, tokenId),
          )
        : undefined,
    ]);

    return {
      ...openSeaMetadata,
      name: blockchainMetadata?.name ?? openSeaMetadata?.name ?? null,
      description:
        blockchainMetadata?.description ?? openSeaMetadata?.description ?? null,
      image: blockchainMetadata?.image ?? openSeaMetadata?.image ?? null,
      standard:
        blockchainMetadata?.standard ?? openSeaMetadata?.standard ?? null,
      tokenURI: blockchainMetadata?.tokenURI ?? null,
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
    const apiNftContractObject: OpenSeaV2Contract | undefined =
      await fetchWithErrorHandling({
        url: this.getNftContractInformationApi({
          contractAddress,
        }),
      });

    // If we successfully fetched the contract
    if (apiNftContractObject) {
      // Then fetch some additional details from the collection
      const collection: OpenSeaV2Collection | undefined =
        await fetchWithErrorHandling({
          url: this.getNftCollectionInformationApi({
            collectionSlug: apiNftContractObject.collection,
          }),
        });

      return mapOpenSeaContractV2ToV1(apiNftContractObject, collection);
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
   * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @returns Promise resolving to the current NFT name and image.
   */
  private async getNftContractInformationFromContract(
    contractAddress: string,
    networkClientId?: NetworkClientId,
  ): Promise<
    Partial<ApiNftContract> &
      Pick<ApiNftContract, 'address'> &
      Pick<ApiNftContract, 'collection'>
  > {
    const [name, symbol] = await Promise.all([
      this.getERC721AssetName(contractAddress, networkClientId),
      this.getERC721AssetSymbol(contractAddress, networkClientId),
    ]);

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
   * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @returns Promise resolving to the NFT contract name, image and description.
   */
  private async getNftContractInformation(
    contractAddress: string,
    networkClientId?: NetworkClientId,
  ): Promise<
    Partial<ApiNftContract> &
      Pick<ApiNftContract, 'address'> &
      Pick<ApiNftContract, 'collection'>
  > {
    const chainId = this.getCorrectChainId({
      networkClientId,
    });

    const [blockchainContractData, openSeaContractData] = await Promise.all([
      safelyExecute(() =>
        this.getNftContractInformationFromContract(
          contractAddress,
          networkClientId,
        ),
      ),
      this.config.openSeaEnabled && chainId === '0x1'
        ? safelyExecute(() =>
            this.getNftContractInformationFromApi(contractAddress),
          )
        : undefined,
    ]);

    if (blockchainContractData || openSeaContractData) {
      return {
        address: contractAddress,
        ...openSeaContractData,
        ...blockchainContractData,
        collection: {
          name: null,
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
   * @param tokenAddress - Hex address of the NFT contract.
   * @param tokenId - The NFT identifier.
   * @param nftMetadata - NFT optional information (name, image and description).
   * @param nftContract - An object containing contract data of the NFT being added.
   * @param chainId - The chainId of the network where the NFT is being added.
   * @param userAddress - The address of the account where the NFT is being added.
   * @param source - Whether the NFT was detected, added manually or suggested by a dapp.
   * @returns Promise resolving to the current NFT list.
   */
  private async addIndividualNft(
    tokenAddress: string,
    tokenId: string,
    nftMetadata: NftMetadata,
    nftContract: NftContract,
    chainId: Hex,
    userAddress: string,
    source: Source,
  ): Promise<Nft[]> {
    // TODO: Remove unused return
    const releaseLock = await this.mutex.acquire();
    try {
      tokenAddress = toChecksumHexAddress(tokenAddress);
      const { allNfts } = this.state;

      const nfts = allNfts[userAddress]?.[chainId] || [];

      const existingEntry: Nft | undefined = nfts.find(
        (nft) =>
          nft.address.toLowerCase() === tokenAddress.toLowerCase() &&
          nft.tokenId === tokenId,
      );

      if (existingEntry) {
        const differentMetadata = compareNftMetadata(
          nftMetadata,
          existingEntry,
        );
        if (differentMetadata || !existingEntry.isCurrentlyOwned) {
          // TODO: Switch to indexToUpdate
          const indexToRemove = nfts.findIndex(
            (nft) =>
              nft.address.toLowerCase() === tokenAddress.toLowerCase() &&
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
        address: tokenAddress,
        tokenId,
        favorite: existingEntry?.favorite || false,
        isCurrentlyOwned: true,
        ...nftMetadata,
      };

      const newNfts = [...nfts, newEntry];
      this.updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY, {
        chainId,
        userAddress,
      });

      if (this.onNftAdded) {
        this.onNftAdded({
          address: tokenAddress,
          symbol: nftContract.symbol,
          tokenId: tokenId.toString(),
          standard: nftMetadata.standard,
          source,
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
   * @param options - options.
   * @param options.tokenAddress - Hex address of the NFT contract.
   * @param options.userAddress - The address of the account where the NFT is being added.
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options.source - Whether the NFT was detected, added manually or suggested by a dapp.
   * @returns Promise resolving to the current NFT contracts list.
   */
  private async addNftContract({
    tokenAddress,
    userAddress,
    networkClientId,
    source,
  }: {
    tokenAddress: string;
    userAddress: string;
    networkClientId?: NetworkClientId;
    source?: Source;
  }): Promise<NftContract[]> {
    const releaseLock = await this.mutex.acquire();
    try {
      tokenAddress = toChecksumHexAddress(tokenAddress);
      const { allNftContracts } = this.state;
      const chainId = this.getCorrectChainId({
        networkClientId,
      });

      const nftContracts = allNftContracts[userAddress]?.[chainId] || [];

      const existingEntry = nftContracts.find(
        (nftContract) =>
          nftContract.address.toLowerCase() === tokenAddress.toLowerCase(),
      );
      if (existingEntry) {
        return nftContracts;
      }

      // this doesn't work currently for detection if the user switches networks while the detection is processing
      // will be fixed once detection uses networkClientIds
      const contractInformation = await this.getNftContractInformation(
        tokenAddress,
        networkClientId,
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

      // If the nft is auto-detected we want some valid metadata to be present
      if (
        source === Source.Detected &&
        'address' in contractInformation &&
        typeof contractInformation.address === 'string' &&
        'collection' in contractInformation &&
        contractInformation.collection.name === null &&
        'image_url' in contractInformation.collection &&
        contractInformation.collection.image_url === null &&
        Object.entries(contractInformation).every(([key, value]) => {
          return key === 'address' || key === 'collection' || !value;
        })
      ) {
        return nftContracts;
      }

      /* istanbul ignore next */
      const newEntry: NftContract = Object.assign(
        {},
        { address: tokenAddress },
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
        userAddress,
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
   * @param options - options.
   * @param options.chainId - The chainId of the network where the NFT is being removed.
   * @param options.userAddress - The address of the account where the NFT is being removed.
   */
  private removeAndIgnoreIndividualNft(
    address: string,
    tokenId: string,
    {
      chainId,
      userAddress,
    }: {
      chainId: Hex;
      userAddress: string;
    },
  ) {
    address = toChecksumHexAddress(address);
    const { allNfts, ignoredNfts } = this.state;
    const newIgnoredNfts = [...ignoredNfts];
    const nfts = allNfts[userAddress]?.[chainId] || [];
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

    this.updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY, {
      userAddress,
      chainId,
    });

    this.update({
      ignoredNfts: newIgnoredNfts,
    });
  }

  /**
   * Removes an individual NFT from the stored token list.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - Token identifier of the NFT.
   * @param options - options.
   * @param options.chainId - The chainId of the network where the NFT is being removed.
   * @param options.userAddress - The address of the account where the NFT is being removed.
   */
  private removeIndividualNft(
    address: string,
    tokenId: string,
    { chainId, userAddress }: { chainId: Hex; userAddress: string },
  ) {
    address = toChecksumHexAddress(address);
    const { allNfts } = this.state;
    const nfts = allNfts[userAddress]?.[chainId] || [];
    const newNfts = nfts.filter(
      (nft) =>
        !(
          nft.address.toLowerCase() === address.toLowerCase() &&
          nft.tokenId === tokenId
        ),
    );
    this.updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY, {
      userAddress,
      chainId,
    });
  }

  /**
   * Removes an NFT contract to the stored NFT contracts list.
   *
   * @param address - Hex address of the NFT contract.
   * @param options - options.
   * @param options.chainId - The chainId of the network where the NFT is being removed.
   * @param options.userAddress - The address of the account where the NFT is being removed.
   * @returns Promise resolving to the current NFT contracts list.
   */
  private removeNftContract(
    address: string,
    { chainId, userAddress }: { chainId: Hex; userAddress: string },
  ): NftContract[] {
    address = toChecksumHexAddress(address);
    const { allNftContracts } = this.state;
    const nftContracts = allNftContracts[userAddress]?.[chainId] || [];

    const newNftContracts = nftContracts.filter(
      (nftContract) =>
        !(nftContract.address.toLowerCase() === address.toLowerCase()),
    );
    this.updateNestedNftState(newNftContracts, ALL_NFTS_CONTRACTS_STATE_KEY, {
      chainId,
      userAddress,
    });

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

  private readonly getERC721AssetName: AssetsContractController['getERC721AssetName'];

  private readonly getERC721AssetSymbol: AssetsContractController['getERC721AssetSymbol'];

  private readonly getERC721TokenURI: AssetsContractController['getERC721TokenURI'];

  private readonly getERC721OwnerOf: AssetsContractController['getERC721OwnerOf'];

  private readonly getERC1155BalanceOf: AssetsContractController['getERC1155BalanceOf'];

  private readonly getERC1155TokenURI: AssetsContractController['getERC1155TokenURI'];

  private readonly getNetworkClientById: NetworkController['getNetworkClientById'];

  private readonly onNftAdded?: (data: {
    address: string;
    symbol: string | undefined;
    tokenId: string;
    standard: string | null;
    source: Source;
  }) => void;

  /**
   * Creates an NftController instance.
   *
   * @param options - The controller options.
   * @param options.chainId - The chain ID of the current network.
   * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
   * @param options.getERC721AssetName - Gets the name of the asset at the given address.
   * @param options.getERC721AssetSymbol - Gets the symbol of the asset at the given address.
   * @param options.getERC721TokenURI - Gets the URI of the ERC721 token at the given address, with the given ID.
   * @param options.getERC721OwnerOf - Get the owner of a ERC-721 NFT.
   * @param options.getERC1155BalanceOf - Gets balance of a ERC-1155 NFT.
   * @param options.getERC1155TokenURI - Gets the URI of the ERC1155 token at the given address, with the given ID.
   * @param options.getNetworkClientById - Gets the network client for the given networkClientId.
   * @param options.onNftAdded - Callback that is called when an NFT is added. Currently used pass data
   * for tracking the NFT added event.
   * @param options.messenger - The controller messenger.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      chainId: initialChainId,
      onPreferencesStateChange,
      onNetworkStateChange,
      getERC721AssetName,
      getERC721AssetSymbol,
      getERC721TokenURI,
      getERC721OwnerOf,
      getERC1155BalanceOf,
      getERC1155TokenURI,
      getNetworkClientById,
      onNftAdded,
      messenger,
    }: {
      chainId: Hex;
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
      getNetworkClientById: NetworkController['getNetworkClientById'];
      onNftAdded?: (data: {
        address: string;
        symbol: string | undefined;
        tokenId: string;
        standard: string | null;
        source: string;
      }) => void;
      messenger: NftControllerMessenger;
    },
    config?: Partial<BaseConfig>,
    state?: Partial<NftState>,
  ) {
    super(config, state);
    this.defaultConfig = {
      selectedAddress: '',
      chainId: initialChainId,
      ipfsGateway: IPFS_DEFAULT_GATEWAY_URL,
      openSeaEnabled: false,
      useIPFSSubdomains: true,
      isIpfsGatewayEnabled: true,
    };

    this.defaultState = getDefaultNftState();
    this.initialize();
    this.getERC721AssetName = getERC721AssetName;
    this.getERC721AssetSymbol = getERC721AssetSymbol;
    this.getERC721TokenURI = getERC721TokenURI;
    this.getERC721OwnerOf = getERC721OwnerOf;
    this.getERC1155BalanceOf = getERC1155BalanceOf;
    this.getERC1155TokenURI = getERC1155TokenURI;
    this.getNetworkClientById = getNetworkClientById;
    this.onNftAdded = onNftAdded;
    this.messagingSystem = messenger;

    onPreferencesStateChange(
      ({
        selectedAddress,
        ipfsGateway,
        openSeaEnabled,
        isIpfsGatewayEnabled,
      }) => {
        this.configure({
          selectedAddress,
          ipfsGateway,
          openSeaEnabled,
          isIpfsGatewayEnabled,
        });
      },
    );

    onNetworkStateChange(({ providerConfig }) => {
      const { chainId } = providerConfig;
      this.configure({ chainId });
    });
  }

  private async validateWatchNft(
    asset: NftAsset,
    type: NFTStandardType,
    userAddress: string,
    { networkClientId }: { networkClientId?: NetworkClientId } = {},
  ) {
    const { address: contractAddress, tokenId } = asset;

    // Validate parameters
    if (!type) {
      throw rpcErrors.invalidParams('Asset type is required');
    }

    if (type !== ERC721 && type !== ERC1155) {
      throw rpcErrors.invalidParams(
        `Non NFT asset type ${type} not supported by watchNft`,
      );
    }

    if (!contractAddress || !tokenId) {
      throw rpcErrors.invalidParams('Both address and tokenId are required');
    }

    if (!isAddress(contractAddress)) {
      throw rpcErrors.invalidParams('Invalid address');
    }

    if (!/^\d+$/u.test(tokenId)) {
      throw rpcErrors.invalidParams('Invalid tokenId');
    }

    // Check if the user owns the suggested NFT
    try {
      const isOwner = await this.isNftOwner(
        userAddress,
        contractAddress,
        tokenId,
        { networkClientId },
      );
      if (!isOwner) {
        throw rpcErrors.invalidInput(
          'Suggested NFT is not owned by the selected account',
        );
      }
    } catch (error) {
      // error thrown here: "Unable to verify ownership. Possibly because the standard is not supported or the user's currently selected network does not match the chain of the asset in question."
      if (error instanceof Error) {
        throw rpcErrors.resourceUnavailable(error.message);
      }
      throw error;
    }
  }

  // temporary method to get the correct chainId until we remove chainId from the config & the chainId arg from the detection logic
  // Just a helper method to prefer the networkClient chainId first then the chainId argument and then finally the config chainId
  private getCorrectChainId({
    networkClientId,
  }: {
    networkClientId?: NetworkClientId;
  }) {
    if (networkClientId) {
      return this.getNetworkClientById(networkClientId).configuration.chainId;
    }
    return this.config.chainId;
  }

  /**
   * Adds a new suggestedAsset to state. Parameters will be validated according to
   * asset type being watched. A `<suggestedNftMeta.id>:pending` hub event will be emitted once added.
   *
   * @param asset - The asset to be watched. For now ERC721 and ERC1155 tokens are accepted.
   * @param asset.address - The address of the asset contract.
   * @param asset.tokenId - The ID of the asset.
   * @param type - The asset type.
   * @param origin - Domain origin to register the asset from.
   * @param options - Options bag.
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options.userAddress - The address of the account where the NFT is being added.
   * @returns Object containing a Promise resolving to the suggestedAsset address if accepted.
   */
  async watchNft(
    asset: NftAsset,
    type: NFTStandardType,
    origin: string,
    {
      networkClientId,
      userAddress = this.config.selectedAddress,
    }: {
      networkClientId?: NetworkClientId;
      userAddress?: string;
    } = {
      userAddress: this.config.selectedAddress,
    },
  ) {
    await this.validateWatchNft(asset, type, userAddress);

    const nftMetadata = await this.getNftInformation(
      asset.address,
      asset.tokenId,
      networkClientId,
    );

    if (nftMetadata.standard && nftMetadata.standard !== type) {
      throw rpcErrors.invalidInput(
        `Suggested NFT of type ${nftMetadata.standard} does not match received type ${type}`,
      );
    }

    const suggestedNftMeta: SuggestedNftMeta = {
      asset: { ...asset, ...nftMetadata },
      type,
      id: random(),
      time: Date.now(),
      interactingAddress: userAddress,
      origin,
    };
    await this._requestApproval(suggestedNftMeta);
    const { address, tokenId } = asset;
    const { name, standard, description, image } = nftMetadata;

    await this.addNft(address, tokenId, {
      nftMetadata: {
        name: name ?? null,
        description: description ?? null,
        image: image ?? null,
        standard: standard ?? null,
      },
      userAddress,
      source: Source.Dapp,
      networkClientId,
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
   * @param tokenId - NFT token ID.
   * @param options - Options bag.
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @returns Promise resolving the NFT ownership.
   */
  async isNftOwner(
    ownerAddress: string,
    nftAddress: string,
    tokenId: string,
    {
      networkClientId,
    }: {
      networkClientId?: NetworkClientId;
    } = {},
  ): Promise<boolean> {
    // Checks the ownership for ERC-721.
    try {
      const owner = await this.getERC721OwnerOf(
        nftAddress,
        tokenId,
        networkClientId,
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
        nftAddress,
        tokenId,
        networkClientId,
      );
      return !balance.isZero();
      // eslint-disable-next-line no-empty
    } catch {
      // Ignore ERC-1155 contract error
    }

    throw new Error(
      `Unable to verify ownership. Possibly because the standard is not supported or the user's currently selected network does not match the chain of the asset in question.`,
    );
  }

  /**
   * Verifies currently selected address owns entered NFT address/tokenId combo and
   * adds the NFT and respective NFT contract to the stored NFT and NFT contracts lists.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - The NFT identifier.
   * @param options - an object of arguments
   * @param options.userAddress - The address of the current user.
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options.source - Whether the NFT was detected, added manually or suggested by a dapp.
   */
  async addNftVerifyOwnership(
    address: string,
    tokenId: string,
    {
      userAddress = this.config.selectedAddress,
      networkClientId,
      source,
    }: {
      userAddress?: string;
      networkClientId?: NetworkClientId;
      source?: Source;
    } = {
      userAddress: this.config.selectedAddress,
    },
  ) {
    if (
      !(await this.isNftOwner(userAddress, address, tokenId, {
        networkClientId,
      }))
    ) {
      throw new Error('This NFT is not owned by the user');
    }
    await this.addNft(address, tokenId, {
      networkClientId,
      userAddress,
      source,
    });
  }

  /**
   * Adds an NFT and respective NFT contract to the stored NFT and NFT contracts lists.
   *
   * @param tokenAddress - Hex address of the NFT contract.
   * @param tokenId - The NFT identifier.
   * @param options - an object of arguments
   * @param options.nftMetadata - NFT optional metadata.
   * @param options.userAddress - The address of the current user.
   * @param options.source - Whether the NFT was detected, added manually or suggested by a dapp.
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @returns Promise resolving to the current NFT list.
   */
  async addNft(
    tokenAddress: string,
    tokenId: string,
    {
      nftMetadata,
      userAddress = this.config.selectedAddress,
      source = Source.Custom,
      networkClientId,
    }: {
      nftMetadata?: NftMetadata;
      userAddress?: string;
      source?: Source;
      networkClientId?: NetworkClientId;
    } = { userAddress: this.config.selectedAddress },
  ) {
    tokenAddress = toChecksumHexAddress(tokenAddress);

    const chainId = this.getCorrectChainId({ networkClientId });
    const newNftContracts = await this.addNftContract({
      tokenAddress,
      userAddress,
      networkClientId,
      source,
    });

    nftMetadata =
      nftMetadata ||
      (await this.getNftInformation(tokenAddress, tokenId, networkClientId));

    // If NFT contract was not added, do not add individual NFT
    const nftContract = newNftContracts.find(
      (contract) =>
        contract.address.toLowerCase() === tokenAddress.toLowerCase(),
    );

    // If NFT contract information, add individual NFT
    if (nftContract) {
      await this.addIndividualNft(
        tokenAddress,
        tokenId,
        nftMetadata,
        nftContract,
        chainId,
        userAddress,
        source,
      );
    }
  }

  /**
   * Removes an NFT from the stored token list.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - Token identifier of the NFT.
   * @param options - an object of arguments
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options.userAddress - The address of the account where the NFT is being removed.
   */
  removeNft(
    address: string,
    tokenId: string,
    {
      networkClientId,
      userAddress = this.config.selectedAddress,
    }: { networkClientId?: NetworkClientId; userAddress?: string } = {
      userAddress: this.config.selectedAddress,
    },
  ) {
    const chainId = this.getCorrectChainId({ networkClientId });
    address = toChecksumHexAddress(address);
    this.removeIndividualNft(address, tokenId, { chainId, userAddress });
    const { allNfts } = this.state;
    const nfts = allNfts[userAddress]?.[chainId] || [];
    const remainingNft = nfts.find(
      (nft) => nft.address.toLowerCase() === address.toLowerCase(),
    );

    if (!remainingNft) {
      this.removeNftContract(address, { chainId, userAddress });
    }
  }

  /**
   * Removes an NFT from the stored token list and saves it in ignored NFTs list.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - Token identifier of the NFT.
   * @param options - an object of arguments
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options.userAddress - The address of the account where the NFT is being removed.
   */
  removeAndIgnoreNft(
    address: string,
    tokenId: string,
    {
      networkClientId,
      userAddress = this.config.selectedAddress,
    }: { networkClientId?: NetworkClientId; userAddress?: string } = {
      userAddress: this.config.selectedAddress,
    },
  ) {
    const chainId = this.getCorrectChainId({ networkClientId });
    address = toChecksumHexAddress(address);
    this.removeAndIgnoreIndividualNft(address, tokenId, {
      chainId,
      userAddress,
    });
    const { allNfts } = this.state;
    const nfts = allNfts[userAddress]?.[chainId] || [];
    const remainingNft = nfts.find(
      (nft) => nft.address.toLowerCase() === address.toLowerCase(),
    );
    if (!remainingNft) {
      this.removeNftContract(address, { chainId, userAddress });
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
   * @param accountParams.userAddress - the address passed through the confirmed transaction flow to ensure assets are stored to the correct account
   * @param accountParams.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @returns the NFT with the updated isCurrentlyOwned value
   */
  async checkAndUpdateSingleNftOwnershipStatus(
    nft: Nft,
    batch: boolean,
    {
      userAddress = this.config.selectedAddress,
      networkClientId,
    }: { networkClientId?: NetworkClientId; userAddress?: string } = {
      userAddress: this.config.selectedAddress,
    },
  ) {
    const chainId = this.getCorrectChainId({ networkClientId });
    const { address, tokenId } = nft;
    let isOwned = nft.isCurrentlyOwned;
    try {
      isOwned = await this.isNftOwner(userAddress, address, tokenId, {
        networkClientId,
      });
    } catch {
      // ignore error
      // this will only throw an error 'Unable to verify ownership' in which case
      // we want to keep the current value of isCurrentlyOwned for this flow.
    }

    nft.isCurrentlyOwned = isOwned;

    if (batch) {
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
   * @param options - an object of arguments
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options.userAddress - The address of the account where the NFT ownership status is checked/updated.
   */
  async checkAndUpdateAllNftsOwnershipStatus(
    {
      networkClientId,
      userAddress = this.config.selectedAddress,
    }: { networkClientId?: NetworkClientId; userAddress?: string } = {
      userAddress: this.config.selectedAddress,
    },
  ) {
    const chainId = this.getCorrectChainId({ networkClientId });
    const { allNfts } = this.state;
    const nfts = allNfts[userAddress]?.[chainId] || [];
    const updatedNfts = await Promise.all(
      nfts.map(async (nft) => {
        return (
          (await this.checkAndUpdateSingleNftOwnershipStatus(nft, true, {
            networkClientId,
            userAddress,
          })) ?? nft
        );
      }),
    );

    this.updateNestedNftState(updatedNfts, ALL_NFTS_STATE_KEY, {
      userAddress,
      chainId,
    });
  }

  /**
   * Update NFT favorite status.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - Hex address of the NFT contract.
   * @param favorite - NFT new favorite status.
   * @param options - an object of arguments
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options.userAddress - The address of the account where the NFT is being removed.
   */
  updateNftFavoriteStatus(
    address: string,
    tokenId: string,
    favorite: boolean,
    {
      networkClientId,
      userAddress = this.config.selectedAddress,
    }: {
      networkClientId?: NetworkClientId;
      userAddress?: string;
    } = {
      userAddress: this.config.selectedAddress,
    },
  ) {
    const chainId = this.getCorrectChainId({ networkClientId });
    const { allNfts } = this.state;
    const nfts = allNfts[userAddress]?.[chainId] || [];
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

    this.updateNestedNftState(nfts, ALL_NFTS_STATE_KEY, {
      chainId,
      userAddress,
    });
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
    chainId: Hex,
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
    chainId: Hex,
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

    this.updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY, {
      chainId,
      userAddress: selectedAddress,
    });
  }

  /**
   * Resets the transaction status of an NFT.
   *
   * @param transactionId - NFT transaction id.
   * @param selectedAddress - Hex address of the user account.
   * @param chainId - Id of the current network.
   * @returns a boolean indicating if the reset was well succeeded or not
   */
  resetNftTransactionStatusByTransactionId(
    transactionId: string,
    selectedAddress: string,
    chainId: Hex,
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

    this.updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY, {
      chainId,
      userAddress: selectedAddress,
    });

    return true;
  }

  async _requestApproval(suggestedNftMeta: SuggestedNftMeta) {
    return this.messagingSystem.call(
      'ApprovalController:addRequest',
      {
        id: suggestedNftMeta.id,
        origin: suggestedNftMeta.origin,
        type: ApprovalType.WatchAsset,
        requestData: {
          id: suggestedNftMeta.id,
          interactingAddress: suggestedNftMeta.interactingAddress,
          asset: {
            address: suggestedNftMeta.asset.address,
            tokenId: suggestedNftMeta.asset.tokenId,
            name: suggestedNftMeta.asset.name,
            description: suggestedNftMeta.asset.description,
            image: suggestedNftMeta.asset.image,
            standard: suggestedNftMeta.asset.standard,
          },
        },
      },
      true,
    );
  }
}

export default NftController;
