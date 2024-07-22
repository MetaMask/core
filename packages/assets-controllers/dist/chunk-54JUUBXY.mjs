import {
  ERC20Standard
} from "./chunk-S5CFNNOM.mjs";
import {
  ERC1155Standard
} from "./chunk-KPBNX6GP.mjs";
import {
  TOKEN_METADATA_NO_SUPPORT_ERROR,
  fetchTokenMetadata
} from "./chunk-AX522TDL.mjs";
import {
  formatAggregatorNames,
  formatIconUrlWithProxy
} from "./chunk-BZEAPSD5.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/TokensController.ts
import { Contract } from "@ethersproject/contracts";
import { Web3Provider } from "@ethersproject/providers";
import { BaseController } from "@metamask/base-controller";
import contractsMap from "@metamask/contract-metadata";
import {
  toChecksumHexAddress,
  ERC721_INTERFACE_ID,
  ORIGIN_METAMASK,
  ApprovalType,
  ERC20,
  ERC721,
  ERC1155,
  isValidHexAddress,
  safelyExecute
} from "@metamask/controller-utils";
import { abiERC721 } from "@metamask/metamask-eth-abis";
import { rpcErrors } from "@metamask/rpc-errors";
import { Mutex } from "async-mutex";
import { v1 as random } from "uuid";
var metadata = {
  tokens: {
    persist: true,
    anonymous: false
  },
  ignoredTokens: {
    persist: true,
    anonymous: false
  },
  detectedTokens: {
    persist: true,
    anonymous: false
  },
  allTokens: {
    persist: true,
    anonymous: false
  },
  allIgnoredTokens: {
    persist: true,
    anonymous: false
  },
  allDetectedTokens: {
    persist: true,
    anonymous: false
  }
};
var controllerName = "TokensController";
var getDefaultTokensState = () => {
  return {
    tokens: [],
    ignoredTokens: [],
    detectedTokens: [],
    allTokens: {},
    allIgnoredTokens: {},
    allDetectedTokens: {}
  };
};
var _mutex, _chainId, _selectedAccountId, _provider, _abortController, _onNetworkDidChange, onNetworkDidChange_fn, _onSelectedAccountChange, onSelectedAccountChange_fn, _fetchTokenMetadata, fetchTokenMetadata_fn, _updateTokensAttribute, updateTokensAttribute_fn, _detectIsERC721, detectIsERC721_fn, _getProvider, getProvider_fn, _createEthersContract, createEthersContract_fn, _generateRandomId, generateRandomId_fn, _getNewAllTokensState, getNewAllTokensState_fn, _getAddressOrSelectedAddress, getAddressOrSelectedAddress_fn, _isInteractingWithWallet, isInteractingWithWallet_fn, _requestApproval, requestApproval_fn, _getSelectedAccount, getSelectedAccount_fn, _getSelectedAddress, getSelectedAddress_fn;
var TokensController = class extends BaseController {
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
    messenger
  }) {
    super({
      name: controllerName,
      metadata,
      messenger,
      state: {
        ...getDefaultTokensState(),
        ...state
      }
    });
    /**
     * Handles the event when the network changes.
     *
     * @param networkState - The changed network state.
     * @param networkState.selectedNetworkClientId - The ID of the currently
     * selected network client.
     */
    __privateAdd(this, _onNetworkDidChange);
    /**
     * Handles the selected account change in the accounts controller.
     * @param selectedAccount - The new selected account
     */
    __privateAdd(this, _onSelectedAccountChange);
    /**
     * Fetch metadata for a token.
     *
     * @param tokenAddress - The address of the token.
     * @returns The token metadata.
     */
    __privateAdd(this, _fetchTokenMetadata);
    /**
     * This is a function that updates the tokens name for the tokens name if it is not defined.
     *
     * @param tokenList - Represents the fetched token list from service API
     * @param tokenAttribute - Represents the token attribute that we want to update on the token list
     */
    __privateAdd(this, _updateTokensAttribute);
    /**
     * Detects whether or not a token is ERC-721 compatible.
     *
     * @param tokenAddress - The token contract address.
     * @param networkClientId - Optional network client ID to fetch contract info with.
     * @returns A boolean indicating whether the token address passed in supports the EIP-721
     * interface.
     */
    __privateAdd(this, _detectIsERC721);
    __privateAdd(this, _getProvider);
    __privateAdd(this, _createEthersContract);
    __privateAdd(this, _generateRandomId);
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
    __privateAdd(this, _getNewAllTokensState);
    __privateAdd(this, _getAddressOrSelectedAddress);
    __privateAdd(this, _isInteractingWithWallet);
    __privateAdd(this, _requestApproval);
    __privateAdd(this, _getSelectedAccount);
    __privateAdd(this, _getSelectedAddress);
    __privateAdd(this, _mutex, new Mutex());
    __privateAdd(this, _chainId, void 0);
    __privateAdd(this, _selectedAccountId, void 0);
    __privateAdd(this, _provider, void 0);
    __privateAdd(this, _abortController, void 0);
    __privateSet(this, _chainId, initialChainId);
    __privateSet(this, _provider, provider);
    __privateSet(this, _selectedAccountId, __privateMethod(this, _getSelectedAccount, getSelectedAccount_fn).call(this).id);
    __privateSet(this, _abortController, new AbortController());
    this.messagingSystem.registerActionHandler(
      `${controllerName}:addDetectedTokens`,
      this.addDetectedTokens.bind(this)
    );
    this.messagingSystem.subscribe(
      "AccountsController:selectedEvmAccountChange",
      __privateMethod(this, _onSelectedAccountChange, onSelectedAccountChange_fn).bind(this)
    );
    this.messagingSystem.subscribe(
      "NetworkController:networkDidChange",
      __privateMethod(this, _onNetworkDidChange, onNetworkDidChange_fn).bind(this)
    );
    this.messagingSystem.subscribe(
      "TokenListController:stateChange",
      ({ tokenList }) => {
        const { tokens } = this.state;
        if (tokens.length && !tokens[0].name) {
          __privateMethod(this, _updateTokensAttribute, updateTokensAttribute_fn).call(this, tokenList, "name");
        }
      }
    );
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
    networkClientId
  }) {
    const chainId = __privateGet(this, _chainId);
    const releaseLock = await __privateGet(this, _mutex).acquire();
    const { allTokens, allIgnoredTokens, allDetectedTokens } = this.state;
    let currentChainId = chainId;
    if (networkClientId) {
      currentChainId = this.messagingSystem.call(
        "NetworkController:getNetworkClientById",
        networkClientId
      ).configuration.chainId;
    }
    const accountAddress = __privateMethod(this, _getAddressOrSelectedAddress, getAddressOrSelectedAddress_fn).call(this, interactingAddress);
    const isInteractingWithWalletAccount = __privateMethod(this, _isInteractingWithWallet, isInteractingWithWallet_fn).call(this, accountAddress);
    try {
      address = toChecksumHexAddress(address);
      const tokens = allTokens[currentChainId]?.[accountAddress] || [];
      const ignoredTokens = allIgnoredTokens[currentChainId]?.[accountAddress] || [];
      const detectedTokens = allDetectedTokens[currentChainId]?.[accountAddress] || [];
      const newTokens = [...tokens];
      const [isERC721, tokenMetadata] = await Promise.all([
        __privateMethod(this, _detectIsERC721, detectIsERC721_fn).call(this, address, networkClientId),
        // TODO parameterize the token metadata fetch by networkClientId
        __privateMethod(this, _fetchTokenMetadata, fetchTokenMetadata_fn).call(this, address)
      ]);
      if (!networkClientId && currentChainId !== __privateGet(this, _chainId)) {
        throw new Error(
          "TokensController Error: Switched networks while adding token"
        );
      }
      const newEntry = {
        address,
        symbol,
        decimals,
        image: image || formatIconUrlWithProxy({
          chainId: currentChainId,
          tokenAddress: address
        }),
        isERC721,
        aggregators: formatAggregatorNames(tokenMetadata?.aggregators || []),
        name
      };
      const previousIndex = newTokens.findIndex(
        (token) => token.address.toLowerCase() === address.toLowerCase()
      );
      if (previousIndex !== -1) {
        newTokens[previousIndex] = newEntry;
      } else {
        newTokens.push(newEntry);
      }
      const newIgnoredTokens = ignoredTokens.filter(
        (tokenAddress) => tokenAddress.toLowerCase() !== address.toLowerCase()
      );
      const newDetectedTokens = detectedTokens.filter(
        (token) => token.address.toLowerCase() !== address.toLowerCase()
      );
      const { newAllTokens, newAllIgnoredTokens, newAllDetectedTokens } = __privateMethod(this, _getNewAllTokensState, getNewAllTokensState_fn).call(this, {
        newTokens,
        newIgnoredTokens,
        newDetectedTokens,
        interactingAddress: accountAddress,
        interactingChainId: currentChainId
      });
      let newState = {
        allTokens: newAllTokens,
        allIgnoredTokens: newAllIgnoredTokens,
        allDetectedTokens: newAllDetectedTokens
      };
      if (isInteractingWithWalletAccount) {
        newState = {
          ...newState,
          tokens: newTokens,
          ignoredTokens: newIgnoredTokens,
          detectedTokens: newDetectedTokens
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
  async addTokens(tokensToImport, networkClientId) {
    const releaseLock = await __privateGet(this, _mutex).acquire();
    const { tokens, detectedTokens, ignoredTokens } = this.state;
    const importedTokensMap = {};
    const newTokensMap = tokens.reduce((output, current) => {
      output[current.address] = current;
      return output;
    }, {});
    try {
      tokensToImport.forEach((tokenToAdd) => {
        const { address, symbol, decimals, image, aggregators, name } = tokenToAdd;
        const checksumAddress = toChecksumHexAddress(address);
        const formattedToken = {
          address: checksumAddress,
          symbol,
          decimals,
          image,
          aggregators,
          name
        };
        newTokensMap[address] = formattedToken;
        importedTokensMap[address.toLowerCase()] = true;
        return formattedToken;
      });
      const newTokens = Object.values(newTokensMap);
      const newDetectedTokens = detectedTokens.filter(
        (token) => !importedTokensMap[token.address.toLowerCase()]
      );
      const newIgnoredTokens = ignoredTokens.filter(
        (tokenAddress) => !newTokensMap[tokenAddress.toLowerCase()]
      );
      let interactingChainId;
      if (networkClientId) {
        interactingChainId = this.messagingSystem.call(
          "NetworkController:getNetworkClientById",
          networkClientId
        ).configuration.chainId;
      }
      const { newAllTokens, newAllDetectedTokens, newAllIgnoredTokens } = __privateMethod(this, _getNewAllTokensState, getNewAllTokensState_fn).call(this, {
        newTokens,
        newDetectedTokens,
        newIgnoredTokens,
        interactingChainId
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
  ignoreTokens(tokenAddressesToIgnore) {
    const { ignoredTokens, detectedTokens, tokens } = this.state;
    const ignoredTokensMap = {};
    let newIgnoredTokens = [...ignoredTokens];
    const checksummedTokenAddresses = tokenAddressesToIgnore.map((address) => {
      const checksumAddress = toChecksumHexAddress(address);
      ignoredTokensMap[address.toLowerCase()] = true;
      return checksumAddress;
    });
    newIgnoredTokens = [...ignoredTokens, ...checksummedTokenAddresses];
    const newDetectedTokens = detectedTokens.filter(
      (token) => !ignoredTokensMap[token.address.toLowerCase()]
    );
    const newTokens = tokens.filter(
      (token) => !ignoredTokensMap[token.address.toLowerCase()]
    );
    const { newAllIgnoredTokens, newAllDetectedTokens, newAllTokens } = __privateMethod(this, _getNewAllTokensState, getNewAllTokensState_fn).call(this, {
      newIgnoredTokens,
      newDetectedTokens,
      newTokens
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
  async addDetectedTokens(incomingDetectedTokens, detectionDetails) {
    const releaseLock = await __privateGet(this, _mutex).acquire();
    const chainId = detectionDetails?.chainId ?? __privateGet(this, _chainId);
    const accountAddress = detectionDetails?.selectedAddress ?? __privateMethod(this, _getSelectedAddress, getSelectedAddress_fn).call(this);
    const { allTokens, allDetectedTokens, allIgnoredTokens } = this.state;
    let newTokens = [...allTokens?.[chainId]?.[accountAddress] ?? []];
    let newDetectedTokens = [
      ...allDetectedTokens?.[chainId]?.[accountAddress] ?? []
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
          name
        } = tokenToAdd;
        const checksumAddress = toChecksumHexAddress(address);
        const newEntry = {
          address: checksumAddress,
          symbol,
          decimals,
          image,
          isERC721,
          aggregators,
          name
        };
        const previousImportedIndex = newTokens.findIndex(
          (token) => token.address.toLowerCase() === checksumAddress.toLowerCase()
        );
        if (previousImportedIndex !== -1) {
          newTokens[previousImportedIndex] = newEntry;
        } else {
          const ignoredTokenIndex = allIgnoredTokens?.[chainId]?.[accountAddress]?.indexOf(address) ?? -1;
          if (ignoredTokenIndex === -1) {
            const previousDetectedIndex = newDetectedTokens.findIndex(
              (token) => token.address.toLowerCase() === checksumAddress.toLowerCase()
            );
            if (previousDetectedIndex !== -1) {
              newDetectedTokens[previousDetectedIndex] = newEntry;
            } else {
              newDetectedTokens.push(newEntry);
            }
          }
        }
      });
      const { newAllTokens, newAllDetectedTokens } = __privateMethod(this, _getNewAllTokensState, getNewAllTokensState_fn).call(this, {
        newTokens,
        newDetectedTokens,
        interactingAddress: accountAddress,
        interactingChainId: chainId
      });
      const selectedAddress = __privateMethod(this, _getSelectedAddress, getSelectedAddress_fn).call(this);
      newTokens = newAllTokens?.[__privateGet(this, _chainId)]?.[selectedAddress] || [];
      newDetectedTokens = newAllDetectedTokens?.[__privateGet(this, _chainId)]?.[selectedAddress] || [];
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
  async updateTokenType(tokenAddress) {
    const isERC721 = await __privateMethod(this, _detectIsERC721, detectIsERC721_fn).call(this, tokenAddress);
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
    networkClientId
  }) {
    if (type !== ERC20) {
      throw new Error(`Asset of type ${type} not supported`);
    }
    if (!asset.address) {
      throw rpcErrors.invalidParams("Address must be specified");
    }
    if (!isValidHexAddress(asset.address)) {
      throw rpcErrors.invalidParams(`Invalid address "${asset.address}"`);
    }
    const selectedAddress = __privateMethod(this, _getAddressOrSelectedAddress, getAddressOrSelectedAddress_fn).call(this, interactingAddress);
    if (await __privateMethod(this, _detectIsERC721, detectIsERC721_fn).call(this, asset.address, networkClientId)) {
      throw rpcErrors.invalidParams(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Contract ${asset.address} must match type ${type}, but was detected as ${ERC721}`
      );
    }
    const provider = __privateMethod(this, _getProvider, getProvider_fn).call(this, networkClientId);
    const isErc1155 = await safelyExecute(
      () => new ERC1155Standard(provider).contractSupportsBase1155Interface(
        asset.address
      )
    );
    if (isErc1155) {
      throw rpcErrors.invalidParams(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Contract ${asset.address} must match type ${type}, but was detected as ${ERC1155}`
      );
    }
    const erc20 = new ERC20Standard(provider);
    const [contractName, contractSymbol, contractDecimals] = await Promise.all([
      safelyExecute(() => erc20.getTokenName(asset.address)),
      safelyExecute(() => erc20.getTokenSymbol(asset.address)),
      safelyExecute(async () => erc20.getTokenDecimals(asset.address))
    ]);
    asset.name = contractName;
    if (!asset.symbol && !contractSymbol) {
      throw rpcErrors.invalidParams(
        "A symbol is required, but was not found in either the request or contract"
      );
    }
    if (contractSymbol !== void 0 && asset.symbol !== void 0 && asset.symbol.toUpperCase() !== contractSymbol.toUpperCase()) {
      throw rpcErrors.invalidParams(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `The symbol in the request (${asset.symbol}) does not match the symbol in the contract (${contractSymbol})`
      );
    }
    asset.symbol = contractSymbol ?? asset.symbol;
    if (typeof asset.symbol !== "string") {
      throw rpcErrors.invalidParams(`Invalid symbol: not a string`);
    }
    if (asset.symbol.length > 11) {
      throw rpcErrors.invalidParams(
        `Invalid symbol "${asset.symbol}": longer than 11 characters`
      );
    }
    if (asset.decimals === void 0 && contractDecimals === void 0) {
      throw rpcErrors.invalidParams(
        "Decimals are required, but were not found in either the request or contract"
      );
    }
    if (contractDecimals !== void 0 && asset.decimals !== void 0 && String(asset.decimals) !== contractDecimals) {
      throw rpcErrors.invalidParams(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `The decimals in the request (${asset.decimals}) do not match the decimals in the contract (${contractDecimals})`
      );
    }
    const decimalsStr = contractDecimals ?? asset.decimals;
    const decimalsNum = parseInt(decimalsStr, 10);
    if (!Number.isInteger(decimalsNum) || decimalsNum > 36 || decimalsNum < 0) {
      throw rpcErrors.invalidParams(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Invalid decimals "${decimalsStr}": must be an integer 0 <= 36`
      );
    }
    asset.decimals = decimalsNum;
    const suggestedAssetMeta = {
      asset,
      id: __privateMethod(this, _generateRandomId, generateRandomId_fn).call(this),
      time: Date.now(),
      type,
      interactingAddress: selectedAddress
    };
    await __privateMethod(this, _requestApproval, requestApproval_fn).call(this, suggestedAssetMeta);
    const { address, symbol, decimals, name, image } = asset;
    await this.addToken({
      address,
      symbol,
      decimals,
      name,
      image,
      interactingAddress: suggestedAssetMeta.interactingAddress,
      networkClientId
    });
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
};
_mutex = new WeakMap();
_chainId = new WeakMap();
_selectedAccountId = new WeakMap();
_provider = new WeakMap();
_abortController = new WeakMap();
_onNetworkDidChange = new WeakSet();
onNetworkDidChange_fn = function({ selectedNetworkClientId }) {
  const selectedNetworkClient = this.messagingSystem.call(
    "NetworkController:getNetworkClientById",
    selectedNetworkClientId
  );
  const { allTokens, allIgnoredTokens, allDetectedTokens } = this.state;
  const { chainId } = selectedNetworkClient.configuration;
  __privateGet(this, _abortController).abort();
  __privateSet(this, _abortController, new AbortController());
  __privateSet(this, _chainId, chainId);
  const selectedAddress = __privateMethod(this, _getSelectedAddress, getSelectedAddress_fn).call(this);
  this.update((state) => {
    state.tokens = allTokens[chainId]?.[selectedAddress] || [];
    state.ignoredTokens = allIgnoredTokens[chainId]?.[selectedAddress] || [];
    state.detectedTokens = allDetectedTokens[chainId]?.[selectedAddress] || [];
  });
};
_onSelectedAccountChange = new WeakSet();
onSelectedAccountChange_fn = function(selectedAccount) {
  const { allTokens, allIgnoredTokens, allDetectedTokens } = this.state;
  __privateSet(this, _selectedAccountId, selectedAccount.id);
  this.update((state) => {
    state.tokens = allTokens[__privateGet(this, _chainId)]?.[selectedAccount.address] ?? [];
    state.ignoredTokens = allIgnoredTokens[__privateGet(this, _chainId)]?.[selectedAccount.address] ?? [];
    state.detectedTokens = allDetectedTokens[__privateGet(this, _chainId)]?.[selectedAccount.address] ?? [];
  });
};
_fetchTokenMetadata = new WeakSet();
fetchTokenMetadata_fn = async function(tokenAddress) {
  try {
    const token = await fetchTokenMetadata(
      __privateGet(this, _chainId),
      tokenAddress,
      __privateGet(this, _abortController).signal
    );
    return token;
  } catch (error) {
    if (error instanceof Error && error.message.includes(TOKEN_METADATA_NO_SUPPORT_ERROR)) {
      return void 0;
    }
    throw error;
  }
};
_updateTokensAttribute = new WeakSet();
updateTokensAttribute_fn = function(tokenList, tokenAttribute) {
  const { tokens } = this.state;
  const newTokens = tokens.map((token) => {
    const newToken = tokenList[token.address.toLowerCase()];
    return !token[tokenAttribute] && newToken?.[tokenAttribute] ? { ...token, [tokenAttribute]: newToken[tokenAttribute] } : { ...token };
  });
  this.update((state) => {
    state.tokens = newTokens;
  });
};
_detectIsERC721 = new WeakSet();
detectIsERC721_fn = async function(tokenAddress, networkClientId) {
  const checksumAddress = toChecksumHexAddress(tokenAddress);
  if (contractsMap[checksumAddress]?.erc721 === true) {
    return Promise.resolve(true);
  } else if (contractsMap[checksumAddress]?.erc20 === true) {
    return Promise.resolve(false);
  }
  const tokenContract = __privateMethod(this, _createEthersContract, createEthersContract_fn).call(this, tokenAddress, abiERC721, networkClientId);
  try {
    return await tokenContract.supportsInterface(ERC721_INTERFACE_ID);
  } catch (error) {
    return false;
  }
};
_getProvider = new WeakSet();
getProvider_fn = function(networkClientId) {
  return new Web3Provider(
    // @ts-expect-error TODO: remove this annotation once the `Eip1193Provider` class is released
    networkClientId ? this.messagingSystem.call(
      "NetworkController:getNetworkClientById",
      networkClientId
    ).provider : __privateGet(this, _provider)
  );
};
_createEthersContract = new WeakSet();
createEthersContract_fn = function(tokenAddress, abi, networkClientId) {
  const web3provider = __privateMethod(this, _getProvider, getProvider_fn).call(this, networkClientId);
  const tokenContract = new Contract(tokenAddress, abi, web3provider);
  return tokenContract;
};
_generateRandomId = new WeakSet();
generateRandomId_fn = function() {
  return random();
};
_getNewAllTokensState = new WeakSet();
getNewAllTokensState_fn = function(params) {
  const {
    newTokens,
    newIgnoredTokens,
    newDetectedTokens,
    interactingAddress,
    interactingChainId
  } = params;
  const { allTokens, allIgnoredTokens, allDetectedTokens } = this.state;
  const userAddressToAddTokens = __privateMethod(this, _getAddressOrSelectedAddress, getAddressOrSelectedAddress_fn).call(this, interactingAddress);
  const chainIdToAddTokens = interactingChainId ?? __privateGet(this, _chainId);
  let newAllTokens = allTokens;
  if (newTokens?.length || newTokens && allTokens && allTokens[chainIdToAddTokens] && allTokens[chainIdToAddTokens][userAddressToAddTokens]) {
    const networkTokens = allTokens[chainIdToAddTokens];
    const newNetworkTokens = {
      ...networkTokens,
      ...{ [userAddressToAddTokens]: newTokens }
    };
    newAllTokens = {
      ...allTokens,
      ...{ [chainIdToAddTokens]: newNetworkTokens }
    };
  }
  let newAllIgnoredTokens = allIgnoredTokens;
  if (newIgnoredTokens?.length || newIgnoredTokens && allIgnoredTokens && allIgnoredTokens[chainIdToAddTokens] && allIgnoredTokens[chainIdToAddTokens][userAddressToAddTokens]) {
    const networkIgnoredTokens = allIgnoredTokens[chainIdToAddTokens];
    const newIgnoredNetworkTokens = {
      ...networkIgnoredTokens,
      ...{ [userAddressToAddTokens]: newIgnoredTokens }
    };
    newAllIgnoredTokens = {
      ...allIgnoredTokens,
      ...{ [chainIdToAddTokens]: newIgnoredNetworkTokens }
    };
  }
  let newAllDetectedTokens = allDetectedTokens;
  if (newDetectedTokens?.length || newDetectedTokens && allDetectedTokens && allDetectedTokens[chainIdToAddTokens] && allDetectedTokens[chainIdToAddTokens][userAddressToAddTokens]) {
    const networkDetectedTokens = allDetectedTokens[chainIdToAddTokens];
    const newDetectedNetworkTokens = {
      ...networkDetectedTokens,
      ...{ [userAddressToAddTokens]: newDetectedTokens }
    };
    newAllDetectedTokens = {
      ...allDetectedTokens,
      ...{ [chainIdToAddTokens]: newDetectedNetworkTokens }
    };
  }
  return { newAllTokens, newAllIgnoredTokens, newAllDetectedTokens };
};
_getAddressOrSelectedAddress = new WeakSet();
getAddressOrSelectedAddress_fn = function(address) {
  if (address) {
    return address;
  }
  return __privateMethod(this, _getSelectedAddress, getSelectedAddress_fn).call(this);
};
_isInteractingWithWallet = new WeakSet();
isInteractingWithWallet_fn = function(address) {
  const selectedAddress = __privateMethod(this, _getSelectedAddress, getSelectedAddress_fn).call(this);
  return selectedAddress === address;
};
_requestApproval = new WeakSet();
requestApproval_fn = async function(suggestedAssetMeta) {
  return this.messagingSystem.call(
    "ApprovalController:addRequest",
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
          image: suggestedAssetMeta.asset.image || null
        }
      }
    },
    true
  );
};
_getSelectedAccount = new WeakSet();
getSelectedAccount_fn = function() {
  return this.messagingSystem.call("AccountsController:getSelectedAccount");
};
_getSelectedAddress = new WeakSet();
getSelectedAddress_fn = function() {
  const account = this.messagingSystem.call(
    "AccountsController:getAccount",
    __privateGet(this, _selectedAccountId)
  );
  return account?.address || "";
};
var TokensController_default = TokensController;

export {
  getDefaultTokensState,
  TokensController,
  TokensController_default
};
//# sourceMappingURL=chunk-54JUUBXY.mjs.map