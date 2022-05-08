import { Collectible, CollectibleMetadata } from './CollectiblesController';
/**
 * Compares collectible metadata entries to any collectible entry.
 * We need this method when comparing a new fetched collectible metadata, in case a entry changed to a defined value,
 * there's a need to update the collectible in state.
 *
 * @param newCollectibleMetadata - Collectible metadata object.
 * @param collectible - Collectible object to compare with.
 * @returns Whether there are differences.
 */
export declare function compareCollectiblesMetadata(newCollectibleMetadata: CollectibleMetadata, collectible: Collectible): boolean;
