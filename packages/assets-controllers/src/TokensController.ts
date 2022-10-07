import { EventEmitter } from 'events';
import contractsMap from '@metamask/contract-metadata';
import { abiERC721 } from '@metamask/metamask-eth-abis';
import { v1 as random } from 'uuid';
import { Mutex } from 'async-mutex';
import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import { AbortController as WhatwgAbortController } from 'abort-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import {
  toChecksumHexAddress,
  MAINNET,
  ERC721_INTERFACE_ID,
  NetworkType,
} from '@metamask/controller-utils';
import type { NetworkState } from '@metamask/network-controller';
import {
  BaseController,
  BaseConfig,
  BaseState,
} from '@metamask/base-controller';
import type { Token } from './TokenRatesController';
import { TokenListToken } from './TokenListController';
import {
  formatAggregatorNames,
  formatIconUrlWithProxy,
  validateTokenToWatch,
} from './assetsUtil';
import {
  fetchTokenMetadata,
  TOKEN_METADATA_NO_SUPPORT_ERROR,
} from './token-service';

/**
 * @type TokensConfig
 *
 * Tokens controller configuration
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
 * @property tokens - List of tokens associated with the active network and address pair
 * @property ignoredTokens - List of ignoredTokens associated with the active network and address pair
 * @property detectedTokens - List of detected tokens associated with the active network and address pair
 * @property allTokens - Object containing tokens by network and account
 * @property allIgnoredTokens - Object containing hidden/ignored tokens by network and account
 * @property allDetectedTokens - Object containing tokens detected with non-zero balances
 * @property suggestedAssets - List of pending suggested assets to be added or canceled
 */
export interface TokensState extends BaseState {
  tokens: Token[];
  ignoredTokens: string[];
  detectedTokens: Token[];
  allTokens: { [key: string]: { [key: string]: Token[] } };
  allIgnoredTokens: { [key: string]: { [key: string]: string[] } };
  allDetectedTokens: { [key: string]: { [key: string]: Token[] } };
  suggestedAssets: SuggestedAssetMeta[];
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

  private abortController: WhatwgAbortController;

