/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { NftController } from './NftController.js';

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
 * Union of all NftController action types.
 */
export type NftControllerMethodActions = NftControllerRemoveNftAction;
