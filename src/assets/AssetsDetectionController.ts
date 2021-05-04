import { toChecksumAddress } from 'ethereumjs-util';
import contractMap from '@metamask/contract-metadata';
import BaseController, { BaseConfig, BaseState } from '../BaseController';
import type { NetworkState, NetworkType } from '../network/NetworkController';
import type { PreferencesState } from '../user/PreferencesController';
import { safelyExecute, timeoutFetch } from '../util';
import type {
  AssetsController,
  AssetsState,
  CollectibleMetadata,
} from './AssetsController';
import type { AssetsContractController } from './AssetsContractController';
import { Token } from './TokenRatesController';

const DEFAULT_INTERVAL = 180000;
const MAINNET = 'mainnet';

/**
 * @type ApiCollectible
 *
 * Collectible object coming from OpenSea api
 *
 * @property token_id - The collectible identifier
 * @property num_sales - Number of sales
 * @property background_color - The background color to be displayed with the item
 * @property image_url - URI of an image associated with this collectible
 * @property image_preview_url - URI of a smaller image associated with this collectible
 * @property image_thumbnail_url - URI of a thumbnail image associated with this collectible
 * @property image_original_url - URI of the original image associated with this collectible
 * @property animation_url - URI of a animation associated with this collectible
 * @property animation_original_url - URI of the original animation associated with this collectible
 * @property name - The collectible name
 * @property description - The collectible description
 * @property external_link - External link containing additional information
 * @property assetContract - The collectible contract information object
 * @property creator - The collectible owner information object
 * @property lastSale - When this item was last sold
 */
export interface ApiCollectible {
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
  asset_contract: ApiCollectibleContract;
  creator: ApiCollectibleCreator;
  last_sale: ApiCollectibleLastSale | null;
}

/**
 * @type ApiCollectibleContract
 *
 * Collectible contract object coming from OpenSea api
 *
 * @property address - Address of the collectible contract
 * @property asset_contract_type - The collectible type, it could be `semi-fungible` or `non-fungible`
 * @property created_date - Creation date
 * @property name - The collectible contract name
 * @property schema_name - The schema followed by the contract, it could be `ERC721` or `ERC1155`
 * @property symbol - The collectible contract symbol
 * @property total_supply - Total supply of collectibles
 * @property description - The collectible contract description
 * @property external_link - External link containing additional information
 * @property image_url - URI of an image associated with this collectible contract
 */
export interface ApiCollectibleContract {
  address: string;
  asset_contract_type: string | null;
  created_date: string | null;
  name: string | null;
  schema_name: string | null;
  symbol: string | null;
  total_supply: string | null;
  description: string | null;
  external_link: string | null;
  image_url: string | null;
}

/**
 * @type ApiCollectibleLastSale
 *
 * Collectible sale object coming from OpenSea api
 *
 * @property event_timestamp - Object containing a `username`
 * @property total_price - URI of collectible image associated with this owner
 * @property transaction - Object containing transaction_hash and block_hash
 */
export interface ApiCollectibleLastSale {
  event_timestamp: string;
  total_price: string;
  transaction: { transaction_hash: string; block_hash: string };
}

/**
 * @type ApiCollectibleCreator
 *
 * Collectible creator object coming from OpenSea api
 *
 * @property user - Object containing a `username`
 * @property profile_img_url - URI of collectible image associated with this owner
 * @property address - The owner address
 */
export interface ApiCollectibleCreator {
  user: { username: string };
  profile_img_url: string;
  address: string;
}

/**
 * @type AssetsConfig
 *
 * Assets controller configuration
 *
 * @property interval - Polling interval used to fetch new token rates
 * @property networkType - Network type ID as per net_version
 * @property selectedAddress - Vault selected address
 * @property tokens - List of tokens associated with the active vault
 */
export interface AssetsDetectionConfig extends BaseConfig {
  interval: number;
  networkType: NetworkType;
  selectedAddress: string;
  tokens: Token[];
}

