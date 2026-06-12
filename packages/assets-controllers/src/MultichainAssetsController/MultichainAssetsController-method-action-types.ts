/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MultichainAssetsController } from './MultichainAssetsController';

/**
 * @deprecated This is deprecated and will be removed in a future version. Use `AssetsController` from `@metamask/assets-controller` instead.
 * Returns the metadata for the given asset
 *
 * @param asset - The asset to get metadata for
 * @returns The metadata for the asset or undefined if not found.
 */
export type MultichainAssetsControllerGetAssetMetadataAction = {
  type: `MultichainAssetsController:getAssetMetadata`;
  handler: MultichainAssetsController['getAssetMetadata'];
};

/**
 * @deprecated This is deprecated and will be removed in a future version. Use `AssetsController` from `@metamask/assets-controller` instead.
 * Ignores a batch of assets for a specific account.
 *
 * @param assetsToIgnore - Array of asset IDs to ignore.
 * @param accountId - The account ID to ignore assets for.
 */
export type MultichainAssetsControllerIgnoreAssetsAction = {
  type: `MultichainAssetsController:ignoreAssets`;
  handler: MultichainAssetsController['ignoreAssets'];
};

/**
 * @deprecated This is deprecated and will be removed in a future version. Use `AssetsController` from `@metamask/assets-controller` instead.
 * Adds multiple assets to the stored asset list for a specific account.
 * All assets must belong to the same chain.
 *
 * @param assetIds - Array of CAIP asset IDs to add (must be from same chain).
 * @param accountId - The account ID to add the assets to.
 * @returns The updated asset list for the account.
 * @throws Error if assets are from different chains.
 */
export type MultichainAssetsControllerAddAssetsAction = {
  type: `MultichainAssetsController:addAssets`;
  handler: MultichainAssetsController['addAssets'];
};

/**
 * Union of all MultichainAssetsController action types.
 */
export type MultichainAssetsControllerMethodActions =
  | MultichainAssetsControllerGetAssetMetadataAction
  | MultichainAssetsControllerIgnoreAssetsAction
  | MultichainAssetsControllerAddAssetsAction;
