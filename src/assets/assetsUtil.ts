import {
  Collectible,
  CollectibleMetadata,
  CollectibleContract,
} from './CollectiblesController';

/**
 * Compares collectible metadata entries to any collectible entry.
 * We need this method when comparing a new fetched collectible metadata, in case a entry changed to a defined value,
 * there's a need to update the collectible in state.
 *
 * @param newCollectibleMetadata - Collectible metadata object.
 * @param collectible - Collectible object to compare with.
 * @returns Whether there are differences.
 */
export function compareCollectiblesMetadata(
  newCollectibleMetadata: CollectibleMetadata,
  collectible: Collectible,
) {
  const keys: (keyof CollectibleMetadata)[] = [
    'image',
    'backgroundColor',
    'imagePreview',
    'imageThumbnail',
    'imageOriginal',
    'animation',
    'animationOriginal',
    'externalLink',
  ];
  const differentValues = keys.reduce((value, key) => {
    if (
      newCollectibleMetadata[key] &&
      newCollectibleMetadata[key] !== collectible[key]
    ) {
      return value + 1;
    }
    return value;
  }, 0);
  return differentValues > 0;
}

/**
 * Compares CollectibleContract entries to any CollectibleContract entry.
 * We need this method when comparing a new fetched CollectibleContract, in case a entry changed to a defined value,
 * there's a need to update the CollectibleContract object in state.
 *
 * @param newCollectibleContract - CollectibleContract data object.
 * @param oldCollectibleContract - CollectibleContract object to compare with.
 * @returns Whether there are differences.
 */
export function compareCollectibleContract(
  newCollectibleContract: CollectibleContract,
  oldCollectibleContract: CollectibleContract,
) {
  const keys: (keyof CollectibleContract)[] = [
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

  return keys.some(
    (key) => newCollectibleContract[key] !== oldCollectibleContract[key],
  );
}
