import {
  GANACHE_CHAIN_ID,
  ChainId,
  convertHexToDecimal,
  toHex,
  toChecksumHexAddress,
} from '@metamask/controller-utils';
import { add0x, type Hex } from '@metamask/utils';

import * as assetsUtil from './assetsUtil';
import { TOKEN_PRICES_BATCH_SIZE } from './assetsUtil';
import type { Nft, NftMetadata } from './NftController';
import type { AbstractTokenPricesService } from './token-prices-service';

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

    it('should resolve true if only tokenURI is different', () => {
      const nftMetadata: NftMetadata = {
        description: null,
        favorite: false,
        image: 'test',
        name: null,
        standard: 'ERC1155',
        tokenURI: 'foo',
      };
      const nft: Nft = {
        address: '0x1D03117e63c3A476a236a897147a1358579F2c45',
        description: null,
        favorite: false,
        image: 'test',
        name: null,
        standard: 'ERC1155',
        tokenId: '1',
        tokenURI: 'bar',
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
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      const expectedValue = `https://static.cx.metamask.io/api/v1/tokenIcons/${convertHexToDecimal(
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

    it('returns false for ganache local network', () => {
      expect(assetsUtil.isTokenListSupportedForNetwork(GANACHE_CHAIN_ID)).toBe(
        false,
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
    it('can build an object from running the given async function for each batch of the given values', async () => {
      const results = await assetsUtil.reduceInBatchesSerially<
        string,
        Record<string, number>
      >({
        values: ['a', 'b', 'c', 'd', 'e', 'f'],
        batchSize: 2,
        eachBatch: (workingResult, batch) => {
          const newBatch = batch.reduce<Partial<Record<string, number>>>(
            (obj, value) => {
              // We can assume that the first character is present.
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              const codePoint = value.codePointAt(0)!;
              return {
                ...obj,
                [value]: codePoint,
              };
            },
            {},
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
      });
    });

    it('processes each batch one after another, not in parallel, even if the given callback is async', async () => {
      const timestampsByIndex = await assetsUtil.reduceInBatchesSerially<
        string,
        Record<string, number>
      >({
        values: ['a', 'b', 'c', 'd', 'e', 'f'],
        batchSize: 2,
        eachBatch: async (workingResult, _batch, index) => {
          const timestamp = new Date().getTime();
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
          const newBatch = { [index]: timestamp };
          return { ...workingResult, ...newBatch };
        },
        initialResult: {},
      });

      let previousTimestamp = 0;
      let timestampsIncreasing = true;
      for (const timestamp of Object.values(timestampsByIndex)) {
        if (timestamp <= previousTimestamp) {
          timestampsIncreasing = false;
          break;
        }
        previousTimestamp = timestamp;
      }

      expect(Object.keys(timestampsByIndex)).toHaveLength(3);
      expect(timestampsIncreasing).toBe(true);
    });
  });

  describe('fetchAndMapExchangeRates', () => {
    it('should return empty object when chainId not supported', async () => {
      const testTokenAddress = '0x7BEF710a5759d197EC0Bf621c3Df802C2D60D848';
      const mockPriceService = createMockPriceService();

      jest
        .spyOn(mockPriceService, 'validateChainIdSupported')
        .mockReturnValue(false);

      const result = await assetsUtil.fetchTokenContractExchangeRates({
        tokenPricesService: mockPriceService,
        nativeCurrency: 'ETH',
        tokenAddresses: [testTokenAddress],
        chainId: '0x0',
      });

      expect(result).toStrictEqual({});
    });

    it('should return empty object when nativeCurrency not supported', async () => {
      const testTokenAddress = '0x7BEF710a5759d197EC0Bf621c3Df802C2D60D848';
      const mockPriceService = createMockPriceService();
      jest
        .spyOn(mockPriceService, 'validateCurrencySupported')
        .mockReturnValue(false);

      const result = await assetsUtil.fetchTokenContractExchangeRates({
        tokenPricesService: mockPriceService,
        nativeCurrency: 'X',
        tokenAddresses: [testTokenAddress],
        chainId: '0x1',
      });

      expect(result).toStrictEqual({});
    });

    it('should return successfully with a number of tokens less than the batch size', async () => {
      const testTokenAddress = '0x7BEF710a5759d197EC0Bf621c3Df802C2D60D848';
      const testNativeCurrency = 'ETH';
      const testChainId = '0x1';
      const mockPriceService = createMockPriceService();

      jest.spyOn(mockPriceService, 'fetchTokenPrices').mockResolvedValue({
        [testTokenAddress]: {
          tokenAddress: testTokenAddress,
          currency: testNativeCurrency,
          allTimeHigh: 4000,
          allTimeLow: 900,
          circulatingSupply: 2000,
          dilutedMarketCap: 100,
          high1d: 200,
          low1d: 100,
          marketCap: 1000,
          marketCapPercentChange1d: 100,
          price: 0.0004588648479937523,
          pricePercentChange14d: 100,
          pricePercentChange1h: 1,
          pricePercentChange1y: 200,
          pricePercentChange200d: 300,
          pricePercentChange30d: 200,
          pricePercentChange7d: 100,
          totalVolume: 100,
          priceChange1d: 100,
          pricePercentChange1d: 100,
        },
      });

      const result = await assetsUtil.fetchTokenContractExchangeRates({
        tokenPricesService: mockPriceService,
        nativeCurrency: testNativeCurrency,
        tokenAddresses: [testTokenAddress],
        chainId: testChainId,
      });

      expect(result).toMatchObject({
        [testTokenAddress]: 0.0004588648479937523,
      });
    });

    it('should fetch successfully in batches', async () => {
      const mockPriceService = createMockPriceService();
      const tokenAddresses = [...new Array(200).keys()]
        .map(buildAddress)
        .sort();

      const testNativeCurrency = 'ETH';
      const testChainId = '0x1';

      const fetchTokenPricesSpy = jest.spyOn(
        mockPriceService,
        'fetchTokenPrices',
      );

      await assetsUtil.fetchTokenContractExchangeRates({
        tokenPricesService: mockPriceService,
        nativeCurrency: testNativeCurrency,
        tokenAddresses: tokenAddresses as Hex[],
        chainId: testChainId,
      });

      const numBatches = Math.ceil(
        tokenAddresses.length / TOKEN_PRICES_BATCH_SIZE,
      );
      expect(fetchTokenPricesSpy).toHaveBeenCalledTimes(numBatches);

      for (let i = 1; i <= numBatches; i++) {
        expect(fetchTokenPricesSpy).toHaveBeenNthCalledWith(i, {
          chainId: testChainId,
          tokenAddresses: tokenAddresses.slice(
            (i - 1) * TOKEN_PRICES_BATCH_SIZE,
            i * TOKEN_PRICES_BATCH_SIZE,
          ),
          currency: testNativeCurrency,
        });
      }
    });

    it('should sort token addresses when batching', async () => {
      const mockPriceService = createMockPriceService();

      // Mock addresses in descending order
      const tokenAddresses = [...new Array(200).keys()]
        .map(buildAddress)
        .sort()
        .reverse();

      const testNativeCurrency = 'ETH';
      const testChainId = '0x1';

      const fetchTokenPricesSpy = jest.spyOn(
        mockPriceService,
        'fetchTokenPrices',
      );

      await assetsUtil.fetchTokenContractExchangeRates({
        tokenPricesService: mockPriceService,
        nativeCurrency: testNativeCurrency,
        tokenAddresses: tokenAddresses as Hex[],
        chainId: testChainId,
      });

      // Expect batches in ascending order
      tokenAddresses.sort();

      const numBatches = Math.ceil(
        tokenAddresses.length / TOKEN_PRICES_BATCH_SIZE,
      );
      expect(fetchTokenPricesSpy).toHaveBeenCalledTimes(numBatches);

      for (let i = 1; i <= numBatches; i++) {
        expect(fetchTokenPricesSpy).toHaveBeenNthCalledWith(i, {
          chainId: testChainId,
          tokenAddresses: tokenAddresses.slice(
            (i - 1) * TOKEN_PRICES_BATCH_SIZE,
            i * TOKEN_PRICES_BATCH_SIZE,
          ),
          currency: testNativeCurrency,
        });
      }
    });
  });
});

/**
 * Constructs a checksum Ethereum address.
 *
 * @param number - The address as a decimal number.
 * @returns The address as an 0x-prefixed ERC-55 mixed-case checksum address in
 * hexadecimal format.
 */
function buildAddress(number: number) {
  return toChecksumHexAddress(add0x(number.toString(16).padStart(40, '0')));
}

/**
 * Creates a mock for token prices service.
 *
 * @returns The mocked functions of token prices service.
 */
function createMockPriceService(): AbstractTokenPricesService {
  return {
    validateChainIdSupported(_chainId: unknown): _chainId is Hex {
      return true;
    },
    validateCurrencySupported(_currency: unknown): _currency is string {
      return true;
    },
    async fetchTokenPrices() {
      return {};
    },
  };
}
