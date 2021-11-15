import { Collectible, CollectibleMetadata } from './CollectiblesController';
/**
 * Compares a collectible address and token ID to the values addressToCompare and tokenIdToCompare.
 * The conversion to a String is needed to solve a backwards compatibility issue caused by token IDs
 * being stored as Number.
 *
 * @param collectible - Collectible object.
 * @param addressToCompare - Address to compare with.
 * @param tokenIdToCompare - Token ID to compare with.
 * @returns Boolean indicating if the values match the collectible data.
 */
export declare function compareCollectibles(collectible: Collectible, addressToCompare: string, tokenIdToCompare: string): boolean;
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
