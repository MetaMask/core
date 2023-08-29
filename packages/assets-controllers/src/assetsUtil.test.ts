import {
  GANACHE_CHAIN_ID,
  ChainId,
  convertHexToDecimal,
  toHex,
  toChecksumHexAddress,
} from '@metamask/controller-utils';
import { PreferencesController } from '@metamask/preferences-controller';
import { BN } from 'ethereumjs-util';

import {
  AccountTrackerController,
  CurrencyRateController,
  TokenBalancesController,
  TokenRatesController,
  TokensController,
} from '.';
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

  describe('getTotalFiatAccountBalance', () => {
    it('should return a balance for just native currency', () => {
      const ADDRESS = '0x0000000000000000000000000000000008675309';
      const NATIVE_BALANCE = '0x0';

      const CHAINLINK_ADDRESS = '0x514910771AF9Ca656af840dff83E8264EcF986CA';
      const CHAINLINK_SYMBOL = 'LINK';
      const CHAINLINK_DECIMALS = 18;
      const CHAINLINK_PRICE = 6.5;
      const CHAINLINK_BALANCE = 10;

      const CURRENCY = 'usd';
      const CURRENCY_CONVERSION_RATE = 1;

      const fiatBalance = assetsUtil.getTotalFiatAccountBalance(
        // CurrencyRateController
        new CurrencyRateController({
          currentCurrency: CURRENCY,
          conversionRate: CURRENCY_CONVERSION_RATE,
        }).state,
        // PreferencesController
        new PreferencesController({ selectedAddress: ADDRESS }).state,
        // AccountTrackerController,
        new AccountTrackerController({
          accounts: { [ADDRESS]: { balance: NATIVE_BALANCE } },
        }).state,
        // TokenBalancesController
        new TokenBalancesController({
          contractBalances: {
            [CHAINLINK_ADDRESS]: new BN(CHAINLINK_BALANCE),
          },
        }).state,
        // TokenRatesController
        new TokenRatesController({
          contractExchangeRates: {
            [toChecksumHexAddress(CHAINLINK_ADDRESS)]: CHAINLINK_PRICE,
          },
        }).state,
        // TokensController
        new TokensController({
          tokens: [
            {
              address: CHAINLINK_ADDRESS,
              symbol: CHAINLINK_SYMBOL,
              decimals: CHAINLINK_DECIMALS,
            },
          ],
        }).state,
      );

      expect(fiatBalance).toBe(CHAINLINK_PRICE * CHAINLINK_BALANCE);
    });
  });
});
