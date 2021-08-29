import { EventEmitter } from 'events';
import contractsMap from '@metamask/contract-metadata';
import abiERC721 from 'human-standard-collectible-abi';
import { v1 as random } from 'uuid';
import { Mutex } from 'async-mutex';
import { ethers } from 'ethers';
import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type { PreferencesState } from '../user/PreferencesController';
import type { NetworkState, NetworkType } from '../network/NetworkController';
import {
  validateTokenToWatch,
  toChecksumHexAddress,
  coerceToError,
} from '../util';
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
 * @property allTokens - Object containing tokens by network and account
 * @property suggestedAssets - List of pending suggested assets to be added or canceled
 * @property tokens - List of tokens associated with the active network and address pair
 * @property ignoredTokens - List of ignoredTokens associated with the active network and address pair
 * @property allIgnoredTokens - Object containing hidden/ignored tokens by network and account
 */
export interface TokensState extends BaseState {
  allTokens: { [key: string]: { [key: string]: Token[] } };
  allIgnoredTokens: { [key: string]: { [key: string]: string[] } };
  ignoredTokens: string[];
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
      allIgnoredTokens: {},
      ignoredTokens: [],
      suggestedAssets: [],
      tokens: [],
      ...state,
    };

    this.initialize();

    onPreferencesStateChange(({ selectedAddress }) => {
      const { allTokens, allIgnoredTokens } = this.state;
      const { chainId } = this.config;
      this.configure({ selectedAddress });
      this.update({
        tokens: allTokens[chainId]?.[selectedAddress] || [],
        ignoredTokens: allIgnoredTokens[chainId]?.[selectedAddress] || [],
      });
    });
    onNetworkStateChange(({ provider }) => {
      const { allTokens, allIgnoredTokens } = this.state;
      const { selectedAddress } = this.config;
      const { chainId } = provider;
      this.configure({ chainId });
      this.ethersProvider = this._instantiateNewEthersProvider();
      this.update({
        tokens: allTokens[chainId]?.[selectedAddress] || [],
        ignoredTokens: allIgnoredTokens[chainId]?.[selectedAddress] || [],
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
      const { tokens, ignoredTokens } = this.state;
      const isERC721 = await this._detectIsERC721(address);
      const newEntry: Token = { address, symbol, decimals, image, isERC721 };
      const previousEntry = tokens.find(
        (token) => token.address.toLowerCase() === address.toLowerCase(),
      );
      if (previousEntry) {
        const previousIndex = tokens.indexOf(previousEntry);
        tokens[previousIndex] = newEntry;
      } else {
        tokens.push(newEntry);
      }

      const newIgnoredTokens = ignoredTokens.filter(
        (tokenAddress) => tokenAddress.toLowerCase() !== address.toLowerCase(),
      );
      const { newAllTokens, newAllIgnoredTokens } = this._getNewAllTokensState(
        tokens,
        newIgnoredTokens,
      );

      this.update({
        allTokens: newAllTokens,
        tokens,
        allIgnoredTokens: newAllIgnoredTokens,
        ignoredTokens: newIgnoredTokens,
      });
      return tokens;
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
    const { tokens, ignoredTokens } = this.state;

    try {
      tokensToAdd = await Promise.all(
        tokensToAdd.map(async (token) => {
          token.isERC721 = await this._detectIsERC721(token.address);
          return token;
        }),
      );

      let newIgnoredTokens = ignoredTokens;

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
          (token) =>
            token.address.toLowerCase() === checksumAddress.toLowerCase(),
        );
        if (previousEntry) {
          const previousIndex = tokens.indexOf(previousEntry);
          tokens[previousIndex] = newEntry;
        } else {
          tokens.push(newEntry);
        }

        newIgnoredTokens = newIgnoredTokens.filter(
          (tokenAddress) =>
            tokenAddress.toLowerCase() !== address.toLowerCase(),
        );
      });

      const { newAllTokens, newAllIgnoredTokens } = this._getNewAllTokensState(
        tokens,
        newIgnoredTokens,
      );

      this.update({
        tokens,
        allTokens: newAllTokens,
        allIgnoredTokens: newAllIgnoredTokens,
        ignoredTokens: newIgnoredTokens,
      });

      return tokens;
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
      return token.address.toLowerCase() === tokenAddress.toLowerCase();
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
    } else if (contractsMap[checksumAddress]?.erc20 === true) {
      return Promise.resolve(false);
    }

    const tokenContract = await this._createEthersContract(
      tokenAddress,
      abiERC721,
      this.ethersProvider,
    );
    try {
      return await tokenContract.supportsInterface(ERC721_INTERFACE_ID);
    } catch (error: any) {
      // currently we see a variety of errors across different networks when
      // token contracts are not ERC721 compatible. We need to figure out a better
      // way of differentiating token interface types but for now if we get an error
      // we have to assume the token is not ERC721 compatible.
      return false;
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
    } catch (thrown) {
      const error = coerceToError(thrown);
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
    } catch (thrown) {
      this.failSuggestedAsset(suggestedAssetMeta, coerceToError(thrown));
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
    const { tokens, ignoredTokens } = this.state;

    const alreadyIgnored = ignoredTokens.find(
      (tokenAddress) => tokenAddress.toLowerCase() === address.toLowerCase(),
    );

    const newTokens = tokens.filter((token) => {
      if (token.address.toLowerCase() === address.toLowerCase()) {
        !alreadyIgnored && ignoredTokens.push(address);
        return false;
      }
      return true;
    });

    const { newAllTokens, newAllIgnoredTokens } = this._getNewAllTokensState(
      newTokens,
      ignoredTokens,
    );

    this.update({
      allTokens: newAllTokens,
      tokens: newTokens,
      allIgnoredTokens: newAllIgnoredTokens,
      ignoredTokens,
    });
  }

  /**
   * Takes a new tokens and ignoredTokens array for the current network/account combination
   * and returns new allTokens and allIgnoredTokens state to update to.
   *
   * @param newTokens - The new tokens to set for the current network and selected account.
   * @param newIgnoredTokens - The new ignored tokens to set for the current network and selected account.
   * @returns The updated `allTokens` and `allIgnoredTokens` state.
   */
  _getNewAllTokensState(newTokens: Token[], newIgnoredTokens: string[]) {
    const { allTokens, allIgnoredTokens } = this.state;
    const { chainId, selectedAddress } = this.config;
    const networkTokens = allTokens[chainId];
    const networkIgnoredTokens = allIgnoredTokens[chainId];

    const newNetworkTokens = {
      ...networkTokens,
      ...{ [selectedAddress]: newTokens },
    };
    const newIgnoredNetworkTokens = {
      ...networkIgnoredTokens,
      ...{ [selectedAddress]: newIgnoredTokens },
    };

    const newAllTokens = {
      ...allTokens,
      ...{ [chainId]: newNetworkTokens },
    };

    const newAllIgnoredTokens = {
      ...allIgnoredTokens,
      ...{ [chainId]: newIgnoredNetworkTokens },
    };
    return { newAllTokens, newAllIgnoredTokens };
  }

  /**
   * Removes all tokens from the ignored list
   */
  clearIgnoredTokens() {
    this.update({ ignoredTokens: [], allIgnoredTokens: {} });
  }
}

export default TokensController;
