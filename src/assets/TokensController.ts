import { EventEmitter } from 'events';
import contractsMap from '@metamask/contract-metadata';
import abiERC721 from 'human-standard-collectible-abi';
import { v1 as random } from 'uuid';
import { Mutex } from 'async-mutex';
import { ethers } from 'ethers';
import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type { PreferencesState } from '../user/PreferencesController';
import type { NetworkState, NetworkType } from '../network/NetworkController';
import { validateTokenToWatch, toChecksumHexAddress } from '../util';
import { MAINNET } from '../constants';
import type { Token } from './TokenRatesController';

const ERC721_INTERFACE_ID = '0x80ac58cd';
/**
 * @type TokensConfig
 *
 * Tokens controller configuration
 *
 * @property networkType - Network ID as per net_version
 * @property selectedAddress - Vault selected address
 */
export interface TokensConfig extends BaseConfig {
  networkType: NetworkType;
  selectedAddress: string;
  chainId: string;
  provider: any;
}

/**
 * @type AssetSuggestionResult
 *
 * @property result - Promise resolving to a new suggested asset address
 * @property suggestedAssetMeta - Meta information about this new suggested asset
 */
interface AssetSuggestionResult {
  result: Promise<string>;
  suggestedAssetMeta: SuggestedAssetMeta;
}

enum SuggestedAssetStatus {
  accepted = 'accepted',
  failed = 'failed',
  pending = 'pending',
  rejected = 'rejected',
}

export type SuggestedAssetMetaBase = {
  id: string;
  time: number;
  type: string;
  asset: Token;
};

/**
 * @type SuggestedAssetMeta
 *
 * Suggested asset by EIP747 meta data
 *
 * @property error - Synthesized error information for failed asset suggestions
 * @property id - Generated UUID associated with this suggested asset
 * @property status - String status of this this suggested asset
 * @property time - Timestamp associated with this this suggested asset
 * @property type - Type type this suggested asset
 * @property asset - Asset suggested object
 */
export type SuggestedAssetMeta =
  | (SuggestedAssetMetaBase & {
      status: SuggestedAssetStatus.failed;
      error: Error;
    })
  | (SuggestedAssetMetaBase & {
      status:
        | SuggestedAssetStatus.accepted
        | SuggestedAssetStatus.rejected
        | SuggestedAssetStatus.pending;
    });

/**
 * @type TokensState
 *
 * Assets controller state
 *
 * @property allTokens - Object containing tokens per account and network
 * @property suggestedAssets - List of suggested assets associated with the active vault
 * @property tokens - List of tokens associated with the active vault
 * @property ignoredTokens - List of tokens that should be ignored
 */
export interface TokensState extends BaseState {
  allTokens: { [key: string]: { [key: string]: Token[] } };
  ignoredTokens: Token[];
  suggestedAssets: SuggestedAssetMeta[];
  tokens: Token[];
}

/**
 * Controller that stores assets and exposes convenience methods
 */
export class TokensController extends BaseController<
  TokensConfig,
  TokensState
