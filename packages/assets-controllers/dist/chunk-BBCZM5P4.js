"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkMZI3SDQNjs = require('./chunk-MZI3SDQN.js');





var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/NftDetectionController.ts
var _basecontroller = require('@metamask/base-controller');









var _controllerutils = require('@metamask/controller-utils');
var _utils = require('@metamask/utils');
var controllerName = "NftDetectionController";
var supportedNftDetectionNetworks = [
  _controllerutils.ChainId.mainnet,
  _controllerutils.ChainId["linea-mainnet"]
];
var BlockaidResultType = /* @__PURE__ */ ((BlockaidResultType2) => {
  BlockaidResultType2["Benign"] = "Benign";
  BlockaidResultType2["Spam"] = "Spam";
  BlockaidResultType2["Warning"] = "Warning";
  BlockaidResultType2["Malicious"] = "Malicious";
  return BlockaidResultType2;
})(BlockaidResultType || {});
var MAX_GET_COLLECTION_BATCH_SIZE = 20;
var _disabled, _addNft, _getNftState, _inProcessNftFetchingUpdates, _onPreferencesControllerStateChange, onPreferencesControllerStateChange_fn, _getOwnerNftApi, getOwnerNftApi_fn, _getOwnerNfts, getOwnerNfts_fn;
var NftDetectionController = class extends _basecontroller.BaseController {
  /**
   * The controller options
   *
   * @param options - The controller options.
   * @param options.messenger - A reference to the messaging system.
   * @param options.disabled - Represents previous value of useNftDetection. Used to detect changes of useNftDetection. Default value is true.
   * @param options.addNft - Add an NFT.
   * @param options.getNftState - Gets the current state of the Assets controller.
   */
  constructor({
    messenger,
    disabled = false,
    addNft,
    getNftState
  }) {
    super({
      name: controllerName,
      messenger,
      metadata: {},
      state: {}
    });
    /**
     * Handles the state change of the preference controller.
     * @param preferencesState - The new state of the preference controller.
     * @param preferencesState.useNftDetection - Boolean indicating user preference on NFT detection.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _onPreferencesControllerStateChange);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getOwnerNftApi);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getOwnerNfts);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _disabled, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _addNft, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getNftState, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _inProcessNftFetchingUpdates, void 0);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _disabled, disabled);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _inProcessNftFetchingUpdates, {});
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _getNftState, getNftState);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _addNft, addNft);
    this.messagingSystem.subscribe(
      "PreferencesController:stateChange",
      _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _onPreferencesControllerStateChange, onPreferencesControllerStateChange_fn).bind(this)
    );
  }
  /**
   * Checks whether network is mainnet or not.
   *
   * @returns Whether current network is mainnet.
   */
  isMainnet() {
    const { selectedNetworkClientId } = this.messagingSystem.call(
      "NetworkController:getState"
    );
    const {
      configuration: { chainId }
    } = this.messagingSystem.call(
      "NetworkController:getNetworkClientById",
      selectedNetworkClientId
    );
    return chainId === _controllerutils.ChainId.mainnet;
  }
  isMainnetByNetworkClientId(networkClient) {
    return networkClient.configuration.chainId === _controllerutils.ChainId.mainnet;
  }
  /**
   * Triggers asset ERC721 token auto detection on mainnet. Any newly detected NFTs are
   * added.
   *
   * @param options - Options bag.
   * @param options.networkClientId - The network client ID to detect NFTs on.
   * @param options.userAddress - The address to detect NFTs for.
   */
  async detectNfts(options) {
    const userAddress = options?.userAddress ?? this.messagingSystem.call("AccountsController:getSelectedAccount").address;
    const { selectedNetworkClientId } = this.messagingSystem.call(
      "NetworkController:getState"
    );
    const {
      configuration: { chainId }
    } = this.messagingSystem.call(
      "NetworkController:getNetworkClientById",
      selectedNetworkClientId
    );
    if (!supportedNftDetectionNetworks.includes(chainId) || _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _disabled)) {
      return;
    }
    if (!userAddress) {
      return;
    }
    const updateKey = `${chainId}:${userAddress}`;
    if (updateKey in _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _inProcessNftFetchingUpdates)) {
      await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _inProcessNftFetchingUpdates)[updateKey];
      return;
    }
    const {
      promise: inProgressUpdate,
      resolve: updateSucceeded,
      reject: updateFailed
    } = _utils.createDeferredPromise.call(void 0, { suppressUnhandledRejection: true });
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _inProcessNftFetchingUpdates)[updateKey] = inProgressUpdate;
    let next;
    let apiNfts = [];
    let resultNftApi;
    try {
      do {
        resultNftApi = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getOwnerNfts, getOwnerNfts_fn).call(this, userAddress, chainId, next);
        apiNfts = resultNftApi.tokens.filter(
          (elm) => elm.token.isSpam === false && (elm.blockaidResult?.result_type ? elm.blockaidResult?.result_type === "Benign" /* Benign */ : true)
        );
        const collections = apiNfts.reduce((acc, currValue) => {
          if (!acc.includes(currValue.token.contract) && currValue.token.contract === currValue?.token?.collection?.id) {
            acc.push(currValue.token.contract);
          }
          return acc;
        }, []);
        if (collections.length !== 0) {
          const collectionResponse = await _chunkMZI3SDQNjs.reduceInBatchesSerially.call(void 0, {
            values: collections,
            batchSize: MAX_GET_COLLECTION_BATCH_SIZE,
            eachBatch: async (allResponses, batch) => {
              const params = new URLSearchParams(
                batch.map((s) => ["contract", s])
              );
              params.append("chainId", "1");
              const collectionResponseForBatch = await _controllerutils.fetchWithErrorHandling.call(void 0, 
                {
                  url: `${_controllerutils.NFT_API_BASE_URL}/collections?${params.toString()}`,
                  options: {
                    headers: {
                      Version: _controllerutils.NFT_API_VERSION
                    }
                  },
                  timeout: _controllerutils.NFT_API_TIMEOUT
                }
              );
              return {
                ...allResponses,
                ...collectionResponseForBatch
              };
            },
            initialResult: {}
          });
          if (collectionResponse.collections?.length) {
            apiNfts.forEach((singleNFT) => {
              const found = collectionResponse.collections.find(
                (elm) => elm.id?.toLowerCase() === singleNFT.token.contract.toLowerCase()
              );
              if (found) {
                singleNFT.token = {
                  ...singleNFT.token,
                  collection: {
                    ...singleNFT.token.collection ?? {},
                    creator: found?.creator,
                    openseaVerificationStatus: found?.openseaVerificationStatus,
                    contractDeployedAt: found.contractDeployedAt,
                    ownerCount: found.ownerCount,
                    topBid: found.topBid
                  }
                };
              }
            });
          }
        }
        const addNftPromises = apiNfts.map(async (nft) => {
          const {
            tokenId,
            contract,
            kind,
            image: imageUrl,
            imageSmall: imageThumbnailUrl,
            metadata: { imageOriginal: imageOriginalUrl } = {},
            name,
            description,
            attributes,
            topBid,
            lastSale,
            rarityRank,
            rarityScore,
            collection
          } = nft.token;
          let ignored;
          const { ignoredNfts } = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getNftState).call(this);
          if (ignoredNfts.length) {
            ignored = ignoredNfts.find((c) => {
              return c.address === _controllerutils.toChecksumHexAddress.call(void 0, contract) && c.tokenId === tokenId;
            });
          }
          if (!ignored) {
            const nftMetadata = Object.assign(
              {},
              { name },
              description && { description },
              imageUrl && { image: imageUrl },
              imageThumbnailUrl && { imageThumbnail: imageThumbnailUrl },
              imageOriginalUrl && { imageOriginal: imageOriginalUrl },
              kind && { standard: kind.toUpperCase() },
              lastSale && { lastSale },
              attributes && { attributes },
              topBid && { topBid },
              rarityRank && { rarityRank },
              rarityScore && { rarityScore },
              collection && { collection }
            );
            await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _addNft).call(this, contract, tokenId, {
              nftMetadata,
              userAddress,
              source: "detected" /* Detected */,
              networkClientId: options?.networkClientId
            });
          }
        });
        await Promise.all(addNftPromises);
      } while (next = resultNftApi.continuation);
      updateSucceeded();
    } catch (error) {
      updateFailed(error);
      throw error;
    } finally {
      delete _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _inProcessNftFetchingUpdates)[updateKey];
    }
  }
};
_disabled = new WeakMap();
_addNft = new WeakMap();
_getNftState = new WeakMap();
_inProcessNftFetchingUpdates = new WeakMap();
_onPreferencesControllerStateChange = new WeakSet();
onPreferencesControllerStateChange_fn = function({ useNftDetection }) {
  if (!useNftDetection !== _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _disabled)) {
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _disabled, !useNftDetection);
  }
};
_getOwnerNftApi = new WeakSet();
getOwnerNftApi_fn = function({
  chainId,
  address,
  next
}) {
  return `${_controllerutils.NFT_API_BASE_URL}/users/${address}/tokens?chainIds=${chainId}&limit=50&includeTopBid=true&continuation=${next ?? ""}`;
};
_getOwnerNfts = new WeakSet();
getOwnerNfts_fn = async function(address, chainId, cursor) {
  const convertedChainId = _controllerutils.convertHexToDecimal.call(void 0, chainId).toString();
  const url = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getOwnerNftApi, getOwnerNftApi_fn).call(this, {
    chainId: convertedChainId,
    address,
    next: cursor
  });
  const nftApiResponse = await _controllerutils.handleFetch.call(void 0, url, {
    headers: {
      Version: _controllerutils.NFT_API_VERSION
    }
  });
  return nftApiResponse;
};
var NftDetectionController_default = NftDetectionController;






exports.BlockaidResultType = BlockaidResultType; exports.MAX_GET_COLLECTION_BATCH_SIZE = MAX_GET_COLLECTION_BATCH_SIZE; exports.NftDetectionController = NftDetectionController; exports.NftDetectionController_default = NftDetectionController_default;
//# sourceMappingURL=chunk-BBCZM5P4.js.map