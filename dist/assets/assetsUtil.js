"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareCollectiblesMetadata = exports.compareCollectibles = void 0;
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
function compareCollectibles(collectible, addressToCompare, tokenIdToCompare) {
    return (collectible.address.toLowerCase() === addressToCompare.toLowerCase() &&
        (collectible.tokenId === tokenIdToCompare ||
            String(collectible.tokenId) === tokenIdToCompare));
}
exports.compareCollectibles = compareCollectibles;
/**
 * Compares collectible metadata entries to any collectible entry.
 * We need this method when comparing a new fetched collectible metadata, in case a entry changed to a defined value,
 * there's a need to update the collectible in state.
 *
 * @param newCollectibleMetadata - Collectible metadata object.
 * @param collectible - Collectible object to compare with.
 * @returns Whether there are differences.
 */
function compareCollectiblesMetadata(newCollectibleMetadata, collectible) {
    const keys = [
        'image',
        'backgroundColor',
        'imagePreview',
        'imageThumbnail',
        'imageOriginal',
        'animation',
        'animationOriginal',
        'externalLink',
        'standard',
    ];
    const differentValues = keys.reduce((value, key) => {
        if (newCollectibleMetadata[key] &&
            newCollectibleMetadata[key] !== collectible[key]) {
            return value + 1;
        }
        return value;
    }, 0);
    return differentValues > 0;
}
exports.compareCollectiblesMetadata = compareCollectiblesMetadata;
//# sourceMappingURL=assetsUtil.js.map