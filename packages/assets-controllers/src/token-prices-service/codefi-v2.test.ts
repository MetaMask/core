import nock from 'nock';

import {
  codefiTokenPricesServiceV2,
  SUPPORTED_CHAIN_IDS,
  SUPPORTED_CURRENCIES,
} from './codefi-v2';

describe('codefiTokenPricesServiceV2', () => {
  describe('fetchTokenPrices', () => {
    it('uses the /spot-prices endpoint of the Codefi Price API to gather prices for the given tokens', async () => {
      nock('https://price-api.metafi.codefi.network')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses: '0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
        })
        .reply(200, {
          '0xaaa': {
            eth: 148.17205755299946,
          },
          '0xbbb': {
            eth: 33689.98134554716,
          },
          '0xccc': {
            eth: 148.1344197578456,
          },
        });

      const pricedTokensByAddress =
        await codefiTokenPricesServiceV2.fetchTokenPrices({
          chainId: '0x1',
          tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
          currency: 'ETH',
        });

      expect(pricedTokensByAddress).toStrictEqual({
        '0xAAA': {
          tokenAddress: '0xAAA',
          value: 148.17205755299946,
          currency: 'ETH',
        },
        '0xBBB': {
          tokenAddress: '0xBBB',
          value: 33689.98134554716,
          currency: 'ETH',
        },
        '0xCCC': {
          tokenAddress: '0xCCC',
          value: 148.1344197578456,
          currency: 'ETH',
        },
      });
    });

    it('throws if one of the token addresses cannot be found in the response data', async () => {
      nock('https://price-api.metafi.codefi.network')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses: '0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
        })
        .reply(200, {
          '0xbbb': {
            eth: 33689.98134554716,
          },
          '0xccc': {
            eth: 148.1344197578456,
          },
        });

      await expect(
        codefiTokenPricesServiceV2.fetchTokenPrices({
          chainId: '0x1',
          tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
          currency: 'ETH',
        }),
      ).rejects.toThrow('Could not find price for "0xAAA" in "ETH"');
    });

    it('throws if the currency cannot be found in the response data', async () => {
      nock('https://price-api.metafi.codefi.network')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses: '0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
        })
        .reply(200, {
          '0xaaa': {},
          '0xbbb': {
            eth: 33689.98134554716,
          },
          '0xccc': {
            eth: 148.1344197578456,
          },
        });

      await expect(
        codefiTokenPricesServiceV2.fetchTokenPrices({
          chainId: '0x1',
          tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
          currency: 'ETH',
        }),
      ).rejects.toThrow('Could not find price for "0xAAA" in "ETH"');
    });
  });

  describe('validateChainIdSupported', () => {
    it.each(SUPPORTED_CHAIN_IDS)(
      'returns true if the given chain ID is %s',
      (chainId) => {
        expect(
          codefiTokenPricesServiceV2.validateChainIdSupported(chainId),
        ).toBe(true);
      },
    );

    it('returns false if the given chain ID is not one of the supported chain IDs', () => {
      expect(
        codefiTokenPricesServiceV2.validateChainIdSupported(
          '0x999999999999999',
        ),
      ).toBe(false);
    });
  });

  describe('validateCurrencySupported', () => {
    it.each(SUPPORTED_CURRENCIES)(
      'returns true if the given currency is %s',
      (currency) => {
        expect(
          codefiTokenPricesServiceV2.validateCurrencySupported(currency),
        ).toBe(true);
      },
    );

    it.each(SUPPORTED_CURRENCIES.map((currency) => currency.toLowerCase()))(
      'returns true if the given currency is %s',
      (currency) => {
        expect(
          codefiTokenPricesServiceV2.validateCurrencySupported(currency),
        ).toBe(true);
      },
    );

    it('returns false if the given currency is not one of the supported currencies', () => {
      expect(codefiTokenPricesServiceV2.validateCurrencySupported('LOL')).toBe(
        false,
      );
    });
  });
});
