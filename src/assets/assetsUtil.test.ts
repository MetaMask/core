import * as assetsUtil from './assetsUtil';
import { Collectible, CollectibleMetadata } from './CollectiblesController';

describe('assetsUtil', () => {
  describe('compareCollectibles', () => {
    it('should resolve true if address and token ID matches', () => {
      const addressToCompare = 'address';
      const tokenIdToCompare = '123';
      const collectible: Collectible = {
        address: 'address',
        tokenId: '123',
        name: 'collectible',
        description: 'description',
        image: 'image',
        standard: 'std',
      };
      expect(
        assetsUtil.compareCollectibles(
          collectible,
          addressToCompare,
          tokenIdToCompare,
        ),
      ).toStrictEqual(true);
    });

    it('should resolve false if the address is not the same', () => {
      const addressToCompare = 'dif_address';
      const tokenIdToCompare = '123';
      const collectible: Collectible = {
        address: 'address',
        tokenId: '123',
        name: 'collectible',
        description: 'description',
        image: 'image',
        standard: 'std',
      };
      expect(
        assetsUtil.compareCollectibles(
          collectible,
          addressToCompare,
          tokenIdToCompare,
        ),
      ).toStrictEqual(false);
    });

    it('should resolve false if the token ID is not the same', () => {
      const addressToCompare = 'address';
      const tokenIdToCompare = '456';
      const collectible: Collectible = {
        address: 'address',
        tokenId: '123',
        name: 'collectible',
        description: 'description',
        image: 'image',
        standard: 'std',
      };
      expect(
        assetsUtil.compareCollectibles(
          collectible,
          addressToCompare,
          tokenIdToCompare,
        ),
      ).toStrictEqual(false);
    });
  });

  describe('compareCollectiblesMetadata', () => {
    it('should resolve true if any key is different', () => {
      const collectibleMetadata: CollectibleMetadata = {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
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
        description: 'description',
        standard: 'standard',
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
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
        externalLink: 'externalLink',
      };
      const collectible: Collectible = {
        address: 'address',
        tokenId: '123',
        name: 'name',
        image: 'image',
        standard: 'standard',
        description: 'description',
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
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
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
        standard: 'standard',
        description: 'description',
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
