"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _chunkJCR4H6YLjs = require('./chunk-JCR4H6YL.js');


var _chunk5QLC2MHVjs = require('./chunk-5QLC2MHV.js');



var _chunkK7A3EOIMjs = require('./chunk-K7A3EOIM.js');



var _chunkMZI3SDQNjs = require('./chunk-MZI3SDQN.js');





var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/TokensController.ts
var _contracts = require('@ethersproject/contracts');
var _providers = require('@ethersproject/providers');
var _basecontroller = require('@metamask/base-controller');
var _contractmetadata = require('@metamask/contract-metadata'); var _contractmetadata2 = _interopRequireDefault(_contractmetadata);










var _controllerutils = require('@metamask/controller-utils');
var _metamaskethabis = require('@metamask/metamask-eth-abis');
var _rpcerrors = require('@metamask/rpc-errors');
var _asyncmutex = require('async-mutex');
var _uuid = require('uuid');
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
var TokensController = class extends _basecontroller.BaseController {
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
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _onNetworkDidChange);
    /**
     * Handles the selected account change in the accounts controller.
     * @param selectedAccount - The new selected account
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _onSelectedAccountChange);
    /**
     * Fetch metadata for a token.
     *
     * @param tokenAddress - The address of the token.
     * @returns The token metadata.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _fetchTokenMetadata);
    /**
     * This is a function that updates the tokens name for the tokens name if it is not defined.
     *
     * @param tokenList - Represents the fetched token list from service API
     * @param tokenAttribute - Represents the token attribute that we want to update on the token list
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _updateTokensAttribute);
    /**
     * Detects whether or not a token is ERC-721 compatible.
     *
     * @param tokenAddress - The token contract address.
     * @param networkClientId - Optional network client ID to fetch contract info with.
     * @returns A boolean indicating whether the token address passed in supports the EIP-721
     * interface.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _detectIsERC721);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getProvider);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _createEthersContract);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _generateRandomId);
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
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getNewAllTokensState);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getAddressOrSelectedAddress);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isInteractingWithWallet);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _requestApproval);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getSelectedAccount);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getSelectedAddress);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _mutex, new (0, _asyncmutex.Mutex)());
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _chainId, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _selectedAccountId, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _provider, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _abortController, void 0);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _chainId, initialChainId);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _provider, provider);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _selectedAccountId, _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getSelectedAccount, getSelectedAccount_fn).call(this).id);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _abortController, new AbortController());
    this.messagingSystem.registerActionHandler(
      `${controllerName}:addDetectedTokens`,
      this.addDetectedTokens.bind(this)
    );
    this.messagingSystem.subscribe(
      "AccountsController:selectedEvmAccountChange",
      _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _onSelectedAccountChange, onSelectedAccountChange_fn).bind(this)
    );
    this.messagingSystem.subscribe(
      "NetworkController:networkDidChange",
      _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _onNetworkDidChange, onNetworkDidChange_fn).bind(this)
    );
    this.messagingSystem.subscribe(
      "TokenListController:stateChange",
      ({ tokenList }) => {
        const { tokens } = this.state;
        if (tokens.length && !tokens[0].name) {
          _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateTokensAttribute, updateTokensAttribute_fn).call(this, tokenList, "name");
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
    const chainId = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _chainId);
    const releaseLock = await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _mutex).acquire();
    const { allTokens, allIgnoredTokens, allDetectedTokens } = this.state;
    let currentChainId = chainId;
    if (networkClientId) {
      currentChainId = this.messagingSystem.call(
        "NetworkController:getNetworkClientById",
        networkClientId
      ).configuration.chainId;
    }
    const accountAddress = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getAddressOrSelectedAddress, getAddressOrSelectedAddress_fn).call(this, interactingAddress);
    const isInteractingWithWalletAccount = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _isInteractingWithWallet, isInteractingWithWallet_fn).call(this, accountAddress);
    try {
      address = _controllerutils.toChecksumHexAddress.call(void 0, address);
      const tokens = allTokens[currentChainId]?.[accountAddress] || [];
      const ignoredTokens = allIgnoredTokens[currentChainId]?.[accountAddress] || [];
      const detectedTokens = allDetectedTokens[currentChainId]?.[accountAddress] || [];
      const newTokens = [...tokens];
      const [isERC721, tokenMetadata] = await Promise.all([
        _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _detectIsERC721, detectIsERC721_fn).call(this, address, networkClientId),
        // TODO parameterize the token metadata fetch by networkClientId
        _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _fetchTokenMetadata, fetchTokenMetadata_fn).call(this, address)
      ]);
      if (!networkClientId && currentChainId !== _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _chainId)) {
        throw new Error(
          "TokensController Error: Switched networks while adding token"
        );
      }
      const newEntry = {
        address,
        symbol,
        decimals,
        image: image || _chunkMZI3SDQNjs.formatIconUrlWithProxy.call(void 0, {
          chainId: currentChainId,
          tokenAddress: address
        }),
        isERC721,
        aggregators: _chunkMZI3SDQNjs.formatAggregatorNames.call(void 0, tokenMetadata?.aggregators || []),
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
      const { newAllTokens, newAllIgnoredTokens, newAllDetectedTokens } = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getNewAllTokensState, getNewAllTokensState_fn).call(this, {
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
    const releaseLock = await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _mutex).acquire();
    const { tokens, detectedTokens, ignoredTokens } = this.state;
    const importedTokensMap = {};
    const newTokensMap = tokens.reduce((output, current) => {
      output[current.address] = current;
      return output;
    }, {});
    try {
      tokensToImport.forEach((tokenToAdd) => {
        const { address, symbol, decimals, image, aggregators, name } = tokenToAdd;
        const checksumAddress = _controllerutils.toChecksumHexAddress.call(void 0, address);
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
      const { newAllTokens, newAllDetectedTokens, newAllIgnoredTokens } = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getNewAllTokensState, getNewAllTokensState_fn).call(this, {
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
      const checksumAddress = _controllerutils.toChecksumHexAddress.call(void 0, address);
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
    const { newAllIgnoredTokens, newAllDetectedTokens, newAllTokens } = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getNewAllTokensState, getNewAllTokensState_fn).call(this, {
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
    const releaseLock = await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _mutex).acquire();
    const chainId = detectionDetails?.chainId ?? _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _chainId);
    const accountAddress = detectionDetails?.selectedAddress ?? _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getSelectedAddress, getSelectedAddress_fn).call(this);
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
        const checksumAddress = _controllerutils.toChecksumHexAddress.call(void 0, address);
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
      const { newAllTokens, newAllDetectedTokens } = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getNewAllTokensState, getNewAllTokensState_fn).call(this, {
        newTokens,
        newDetectedTokens,
        interactingAddress: accountAddress,
        interactingChainId: chainId
      });
      const selectedAddress = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getSelectedAddress, getSelectedAddress_fn).call(this);
      newTokens = newAllTokens?.[_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _chainId)]?.[selectedAddress] || [];
      newDetectedTokens = newAllDetectedTokens?.[_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _chainId)]?.[selectedAddress] || [];
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
    const isERC721 = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _detectIsERC721, detectIsERC721_fn).call(this, tokenAddress);
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
    if (type !== _controllerutils.ERC20) {
      throw new Error(`Asset of type ${type} not supported`);
    }
    if (!asset.address) {
      throw _rpcerrors.rpcErrors.invalidParams("Address must be specified");
    }
    if (!_controllerutils.isValidHexAddress.call(void 0, asset.address)) {
      throw _rpcerrors.rpcErrors.invalidParams(`Invalid address "${asset.address}"`);
    }
    const selectedAddress = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getAddressOrSelectedAddress, getAddressOrSelectedAddress_fn).call(this, interactingAddress);
    if (await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _detectIsERC721, detectIsERC721_fn).call(this, asset.address, networkClientId)) {
      throw _rpcerrors.rpcErrors.invalidParams(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Contract ${asset.address} must match type ${type}, but was detected as ${_controllerutils.ERC721}`
      );
    }
    const provider = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getProvider, getProvider_fn).call(this, networkClientId);
    const isErc1155 = await _controllerutils.safelyExecute.call(void 0, 
      () => new (0, _chunk5QLC2MHVjs.ERC1155Standard)(provider).contractSupportsBase1155Interface(
        asset.address
      )
    );
    if (isErc1155) {
      throw _rpcerrors.rpcErrors.invalidParams(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Contract ${asset.address} must match type ${type}, but was detected as ${_controllerutils.ERC1155}`
      );
    }
    const erc20 = new (0, _chunkJCR4H6YLjs.ERC20Standard)(provider);
    const [contractName, contractSymbol, contractDecimals] = await Promise.all([
      _controllerutils.safelyExecute.call(void 0, () => erc20.getTokenName(asset.address)),
      _controllerutils.safelyExecute.call(void 0, () => erc20.getTokenSymbol(asset.address)),
      _controllerutils.safelyExecute.call(void 0, async () => erc20.getTokenDecimals(asset.address))
    ]);
    asset.name = contractName;
    if (!asset.symbol && !contractSymbol) {
      throw _rpcerrors.rpcErrors.invalidParams(
        "A symbol is required, but was not found in either the request or contract"
      );
    }
    if (contractSymbol !== void 0 && asset.symbol !== void 0 && asset.symbol.toUpperCase() !== contractSymbol.toUpperCase()) {
      throw _rpcerrors.rpcErrors.invalidParams(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `The symbol in the request (${asset.symbol}) does not match the symbol in the contract (${contractSymbol})`
      );
    }
    asset.symbol = contractSymbol ?? asset.symbol;
    if (typeof asset.symbol !== "string") {
      throw _rpcerrors.rpcErrors.invalidParams(`Invalid symbol: not a string`);
    }
    if (asset.symbol.length > 11) {
      throw _rpcerrors.rpcErrors.invalidParams(
        `Invalid symbol "${asset.symbol}": longer than 11 characters`
      );
    }
    if (asset.decimals === void 0 && contractDecimals === void 0) {
      throw _rpcerrors.rpcErrors.invalidParams(
        "Decimals are required, but were not found in either the request or contract"
      );
    }
    if (contractDecimals !== void 0 && asset.decimals !== void 0 && String(asset.decimals) !== contractDecimals) {
      throw _rpcerrors.rpcErrors.invalidParams(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `The decimals in the request (${asset.decimals}) do not match the decimals in the contract (${contractDecimals})`
      );
    }
    const decimalsStr = contractDecimals ?? asset.decimals;
    const decimalsNum = parseInt(decimalsStr, 10);
    if (!Number.isInteger(decimalsNum) || decimalsNum > 36 || decimalsNum < 0) {
      throw _rpcerrors.rpcErrors.invalidParams(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Invalid decimals "${decimalsStr}": must be an integer 0 <= 36`
      );
    }
    asset.decimals = decimalsNum;
    const suggestedAssetMeta = {
      asset,
      id: _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _generateRandomId, generateRandomId_fn).call(this),
      time: Date.now(),
      type,
      interactingAddress: selectedAddress
    };
    await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _requestApproval, requestApproval_fn).call(this, suggestedAssetMeta);
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
  _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _abortController).abort();
  _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _abortController, new AbortController());
  _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _chainId, chainId);
  const selectedAddress = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getSelectedAddress, getSelectedAddress_fn).call(this);
  this.update((state) => {
    state.tokens = allTokens[chainId]?.[selectedAddress] || [];
    state.ignoredTokens = allIgnoredTokens[chainId]?.[selectedAddress] || [];
    state.detectedTokens = allDetectedTokens[chainId]?.[selectedAddress] || [];
  });
};
_onSelectedAccountChange = new WeakSet();
onSelectedAccountChange_fn = function(selectedAccount) {
  const { allTokens, allIgnoredTokens, allDetectedTokens } = this.state;
  _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _selectedAccountId, selectedAccount.id);
  this.update((state) => {
    state.tokens = allTokens[_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _chainId)]?.[selectedAccount.address] ?? [];
    state.ignoredTokens = allIgnoredTokens[_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _chainId)]?.[selectedAccount.address] ?? [];
    state.detectedTokens = allDetectedTokens[_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _chainId)]?.[selectedAccount.address] ?? [];
  });
};
_fetchTokenMetadata = new WeakSet();
fetchTokenMetadata_fn = async function(tokenAddress) {
  try {
    const token = await _chunkK7A3EOIMjs.fetchTokenMetadata.call(void 0, 
      _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _chainId),
      tokenAddress,
      _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _abortController).signal
    );
    return token;
  } catch (error) {
    if (error instanceof Error && error.message.includes(_chunkK7A3EOIMjs.TOKEN_METADATA_NO_SUPPORT_ERROR)) {
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
  const checksumAddress = _controllerutils.toChecksumHexAddress.call(void 0, tokenAddress);
  if (_contractmetadata2.default[checksumAddress]?.erc721 === true) {
    return Promise.resolve(true);
  } else if (_contractmetadata2.default[checksumAddress]?.erc20 === true) {
    return Promise.resolve(false);
  }
  const tokenContract = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _createEthersContract, createEthersContract_fn).call(this, tokenAddress, _metamaskethabis.abiERC721, networkClientId);
  try {
    return await tokenContract.supportsInterface(_controllerutils.ERC721_INTERFACE_ID);
  } catch (error) {
    return false;
  }
};
_getProvider = new WeakSet();
getProvider_fn = function(networkClientId) {
  return new (0, _providers.Web3Provider)(
    // @ts-expect-error TODO: remove this annotation once the `Eip1193Provider` class is released
    networkClientId ? this.messagingSystem.call(
      "NetworkController:getNetworkClientById",
      networkClientId
    ).provider : _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _provider)
  );
};
_createEthersContract = new WeakSet();
createEthersContract_fn = function(tokenAddress, abi, networkClientId) {
  const web3provider = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getProvider, getProvider_fn).call(this, networkClientId);
  const tokenContract = new (0, _contracts.Contract)(tokenAddress, abi, web3provider);
  return tokenContract;
};
_generateRandomId = new WeakSet();
generateRandomId_fn = function() {
  return _uuid.v1.call(void 0, );
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
  const userAddressToAddTokens = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getAddressOrSelectedAddress, getAddressOrSelectedAddress_fn).call(this, interactingAddress);
  const chainIdToAddTokens = interactingChainId ?? _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _chainId);
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
  return _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getSelectedAddress, getSelectedAddress_fn).call(this);
};
_isInteractingWithWallet = new WeakSet();
isInteractingWithWallet_fn = function(address) {
  const selectedAddress = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getSelectedAddress, getSelectedAddress_fn).call(this);
  return selectedAddress === address;
};
_requestApproval = new WeakSet();
requestApproval_fn = async function(suggestedAssetMeta) {
  return this.messagingSystem.call(
    "ApprovalController:addRequest",
    {
      id: suggestedAssetMeta.id,
      origin: _controllerutils.ORIGIN_METAMASK,
      type: _controllerutils.ApprovalType.WatchAsset,
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
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _selectedAccountId)
  );
  return account?.address || "";
};
var TokensController_default = TokensController;





exports.getDefaultTokensState = getDefaultTokensState; exports.TokensController = TokensController; exports.TokensController_default = TokensController_default;
//# sourceMappingURL=chunk-ADJ3IFJH.js.map