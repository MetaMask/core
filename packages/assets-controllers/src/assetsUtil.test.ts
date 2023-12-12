import {
  GANACHE_CHAIN_ID,
  ChainId,
  convertHexToDecimal,
  toHex,
} from '@metamask/controller-utils';

import * as assetsUtil from './assetsUtil';
import type { Nft, NftMetadata } from './NftController';

const DEFAULT_IPFS_URL_FORMAT = 'ipfs://';
const ALTERNATIVE_IPFS_URL_FORMAT = 'ipfs://ipfs/';
const IPFS_CID_V0 = 'QmdfTbBqBPQ7VNxZEYEj14VmRuZBkqFbiwReogJgS1zR1n';
const IPFS_CID_V1 =
  'bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku';

const IFPS_GATEWAY = 'dweb.link';

const SOME_API = 'https://someapi.com';

describe('assetsUtil', () => {
  describe('compareNftMetadata', () => {
    it('should resolve true if any key is different', () => {
      const nftMetadata: NftMetadata = {
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
      const nft: Nft = {
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
      const different = assetsUtil.compareNftMetadata(nftMetadata, nft);
      expect(different).toBe(true);
    });

    it('should resolve true if any key is different as always as metadata is not undefined', () => {
      const nftMetadata: NftMetadata = {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
        externalLink: 'externalLink',
      };
      const nft: Nft = {
        address: 'address',
        tokenId: '123',
        name: 'name',
        image: 'image',
        standard: 'standard',
        description: 'description',
        backgroundColor: 'backgroundColor',
        externalLink: 'externalLink',
      };
      const different = assetsUtil.compareNftMetadata(nftMetadata, nft);
      expect(different).toBe(false);
    });

    it('should resolve false if no key is different', () => {
      const nftMetadata: NftMetadata = {
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
      const nft: Nft = {
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
      const different = assetsUtil.compareNftMetadata(nftMetadata, nft);
      expect(different).toBe(false);
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

    it('should format icon url with Codefi proxy correctly', () => {
      const linkTokenAddress = '0x514910771af9ca656af840dff83e8264ecf986ca';
      const formattedIconUrl = assetsUtil.formatIconUrlWithProxy({
        chainId: ChainId.mainnet,
        tokenAddress: linkTokenAddress,
      });
      const expectedValue = `https://static.metafi.codefi.network/api/v1/tokenIcons/${convertHexToDecimal(
        ChainId.mainnet,
      )}/${linkTokenAddress}.png`;
      expect(formattedIconUrl).toStrictEqual(expectedValue);
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

    it('returns true for the Aurora network', () => {
      expect(
        assetsUtil.isTokenDetectionSupportedForNetwork(
          assetsUtil.SupportedTokenDetectionNetworks.aurora,
        ),
      ).toBe(true);
    });

    it('returns false for testnets such as Goerli', () => {
      expect(assetsUtil.isTokenDetectionSupportedForNetwork(toHex(5))).toBe(
        false,
      );
    });
  });

  describe('isTokenListSupportedForNetwork', () => {
    it('returns true for Mainnet', () => {
      expect(
        assetsUtil.isTokenListSupportedForNetwork(
          assetsUtil.SupportedTokenDetectionNetworks.mainnet,
        ),
      ).toBe(true);
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

    it('returns false for testnets such as Goerli', () => {
      expect(assetsUtil.isTokenListSupportedForNetwork(ChainId.goerli)).toBe(
        false,
      );
    });
  });

  describe('removeIpfsProtocolPrefix', () => {
    it('should return content identifier and path combined string from default ipfs url format', () => {
      expect(
        assetsUtil.removeIpfsProtocolPrefix(
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V0}/test`,
        ),
      ).toBe(`${IPFS_CID_V0}/test`);
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
      ).toBe(`https://${IPFS_CID_V1}.ipfs.${IFPS_GATEWAY}`);
    });

    it('should return a correctly formatted subdomained ipfs url when passed ipfsGateway with protocol prefix, a cidv0 and no path and subdomainSupported argument set to true', () => {
      expect(
        assetsUtil.getFormattedIpfsUrl(
          `https://${IFPS_GATEWAY}`,
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V0}`,
          true,
        ),
      ).toBe(`https://${IPFS_CID_V1}.ipfs.${IFPS_GATEWAY}`);
    });

    it('should return a correctly formatted subdomained ipfs url when passed ipfsGateway with protocol prefix, a path at the end of the url, and subdomainSupported argument set to true', () => {
      expect(
        assetsUtil.getFormattedIpfsUrl(
          `https://${IFPS_GATEWAY}`,
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V1}/test`,
          true,
        ),
      ).toBe(`https://${IPFS_CID_V1}.ipfs.${IFPS_GATEWAY}/test`);
    });

    it('should return a correctly formatted non-subdomained ipfs url when passed ipfsGateway with no "/ipfs/" appended, a path at the end of the url, and subdomainSupported argument set to false', () => {
      expect(
        assetsUtil.getFormattedIpfsUrl(
          `https://${IFPS_GATEWAY}`,
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V1}/test`,
          false,
        ),
      ).toBe(`https://${IFPS_GATEWAY}/ipfs/${IPFS_CID_V1}/test`);
    });

    it('should return a correctly formatted non-subdomained ipfs url when passed an ipfsGateway with "/ipfs/" appended, a path at the end of the url, subdomainSupported argument set to false', () => {
      expect(
        assetsUtil.getFormattedIpfsUrl(
          `https://${IFPS_GATEWAY}/ipfs/`,
          `${DEFAULT_IPFS_URL_FORMAT}${IPFS_CID_V1}/test`,
          false,
        ),
      ).toBe(`https://${IFPS_GATEWAY}/ipfs/${IPFS_CID_V1}/test`);
    });
  });

  describe('addUrlProtocolPrefix', () => {
    it('should return a URL with https:// prepended if input URL does not already have it', () => {
      expect(assetsUtil.addUrlProtocolPrefix(IFPS_GATEWAY)).toBe(
        `https://${IFPS_GATEWAY}`,
      );
    });

    it('should return a URL as is if https:// is already prepended', () => {
      expect(assetsUtil.addUrlProtocolPrefix(SOME_API)).toStrictEqual(SOME_API);
    });
  });

  describe('divideIntoBatches', () => {
    describe('given a non-empty list of values', () => {
      it('partitions the values into max-N-sized groups', () => {
        const batches = assetsUtil.divideIntoBatches([1, 2, 3, 4, 5, 6], {
          batchSize: 2,
        });
        expect(batches).toStrictEqual([
          [1, 2],
          [3, 4],
          [5, 6],
        ]);
      });

      it('does not fill every group completely if the number of values does not divide evenly', () => {
        const batches = assetsUtil.divideIntoBatches([1, 2, 3, 4, 5], {
          batchSize: 4,
        });
        expect(batches).toStrictEqual([[1, 2, 3, 4], [5]]);
      });
    });

    describe('given a empty list of values', () => {
      it('returns an empty array', () => {
        const batches = assetsUtil.divideIntoBatches([], {
          batchSize: 2,
        });
        expect(batches).toStrictEqual([]);
      });
    });
  });

  describe('reduceInBatchesSerially', () => {
    it('can build an array from running the given async function for each batch of the given values', async () => {
      const results = await assetsUtil.reduceInBatchesSerially<
        number,
        number[]
      >({
        values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        batchSize: 2,
        eachBatch: async (workingResult, batch) => {
          const newBatch = await Promise.resolve(
            batch.map((value) => value * 2),
          );
          return [...workingResult, ...newBatch];
        },
        initialResult: [],
      });

      expect(results).toStrictEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    });

    it('can build an object from running the given async function for each batch of the given values', async () => {
      const results = await assetsUtil.reduceInBatchesSerially<
        string,
        Record<string, number>
      >({
        values: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        batchSize: 2,
        eachBatch: async (workingResult, batch) => {
          const newBatch = await Promise.resolve(
            batch.reduce<Partial<Record<string, number>>>((obj, value) => {
              const codePoint = value.codePointAt(0);
              if (codePoint === undefined) {
                throw new Error(`Could not find code point for '${value[0]}'`);
              }
              return {
                ...obj,
                [value]: codePoint,
              };
            }, {}),
          );
          return { ...workingResult, ...newBatch };
        },
        initialResult: {},
      });

      expect(results).toStrictEqual({
        a: 97,
        b: 98,
        c: 99,
        d: 100,
        e: 101,
        f: 102,
        g: 103,
      });
    });

    it('processes each batch one after another, not in parallel, even if the given callback is async', async () => {
      const timestamps = await assetsUtil.reduceInBatchesSerially<
        number,
        number[]
      >({
        values: [1, 2, 3, 4, 5, 6],
        batchSize: 2,
        eachBatch: async (workingResult, _batch, index) => {
          const date = new Date().getTime();
          await new Promise<number[]>((resolve) => {
            let duration: number;
            switch (index) {
              case 0:
                duration = 2;
                break;
              case 1:
                duration = 10;
                break;
              case 2:
                duration = 4;
                break;
              default:
                throw new Error(`invalid index ${index}`);
            }
            setTimeout(resolve, duration);
          });
          return [...workingResult, date];
        },
        initialResult: [],
      });

      let previousTimestamp = 0;
      let timestampsIncreasing = true;
      for (const timestamp of timestamps) {
        if (timestamp <= previousTimestamp) {
          timestampsIncreasing = false;
          break;
        }
        previousTimestamp = timestamp;
      }

      expect(timestamps).toHaveLength(3);
      expect(timestampsIncreasing).toBe(true);
    });
  });
});
