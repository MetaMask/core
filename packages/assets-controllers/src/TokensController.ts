import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import type { AddApprovalRequest } from '@metamask/approval-controller';
import type {
  BaseConfig,
  BaseState,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import contractsMap from '@metamask/contract-metadata';
import {
  toChecksumHexAddress,
  ERC721_INTERFACE_ID,
  ORIGIN_METAMASK,
  ApprovalType,
  ERC20,
} from '@metamask/controller-utils';
import { abiERC721 } from '@metamask/metamask-eth-abis';
import type {
  NetworkClientId,
  NetworkController,
  NetworkState,
} from '@metamask/network-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';
import { AbortController as WhatwgAbortController } from 'abort-controller';
import { Mutex } from 'async-mutex';
import { EventEmitter } from 'events';
import { v1 as random } from 'uuid';

import type { AssetsContractController } from './AssetsContractController';
import {
  formatAggregatorNames,
  formatIconUrlWithProxy,
  validateTokenToWatch,
} from './assetsUtil';
import {
  fetchTokenMetadata,
  TOKEN_METADATA_NO_SUPPORT_ERROR,
} from './token-service';
import type {
  TokenListMap,
  TokenListState,
  TokenListToken,
} from './TokenListController';
import type { Token } from './TokenRatesController';

/**
 * @type TokensConfig
 *
 * Tokens controller configuration
 * @property selectedAddress - Vault selected address
 */
export interface TokensConfig extends BaseConfig {
  selectedAddress: string;
  chainId: Hex;
  provider: any;
}

/**
 * @type SuggestedAssetMeta
 *
 * Suggested asset by EIP747 meta data
 * @property id - Generated UUID associated with this suggested asset
 * @property time - Timestamp associated with this this suggested asset
 * @property type - Type type this suggested asset
 * @property asset - Asset suggested object
 * @property interactingAddress - Account address that requested watch asset
 */
type SuggestedAssetMeta = {
  id: string;
  time: number;
  type: string;
  asset: Token;
  interactingAddress: string;
};

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
 */
export interface TokensState extends BaseState {
  tokens: Token[];
  ignoredTokens: string[];
  detectedTokens: Token[];
  allTokens: { [chainId: Hex]: { [key: string]: Token[] } };
  allIgnoredTokens: { [chainId: Hex]: { [key: string]: string[] } };
  allDetectedTokens: { [chainId: Hex]: { [key: string]: Token[] } };
}

/**
 * The name of the {@link TokensController}.
 */
const controllerName = 'TokensController';

/**
 * The external actions available to the {@link TokensController}.
 */
type AllowedActions = AddApprovalRequest;

/**
 * The messenger of the {@link TokensController}.
 */
export type TokensControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  AllowedActions,
  never,
  AllowedActions['type'],
  never
>;

/**
 * Controller that stores assets and exposes convenience methods
 */
export class TokensController extends BaseController<
  TokensConfig,
  TokensState
> {
  private readonly mutex = new Mutex();

  private abortController: WhatwgAbortController;

  private readonly messagingSystem: TokensControllerMessenger;

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

  private readonly getERC20TokenName: AssetsContractController['getERC20TokenName'];

  private readonly getNetworkClientById: NetworkController['getNetworkClientById'];

  /**
   * Creates a TokensController instance.
   *
   * @param options - The controller options.
   * @param options.chainId - The chain ID of the current network.
   * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
   * @param options.onTokenListStateChange - Allows subscribing to token list controller state changes.
   * @param options.getERC20TokenName - Gets the ERC-20 token name.
   * @param options.getNetworkClientById - Gets the network client with the given id from the NetworkController.
   * @param options.config - Initial options used to configure this controller.
   * @param options.state - Initial state to set on this controller.
   * @param options.messenger - The controller messenger.
   */
  constructor({
    chainId: initialChainId,
    onPreferencesStateChange,
    onNetworkStateChange,
    onTokenListStateChange,
    getERC20TokenName,
    getNetworkClientById,
    config,
    state,
    messenger,
  }: {
    chainId: Hex;
    onPreferencesStateChange: (
      listener: (preferencesState: PreferencesState) => void,
    ) => void;
    onNetworkStateChange: (
      listener: (networkState: NetworkState) => void,
    ) => void;
    onTokenListStateChange: (
      listener: (tokenListState: TokenListState) => void,
    ) => void;
    getERC20TokenName: AssetsContractController['getERC20TokenName'];
    getNetworkClientById: NetworkController['getNetworkClientById'];
    config?: Partial<TokensConfig>;
    state?: Partial<TokensState>;
    messenger: TokensControllerMessenger;
  }) {
    super(config, state);

    this.defaultConfig = {
      selectedAddress: '',
      chainId: initialChainId,
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
      ...state,
    };

    this.initialize();
    this.abortController = new WhatwgAbortController();
    this.getERC20TokenName = getERC20TokenName;
    this.getNetworkClientById = getNetworkClientById;

    this.messagingSystem = messenger;

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

    onNetworkStateChange(({ providerConfig }) => {
      const { allTokens, allIgnoredTokens, allDetectedTokens } = this.state;
      const { selectedAddress } = this.config;
      const { chainId } = providerConfig;
      this.abortController.abort();
      this.abortController = new WhatwgAbortController();
      this.configure({ chainId });
      this.update({
        tokens: allTokens[chainId]?.[selectedAddress] || [],
        ignoredTokens: allIgnoredTokens[chainId]?.[selectedAddress] || [],
        detectedTokens: allDetectedTokens[chainId]?.[selectedAddress] || [],
      });
    });

    onTokenListStateChange(({ tokenList }) => {
      const { tokens } = this.state;
      if (tokens.length && !tokens[0].name) {
        this.updateTokensAttribute(tokenList, 'name');
      }
    });
  }

  /**
   * Adds a token to the stored token list.
   *
   * @param options - The method argument object.
   * @param options.address - Hex address of the token contract.
   * @param options.symbol - Symbol of the token.
   * @param options.decimals - Number of decimals the token uses.
   * @param options.name - Name of the token.
   * @param options.image - Image of the token.
   * @param options.interactingAddress - The address of the account to add a token to.
   * @param options.networkClientId - Network Client ID.
   * @returns Current token list.
   */
  async addToken({
    address,
    symbol,
    decimals,
    name,
    image,
    interactingAddress,
    networkClientId,
  }: {
    address: string;
    symbol: string;
    decimals: number;
    name?: string;
    image?: string;
    interactingAddress?: string;
    networkClientId?: NetworkClientId;
  }): Promise<Token[]> {
    const { allTokens, allIgnoredTokens, allDetectedTokens } = this.state;
    const { chainId, selectedAddress } = this.config;
    let currentChainId = chainId;
    if (networkClientId) {
      currentChainId =
        this.getNetworkClientById(networkClientId).configuration.chainId;
    }

    const accountAddress = interactingAddress || selectedAddress;
    const isInteractingWithWalletAccount = accountAddress === selectedAddress;
    const releaseLock = await this.mutex.acquire();

    try {
      address = toChecksumHexAddress(address);
      const tokens = allTokens[currentChainId]?.[accountAddress] || [];
      const ignoredTokens =
        allIgnoredTokens[currentChainId]?.[accountAddress] || [];
      const detectedTokens =
        allDetectedTokens[currentChainId]?.[accountAddress] || [];
      const newTokens: Token[] = [...tokens];
      const [isERC721, tokenMetadata] = await Promise.all([
        this._detectIsERC721(address, networkClientId),
        this.fetchTokenMetadata(address),
      ]);
      if (!networkClientId && currentChainId !== this.config.chainId) {
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
            chainId: currentChainId,
            tokenAddress: address,
          }),
        isERC721,
        aggregators: formatAggregatorNames(tokenMetadata?.aggregators || []),
        name,
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
          interactingAddress: accountAddress,
          interactingChainId: currentChainId,
        });

      let newState: Partial<TokensState> = {
        allTokens: newAllTokens,
        allIgnoredTokens: newAllIgnoredTokens,
        allDetectedTokens: newAllDetectedTokens,
      };

      // Only update active tokens if user is interacting with their active wallet account.
      if (isInteractingWithWalletAccount) {
        newState = {
          ...newState,
          tokens: newTokens,
          ignoredTokens: newIgnoredTokens,
          detectedTokens: newDetectedTokens,
        };
      }

      this.update(newState);
      return newTokens;
    } finally {
      releaseLock();
    }
  }

  /**
   * Add a batch of tokens.
   *
   * @param tokensToImport - Array of tokens to import.
   * @param networkClientId - Optional network client ID used to determine interacting chain ID.
   */
  async addTokens(tokensToImport: Token[], networkClientId?: NetworkClientId) {
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
        const { address, symbol, decimals, image, aggregators, name } =
          tokenToAdd;
        const checksumAddress = toChecksumHexAddress(address);
        const formattedToken: Token = {
          address: checksumAddress,
          symbol,
          decimals,
          image,
          aggregators,
          name,
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

      let interactingChainId;
      if (networkClientId) {
        interactingChainId =
          this.getNetworkClientById(networkClientId).configuration.chainId;
      }

      const { newAllTokens, newAllDetectedTokens, newAllIgnoredTokens } =
        this._getNewAllTokensState({
          newTokens,
          newDetectedTokens,
          newIgnoredTokens,
          interactingChainId,
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
   * @param detectionDetails - An object containing the chain ID and address of the currently selected network on which the incomingDetectedTokens were detected.
   * @param detectionDetails.selectedAddress - the account address on which the incomingDetectedTokens were detected.
   * @param detectionDetails.chainId - the chainId on which the incomingDetectedTokens were detected.
   */
  async addDetectedTokens(
    incomingDetectedTokens: Token[],
    detectionDetails?: { selectedAddress: string; chainId: Hex },
  ) {
    const releaseLock = await this.mutex.acquire();
    const { tokens, detectedTokens, ignoredTokens } = this.state;
    const newTokens: Token[] = [...tokens];
    let newDetectedTokens: Token[] = [...detectedTokens];

    try {
      incomingDetectedTokens.forEach((tokenToAdd) => {
        const {
          address,
          symbol,
          decimals,
          image,
          aggregators,
          isERC721,
          name,
        } = tokenToAdd;
        const checksumAddress = toChecksumHexAddress(address);
        const newEntry: Token = {
          address: checksumAddress,
          symbol,
          decimals,
          image,
          isERC721,
          aggregators,
          name,
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

      const {
        selectedAddress: interactingAddress,
        chainId: interactingChainId,
      } = detectionDetails || {};

      const { newAllTokens, newAllDetectedTokens } = this._getNewAllTokensState(
        {
          newTokens,
          newDetectedTokens,
          interactingAddress,
          interactingChainId,
        },
      );

      const { chainId, selectedAddress } = this.config;
      // if the newly added detectedTokens were detected on (and therefore added to) a different chainId/selectedAddress than the currently configured combo
      // the newDetectedTokens (which should contain the detectedTokens on the current chainId/address combo) needs to be repointed to the current chainId/address pair
      // if the detectedTokens were detected on the current chainId/address then this won't change anything.
      newDetectedTokens =
        newAllDetectedTokens?.[chainId]?.[selectedAddress] || [];

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
   * This is a function that updates the tokens name for the tokens name if it is not defined.
   *
   * @param tokenList - Represents the fetched token list from service API
   * @param tokenAttribute - Represents the token attribute that we want to update on the token list
   */
  private updateTokensAttribute(
    tokenList: TokenListMap,
    tokenAttribute: keyof Token & keyof TokenListToken,
  ) {
    const { tokens } = this.state;

    const newTokens = tokens.map((token) => {
      const newToken = tokenList[token.address.toLowerCase()];

      return !token[tokenAttribute] && newToken?.[tokenAttribute]
        ? { ...token, [tokenAttribute]: newToken[tokenAttribute] }
        : { ...token };
    });

    this.update({ tokens: newTokens });
  }

  /**
   * Detects whether or not a token is ERC-721 compatible.
   *
   * @param tokenAddress - The token contract address.
   * @param networkClientId - Optional network client ID to fetch contract info with.
   * @returns A boolean indicating whether the token address passed in supports the EIP-721
   * interface.
   */
  async _detectIsERC721(
    tokenAddress: string,
    networkClientId?: NetworkClientId,
  ) {
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
      networkClientId,
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
    networkClientId?: NetworkClientId,
  ): Contract {
    const provider = networkClientId
      ? this.getNetworkClientById(networkClientId).provider
      : this.config?.provider;

    const web3provider = new Web3Provider(provider);
    const tokenContract = new Contract(tokenAddress, abi, web3provider);
    return tokenContract;
  }

  _generateRandomId(): string {
    return random();
  }

  /**
   * Adds a new suggestedAsset to the list of watched assets.
   * Parameters will be validated according to the asset type being watched.
   *
   * @param options - The method options.
   * @param options.asset - The asset to be watched. For now only ERC20 tokens are accepted.
   * @param options.type - The asset type.
   * @param options.interactingAddress - The address of the account that is requesting to watch the asset.
   * @param options.networkClientId - Network Client ID.
   * @returns Object containing a Promise resolving to the suggestedAsset address if accepted.
   */
  async watchAsset({
    asset,
    type,
    interactingAddress,
    networkClientId,
  }: {
    asset: Token;
    type: string;
    interactingAddress?: string;
    networkClientId?: NetworkClientId;
  }): Promise<void> {
    if (type !== ERC20) {
      throw new Error(`Asset of type ${type} not supported`);
    }

    const { selectedAddress } = this.config;

    const suggestedAssetMeta: SuggestedAssetMeta = {
      asset,
      id: this._generateRandomId(),
      time: Date.now(),
      type,
      interactingAddress: interactingAddress || selectedAddress,
    };

    validateTokenToWatch(asset);

    await this._requestApproval(suggestedAssetMeta);

    let name;
    try {
      name = await this.getERC20TokenName(asset.address, networkClientId);
    } catch (error) {
      name = undefined;
    }

    const { address, symbol, decimals, image } = asset;
    await this.addToken({
      address,
      symbol,
      decimals,
      name,
      image,
      interactingAddress: suggestedAssetMeta.interactingAddress,
      networkClientId,
    });
  }

  /**
   * Takes a new tokens and ignoredTokens array for the current network/account combination
   * and returns new allTokens and allIgnoredTokens state to update to.
   *
   * @param params - Object that holds token params.
   * @param params.newTokens - The new tokens to set for the current network and selected account.
   * @param params.newIgnoredTokens - The new ignored tokens to set for the current network and selected account.
   * @param params.newDetectedTokens - The new detected tokens to set for the current network and selected account.
   * @param params.interactingAddress - The account address to use to store the tokens.
   * @param params.interactingChainId - The chainId to use to store the tokens.
   * @returns The updated `allTokens` and `allIgnoredTokens` state.
   */
  _getNewAllTokensState(params: {
    newTokens?: Token[];
    newIgnoredTokens?: string[];
    newDetectedTokens?: Token[];
    interactingAddress?: string;
    interactingChainId?: Hex;
  }) {
    const {
      newTokens,
      newIgnoredTokens,
      newDetectedTokens,
      interactingAddress,
      interactingChainId,
    } = params;
    const { allTokens, allIgnoredTokens, allDetectedTokens } = this.state;
    const { chainId, selectedAddress } = this.config;

    const userAddressToAddTokens = interactingAddress ?? selectedAddress;
    const chainIdToAddTokens = interactingChainId ?? chainId;

    let newAllTokens = allTokens;
    if (
      newTokens?.length ||
      (newTokens &&
        allTokens &&
        allTokens[chainIdToAddTokens] &&
        allTokens[chainIdToAddTokens][userAddressToAddTokens])
    ) {
      const networkTokens = allTokens[chainIdToAddTokens];
      const newNetworkTokens = {
        ...networkTokens,
        ...{ [userAddressToAddTokens]: newTokens },
      };
      newAllTokens = {
        ...allTokens,
        ...{ [chainIdToAddTokens]: newNetworkTokens },
      };
    }

    let newAllIgnoredTokens = allIgnoredTokens;
    if (
      newIgnoredTokens?.length ||
      (newIgnoredTokens &&
        allIgnoredTokens &&
        allIgnoredTokens[chainIdToAddTokens] &&
        allIgnoredTokens[chainIdToAddTokens][userAddressToAddTokens])
    ) {
      const networkIgnoredTokens = allIgnoredTokens[chainIdToAddTokens];
      const newIgnoredNetworkTokens = {
        ...networkIgnoredTokens,
        ...{ [userAddressToAddTokens]: newIgnoredTokens },
      };
      newAllIgnoredTokens = {
        ...allIgnoredTokens,
        ...{ [chainIdToAddTokens]: newIgnoredNetworkTokens },
      };
    }

    let newAllDetectedTokens = allDetectedTokens;
    if (
      newDetectedTokens?.length ||
      (newDetectedTokens &&
        allDetectedTokens &&
        allDetectedTokens[chainIdToAddTokens] &&
        allDetectedTokens[chainIdToAddTokens][userAddressToAddTokens])
    ) {
      const networkDetectedTokens = allDetectedTokens[chainIdToAddTokens];
      const newDetectedNetworkTokens = {
        ...networkDetectedTokens,
        ...{ [userAddressToAddTokens]: newDetectedTokens },
      };
      newAllDetectedTokens = {
        ...allDetectedTokens,
        ...{ [chainIdToAddTokens]: newDetectedNetworkTokens },
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

  async _requestApproval(suggestedAssetMeta: SuggestedAssetMeta) {
    return this.messagingSystem.call(
      'ApprovalController:addRequest',
      {
        id: suggestedAssetMeta.id,
        origin: ORIGIN_METAMASK,
        type: ApprovalType.WatchAsset,
        requestData: {
          id: suggestedAssetMeta.id,
          interactingAddress: suggestedAssetMeta.interactingAddress,
          asset: {
            address: suggestedAssetMeta.asset.address,
            decimals: suggestedAssetMeta.asset.decimals,
            symbol: suggestedAssetMeta.asset.symbol,
            image: suggestedAssetMeta.asset.image || null,
          },
        },
      },
      true,
    );
  }
}

export default TokensController;
