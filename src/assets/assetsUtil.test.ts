import { NetworksChainId } from '../network/NetworkController';
import * as assetsUtil from './assetsUtil';
import { Collectible, CollectibleMetadata } from './CollectiblesController';

describe('assetsUtil', () => {
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

    it('should format aggregator names', () => {
      const formattedAggregatorNames = assetsUtil.formatAggregatorNames([
        'bancor',
        'aave',
        'coinGecko',
      ]);
      const expectedValue = ['Bancor', 'Aave', 'CoinGecko'];
      expect(formattedAggregatorNames).toStrictEqual(expectedValue);
    });

    it('should format icon url with Codefi proxy correctly when passed chainId as a decimal string', () => {
      const linkTokenAddress = '0x514910771af9ca656af840dff83e8264ecf986ca';
      const formattedIconUrl = assetsUtil.formatIconUrlWithProxy({
        chainId: NetworksChainId.mainnet,
        tokenAddress: linkTokenAddress,
      });
      const expectedValue = `https://static.metaswap.codefi.network/api/v1/tokenIcons/${NetworksChainId.mainnet}/${linkTokenAddress}.png`;
      expect(formattedIconUrl).toStrictEqual(expectedValue);
    });

    it('should format icon url with Codefi proxy correctly when passed chainId as a hexadecimal string', () => {
      const linkTokenAddress = '0x514910771af9ca656af840dff83e8264ecf986ca';
      const formattedIconUrl = assetsUtil.formatIconUrlWithProxy({
        chainId: `0x${Number(NetworksChainId.mainnet).toString(16)}`,
        tokenAddress: linkTokenAddress,
      });
      const expectedValue = `https://static.metaswap.codefi.network/api/v1/tokenIcons/${NetworksChainId.mainnet}/${linkTokenAddress}.png`;
      expect(formattedIconUrl).toStrictEqual(expectedValue);
    });
  });
});
