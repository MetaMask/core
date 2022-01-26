import * as assetsUtil from './assetsUtil';
import {
  Collectible,
  CollectibleMetadata,
  CollectibleContract,
} from './CollectiblesController';

describe('assetsUtil', () => {
  describe('isCollectibleMetadataEqual', () => {
    it('should return false if any key is different', () => {
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
      const equal = assetsUtil.isCollectibleMetadataEqual(
        collectibleMetadata,
        collectible,
      );
      expect(equal).toStrictEqual(false);
    });

    it('should return true if all keys present in metadata match those the Collectible', () => {
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
      const equal = assetsUtil.isCollectibleMetadataEqual(
        collectibleMetadata,
        collectible,
      );
      expect(equal).toStrictEqual(true);
    });

    it('should return true if no key is different', () => {
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
      const equal = assetsUtil.isCollectibleMetadataEqual(
        collectibleMetadata,
        collectible,
      );
      expect(equal).toStrictEqual(true);
    });
  });

  describe('isCollectibleContractEqual', () => {
    it('should return false if any key is different', () => {
      const oldContract: CollectibleContract = {
        name: 'name',
        logo: 'logo',
        address: 'address',
        symbol: 'symbol',
        description: 'description',
        totalSupply: 'totalSupply',
        assetContractType: 'assetContractType',
        createdDate: 'createdDate',
        schemaName: 'schemaName',
        externalLink: 'externalLink',
      };

      const newContract: CollectibleContract = {
        name: '[new]name',
        logo: 'logo',
        address: 'address',
        symbol: 'symbol',
        description: 'description',
        totalSupply: 'totalSupply',
        assetContractType: 'assetContractType',
        createdDate: 'createdDate',
        schemaName: 'schemaName',
        externalLink: 'externalLink',
      };

      const equal = assetsUtil.isCollectibleContractEqual(
        newContract,
        oldContract,
      );
      expect(equal).toStrictEqual(false);
    });

    it('should return true if all keys present in old contract match those the new contract', () => {
      const oldContract: CollectibleContract = {
        name: 'name',
        logo: 'logo',
        address: 'address',
        symbol: 'symbol',
        description: 'description',
        totalSupply: 'totalSupply',
        assetContractType: 'assetContractType',
        createdDate: 'createdDate',
        schemaName: 'schemaName',
        externalLink: 'externalLink',
      };

      const newContract: CollectibleContract = {
        name: 'name',
        logo: 'logo',
        address: 'address',
        symbol: 'symbol',
        description: 'description',
        totalSupply: 'totalSupply',
        assetContractType: 'assetContractType',
      };

      const equal = assetsUtil.isCollectibleContractEqual(
        newContract,
        oldContract,
      );
      expect(equal).toStrictEqual(true);
    });

    it('should return true if no key is different', () => {
      const oldContract: CollectibleContract = {
        name: 'name',
        logo: 'logo',
        address: 'address',
        symbol: 'symbol',
        description: 'description',
        totalSupply: 'totalSupply',
        assetContractType: 'assetContractType',
        createdDate: 'createdDate',
        schemaName: 'schemaName',
        externalLink: 'externalLink',
      };

      const newContract: CollectibleContract = {
        name: 'name',
        logo: 'logo',
        address: 'address',
        symbol: 'symbol',
        description: 'description',
        totalSupply: 'totalSupply',
        assetContractType: 'assetContractType',
        createdDate: 'createdDate',
        schemaName: 'schemaName',
        externalLink: 'externalLink',
      };

      const equal = assetsUtil.isCollectibleContractEqual(
        oldContract,
        newContract,
      );
      expect(equal).toStrictEqual(true);
    });
  });
});
