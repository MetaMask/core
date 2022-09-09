import { NetworksChainId } from '@metamask/network-controller';
import { GANACHE_CHAIN_ID } from '@metamask/controller-utils';
import * as assetsUtil from './assetsUtil';
import { Collectible, CollectibleMetadata } from './CollectiblesController';

const DEFAULT_IPFS_URL_FORMAT = 'ipfs://';
const ALTERNATIVE_IPFS_URL_FORMAT = 'ipfs://ipfs/';
const IPFS_CID_V0 = 'QmdfTbBqBPQ7VNxZEYEj14VmRuZBkqFbiwReogJgS1zR1n';
const IPFS_CID_V1 =
  'bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku';

const IFPS_GATEWAY = 'dweb.link';

const SOME_API = 'https://someapi.com';

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

  describe('validateTokenToWatch', () => {
    it('should throw if undefined token atrributes', () => {
      expect(() =>
        assetsUtil.validateTokenToWatch({
          address: undefined,
          decimals: 0,
          symbol: 'TKN',
        } as any),
      ).toThrow('Must specify address, symbol, and decimals.');

      expect(() =>
        assetsUtil.validateTokenToWatch({
          address: '0x1',
          decimals: 0,
          symbol: undefined,
        } as any),
      ).toThrow('Must specify address, symbol, and decimals.');

      expect(() =>
        assetsUtil.validateTokenToWatch({
          address: '0x1',
          decimals: undefined,
          symbol: 'TKN',
        } as any),
      ).toThrow('Must specify address, symbol, and decimals.');
    });

    it('should throw if symbol is not a string', () => {
      expect(() =>
        assetsUtil.validateTokenToWatch({
          address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
          decimals: 0,
          symbol: { foo: 'bar' },
        } as any),
      ).toThrow('Invalid symbol: not a string.');
    });

    it('should throw if symbol is an empty string', () => {
      expect(() =>
        assetsUtil.validateTokenToWatch({
          address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
          decimals: 0,
          symbol: '',
        } as any),
      ).toThrow('Must specify address, symbol, and decimals.');
    });

    it('should not throw if symbol is exactly 1 character long', () => {
      expect(() =>
        assetsUtil.validateTokenToWatch({
          address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
          decimals: 0,
          symbol: 'T',
        } as any),
      ).not.toThrow();
    });

    it('should not throw if symbol is exactly 11 characters long', () => {
      expect(() =>
        assetsUtil.validateTokenToWatch({
          address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
          decimals: 0,
          symbol: 'TKNTKNTKNTK',
        } as any),
      ).not.toThrow();
    });

    it('should throw if symbol is more than 11 characters long', () => {
      expect(() =>
        assetsUtil.validateTokenToWatch({
          address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
          decimals: 0,
          symbol: 'TKNTKNTKNTKN',
        } as any),
      ).toThrow('Invalid symbol "TKNTKNTKNTKN": longer than 11 characters.');
    });

    it('should throw if invalid decimals', () => {
      expect(() =>
        assetsUtil.validateTokenToWatch({
          address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
          decimals: 0,
          symbol: 'TKN',
        } as any),
      ).not.toThrow();

      expect(() =>
        assetsUtil.validateTokenToWatch({
          address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
          decimals: 38,
          symbol: 'TKN',
        } as any),
      ).toThrow('Invalid decimals "38": must be 0 <= 36.');

      expect(() =>
        assetsUtil.validateTokenToWatch({
          address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
          decimals: -1,
          symbol: 'TKN',
        } as any),
      ).toThrow('Invalid decimals "-1": must be 0 <= 36.');
    });

    it('should throw if invalid address', () => {
      expect(() =>
        assetsUtil.validateTokenToWatch({
          address: '0xe9',
          decimals: 0,
          symbol: 'TKN',
        } as any),
      ).toThrow('Invalid address "0xe9".');
    });
  });

  describe('isTokenDetectionSupportedForNetwork', () => {
    it('returns true for Mainnet', () => {
      expect(
        assetsUtil.isTokenDetectionSupportedForNetwork(
          assetsUtil.SupportedTokenDetectionNetworks.mainnet,
        ),
      ).toBe(true);
    });

    it('returns true for custom network such as BSC', () => {
      expect(
        assetsUtil.isTokenDetectionSupportedForNetwork(
          assetsUtil.SupportedTokenDetectionNetworks.bsc,
        ),
      ).toBe(true);
    });

    it('returns false for testnets such as Ropsten', () => {
      expect(assetsUtil.isTokenDetectionSupportedForNetwork('3')).toBe(false);
    });
  });

  describe('isTokenListSupportedForNetwork', () => {
    it('returns true for Mainnet when chainId is passed as a decimal string', () => {
      expect(
        assetsUtil.isTokenListSupportedForNetwork(
          assetsUtil.SupportedTokenDetectionNetworks.mainnet,
        ),
      ).toBe(true);
    });

    it('returns true for Mainnet when chainId is passed as a hexadecimal string', () => {
      expect(assetsUtil.isTokenListSupportedForNetwork('0x1')).toBe(true);
    });

    it('returns true for ganache local network', () => {
      expect(assetsUtil.isTokenListSupportedForNetwork(GANACHE_CHAIN_ID)).toBe(
        true,
      );
    });

    it('returns true for custom network such as Polygon', () => {
      expect(
        assetsUtil.isTokenListSupportedForNetwork(
          assetsUtil.SupportedTokenDetectionNetworks.polygon,
        ),
      ).toBe(true);
    });

    it('returns false for testnets such as Ropsten', () => {
      expect(
        assetsUtil.isTokenListSupportedForNetwork(NetworksChainId.ropsten),
      ).toBe(false);
    });
  });

  describe('removeIpfsProtocolPrefix', () => {
    it('should return content identifier and path combined string from default ipfs url format', () => {
      expect(
        assetsUtil.removeIpfsProtocolPrefix(
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V0}/test`,
        ),
      ).toStrictEqual(`${IPFS_CID_V0}/test`);
    });

    it('should return content identifier string from default ipfs url format if no path preset', () => {
      expect(
        assetsUtil.removeIpfsProtocolPrefix(
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V0}`,
        ),
      ).toStrictEqual(IPFS_CID_V0);
    });

    it('should return content identifier string from alternate ipfs url format', () => {
      expect(
        assetsUtil.removeIpfsProtocolPrefix(
          `${ALTERNATIVE_IPFS_URL_FORMAT}${IPFS_CID_V0}`,
        ),
      ).toStrictEqual(IPFS_CID_V0);
    });

    it('should throw error if passed a non ipfs url', () => {
      expect(() => assetsUtil.removeIpfsProtocolPrefix(SOME_API)).toThrow(
        'this method should not be used with non ipfs urls',
      );
    });
  });

  describe('getIpfsCIDv1AndPath', () => {
    it('should return content identifier from default ipfs url format', () => {
      expect(
        assetsUtil.getIpfsCIDv1AndPath(
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V0}`,
        ),
      ).toStrictEqual({ cid: IPFS_CID_V1, path: undefined });
    });

    it('should return content identifier from alternative ipfs url format', () => {
      expect(
        assetsUtil.getIpfsCIDv1AndPath(
          `${ALTERNATIVE_IPFS_URL_FORMAT}${IPFS_CID_V0}`,
        ),
      ).toStrictEqual({ cid: IPFS_CID_V1, path: undefined });
    });

    it('should return unchanged content identifier if already v1', () => {
      expect(
        assetsUtil.getIpfsCIDv1AndPath(
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V1}`,
        ),
      ).toStrictEqual({ cid: IPFS_CID_V1, path: undefined });
    });

    it('should return a path when url contains one', () => {
      expect(
        assetsUtil.getIpfsCIDv1AndPath(
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V1}/test/test/test`,
        ),
      ).toStrictEqual({ cid: IPFS_CID_V1, path: '/test/test/test' });
    });
  });

  describe('getFormattedIpfsUrl', () => {
    it('should return a correctly formatted subdomained ipfs url when passed ipfsGateway without protocol prefix, no path and subdomainSupported argument set to true', () => {
      expect(
        assetsUtil.getFormattedIpfsUrl(
          IFPS_GATEWAY,
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V1}`,
          true,
        ),
      ).toStrictEqual(`https://${IPFS_CID_V1}.ipfs.${IFPS_GATEWAY}`);
    });

    it('should return a correctly formatted subdomained ipfs url when passed ipfsGateway with protocol prefix, a cidv0 and no path and subdomainSupported argument set to true', () => {
      expect(
        assetsUtil.getFormattedIpfsUrl(
          `https://${IFPS_GATEWAY}`,
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V0}`,
          true,
        ),
      ).toStrictEqual(`https://${IPFS_CID_V1}.ipfs.${IFPS_GATEWAY}`);
    });

    it('should return a correctly formatted subdomained ipfs url when passed ipfsGateway with protocol prefix, a path at the end of the url, and subdomainSupported argument set to true', () => {
      expect(
        assetsUtil.getFormattedIpfsUrl(
          `https://${IFPS_GATEWAY}`,
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V1}/test`,
          true,
        ),
      ).toStrictEqual(`https://${IPFS_CID_V1}.ipfs.${IFPS_GATEWAY}/test`);
    });

    it('should return a correctly formatted non-subdomained ipfs url when passed ipfsGateway with no "/ipfs/" appended, a path at the end of the url, and subdomainSupported argument set to false', () => {
      expect(
        assetsUtil.getFormattedIpfsUrl(
          `https://${IFPS_GATEWAY}`,
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V1}/test`,
          false,
        ),
      ).toStrictEqual(`https://${IFPS_GATEWAY}/ipfs/${IPFS_CID_V1}/test`);
    });

    it('should return a correctly formatted non-subdomained ipfs url when passed an ipfsGateway with "/ipfs/" appended, a path at the end of the url, subdomainSupported argument set to false', () => {
      expect(
        assetsUtil.getFormattedIpfsUrl(
          `https://${IFPS_GATEWAY}/ipfs/`,
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V1}/test`,
          false,
        ),
      ).toStrictEqual(`https://${IFPS_GATEWAY}/ipfs/${IPFS_CID_V1}/test`);
    });
  });
});