> {
  private mutex = new Mutex();

  private ethersProvider: any;

  private failSuggestedAsset(
    suggestedAssetMeta: SuggestedAssetMeta,
    error: Error,
  ) {
    const failedSuggestedAssetMeta = {
      ...suggestedAssetMeta,
      status: SuggestedAssetStatus.failed,
      error,
    };
    this.hub.emit(
      `${suggestedAssetMeta.id}:finished`,
      failedSuggestedAssetMeta,
    );
  }

  /**
   * EventEmitter instance used to listen to specific EIP747 events
   */
  hub = new EventEmitter();

  /**
   * Name of this controller used during composition
   */
  name = 'TokensController';

  /**
   * Creates a TokensController instance
   *
   * @param options
   * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes
   * @param config - Initial options used to configure this controller
   * @param state - Initial state to set on this controller
   */
  constructor({
    onPreferencesStateChange,
    onNetworkStateChange,
    config,
    state,
  }: {
    onPreferencesStateChange: (
      listener: (preferencesState: PreferencesState) => void,
    ) => void;
    onNetworkStateChange: (
      listener: (networkState: NetworkState) => void,
    ) => void;
    config?: Partial<TokensConfig>;
    state?: Partial<TokensState>;
  }) {
    super(config, state);

    this.defaultConfig = {
      networkType: MAINNET,
      selectedAddress: '',
      chainId: '',
      provider: undefined,
      ...config,
    };

    this.defaultState = {
      allTokens: {},
      ignoredTokens: [],
      suggestedAssets: [],
      tokens: [],
      ...state,
    };

    this.initialize();

    onPreferencesStateChange(({ selectedAddress }) => {
      const { allTokens } = this.state;
      const { chainId } = this.config;
      this.configure({ selectedAddress });
      this.update({
        tokens: allTokens[selectedAddress]?.[chainId] || [],
      });
    });
    onNetworkStateChange(({ provider }) => {
      const { allTokens } = this.state;
      const { selectedAddress } = this.config;
      const { chainId } = provider;
      this.configure({ chainId });
      this.ethersProvider = this._instantiateNewEthersProvider();
      this.update({
        tokens: allTokens[selectedAddress]?.[chainId] || [],
      });
    });
  }

  _instantiateNewEthersProvider(): any {
    return new ethers.providers.Web3Provider(this.config?.provider);
  }

  /**
   * Adds a token to the stored token list
   *
   * @param address - Hex address of the token contract
   * @param symbol - Symbol of the token
   * @param decimals - Number of decimals the token uses
   * @param image - Image of the token
   * @returns - Current token list
   */
  async addToken(
    address: string,
    symbol: string,
    decimals: number,
    image?: string,
  ): Promise<Token[]> {
    const releaseLock = await this.mutex.acquire();
    try {
      address = toChecksumHexAddress(address);
      const { allTokens, tokens } = this.state;
      const { chainId, selectedAddress } = this.config;
      const isERC721 = await this._detectIsERC721(address);
      const newEntry: Token = { address, symbol, decimals, image, isERC721 };
      const previousEntry = tokens.find((token) => token.address === address);
      if (previousEntry) {
        const previousIndex = tokens.indexOf(previousEntry);
        tokens[previousIndex] = newEntry;
      } else {
        tokens.push(newEntry);
      }
      const addressTokens = allTokens[selectedAddress];
      const newAddressTokens = { ...addressTokens, ...{ [chainId]: tokens } };
      const newAllTokens = {
        ...allTokens,
        ...{ [selectedAddress]: newAddressTokens },
      };
      const newTokens = [...tokens];
      this.update({ allTokens: newAllTokens, tokens: newTokens });
      return newTokens;
    } finally {
      releaseLock();
    }
  }

  /**
   * Adds a batch of tokens to the stored token list
   *
   * @param tokens - Array of Tokens to be added or updated
   * @returns - Current token list
   */
  async addTokens(tokensToAdd: Token[]): Promise<Token[]> {
    const releaseLock = await this.mutex.acquire();
    const { allTokens, tokens } = this.state;
    const { chainId, selectedAddress } = this.config;

    try {
      tokensToAdd = await Promise.all(
        tokensToAdd.map(async (token) => {
          token.isERC721 = await this._detectIsERC721(token.address);
          return token;
        }),
      );

      tokensToAdd.forEach((tokenToAdd) => {
        const { address, symbol, decimals, image, isERC721 } = tokenToAdd;
        const checksumAddress = toChecksumHexAddress(address);
        const newEntry: Token = {
          address: checksumAddress,
          symbol,
          decimals,
          image,
          isERC721,
        };
        const previousEntry = tokens.find(
          (token) => token.address === checksumAddress,
        );
        if (previousEntry) {
          const previousIndex = tokens.indexOf(previousEntry);
          tokens[previousIndex] = newEntry;
        } else {
          tokens.push(newEntry);
        }
      });
      const addressTokens = allTokens[selectedAddress];
      const newAddressTokens = { ...addressTokens, ...{ [chainId]: tokens } };
      const newAllTokens = {
        ...allTokens,
        ...{ [selectedAddress]: newAddressTokens },
      };
      const newTokens = [...tokens];
      this.update({ allTokens: newAllTokens, tokens: newTokens });

      return newTokens;
    } finally {
      releaseLock();
    }
  }

  /**
   * Adds isERC721 field to token object
   * (Called when a user attempts to add tokens that were previously added which do not yet had isERC721 field)
   *
   * @param {string} tokenAddress - The contract address of the token requiring the isERC721 field added.
   * @returns The new token object with the added isERC721 field.
   *
   */
  async updateTokenType(tokenAddress: string) {
    const isERC721 = await this._detectIsERC721(tokenAddress);
    const { tokens } = this.state;
    const tokenIndex = tokens.findIndex((token) => {
      return token.address === tokenAddress;
    });
    tokens[tokenIndex].isERC721 = isERC721;
    this.update({ tokens });
    return tokens[tokenIndex];
  }

  /**
   * Detects whether or not a token is ERC-721 compatible.
   *
   * @param {string} tokensAddress - the token contract address.
   * @returns boolean indicating whether the token address passed in supports the EIP-721 interface.
   *
   */
  async _detectIsERC721(tokenAddress: string) {
    const checksumAddress = toChecksumHexAddress(tokenAddress);
    // if this token is already in our contract metadata map we don't need
    // to check against the contract
    if (contractsMap[checksumAddress]?.erc721 === true) {
      return Promise.resolve(true);
    }
    const tokenContract = await this._createEthersContract(
      tokenAddress,
      abiERC721,
      this.ethersProvider,
    );
    try {
      return await tokenContract.supportsInterface(ERC721_INTERFACE_ID);
    } catch (error: any) {
      // currently error.code === UNPREDICTABLE_GAS_LIMIT is our best way of
      // determining when a token is ERC20 (or not ERC721 compatible)
      // its possible this has to do with the fact that ERC20's don't need to
      // implement the supportsInterface method. But more research should be done here.
      if (error?.code === 'UNPREDICTABLE_GAS_LIMIT') {
        return false;
      }
      throw error;
    }
  }

  async _createEthersContract(
    tokenAddress: string,
    abi: string,
    ethersProvider: any,
  ): Promise<any> {
    const tokenContract = await new ethers.Contract(
      tokenAddress,
      abi,
      ethersProvider,
    );
    return tokenContract;
  }

  _generateRandomId(): string {
    return random();
  }

  /**
   * Adds a new suggestedAsset to state. Parameters will be validated according to
   * asset type being watched. A `<suggestedAssetMeta.id>:pending` hub event will be emitted once added.
   *
   * @param asset - Asset to be watched. For now only ERC20 tokens are accepted.
   * @param type - Asset type
   * @returns - Object containing a promise resolving to the suggestedAsset address if accepted
   */
  async watchAsset(asset: Token, type: string): Promise<AssetSuggestionResult> {
    const suggestedAssetMeta = {
      asset,
      id: this._generateRandomId(),
      status: SuggestedAssetStatus.pending as SuggestedAssetStatus.pending,
      time: Date.now(),
      type,
    };
    try {
      switch (type) {
        case 'ERC20':
          validateTokenToWatch(asset);
          break;
        default:
          throw new Error(`Asset of type ${type} not supported`);
      }
    } catch (error) {
      this.failSuggestedAsset(suggestedAssetMeta, error);
      return Promise.reject(error);
    }

    const result: Promise<string> = new Promise((resolve, reject) => {
      this.hub.once(
        `${suggestedAssetMeta.id}:finished`,
        (meta: SuggestedAssetMeta) => {
          switch (meta.status) {
            case SuggestedAssetStatus.accepted:
              return resolve(meta.asset.address);
            case SuggestedAssetStatus.rejected:
              return reject(new Error('User rejected to watch the asset.'));
            case SuggestedAssetStatus.failed:
              return reject(new Error(meta.error.message));
            /* istanbul ignore next */
            default:
              return reject(new Error(`Unknown status: ${meta.status}`));
          }
        },
      );
    });

    const { suggestedAssets } = this.state;
    suggestedAssets.push(suggestedAssetMeta);
    this.update({ suggestedAssets: [...suggestedAssets] });
    this.hub.emit('pendingSuggestedAsset', suggestedAssetMeta);
    return { result, suggestedAssetMeta };
  }

  /**
   * Accepts to watch an asset and updates it's status and deletes the suggestedAsset from state,
   * adding the asset to corresponding asset state. In this case ERC20 tokens.
   * A `<suggestedAssetMeta.id>:finished` hub event is fired after accepted or failure.
   *
   * @param suggestedAssetID - ID of the suggestedAsset to accept
   * @returns - Promise resolving when this operation completes
   */
  async acceptWatchAsset(suggestedAssetID: string): Promise<void> {
    const { suggestedAssets } = this.state;
    const index = suggestedAssets.findIndex(
      ({ id }) => suggestedAssetID === id,
    );
    const suggestedAssetMeta = suggestedAssets[index];
    try {
      switch (suggestedAssetMeta.type) {
        case 'ERC20':
          const { address, symbol, decimals, image } = suggestedAssetMeta.asset;
          await this.addToken(address, symbol, decimals, image);
          suggestedAssetMeta.status = SuggestedAssetStatus.accepted;
          this.hub.emit(
            `${suggestedAssetMeta.id}:finished`,
            suggestedAssetMeta,
          );
          break;
        default:
          throw new Error(
            `Asset of type ${suggestedAssetMeta.type} not supported`,
          );
      }
    } catch (error) {
      this.failSuggestedAsset(suggestedAssetMeta, error);
    }
    const newSuggestedAssets = suggestedAssets.filter(
      ({ id }) => id !== suggestedAssetID,
    );
    this.update({ suggestedAssets: [...newSuggestedAssets] });
  }

  /**
   * Rejects a watchAsset request based on its ID by setting its status to "rejected"
   * and emitting a `<suggestedAssetMeta.id>:finished` hub event.
   *
   * @param suggestedAssetID - ID of the suggestedAsset to accept
   */
  rejectWatchAsset(suggestedAssetID: string) {
    const { suggestedAssets } = this.state;
    const index = suggestedAssets.findIndex(
      ({ id }) => suggestedAssetID === id,
    );
    const suggestedAssetMeta = suggestedAssets[index];
    if (!suggestedAssetMeta) {
      return;
    }
    suggestedAssetMeta.status = SuggestedAssetStatus.rejected;
    this.hub.emit(`${suggestedAssetMeta.id}:finished`, suggestedAssetMeta);
    const newSuggestedAssets = suggestedAssets.filter(
      ({ id }) => id !== suggestedAssetID,
    );
    this.update({ suggestedAssets: [...newSuggestedAssets] });
  }

  /**
   * Removes a token from the stored token list and saves it in ignored tokens list
   *
   * @param address - Hex address of the token contract
   */
  removeAndIgnoreToken(address: string) {
    address = toChecksumHexAddress(address);
    const { allTokens, tokens, ignoredTokens } = this.state;
    const { chainId, selectedAddress } = this.config;
    const newIgnoredTokens = [...ignoredTokens];
    const newTokens = tokens.filter((token) => {
      if (token.address === address) {
        const alreadyIgnored = newIgnoredTokens.find(
          (t) => t.address === address,
        );
        !alreadyIgnored && newIgnoredTokens.push(token);
        return false;
      }
      return true;
    });

    if(!newIgnoredTokens.find((token: Token) => token.address === address)){
      newIgnoredTokens.push({address: address, decimals: 0, symbol: ''})
    }

    const addressTokens = allTokens[selectedAddress];
    const newAddressTokens = { ...addressTokens, ...{ [chainId]: newTokens } };
    const newAllTokens = {
      ...allTokens,
      ...{ [selectedAddress]: newAddressTokens },
    };
    this.update({
      allTokens: newAllTokens,
      tokens: newTokens,
      ignoredTokens: newIgnoredTokens,
    });
  }

  /**
   * Removes a token from the stored token list
   *
   * @param address - Hex address of the token contract
   */
  removeToken(address: string) {
    address = toChecksumHexAddress(address);
    const { allTokens, tokens } = this.state;
    const { chainId, selectedAddress } = this.config;
    const newTokens = tokens.filter((token) => token.address !== address);
    const addressTokens = allTokens[selectedAddress];
    const newAddressTokens = { ...addressTokens, ...{ [chainId]: newTokens } };
    const newAllTokens = {
      ...allTokens,
      ...{ [selectedAddress]: newAddressTokens },
    };
    this.update({ allTokens: newAllTokens, tokens: newTokens });
  }

  /**
   * Removes all tokens from the ignored list
   */
  clearIgnoredTokens() {
    this.update({ ignoredTokens: [] });
  }
}

export default TokensController;
