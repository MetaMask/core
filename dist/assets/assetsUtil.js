"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareCollectiblesMetadata = void 0;
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