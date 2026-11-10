/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { NftDetectionController } from './NftDetectionController.js';

/**
 * Triggers asset ERC721 token auto detection on mainnet. Any newly detected NFTs are
 * added.
 *
 * @param chainIds - The chain IDs to detect NFTs on.
 * @param options - Options bag.
 * @param options.userAddress - The address to detect NFTs for.
 * @param options.firstPageOnly - Whether to only detect the first page of NFTs.
 * @param options.signal - An optional abort signal to cancel the operation.
 */
export type NftDetectionControllerDetectNftsAction = {
  type: `NftDetectionController:detectNfts`;
  handler: NftDetectionController['detectNfts'];
};

/**
 * Union of all NftDetectionController action types.
 */
export type NftDetectionControllerMethodActions =
  NftDetectionControllerDetectNftsAction;
