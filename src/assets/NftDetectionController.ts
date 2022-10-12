import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type { NetworkState, NetworkType } from '../network/NetworkController';
import type { PreferencesState } from '../user/PreferencesController';
import { fetchWithErrorHandling, toChecksumHexAddress } from '../util';
import { MAINNET, OPENSEA_PROXY_URL, OPENSEA_API_URL } from '../constants';

import type { NftController, NftState, NftMetadata } from './NftController';

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
 * @property networkType - Network type ID as per net_version
 * @property selectedAddress - Vault selected address
 * @property tokens - List of tokens associated with the active vault
 */
export interface NftDetectionConfig extends BaseConfig {
  interval: number;
  networkType: NetworkType;
  chainId: `0x${string}` | `${number}` | number;
  selectedAddress: string;
}

/**
 * Controller that passively polls on a set interval for NFT auto detection
 */
export class NftDetectionController extends BaseController<
  NftDetectionConfig,
  BaseState
> {
  private intervalId?: NodeJS.Timeout;

  private getOwnerNftApi({
    address,
    offset,
    useProxy,
  }: {
    address: string;
    offset: number;
    useProxy: boolean;
  }) {
    return useProxy
      ? `${OPENSEA_PROXY_URL}/assets?owner=${address}&offset=${offset}&limit=50`
      : `${OPENSEA_API_URL}/assets?owner=${address}&offset=${offset}&limit=50`;
  }

  private async getOwnerNfts(address: string) {
    let nftApiResponse: { assets: ApiNft[] };
    let nfts: ApiNft[] = [];
    const openSeaApiKey = this.getOpenSeaApiKey();
    let offset = 0;
    let pagingFinish = false;
    /* istanbul ignore if */
    do {
      nftApiResponse = await fetchWithErrorHandling({
        url: this.getOwnerNftApi({ address, offset, useProxy: true }),
        timeout: 15000,
      });

      if (openSeaApiKey && !nftApiResponse) {
        nftApiResponse = await fetchWithErrorHandling({
          url: this.getOwnerNftApi({
            address,
            offset,
            useProxy: false,
          }),
          options: { headers: { 'X-API-KEY': openSeaApiKey } },
          timeout: 15000,
          // catch 403 errors (in case API key is down we don't want to blow up)
          errorCodesToCatch: [403],
        });
      }

      if (!nftApiResponse) {
        return nfts;
      }

      nftApiResponse?.assets?.length !== 0
        ? (nfts = [...nfts, ...nftApiResponse.assets])
        : (pagingFinish = true);
      offset += 50;
    } while (!pagingFinish);

    return nfts;
  }

  /**
   * Name of this controller used during composition
   */
  override name = 'NftDetectionController';

  private getOpenSeaApiKey: () => string | undefined;

  private addNft: NftController['addNft'];

  private getNftState: () => NftState;

  /**
   * Creates a NftDetectionController instance.
   *
   * @param options - The controller options.
   * @param options.onNftsStateChange - Allows subscribing to assets controller state changes.
   * @param options.onPreferencesStateChange - Allows subscribing to preferences controller state changes.
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
   * @param options.getOpenSeaApiKey - Gets the OpenSea API key, if one is set.
   * @param options.addNft - Add an NFT.
   * @param options.getNftState - Gets the current state of the Assets controller.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      onPreferencesStateChange,
      onNetworkStateChange,
      getOpenSeaApiKey,
      addNft,
      getNftState,
    }: {
      onNftsStateChange: (listener: (nftsState: NftState) => void) => void;
      onPreferencesStateChange: (
        listener: (preferencesState: PreferencesState) => void,
      ) => void;
      onNetworkStateChange: (
        listener: (networkState: NetworkState) => void,
      ) => void;
      getOpenSeaApiKey: () => string | undefined;
      addNft: NftController['addNft'];
      getNftState: () => NftState;
    },
    config?: Partial<NftDetectionConfig>,
    state?: Partial<BaseState>,
  ) {
    super(config, state);
    this.defaultConfig = {
      interval: DEFAULT_INTERVAL,
      networkType: MAINNET,
      chainId: '1',
      selectedAddress: '',
      disabled: true,
    };
    this.initialize();
    this.getNftState = getNftState;
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

    onNetworkStateChange(({ provider }) => {
      this.configure({
        networkType: provider.type,
        chainId: provider.chainId as NftDetectionConfig['chainId'],
      });
    });
    this.getOpenSeaApiKey = getOpenSeaApiKey;
    this.addNft = addNft;
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
  isMainnet = (): boolean => this.config.networkType === MAINNET;

  /**
   * Triggers asset ERC721 token auto detection on mainnet. Any newly detected NFTs are
   * added.
   */
  async detectNfts() {
    /* istanbul ignore if */
    if (!this.isMainnet() || this.disabled) {
      return;
    }
    const { selectedAddress, chainId } = this.config;

    /* istanbul ignore else */
    if (!selectedAddress) {
      return;
    }

    const apiNfts = await this.getOwnerNfts(selectedAddress);
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

        await this.addNft(address, token_id, nftMetadata, {
          userAddress: selectedAddress,
          chainId: chainId as string,
        });
      }
    });
    await Promise.all(addNftPromises);
  }
}

export default NftDetectionController;
