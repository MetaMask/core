import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import type {
  AccountsControllerGetAccountAction,
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerSelectedEvmAccountChangeEvent,
} from '@metamask/accounts-controller';
import type { AddApprovalRequest } from '@metamask/approval-controller';
import type {
  RestrictedControllerMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import contractsMap from '@metamask/contract-metadata';
import {
  toChecksumHexAddress,
  ERC721_INTERFACE_ID,
  ORIGIN_METAMASK,
  ApprovalType,
  ERC20,
  ERC721,
  ERC1155,
  isValidHexAddress,
  safelyExecute,
} from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-api';
import { abiERC721 } from '@metamask/metamask-eth-abis';
import type {
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerNetworkDidChangeEvent,
  NetworkState,
  Provider,
} from '@metamask/network-controller';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import { v1 as random } from 'uuid';

import { formatAggregatorNames, formatIconUrlWithProxy } from './assetsUtil';
import { ERC20Standard } from './Standards/ERC20Standard';
import { ERC1155Standard } from './Standards/NftStandards/ERC1155/ERC1155Standard';
import {
  fetchTokenMetadata,
  TOKEN_METADATA_NO_SUPPORT_ERROR,
} from './token-service';
import type {
  TokenListMap,
  TokenListStateChange,
  TokenListToken,
} from './TokenListController';
import type { Token } from './TokenRatesController';

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
 * @type TokensControllerState
 *
 * Assets controller state
 * @property tokens - List of tokens associated with the active network and address pair
 * @property ignoredTokens - List of ignoredTokens associated with the active network and address pair
 * @property detectedTokens - List of detected tokens associated with the active network and address pair
 * @property allTokens - Object containing tokens by network and account
 * @property allIgnoredTokens - Object containing hidden/ignored tokens by network and account
 * @property allDetectedTokens - Object containing tokens detected with non-zero balances
 */
export type TokensControllerState = {
  tokens: Token[];
  ignoredTokens: string[];
  detectedTokens: Token[];
  allTokens: { [chainId: Hex]: { [key: string]: Token[] } };
  allIgnoredTokens: { [chainId: Hex]: { [key: string]: string[] } };
  allDetectedTokens: { [chainId: Hex]: { [key: string]: Token[] } };
};

const metadata = {
  tokens: {
    persist: true,
    anonymous: false,
  },
  ignoredTokens: {
    persist: true,
    anonymous: false,
  },
  detectedTokens: {
    persist: true,
    anonymous: false,
  },
  allTokens: {
    persist: true,
    anonymous: false,
  },
  allIgnoredTokens: {
    persist: true,
    anonymous: false,
  },
  allDetectedTokens: {
    persist: true,
    anonymous: false,
  },
};

const controllerName = 'TokensController';

export type TokensControllerActions =
  | TokensControllerGetStateAction
  | TokensControllerAddDetectedTokensAction;

export type TokensControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  TokensControllerState
>;

export type TokensControllerAddDetectedTokensAction = {
  type: `${typeof controllerName}:addDetectedTokens`;
  handler: TokensController['addDetectedTokens'];
};

/**
 * The external actions available to the {@link TokensController}.
 */
export type AllowedActions =
  | AddApprovalRequest
  | NetworkControllerGetNetworkClientByIdAction
  | AccountsControllerGetAccountAction
  | AccountsControllerGetSelectedAccountAction;

export type TokensControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  TokensControllerState
>;

export type TokensControllerEvents = TokensControllerStateChangeEvent;

export type AllowedEvents =
  | NetworkControllerNetworkDidChangeEvent
  | TokenListStateChange
  | AccountsControllerSelectedEvmAccountChangeEvent;

/**
 * The messenger of the {@link TokensController}.
 */
export type TokensControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  TokensControllerActions | AllowedActions,
  TokensControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

export const getDefaultTokensState = (): TokensControllerState => {
  return {
    tokens: [],
    ignoredTokens: [],
    detectedTokens: [],
    allTokens: {},
    allIgnoredTokens: {},
    allDetectedTokens: {},
  };
};

/**
 * Controller that stores assets and exposes convenience methods
 */
export class TokensController extends BaseController<
  typeof controllerName,
  TokensControllerState,
  TokensControllerMessenger
> {
  readonly #mutex = new Mutex();

  #chainId: Hex;

  #selectedAccountId: string;

  #provider: Provider | undefined;

  #abortController: AbortController;

  /**
   * Tokens controller options
   * @param options - Constructor options.
   * @param options.chainId - The chain ID of the current network.
   * @param options.provider - Network provider.
   * @param options.state - Initial state to set on this controller.
   * @param options.messenger - The controller messenger.
   */
  constructor({
    chainId: initialChainId,
    provider,
    state,
    messenger,
  }: {
    chainId: Hex;
    provider: Provider | undefined;
    state?: Partial<TokensControllerState>;
    messenger: TokensControllerMessenger;
  }) {
    super({
      name: controllerName,
      metadata,
      messenger,
      state: {
        ...getDefaultTokensState(),
        ...state,
      },
    });

    this.#chainId = initialChainId;

    this.#provider = provider;

    this.#selectedAccountId = this.#getSelectedAccount().id;

    this.#abortController = new AbortController();

    this.messagingSystem.registerActionHandler(
      `${controllerName}:addDetectedTokens` as const,
      this.addDetectedTokens.bind(this),
    );

    this.messagingSystem.subscribe(
      'AccountsController:selectedEvmAccountChange',
      this.#onSelectedAccountChange.bind(this),
    );

    this.messagingSystem.subscribe(
      'NetworkController:networkDidChange',
      this.#onNetworkDidChange.bind(this),
    );

    this.messagingSystem.subscribe(
      'TokenListController:stateChange',
      ({ tokenList }) => {
        const { tokens } = this.state;
        if (tokens.length && !tokens[0].name) {
          this.#updateTokensAttribute(tokenList, 'name');
        }
      },
    );
  }

  /**
   * Handles the event when the network changes.
   *
   * @param networkState - The changed network state.
   * @param networkState.selectedNetworkClientId - The ID of the currently
   * selected network client.
   */
  #onNetworkDidChange({ selectedNetworkClientId }: NetworkState) {
    const selectedNetworkClient = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      selectedNetworkClientId,
    );
    const { allTokens, allIgnoredTokens, allDetectedTokens } = this.state;
    const { chainId } = selectedNetworkClient.configuration;
    this.#abortController.abort();
    this.#abortController = new AbortController();
    this.#chainId = chainId;
    const selectedAddress = this.#getSelectedAddress();
    this.update((state) => {
      state.tokens = allTokens[chainId]?.[selectedAddress] || [];
      state.ignoredTokens = allIgnoredTokens[chainId]?.[selectedAddress] || [];
      state.detectedTokens =
        allDetectedTokens[chainId]?.[selectedAddress] || [];
    });
  }

  /**
   * Handles the selected account change in the accounts controller.
   * @param selectedAccount - The new selected account
   */
  #onSelectedAccountChange(selectedAccount: InternalAccount) {
    const { allTokens, allIgnoredTokens, allDetectedTokens } = this.state;
    this.#selectedAccountId = selectedAccount.id;
    this.update((state) => {
      state.tokens = allTokens[this.#chainId]?.[selectedAccount.address] ?? [];
      state.ignoredTokens =
        allIgnoredTokens[this.#chainId]?.[selectedAccount.address] ?? [];
      state.detectedTokens =
        allDetectedTokens[this.#chainId]?.[selectedAccount.address] ?? [];
    });
  }

  /**
   * Fetch metadata for a token.
   *
   * @param tokenAddress - The address of the token.
   * @returns The token metadata.
   */
  async #fetchTokenMetadata(
    tokenAddress: string,
  ): Promise<TokenListToken | undefined> {
    try {
      const token = await fetchTokenMetadata<TokenListToken>(
        this.#chainId,
        tokenAddress,
        this.#abortController.signal,
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
    const chainId = this.#chainId;
    const releaseLock = await this.#mutex.acquire();
    const { allTokens, allIgnoredTokens, allDetectedTokens } = this.state;
    let currentChainId = chainId;
    if (networkClientId) {
      currentChainId = this.messagingSystem.call(
        'NetworkController:getNetworkClientById',
        networkClientId,
      ).configuration.chainId;
    }

    const accountAddress =
      this.#getAddressOrSelectedAddress(interactingAddress);
    const isInteractingWithWalletAccount =
      this.#isInteractingWithWallet(accountAddress);
    try {
      address = toChecksumHexAddress(address);
      const tokens = allTokens[currentChainId]?.[accountAddress] || [];
      const ignoredTokens =
        allIgnoredTokens[currentChainId]?.[accountAddress] || [];
      const detectedTokens =
        allDetectedTokens[currentChainId]?.[accountAddress] || [];
      const newTokens: Token[] = [...tokens];
      const [isERC721, tokenMetadata] = await Promise.all([
        this.#detectIsERC721(address, networkClientId),
        // TODO parameterize the token metadata fetch by networkClientId
        this.#fetchTokenMetadata(address),
      ]);
      // TODO remove this once this method is fully parameterized by networkClientId
      if (!networkClientId && currentChainId !== this.#chainId) {
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
      const previousIndex = newTokens.findIndex(
        (token) => token.address.toLowerCase() === address.toLowerCase(),
      );
      if (previousIndex !== -1) {
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
        this.#getNewAllTokensState({
          newTokens,
          newIgnoredTokens,
          newDetectedTokens,
          interactingAddress: accountAddress,
          interactingChainId: currentChainId,
        });

      let newState: Partial<TokensControllerState> = {
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

      this.update((state) => {
        Object.assign(state, newState);
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
   * @param networkClientId - Optional network client ID used to determine interacting chain ID.
   */
  async addTokens(tokensToImport: Token[], networkClientId?: NetworkClientId) {
    const releaseLock = await this.#mutex.acquire();
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
        interactingChainId = this.messagingSystem.call(
          'NetworkController:getNetworkClientById',
          networkClientId,
        ).configuration.chainId;
      }

      const { newAllTokens, newAllDetectedTokens, newAllIgnoredTokens } =
        this.#getNewAllTokensState({
          newTokens,
          newDetectedTokens,
          newIgnoredTokens,
          interactingChainId,
        });

      this.update((state) => {
        state.tokens = newTokens;
        state.allTokens = newAllTokens;
        state.detectedTokens = newDetectedTokens;
        state.allDetectedTokens = newAllDetectedTokens;
        state.ignoredTokens = newIgnoredTokens;
        state.allIgnoredTokens = newAllIgnoredTokens;
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
      this.#getNewAllTokensState({
        newIgnoredTokens,
        newDetectedTokens,
        newTokens,
      });

    this.update((state) => {
      state.ignoredTokens = newIgnoredTokens;
      state.tokens = newTokens;
      state.detectedTokens = newDetectedTokens;
      state.allIgnoredTokens = newAllIgnoredTokens;
      state.allDetectedTokens = newAllDetectedTokens;
      state.allTokens = newAllTokens;
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
    const releaseLock = await this.#mutex.acquire();

    const chainId = detectionDetails?.chainId ?? this.#chainId;
    // Previously selectedAddress could be an empty string. This is to preserve the behaviour
    const accountAddress =
      detectionDetails?.selectedAddress ?? this.#getSelectedAddress();

    const { allTokens, allDetectedTokens, allIgnoredTokens } = this.state;
    let newTokens = [...(allTokens?.[chainId]?.[accountAddress] ?? [])];
    let newDetectedTokens = [
      ...(allDetectedTokens?.[chainId]?.[accountAddress] ?? []),
    ];

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
        const previousImportedIndex = newTokens.findIndex(
          (token) =>
            token.address.toLowerCase() === checksumAddress.toLowerCase(),
        );
        if (previousImportedIndex !== -1) {
          // Update existing data of imported token
          newTokens[previousImportedIndex] = newEntry;
        } else {
          const ignoredTokenIndex =
            allIgnoredTokens?.[chainId]?.[accountAddress]?.indexOf(address) ??
            -1;

          if (ignoredTokenIndex === -1) {
            // Add detected token
            const previousDetectedIndex = newDetectedTokens.findIndex(
              (token) =>
                token.address.toLowerCase() === checksumAddress.toLowerCase(),
            );
            if (previousDetectedIndex !== -1) {
              newDetectedTokens[previousDetectedIndex] = newEntry;
            } else {
              newDetectedTokens.push(newEntry);
            }
          }
        }
      });

      const { newAllTokens, newAllDetectedTokens } = this.#getNewAllTokensState(
        {
          newTokens,
          newDetectedTokens,
          interactingAddress: accountAddress,
          interactingChainId: chainId,
        },
      );

      // We may be detecting tokens on a different chain/account pair than are currently configured.
      // Re-point `tokens` and `detectedTokens` to keep them referencing the current chain/account.
      const selectedAddress = this.#getSelectedAddress();

      newTokens = newAllTokens?.[this.#chainId]?.[selectedAddress] || [];
      newDetectedTokens =
        newAllDetectedTokens?.[this.#chainId]?.[selectedAddress] || [];

      this.update((state) => {
        state.tokens = newTokens;
        state.allTokens = newAllTokens;
        state.detectedTokens = newDetectedTokens;
        state.allDetectedTokens = newAllDetectedTokens;
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
    const isERC721 = await this.#detectIsERC721(tokenAddress);
    const tokens = [...this.state.tokens];
    const tokenIndex = tokens.findIndex((token) => {
      return token.address.toLowerCase() === tokenAddress.toLowerCase();
    });
    const updatedToken = { ...tokens[tokenIndex], isERC721 };
    tokens[tokenIndex] = updatedToken;
    this.update((state) => {
      state.tokens = tokens;
    });
    return updatedToken;
  }

  /**
   * This is a function that updates the tokens name for the tokens name if it is not defined.
   *
   * @param tokenList - Represents the fetched token list from service API
   * @param tokenAttribute - Represents the token attribute that we want to update on the token list
   */
  #updateTokensAttribute(
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

    this.update((state) => {
      state.tokens = newTokens;
    });
  }

  /**
   * Detects whether or not a token is ERC-721 compatible.
   *
   * @param tokenAddress - The token contract address.
   * @param networkClientId - Optional network client ID to fetch contract info with.
   * @returns A boolean indicating whether the token address passed in supports the EIP-721
   * interface.
   */
  async #detectIsERC721(
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

    const tokenContract = this.#createEthersContract(
      tokenAddress,
      abiERC721,
      networkClientId,
    );
    try {
      return await tokenContract.supportsInterface(ERC721_INTERFACE_ID);
    } catch (error) {
      // currently we see a variety of errors across different networks when
      // token contracts are not ERC721 compatible. We need to figure out a better
      // way of differentiating token interface types but for now if we get an error
      // we have to assume the token is not ERC721 compatible.
      return false;
    }
  }

  #getProvider(networkClientId?: NetworkClientId): Web3Provider {
    return new Web3Provider(
      // @ts-expect-error TODO: remove this annotation once the `Eip1193Provider` class is released
      networkClientId
        ? this.messagingSystem.call(
            'NetworkController:getNetworkClientById',
            networkClientId,
          ).provider
        : this.#provider,
    );
  }

  #createEthersContract(
    tokenAddress: string,
    abi: string,
    networkClientId?: NetworkClientId,
  ): Contract {
    const web3provider = this.#getProvider(networkClientId);
    const tokenContract = new Contract(tokenAddress, abi, web3provider);
    return tokenContract;
  }

  #generateRandomId(): string {
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
   * @returns A promise that resolves if the asset was watched successfully, and rejects otherwise.
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

    if (!asset.address) {
      throw rpcErrors.invalidParams('Address must be specified');
    }

    if (!isValidHexAddress(asset.address)) {
      throw rpcErrors.invalidParams(`Invalid address "${asset.address}"`);
    }

    const selectedAddress =
      this.#getAddressOrSelectedAddress(interactingAddress);

    // Validate contract

    if (await this.#detectIsERC721(asset.address, networkClientId)) {
      throw rpcErrors.invalidParams(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Contract ${asset.address} must match type ${type}, but was detected as ${ERC721}`,
      );
    }

    const provider = this.#getProvider(networkClientId);
    const isErc1155 = await safelyExecute(() =>
      new ERC1155Standard(provider).contractSupportsBase1155Interface(
        asset.address,
      ),
    );
    if (isErc1155) {
      throw rpcErrors.invalidParams(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Contract ${asset.address} must match type ${type}, but was detected as ${ERC1155}`,
      );
    }

    const erc20 = new ERC20Standard(provider);
    const [contractName, contractSymbol, contractDecimals] = await Promise.all([
      safelyExecute(() => erc20.getTokenName(asset.address)),
      safelyExecute(() => erc20.getTokenSymbol(asset.address)),
      safelyExecute(async () => erc20.getTokenDecimals(asset.address)),
    ]);

    asset.name = contractName;

    // Validate symbol

    if (!asset.symbol && !contractSymbol) {
      throw rpcErrors.invalidParams(
        'A symbol is required, but was not found in either the request or contract',
      );
    }

    if (
      contractSymbol !== undefined &&
      asset.symbol !== undefined &&
      asset.symbol.toUpperCase() !== contractSymbol.toUpperCase()
    ) {
      throw rpcErrors.invalidParams(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `The symbol in the request (${asset.symbol}) does not match the symbol in the contract (${contractSymbol})`,
      );
    }

    asset.symbol = contractSymbol ?? asset.symbol;
    if (typeof asset.symbol !== 'string') {
      throw rpcErrors.invalidParams(`Invalid symbol: not a string`);
    }

    if (asset.symbol.length > 11) {
      throw rpcErrors.invalidParams(
        `Invalid symbol "${asset.symbol}": longer than 11 characters`,
      );
    }

    // Validate decimals

    if (asset.decimals === undefined && contractDecimals === undefined) {
      throw rpcErrors.invalidParams(
        'Decimals are required, but were not found in either the request or contract',
      );
    }

    if (
      contractDecimals !== undefined &&
      asset.decimals !== undefined &&
      String(asset.decimals) !== contractDecimals
    ) {
      throw rpcErrors.invalidParams(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `The decimals in the request (${asset.decimals}) do not match the decimals in the contract (${contractDecimals})`,
      );
    }

    const decimalsStr = contractDecimals ?? asset.decimals;
    const decimalsNum = parseInt(decimalsStr as unknown as string, 10);
    if (!Number.isInteger(decimalsNum) || decimalsNum > 36 || decimalsNum < 0) {
      throw rpcErrors.invalidParams(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Invalid decimals "${decimalsStr}": must be an integer 0 <= 36`,
      );
    }
    asset.decimals = decimalsNum;

    const suggestedAssetMeta: SuggestedAssetMeta = {
      asset,
      id: this.#generateRandomId(),
      time: Date.now(),
      type,
      interactingAddress: selectedAddress,
    };

    await this.#requestApproval(suggestedAssetMeta);

    const { address, symbol, decimals, name, image } = asset;
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
  #getNewAllTokensState(params: {
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

    const userAddressToAddTokens =
      this.#getAddressOrSelectedAddress(interactingAddress);

    const chainIdToAddTokens = interactingChainId ?? this.#chainId;

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

  #getAddressOrSelectedAddress(address: string | undefined): string {
    if (address) {
      return address;
    }

    return this.#getSelectedAddress();
  }

  #isInteractingWithWallet(address: string | undefined) {
    const selectedAddress = this.#getSelectedAddress();

    return selectedAddress === address;
  }

  /**
   * Removes all tokens from the ignored list.
   */
  clearIgnoredTokens() {
    this.update((state) => {
      state.ignoredTokens = [];
      state.allIgnoredTokens = {};
    });
  }

  async #requestApproval(suggestedAssetMeta: SuggestedAssetMeta) {
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

  #getSelectedAccount() {
    return this.messagingSystem.call('AccountsController:getSelectedAccount');
  }

  #getSelectedAddress() {
    // If the address is not defined (or empty), we fallback to the currently selected account's address
    const account = this.messagingSystem.call(
      'AccountsController:getAccount',
      this.#selectedAccountId,
    );
    return account?.address || '';
  }
}

export default TokensController;
