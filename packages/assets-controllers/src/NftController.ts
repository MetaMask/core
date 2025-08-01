import { isAddress } from '@ethersproject/address';
import type {
  AccountsControllerSelectedEvmAccountChangeEvent,
  AccountsControllerGetAccountAction,
  AccountsControllerGetSelectedAccountAction,
} from '@metamask/accounts-controller';
import type { AddApprovalRequest } from '@metamask/approval-controller';
import type {
  RestrictedMessenger,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import {
  BaseController,
  type ControllerGetStateAction,
} from '@metamask/base-controller';
import {
  safelyExecute,
  handleFetch,
  toChecksumHexAddress,
  BNToHex,
  fetchWithErrorHandling,
  IPFS_DEFAULT_GATEWAY_URL,
  ERC721,
  ERC1155,
  ApprovalType,
  NFT_API_BASE_URL,
  NFT_API_VERSION,
  convertHexToDecimal,
  toHex,
} from '@metamask/controller-utils';
import { type InternalAccount } from '@metamask/keyring-internal-api';
import type {
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
} from '@metamask/network-controller';
import type { PhishingControllerBulkScanUrlsAction } from '@metamask/phishing-controller';
import { RecommendedAction } from '@metamask/phishing-controller';
import type {
  PreferencesControllerStateChangeEvent,
  PreferencesState,
} from '@metamask/preferences-controller';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';
import { remove0x } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import BN from 'bn.js';
import { v4 as random } from 'uuid';

import type {
  AssetsContractControllerGetERC1155BalanceOfAction,
  AssetsContractControllerGetERC1155TokenURIAction,
  AssetsContractControllerGetERC721AssetNameAction,
  AssetsContractControllerGetERC721AssetSymbolAction,
  AssetsContractControllerGetERC721OwnerOfAction,
  AssetsContractControllerGetERC721TokenURIAction,
} from './AssetsContractController';
import {
  compareNftMetadata,
  getFormattedIpfsUrl,
  hasNewCollectionFields,
} from './assetsUtil';
import { Source } from './constants';
import type {
  ApiNftContract,
  ReservoirResponse,
  Collection,
  Attributes,
  LastSale,
  GetCollectionsResponse,
  TopBid,
} from './NftDetectionController';
import type { NetworkControllerFindNetworkClientIdByChainIdAction } from '../../network-controller/src/NetworkController';

export type NFTStandardType = 'ERC721' | 'ERC1155';

type SuggestedNftMeta = {
  asset: { address: string; tokenId: string } & NftMetadata;
  id: string;
  time: number;
  type: NFTStandardType;
  interactingAddress: string;
  origin: string;
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
export type Nft = {
  tokenId: string;
  address: string;
  isCurrentlyOwned?: boolean;
} & NftMetadata;

type NftUpdate = {
  nft: Nft;
  newMetadata: NftMetadata;
};

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
export type NftContract = {
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
};

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
export type NftMetadata = {
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
  creator?: string;
  transactionId?: string;
  tokenURI?: string | null;
  collection?: Collection;
  address?: string;
  attributes?: Attributes[];
  lastSale?: LastSale;
  rarityRank?: string;
  topBid?: TopBid;
  chainId?: number;
};

/**
 * @type NftControllerState
 *
 * NFT controller state
 * @property allNftContracts - Object containing NFT contract information
 * @property allNfts - Object containing NFTs per account and network
 * @property ignoredNfts - List of NFTs that should be ignored
 */
export type NftControllerState = {
  allNftContracts: {
    [key: string]: {
      [chainId: Hex]: NftContract[];
    };
  };
  allNfts: {
    [key: string]: {
      [chainId: Hex]: Nft[];
    };
  };
  ignoredNfts: Nft[];
};

const nftControllerMetadata = {
  allNftContracts: { persist: true, anonymous: false },
  allNfts: { persist: true, anonymous: false },
  ignoredNfts: { persist: true, anonymous: false },
};

const ALL_NFTS_STATE_KEY = 'allNfts';
const ALL_NFTS_CONTRACTS_STATE_KEY = 'allNftContracts';

type NftAsset = {
  address: string;
  tokenId: string;
};

/**
 * The name of the {@link NftController}.
 */
const controllerName = 'NftController';

export type NftControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  NftControllerState
>;
export type NftControllerActions = NftControllerGetStateAction;

/**
 * The external actions available to the {@link NftController}.
 */
export type AllowedActions =
  | AddApprovalRequest
  | AccountsControllerGetAccountAction
  | AccountsControllerGetSelectedAccountAction
  | NetworkControllerGetNetworkClientByIdAction
  | AssetsContractControllerGetERC721AssetNameAction
  | AssetsContractControllerGetERC721AssetSymbolAction
  | AssetsContractControllerGetERC721TokenURIAction
  | AssetsContractControllerGetERC721OwnerOfAction
  | AssetsContractControllerGetERC1155BalanceOfAction
  | AssetsContractControllerGetERC1155TokenURIAction
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | PhishingControllerBulkScanUrlsAction;

export type AllowedEvents =
  | PreferencesControllerStateChangeEvent
  | AccountsControllerSelectedEvmAccountChangeEvent;

export type NftControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  NftControllerState
>;

export type NftControllerEvents = NftControllerStateChangeEvent;

/**
 * The messenger of the {@link NftController}.
 */
export type NftControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  NftControllerActions | AllowedActions,
  NftControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

export const getDefaultNftControllerState = (): NftControllerState => ({
  allNftContracts: {},
  allNfts: {},
  ignoredNfts: [],
});

const NFT_UPDATE_THRESHOLD = 500;

/**
 * Controller that stores assets and exposes convenience methods
 */
export class NftController extends BaseController<
  typeof controllerName,
  NftControllerState,
  NftControllerMessenger
> {
  readonly #mutex = new Mutex();

  /**
   * Optional API key to use with opensea
   */
  openSeaApiKey?: string;

  #selectedAccountId: string;

  #ipfsGateway: string;

  #openSeaEnabled: boolean;

  #useIpfsSubdomains: boolean;

  #isIpfsGatewayEnabled: boolean;

  readonly #onNftAdded?: (data: {
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
   * @param options.ipfsGateway - The configured IPFS gateway.
   * @param options.openSeaEnabled - Controls whether the OpenSea API is used.
   * @param options.useIpfsSubdomains - Controls whether IPFS subdomains are used.
   * @param options.isIpfsGatewayEnabled - Controls whether IPFS is enabled or not.
   * @param options.onNftAdded - Callback that is called when an NFT is added. Currently used pass data
   * for tracking the NFT added event.
   * @param options.messenger - The messenger.
   * @param options.state - Initial state to set on this controller.
   */
  constructor({
    ipfsGateway = IPFS_DEFAULT_GATEWAY_URL,
    openSeaEnabled = false,
    useIpfsSubdomains = true,
    isIpfsGatewayEnabled = true,
    onNftAdded,
    messenger,
    state = {},
  }: {
    ipfsGateway?: string;
    openSeaEnabled?: boolean;
    useIpfsSubdomains?: boolean;
    isIpfsGatewayEnabled?: boolean;
    onNftAdded?: (data: {
      address: string;
      symbol: string | undefined;
      tokenId: string;
      standard: string | null;
      source: string;
    }) => void;
    messenger: NftControllerMessenger;
    state?: Partial<NftControllerState>;
  }) {
    super({
      name: controllerName,
      metadata: nftControllerMetadata,
      messenger,
      state: {
        ...getDefaultNftControllerState(),
        ...state,
      },
    });

    this.#selectedAccountId = this.messagingSystem.call(
      'AccountsController:getSelectedAccount',
    ).id;
    this.#ipfsGateway = ipfsGateway;
    this.#openSeaEnabled = openSeaEnabled;
    this.#useIpfsSubdomains = useIpfsSubdomains;
    this.#isIpfsGatewayEnabled = isIpfsGatewayEnabled;
    this.#onNftAdded = onNftAdded;

    this.messagingSystem.subscribe(
      'PreferencesController:stateChange',
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.#onPreferencesControllerStateChange.bind(this),
    );

    this.messagingSystem.subscribe(
      'AccountsController:selectedEvmAccountChange',
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.#onSelectedAccountChange.bind(this),
    );
  }

  /**
   * Handles the state change of the preference controller.
   *
   * @param preferencesState - The new state of the preference controller.
   * @param preferencesState.ipfsGateway - The configured IPFS gateway.
   * @param preferencesState.openSeaEnabled - Controls whether the OpenSea API is used.
   * @param preferencesState.isIpfsGatewayEnabled - Controls whether IPFS is enabled or not.
   */
  async #onPreferencesControllerStateChange({
    ipfsGateway,
    openSeaEnabled,
    isIpfsGatewayEnabled,
  }: PreferencesState) {
    const selectedAccount = this.messagingSystem.call(
      'AccountsController:getSelectedAccount',
    );
    this.#selectedAccountId = selectedAccount.id;
    // Get current state values
    if (
      this.#ipfsGateway !== ipfsGateway ||
      this.#openSeaEnabled !== openSeaEnabled ||
      this.#isIpfsGatewayEnabled !== isIpfsGatewayEnabled
    ) {
      this.#ipfsGateway = ipfsGateway;
      this.#openSeaEnabled = openSeaEnabled;
      this.#isIpfsGatewayEnabled = isIpfsGatewayEnabled;
      const needsUpdateNftMetadata =
        (isIpfsGatewayEnabled && ipfsGateway !== '') || openSeaEnabled;

      if (needsUpdateNftMetadata && selectedAccount) {
        await this.#updateNftUpdateForAccount(selectedAccount);
      }
    }
  }

  /**
   * Handles the selected account change on the accounts controller.
   *
   * @param internalAccount - The new selected account.
   */
  async #onSelectedAccountChange(internalAccount: InternalAccount) {
    const oldSelectedAccountId = this.#selectedAccountId;
    this.#selectedAccountId = internalAccount.id;

    const needsUpdateNftMetadata =
      ((this.#isIpfsGatewayEnabled && this.#ipfsGateway !== '') ||
        this.#openSeaEnabled) &&
      oldSelectedAccountId !== internalAccount.id;

    if (needsUpdateNftMetadata) {
      await this.#updateNftUpdateForAccount(internalAccount);
    }
  }

  getNftApi() {
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    return `${NFT_API_BASE_URL}/tokens`;
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
  #updateNestedNftState<
    Key extends typeof ALL_NFTS_STATE_KEY | typeof ALL_NFTS_CONTRACTS_STATE_KEY,
    NftCollection extends Key extends typeof ALL_NFTS_STATE_KEY
      ? Nft[]
      : NftContract[],
  >(
    newCollection: NftCollection,
    baseStateKey: Key,
    { userAddress, chainId }: { userAddress: string; chainId: Hex },
  ) {
    // userAddress can be an empty string if it is not set via an account change or in constructor
    // while this doesn't cause any issues, we want to ensure that we don't store assets to an empty string address
    if (!userAddress) {
      return;
    }

    this.update((state) => {
      const oldState = state[baseStateKey];
      const addressState = oldState[userAddress] || {};
      const newAddressState = {
        ...addressState,
        [chainId]: newCollection,
      };
      state[baseStateKey] = {
        ...oldState,
        [userAddress]: newAddressState,
      };
    });
  }

  #getNftCollectionApi(): string {
    // False negative.
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    return `${NFT_API_BASE_URL}/collections`;
  }

  /**
   * Request individual NFT information from NFT API.
   *
   * @param contractAddress - Hex address of the NFT contract.
   * @param tokenId - The NFT identifier.
   * @returns Promise resolving to the current NFT name and image.
   */
  async #getNftInformationFromApi(
    contractAddress: string,
    tokenId: string,
  ): Promise<NftMetadata> {
    // TODO Parameterize this by chainId for non-mainnet token detection
    // Attempt to fetch the data with the nft-api
    const urlParams = new URLSearchParams({
      chainIds: '1',
      tokens: `${contractAddress}:${tokenId}`,
      includeTopBid: 'true',
      includeAttributes: 'true',
      includeLastSale: 'true',
    }).toString();

    // First fetch token information
    const nftInformation: ReservoirResponse | undefined =
      await fetchWithErrorHandling({
        url: `${this.getNftApi()}?${urlParams}`,
        options: {
          headers: {
            Version: NFT_API_VERSION,
          },
        },
      });
    // Params for getCollections API call
    const getCollectionParams = new URLSearchParams({
      chainId: '1',
      id: `${nftInformation?.tokens[0]?.token?.collection?.id as string}`,
    }).toString();
    // Fetch collection information using collectionId
    const collectionInformation: GetCollectionsResponse | undefined =
      await fetchWithErrorHandling({
        url: `${NFT_API_BASE_URL as string}/collections?${getCollectionParams}`,
        options: {
          headers: {
            Version: NFT_API_VERSION,
          },
        },
      });
    // if we were still unable to fetch the data we return out the default/null of `NftMetadata`
    if (!nftInformation?.tokens?.[0]?.token) {
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
      image,
      metadata: { imageOriginal } = {},
      name,
      description,
      collection,
      kind,
      rarityRank,
      rarity,
      attributes,
      lastSale,
      imageSmall,
    } = nftInformation.tokens[0].token;

    /* istanbul ignore next */
    const nftMetadata: NftMetadata = Object.assign(
      {},
      { name: name || null },
      { description: description || null },
      { image: image || null },
      collection?.creator && { creator: collection.creator },
      imageOriginal && { imageOriginal },
      imageSmall && { imageThumbnail: imageSmall },
      kind && { standard: kind.toUpperCase() },
      lastSale && { lastSale },
      attributes && { attributes },
      nftInformation.tokens[0].market?.topBid && {
        topBid: nftInformation.tokens[0].market?.topBid,
      },
      rarityRank && { rarityRank },
      rarity && { rarity },
      (collection || collectionInformation) && {
        collection: {
          ...(collection || {}),
          creator:
            collection?.creator ||
            collectionInformation?.collections[0].creator,
          openseaVerificationStatus:
            collectionInformation?.collections[0].openseaVerificationStatus,
          contractDeployedAt:
            collectionInformation?.collections[0].contractDeployedAt,
          ownerCount: collectionInformation?.collections[0].ownerCount,
          topBid: collectionInformation?.collections[0].topBid,
        },
      },
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
  async #getNftInformationFromTokenURI(
    contractAddress: string,
    tokenId: string,
    networkClientId: NetworkClientId,
  ): Promise<NftMetadata> {
    const result = await this.#getNftURIAndStandard(
      contractAddress,
      tokenId,
      networkClientId,
    );
    let tokenURI = result[0];
    const standard = result[1];

    const hasIpfsTokenURI = tokenURI.startsWith('ipfs://');

    if (hasIpfsTokenURI && !this.#isIpfsGatewayEnabled) {
      return {
        image: null,
        name: null,
        description: null,
        standard: standard || null,
        favorite: false,
        tokenURI: tokenURI ?? null,
      };
    }

    const isDisplayNFTMediaToggleEnabled = this.#openSeaEnabled;
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
      tokenURI = await getFormattedIpfsUrl(
        this.#ipfsGateway,
        tokenURI,
        this.#useIpfsSubdomains,
      );
    }
    if (tokenURI.startsWith('data:image/')) {
      return {
        image: tokenURI,
        name: null,
        description: null,
        standard: standard || null,
        favorite: false,
        tokenURI: tokenURI ?? null,
      };
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
  async #getNftURIAndStandard(
    contractAddress: string,
    tokenId: string,
    networkClientId: NetworkClientId,
  ): Promise<[string, string]> {
    // try ERC721 uri
    try {
      const uri = await this.messagingSystem.call(
        'AssetsContractController:getERC721TokenURI',
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
      const tokenURI = await this.messagingSystem.call(
        'AssetsContractController:getERC1155TokenURI',
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
  async #getNftInformation(
    contractAddress: string,
    tokenId: string,
    networkClientId: NetworkClientId,
  ): Promise<NftMetadata> {
    const {
      configuration: { chainId },
    } = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
    const [blockchainMetadata, nftApiMetadata] = await Promise.all([
      safelyExecute(() =>
        this.#getNftInformationFromTokenURI(
          contractAddress,
          tokenId,
          networkClientId,
        ),
      ),
      this.#openSeaEnabled && chainId === '0x1'
        ? safelyExecute(() =>
            this.#getNftInformationFromApi(contractAddress, tokenId),
          )
        : undefined,
    ]);
    const metadata = {
      ...nftApiMetadata,
      name: blockchainMetadata?.name ?? nftApiMetadata?.name ?? null,
      description:
        blockchainMetadata?.description ?? nftApiMetadata?.description ?? null,
      image: nftApiMetadata?.image ?? blockchainMetadata?.image ?? null,
      standard:
        blockchainMetadata?.standard ?? nftApiMetadata?.standard ?? null,
      tokenURI: blockchainMetadata?.tokenURI ?? null,
    };
    // Sanitize the metadata by checking external links against phishing protection
    return await this.#sanitizeNftMetadata(metadata);
  }

  /**
   * Request NFT contract information from the contract itself.
   *
   * @param contractAddress - Hex address of the NFT contract.
   * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @returns Promise resolving to the current NFT name and image.
   */
  async #getNftContractInformationFromContract(
    // TODO for calls to blockchain we need to explicitly pass the currentNetworkClientId since its relying on the provider
    contractAddress: string,
    networkClientId: NetworkClientId,
  ): Promise<
    Partial<ApiNftContract> &
      Pick<ApiNftContract, 'address'> &
      Pick<ApiNftContract, 'collection'>
  > {
    const [name, symbol] = await Promise.all([
      this.messagingSystem.call(
        'AssetsContractController:getERC721AssetName',
        contractAddress,
        networkClientId,
      ),
      this.messagingSystem.call(
        'AssetsContractController:getERC721AssetSymbol',
        contractAddress,
        networkClientId,
      ),
    ]);

    return {
      collection: { name },
      symbol,
      address: contractAddress,
    };
  }

  /**
   * Request NFT contract information from Blockchain and aggregate with received data from NFTMetadata.
   *
   * @param contractAddress - Hex address of the NFT contract.
   * @param nftMetadataFromApi - Received NFT information to be aggregated with blockchain contract information.
   * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @returns Promise resolving to the NFT contract name, image and description.
   */
  async #getNftContractInformation(
    contractAddress: string,
    nftMetadataFromApi: NftMetadata,
    networkClientId: NetworkClientId,
  ): Promise<
    Partial<ApiNftContract> &
      Pick<ApiNftContract, 'address'> &
      Pick<ApiNftContract, 'collection'>
  > {
    const blockchainContractData = await safelyExecute(() =>
      this.#getNftContractInformationFromContract(
        contractAddress,
        networkClientId,
      ),
    );

    if (
      blockchainContractData ||
      !Object.values(nftMetadataFromApi).every((value) => value === null)
    ) {
      return {
        address: contractAddress,
        ...blockchainContractData,
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        schema_name: nftMetadataFromApi?.standard ?? null,
        collection: {
          name: null,
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          image_url:
            nftMetadataFromApi?.collection?.image ??
            nftMetadataFromApi?.collection?.imageUrl ??
            null,
          tokenCount: nftMetadataFromApi?.collection?.tokenCount ?? null,
          ...nftMetadataFromApi?.collection,
          ...blockchainContractData?.collection,
        },
      };
    }

    /* istanbul ignore next */
    return {
      address: contractAddress,
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      asset_contract_type: null,
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      created_date: null,
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      schema_name: null,
      symbol: null,
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      total_supply: null,
      description: null,
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      external_link: null,
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
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
   * @returns A promise resolving to `undefined`.
   */
  async #addIndividualNft(
    tokenAddress: string,
    tokenId: string,
    nftMetadata: NftMetadata,
    nftContract: NftContract,
    chainId: Hex,
    userAddress: string,
    source: Source,
  ): Promise<void> {
    const releaseLock = await this.#mutex.acquire();
    try {
      const checksumHexAddress = toChecksumHexAddress(tokenAddress);
      const { allNfts } = this.state;

      const nfts = [...(allNfts[userAddress]?.[chainId] ?? [])];

      const existingEntry = nfts.find(
        (nft) =>
          nft.address.toLowerCase() === checksumHexAddress.toLowerCase() &&
          nft.tokenId === tokenId,
      );

      if (existingEntry) {
        const differentMetadata = compareNftMetadata(
          nftMetadata,
          existingEntry,
        );

        const hasNewFields = hasNewCollectionFields(nftMetadata, existingEntry);

        if (
          !differentMetadata &&
          existingEntry.isCurrentlyOwned &&
          !hasNewFields
        ) {
          return;
        }

        const indexToUpdate = nfts.findIndex(
          (nft) =>
            nft.address.toLowerCase() === checksumHexAddress.toLowerCase() &&
            nft.tokenId === tokenId,
        );

        if (indexToUpdate !== -1) {
          nfts[indexToUpdate] = {
            ...existingEntry,
            ...nftMetadata,
          };
        }
      } else {
        const newEntry: Nft = {
          address: checksumHexAddress,
          tokenId,
          favorite: false,
          isCurrentlyOwned: true,
          ...nftMetadata,
        };

        nfts.push(newEntry);
      }

      this.#updateNestedNftState(nfts, ALL_NFTS_STATE_KEY, {
        chainId,
        userAddress,
      });

      if (this.#onNftAdded) {
        this.#onNftAdded({
          address: checksumHexAddress,
          symbol: nftContract.symbol,
          tokenId: tokenId.toString(),
          standard: nftMetadata.standard,
          source,
        });
      }
    } finally {
      releaseLock();
    }
  }

  /**
   * Adds an NFT contract to the stored NFT contracts list.
   *
   * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options - options.
   * @param options.tokenAddress - Hex address of the NFT contract.
   * @param options.userAddress - The address of the account where the NFT is being added.
   * @param options.nftMetadata - The retrieved NFTMetadata from API.
   * @param options.source - Whether the NFT was detected, added manually or suggested by a dapp.
   * @returns Promise resolving to the current NFT contracts list.
   */
  async #addNftContract(
    networkClientId: NetworkClientId,
    {
      tokenAddress,
      userAddress,
      source,
      nftMetadata,
    }: {
      tokenAddress: string;
      userAddress: string;
      nftMetadata: NftMetadata;
      source?: Source;
    },
  ): Promise<NftContract[]> {
    const releaseLock = await this.#mutex.acquire();
    try {
      const checksumHexAddress = toChecksumHexAddress(tokenAddress);
      const { allNftContracts } = this.state;
      const {
        configuration: { chainId },
      } = this.messagingSystem.call(
        'NetworkController:getNetworkClientById',
        networkClientId as NetworkClientId,
      );

      const nftContracts = allNftContracts[userAddress]?.[chainId] || [];

      const existingEntry = nftContracts.find(
        (nftContract) =>
          nftContract.address.toLowerCase() ===
          checksumHexAddress.toLowerCase(),
      );
      if (existingEntry) {
        return nftContracts;
      }

      // this doesn't work currently for detection if the user switches networks while the detection is processing
      // will be fixed once detection uses networkClientIds
      // get name and symbol if ERC721 then put together the metadata
      const contractInformation = await this.#getNftContractInformation(
        checksumHexAddress,
        nftMetadata,
        networkClientId,
      );
      const {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        asset_contract_type,
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        created_date,
        symbol,
        description,
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        external_link,
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        schema_name,
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        collection: { name, image_url, tokenCount },
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
        { address: checksumHexAddress },
        description && { description },
        name && { name },
        image_url && { logo: image_url },
        symbol && { symbol },
        tokenCount !== null &&
          typeof tokenCount !== 'undefined' && { totalSupply: tokenCount },
        asset_contract_type && { assetContractType: asset_contract_type },
        created_date && { createdDate: created_date },
        schema_name && { schemaName: schema_name },
        external_link && { externalLink: external_link },
      );
      const newNftContracts = [...nftContracts, newEntry];
      this.#updateNestedNftState(
        newNftContracts,
        ALL_NFTS_CONTRACTS_STATE_KEY,
        {
          chainId,
          userAddress,
        },
      );

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
  #removeAndIgnoreIndividualNft(
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
    const checksumHexAddress = toChecksumHexAddress(address);
    const { allNfts, ignoredNfts } = this.state;
    const newIgnoredNfts = [...ignoredNfts];
    const nfts = allNfts[userAddress]?.[chainId] || [];
    const newNfts = nfts.filter((nft) => {
      if (
        nft.address.toLowerCase() === checksumHexAddress.toLowerCase() &&
        nft.tokenId === tokenId
      ) {
        const alreadyIgnored = newIgnoredNfts.find(
          (c) => c.address === checksumHexAddress && c.tokenId === tokenId,
        );
        !alreadyIgnored && newIgnoredNfts.push(nft);
        return false;
      }
      return true;
    });

    this.#updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY, {
      userAddress,
      chainId,
    });

    this.update((state) => {
      state.ignoredNfts = newIgnoredNfts;
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
  #removeIndividualNft(
    address: string,
    tokenId: string,
    { chainId, userAddress }: { chainId: Hex; userAddress: string },
  ) {
    const checksumHexAddress = toChecksumHexAddress(address);
    const { allNfts } = this.state;
    const nfts = allNfts[userAddress]?.[chainId] || [];
    const newNfts = nfts.filter(
      (nft) =>
        !(
          nft.address.toLowerCase() === checksumHexAddress.toLowerCase() &&
          nft.tokenId === tokenId
        ),
    );
    this.#updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY, {
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
  #removeNftContract(
    address: string,
    { chainId, userAddress }: { chainId: Hex; userAddress: string },
  ): NftContract[] {
    const checksumHexAddress = toChecksumHexAddress(address);
    const { allNftContracts } = this.state;
    const nftContracts = allNftContracts[userAddress]?.[chainId] || [];

    const newNftContracts = nftContracts.filter(
      (nftContract) =>
        !(
          nftContract.address.toLowerCase() === checksumHexAddress.toLowerCase()
        ),
    );
    this.#updateNestedNftState(newNftContracts, ALL_NFTS_CONTRACTS_STATE_KEY, {
      chainId,
      userAddress,
    });

    return newNftContracts;
  }

  async #validateWatchNft(
    asset: NftAsset,
    type: NFTStandardType,
    userAddress: string,
    networkClientId: NetworkClientId,
  ) {
    const { address: contractAddress, tokenId } = asset;

    // Validate parameters
    if (!type) {
      throw rpcErrors.invalidParams('Asset type is required');
    }

    if (type !== ERC721 && type !== ERC1155) {
      throw rpcErrors.invalidParams(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
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
        networkClientId,
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

  /**
   * Adds a new suggestedAsset to state. Parameters will be validated according to
   * asset type being watched. A `<suggestedNftMeta.id>:pending` hub event will be emitted once added.
   *
   * @param asset - The asset to be watched. For now ERC721 and ERC1155 tokens are accepted.
   * @param asset.address - The address of the asset contract.
   * @param asset.tokenId - The ID of the asset.
   * @param type - The asset type.
   * @param origin - Domain origin to register the asset from.
   * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options - Options bag.
   * @param options.userAddress - The address of the account where the NFT is being added.
   * @returns Object containing a Promise resolving to the suggestedAsset address if accepted.
   */
  async watchNft(
    asset: NftAsset,
    type: NFTStandardType,
    origin: string,
    networkClientId: NetworkClientId,
    {
      userAddress,
    }: {
      userAddress?: string;
    } = {},
  ) {
    const addressToSearch = this.#getAddressOrSelectedAddress(userAddress);
    if (!addressToSearch) {
      return;
    }
    if (!networkClientId) {
      throw rpcErrors.invalidParams('Network client id is required');
    }

    await this.#validateWatchNft(asset, type, addressToSearch, networkClientId);

    const nftMetadata = await this.#getNftInformation(
      asset.address,
      asset.tokenId,
      networkClientId,
    );
    // Sanitize metadata
    const sanitizedMetadata = await this.#sanitizeNftMetadata(nftMetadata);

    if (sanitizedMetadata.standard && sanitizedMetadata.standard !== type) {
      throw rpcErrors.invalidInput(
        `Suggested NFT of type ${sanitizedMetadata.standard} does not match received type ${type}`,
      );
    }

    const suggestedNftMeta: SuggestedNftMeta = {
      asset: { ...asset, ...sanitizedMetadata },
      type,
      id: random(),
      time: Date.now(),
      interactingAddress: addressToSearch,
      origin,
    };
    await this._requestApproval(suggestedNftMeta);
    const { address, tokenId } = asset;
    const { name, standard, description, image } = sanitizedMetadata;
    await this.addNft(address, tokenId, networkClientId, {
      nftMetadata: {
        name: name ?? null,
        description: description ?? null,
        image: image ?? null,
        standard: standard ?? null,
      },
      userAddress,
      source: Source.Dapp,
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
   * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @returns Promise resolving the NFT ownership.
   */
  async isNftOwner(
    ownerAddress: string,
    nftAddress: string,
    tokenId: string,
    networkClientId: NetworkClientId,
  ): Promise<boolean> {
    // Checks the ownership for ERC-721.
    try {
      const owner = await this.messagingSystem.call(
        'AssetsContractController:getERC721OwnerOf',
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
      const balance = await this.messagingSystem.call(
        'AssetsContractController:getERC1155BalanceOf',
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
   * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options - an object of arguments
   * @param options.userAddress - The address of the current user.
   * @param options.source - Whether the NFT was detected, added manually or suggested by a dapp.
   */
  async addNftVerifyOwnership(
    address: string,
    tokenId: string,
    networkClientId: NetworkClientId,
    {
      userAddress,
      source,
    }: {
      userAddress?: string;
      source?: Source;
    } = {},
  ) {
    const addressToSearch = this.#getAddressOrSelectedAddress(userAddress);

    if (
      !(await this.isNftOwner(
        addressToSearch,
        address,
        tokenId,
        networkClientId,
      ))
    ) {
      throw new Error('This NFT is not owned by the user');
    }

    await this.addNft(address, tokenId, networkClientId, {
      userAddress: addressToSearch,
      source,
    });
  }

  /**
   * Adds an NFT and respective NFT contract to the stored NFT and NFT contracts lists.
   *
   * @param tokenAddress - Hex address of the NFT contract.
   * @param tokenId - The NFT identifier.
   * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options - an object of arguments
   * @param options.nftMetadata - NFT optional metadata.
   * @param options.userAddress - The address of the current user.
   * @param options.source - Whether the NFT was detected, added manually or suggested by a dapp.
   * @returns Promise resolving to the current NFT list.
   */
  async addNft(
    tokenAddress: string,
    tokenId: string,
    networkClientId: NetworkClientId,
    {
      nftMetadata,
      userAddress,
      source = Source.Custom,
    }: {
      nftMetadata?: NftMetadata;
      userAddress?: string;
      source?: Source;
    } = {},
  ) {
    const addressToSearch = this.#getAddressOrSelectedAddress(userAddress);
    if (!addressToSearch) {
      return;
    }

    const checksumHexAddress = toChecksumHexAddress(tokenAddress);

    if (!nftMetadata) {
      const fetchedMetadata = await this.#getNftInformation(
        checksumHexAddress,
        tokenId,
        networkClientId,
      );
      // Sanitize metadata
      nftMetadata = await this.#sanitizeNftMetadata(fetchedMetadata);
    } else {
      // Sanitize provided metadata
      nftMetadata = await this.#sanitizeNftMetadata(nftMetadata);
    }

    const newNftContracts = await this.#addNftContract(networkClientId, {
      tokenAddress: checksumHexAddress,
      userAddress: addressToSearch,
      source,
      nftMetadata,
    });

    // If NFT contract was not added, do not add individual NFT
    const nftContract = newNftContracts.find(
      (contract) =>
        contract.address.toLowerCase() === checksumHexAddress.toLowerCase(),
    );
    const {
      configuration: { chainId },
    } = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
    // This is the case when the NFT is added manually and not detected automatically
    // TODO: An improvement would be to make the chainId a required field and return it when getting the NFT information
    if (!nftMetadata.chainId) {
      nftMetadata.chainId = convertHexToDecimal(chainId);
    }

    // If NFT contract information, add individual NFT
    if (nftContract) {
      await this.#addIndividualNft(
        checksumHexAddress,
        tokenId,
        nftMetadata,
        nftContract,
        chainId,
        addressToSearch,
        source,
      );
    }
  }

  /**
   * Refetches NFT metadata and updates the state
   *
   * @param options - Options for refetching NFT metadata
   * @param options.nfts - nfts to update metadata for.
   * @param options.userAddress - The current user address
   */
  async updateNftMetadata({
    nfts,
    userAddress,
  }: {
    nfts: Nft[];
    userAddress?: string;
  }) {
    const addressToSearch = this.#getAddressOrSelectedAddress(userAddress);

    const releaseLock = await this.#mutex.acquire();

    try {
      const nftsWithChecksumAdr = nfts.map((nft) => {
        return {
          ...nft,
          address: toChecksumHexAddress(nft.address),
        };
      });

      // Get all unsanitized nft metadata
      const unsanitizedResults = await Promise.all(
        nftsWithChecksumAdr.map(async (nft) => {
          // Each NFT should have a chainId; convert nft.chainId to networkClientId
          const networkClientId = this.messagingSystem.call(
            'NetworkController:findNetworkClientIdByChainId',
            toHex(nft.chainId as number),
          );
          const resMetadata = networkClientId
            ? await this.#getNftInformation(
                nft.address,
                nft.tokenId,
                networkClientId,
              )
            : undefined;
          return {
            nft,
            newMetadata: resMetadata,
          };
        }),
      );

      // Extract metadata
      const unsanitizedMetadata = unsanitizedResults.map(
        (result) => result.newMetadata,
      );

      // Sanitize all metadata
      const sanitizedMetadata = await this.#bulkSanitizeNftMetadata(
        unsanitizedMetadata as NftMetadata[],
      );

      // Reassemble the results with sanitized metadata
      const nftMetadataResults = unsanitizedResults.map((result, index) => ({
        nft: result.nft,
        newMetadata: sanitizedMetadata[index],
      }));

      // We want to avoid updating the state if the state and fetched nft info are the same
      const nftsWithDifferentMetadata: NftUpdate[] = [];
      const { allNfts } = this.state;
      // get from state allNfts that match nftsWithChecksumAdr
      const stateNfts = nftsWithChecksumAdr.map((nft) => {
        return allNfts[addressToSearch]?.[toHex(nft.chainId as number)]?.find(
          (nftElement) =>
            nftElement.address.toLowerCase() === nft.address.toLowerCase() &&
            nftElement.tokenId === nft.tokenId,
        );
      });

      nftMetadataResults.forEach(
        (singleNft: { nft: Nft; newMetadata: NftMetadata | undefined }) => {
          const existingEntry: Nft | undefined = stateNfts.find(
            (nft) =>
              nft?.address.toLowerCase() ===
                singleNft.nft.address.toLowerCase() &&
              nft?.tokenId === singleNft.nft.tokenId,
          );

          if (existingEntry && singleNft.newMetadata) {
            const differentMetadata = compareNftMetadata(
              singleNft.newMetadata,
              existingEntry,
            );

            if (differentMetadata) {
              nftsWithDifferentMetadata.push({
                nft: singleNft.nft,
                newMetadata: singleNft.newMetadata,
              });
            }
          }
        },
      );

      if (nftsWithDifferentMetadata.length !== 0) {
        nftsWithDifferentMetadata.forEach((elm) =>
          this.updateNft(
            elm.nft,
            elm.newMetadata,
            addressToSearch,
            toHex(elm.nft.chainId as number),
          ),
        );
      }
    } finally {
      releaseLock();
    }
  }

  /**
   * Removes an NFT from the stored token list.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - Token identifier of the NFT.
   * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options - an object of arguments
   * @param options.userAddress - The address of the account where the NFT is being removed.
   */
  removeNft(
    address: string,
    tokenId: string,
    networkClientId: NetworkClientId,
    { userAddress }: { userAddress?: string } = {},
  ) {
    const addressToSearch = this.#getAddressOrSelectedAddress(userAddress);

    const {
      configuration: { chainId },
    } = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId as NetworkClientId,
    );

    const checksumHexAddress = toChecksumHexAddress(address);
    this.#removeIndividualNft(checksumHexAddress, tokenId, {
      chainId,
      userAddress: addressToSearch,
    });
    const { allNfts } = this.state;
    const nfts = allNfts[addressToSearch]?.[chainId] || [];
    const remainingNft = nfts.find(
      (nft) => nft.address.toLowerCase() === checksumHexAddress.toLowerCase(),
    );

    if (!remainingNft) {
      this.#removeNftContract(checksumHexAddress, {
        chainId,
        userAddress: addressToSearch,
      });
    }
  }

  /**
   * Removes an NFT from the stored token list and saves it in ignored NFTs list.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - Token identifier of the NFT.
   * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options - an object of arguments
   * @param options.userAddress - The address of the account where the NFT is being removed.
   */
  removeAndIgnoreNft(
    address: string,
    tokenId: string,
    networkClientId: NetworkClientId,
    { userAddress }: { userAddress?: string } = {},
  ) {
    const addressToSearch = this.#getAddressOrSelectedAddress(userAddress);
    const {
      configuration: { chainId },
    } = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId as NetworkClientId,
    );
    const checksumHexAddress = toChecksumHexAddress(address);
    this.#removeAndIgnoreIndividualNft(checksumHexAddress, tokenId, {
      chainId,
      userAddress: addressToSearch,
    });
    const { allNfts } = this.state;
    const nfts = allNfts[addressToSearch]?.[chainId] || [];
    const remainingNft = nfts.find(
      (nft) => nft.address.toLowerCase() === checksumHexAddress.toLowerCase(),
    );
    if (!remainingNft) {
      this.#removeNftContract(checksumHexAddress, {
        chainId,
        userAddress: addressToSearch,
      });
    }
  }

  /**
   * Removes all NFTs from the ignored list.
   */
  clearIgnoredNfts() {
    this.update((state) => {
      state.ignoredNfts = [];
    });
  }

  /**
   * Checks whether input NFT is still owned by the user
   * And updates the isCurrentlyOwned value on the NFT object accordingly.
   *
   * @param nft - The NFT object to check and update.
   * @param batch - A boolean indicating whether this method is being called as part of a batch or single update.
   * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param accountParams - The userAddress and chainId to check ownership against
   * @param accountParams.userAddress - the address passed through the confirmed transaction flow to ensure assets are stored to the correct account
   * @returns the NFT with the updated isCurrentlyOwned value
   */
  async checkAndUpdateSingleNftOwnershipStatus(
    nft: Nft,
    batch: boolean,
    networkClientId: NetworkClientId,
    { userAddress }: { userAddress?: string } = {},
  ) {
    const addressToSearch = this.#getAddressOrSelectedAddress(userAddress);
    const {
      configuration: { chainId },
    } = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId as NetworkClientId,
    );
    const { address, tokenId } = nft;
    let isOwned = nft.isCurrentlyOwned;
    try {
      isOwned = await this.isNftOwner(
        addressToSearch,
        address,
        tokenId,
        networkClientId,
      );
    } catch {
      // ignore error
      // this will only throw an error 'Unable to verify ownership' in which case
      // we want to keep the current value of isCurrentlyOwned for this flow.
    }

    const updatedNft = {
      ...nft,
      isCurrentlyOwned: isOwned,
    };

    if (batch) {
      return updatedNft;
    }

    // if this is not part of a batched update we update this one NFT in state
    const { allNfts } = this.state;
    const nfts = [...(allNfts[addressToSearch]?.[chainId] || [])];
    const indexToUpdate = nfts.findIndex(
      (item) =>
        item.tokenId === tokenId &&
        item.address.toLowerCase() === address.toLowerCase(),
    );

    if (indexToUpdate !== -1) {
      nfts[indexToUpdate] = updatedNft;
      this.update((state) => {
        state.allNfts[addressToSearch] = Object.assign(
          {},
          state.allNfts[addressToSearch],
          {
            [chainId]: nfts,
          },
        );
      });
      this.#updateNestedNftState(nfts, ALL_NFTS_STATE_KEY, {
        userAddress: addressToSearch,
        chainId,
      });
    }

    return updatedNft;
  }

  /**
   * Checks whether NFTs associated with current selectedAddress/chainId combination are still owned by the user
   * And updates the isCurrentlyOwned value on each accordingly.
   *
   * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options - an object of arguments
   * @param options.userAddress - The address of the account where the NFT ownership status is checked/updated.
   */
  async checkAndUpdateAllNftsOwnershipStatus(
    networkClientId: NetworkClientId,
    {
      userAddress,
    }: {
      userAddress?: string;
    } = {},
  ) {
    const addressToSearch = this.#getAddressOrSelectedAddress(userAddress);
    const {
      configuration: { chainId },
    } = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId as NetworkClientId,
    );
    const { allNfts } = this.state;
    const nfts = allNfts[addressToSearch]?.[chainId] || [];
    const updatedNfts = await Promise.all(
      nfts.map(async (nft) => {
        return (
          (await this.checkAndUpdateSingleNftOwnershipStatus(
            nft,
            true,
            networkClientId,
            {
              userAddress,
            },
          )) ?? nft
        );
      }),
    );

    this.#updateNestedNftState(updatedNfts, ALL_NFTS_STATE_KEY, {
      userAddress: addressToSearch,
      chainId,
    });
  }

  /**
   * Update NFT favorite status.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - Hex address of the NFT contract.
   * @param favorite - NFT new favorite status.
   * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options - an object of arguments
   * @param options.userAddress - The address of the account where the NFT is being removed.
   */
  updateNftFavoriteStatus(
    address: string,
    tokenId: string,
    favorite: boolean,
    networkClientId: NetworkClientId,
    {
      userAddress,
    }: {
      userAddress?: string;
    } = {},
  ) {
    const addressToSearch = this.#getAddressOrSelectedAddress(userAddress);
    const {
      configuration: { chainId },
    } = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId as NetworkClientId,
    );
    const { allNfts } = this.state;
    const nfts = [...(allNfts[addressToSearch]?.[chainId] || [])];
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

    this.#updateNestedNftState(nfts, ALL_NFTS_STATE_KEY, {
      chainId,
      userAddress: addressToSearch,
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
    this.#updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY, {
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

    this.#updateNestedNftState(newNfts, ALL_NFTS_STATE_KEY, {
      chainId,
      userAddress: selectedAddress,
    });

    return true;
  }

  /**
   * Fetches NFT Collection Metadata from the NFT API.
   *
   * @param contractAddresses - The contract addresses of the NFTs.
   * @param chainId - The chain ID of the network where the NFT is located.
   * @returns NFT collections metadata.
   */
  async getNFTContractInfo(
    contractAddresses: string[],
    chainId: Hex,
  ): Promise<{
    collections: Collection[];
  }> {
    const url = new URL(this.#getNftCollectionApi());

    url.searchParams.append('chainId', chainId);

    for (const address of contractAddresses) {
      url.searchParams.append('contract', address);
    }

    return await handleFetch(url, {
      headers: {
        Version: NFT_API_VERSION,
      },
    });
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

  #getAddressOrSelectedAddress(address: string | undefined): string {
    if (address) {
      return address;
    }

    // If the address is not defined (or empty), we fallback to the currently selected account's address
    const selectedAccount = this.messagingSystem.call(
      'AccountsController:getAccount',
      this.#selectedAccountId,
    );
    return selectedAccount?.address || '';
  }

  /**
   * Updates the all nfts in state for the account.
   * Nfts will be updated if they don't have a name, description or image.
   *
   * @param account - The account to update the NFT metadata for.
   */
  async #updateNftUpdateForAccount(account: InternalAccount) {
    // get all nfts for the account for all chains
    const nfts: Nft[] = Object.values(
      this.state.allNfts[account.address] || {},
    ).flat();

    // Filter only nfts
    const nftsToUpdate = nfts.filter(
      (singleNft) =>
        !singleNft.name && !singleNft.description && !singleNft.image,
    );
    if (
      nftsToUpdate.length !== 0 &&
      nftsToUpdate.length < NFT_UPDATE_THRESHOLD
    ) {
      await this.updateNftMetadata({
        nfts: nftsToUpdate,
        userAddress: account.address,
      });
    }
  }

  /**
   * Reset the controller state to the default state.
   */
  resetState() {
    this.update(() => {
      return getDefaultNftControllerState();
    });
  }

  /**
   * Sanitizes multiple NFT metadata objects by checking external links against PhishingController in a single bulk request
   *
   * @param metadataList - Array of NFT metadata objects to sanitize
   * @returns Array of sanitized NFT metadata objects
   */
  async #bulkSanitizeNftMetadata(
    metadataList: NftMetadata[],
  ): Promise<NftMetadata[]> {
    // Create a copy of the metadata list to avoid mutating the input
    const sanitizedMetadataList = metadataList.map((metadata) => ({
      ...metadata,
    }));

    // Maps URL to a list of {metadataIndex, fieldName} to track where each URL is used
    const urlMap: Record<
      string,
      { metadataIndex: number; fieldName: string }[]
    > = {};

    const fieldsToCheck = [
      'externalLink',
      'image',
      'imagePreview',
      'imageThumbnail',
      'imageOriginal',
      'animation',
      'animationOriginal',
    ];

    // Collect all URLs from all metadata objects
    sanitizedMetadataList.forEach((metadata, metadataIndex) => {
      // Check regular fields
      for (const field of fieldsToCheck) {
        const url = metadata[field as keyof NftMetadata];
        if (typeof url === 'string' && url && url.startsWith('http')) {
          if (!urlMap[url]) {
            urlMap[url] = [];
          }
          urlMap[url].push({ metadataIndex, fieldName: field });
        }
      }

      // Check collection links if they exist
      if (metadata.collection) {
        const { collection } = metadata;
        if (
          'externalLink' in collection &&
          typeof collection.externalLink === 'string'
        ) {
          const url = collection.externalLink;
          if (!urlMap[url]) {
            urlMap[url] = [];
          }
          urlMap[url].push({
            metadataIndex,
            fieldName: 'collection.externalLink',
          });
        }
      }
    });

    const urlsToCheck = Object.keys(urlMap);
    if (urlsToCheck.length === 0) {
      return sanitizedMetadataList;
    }

    try {
      // Use bulkScanUrls to check all URLs at once
      const bulkScanResponse = await this.messagingSystem.call(
        'PhishingController:bulkScanUrls',
        urlsToCheck,
      );
      // Apply scan results to all metadata objects
      Object.entries(bulkScanResponse.results).forEach(([url, result]) => {
        if (result.recommendedAction === RecommendedAction.Block) {
          // Remove this URL from all metadata objects where it appears
          urlMap[url].forEach(({ metadataIndex, fieldName }) => {
            if (
              fieldName === 'collection.externalLink' &&
              sanitizedMetadataList[metadataIndex].collection // Check if collection exists
            ) {
              const { collection } = sanitizedMetadataList[metadataIndex];
              // Ensure collection is not undefined again just to be safe before using 'in'
              if (collection && 'externalLink' in collection) {
                delete (collection as Record<string, unknown>).externalLink;
              }
            } else {
              delete sanitizedMetadataList[metadataIndex][
                fieldName as keyof NftMetadata
              ];
            }
          });
        }
      });
    } catch (error) {
      console.error('Error during bulk URL scanning:', error);
      // If bulk scan fails, we fall back to keeping all URLs
    }

    return sanitizedMetadataList;
  }

  /**
   * Sanitizes NFT metadata by checking external links against PhishingController
   *
   * @param metadata - The NFT metadata to sanitize
   * @returns Sanitized NFT metadata with potentially dangerous links removed
   */
  async #sanitizeNftMetadata(metadata: NftMetadata): Promise<NftMetadata> {
    // Use the bulk sanitize function with just a single metadata object
    const sanitized = await this.#bulkSanitizeNftMetadata([metadata]);
    return sanitized[0];
  }
}

export default NftController;
