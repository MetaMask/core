import * as assetsUtil from './assetsUtil'
import { Collectible, CollectibleMetadata } from './AssetsController';

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
            }
            const collectible: Collectible = {
                address: 'address',
                tokenId: 123,
                name: 'name',
                image: 'image',
                backgroundColor: 'backgroundColor',
                imagePreview: 'imagePreview',
                imageThumbnail: 'imageThumbnail',
                imageOriginal: 'imageOriginal',
                animation: 'animation',
                animationOriginal: 'animationOriginal',
                externalLink: 'externalLink',
            }
            const different = assetsUtil.compareCollectiblesMetadata(collectibleMetadata, collectible)
            expect(different).toStrictEqual(true);
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
            }
            const collectible: Collectible = {
                address: 'address',
                tokenId: 123,
                name: 'name',
                image: 'image',
                backgroundColor: 'backgroundColor',
                imagePreview: 'imagePreview',
                imageThumbnail: 'imageThumbnail',
                imageOriginal: 'imageOriginal',
                animation: 'animation',
                animationOriginal: 'animationOriginal',
                externalLink: 'externalLink',
            }
            const different = assetsUtil.compareCollectiblesMetadata(collectibleMetadata, collectible)
            expect(different).toStrictEqual(false);
        });
      });
  });