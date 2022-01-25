import {
  Collectible,
  CollectibleMetadata,
  CollectibleContract,
} from './CollectiblesController';

const COLLECTIBLE_CONTRACT_KEYS: (keyof CollectibleContract)[] = [
  'address',
  'assetContractType',
  'createdDate',
  'description',
  'externalLink',
  'logo',
  'name',
  'schemaName',
  'symbol',
  'totalSupply',
];

const COLLECTIBLE_METADATA_KEYS: (keyof CollectibleMetadata)[] = [
  'image',
  'backgroundColor',
  'imagePreview',
  'imageThumbnail',
  'imageOriginal',
  'animation',
  'animationOriginal',
  'externalLink',
];

/**
 * Compares collectible metadata entries to any collectible entry.
 * We need this method when comparing a new fetched collectible metadata, in case a entry changed to a defined value,
 * there's a need to update the collectible in state.
 *
 * @param newCollectibleMetadata - Collectible metadata object.
 * @param collectible - Collectible object to compare with.
 * @returns Whether there are differences.
 */
export function isCollectibleMetadataEqual(
  newCollectibleMetadata: CollectibleMetadata,
  collectible: Collectible,
) {
  return !COLLECTIBLE_METADATA_KEYS.some(
    (key) =>
      newCollectibleMetadata[key] &&
      newCollectibleMetadata[key] !== collectible[key],
  );
}

/**
 * Compares one CollectibleContract object to another CollectibleContract object.
 * We need this method when comparing a new fetched CollectibleContract, in case a entry changed to a defined value,
 * there's a need to update the CollectibleContract object in state.
 *
 * @param newCollectibleContract - CollectibleContract data object.
 * @param oldCollectibleContract - CollectibleContract object to compare with.
 * @returns Whether there are differences.
 */
export function isCollectibleContractEqual(
  newCollectibleContract: CollectibleContract,
  oldCollectibleContract: CollectibleContract,
) {
  return !COLLECTIBLE_CONTRACT_KEYS.some(
    (key) =>
      newCollectibleContract[key] &&
      newCollectibleContract[key] !== oldCollectibleContract[key],
  );
}
