/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { NftController } from './NftController.js';

/**
 * Checks the ownership of a ERC-721 or ERC-1155 NFT for a given address.
 *
 * @param ownerAddress - User public address.
 * @param nftAddress - NFT contract address.
 * @param tokenId - NFT token ID.
 * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
 * @param options - Optional parameters.
 * @param options.standard - The NFT standard ('ERC721' or 'ERC1155'). When provided, only the
 * relevant ownership check is performed, halving the number of RPC subcalls.
 * @returns Promise resolving the NFT ownership.
 */
export type NftControllerIsNftOwnerAction = {
  type: `NftController:isNftOwner`;
  handler: NftController['isNftOwner'];
};

/**
 * Verifies currently selected address owns entered NFT address/tokenId combo and
 * adds the NFT and respective NFT contract to the stored NFT and NFT contracts lists.
 *
 * @param address - Hex address of the NFT contract.
 * @param tokenId - The NFT identifier.
 * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
 * @param options - an object of arguments
 * @param options.userAddress - The address of the current user.
 * @param options.source - Whether the NFT was detected, added manually or suggested by a dapp. Defaults to `Source.Custom`; pass `Source.Detected` when refreshing existing NFTs.
 */
export type NftControllerAddNftVerifyOwnershipAction = {
  type: `NftController:addNftVerifyOwnership`;
  handler: NftController['addNftVerifyOwnership'];
};

/**
 * Adds an NFT and respective NFT contract to the stored NFT and NFT contracts lists.
 *
 * @param tokenAddress - Hex address of the NFT contract.
 * @param tokenId - The NFT identifier.
 * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
 * @param options - an object of arguments
 * @param options.nftMetadata - NFT optional metadata.
 * @param options.userAddress - The address of the current user.
 * @param options.source - Whether the NFT was detected, added manually or suggested by a dapp. Defaults to `Source.Custom`; pass `Source.Detected` when refreshing existing NFTs.
 * @returns Promise resolving to the current NFT list.
 */
export type NftControllerAddNftAction = {
  type: `NftController:addNft`;
  handler: NftController['addNft'];
};

/**
 * Adds multiple NFTs and respective NFT contracts to the stored NFT and NFT contracts lists.
 *
 * @param nfts - An array of NFT objects to add.
 * @param nfts[].tokenAddress - Hex address of the NFT contract.
 * @param nfts[].tokenId - The NFT identifier.
 * @param nfts[].nftMetadata - NFT metadata including chainId.
 * @param userAddress - The address of the current user.
 * @param source - Whether the NFT was detected, added manually or suggested by a dapp. Defaults to `Source.Custom`; pass `Source.Detected` when refreshing existing NFTs.
 * @returns Promise resolving to the current NFT list.
 */
export type NftControllerAddNftsAction = {
  type: `NftController:addNfts`;
  handler: NftController['addNfts'];
};

/**
 * Removes an NFT from the stored token list.
 *
 * @param address - Hex address of the NFT contract.
 * @param tokenId - Token identifier of the NFT.
 * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
 * @param options - an object of arguments
 * @param options.userAddress - The address of the account where the NFT is being removed.
 */
export type NftControllerRemoveNftAction = {
  type: `NftController:removeNft`;
  handler: NftController['removeNft'];
};

/**
 * Removes an NFT from the stored token list and saves it in ignored NFTs list.
 *
 * @param address - Hex address of the NFT contract.
 * @param tokenId - Token identifier of the NFT.
 * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
 * @param options - an object of arguments
 * @param options.userAddress - The address of the account where the NFT is being removed.
 */
export type NftControllerRemoveAndIgnoreNftAction = {
  type: `NftController:removeAndIgnoreNft`;
  handler: NftController['removeAndIgnoreNft'];
};

/**
 * Checks whether input NFT is still owned by the user
 * and updates the isCurrentlyOwned value on the NFT object accordingly.
 *
 * @param nft - The NFT object to check and update.
 * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
 * @param accountParams - The userAddress to check ownership against.
 * @param accountParams.userAddress - the address passed through the confirmed transaction flow to ensure assets are stored to the correct account
 * @returns the NFT with the updated isCurrentlyOwned value
 */
export type NftControllerCheckAndUpdateSingleNftOwnershipStatusAction = {
  type: `NftController:checkAndUpdateSingleNftOwnershipStatus`;
  handler: NftController['checkAndUpdateSingleNftOwnershipStatus'];
};

/**
 * Checks whether NFTs associated with current selectedAddress/chainId combination are still owned by the user
 * And updates the isCurrentlyOwned value on each accordingly.
 * Uses Multicall3 to batch all ownership checks into a single RPC request when available.
 *
 * @param networkClientId - The networkClientId that can be used to identify the network client to use for this request.
 * @param options - an object of arguments
 * @param options.userAddress - The address of the account where the NFT ownership status is checked/updated.
 */
export type NftControllerCheckAndUpdateAllNftsOwnershipStatusAction = {
  type: `NftController:checkAndUpdateAllNftsOwnershipStatus`;
  handler: NftController['checkAndUpdateAllNftsOwnershipStatus'];
};

/**
 * Union of all NftController action types.
 */
export type NftControllerMethodActions =
  | NftControllerIsNftOwnerAction
  | NftControllerAddNftVerifyOwnershipAction
  | NftControllerAddNftAction
  | NftControllerAddNftsAction
  | NftControllerRemoveNftAction
  | NftControllerRemoveAndIgnoreNftAction
  | NftControllerCheckAndUpdateSingleNftOwnershipStatusAction
  | NftControllerCheckAndUpdateAllNftsOwnershipStatusAction;