  private failSuggestedAsset(
    suggestedAssetMeta: SuggestedAssetMeta,
    error: unknown,
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
   * Fetch metadata for a token.
   *
   * @param tokenAddress - The address of the token.
   * @returns The token metadata.
   */
  private async fetchTokenMetadata(
    tokenAddress: string,
  ): Promise<TokenListToken | undefined> {
    try {
      const token = await fetchTokenMetadata<TokenListToken>(
        this.config.chainId,
        tokenAddress,
        this.abortController.signal,
      );
      return token;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes(TOKEN_METADATA_NO_SUPPORT_ERROR)
      ) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * EventEmitter instance used to listen to specific EIP747 events
   */
  hub = new EventEmitter();

  /**
   * Name of this controller used during composition
   */
  override name = 'TokensController';

  /**
   * Creates a TokensController instance.
   *
   * @param options - The controller options.
   * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
   * @param options.config - Initial options used to configure this controller.
   * @param options.state - Initial state to set on this controller.
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
      tokens: [],
      ignoredTokens: [],
      detectedTokens: [],
      allTokens: {},
      allIgnoredTokens: {},
      allDetectedTokens: {},
      suggestedAssets: [],
      ...state,
    };

    this.initialize();
    this.abortController = new WhatwgAbortController();

    onPreferencesStateChange(({ selectedAddress }) => {
      const { allTokens, allIgnoredTokens, allDetectedTokens } = this.state;
      const { chainId } = this.config;
      this.configure({ selectedAddress });
      this.update({
        tokens: allTokens[chainId]?.[selectedAddress] || [],
        ignoredTokens: allIgnoredTokens[chainId]?.[selectedAddress] || [],
        detectedTokens: allDetectedTokens[chainId]?.[selectedAddress] || [],
      });
    });

    onNetworkStateChange(({ provider }) => {
      const { allTokens, allIgnoredTokens, allDetectedTokens } = this.state;
      const { selectedAddress } = this.config;
      const { chainId } = provider;
      this.abortController.abort();
      this.abortController = new WhatwgAbortController();
      this.configure({ chainId });
      this.ethersProvider = this._instantiateNewEthersProvider();
      this.update({
        tokens: allTokens[chainId]?.[selectedAddress] || [],
        ignoredTokens: allIgnoredTokens[chainId]?.[selectedAddress] || [],
        detectedTokens: allDetectedTokens[chainId]?.[selectedAddress] || [],
      });
    });
  }

  _instantiateNewEthersProvider(): any {
    return new Web3Provider(this.config?.provider);
  }

  /**
   * Adds a token to the stored token list.
   *
   * @param address - Hex address of the token contract.
   * @param symbol - Symbol of the token.
   * @param decimals - Number of decimals the token uses.
   * @param image - Image of the token.
   * @returns Current token list.
   */
  async addToken(
    address: string,
    symbol: string,
    decimals: number,
    image?: string,
  ): Promise<Token[]> {
    const currentChainId = this.config.chainId;
    const releaseLock = await this.mutex.acquire();
    try {
      address = toChecksumHexAddress(address);
      const { tokens, ignoredTokens, detectedTokens } = this.state;
      const newTokens: Token[] = [...tokens];
      const [isERC721, tokenMetadata] = await Promise.all([
        this._detectIsERC721(address),
        this.fetchTokenMetadata(address),
      ]);
      if (currentChainId !== this.config.chainId) {
        throw new Error(
          'TokensController Error: Switched networks while adding token',
        );
      }
      const newEntry: Token = {
        address,
        symbol,
        decimals,
        image:
          image ||
          formatIconUrlWithProxy({
            chainId: this.config.chainId,
            tokenAddress: address,
          }),
        isERC721,
        aggregators: formatAggregatorNames(tokenMetadata?.aggregators || []),
      };
      const previousEntry = newTokens.find(
        (token) => token.address.toLowerCase() === address.toLowerCase(),
      );
      if (previousEntry) {
        const previousIndex = newTokens.indexOf(previousEntry);
        newTokens[previousIndex] = newEntry;
      } else {
        newTokens.push(newEntry);
      }

      const newIgnoredTokens = ignoredTokens.filter(
        (tokenAddress) => tokenAddress.toLowerCase() !== address.toLowerCase(),
      );
      const newDetectedTokens = detectedTokens.filter(
        (token) => token.address.toLowerCase() !== address.toLowerCase(),
      );
      const { newAllTokens, newAllIgnoredTokens, newAllDetectedTokens } =
        this._getNewAllTokensState({
          newTokens,
          newIgnoredTokens,
          newDetectedTokens,
        });

      this.update({
        tokens: newTokens,
        ignoredTokens: newIgnoredTokens,
        detectedTokens: newDetectedTokens,
        allTokens: newAllTokens,
        allIgnoredTokens: newAllIgnoredTokens,
        allDetectedTokens: newAllDetectedTokens,
      });
      return newTokens;
    } finally {
      releaseLock();
    }
  }

  /**
   * Add a batch of tokens.
   *
   * @param tokensToImport - Array of tokens to import.
   */
  async addTokens(tokensToImport: Token[]) {
    const releaseLock = await this.mutex.acquire();
    const { tokens, detectedTokens, ignoredTokens } = this.state;
    const importedTokensMap: { [key: string]: true } = {};
    // Used later to dedupe imported tokens
    const newTokensMap = tokens.reduce((output, current) => {
      output[current.address] = current;
      return output;
    }, {} as { [address: string]: Token });

    try {
      tokensToImport.forEach((tokenToAdd) => {
        const { address, symbol, decimals, image, aggregators } = tokenToAdd;
        const checksumAddress = toChecksumHexAddress(address);
        const formattedToken: Token = {
          address: checksumAddress,
          symbol,
          decimals,
          image,
          aggregators,
        };
        newTokensMap[address] = formattedToken;
        importedTokensMap[address.toLowerCase()] = true;
        return formattedToken;
      });
      const newTokens = Object.values(newTokensMap);

      const newDetectedTokens = detectedTokens.filter(
        (token) => !importedTokensMap[token.address.toLowerCase()],
      );
      const newIgnoredTokens = ignoredTokens.filter(
        (tokenAddress) => !newTokensMap[tokenAddress.toLowerCase()],
      );

      const { newAllTokens, newAllDetectedTokens, newAllIgnoredTokens } =
        this._getNewAllTokensState({
          newTokens,
          newDetectedTokens,
          newIgnoredTokens,
        });

      this.update({
        tokens: newTokens,
        allTokens: newAllTokens,
        detectedTokens: newDetectedTokens,
        allDetectedTokens: newAllDetectedTokens,
        ignoredTokens: newIgnoredTokens,
        allIgnoredTokens: newAllIgnoredTokens,
      });
    } finally {
      releaseLock();
    }
  }

  /**
   * Ignore a batch of tokens.
   *
   * @param tokenAddressesToIgnore - Array of token addresses to ignore.
   */
  ignoreTokens(tokenAddressesToIgnore: string[]) {
    const { ignoredTokens, detectedTokens, tokens } = this.state;
    const ignoredTokensMap: { [key: string]: true } = {};
    let newIgnoredTokens: string[] = [...ignoredTokens];

    const checksummedTokenAddresses = tokenAddressesToIgnore.map((address) => {
      const checksumAddress = toChecksumHexAddress(address);
      ignoredTokensMap[address.toLowerCase()] = true;
      return checksumAddress;
    });
    newIgnoredTokens = [...ignoredTokens, ...checksummedTokenAddresses];
    const newDetectedTokens = detectedTokens.filter(
      (token) => !ignoredTokensMap[token.address.toLowerCase()],
    );
    const newTokens = tokens.filter(
      (token) => !ignoredTokensMap[token.address.toLowerCase()],
    );

    const { newAllIgnoredTokens, newAllDetectedTokens, newAllTokens } =
      this._getNewAllTokensState({
        newIgnoredTokens,
        newDetectedTokens,
        newTokens,
      });

    this.update({
      ignoredTokens: newIgnoredTokens,
      tokens: newTokens,
      detectedTokens: newDetectedTokens,
      allIgnoredTokens: newAllIgnoredTokens,
      allDetectedTokens: newAllDetectedTokens,
      allTokens: newAllTokens,
    });
  }

  /**
   * Adds a batch of detected tokens to the stored token list.
   *
   * @param incomingDetectedTokens - Array of detected tokens to be added or updated.
   */
  async addDetectedTokens(incomingDetectedTokens: Token[]) {
    const releaseLock = await this.mutex.acquire();
    const { tokens, detectedTokens, ignoredTokens } = this.state;
    const newTokens: Token[] = [...tokens];
    const newDetectedTokens: Token[] = [...detectedTokens];

    try {
      incomingDetectedTokens.forEach((tokenToAdd) => {
        const { address, symbol, decimals, image, aggregators, isERC721 } =
          tokenToAdd;
        const checksumAddress = toChecksumHexAddress(address);
        const newEntry: Token = {
          address: checksumAddress,
          symbol,
          decimals,
          image,
          isERC721,
          aggregators,
        };
        const previousImportedEntry = newTokens.find(
          (token) =>
            token.address.toLowerCase() === checksumAddress.toLowerCase(),
        );
        if (previousImportedEntry) {
          // Update existing data of imported token
          const previousImportedIndex = newTokens.indexOf(
            previousImportedEntry,
          );
          newTokens[previousImportedIndex] = newEntry;
        } else {
          const ignoredTokenIndex = ignoredTokens.indexOf(address);
          if (ignoredTokenIndex === -1) {
            // Add detected token
            const previousDetectedEntry = newDetectedTokens.find(
              (token) =>
                token.address.toLowerCase() === checksumAddress.toLowerCase(),
            );
            if (previousDetectedEntry) {
              const previousDetectedIndex = newDetectedTokens.indexOf(
                previousDetectedEntry,
              );
              newDetectedTokens[previousDetectedIndex] = newEntry;
            } else {
              newDetectedTokens.push(newEntry);
            }
          }
        }
      });

      const { newAllTokens, newAllDetectedTokens } = this._getNewAllTokensState(
        {
          newTokens,
          newDetectedTokens,
        },
      );

      this.update({
        tokens: newTokens,
        allTokens: newAllTokens,
        detectedTokens: newDetectedTokens,
        allDetectedTokens: newAllDetectedTokens,
      });
    } finally {
      releaseLock();
    }
  }

  /**
   * Adds isERC721 field to token object. This is called when a user attempts to add tokens that
   * were previously added which do not yet had isERC721 field.
   *
   * @param tokenAddress - The contract address of the token requiring the isERC721 field added.
   * @returns The new token object with the added isERC721 field.
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
   * @param tokenAddress - The token contract address.
   * @returns A boolean indicating whether the token address passed in supports the EIP-721
   * interface.
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

    const tokenContract = this._createEthersContract(
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

  _createEthersContract(
    tokenAddress: string,
    abi: string,
    ethersProvider: any,
  ): Contract {
    const tokenContract = new Contract(tokenAddress, abi, ethersProvider);
    return tokenContract;
  }

  _generateRandomId(): string {
    return random();
  }

  /**
   * Adds a new suggestedAsset to state. Parameters will be validated according to
   * asset type being watched. A `<suggestedAssetMeta.id>:pending` hub event will be emitted once added.
   *
   * @param asset - The asset to be watched. For now only ERC20 tokens are accepted.
   * @param type - The asset type.
   * @returns Object containing a Promise resolving to the suggestedAsset address if accepted.
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
   * @param suggestedAssetID - The ID of the suggestedAsset to accept.
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
   * @param suggestedAssetID - The ID of the suggestedAsset to accept.
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
   * Takes a new tokens and ignoredTokens array for the current network/account combination
   * and returns new allTokens and allIgnoredTokens state to update to.
   *
   * @param params - Object that holds token params.
   * @param params.newTokens - The new tokens to set for the current network and selected account.
   * @param params.newIgnoredTokens - The new ignored tokens to set for the current network and selected account.
   * @param params.newDetectedTokens - The new detected tokens to set for the current network and selected account.
   * @returns The updated `allTokens` and `allIgnoredTokens` state.
   */
  _getNewAllTokensState(params: {
    newTokens?: Token[];
    newIgnoredTokens?: string[];
    newDetectedTokens?: Token[];
  }) {
    const { newTokens, newIgnoredTokens, newDetectedTokens } = params;
    const { allTokens, allIgnoredTokens, allDetectedTokens } = this.state;
    const { chainId, selectedAddress } = this.config;

    let newAllTokens = allTokens;
    if (newTokens) {
      const networkTokens = allTokens[chainId];
      const newNetworkTokens = {
        ...networkTokens,
        ...{ [selectedAddress]: newTokens },
      };
      newAllTokens = {
        ...allTokens,
        ...{ [chainId]: newNetworkTokens },
      };
    }

    let newAllIgnoredTokens = allIgnoredTokens;
    if (newIgnoredTokens) {
      const networkIgnoredTokens = allIgnoredTokens[chainId];
      const newIgnoredNetworkTokens = {
        ...networkIgnoredTokens,
        ...{ [selectedAddress]: newIgnoredTokens },
      };
      newAllIgnoredTokens = {
        ...allIgnoredTokens,
        ...{ [chainId]: newIgnoredNetworkTokens },
      };
    }

    let newAllDetectedTokens = allDetectedTokens;
    if (newDetectedTokens) {
      const networkDetectedTokens = allDetectedTokens[chainId];
      const newDetectedNetworkTokens = {
        ...networkDetectedTokens,
        ...{ [selectedAddress]: newDetectedTokens },
      };
      newAllDetectedTokens = {
        ...allDetectedTokens,
        ...{ [chainId]: newDetectedNetworkTokens },
      };
    }
    return { newAllTokens, newAllIgnoredTokens, newAllDetectedTokens };
  }

  /**
   * Removes all tokens from the ignored list.
   */
  clearIgnoredTokens() {
    this.update({ ignoredTokens: [], allIgnoredTokens: {} });
  }
}

export default TokensController;
