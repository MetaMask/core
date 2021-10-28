import * as assetsUtil from './assetsUtil';
import { Collectible, CollectibleMetadata } from './CollectiblesController';

describe('assetsUtil', () => {
  describe('compareCollectiblesMetadata', () => {
    it('should resolve true if any key is different', () => {
      const collectibleMetadata: CollectibleMetadata = {
        image: 'image',
        backgroundColor: 'backgroundColor',
        imagePreview: 'imagePreview',
        imageThumbnail: 'imageThumbnail',
        imageOriginal: 'imageOriginal',
        animation: 'animation',
        animationOriginal: 'animationOriginal',
        externalLink: 'externalLink-123',
      };
      const collectible: Collectible = {
        address: 'address',
        tokenId: '123',
        name: 'name',
        image: 'image',
        backgroundColor: 'backgroundColor',
        imagePreview: 'imagePreview',
        imageThumbnail: 'imageThumbnail',
        imageOriginal: 'imageOriginal',
        animation: 'animation',
        animationOriginal: 'animationOriginal',
        externalLink: 'externalLink',
      };
      const different = assetsUtil.compareCollectiblesMetadata(
        collectibleMetadata,
        collectible,
      );
      expect(different).toStrictEqual(true);
    });

    it('should resolve true if any key is different as always as metadata is not undefined', () => {
      const collectibleMetadata: CollectibleMetadata = {
        image: 'image',
        externalLink: 'externalLink',
      };
      const collectible: Collectible = {
        address: 'address',
        tokenId: '123',
        name: 'name',
        image: 'image',
        backgroundColor: 'backgroundColor',
        externalLink: 'externalLink',
      };
      const different = assetsUtil.compareCollectiblesMetadata(
        collectibleMetadata,
        collectible,
      );
      expect(different).toStrictEqual(false);
    });

    it('should resolve false if no key is different', () => {
      const collectibleMetadata: CollectibleMetadata = {
        image: 'image',
        backgroundColor: 'backgroundColor',
        imagePreview: 'imagePreview',
        imageThumbnail: 'imageThumbnail',
        imageOriginal: 'imageOriginal',
        animation: 'animation',
        animationOriginal: 'animationOriginal',
        externalLink: 'externalLink',
      };
      const collectible: Collectible = {
        address: 'address',
        tokenId: '123',
        name: 'name',
        image: 'image',
        backgroundColor: 'backgroundColor',
        imagePreview: 'imagePreview',
        imageThumbnail: 'imageThumbnail',
        imageOriginal: 'imageOriginal',
        animation: 'animation',
        animationOriginal: 'animationOriginal',
        externalLink: 'externalLink',
      };
      const different = assetsUtil.compareCollectiblesMetadata(
        collectibleMetadata,
        collectible,
      );
      expect(different).toStrictEqual(false);
    });
  });
});
