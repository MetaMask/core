import type { BaseConfig, BaseState } from '@metamask/base-controller';
import {
  OPENSEA_PROXY_URL,
  fetchWithErrorHandling,
  toChecksumHexAddress,
  ChainId,
  timeoutFetch,
  safelyExecute,
} from '@metamask/controller-utils';
import type {
  NetworkClientId,
  NetworkController,
  NetworkState,
  NetworkClient,
} from '@metamask/network-controller';
import { StaticIntervalPollingControllerV1 } from '@metamask/polling-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';

import { mapOpenSeaNftV2ToV1 } from './assetsUtil';
import { Source } from './constants';
import type { OpenSeaV2GetNftResponse } from './NftController';
import {
  type NftController,
  type NftState,
  type NftMetadata,
  type OpenSeaV2ListNftsResponse,
  OpenSeaV2ChainIds,
} from './NftController';

const DEFAULT_INTERVAL = 180000;

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
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface ApiNft {
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
}

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
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface ApiNftContract {
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
  };
}

/**
 * @type ApiNftLastSale
 *
 * NFT sale object coming from OpenSea api
 * @property event_timestamp - Object containing a `username`
 * @property total_price - URI of NFT image associated with this owner
 * @property transaction - Object containing transaction_hash and block_hash
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface ApiNftLastSale {
  event_timestamp: string;
  total_price: string;
  transaction: { transaction_hash: string; block_hash: string };
}

/**
 * @type ApiNftCreator
 *
 * NFT creator object coming from OpenSea api
 * @property user - Object containing a `username`
 * @property profile_img_url - URI of NFT image associated with this owner
 * @property address - The owner address
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface ApiNftCreator {
  user: { username: string };
  profile_img_url: string;
  address: string;
}

/**
 * @type NftDetectionConfig
 *
 * NftDetection configuration
 * @property interval - Polling interval used to fetch new token rates
 * @property chainId - Current chain ID
 * @property selectedAddress - Vault selected address
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface NftDetectionConfig extends BaseConfig {
  interval: number;
  chainId: Hex;
  selectedAddress: string;
}

/**
 * Controller that passively polls on a set interval for NFT auto detection
 */
export class NftDetectionController extends StaticIntervalPollingControllerV1<
  NftDetectionConfig,
  BaseState
