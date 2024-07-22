import {
  compareNftMetadata,
  getFormattedIpfsUrl,
  hasNewCollectionFields
} from "./chunk-BZEAPSD5.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/NftController.ts
import { isAddress } from "@ethersproject/address";
import {
  BaseController
} from "@metamask/base-controller";
import {
  safelyExecute,
  handleFetch,
  toChecksumHexAddress,
  BNToHex,
  fetchWithErrorHandling,
  IPFS_DEFAULT_GATEWAY_URL,
  ERC721,
  ERC1155,
  ApprovalType,
  NFT_API_BASE_URL,
  NFT_API_VERSION
} from "@metamask/controller-utils";
import { rpcErrors } from "@metamask/rpc-errors";
import { remove0x } from "@metamask/utils";
import { Mutex } from "async-mutex";
import BN from "bn.js";
import { v4 as random } from "uuid";
var nftControllerMetadata = {
  allNftContracts: { persist: true, anonymous: false },
  allNfts: { persist: true, anonymous: false },
  ignoredNfts: { persist: true, anonymous: false }
};
var ALL_NFTS_STATE_KEY = "allNfts";
var ALL_NFTS_CONTRACTS_STATE_KEY = "allNftContracts";
var controllerName = "NftController";
var getDefaultNftControllerState = () => ({
  allNftContracts: {},
  allNfts: {},
  ignoredNfts: []
});
var _mutex, _selectedAccountId, _chainId, _ipfsGateway, _openSeaEnabled, _useIpfsSubdomains, _isIpfsGatewayEnabled, _onNftAdded, _onNetworkControllerNetworkDidChange, onNetworkControllerNetworkDidChange_fn, _onPreferencesControllerStateChange, onPreferencesControllerStateChange_fn, _onSelectedAccountChange, onSelectedAccountChange_fn, _updateNestedNftState, updateNestedNftState_fn, _getNftInformationFromApi, getNftInformationFromApi_fn, _getNftInformationFromTokenURI, getNftInformationFromTokenURI_fn, _getNftURIAndStandard, getNftURIAndStandard_fn, _getNftInformation, getNftInformation_fn, _getNftContractInformationFromContract, getNftContractInformationFromContract_fn, _getNftContractInformation, getNftContractInformation_fn, _addIndividualNft, addIndividualNft_fn, _addNftContract, addNftContract_fn, _removeAndIgnoreIndividualNft, removeAndIgnoreIndividualNft_fn, _removeIndividualNft, removeIndividualNft_fn, _removeNftContract, removeNftContract_fn, _validateWatchNft, validateWatchNft_fn, _getCorrectChainId, getCorrectChainId_fn, _getAddressOrSelectedAddress, getAddressOrSelectedAddress_fn, _updateNftUpdateForAccount, updateNftUpdateForAccount_fn;
var NftController = class extends BaseController {
  /**
   * Creates an NftController instance.
   *
   * @param options - The controller options.
   * @param options.chainId - The chain ID of the current network.
   * @param options.ipfsGateway - The configured IPFS gateway.
   * @param options.openSeaEnabled - Controls whether the OpenSea API is used.
   * @param options.useIpfsSubdomains - Controls whether IPFS subdomains are used.
   * @param options.isIpfsGatewayEnabled - Controls whether IPFS is enabled or not.
   * @param options.onNftAdded - Callback that is called when an NFT is added. Currently used pass data
   * for tracking the NFT added event.
   * @param options.messenger - The controller messenger.
   * @param options.state - Initial state to set on this controller.
   */
  constructor({
    chainId: initialChainId,
    ipfsGateway = IPFS_DEFAULT_GATEWAY_URL,
    openSeaEnabled = false,
    useIpfsSubdomains = true,
    isIpfsGatewayEnabled = true,
    onNftAdded,
    messenger,
    state = {}
  }) {
    super({
      name: controllerName,
      metadata: nftControllerMetadata,
      messenger,
      state: {
        ...getDefaultNftControllerState(),
        ...state
      }
    });
    /**
     * Handles the network change on the network controller.
     * @param networkState - The new state of the preference controller.
     * @param networkState.selectedNetworkClientId - The current selected network client id.
     */
    __privateAdd(this, _onNetworkControllerNetworkDidChange);
    /**
     * Handles the state change of the preference controller.
     * @param preferencesState - The new state of the preference controller.
     * @param preferencesState.ipfsGateway - The configured IPFS gateway.
     * @param preferencesState.openSeaEnabled - Controls whether the OpenSea API is used.
     * @param preferencesState.isIpfsGatewayEnabled - Controls whether IPFS is enabled or not.
     */
    __privateAdd(this, _onPreferencesControllerStateChange);
    /**
     * Handles the selected account change on the accounts controller.
     * @param internalAccount - The new selected account.
     */
    __privateAdd(this, _onSelectedAccountChange);
    /**
     * Helper method to update nested state for allNfts and allNftContracts.
     *
     * @param newCollection - the modified piece of state to update in the controller's store
     * @param baseStateKey - The root key in the store to update.
     * @param passedConfig - An object containing the selectedAddress and chainId that are passed through the auto-detection flow.
     * @param passedConfig.userAddress - the address passed through the NFT detection flow to ensure assets are stored to the correct account
     * @param passedConfig.chainId - the chainId passed through the NFT detection flow to ensure assets are stored to the correct account
     */
    __privateAdd(this, _updateNestedNftState);
    /**
     * Request individual NFT information from NFT API.
     *
     * @param contractAddress - Hex address of the NFT contract.
     * @param tokenId - The NFT identifier.
     * @returns Promise resolving to the current NFT name and image.
     */
    __privateAdd(this, _getNftInformationFromApi);
    /**
     * Request individual NFT information from contracts that follows Metadata Interface.
     *
     * @param contractAddress - Hex address of the NFT contract.
     * @param tokenId - The NFT identifier.
     * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
     * @returns Promise resolving to the current NFT name and image.
     */
    __privateAdd(this, _getNftInformationFromTokenURI);
    /**
     * Retrieve NFT uri with  metadata. TODO Update method to use IPFS.
     *
     * @param contractAddress - NFT contract address.
     * @param tokenId - NFT token id.
     * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
     * @returns Promise resolving NFT uri and token standard.
     */
    __privateAdd(this, _getNftURIAndStandard);
    /**
     * Request individual NFT information (name, image url and description).
     *
     * @param contractAddress - Hex address of the NFT contract.
     * @param tokenId - The NFT identifier.
     * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
     * @returns Promise resolving to the current NFT name and image.
     */
    __privateAdd(this, _getNftInformation);
    /**
     * Request NFT contract information from the contract itself.
     *
     * @param contractAddress - Hex address of the NFT contract.
     * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
     * @returns Promise resolving to the current NFT name and image.
     */
    __privateAdd(this, _getNftContractInformationFromContract);
    /**
     * Request NFT contract information from Blockchain and aggregate with received data from NFTMetadata.
     *
     * @param contractAddress - Hex address of the NFT contract.
     * @param nftMetadataFromApi - Received NFT information to be aggregated with blockchain contract information.
     * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
     * @returns Promise resolving to the NFT contract name, image and description.
     */
    __privateAdd(this, _getNftContractInformation);
    /**
     * Adds an individual NFT to the stored NFT list.
     *
     * @param tokenAddress - Hex address of the NFT contract.
     * @param tokenId - The NFT identifier.
     * @param nftMetadata - NFT optional information (name, image and description).
     * @param nftContract - An object containing contract data of the NFT being added.
     * @param chainId - The chainId of the network where the NFT is being added.
     * @param userAddress - The address of the account where the NFT is being added.
     * @param source - Whether the NFT was detected, added manually or suggested by a dapp.
     * @returns A promise resolving to `undefined`.
     */
    __privateAdd(this, _addIndividualNft);
    /**
     * Adds an NFT contract to the stored NFT contracts list.
     *
     * @param options - options.
     * @param options.tokenAddress - Hex address of the NFT contract.
     * @param options.userAddress - The address of the account where the NFT is being added.
     * @param options.nftMetadata - The retrieved NFTMetadata from API.
     * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
     * @param options.source - Whether the NFT was detected, added manually or suggested by a dapp.
     * @returns Promise resolving to the current NFT contracts list.
     */
    __privateAdd(this, _addNftContract);
    /**
     * Removes an individual NFT from the stored token list and saves it in ignored NFTs list.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - Token identifier of the NFT.
     * @param options - options.
     * @param options.chainId - The chainId of the network where the NFT is being removed.
     * @param options.userAddress - The address of the account where the NFT is being removed.
     */
    __privateAdd(this, _removeAndIgnoreIndividualNft);
    /**
     * Removes an individual NFT from the stored token list.
     *
     * @param address - Hex address of the NFT contract.
     * @param tokenId - Token identifier of the NFT.
     * @param options - options.
     * @param options.chainId - The chainId of the network where the NFT is being removed.
     * @param options.userAddress - The address of the account where the NFT is being removed.
     */
    __privateAdd(this, _removeIndividualNft);
    /**
     * Removes an NFT contract to the stored NFT contracts list.
     *
     * @param address - Hex address of the NFT contract.
     * @param options - options.
     * @param options.chainId - The chainId of the network where the NFT is being removed.
     * @param options.userAddress - The address of the account where the NFT is being removed.
     * @returns Promise resolving to the current NFT contracts list.
     */
    __privateAdd(this, _removeNftContract);
    __privateAdd(this, _validateWatchNft);
    // temporary method to get the correct chainId until we remove chainId from the config & the chainId arg from the detection logic
    // Just a helper method to prefer the networkClient chainId first then the chainId argument and then finally the config chainId
    __privateAdd(this, _getCorrectChainId);
    __privateAdd(this, _getAddressOrSelectedAddress);
    __privateAdd(this, _updateNftUpdateForAccount);
    __privateAdd(this, _mutex, new Mutex());
    __privateAdd(this, _selectedAccountId, void 0);
    __privateAdd(this, _chainId, void 0);
    __privateAdd(this, _ipfsGateway, void 0);
    __privateAdd(this, _openSeaEnabled, void 0);
    __privateAdd(this, _useIpfsSubdomains, void 0);
    __privateAdd(this, _isIpfsGatewayEnabled, void 0);
    __privateAdd(this, _onNftAdded, void 0);
    __privateSet(this, _selectedAccountId, this.messagingSystem.call(
      "AccountsController:getSelectedAccount"
    ).id);
    __privateSet(this, _chainId, initialChainId);
    __privateSet(this, _ipfsGateway, ipfsGateway);
    __privateSet(this, _openSeaEnabled, openSeaEnabled);
    __privateSet(this, _useIpfsSubdomains, useIpfsSubdomains);
    __privateSet(this, _isIpfsGatewayEnabled, isIpfsGatewayEnabled);
    __privateSet(this, _onNftAdded, onNftAdded);
    this.messagingSystem.subscribe(
      "PreferencesController:stateChange",
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      __privateMethod(this, _onPreferencesControllerStateChange, onPreferencesControllerStateChange_fn).bind(this)
    );
    this.messagingSystem.subscribe(
      "NetworkController:networkDidChange",
      __privateMethod(this, _onNetworkControllerNetworkDidChange, onNetworkControllerNetworkDidChange_fn).bind(this)
    );
    this.messagingSystem.subscribe(
      "AccountsController:selectedEvmAccountChange",
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      __privateMethod(this, _onSelectedAccountChange, onSelectedAccountChange_fn).bind(this)
    );
  }
  getNftApi() {
    return `${NFT_API_BASE_URL}/tokens`;
  }
  /**
   * Adds a new suggestedAsset to state. Parameters will be validated according to
   * asset type being watched. A `<suggestedNftMeta.id>:pending` hub event will be emitted once added.
   *
   * @param asset - The asset to be watched. For now ERC721 and ERC1155 tokens are accepted.
   * @param asset.address - The address of the asset contract.
   * @param asset.tokenId - The ID of the asset.
   * @param type - The asset type.
   * @param origin - Domain origin to register the asset from.
   * @param options - Options bag.
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options.userAddress - The address of the account where the NFT is being added.
   * @returns Object containing a Promise resolving to the suggestedAsset address if accepted.
   */
  async watchNft(asset, type, origin, {
    networkClientId,
    userAddress
  } = {}) {
    const addressToSearch = __privateMethod(this, _getAddressOrSelectedAddress, getAddressOrSelectedAddress_fn).call(this, userAddress);
    if (!addressToSearch) {
      return;
    }
    await __privateMethod(this, _validateWatchNft, validateWatchNft_fn).call(this, asset, type, addressToSearch);
    const nftMetadata = await __privateMethod(this, _getNftInformation, getNftInformation_fn).call(this, asset.address, asset.tokenId, networkClientId);
    if (nftMetadata.standard && nftMetadata.standard !== type) {
      throw rpcErrors.invalidInput(
        `Suggested NFT of type ${nftMetadata.standard} does not match received type ${type}`
      );
    }
    const suggestedNftMeta = {
      asset: { ...asset, ...nftMetadata },
      type,
      id: random(),
      time: Date.now(),
      interactingAddress: addressToSearch,
      origin
    };
    await this._requestApproval(suggestedNftMeta);
    const { address, tokenId } = asset;
    const { name, standard, description, image } = nftMetadata;
    await this.addNft(address, tokenId, {
      nftMetadata: {
        name: name ?? null,
        description: description ?? null,
        image: image ?? null,
        standard: standard ?? null
      },
      userAddress,
      source: "dapp" /* Dapp */,
      networkClientId
    });
  }
  /**
   * Sets an OpenSea API key to retrieve NFT information.
   *
   * @param openSeaApiKey - OpenSea API key.
   */
  setApiKey(openSeaApiKey) {
    this.openSeaApiKey = openSeaApiKey;
  }
  /**
   * Checks the ownership of a ERC-721 or ERC-1155 NFT for a given address.
   *
   * @param ownerAddress - User public address.
   * @param nftAddress - NFT contract address.
   * @param tokenId - NFT token ID.
   * @param options - Options bag.
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @returns Promise resolving the NFT ownership.
   */
  async isNftOwner(ownerAddress, nftAddress, tokenId, {
    networkClientId
  } = {}) {
    try {
      const owner = await this.messagingSystem.call(
        "AssetsContractController:getERC721OwnerOf",
        nftAddress,
        tokenId,
        networkClientId
      );
      return ownerAddress.toLowerCase() === owner.toLowerCase();
    } catch {
    }
    try {
      const balance = await this.messagingSystem.call(
        "AssetsContractController:getERC1155BalanceOf",
        ownerAddress,
        nftAddress,
        tokenId,
        networkClientId
      );
      return !balance.isZero();
    } catch {
    }
    throw new Error(
      `Unable to verify ownership. Possibly because the standard is not supported or the user's currently selected network does not match the chain of the asset in question.`
    );
  }
  /**
   * Verifies currently selected address owns entered NFT address/tokenId combo and
   * adds the NFT and respective NFT contract to the stored NFT and NFT contracts lists.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - The NFT identifier.
   * @param options - an object of arguments
   * @param options.userAddress - The address of the current user.
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options.source - Whether the NFT was detected, added manually or suggested by a dapp.
   */
  async addNftVerifyOwnership(address, tokenId, {
    userAddress,
    networkClientId,
    source
  } = {}) {
    const addressToSearch = __privateMethod(this, _getAddressOrSelectedAddress, getAddressOrSelectedAddress_fn).call(this, userAddress);
    if (!await this.isNftOwner(addressToSearch, address, tokenId, {
      networkClientId
    })) {
      throw new Error("This NFT is not owned by the user");
    }
    await this.addNft(address, tokenId, {
      networkClientId,
      userAddress: addressToSearch,
      source
    });
  }
  /**
   * Adds an NFT and respective NFT contract to the stored NFT and NFT contracts lists.
   *
   * @param tokenAddress - Hex address of the NFT contract.
   * @param tokenId - The NFT identifier.
   * @param options - an object of arguments
   * @param options.nftMetadata - NFT optional metadata.
   * @param options.userAddress - The address of the current user.
   * @param options.source - Whether the NFT was detected, added manually or suggested by a dapp.
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @returns Promise resolving to the current NFT list.
   */
  async addNft(tokenAddress, tokenId, {
    nftMetadata,
    userAddress,
    source = "custom" /* Custom */,
    networkClientId
  } = {}) {
    const addressToSearch = __privateMethod(this, _getAddressOrSelectedAddress, getAddressOrSelectedAddress_fn).call(this, userAddress);
    if (!addressToSearch) {
      return;
    }
    const checksumHexAddress = toChecksumHexAddress(tokenAddress);
    const chainId = __privateMethod(this, _getCorrectChainId, getCorrectChainId_fn).call(this, { networkClientId });
    nftMetadata = nftMetadata || await __privateMethod(this, _getNftInformation, getNftInformation_fn).call(this, checksumHexAddress, tokenId, networkClientId);
    const newNftContracts = await __privateMethod(this, _addNftContract, addNftContract_fn).call(this, {
      tokenAddress: checksumHexAddress,
      userAddress: addressToSearch,
      networkClientId,
      source,
      nftMetadata
    });
    const nftContract = newNftContracts.find(
      (contract) => contract.address.toLowerCase() === checksumHexAddress.toLowerCase()
    );
    if (nftContract) {
      await __privateMethod(this, _addIndividualNft, addIndividualNft_fn).call(this, checksumHexAddress, tokenId, nftMetadata, nftContract, chainId, addressToSearch, source);
    }
  }
  /**
   * Refetches NFT metadata and updates the state
   *
   * @param options - Options for refetching NFT metadata
   * @param options.nfts - nfts to update metadata for.
   * @param options.userAddress - The current user address
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   */
  async updateNftMetadata({
    nfts,
    userAddress,
    networkClientId
  }) {
    const addressToSearch = __privateMethod(this, _getAddressOrSelectedAddress, getAddressOrSelectedAddress_fn).call(this, userAddress);
    const releaseLock = await __privateGet(this, _mutex).acquire();
    try {
      const chainId = __privateMethod(this, _getCorrectChainId, getCorrectChainId_fn).call(this, { networkClientId });
      const nftsWithChecksumAdr = nfts.map((nft) => {
        return {
          ...nft,
          address: toChecksumHexAddress(nft.address)
        };
      });
      const nftMetadataResults = await Promise.all(
        nftsWithChecksumAdr.map(async (nft) => {
          const resMetadata = await __privateMethod(this, _getNftInformation, getNftInformation_fn).call(this, nft.address, nft.tokenId, networkClientId);
          return {
            nft,
            newMetadata: resMetadata
          };
        })
      );
      const nftsWithDifferentMetadata = [];
      const { allNfts } = this.state;
      const stateNfts = allNfts[addressToSearch]?.[chainId] || [];
      nftMetadataResults.forEach((singleNft) => {
        const existingEntry = stateNfts.find(
          (nft) => nft.address.toLowerCase() === singleNft.nft.address.toLowerCase() && nft.tokenId === singleNft.nft.tokenId
        );
        if (existingEntry) {
          const differentMetadata = compareNftMetadata(
            singleNft.newMetadata,
            existingEntry
          );
          if (differentMetadata) {
            nftsWithDifferentMetadata.push(singleNft);
          }
        }
      });
      if (nftsWithDifferentMetadata.length !== 0) {
        nftsWithDifferentMetadata.forEach(
          (elm) => this.updateNft(elm.nft, elm.newMetadata, addressToSearch, chainId)
        );
      }
    } finally {
      releaseLock();
    }
  }
  /**
   * Removes an NFT from the stored token list.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - Token identifier of the NFT.
   * @param options - an object of arguments
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options.userAddress - The address of the account where the NFT is being removed.
   */
  removeNft(address, tokenId, {
    networkClientId,
    userAddress
  } = {}) {
    const addressToSearch = __privateMethod(this, _getAddressOrSelectedAddress, getAddressOrSelectedAddress_fn).call(this, userAddress);
    const chainId = __privateMethod(this, _getCorrectChainId, getCorrectChainId_fn).call(this, { networkClientId });
    const checksumHexAddress = toChecksumHexAddress(address);
    __privateMethod(this, _removeIndividualNft, removeIndividualNft_fn).call(this, checksumHexAddress, tokenId, {
      chainId,
      userAddress: addressToSearch
    });
    const { allNfts } = this.state;
    const nfts = allNfts[addressToSearch]?.[chainId] || [];
    const remainingNft = nfts.find(
      (nft) => nft.address.toLowerCase() === checksumHexAddress.toLowerCase()
    );
    if (!remainingNft) {
      __privateMethod(this, _removeNftContract, removeNftContract_fn).call(this, checksumHexAddress, {
        chainId,
        userAddress: addressToSearch
      });
    }
  }
  /**
   * Removes an NFT from the stored token list and saves it in ignored NFTs list.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - Token identifier of the NFT.
   * @param options - an object of arguments
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options.userAddress - The address of the account where the NFT is being removed.
   */
  removeAndIgnoreNft(address, tokenId, {
    networkClientId,
    userAddress
  } = {}) {
    const addressToSearch = __privateMethod(this, _getAddressOrSelectedAddress, getAddressOrSelectedAddress_fn).call(this, userAddress);
    const chainId = __privateMethod(this, _getCorrectChainId, getCorrectChainId_fn).call(this, { networkClientId });
    const checksumHexAddress = toChecksumHexAddress(address);
    __privateMethod(this, _removeAndIgnoreIndividualNft, removeAndIgnoreIndividualNft_fn).call(this, checksumHexAddress, tokenId, {
      chainId,
      userAddress: addressToSearch
    });
    const { allNfts } = this.state;
    const nfts = allNfts[addressToSearch]?.[chainId] || [];
    const remainingNft = nfts.find(
      (nft) => nft.address.toLowerCase() === checksumHexAddress.toLowerCase()
    );
    if (!remainingNft) {
      __privateMethod(this, _removeNftContract, removeNftContract_fn).call(this, checksumHexAddress, {
        chainId,
        userAddress: addressToSearch
      });
    }
  }
  /**
   * Removes all NFTs from the ignored list.
   */
  clearIgnoredNfts() {
    this.update((state) => {
      state.ignoredNfts = [];
    });
  }
  /**
   * Checks whether input NFT is still owned by the user
   * And updates the isCurrentlyOwned value on the NFT object accordingly.
   *
   * @param nft - The NFT object to check and update.
   * @param batch - A boolean indicating whether this method is being called as part of a batch or single update.
   * @param accountParams - The userAddress and chainId to check ownership against
   * @param accountParams.userAddress - the address passed through the confirmed transaction flow to ensure assets are stored to the correct account
   * @param accountParams.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @returns the NFT with the updated isCurrentlyOwned value
   */
  async checkAndUpdateSingleNftOwnershipStatus(nft, batch, {
    userAddress,
    networkClientId
  } = {}) {
    const addressToSearch = __privateMethod(this, _getAddressOrSelectedAddress, getAddressOrSelectedAddress_fn).call(this, userAddress);
    const chainId = __privateMethod(this, _getCorrectChainId, getCorrectChainId_fn).call(this, { networkClientId });
    const { address, tokenId } = nft;
    let isOwned = nft.isCurrentlyOwned;
    try {
      isOwned = await this.isNftOwner(addressToSearch, address, tokenId, {
        networkClientId
      });
    } catch {
    }
    const updatedNft = {
      ...nft,
      isCurrentlyOwned: isOwned
    };
    if (batch) {
      return updatedNft;
    }
    const { allNfts } = this.state;
    const nfts = [...allNfts[addressToSearch]?.[chainId] || []];
    const indexToUpdate = nfts.findIndex(
      (item) => item.tokenId === tokenId && item.address.toLowerCase() === address.toLowerCase()
    );
    if (indexToUpdate !== -1) {
      nfts[indexToUpdate] = updatedNft;
      this.update((state) => {
        state.allNfts[addressToSearch] = Object.assign(
          {},
          state.allNfts[addressToSearch],
          {
            [chainId]: nfts
          }
        );
      });
      __privateMethod(this, _updateNestedNftState, updateNestedNftState_fn).call(this, nfts, ALL_NFTS_STATE_KEY, {
        userAddress: addressToSearch,
        chainId
      });
    }
    return updatedNft;
  }
  /**
   * Checks whether NFTs associated with current selectedAddress/chainId combination are still owned by the user
   * And updates the isCurrentlyOwned value on each accordingly.
   * @param options - an object of arguments
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options.userAddress - The address of the account where the NFT ownership status is checked/updated.
   */
  async checkAndUpdateAllNftsOwnershipStatus({
    networkClientId,
    userAddress
  } = {}) {
    const addressToSearch = __privateMethod(this, _getAddressOrSelectedAddress, getAddressOrSelectedAddress_fn).call(this, userAddress);
    const chainId = __privateMethod(this, _getCorrectChainId, getCorrectChainId_fn).call(this, { networkClientId });
    const { allNfts } = this.state;
    const nfts = allNfts[addressToSearch]?.[chainId] || [];
    const updatedNfts = await Promise.all(
      nfts.map(async (nft) => {
        return await this.checkAndUpdateSingleNftOwnershipStatus(nft, true, {
          networkClientId,
          userAddress
        }) ?? nft;
      })
    );
    __privateMethod(this, _updateNestedNftState, updateNestedNftState_fn).call(this, updatedNfts, ALL_NFTS_STATE_KEY, {
      userAddress: addressToSearch,
      chainId
    });
  }
  /**
   * Update NFT favorite status.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - Hex address of the NFT contract.
   * @param favorite - NFT new favorite status.
   * @param options - an object of arguments
   * @param options.networkClientId - The networkClientId that can be used to identify the network client to use for this request.
   * @param options.userAddress - The address of the account where the NFT is being removed.
   */
  updateNftFavoriteStatus(address, tokenId, favorite, {
    networkClientId,
    userAddress
  } = {}) {
    const addressToSearch = __privateMethod(this, _getAddressOrSelectedAddress, getAddressOrSelectedAddress_fn).call(this, userAddress);
    const chainId = __privateMethod(this, _getCorrectChainId, getCorrectChainId_fn).call(this, { networkClientId });
    const { allNfts } = this.state;
    const nfts = [...allNfts[addressToSearch]?.[chainId] || []];
    const index = nfts.findIndex(
      (nft) => nft.address === address && nft.tokenId === tokenId
    );
    if (index === -1) {
      return;
    }
    const updatedNft = {
      ...nfts[index],
      favorite
    };
    nfts[index] = updatedNft;
    __privateMethod(this, _updateNestedNftState, updateNestedNftState_fn).call(this, nfts, ALL_NFTS_STATE_KEY, {
      chainId,
      userAddress: addressToSearch
    });
  }
  /**
   * Returns an NFT by the address and token id.
   *
   * @param address - Hex address of the NFT contract.
   * @param tokenId - Number that represents the id of the token.
   * @param selectedAddress - Hex address of the user account.
   * @param chainId - Id of the current network.
   * @returns Object containing the NFT and its position in the array
   */
  findNftByAddressAndTokenId(address, tokenId, selectedAddress, chainId) {
    const { allNfts } = this.state;
    const nfts = allNfts[selectedAddress]?.[chainId] || [];
    const index = nfts.findIndex(
      (nft) => nft.address.toLowerCase() === address.toLowerCase() && nft.tokenId === tokenId
    );
    if (index === -1) {
      return null;
    }
    return { nft: nfts[index], index };
  }
  /**
   * Update NFT data.
   *
   * @param nft - NFT object to find the right NFT to updates.
   * @param updates - NFT partial object to update properties of the NFT.
   * @param selectedAddress - Hex address of the user account.
   * @param chainId - Id of the current network.
   */
  updateNft(nft, updates, selectedAddress, chainId) {
    const { allNfts } = this.state;
    const nfts = allNfts[selectedAddress]?.[chainId] || [];
    const nftInfo = this.findNftByAddressAndTokenId(
      nft.address,
      nft.tokenId,
      selectedAddress,
      chainId
    );
    if (!nftInfo) {
      return;
    }
    const updatedNft = {
      ...nft,
      ...updates
    };
    const newNfts = [
      ...nfts.slice(0, nftInfo.index),
      updatedNft,
      ...nfts.slice(nftInfo.index + 1)
    ];
    __privateMethod(this, _updateNestedNftState, updateNestedNftState_fn).call(this, newNfts, ALL_NFTS_STATE_KEY, {
      chainId,
      userAddress: selectedAddress
    });
  }
  /**
   * Resets the transaction status of an NFT.
   *
   * @param transactionId - NFT transaction id.
   * @param selectedAddress - Hex address of the user account.
   * @param chainId - Id of the current network.
   * @returns a boolean indicating if the reset was well succeeded or not
   */
  resetNftTransactionStatusByTransactionId(transactionId, selectedAddress, chainId) {
    const { allNfts } = this.state;
    const nfts = allNfts[selectedAddress]?.[chainId] || [];
    const index = nfts.findIndex(
      (nft) => nft.transactionId === transactionId
    );
    if (index === -1) {
      return false;
    }
    const updatedNft = {
      ...nfts[index],
      transactionId: void 0
    };
    const newNfts = [
      ...nfts.slice(0, index),
      updatedNft,
      ...nfts.slice(index + 1)
    ];
    __privateMethod(this, _updateNestedNftState, updateNestedNftState_fn).call(this, newNfts, ALL_NFTS_STATE_KEY, {
      chainId,
      userAddress: selectedAddress
    });
    return true;
  }
  async _requestApproval(suggestedNftMeta) {
    return this.messagingSystem.call(
      "ApprovalController:addRequest",
      {
        id: suggestedNftMeta.id,
        origin: suggestedNftMeta.origin,
        type: ApprovalType.WatchAsset,
        requestData: {
          id: suggestedNftMeta.id,
          interactingAddress: suggestedNftMeta.interactingAddress,
          asset: {
            address: suggestedNftMeta.asset.address,
            tokenId: suggestedNftMeta.asset.tokenId,
            name: suggestedNftMeta.asset.name,
            description: suggestedNftMeta.asset.description,
            image: suggestedNftMeta.asset.image,
            standard: suggestedNftMeta.asset.standard
          }
        }
      },
      true
    );
  }
};
_mutex = new WeakMap();
_selectedAccountId = new WeakMap();
_chainId = new WeakMap();
_ipfsGateway = new WeakMap();
_openSeaEnabled = new WeakMap();
_useIpfsSubdomains = new WeakMap();
_isIpfsGatewayEnabled = new WeakMap();
_onNftAdded = new WeakMap();
_onNetworkControllerNetworkDidChange = new WeakSet();
onNetworkControllerNetworkDidChange_fn = function({
  selectedNetworkClientId
}) {
  const {
    configuration: { chainId }
  } = this.messagingSystem.call(
    "NetworkController:getNetworkClientById",
    selectedNetworkClientId
  );
  __privateSet(this, _chainId, chainId);
};
_onPreferencesControllerStateChange = new WeakSet();
onPreferencesControllerStateChange_fn = async function({
  ipfsGateway,
  openSeaEnabled,
  isIpfsGatewayEnabled
}) {
  const selectedAccount = this.messagingSystem.call(
    "AccountsController:getSelectedAccount"
  );
  __privateSet(this, _selectedAccountId, selectedAccount.id);
  __privateSet(this, _ipfsGateway, ipfsGateway);
  __privateSet(this, _openSeaEnabled, openSeaEnabled);
  __privateSet(this, _isIpfsGatewayEnabled, isIpfsGatewayEnabled);
  const needsUpdateNftMetadata = isIpfsGatewayEnabled && ipfsGateway !== "" || openSeaEnabled;
  if (needsUpdateNftMetadata && selectedAccount) {
    await __privateMethod(this, _updateNftUpdateForAccount, updateNftUpdateForAccount_fn).call(this, selectedAccount);
  }
};
_onSelectedAccountChange = new WeakSet();
onSelectedAccountChange_fn = async function(internalAccount) {
  const oldSelectedAccountId = __privateGet(this, _selectedAccountId);
  __privateSet(this, _selectedAccountId, internalAccount.id);
  const needsUpdateNftMetadata = (__privateGet(this, _isIpfsGatewayEnabled) && __privateGet(this, _ipfsGateway) !== "" || __privateGet(this, _openSeaEnabled)) && oldSelectedAccountId !== internalAccount.id;
  if (needsUpdateNftMetadata) {
    await __privateMethod(this, _updateNftUpdateForAccount, updateNftUpdateForAccount_fn).call(this, internalAccount);
  }
};
_updateNestedNftState = new WeakSet();
updateNestedNftState_fn = function(newCollection, baseStateKey, { userAddress, chainId }) {
  if (!userAddress) {
    return;
  }
  this.update((state) => {
    const oldState = state[baseStateKey];
    const addressState = oldState[userAddress] || {};
    const newAddressState = {
      ...addressState,
      [chainId]: newCollection
    };
    state[baseStateKey] = {
      ...oldState,
      [userAddress]: newAddressState
    };
  });
};
_getNftInformationFromApi = new WeakSet();
getNftInformationFromApi_fn = async function(contractAddress, tokenId) {
  const urlParams = new URLSearchParams({
    chainIds: "1",
    tokens: `${contractAddress}:${tokenId}`,
    includeTopBid: "true",
    includeAttributes: "true",
    includeLastSale: "true"
  }).toString();
  const nftInformation = await fetchWithErrorHandling({
    url: `${this.getNftApi()}?${urlParams}`,
    options: {
      headers: {
        Version: NFT_API_VERSION
      }
    }
  });
  const getCollectionParams = new URLSearchParams({
    chainId: "1",
    id: `${nftInformation?.tokens[0]?.token?.collection?.id}`
  }).toString();
  const collectionInformation = await fetchWithErrorHandling({
    url: `${NFT_API_BASE_URL}/collections?${getCollectionParams}`,
    options: {
      headers: {
        Version: NFT_API_VERSION
      }
    }
  });
  if (!nftInformation?.tokens?.[0]?.token) {
    return {
      name: null,
      description: null,
      image: null,
      standard: null
    };
  }
  const {
    image,
    metadata: { imageOriginal } = {},
    name,
    description,
    collection,
    kind,
    rarityRank,
    rarity,
    attributes,
    lastSale,
    imageSmall
  } = nftInformation.tokens[0].token;
  const nftMetadata = Object.assign(
    {},
    { name: name || null },
    { description: description || null },
    { image: image || null },
    collection?.creator && { creator: collection.creator },
    imageOriginal && { imageOriginal },
    imageSmall && { imageThumbnail: imageSmall },
    kind && { standard: kind.toUpperCase() },
    lastSale && { lastSale },
    attributes && { attributes },
    nftInformation.tokens[0].market?.topBid && {
      topBid: nftInformation.tokens[0].market?.topBid
    },
    rarityRank && { rarityRank },
    rarity && { rarity },
    (collection || collectionInformation) && {
      collection: {
        ...collection || {},
        creator: collection?.creator || collectionInformation?.collections[0].creator,
        openseaVerificationStatus: collectionInformation?.collections[0].openseaVerificationStatus,
        contractDeployedAt: collectionInformation?.collections[0].contractDeployedAt,
        ownerCount: collectionInformation?.collections[0].ownerCount,
        topBid: collectionInformation?.collections[0].topBid
      }
    }
  );
  return nftMetadata;
};
_getNftInformationFromTokenURI = new WeakSet();
getNftInformationFromTokenURI_fn = async function(contractAddress, tokenId, networkClientId) {
  const result = await __privateMethod(this, _getNftURIAndStandard, getNftURIAndStandard_fn).call(this, contractAddress, tokenId, networkClientId);
  let tokenURI = result[0];
  const standard = result[1];
  const hasIpfsTokenURI = tokenURI.startsWith("ipfs://");
  if (hasIpfsTokenURI && !__privateGet(this, _isIpfsGatewayEnabled)) {
    return {
      image: null,
      name: null,
      description: null,
      standard: standard || null,
      favorite: false,
      tokenURI: tokenURI ?? null
    };
  }
  const isDisplayNFTMediaToggleEnabled = __privateGet(this, _openSeaEnabled);
  if (!hasIpfsTokenURI && !isDisplayNFTMediaToggleEnabled) {
    return {
      image: null,
      name: null,
      description: null,
      standard: standard || null,
      favorite: false,
      tokenURI: tokenURI ?? null
    };
  }
  if (hasIpfsTokenURI) {
    tokenURI = await getFormattedIpfsUrl(
      __privateGet(this, _ipfsGateway),
      tokenURI,
      __privateGet(this, _useIpfsSubdomains)
    );
  }
  if (tokenURI.startsWith("data:image/")) {
    return {
      image: tokenURI,
      name: null,
      description: null,
      standard: standard || null,
      favorite: false,
      tokenURI: tokenURI ?? null
    };
  }
  try {
    const object = await handleFetch(tokenURI);
    const image = Object.prototype.hasOwnProperty.call(object, "image") ? "image" : (
      /* istanbul ignore next */
      "image_url"
    );
    return {
      image: object[image],
      name: object.name,
      description: object.description,
      standard,
      favorite: false,
      tokenURI: tokenURI ?? null
    };
  } catch {
    return {
      image: null,
      name: null,
      description: null,
      standard: standard || null,
      favorite: false,
      tokenURI: tokenURI ?? null
    };
  }
};
_getNftURIAndStandard = new WeakSet();
getNftURIAndStandard_fn = async function(contractAddress, tokenId, networkClientId) {
  try {
    const uri = await this.messagingSystem.call(
      "AssetsContractController:getERC721TokenURI",
      contractAddress,
      tokenId,
      networkClientId
    );
    return [uri, ERC721];
  } catch {
  }
  try {
    const tokenURI = await this.messagingSystem.call(
      "AssetsContractController:getERC1155TokenURI",
      contractAddress,
      tokenId,
      networkClientId
    );
    if (!tokenURI.includes("{id}")) {
      return [tokenURI, ERC1155];
    }
    const hexTokenId = remove0x(BNToHex(new BN(tokenId))).padStart(64, "0").toLowerCase();
    return [tokenURI.replace("{id}", hexTokenId), ERC1155];
  } catch {
  }
  return ["", ""];
};
_getNftInformation = new WeakSet();
getNftInformation_fn = async function(contractAddress, tokenId, networkClientId) {
  const chainId = __privateMethod(this, _getCorrectChainId, getCorrectChainId_fn).call(this, {
    networkClientId
  });
  const [blockchainMetadata, nftApiMetadata] = await Promise.all([
    safelyExecute(
      () => __privateMethod(this, _getNftInformationFromTokenURI, getNftInformationFromTokenURI_fn).call(this, contractAddress, tokenId, networkClientId)
    ),
    __privateGet(this, _openSeaEnabled) && chainId === "0x1" ? safelyExecute(
      () => __privateMethod(this, _getNftInformationFromApi, getNftInformationFromApi_fn).call(this, contractAddress, tokenId)
    ) : void 0
  ]);
  return {
    ...nftApiMetadata,
    name: blockchainMetadata?.name ?? nftApiMetadata?.name ?? null,
    description: blockchainMetadata?.description ?? nftApiMetadata?.description ?? null,
    image: nftApiMetadata?.image ?? blockchainMetadata?.image ?? null,
    standard: blockchainMetadata?.standard ?? nftApiMetadata?.standard ?? null,
    tokenURI: blockchainMetadata?.tokenURI ?? null
  };
};
_getNftContractInformationFromContract = new WeakSet();
getNftContractInformationFromContract_fn = async function(contractAddress, networkClientId) {
  const [name, symbol] = await Promise.all([
    this.messagingSystem.call(
      "AssetsContractController:getERC721AssetName",
      contractAddress,
      networkClientId
    ),
    this.messagingSystem.call(
      "AssetsContractController:getERC721AssetSymbol",
      contractAddress,
      networkClientId
    )
  ]);
  return {
    collection: { name },
    symbol,
    address: contractAddress
  };
};
_getNftContractInformation = new WeakSet();
getNftContractInformation_fn = async function(contractAddress, nftMetadataFromApi, networkClientId) {
  const blockchainContractData = await safelyExecute(
    () => __privateMethod(this, _getNftContractInformationFromContract, getNftContractInformationFromContract_fn).call(this, contractAddress, networkClientId)
  );
  if (blockchainContractData || !Object.values(nftMetadataFromApi).every((value) => value === null)) {
    return {
      address: contractAddress,
      ...blockchainContractData,
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      schema_name: nftMetadataFromApi?.standard ?? null,
      collection: {
        name: null,
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        image_url: nftMetadataFromApi?.collection?.image ?? nftMetadataFromApi?.collection?.imageUrl ?? null,
        tokenCount: nftMetadataFromApi?.collection?.tokenCount ?? null,
        ...nftMetadataFromApi?.collection,
        ...blockchainContractData?.collection
      }
    };
  }
  return {
    address: contractAddress,
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    asset_contract_type: null,
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    created_date: null,
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    schema_name: null,
    symbol: null,
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    total_supply: null,
    description: null,
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    external_link: null,
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    collection: { name: null, image_url: null }
  };
};
_addIndividualNft = new WeakSet();
addIndividualNft_fn = async function(tokenAddress, tokenId, nftMetadata, nftContract, chainId, userAddress, source) {
  const releaseLock = await __privateGet(this, _mutex).acquire();
  try {
    const checksumHexAddress = toChecksumHexAddress(tokenAddress);
    const { allNfts } = this.state;
    const nfts = [...allNfts[userAddress]?.[chainId] ?? []];
    const existingEntry = nfts.find(
      (nft) => nft.address.toLowerCase() === checksumHexAddress.toLowerCase() && nft.tokenId === tokenId
    );
    if (existingEntry) {
      const differentMetadata = compareNftMetadata(
        nftMetadata,
        existingEntry
      );
      const hasNewFields = hasNewCollectionFields(nftMetadata, existingEntry);
      if (!differentMetadata && existingEntry.isCurrentlyOwned && !hasNewFields) {
        return;
      }
      const indexToUpdate = nfts.findIndex(
        (nft) => nft.address.toLowerCase() === checksumHexAddress.toLowerCase() && nft.tokenId === tokenId
      );
      if (indexToUpdate !== -1) {
        nfts[indexToUpdate] = {
          ...existingEntry,
          ...nftMetadata
        };
      }
    } else {
      const newEntry = {
        address: checksumHexAddress,
        tokenId,
        favorite: false,
        isCurrentlyOwned: true,
        ...nftMetadata
      };
      nfts.push(newEntry);
    }
    __privateMethod(this, _updateNestedNftState, updateNestedNftState_fn).call(this, nfts, ALL_NFTS_STATE_KEY, {
      chainId,
      userAddress
    });
    if (__privateGet(this, _onNftAdded)) {
      __privateGet(this, _onNftAdded).call(this, {
        address: checksumHexAddress,
        symbol: nftContract.symbol,
        tokenId: tokenId.toString(),
        standard: nftMetadata.standard,
        source
      });
    }
  } finally {
    releaseLock();
  }
};
_addNftContract = new WeakSet();
addNftContract_fn = async function({
  tokenAddress,
  userAddress,
  networkClientId,
  source,
  nftMetadata
}) {
  const releaseLock = await __privateGet(this, _mutex).acquire();
  try {
    const checksumHexAddress = toChecksumHexAddress(tokenAddress);
    const { allNftContracts } = this.state;
    const chainId = __privateMethod(this, _getCorrectChainId, getCorrectChainId_fn).call(this, {
      networkClientId
    });
    const nftContracts = allNftContracts[userAddress]?.[chainId] || [];
    const existingEntry = nftContracts.find(
      (nftContract) => nftContract.address.toLowerCase() === checksumHexAddress.toLowerCase()
    );
    if (existingEntry) {
      return nftContracts;
    }
    const contractInformation = await __privateMethod(this, _getNftContractInformation, getNftContractInformation_fn).call(this, checksumHexAddress, nftMetadata, networkClientId);
    const {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      asset_contract_type,
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      created_date,
      symbol,
      description,
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      external_link,
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      schema_name,
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      collection: { name, image_url, tokenCount }
    } = contractInformation;
    if (source === "detected" /* Detected */ && "address" in contractInformation && typeof contractInformation.address === "string" && "collection" in contractInformation && contractInformation.collection.name === null && "image_url" in contractInformation.collection && contractInformation.collection.image_url === null && Object.entries(contractInformation).every(([key, value]) => {
      return key === "address" || key === "collection" || !value;
    })) {
      return nftContracts;
    }
    const newEntry = Object.assign(
      {},
      { address: checksumHexAddress },
      description && { description },
      name && { name },
      image_url && { logo: image_url },
      symbol && { symbol },
      tokenCount !== null && typeof tokenCount !== "undefined" && { totalSupply: tokenCount },
      asset_contract_type && { assetContractType: asset_contract_type },
      created_date && { createdDate: created_date },
      schema_name && { schemaName: schema_name },
      external_link && { externalLink: external_link }
    );
    const newNftContracts = [...nftContracts, newEntry];
    __privateMethod(this, _updateNestedNftState, updateNestedNftState_fn).call(this, newNftContracts, ALL_NFTS_CONTRACTS_STATE_KEY, {
      chainId,
      userAddress
    });
    return newNftContracts;
  } finally {
    releaseLock();
  }
};
_removeAndIgnoreIndividualNft = new WeakSet();
removeAndIgnoreIndividualNft_fn = function(address, tokenId, {
  chainId,
  userAddress
}) {
  const checksumHexAddress = toChecksumHexAddress(address);
  const { allNfts, ignoredNfts } = this.state;
  const newIgnoredNfts = [...ignoredNfts];
  const nfts = allNfts[userAddress]?.[chainId] || [];
  const newNfts = nfts.filter((nft) => {
    if (nft.address.toLowerCase() === checksumHexAddress.toLowerCase() && nft.tokenId === tokenId) {
      const alreadyIgnored = newIgnoredNfts.find(
        (c) => c.address === checksumHexAddress && c.tokenId === tokenId
      );
      !alreadyIgnored && newIgnoredNfts.push(nft);
      return false;
    }
    return true;
  });
  __privateMethod(this, _updateNestedNftState, updateNestedNftState_fn).call(this, newNfts, ALL_NFTS_STATE_KEY, {
    userAddress,
    chainId
  });
  this.update((state) => {
    state.ignoredNfts = newIgnoredNfts;
  });
};
_removeIndividualNft = new WeakSet();
removeIndividualNft_fn = function(address, tokenId, { chainId, userAddress }) {
  const checksumHexAddress = toChecksumHexAddress(address);
  const { allNfts } = this.state;
  const nfts = allNfts[userAddress]?.[chainId] || [];
  const newNfts = nfts.filter(
    (nft) => !(nft.address.toLowerCase() === checksumHexAddress.toLowerCase() && nft.tokenId === tokenId)
  );
  __privateMethod(this, _updateNestedNftState, updateNestedNftState_fn).call(this, newNfts, ALL_NFTS_STATE_KEY, {
    userAddress,
    chainId
  });
};
_removeNftContract = new WeakSet();
removeNftContract_fn = function(address, { chainId, userAddress }) {
  const checksumHexAddress = toChecksumHexAddress(address);
  const { allNftContracts } = this.state;
  const nftContracts = allNftContracts[userAddress]?.[chainId] || [];
  const newNftContracts = nftContracts.filter(
    (nftContract) => !(nftContract.address.toLowerCase() === checksumHexAddress.toLowerCase())
  );
  __privateMethod(this, _updateNestedNftState, updateNestedNftState_fn).call(this, newNftContracts, ALL_NFTS_CONTRACTS_STATE_KEY, {
    chainId,
    userAddress
  });
  return newNftContracts;
};
_validateWatchNft = new WeakSet();
validateWatchNft_fn = async function(asset, type, userAddress, { networkClientId } = {}) {
  const { address: contractAddress, tokenId } = asset;
  if (!type) {
    throw rpcErrors.invalidParams("Asset type is required");
  }
  if (type !== ERC721 && type !== ERC1155) {
    throw rpcErrors.invalidParams(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `Non NFT asset type ${type} not supported by watchNft`
    );
  }
  if (!contractAddress || !tokenId) {
    throw rpcErrors.invalidParams("Both address and tokenId are required");
  }
  if (!isAddress(contractAddress)) {
    throw rpcErrors.invalidParams("Invalid address");
  }
  if (!/^\d+$/u.test(tokenId)) {
    throw rpcErrors.invalidParams("Invalid tokenId");
  }
  try {
    const isOwner = await this.isNftOwner(
      userAddress,
      contractAddress,
      tokenId,
      { networkClientId }
    );
    if (!isOwner) {
      throw rpcErrors.invalidInput(
        "Suggested NFT is not owned by the selected account"
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      throw rpcErrors.resourceUnavailable(error.message);
    }
    throw error;
  }
};
_getCorrectChainId = new WeakSet();
getCorrectChainId_fn = function({
  networkClientId
}) {
  if (networkClientId) {
    const {
      configuration: { chainId }
    } = this.messagingSystem.call(
      "NetworkController:getNetworkClientById",
      networkClientId
    );
    return chainId;
  }
  return __privateGet(this, _chainId);
};
_getAddressOrSelectedAddress = new WeakSet();
getAddressOrSelectedAddress_fn = function(address) {
  if (address) {
    return address;
  }
  const selectedAccount = this.messagingSystem.call(
    "AccountsController:getAccount",
    __privateGet(this, _selectedAccountId)
  );
  return selectedAccount?.address || "";
};
_updateNftUpdateForAccount = new WeakSet();
updateNftUpdateForAccount_fn = async function(account) {
  const nfts = this.state.allNfts[account.address]?.[__privateGet(this, _chainId)] ?? [];
  const nftsToUpdate = nfts.filter(
    (singleNft) => !singleNft.name && !singleNft.description && !singleNft.image
  );
  if (nftsToUpdate.length !== 0) {
    await this.updateNftMetadata({
      nfts: nftsToUpdate,
      userAddress: account.address
    });
  }
};
var NftController_default = NftController;

export {
  getDefaultNftControllerState,
  NftController,
  NftController_default
};
//# sourceMappingURL=chunk-V2OAFJSL.mjs.map