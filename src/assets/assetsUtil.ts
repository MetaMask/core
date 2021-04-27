import { Collectible, CollectibleMetadata } from './AssetsController';

/**
 * Compares collectible metadata entries to any collectible entry
 * We need this method when comparing a new fetched collectible metadata, in case a entry changed to a defined value,
 * there's a need to update the collectible in state.
 *
 * @param collectibleMetadata - Collectible metadata object
 * @param collectible - Collectible object to compare with
 * @returns - Whether there are differences
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