> {
  private intervalId?: ReturnType<typeof setTimeout>;

  private getOwnerNftApi({
    address,
    next,
  }: {
    address: string;
    next?: string;
  }) {
    return `${OPENSEA_PROXY_URL}/chain/${
      OpenSeaV2ChainIds.ethereum
    }/account/${address}/nfts?limit=200&next=${next ?? ''}`;
  }

  private async getOwnerNfts(address: string) {
    let nftApiResponse: OpenSeaV2ListNftsResponse;
    let nfts: ApiNft[] = [];
    let next;

    do {
      nftApiResponse = await fetchWithErrorHandling({
        url: this.getOwnerNftApi({ address, next }),
        timeout: 15000,
      });

      if (!nftApiResponse) {
        return nfts;
      }

      const newNfts = await Promise.all(
        nftApiResponse.nfts.map(async (nftV2) => {
          const nftV1 = mapOpenSeaNftV2ToV1(nftV2);

          // If the image hasn't been processed into OpenSea's CDN, the image_url will be null.
          // Try fetching the NFT individually, which returns the original image url from metadata if available.
          if (!nftV1.image_url && nftV2.metadata_url) {
            const nftDetails: OpenSeaV2GetNftResponse | undefined =
              await safelyExecute(() =>
                timeoutFetch(
                  this.getNftApi({
                    contractAddress: nftV2.contract,
                    tokenId: nftV2.identifier,
                  }),
                  undefined,
                  1000,
                ).then((r) => r.json()),
              );

            nftV1.image_original_url = nftDetails?.nft?.image_url ?? null;
          }
          return nftV1;
        }),
      );

      nfts = [...nfts, ...newNfts];
    } while ((next = nftApiResponse.next));

    return nfts;
  }

  /**
   * Name of this controller used during composition
   */
  override name = 'NftDetectionController';

  private readonly getOpenSeaApiKey: () => string | undefined;

  private readonly addNft: NftController['addNft'];

  private readonly getNftApi: NftController['getNftApi'];

  private readonly getNftState: () => NftState;

  private readonly getNetworkClientById: NetworkController['getNetworkClientById'];

  /**
   * Creates an NftDetectionController instance.
   *
   * @param options - The controller options.
   * @param options.chainId - The chain ID of the current network.
   * @param options.onNftsStateChange - Allows subscribing to assets controller state changes.
   * @param options.onPreferencesStateChange - Allows subscribing to preferences controller state changes.
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
   * @param options.getOpenSeaApiKey - Gets the OpenSea API key, if one is set.
   * @param options.addNft - Add an NFT.
   * @param options.getNftApi - Gets the URL to fetch an NFT from OpenSea.
   * @param options.getNftState - Gets the current state of the Assets controller.
   * @param options.getNetworkClientById - Gets the network client by ID, from the NetworkController.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      chainId: initialChainId,
      getNetworkClientById,
      onPreferencesStateChange,
      onNetworkStateChange,
      getOpenSeaApiKey,
      addNft,
      getNftApi,
      getNftState,
    }: {
      chainId: Hex;
      getNetworkClientById: NetworkController['getNetworkClientById'];
      onNftsStateChange: (listener: (nftsState: NftState) => void) => void;
      onPreferencesStateChange: (
        listener: (preferencesState: PreferencesState) => void,
      ) => void;
      onNetworkStateChange: (
        listener: (networkState: NetworkState) => void,
      ) => void;
      getOpenSeaApiKey: () => string | undefined;
      addNft: NftController['addNft'];
      getNftApi: NftController['getNftApi'];
      getNftState: () => NftState;
    },
    config?: Partial<NftDetectionConfig>,
    state?: Partial<BaseState>,
  ) {
    super(config, state);
    this.defaultConfig = {
      interval: DEFAULT_INTERVAL,
      chainId: initialChainId,
      selectedAddress: '',
      disabled: true,
    };
    this.initialize();
    this.getNftState = getNftState;
    this.getNetworkClientById = getNetworkClientById;
    onPreferencesStateChange(({ selectedAddress, useNftDetection }) => {
      const { selectedAddress: previouslySelectedAddress, disabled } =
        this.config;

      if (
        selectedAddress !== previouslySelectedAddress ||
        !useNftDetection !== disabled
      ) {
        this.configure({ selectedAddress, disabled: !useNftDetection });
      }

      if (useNftDetection !== undefined) {
        if (useNftDetection) {
          this.start();
        } else {
          this.stop();
        }
      }
    });

    onNetworkStateChange(({ providerConfig }) => {
      this.configure({
        chainId: providerConfig.chainId,
      });
    });
    this.getOpenSeaApiKey = getOpenSeaApiKey;
    this.addNft = addNft;
    this.getNftApi = getNftApi;
    this.setIntervalLength(this.config.interval);
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
    if (!this.isMainnet() || this.disabled) {
      return;
    }

    await this.startPolling();
  }

  /**
   * Stop polling for the currency rate.
   */
  stop() {
    this.stopPolling();
  }

  private stopPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  /**
   * Starts a new polling interval.
   *
   * @param interval - An interval on which to poll.
   */
  private async startPolling(interval?: number): Promise<void> {
    interval && this.configure({ interval }, false, false);
    this.stopPolling();
    await this.detectNfts();
    this.intervalId = setInterval(async () => {
      await this.detectNfts();
    }, this.config.interval);
  }

  /**
   * Checks whether network is mainnet or not.
   *
   * @returns Whether current network is mainnet.
   */
  isMainnet = (): boolean => this.config.chainId === ChainId.mainnet;

  isMainnetByNetworkClientId = (networkClient: NetworkClient): boolean => {
    return networkClient.configuration.chainId === ChainId.mainnet;
  };

  /**
   * Triggers asset ERC721 token auto detection on mainnet. Any newly detected NFTs are
   * added.
   *
   * @param options - Options bag.
   * @param options.networkClientId - The network client ID to detect NFTs on.
   * @param options.userAddress - The address to detect NFTs for.
   */
  async detectNfts(
    {
      networkClientId,
      userAddress,
    }: {
      networkClientId?: NetworkClientId;
      userAddress: string;
    } = { userAddress: this.config.selectedAddress },
  ) {
    /* istanbul ignore if */
    if (!this.isMainnet() || this.disabled) {
      return;
    }
    /* istanbul ignore else */
    if (!userAddress) {
      return;
    }

    const apiNfts = await this.getOwnerNfts(userAddress);
    const addNftPromises = apiNfts.map(async (nft: ApiNft) => {
      const {
        token_id,
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
        asset_contract: { address, schema_name },
        last_sale,
      } = nft;

      let ignored;
      /* istanbul ignore else */
      const { ignoredNfts } = this.getNftState();
      if (ignoredNfts.length) {
        ignored = ignoredNfts.find((c) => {
          /* istanbul ignore next */
          return (
            c.address === toChecksumHexAddress(address) &&
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
          creator && { creator },
          description && { description },
          image_url && { image: image_url },
          num_sales && { numberOfSales: num_sales },
          background_color && { backgroundColor: background_color },
          image_preview_url && { imagePreview: image_preview_url },
          image_thumbnail_url && { imageThumbnail: image_thumbnail_url },
          image_original_url && { imageOriginal: image_original_url },
          animation_url && { animation: animation_url },
          animation_original_url && {
            animationOriginal: animation_original_url,
          },
          schema_name && { standard: schema_name },
          external_link && { externalLink: external_link },
          last_sale && { lastSale: last_sale },
        );

        await this.addNft(address, token_id, {
          nftMetadata,
          userAddress,
          source: Source.Detected,
          networkClientId,
        });
      }
    });
    await Promise.all(addNftPromises);
  }
}

export default NftDetectionController;
