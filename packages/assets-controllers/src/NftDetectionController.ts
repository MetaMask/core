import type { AddApprovalRequest } from '@metamask/approval-controller';
import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import {
  fetchWithErrorHandling,
  toChecksumHexAddress,
  ChainId,
  NFT_API_BASE_URL,
  NFT_API_VERSION,
  NFT_API_TIMEOUT,
} from '@metamask/controller-utils';
import type {
  NetworkClientId,
  NetworkClient,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerStateChangeEvent,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type {
  PreferencesControllerGetStateAction,
  PreferencesControllerStateChangeEvent,
  PreferencesState,
} from '@metamask/preferences-controller';

import { Source } from './constants';
import {
  type NftController,
  type NftControllerState,
  type NftMetadata,
} from './NftController';

const DEFAULT_INTERVAL = 180000;

const controllerName = 'NftDetectionController';

export type AllowedActions =
  | AddApprovalRequest
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | PreferencesControllerGetStateAction;

export type AllowedEvents =
  | PreferencesControllerStateChangeEvent
  | NetworkControllerStateChangeEvent;

export type NftDetectionControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  AllowedActions,
  AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * @type ApiNft
 *
 * NFT object coming from OpenSea api
 * @property token_id - The NFT identifier
 * @property num_sales - Number of sales
 * @property background_color - The background color to be displayed with the item
 * @property image_url - URI of an image associated with this NFT
 * @property image_preview_url - URI of a smaller image associated with this NFT
 * @property image_thumbnail_url - URI of a thumbnail image associated with this NFT
 * @property image_original_url - URI of the original image associated with this NFT
 * @property animation_url - URI of a animation associated with this NFT
 * @property animation_original_url - URI of the original animation associated with this NFT
 * @property name - The NFT name
 * @property description - The NFT description
 * @property external_link - External link containing additional information
 * @property assetContract - The NFT contract information object
 * @property creator - The NFT owner information object
 * @property lastSale - When this item was last sold
 */
export type ApiNft = {
  token_id: string;
  num_sales: number | null;
  background_color: string | null;
  image_url: string | null;
  image_preview_url: string | null;
  image_thumbnail_url: string | null;
  image_original_url: string | null;
  animation_url: string | null;
  animation_original_url: string | null;
  name: string | null;
  description: string | null;
  external_link: string | null;
  asset_contract: ApiNftContract;
  creator: ApiNftCreator;
  last_sale: ApiNftLastSale | null;
};

/**
 * @type ApiNftContract
 *
 * NFT contract object coming from OpenSea api
 * @property address - Address of the NFT contract
 * @property asset_contract_type - The NFT type, it could be `semi-fungible` or `non-fungible`
 * @property created_date - Creation date
 * @property collection - Object containing the contract name and URI of an image associated
 * @property schema_name - The schema followed by the contract, it could be `ERC721` or `ERC1155`
 * @property symbol - The NFT contract symbol
 * @property total_supply - Total supply of NFTs
 * @property description - The NFT contract description
 * @property external_link - External link containing additional information
 */
export type ApiNftContract = {
  address: string;
  asset_contract_type: string | null;
  created_date: string | null;
  schema_name: string | null;
  symbol: string | null;
  total_supply: string | null;
  description: string | null;
  external_link: string | null;
  collection: {
    name: string | null;
    image_url?: string | null;
    tokenCount?: string | null;
  };
};

/**
 * @type ApiNftLastSale
 *
 * NFT sale object coming from OpenSea api
 * @property event_timestamp - Object containing a `username`
 * @property total_price - URI of NFT image associated with this owner
 * @property transaction - Object containing transaction_hash and block_hash
 */
export type ApiNftLastSale = {
  event_timestamp: string;
  total_price: string;
  transaction: { transaction_hash: string; block_hash: string };
};

/**
 * @type ApiNftCreator
 *
 * NFT creator object coming from OpenSea api
 * @property user - Object containing a `username`
 * @property profile_img_url - URI of NFT image associated with this owner
 * @property address - The owner address
 */
export type ApiNftCreator = {
  user: { username: string };
  profile_img_url: string;
  address: string;
};

export type ReservoirResponse = {
  tokens: TokensResponse[];
  continuation?: string;
};

export type TokensResponse = {
  token: TokenResponse;
  ownership: Ownership;
  market?: Market;
  blockaidResult?: Blockaid;
};

export enum BlockaidResultType {
  Benign = 'Benign',
  Spam = 'Spam',
  Warning = 'Warning',
  Malicious = 'Malicious',
}

export type Blockaid = {
  contract: string;
  chainId: number;
  result_type: BlockaidResultType;
  malicious_score: string;
  attack_types: object;
};

export type Market = {
  floorAsk?: FloorAsk;
  topBid?: TopBid;
};

export type TokenResponse = {
  chainId: number;
  contract: string;
  tokenId: string;
  kind?: string;
  name?: string;
  image?: string;
  imageSmall?: string;
  imageLarge?: string;
  metadata?: Metadata;
  description?: string;
  supply?: number;
  remainingSupply?: number;
  rarityScore?: number;
  rarity?: number;
  rarityRank?: number;
  media?: string;
  isFlagged?: boolean;
  isSpam?: boolean;
  isNsfw?: boolean;
  metadataDisabled?: boolean;
  lastFlagUpdate?: string;
  lastFlagChange?: string;
  collection?: Collection;
  lastSale?: LastSale;
  topBid?: TopBid;
  lastAppraisalValue?: number;
  attributes?: Attributes[];
};

export type TopBid = {
  id?: string;
  price?: Price;
  source?: {
    id?: string;
    domain?: string;
    name?: string;
    icon?: string;
    url?: string;
  };
};

export type LastSale = {
  saleId?: string;
  token?: {
    contract?: string;
    tokenId?: string;
    name?: string;
    image?: string;
    collection?: {
      id?: string;
      name?: string;
    };
  };
  orderSource?: string;
  orderSide?: 'ask' | 'bid';
  orderKind?: string;
  orderId?: string;
  from?: string;
  to?: string;
  amount?: string;
  fillSource?: string;
  block?: number;
  txHash?: string;
  logIndex?: number;
  batchIndex?: number;
  timestamp?: number;
  price?: Price;
  washTradingScore?: number;
  royaltyFeeBps?: number;
  marketplaceFeeBps?: number;
  paidFullRoyalty?: boolean;
  feeBreakdown?: FeeBreakdown[];
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type FeeBreakdown = {
  kind?: string;
  bps?: number;
  recipient?: string;
  source?: string;
  rawAmount?: string;
};

export type Attributes = {
  key?: string;
  kind?: string;
  value: string;
  tokenCount?: number;
  onSaleCount?: number;
  floorAskPrice?: Price | null;
  topBidValue?: number | null;
  createdAt?: string;
};

export type Collection = {
  id?: string;
  name?: string;
  slug?: string;
  symbol?: string;
  imageUrl?: string;
  image?: string;
  isSpam?: boolean;
  isNsfw?: boolean;
  creator?: string;
  tokenCount?: string;
  metadataDisabled?: boolean;
  openseaVerificationStatus?: string;
  floorAskPrice?: Price;
  royaltiesBps?: number;
  royalties?: Royalties[];
};

export type Royalties = {
  bps?: number;
  recipient?: string;
};

export type Ownership = {
  tokenCount?: string;
  onSaleCount?: string;
  floorAsk?: FloorAsk;
  acquiredAt?: string;
};

export type FloorAsk = {
  id?: string;
  price?: Price;
  maker?: string;
  kind?: string;
  validFrom?: number;
  validUntil?: number;
  source?: Source;
  rawData?: Metadata;
  isNativeOffChainCancellable?: boolean;
};

export type Price = {
  currency?: {
    contract?: string;
    name?: string;
    symbol?: string;
    decimals?: number;
    chainId?: number;
  };
  amount?: {
    raw?: string;
    decimal?: number;
    usd?: number;
    native?: number;
  };
  netAmount?: {
    raw?: string;
    decimal?: number;
    usd?: number;
    native?: number;
  };
};

export type Metadata = {
  imageOriginal?: string;
  tokenURI?: string;
};

/**
 * Controller that passively polls on a set interval for NFT auto detection
 */
export class NftDetectionController extends StaticIntervalPollingController<
  typeof controllerName,
  Record<never, never>,
  NftDetectionControllerMessenger
> {
  #intervalId?: ReturnType<typeof setTimeout>;

  #interval: number;

  #disabled: boolean;

  readonly #addNft: NftController['addNft'];

  readonly #getNftState: () => NftControllerState;

  /**
   * The controller options
   *
   * @param options - The controller options.
   * @param options.interval - The pooling interval.
   * @param options.messenger - A reference to the messaging system.
   * @param options.disabled - Represents previous value of useNftDetection. Used to detect changes of useNftDetection. Default value is true.
   * @param options.addNft - Add an NFT.
   * @param options.getNftState - Gets the current state of the Assets controller.
   */
  constructor({
    interval = DEFAULT_INTERVAL,
    messenger,
    disabled = false,
    addNft,
    getNftState,
  }: {
    interval?: number;
    messenger: NftDetectionControllerMessenger;
    disabled: boolean;
    addNft: NftController['addNft'];
    getNftState: () => NftControllerState;
  }) {
    super({
      name: controllerName,
      messenger,
      metadata: {},
      state: {},
    });
    this.#interval = interval;
    this.#disabled = disabled;

    this.#getNftState = getNftState;
    this.#addNft = addNft;

    this.messagingSystem.subscribe(
      'PreferencesController:stateChange',
      this.#onPreferencesControllerStateChange.bind(this),
    );

    this.setIntervalLength(this.#interval);
  }

  async _executePoll(
    networkClientId: string,
    options: { address: string },
  ): Promise<void> {
    await this.detectNfts({ networkClientId, userAddress: options.address });
  }

  /**
   * Start polling for the currency rate.
   */
  async start() {
    if (!this.isMainnet() || this.#disabled) {
      return;
    }

    await this.#startPolling();
  }

  /**
   * Stop polling for the currency rate.
   */
  stop() {
    this.#stopPolling();
  }

  #stopPolling() {
    if (this.#intervalId) {
      clearInterval(this.#intervalId);
    }
  }

  /**
   * Starts a new polling interval.
   *
   */
  async #startPolling(): Promise<void> {
    this.#stopPolling();
    await this.detectNfts();
    this.#intervalId = setInterval(async () => {
      await this.detectNfts();
    }, this.#interval);
  }

  /**
   * Checks whether network is mainnet or not.
   *
   * @returns Whether current network is mainnet.
   */
  isMainnet(): boolean {
    const { selectedNetworkClientId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    const {
      configuration: { chainId },
    } = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      selectedNetworkClientId,
    );
    return chainId === ChainId.mainnet;
  }

  isMainnetByNetworkClientId(networkClient: NetworkClient): boolean {
    return networkClient.configuration.chainId === ChainId.mainnet;
  }

  /**
   * Handles the state change of the preference controller.
   * @param preferencesState - The new state of the preference controller.
   * @param preferencesState.useNftDetection - Boolean indicating user preference on NFT detection.
   */
  #onPreferencesControllerStateChange({ useNftDetection }: PreferencesState) {
    if (!useNftDetection !== this.#disabled) {
      this.#disabled = !useNftDetection;
      if (useNftDetection) {
        this.start();
      } else {
        this.stop();
      }
    }
  }

  #getOwnerNftApi({ address, next }: { address: string; next?: string }) {
    return `${NFT_API_BASE_URL}/users/${address}/tokens?chainIds=1&limit=50&includeTopBid=true&continuation=${
      next ?? ''
    }`;
  }

  async #getOwnerNfts(address: string) {
    let nftApiResponse: ReservoirResponse;
    let nfts: TokensResponse[] = [];
    let next;

    do {
      nftApiResponse = await fetchWithErrorHandling({
        url: this.#getOwnerNftApi({ address, next }),
        options: {
          headers: {
            Version: NFT_API_VERSION,
          },
        },
        timeout: NFT_API_TIMEOUT,
      });

      if (!nftApiResponse) {
        return nfts;
      }

      const newNfts =
        nftApiResponse.tokens?.filter(
          (elm) =>
            elm.token.isSpam === false &&
            (elm.blockaidResult?.result_type
              ? elm.blockaidResult?.result_type === BlockaidResultType.Benign
              : true),
        ) ?? [];

      nfts = [...nfts, ...newNfts];
    } while ((next = nftApiResponse.continuation));

    return nfts;
  }

  /**
   * Triggers asset ERC721 token auto detection on mainnet. Any newly detected NFTs are
   * added.
   *
   * @param options - Options bag.
   * @param options.networkClientId - The network client ID to detect NFTs on.
   * @param options.userAddress - The address to detect NFTs for.
   */
  async detectNfts(options?: {
    networkClientId?: NetworkClientId;
    userAddress?: string;
  }) {
    const userAddress =
      options?.userAddress ??
      this.messagingSystem.call('PreferencesController:getState')
        .selectedAddress;
    /* istanbul ignore if */
    if (!this.isMainnet() || this.#disabled) {
      return;
    }
    /* istanbul ignore else */
    if (!userAddress) {
      return;
    }

    const apiNfts = await this.#getOwnerNfts(userAddress);
    const addNftPromises = apiNfts.map(async (nft) => {
      const {
        tokenId: token_id,
        contract,
        kind,
        image: image_url,
        imageSmall: image_thumbnail_url,
        metadata: { imageOriginal: image_original_url } = {},
        name,
        description,
        attributes,
        topBid,
        lastSale,
        rarityRank,
        rarityScore,
        collection,
      } = nft.token;

      let ignored;
      /* istanbul ignore else */
      const { ignoredNfts } = this.#getNftState();
      if (ignoredNfts.length > 0) {
        ignored = ignoredNfts.find((c) => {
          /* istanbul ignore next */
          return (
            c.address === toChecksumHexAddress(contract) &&
            c.tokenId === token_id
          );
        });
      }

      /* istanbul ignore else */
      if (!ignored) {
        /* istanbul ignore next */
        const nftMetadata: NftMetadata = Object.assign(
          {},
          { name },
          description && { description },
          image_url && { image: image_url },
          image_thumbnail_url && { imageThumbnail: image_thumbnail_url },
          image_original_url && { imageOriginal: image_original_url },
          kind && { standard: kind.toUpperCase() },
          lastSale && { lastSale },
          attributes && { attributes },
          topBid && { topBid },
          rarityRank && { rarityRank },
          rarityScore && { rarityScore },
          collection && { collection },
        );

        await this.#addNft(contract, token_id, {
          nftMetadata,
          userAddress,
          source: Source.Detected,
          networkClientId: options?.networkClientId,
        });
      }
    });
    await Promise.all(addNftPromises);
  }
}

export default NftDetectionController;
