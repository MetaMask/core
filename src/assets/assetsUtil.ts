import { Collectible, CollectibleMetadata } from "./AssetsController"

/**
 * Compares collectible metadata entries to any collectible entry
 * 
 * @param collectibleMetadata - Collectible metadata object
 * @param collectible - Collectible object to compare with
 * @returns - Whether there are differences
 */
 export function compareCollectiblesMetadata(collectibleMetadata: CollectibleMetadata, collectible: Collectible) {
      const keys: Array<keyof CollectibleMetadata> = ['image', 'backgroundColor', 'imagePreview', 'imageThumbnail', 'imageOriginal', 'animation', 'animationOriginal', 'externalLink']
      const differentValues = keys.reduce((value, key) => {
        if (collectibleMetadata?.[key] && (collectibleMetadata?.[key] !== collectible[key])) {
          return value + 1
        }
        return value
      }, 0)
     return differentValues > 0
  }