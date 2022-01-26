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

    it('should return false if all keys present in new metadata match those of the collectible metadata in state, but some fields are missing', () => {
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
      expect(equal).toStrictEqual(false);
    });

    it('should return true if all fields of the metadata in state are present in the new metadata and no values are different', () => {
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

    it('should return false if all keys present in new contract data match those of the contract data in state, but some fields are missing', () => {
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
      expect(equal).toStrictEqual(false);
    });

    it('should return true if no values are different', () => {
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
