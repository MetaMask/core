import {
  reduceInBatchesSerially
} from "./chunk-BZEAPSD5.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/NftDetectionController.ts
import { BaseController } from "@metamask/base-controller";
import {
  toChecksumHexAddress,
  ChainId,
  NFT_API_BASE_URL,
  NFT_API_VERSION,
  convertHexToDecimal,
  handleFetch,
  fetchWithErrorHandling,
  NFT_API_TIMEOUT
} from "@metamask/controller-utils";
import { createDeferredPromise } from "@metamask/utils";
var controllerName = "NftDetectionController";
var supportedNftDetectionNetworks = [
  ChainId.mainnet,
  ChainId["linea-mainnet"]
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
var NftDetectionController = class extends BaseController {
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
    __privateAdd(this, _onPreferencesControllerStateChange);
    __privateAdd(this, _getOwnerNftApi);
    __privateAdd(this, _getOwnerNfts);
    __privateAdd(this, _disabled, void 0);
    __privateAdd(this, _addNft, void 0);
    __privateAdd(this, _getNftState, void 0);
    __privateAdd(this, _inProcessNftFetchingUpdates, void 0);
    __privateSet(this, _disabled, disabled);
    __privateSet(this, _inProcessNftFetchingUpdates, {});
    __privateSet(this, _getNftState, getNftState);
    __privateSet(this, _addNft, addNft);
    this.messagingSystem.subscribe(
      "PreferencesController:stateChange",
      __privateMethod(this, _onPreferencesControllerStateChange, onPreferencesControllerStateChange_fn).bind(this)
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
    return chainId === ChainId.mainnet;
  }
  isMainnetByNetworkClientId(networkClient) {
    return networkClient.configuration.chainId === ChainId.mainnet;
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
    if (!supportedNftDetectionNetworks.includes(chainId) || __privateGet(this, _disabled)) {
      return;
    }
    if (!userAddress) {
      return;
    }
    const updateKey = `${chainId}:${userAddress}`;
    if (updateKey in __privateGet(this, _inProcessNftFetchingUpdates)) {
      await __privateGet(this, _inProcessNftFetchingUpdates)[updateKey];
      return;
    }
    const {
      promise: inProgressUpdate,
      resolve: updateSucceeded,
      reject: updateFailed
    } = createDeferredPromise({ suppressUnhandledRejection: true });
    __privateGet(this, _inProcessNftFetchingUpdates)[updateKey] = inProgressUpdate;
    let next;
    let apiNfts = [];
    let resultNftApi;
    try {
      do {
        resultNftApi = await __privateMethod(this, _getOwnerNfts, getOwnerNfts_fn).call(this, userAddress, chainId, next);
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
          const collectionResponse = await reduceInBatchesSerially({
            values: collections,
            batchSize: MAX_GET_COLLECTION_BATCH_SIZE,
            eachBatch: async (allResponses, batch) => {
              const params = new URLSearchParams(
                batch.map((s) => ["contract", s])
              );
              params.append("chainId", "1");
              const collectionResponseForBatch = await fetchWithErrorHandling(
                {
                  url: `${NFT_API_BASE_URL}/collections?${params.toString()}`,
                  options: {
                    headers: {
                      Version: NFT_API_VERSION
                    }
                  },
                  timeout: NFT_API_TIMEOUT
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
          const { ignoredNfts } = __privateGet(this, _getNftState).call(this);
          if (ignoredNfts.length) {
            ignored = ignoredNfts.find((c) => {
              return c.address === toChecksumHexAddress(contract) && c.tokenId === tokenId;
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
            await __privateGet(this, _addNft).call(this, contract, tokenId, {
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
      delete __privateGet(this, _inProcessNftFetchingUpdates)[updateKey];
    }
  }
};
_disabled = new WeakMap();
_addNft = new WeakMap();
_getNftState = new WeakMap();
_inProcessNftFetchingUpdates = new WeakMap();
_onPreferencesControllerStateChange = new WeakSet();
onPreferencesControllerStateChange_fn = function({ useNftDetection }) {
  if (!useNftDetection !== __privateGet(this, _disabled)) {
    __privateSet(this, _disabled, !useNftDetection);
  }
};
_getOwnerNftApi = new WeakSet();
getOwnerNftApi_fn = function({
  chainId,
  address,
  next
}) {
  return `${NFT_API_BASE_URL}/users/${address}/tokens?chainIds=${chainId}&limit=50&includeTopBid=true&continuation=${next ?? ""}`;
};
_getOwnerNfts = new WeakSet();
getOwnerNfts_fn = async function(address, chainId, cursor) {
  const convertedChainId = convertHexToDecimal(chainId).toString();
  const url = __privateMethod(this, _getOwnerNftApi, getOwnerNftApi_fn).call(this, {
    chainId: convertedChainId,
    address,
    next: cursor
  });
  const nftApiResponse = await handleFetch(url, {
    headers: {
      Version: NFT_API_VERSION
    }
  });
  return nftApiResponse;
};
var NftDetectionController_default = NftDetectionController;

export {
  BlockaidResultType,
  MAX_GET_COLLECTION_BATCH_SIZE,
  NftDetectionController,
  NftDetectionController_default
};
//# sourceMappingURL=chunk-C7LNCQXM.mjs.map