/**
 * Controller that passively polls on a set interval for assets auto detection
 */
export class AssetsDetectionController extends BaseController<
  AssetsDetectionConfig,
  BaseState
> {
  private handle?: NodeJS.Timer;

  private getOwnerCollectiblesApi(address: string) {
    return `https://api.opensea.io/api/v1/assets?owner=${address}&limit=300`;
  }

  private async getOwnerCollectibles() {
    const { selectedAddress } = this.config;
    const api = this.getOwnerCollectiblesApi(selectedAddress);
    let response: Response;
    try {
      const openSeaApiKey = this.getOpenSeaApiKey();
      /* istanbul ignore if */
      if (openSeaApiKey) {
        response = await timeoutFetch(
          api,
          { headers: { 'X-API-KEY': openSeaApiKey } },
          15000,
        );
      } else {
        response = await timeoutFetch(api, {}, 15000);
      }
    } catch (e) {
      /* istanbul ignore next */
      return [];
    }
    const collectiblesArray = await response.json();
    const collectibles = collectiblesArray.assets;
    return collectibles;
  }

  /**
   * Name of this controller used during composition
   */
  name = 'AssetsDetectionController';

  private getOpenSeaApiKey: () => string | undefined;

  private getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];

  private addTokens: AssetsController['addTokens'];

  private addCollectible: AssetsController['addCollectible'];

  private getAssetsState: () => AssetsState;

  /**
   * Creates a AssetsDetectionController instance
   *
   * @param options
   * @param options.onAssetsStateChange - Allows subscribing to assets controller state changes
   * @param options.onPreferencesStateChange - Allows subscribing to preferences controller state changes
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes
   * @param options.getOpenSeaApiKey - Gets the OpenSea API key, if one is set
   * @param options.getBalancesInSingleCall - Gets the balances of a list of tokens for the given address
   * @param options.addTokens - Add a list of tokens
   * @param options.addCollectible - Add a collectible
   * @param options.getAssetsState - Gets the current state of the Assets controller
   * @param config - Initial options used to configure this controller
   * @param state - Initial state to set on this controller
   */
  constructor(
    {
      onAssetsStateChange,
      onPreferencesStateChange,
      onNetworkStateChange,
      getOpenSeaApiKey,
      getBalancesInSingleCall,
      addTokens,
      addCollectible,
      getAssetsState,
    }: {
      onAssetsStateChange: (
        listener: (assetsState: AssetsState) => void,
      ) => void;
      onPreferencesStateChange: (
        listener: (preferencesState: PreferencesState) => void,
      ) => void;
      onNetworkStateChange: (
        listener: (networkState: NetworkState) => void,
      ) => void;
      getOpenSeaApiKey: () => string | undefined;
      getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];
      addTokens: AssetsController['addTokens'];
      addCollectible: AssetsController['addCollectible'];
      getAssetsState: () => AssetsState;
    },
    config?: Partial<AssetsDetectionConfig>,
    state?: Partial<BaseState>,
  ) {
    super(config, state);
    this.defaultConfig = {
      interval: DEFAULT_INTERVAL,
      networkType: 'mainnet',
      selectedAddress: '',
      tokens: [],
    };
    this.initialize();
    this.getAssetsState = getAssetsState;
    this.addTokens = addTokens;
    onAssetsStateChange(({ tokens }) => {
      this.configure({ tokens });
    });
    onPreferencesStateChange(({ selectedAddress }) => {
      const actualSelectedAddress = this.config.selectedAddress;
      if (selectedAddress !== actualSelectedAddress) {
        this.configure({ selectedAddress });
        this.detectAssets();
      }
    });
    onNetworkStateChange(({ provider }) => {
      this.configure({ networkType: provider.type });
    });
    this.getOpenSeaApiKey = getOpenSeaApiKey;
    this.getBalancesInSingleCall = getBalancesInSingleCall;
    this.addCollectible = addCollectible;
    this.poll();
  }

  /**
   * Starts a new polling interval
   *
   * @param interval - Polling interval used to auto detect assets
   */
  async poll(interval?: number): Promise<void> {
    interval && this.configure({ interval }, false, false);
    this.handle && clearTimeout(this.handle);
    await this.detectAssets();
    this.handle = setTimeout(() => {
      this.poll(this.config.interval);
    }, this.config.interval);
  }

  /**
   * Checks whether network is mainnet or not
   *
   * @returns - Whether current network is mainnet
   */
  isMainnet() {
    if (this.config.networkType !== MAINNET || this.disabled) {
      return false;
    }
    return true;
  }

  /**
   * Detect assets owned by current account on mainnet
   */
  async detectAssets() {
    /* istanbul ignore if */
    if (!this.isMainnet()) {
      return;
    }
    this.detectTokens();
    this.detectCollectibles();
  }

  /**
   * Triggers asset ERC20 token auto detection for each contract address in contract metadata on mainnet
   */
  async detectTokens() {
    /* istanbul ignore if */
    if (!this.isMainnet()) {
      return;
    }
    const tokensAddresses = this.config.tokens.filter(
      /* istanbul ignore next*/ (token) => token.address,
    );
    const tokensToDetect: string[] = [];
    for (const address in contractMap) {
      const contract = contractMap[address];
      if (contract.erc20 && !(address in tokensAddresses)) {
        tokensToDetect.push(address);
      }
    }

    const { selectedAddress } = this.config;
    /* istanbul ignore else */
    if (!selectedAddress) {
      return;
    }
    await safelyExecute(async () => {
      const balances = await this.getBalancesInSingleCall(
        selectedAddress,
        tokensToDetect,
      );
      const tokensToAdd = [];
      for (const tokenAddress in balances) {
        let ignored;
        /* istanbul ignore else */
        const { ignoredTokens } = this.getAssetsState();
        if (ignoredTokens.length) {
          ignored = ignoredTokens.find(
            (token) => token.address === toChecksumAddress(tokenAddress),
          );
        }
        if (!ignored) {
          tokensToAdd.push({
            address: tokenAddress,
            decimals: contractMap[tokenAddress].decimals,
            symbol: contractMap[tokenAddress].symbol,
          });
        }
      }
      if (tokensToAdd.length) {
        await this.addTokens(tokensToAdd);
      }
    });
  }

  /**
   * Triggers asset ERC721 token auto detection on mainnet
   * adding new collectibles and removing not owned collectibles
   */
  async detectCollectibles() {
    /* istanbul ignore if */
    if (!this.isMainnet()) {
      return;
    }
    const { selectedAddress } = this.config;
    /* istanbul ignore else */
    if (!selectedAddress) {
      return;
    }
    await safelyExecute(async () => {
      const apiCollectibles = await this.getOwnerCollectibles();
      const addCollectiblesPromises = apiCollectibles.map(
        async (collectible: ApiCollectible) => {
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
            asset_contract: { address },
            last_sale,
          } = collectible;

          let ignored;
          /* istanbul ignore else */
          const { ignoredCollectibles } = this.getAssetsState();
          if (ignoredCollectibles.length) {
            ignored = ignoredCollectibles.find((c) => {
              /* istanbul ignore next */
              return (
                c.address === toChecksumAddress(address) &&
                c.tokenId === Number(token_id)
              );
            });
          }
          /* istanbul ignore else */
          if (!ignored) {
            /* istanbul ignore next */
            const collectibleMetadata: CollectibleMetadata = Object.assign(
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
              external_link && { externalLink: external_link },
              last_sale && { lastSale: last_sale },
            );
            await this.addCollectible(
              address,
              Number(token_id),
              collectibleMetadata,
              true,
            );
          }
        },
      );
      await Promise.all(addCollectiblesPromises);
    });
  }
}

export default AssetsDetectionController;
