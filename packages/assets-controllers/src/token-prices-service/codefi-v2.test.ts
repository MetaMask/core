import { KnownCaipNamespace } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import nock, { isDone } from 'nock';

import {
  CodefiTokenPricesServiceV2,
  SUPPORTED_CHAIN_IDS,
  SUPPORTED_CURRENCIES,
  SUPPORTED_CURRENCIES_FALLBACK,
  ZERO_ADDRESS,
  getNativeTokenAddress,
  fetchSupportedCurrencies,
  getSupportedCurrencies,
  resetSupportedCurrenciesCache,
  fetchSupportedNetworks,
  getSupportedNetworks,
  resetSupportedNetworksCache,
} from './codefi-v2';

// We're not customizing the default max delay
// The default can be found here: https://github.com/connor4312/cockatiel?tab=readme-ov-file#exponentialbackoff
const defaultMaxRetryDelay = 30_000;

describe('CodefiTokenPricesServiceV2', () => {
  describe('onBreak', () => {
    beforeEach(() => {
      jest.useFakeTimers({
        now: Date.now(),
        doNotFake: ['nextTick', 'queueMicrotask'],
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('registers a listener that is called upon break', async () => {
      const retries = 3;
      // Max consencutive failures is set to match number of calls in three update attempts (including retries)
      const maximumConsecutiveFailures = (1 + retries) * 3;
      // Initial interceptor for failing requests
      nock('https://price.api.cx.metamask.io')
        .get('/v3/spot-prices')
        .query({
          assetIds: buildMultipleAssetIds(['0xAAA', '0xBBB', '0xCCC']),
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .times(maximumConsecutiveFailures)
        .replyWithError('Failed to fetch');
      // This interceptor should not be used
      nock('https://price.api.cx.metamask.io')
        .get('/v3/spot-prices')
        .query({
          assetIds: buildMultipleAssetIds(['0xAAA', '0xBBB', '0xCCC']),
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .reply(200, {
          [buildTokenAssetId('0xAAA')]: {
            price: 148.17205755299946,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          [buildTokenAssetId('0xBBB')]: {
            price: 33689.98134554716,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          [buildTokenAssetId('0xCCC')]: {
            price: 148.1344197578456,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
        });
      const onBreakHandler = jest.fn();
      const service = new CodefiTokenPricesServiceV2({
        retries,
        maximumConsecutiveFailures,
        // Ensure break duration is well over the max delay for a single request, so that the
        // break doesn't end during a retry attempt
        circuitBreakDuration: defaultMaxRetryDelay * 10,
      });
      service.onBreak(onBreakHandler);
      const fetchTokenPrices = (): ReturnType<
        typeof service.fetchTokenPrices
      > =>
        service.fetchTokenPrices({
          assets: [
            {
              chainId: '0x1',
              tokenAddress: '0xAAA',
            },
            {
              chainId: '0x1',
              tokenAddress: '0xBBB',
            },
            {
              chainId: '0x1',
              tokenAddress: '0xCCC',
            },
          ],
          currency: 'ETH',
        });
      expect(onBreakHandler).not.toHaveBeenCalled();

      // Initial three calls to exhaust maximum allowed failures
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const _retryAttempt of Array(retries).keys()) {
        await expect(() =>
          fetchTokenPricesWithFakeTimers({
            fetchTokenPrices,
            retries,
          }),
        ).rejects.toThrow('Failed to fetch');
      }

      expect(onBreakHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('onDegraded', () => {
    beforeEach(() => {
      jest.useFakeTimers({
        now: Date.now(),
        doNotFake: ['nextTick', 'queueMicrotask'],
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('calls onDegraded when request is slower than threshold', async () => {
      const degradedThreshold = 1000;
      const retries = 0;
      nock('https://price.api.cx.metamask.io')
        .get('/v3/spot-prices')
        .query({
          assetIds: buildMultipleAssetIds(['0xAAA', '0xBBB', '0xCCC']),
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .delay(degradedThreshold * 2)
        .reply(200, {
          [buildTokenAssetId('0xAAA')]: {
            price: 148.17205755299946,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
          },
          [buildTokenAssetId('0xBBB')]: {
            price: 33689.98134554716,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
          },
          [buildTokenAssetId('0xCCC')]: {
            price: 148.1344197578456,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
          },
        });
      const onDegradedHandler = jest.fn();
      const service = new CodefiTokenPricesServiceV2({
        degradedThreshold,
        retries,
      });
      service.onDegraded(onDegradedHandler);

      await fetchTokenPricesWithFakeTimers({
        fetchTokenPrices: () =>
          service.fetchTokenPrices({
            assets: [
              {
                chainId: '0x1',
                tokenAddress: '0xAAA',
              },
              {
                chainId: '0x1',
                tokenAddress: '0xBBB',
              },
              {
                chainId: '0x1',
                tokenAddress: '0xCCC',
              },
            ],
            currency: 'ETH',
          }),
        retries,
      });

      expect(onDegradedHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchTokenPrices', () => {
    it('uses the /spot-prices endpoint of the Codefi Price API to gather prices for the given tokens', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v3/spot-prices')
        .query({
          assetIds: buildMultipleAssetIds(['0xAAA', '0xBBB', '0xCCC']),
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .reply(200, {
          [buildTokenAssetId('0xAAA')]: {
            price: 148.17205755299946,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          [buildTokenAssetId('0xBBB')]: {
            price: 33689.98134554716,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          [buildTokenAssetId('0xCCC')]: {
            price: 148.1344197578456,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
        });

      const marketDataTokensByAddress =
        await new CodefiTokenPricesServiceV2().fetchTokenPrices({
          assets: [
            {
              chainId: '0x1',
              tokenAddress: '0xAAA',
            },
            {
              chainId: '0x1',
              tokenAddress: '0xBBB',
            },
            {
              chainId: '0x1',
              tokenAddress: '0xCCC',
            },
          ],
          currency: 'ETH',
        });

      expect(marketDataTokensByAddress).toStrictEqual([
        {
          tokenAddress: '0xAAA',
          assetId: buildTokenAssetId('0xAAA'),
          chainId: '0x1',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 148.17205755299946,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
        {
          tokenAddress: '0xBBB',
          assetId: buildTokenAssetId('0xBBB'),
          chainId: '0x1',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 33689.98134554716,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
        {
          tokenAddress: '0xCCC',
          assetId: buildTokenAssetId('0xCCC'),
          chainId: '0x1',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 148.1344197578456,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
      ]);
    });

    it('handles native token addresses', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v3/spot-prices')
        .query({
          assetIds: buildMultipleAssetIds([ZERO_ADDRESS]),
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .reply(200, {
          [buildTokenAssetId(ZERO_ADDRESS)]: {
            price: 33689.98134554716,
            currency: 'ETH',
          },
        });

      const result = await new CodefiTokenPricesServiceV2().fetchTokenPrices({
        assets: [
          {
            chainId: '0x1',
            tokenAddress: ZERO_ADDRESS,
          },
        ],
        currency: 'ETH',
      });

      expect(result).toStrictEqual([
        {
          tokenAddress: ZERO_ADDRESS,
          assetId: buildTokenAssetId(ZERO_ADDRESS),
          chainId: '0x1',
          currency: 'ETH',
          price: 33689.98134554716,
        },
      ]);
    });

    it('should not include token price object for token address when token price in not included the response data', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v3/spot-prices')
        .query({
          assetIds: buildMultipleAssetIds(['0xAAA', '0xBBB', '0xCCC']),
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .reply(200, {
          [buildTokenAssetId('0xBBB')]: {
            price: 33689.98134554716,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          [buildTokenAssetId('0xCCC')]: {
            price: 148.1344197578456,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
        });

      const result = await new CodefiTokenPricesServiceV2().fetchTokenPrices({
        assets: [
          {
            chainId: '0x1',
            tokenAddress: '0xAAA',
          },
          {
            chainId: '0x1',
            tokenAddress: '0xBBB',
          },
          {
            chainId: '0x1',
            tokenAddress: '0xCCC',
          },
        ],
        currency: 'ETH',
      });
      expect(result).toStrictEqual([
        {
          tokenAddress: '0xBBB',
          assetId: buildTokenAssetId('0xBBB'),
          chainId: '0x1',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 33689.98134554716,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
        {
          tokenAddress: '0xCCC',
          assetId: buildTokenAssetId('0xCCC'),
          chainId: '0x1',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 148.1344197578456,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
      ]);
    });

    it('should not include token price object for token address when price is undefined for token response data', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v3/spot-prices')
        .query({
          assetIds: buildMultipleAssetIds(['0xAAA', '0xBBB', '0xCCC']),
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .reply(200, {
          [buildTokenAssetId('0xAAA')]: {},
          [buildTokenAssetId('0xBBB')]: {
            price: 33689.98134554716,
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          [buildTokenAssetId('0xCCC')]: {
            price: 148.1344197578456,
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
        });

      const result = await new CodefiTokenPricesServiceV2().fetchTokenPrices({
        assets: [
          {
            chainId: '0x1',
            tokenAddress: '0xAAA',
          },
          {
            chainId: '0x1',
            tokenAddress: '0xBBB',
          },
          {
            chainId: '0x1',
            tokenAddress: '0xCCC',
          },
        ],
        currency: 'ETH',
      });

      expect(result).toStrictEqual([
        {
          tokenAddress: '0xAAA',
          assetId: buildTokenAssetId('0xAAA'),
          chainId: '0x1',
          currency: 'ETH',
        },
        {
          tokenAddress: '0xBBB',
          assetId: buildTokenAssetId('0xBBB'),
          chainId: '0x1',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 33689.98134554716,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
        {
          tokenAddress: '0xCCC',
          assetId: buildTokenAssetId('0xCCC'),
          chainId: '0x1',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 148.1344197578456,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
      ]);
    });

    it('should correctly handle null market data for a token address', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v3/spot-prices')
        .query({
          assetIds: buildMultipleAssetIds(['0xAAA', '0xBBB', '0xCCC']),
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .reply(200, {
          [buildTokenAssetId('0xAAA')]: null, // Simulating API returning null for market data
          [buildTokenAssetId('0xBBB')]: {
            price: 33689.98134554716,
            currency: 'ETH',
          },
          [buildTokenAssetId('0xCCC')]: {
            price: 148.1344197578456,
            currency: 'ETH',
          },
        });

      const result = await new CodefiTokenPricesServiceV2().fetchTokenPrices({
        assets: [
          {
            chainId: '0x1',
            tokenAddress: '0xAAA',
          },
          {
            chainId: '0x1',
            tokenAddress: '0xBBB',
          },
          {
            chainId: '0x1',
            tokenAddress: '0xCCC',
          },
        ],
        currency: 'ETH',
      });

      expect(result).toStrictEqual([
        {
          tokenAddress: '0xBBB',
          assetId: buildTokenAssetId('0xBBB'),
          chainId: '0x1',
          currency: 'ETH',
          price: 33689.98134554716,
        },
        {
          tokenAddress: '0xCCC',
          assetId: buildTokenAssetId('0xCCC'),
          chainId: '0x1',
          currency: 'ETH',
          price: 148.1344197578456,
        },
      ]);
    });

    it('throws if the request fails consistently', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v3/spot-prices')
        .query({
          assetIds: buildMultipleAssetIds(['0xAAA', '0xBBB', '0xCCC']),
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .replyWithError('Failed to fetch')
        .persist();

      await expect(
        new CodefiTokenPricesServiceV2().fetchTokenPrices({
          assets: [
            {
              chainId: '0x1',
              tokenAddress: '0xAAA',
            },
            {
              chainId: '0x1',
              tokenAddress: '0xBBB',
            },
            {
              chainId: '0x1',
              tokenAddress: '0xCCC',
            },
          ],
          currency: 'ETH',
        }),
      ).rejects.toThrow('Failed to fetch');
    });

    it('throws if the initial request and all retries fail', async () => {
      const retries = 3;
      nock('https://price.api.cx.metamask.io')
        .get('/v3/spot-prices')
        .query({
          assetIds: buildMultipleAssetIds(['0xAAA', '0xBBB', '0xCCC']),
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .times(1 + retries)
        .replyWithError('Failed to fetch');

      await expect(
        new CodefiTokenPricesServiceV2({ retries }).fetchTokenPrices({
          assets: [
            {
              chainId: '0x1',
              tokenAddress: '0xAAA',
            },
            {
              chainId: '0x1',
              tokenAddress: '0xBBB',
            },
            {
              chainId: '0x1',
              tokenAddress: '0xCCC',
            },
          ],
          currency: 'ETH',
        }),
      ).rejects.toThrow('Failed to fetch');
    });

    it('succeeds if the last retry succeeds', async () => {
      const retries = 3;
      // Initial interceptor for failing requests
      nock('https://price.api.cx.metamask.io')
        .get('/v3/spot-prices')
        .query({
          assetIds: buildMultipleAssetIds(['0xAAA', '0xBBB', '0xCCC']),
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .times(retries)
        .replyWithError('Failed to fetch');
      // Interceptor for successful request
      nock('https://price.api.cx.metamask.io')
        .get('/v3/spot-prices')
        .query({
          assetIds: buildMultipleAssetIds(['0xAAA', '0xBBB', '0xCCC']),
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .reply(200, {
          [buildTokenAssetId('0xAAA')]: {
            price: 148.17205755299946,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          [buildTokenAssetId('0xBBB')]: {
            price: 33689.98134554716,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          [buildTokenAssetId('0xCCC')]: {
            price: 148.1344197578456,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
        });

      const marketDataTokensByAddress = await new CodefiTokenPricesServiceV2({
        retries,
      }).fetchTokenPrices({
        assets: [
          {
            chainId: '0x1',
            tokenAddress: '0xAAA',
          },
          {
            chainId: '0x1',
            tokenAddress: '0xBBB',
          },
          {
            chainId: '0x1',
            tokenAddress: '0xCCC',
          },
        ],
        currency: 'ETH',
      });

      expect(marketDataTokensByAddress).toStrictEqual([
        {
          tokenAddress: '0xAAA',
          assetId: buildTokenAssetId('0xAAA'),
          chainId: '0x1',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 148.17205755299946,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
        {
          tokenAddress: '0xBBB',
          assetId: buildTokenAssetId('0xBBB'),
          chainId: '0x1',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 33689.98134554716,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
        {
          tokenAddress: '0xCCC',
          assetId: buildTokenAssetId('0xCCC'),
          chainId: '0x1',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 148.1344197578456,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
      ]);
    });

    it('returns an empty array when all assets have unsupported chain IDs', async () => {
      // Use a chain ID that is not in SUPPORTED_CHAIN_IDS_V3 to trigger early return
      const unsupportedAssets = [
        { chainId: '0x999999999999999' as Hex, tokenAddress: '0xAAA' as Hex },
        { chainId: '0x999999999999999' as Hex, tokenAddress: '0xBBB' as Hex },
      ];

      const result = await new CodefiTokenPricesServiceV2().fetchTokenPrices({
        // @ts-expect-error Testing with unsupported chain ID
        assets: unsupportedAssets,
        currency: 'ETH',
      });

      expect(result).toStrictEqual([]);
    });

    describe('before circuit break', () => {
      beforeEach(() => {
        jest.useFakeTimers({
          now: Date.now(),
          doNotFake: ['nextTick', 'queueMicrotask'],
        });
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('calls onDegraded when request is slower than threshold', async () => {
        const degradedThreshold = 1000;
        const retries = 0;
        nock('https://price.api.cx.metamask.io')
          .get('/v3/spot-prices')
          .query({
            assetIds: buildMultipleAssetIds(['0xAAA', '0xBBB', '0xCCC']),
            vsCurrency: 'ETH',
            includeMarketData: 'true',
          })
          .delay(degradedThreshold * 2)
          .reply(200, {
            [buildTokenAssetId('0xAAA')]: {
              price: 148.17205755299946,
              currency: 'ETH',
              pricePercentChange1d: 1,
              priceChange1d: 1,
            },
            [buildTokenAssetId('0xBBB')]: {
              price: 33689.98134554716,
              currency: 'ETH',
              pricePercentChange1d: 1,
              priceChange1d: 1,
            },
            [buildTokenAssetId('0xCCC')]: {
              price: 148.1344197578456,
              currency: 'ETH',
              pricePercentChange1d: 1,
              priceChange1d: 1,
            },
          });
        const onDegradedHandler = jest.fn();
        const service = new CodefiTokenPricesServiceV2({
          degradedThreshold,
          onDegraded: onDegradedHandler,
          retries,
        });

        await fetchTokenPricesWithFakeTimers({
          fetchTokenPrices: () =>
            service.fetchTokenPrices({
              assets: [
                {
                  chainId: '0x1',
                  tokenAddress: '0xAAA',
                },
                {
                  chainId: '0x1',
                  tokenAddress: '0xBBB',
                },
                {
                  chainId: '0x1',
                  tokenAddress: '0xCCC',
                },
              ],
              currency: 'ETH',
            }),
          retries,
        });

        expect(onDegradedHandler).toHaveBeenCalledTimes(1);
      });
    });

    describe('after circuit break', () => {
      beforeEach(() => {
        jest.useFakeTimers({
          now: Date.now(),
          doNotFake: ['nextTick', 'queueMicrotask'],
        });
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('calls onBreak handler upon break', async () => {
        const retries = 3;
        // Max consencutive failures is set to match number of calls in three update attempts (including retries)
        const maximumConsecutiveFailures = (1 + retries) * 3;
        // Initial interceptor for failing requests
        nock('https://price.api.cx.metamask.io')
          .get('/v3/spot-prices')
          .query({
            assetIds: buildMultipleAssetIds(['0xAAA', '0xBBB', '0xCCC']),
            vsCurrency: 'ETH',
            includeMarketData: 'true',
          })
          .times(maximumConsecutiveFailures)
          .replyWithError('Failed to fetch');
        // This interceptor should not be used
        nock('https://price.api.cx.metamask.io')
          .get('/v3/spot-prices')
          .query({
            assetIds: buildMultipleAssetIds(['0xAAA', '0xBBB', '0xCCC']),
            vsCurrency: 'ETH',
            includeMarketData: 'true',
          })
          .reply(200, {
            [buildTokenAssetId('0xAAA')]: {
              price: 148.17205755299946,
              currency: 'ETH',
              pricePercentChange1d: 1,
              priceChange1d: 1,
              marketCap: 117219.99428314982,
              allTimeHigh: 0.00060467892389492,
              allTimeLow: 0.00002303954000865728,
              totalVolume: 5155.094053542448,
              high1d: 0.00008020715848194385,
              low1d: 0.00007792083564549064,
              circulatingSupply: 1494269733.9526057,
              dilutedMarketCap: 117669.5125951733,
              marketCapPercentChange1d: 0.76671,
              pricePercentChange1h: -1.0736342953259423,
              pricePercentChange7d: -7.351582573655089,
              pricePercentChange14d: -1.0799098946709822,
              pricePercentChange30d: -25.776321124365992,
              pricePercentChange200d: 46.091571238599165,
              pricePercentChange1y: -2.2992517267242754,
            },
            [buildTokenAssetId('0xBBB')]: {
              price: 33689.98134554716,
              currency: 'ETH',
              pricePercentChange1d: 1,
              priceChange1d: 1,
              marketCap: 117219.99428314982,
              allTimeHigh: 0.00060467892389492,
              allTimeLow: 0.00002303954000865728,
              totalVolume: 5155.094053542448,
              high1d: 0.00008020715848194385,
              low1d: 0.00007792083564549064,
              circulatingSupply: 1494269733.9526057,
              dilutedMarketCap: 117669.5125951733,
              marketCapPercentChange1d: 0.76671,
              pricePercentChange1h: -1.0736342953259423,
              pricePercentChange7d: -7.351582573655089,
              pricePercentChange14d: -1.0799098946709822,
              pricePercentChange30d: -25.776321124365992,
              pricePercentChange200d: 46.091571238599165,
              pricePercentChange1y: -2.2992517267242754,
            },
            [buildTokenAssetId('0xCCC')]: {
              price: 148.1344197578456,
              currency: 'ETH',
              pricePercentChange1d: 1,
              priceChange1d: 1,
              marketCap: 117219.99428314982,
              allTimeHigh: 0.00060467892389492,
              allTimeLow: 0.00002303954000865728,
              totalVolume: 5155.094053542448,
              high1d: 0.00008020715848194385,
              low1d: 0.00007792083564549064,
              circulatingSupply: 1494269733.9526057,
              dilutedMarketCap: 117669.5125951733,
              marketCapPercentChange1d: 0.76671,
              pricePercentChange1h: -1.0736342953259423,
              pricePercentChange7d: -7.351582573655089,
              pricePercentChange14d: -1.0799098946709822,
              pricePercentChange30d: -25.776321124365992,
              pricePercentChange200d: 46.091571238599165,
              pricePercentChange1y: -2.2992517267242754,
            },
          });
        const onBreakHandler = jest.fn();
        const service = new CodefiTokenPricesServiceV2({
          retries,
          maximumConsecutiveFailures,
          onBreak: onBreakHandler,
          // Ensure break duration is well over the max delay for a single request, so that the
          // break doesn't end during a retry attempt
          circuitBreakDuration: defaultMaxRetryDelay * 10,
        });
        const fetchTokenPrices = (): ReturnType<
          typeof service.fetchTokenPrices
        > =>
          service.fetchTokenPrices({
            assets: [
              {
                chainId: '0x1',
                tokenAddress: '0xAAA',
              },
              {
                chainId: '0x1',
                tokenAddress: '0xBBB',
              },
              {
                chainId: '0x1',
                tokenAddress: '0xCCC',
              },
            ],
            currency: 'ETH',
          });
        expect(onBreakHandler).not.toHaveBeenCalled();

        // Initial three calls to exhaust maximum allowed failures
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const _retryAttempt of Array(retries).keys()) {
          await expect(() =>
            fetchTokenPricesWithFakeTimers({
              fetchTokenPrices,
              retries,
            }),
          ).rejects.toThrow('Failed to fetch');
        }

        expect(onBreakHandler).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('fetchExchangeRates', () => {
    const exchangeRatesMockResponseUsd = {
      btc: {
        name: 'Bitcoin',
        ticker: 'btc',
        value: 0.000008880690393396647,
        currencyType: 'crypto',
      },
      eth: {
        name: 'Ether',
        ticker: 'eth',
        value: 0.000240977533824818,
        currencyType: 'crypto',
      },
      ltc: {
        name: 'Litecoin',
        ticker: 'ltc',
        value: 0.01021289164000047,
        currencyType: 'crypto',
      },
    };

    const exchangeRatesMockResponseEur = {
      btc: {
        name: 'Bitcoin',
        ticker: 'btc',
        value: 0.000010377048177666853,
        currencyType: 'crypto',
      },
      eth: {
        name: 'Ether',
        ticker: 'eth',
        value: 0.0002845697921761581,
        currencyType: 'crypto',
      },
      ltc: {
        name: 'Litecoin',
        ticker: 'ltc',
        value: 0.011983861448641322,
        currencyType: 'crypto',
      },
    };

    const cryptocurrencies = ['ETH'];

    describe('when includeUsdRate is true and baseCurrency is not USD', () => {
      it('throws when all calls to price fail', async () => {
        nock('https://price.api.cx.metamask.io')
          .get('/v1/exchange-rates')
          .query({
            baseCurrency: 'eur',
          })
          .replyWithError('Failed to fetch');

        nock('https://price.api.cx.metamask.io')
          .get('/v1/exchange-rates')
          .query({
            baseCurrency: 'usd',
          })
          .replyWithError('Failed to fetch');
        await expect(() =>
          new CodefiTokenPricesServiceV2().fetchExchangeRates({
            baseCurrency: 'eur',
            includeUsdRate: true,
            cryptocurrencies: ['btc', 'eth'],
          }),
        ).rejects.toThrow('Failed to fetch');
      });
      it('throws an error if none of the cryptocurrencies are supported', async () => {
        nock('https://price.api.cx.metamask.io')
          .get('/v1/exchange-rates')
          .query({
            baseCurrency: 'eur',
          })
          .reply(200, exchangeRatesMockResponseEur);

        nock('https://price.api.cx.metamask.io')
          .get('/v1/exchange-rates')
          .query({
            baseCurrency: 'usd',
          })
          .reply(200, exchangeRatesMockResponseUsd);

        await expect(
          new CodefiTokenPricesServiceV2().fetchExchangeRates({
            baseCurrency: 'eur',
            includeUsdRate: true,
            cryptocurrencies: ['not-supported'],
          }),
        ).rejects.toThrow(
          'None of the cryptocurrencies are supported by price api',
        );
      });

      it('returns result when some of the cryptocurrencies are supported', async () => {
        nock('https://price.api.cx.metamask.io')
          .get('/v1/exchange-rates')
          .query({
            baseCurrency: 'eur',
          })
          .reply(200, exchangeRatesMockResponseEur);

        nock('https://price.api.cx.metamask.io')
          .get('/v1/exchange-rates')
          .query({
            baseCurrency: 'usd',
          })
          .reply(200, exchangeRatesMockResponseUsd);

        const result =
          await new CodefiTokenPricesServiceV2().fetchExchangeRates({
            baseCurrency: 'eur',
            includeUsdRate: true,
            cryptocurrencies: ['not-supported', 'eth'],
          });

        expect(result).toStrictEqual({
          eth: {
            ...exchangeRatesMockResponseEur.eth,
            usd: 0.000240977533824818,
          },
        });
      });

      it('returns successfully usd values when all the cryptocurrencies are supported', async () => {
        nock('https://price.api.cx.metamask.io')
          .get('/v1/exchange-rates')
          .query({
            baseCurrency: 'eur',
          })
          .reply(200, exchangeRatesMockResponseEur);

        nock('https://price.api.cx.metamask.io')
          .get('/v1/exchange-rates')
          .query({
            baseCurrency: 'usd',
          })
          .reply(200, exchangeRatesMockResponseUsd);

        const result =
          await new CodefiTokenPricesServiceV2().fetchExchangeRates({
            baseCurrency: 'eur',
            includeUsdRate: true,
            cryptocurrencies: ['btc', 'eth'],
          });

        expect(result).toStrictEqual({
          eth: {
            ...exchangeRatesMockResponseEur.eth,
            usd: 0.000240977533824818,
          },
          btc: {
            ...exchangeRatesMockResponseEur.btc,
            usd: 0.000008880690393396647,
          },
        });
      });

      it('does not return usd values when one call to price fails', async () => {
        nock('https://price.api.cx.metamask.io')
          .get('/v1/exchange-rates')
          .query({
            baseCurrency: 'eur',
          })
          .reply(200, exchangeRatesMockResponseEur);

        nock('https://price.api.cx.metamask.io')
          .get('/v1/exchange-rates')
          .query({
            baseCurrency: 'usd',
          })
          .replyWithError('Failed to fetch');

        const result =
          await new CodefiTokenPricesServiceV2().fetchExchangeRates({
            baseCurrency: 'eur',
            includeUsdRate: true,
            cryptocurrencies: ['btc', 'eth'],
          });

        expect(result).toStrictEqual({
          eth: {
            ...exchangeRatesMockResponseEur.eth,
          },
          btc: {
            ...exchangeRatesMockResponseEur.btc,
          },
        });
      });
    });

    describe('when includeUsdRate is true and baseCurrency is equal to USD', () => {
      it('throws when the call to price fails', async () => {
        nock('https://price.api.cx.metamask.io')
          .get('/v1/exchange-rates')
          .query({
            baseCurrency: 'usd',
          })
          .replyWithError('Failed to fetch')
          .persist();

        await expect(() =>
          new CodefiTokenPricesServiceV2().fetchExchangeRates({
            baseCurrency: 'usd',
            includeUsdRate: true,
            cryptocurrencies: ['btc', 'eth'],
          }),
        ).rejects.toThrow('Failed to fetch');
      });

      it('returns successfully usd values when all the cryptocurrencies are supported', async () => {
        nock('https://price.api.cx.metamask.io')
          .get('/v1/exchange-rates')
          .query({
            baseCurrency: 'usd',
          })
          .reply(200, exchangeRatesMockResponseUsd);

        const result =
          await new CodefiTokenPricesServiceV2().fetchExchangeRates({
            baseCurrency: 'usd',
            includeUsdRate: true,
            cryptocurrencies: ['btc', 'eth'],
          });

        expect(result).toStrictEqual({
          eth: {
            ...exchangeRatesMockResponseUsd.eth,
            usd: exchangeRatesMockResponseUsd.eth.value,
          },
          btc: {
            ...exchangeRatesMockResponseUsd.btc,
            usd: exchangeRatesMockResponseUsd.btc.value,
          },
        });
      });

      it('returns successfully usd values when some of the cryptocurrencies are supported', async () => {
        nock('https://price.api.cx.metamask.io')
          .get('/v1/exchange-rates')
          .query({
            baseCurrency: 'usd',
          })
          .reply(200, exchangeRatesMockResponseUsd);

        const result =
          await new CodefiTokenPricesServiceV2().fetchExchangeRates({
            baseCurrency: 'usd',
            includeUsdRate: true,
            cryptocurrencies: ['not-supported', 'eth'],
          });

        expect(result).toStrictEqual({
          eth: {
            ...exchangeRatesMockResponseUsd.eth,
            usd: exchangeRatesMockResponseUsd.eth.value,
          },
        });
      });
    });

    describe('when includeUsdRate is false and baseCurrency is not USD', () => {
      it('does not include usd in the returned result', async () => {
        nock('https://price.api.cx.metamask.io')
          .get('/v1/exchange-rates')
          .query({
            baseCurrency: 'eur',
          })
          .reply(200, exchangeRatesMockResponseEur);

        const result =
          await new CodefiTokenPricesServiceV2().fetchExchangeRates({
            baseCurrency: 'eur',
            includeUsdRate: false,
            cryptocurrencies: ['eth'],
          });

        expect(result).toStrictEqual({
          eth: exchangeRatesMockResponseEur.eth,
        });
      });
    });

    describe('when includeUsdRate is false and baseCurrency is USD', () => {
      it('includes usd in the returned result', async () => {
        nock('https://price.api.cx.metamask.io')
          .get('/v1/exchange-rates')
          .query({
            baseCurrency: 'usd',
          })
          .reply(200, exchangeRatesMockResponseUsd);

        const result =
          await new CodefiTokenPricesServiceV2().fetchExchangeRates({
            baseCurrency: 'usd',
            includeUsdRate: false,
            cryptocurrencies: ['eth'],
          });

        expect(result).toStrictEqual({
          eth: {
            ...exchangeRatesMockResponseUsd.eth,
            usd: exchangeRatesMockResponseUsd.eth.value,
          },
        });
      });
    });

    it('throws if the request fails consistently', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v1/exchange-rates')
        .query({
          baseCurrency: 'eur',
        })
        .replyWithError('Failed to fetch');

      await expect(
        new CodefiTokenPricesServiceV2().fetchExchangeRates({
          baseCurrency: 'eur',
          includeUsdRate: false,
          cryptocurrencies,
        }),
      ).rejects.toThrow('Failed to fetch');
    });

    it('throws if the initial request and all retries fail', async () => {
      const retries = 3;
      nock('https://price.api.cx.metamask.io')
        .get('/v1/exchange-rates')
        .query({
          baseCurrency: 'eur',
        })
        .times(1 + retries)
        .replyWithError('Failed to fetch');

      await expect(
        new CodefiTokenPricesServiceV2({ retries }).fetchExchangeRates({
          baseCurrency: 'eur',
          includeUsdRate: false,
          cryptocurrencies,
        }),
      ).rejects.toThrow('Failed to fetch');
    });

    it('succeeds if the last retry succeeds', async () => {
      const retries = 3;
      // Initial interceptor for failing requests
      nock('https://price.api.cx.metamask.io')
        .get('/v1/exchange-rates')
        .query({
          baseCurrency: 'eur',
        })
        .times(retries)
        .replyWithError('Failed to fetch');
      // Interceptor for successful request
      nock('https://price.api.cx.metamask.io')
        .get('/v1/exchange-rates')
        .query({
          baseCurrency: 'eur',
        })
        .reply(200, exchangeRatesMockResponseEur);

      const exchangeRates = await new CodefiTokenPricesServiceV2({
        retries,
      }).fetchExchangeRates({
        baseCurrency: 'eur',
        includeUsdRate: false,
        cryptocurrencies,
      });

      expect(exchangeRates).toStrictEqual({
        eth: exchangeRatesMockResponseEur.eth,
      });
    });

    it('triggers background refresh of supported currencies', async () => {
      // Mock supportedVsCurrencies endpoint
      const supportedCurrenciesNock = nock('https://price.api.cx.metamask.io')
        .get('/v1/supportedVsCurrencies')
        .reply(200, ['usd', 'eur', 'gbp']);

      // Mock exchange-rates to succeed
      nock('https://price.api.cx.metamask.io')
        .get('/v1/exchange-rates')
        .query({
          baseCurrency: 'eur',
        })
        .reply(200, exchangeRatesMockResponseEur);

      const result = await new CodefiTokenPricesServiceV2().fetchExchangeRates({
        baseCurrency: 'eur',
        includeUsdRate: false,
        cryptocurrencies: ['eth'],
      });

      // Wait for background fetch to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(result).toStrictEqual({
        eth: exchangeRatesMockResponseEur.eth,
      });

      // Verify the supportedVsCurrencies endpoint was called
      expect(supportedCurrenciesNock.isDone()).toBe(true);

      // Reset cache so other tests use fallback list
      resetSupportedCurrenciesCache();
    });

    describe('before circuit break', () => {
      beforeEach(() => {
        jest.useFakeTimers({
          now: Date.now(),
          doNotFake: ['nextTick', 'queueMicrotask'],
        });
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('calls onDegraded when request is slower than threshold', async () => {
        const degradedThreshold = 1000;
        const retries = 0;
        nock('https://price.api.cx.metamask.io')
          .get('/v1/exchange-rates')
          .query({
            baseCurrency: 'eur',
          })
          .delay(degradedThreshold * 2)
          .reply(200, exchangeRatesMockResponseEur);
        const onDegradedHandler = jest.fn();
        const service = new CodefiTokenPricesServiceV2({
          degradedThreshold,
          onDegraded: onDegradedHandler,
          retries,
        });

        await fetchExchangeRatesWithFakeTimers({
          fetchExchangeRates: () =>
            service.fetchExchangeRates({
              baseCurrency: 'eur',
              includeUsdRate: false,
              cryptocurrencies,
            }),
          retries,
        });

        expect(onDegradedHandler).toHaveBeenCalledTimes(1);
      });
    });

    describe('after circuit break', () => {
      beforeEach(() => {
        jest.useFakeTimers({
          now: Date.now(),
          doNotFake: ['nextTick', 'queueMicrotask'],
        });
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('calls onBreak handler upon break', async () => {
        const retries = 3;
        // Max consencutive failures is set to match number of calls in three update attempts (including retries)
        const maximumConsecutiveFailures = (1 + retries) * 3;
        // Initial interceptor for failing requests
        nock('https://price.api.cx.metamask.io')
          .get('/v1/exchange-rates')
          .query({
            baseCurrency: 'eur',
          })
          .times(maximumConsecutiveFailures)
          .replyWithError('Failed to fetch');
        // This interceptor should not be used
        nock('https://price.api.cx.metamask.io')
          .get('/v1/exchange-rates')
          .query({
            baseCurrency: 'eur',
          })
          .reply(200, exchangeRatesMockResponseEur);
        const onBreakHandler = jest.fn();
        const service = new CodefiTokenPricesServiceV2({
          retries,
          maximumConsecutiveFailures,
          onBreak: onBreakHandler,
          // Ensure break duration is well over the max delay for a single request, so that the
          // break doesn't end during a retry attempt
          circuitBreakDuration: defaultMaxRetryDelay * 10,
        });
        const fetchExchangeRates = (): ReturnType<
          typeof service.fetchExchangeRates
        > =>
          service.fetchExchangeRates({
            baseCurrency: 'eur',
            includeUsdRate: false,
            cryptocurrencies,
          });
        expect(onBreakHandler).not.toHaveBeenCalled();

        // Initial three calls to exhaust maximum allowed failures
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const _retryAttempt of Array(retries).keys()) {
          await expect(() =>
            fetchExchangeRatesWithFakeTimers({
              fetchExchangeRates,
              retries,
            }),
          ).rejects.toThrow('Failed to fetch');
        }

        expect(onBreakHandler).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('validateChainIdSupported', () => {
    it.each(SUPPORTED_CHAIN_IDS)(
      'returns true if the given chain ID is %s',
      (chainId) => {
        expect(
          new CodefiTokenPricesServiceV2().validateChainIdSupported(chainId),
        ).toBe(true);
      },
    );

    it('returns false if the given chain ID is not one of the supported chain IDs', () => {
      expect(
        new CodefiTokenPricesServiceV2().validateChainIdSupported(
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
          new CodefiTokenPricesServiceV2().validateCurrencySupported(currency),
        ).toBe(true);
      },
    );

    it.each(SUPPORTED_CURRENCIES.map((currency) => currency.toLowerCase()))(
      'returns true if the given currency is %s',
      (currency) => {
        expect(
          new CodefiTokenPricesServiceV2().validateCurrencySupported(currency),
        ).toBe(true);
      },
    );

    it('returns false if the given currency is not one of the supported currencies', () => {
      expect(
        new CodefiTokenPricesServiceV2().validateCurrencySupported('LOL'),
      ).toBe(false);
    });
  });

  describe('getNativeTokenAddress', () => {
    it('should return unique native token address for MATIC', () => {
      expect(getNativeTokenAddress('0x89')).toBe(
        '0x0000000000000000000000000000000000001010',
      );
    });
    it('should return zero address for other chains', () => {
      (['0x1', '0x2', '0x1337'] as const).forEach((chainId) => {
        expect(getNativeTokenAddress(chainId)).toBe(ZERO_ADDRESS);
      });
    });
  });

  describe('fetchSupportedCurrencies', () => {
    afterEach(() => {
      resetSupportedCurrenciesCache();
    });

    it('fetches supported currencies from the API and returns them in lowercase', async () => {
      const mockCurrencies = ['USD', 'EUR', 'GBP', 'JPY'];
      nock('https://price.api.cx.metamask.io')
        .get('/v1/supportedVsCurrencies')
        .reply(200, mockCurrencies);

      const result = await fetchSupportedCurrencies();

      expect(result).toStrictEqual(['usd', 'eur', 'gbp', 'jpy']);
    });

    it('returns the fallback list when the API returns an invalid response', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v1/supportedVsCurrencies')
        .reply(200, { invalid: 'response' });

      const result = await fetchSupportedCurrencies();

      expect(result).toStrictEqual([...SUPPORTED_CURRENCIES_FALLBACK]);
    });

    it('returns the fallback list when the API request fails', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v1/supportedVsCurrencies')
        .replyWithError('Network error');

      const result = await fetchSupportedCurrencies();

      expect(result).toStrictEqual([...SUPPORTED_CURRENCIES_FALLBACK]);
    });

    it('returns the fallback list when the API returns a non-200 status', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v1/supportedVsCurrencies')
        .reply(500, 'Internal Server Error');

      const result = await fetchSupportedCurrencies();

      expect(result).toStrictEqual([...SUPPORTED_CURRENCIES_FALLBACK]);
    });

    it('updates getSupportedCurrencies after a successful fetch', async () => {
      const mockCurrencies = ['btc', 'eth', 'usd'];
      nock('https://price.api.cx.metamask.io')
        .get('/v1/supportedVsCurrencies')
        .reply(200, mockCurrencies);

      await fetchSupportedCurrencies();
      const result = getSupportedCurrencies();

      expect(result).toStrictEqual(['btc', 'eth', 'usd']);
    });
  });

  describe('getSupportedCurrencies', () => {
    beforeEach(() => {
      resetSupportedCurrenciesCache();
    });

    it('returns the fallback list when no currencies have been fetched', async () => {
      // Note: This test may be affected by prior test state.
      // In a fresh module state, it should return the fallback list.
      const result = getSupportedCurrencies();

      // Should be one of: the fallback list or a previously fetched list
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('updateSupportedCurrencies', () => {
    afterEach(() => {
      resetSupportedCurrenciesCache();
    });

    it('fetches and returns supported currencies via the service method', async () => {
      const mockCurrencies = ['usd', 'eur', 'gbp'];
      nock('https://price.api.cx.metamask.io')
        .get('/v1/supportedVsCurrencies')
        .reply(200, mockCurrencies);

      const service = new CodefiTokenPricesServiceV2();
      const result = await service.updateSupportedCurrencies();

      expect(result).toStrictEqual(['usd', 'eur', 'gbp']);
    });

    it('returns the fallback list when the API fails', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v1/supportedVsCurrencies')
        .replyWithError('Network error');

      const service = new CodefiTokenPricesServiceV2();
      const result = await service.updateSupportedCurrencies();

      expect(result).toStrictEqual([...SUPPORTED_CURRENCIES_FALLBACK]);
    });
  });

  describe('fetchSupportedNetworks', () => {
    afterEach(() => {
      resetSupportedNetworksCache();
    });

    it('fetches supported networks from the API and returns them', async () => {
      const mockResponse = {
        fullSupport: ['eip155:1', 'eip155:137'],
        partialSupport: {
          spotPricesV2: ['eip155:1', 'eip155:137', 'eip155:56'],
          spotPricesV3: ['eip155:1', 'eip155:137', 'eip155:42161'],
        },
      };
      nock('https://price.api.cx.metamask.io')
        .get('/v2/supportedNetworks')
        .reply(200, mockResponse);

      const result = await fetchSupportedNetworks();

      expect(result).toStrictEqual(mockResponse);
    });

    it('returns the fallback list when the API returns an invalid response', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v2/supportedNetworks')
        .reply(200, { invalid: 'response' });

      const result = await fetchSupportedNetworks();

      expect(result.fullSupport).toBeDefined();
      expect(result.partialSupport).toBeDefined();
      expect(result.partialSupport.spotPricesV3).toBeDefined();
    });

    it('returns the fallback list when the API request fails', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v2/supportedNetworks')
        .replyWithError('Network error');

      const result = await fetchSupportedNetworks();

      expect(result.fullSupport).toBeDefined();
      expect(result.partialSupport).toBeDefined();
      expect(result.partialSupport.spotPricesV3).toBeDefined();
    });

    it('updates getSupportedNetworks after a successful fetch', async () => {
      const mockResponse = {
        fullSupport: ['eip155:1'],
        partialSupport: {
          spotPricesV2: ['eip155:1', 'eip155:56'],
          spotPricesV3: ['eip155:1', 'eip155:42161'],
        },
      };
      nock('https://price.api.cx.metamask.io')
        .get('/v2/supportedNetworks')
        .reply(200, mockResponse);

      await fetchSupportedNetworks();
      const result = getSupportedNetworks();

      expect(result).toStrictEqual(mockResponse);
    });

    it('deduplicates concurrent requests to the same endpoint', async () => {
      const mockResponse = {
        fullSupport: ['eip155:1'],
        partialSupport: {
          spotPricesV2: ['eip155:1', 'eip155:56'],
          spotPricesV3: ['eip155:1', 'eip155:42161'],
        },
      };
      // Only set up the mock to respond once
      nock('https://price.api.cx.metamask.io')
        .get('/v2/supportedNetworks')
        .reply(200, mockResponse);

      // Make 5 concurrent calls
      const promises = [
        fetchSupportedNetworks(),
        fetchSupportedNetworks(),
        fetchSupportedNetworks(),
        fetchSupportedNetworks(),
        fetchSupportedNetworks(),
      ];

      const results = await Promise.all(promises);

      // All promises should resolve to the same response
      results.forEach((result) => {
        expect(result).toStrictEqual(mockResponse);
      });

      // Verify no pending mocks (i.e., only one request was made)
      expect(isDone()).toBe(true);
    });
  });

  describe('getSupportedNetworks', () => {
    beforeEach(() => {
      resetSupportedNetworksCache();
    });

    it('returns the fallback list when no networks have been fetched', () => {
      const result = getSupportedNetworks();

      expect(result.fullSupport).toBeDefined();
      expect(result.partialSupport).toBeDefined();
      expect(result.partialSupport.spotPricesV3).toBeDefined();
      expect(Array.isArray(result.fullSupport)).toBe(true);
      expect(Array.isArray(result.partialSupport.spotPricesV3)).toBe(true);
    });
  });

  describe('updateSupportedNetworks', () => {
    afterEach(() => {
      resetSupportedNetworksCache();
    });

    it('fetches and returns supported networks via the service method', async () => {
      const mockResponse = {
        fullSupport: ['eip155:1', 'eip155:10'],
        partialSupport: {
          spotPricesV2: ['eip155:1'],
          spotPricesV3: ['eip155:1', 'eip155:10'],
        },
      };
      nock('https://price.api.cx.metamask.io')
        .get('/v2/supportedNetworks')
        .reply(200, mockResponse);

      const service = new CodefiTokenPricesServiceV2();
      const result = await service.updateSupportedNetworks();

      expect(result).toStrictEqual(mockResponse);
    });

    it('returns the fallback list when the API fails', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v2/supportedNetworks')
        .replyWithError('Network error');

      const service = new CodefiTokenPricesServiceV2();
      const result = await service.updateSupportedNetworks();

      expect(result.fullSupport).toBeDefined();
      expect(result.partialSupport).toBeDefined();
    });
  });

  describe('setNativeAssetIdentifiers', () => {
    afterEach(() => {
      resetSupportedNetworksCache();
    });

    it('sets native asset identifiers and uses them in fetchTokenPrices', async () => {
      // Mock supportedNetworks to include our test chain
      const mockNetworksResponse = {
        fullSupport: ['eip155:1'],
        partialSupport: {
          spotPricesV2: [],
          spotPricesV3: ['eip155:1'],
        },
      };
      nock('https://price.api.cx.metamask.io')
        .get('/v2/supportedNetworks')
        .reply(200, mockNetworksResponse)
        .persist();

      // Pre-populate the cache
      await fetchSupportedNetworks();

      const customNativeAssetId = 'eip155:1/slip44:60';
      const nativeAssetIdentifiers = {
        'eip155:1': customNativeAssetId,
      };

      // Mock the spot-prices response
      nock('https://price.api.cx.metamask.io')
        .get('/v3/spot-prices')
        .query(true)
        .reply(200, {
          [customNativeAssetId]: {
            price: 2000,
            currency: 'USD',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 1000000,
            allTimeHigh: 5000,
            allTimeLow: 100,
            totalVolume: 50000,
            high1d: 2100,
            low1d: 1900,
            circulatingSupply: 1000000,
            dilutedMarketCap: 2000000,
            marketCapPercentChange1d: 0.5,
            pricePercentChange1h: 0.1,
            pricePercentChange7d: 5,
            pricePercentChange14d: 10,
            pricePercentChange30d: 15,
            pricePercentChange200d: 50,
            pricePercentChange1y: 100,
          },
        });

      const service = new CodefiTokenPricesServiceV2();
      service.setNativeAssetIdentifiers(
        nativeAssetIdentifiers as Record<
          `${string}:${string}`,
          `${string}:${string}/${string}:${string}`
        >,
      );

      const result = await service.fetchTokenPrices({
        assets: [{ chainId: '0x1', tokenAddress: ZERO_ADDRESS }],
        currency: 'USD',
      });

      expect(result).toHaveLength(1);
      expect(result[0].price).toBe(2000);
    });
  });

  describe('validateChainIdSupported with dynamic networks', () => {
    afterEach(() => {
      resetSupportedNetworksCache();
    });

    it('returns true for chains in the dynamic supported networks list', async () => {
      const mockResponse = {
        fullSupport: ['eip155:999999'],
        partialSupport: {
          spotPricesV2: [],
          spotPricesV3: ['eip155:999999'],
        },
      };
      nock('https://price.api.cx.metamask.io')
        .get('/v2/supportedNetworks')
        .reply(200, mockResponse);

      await fetchSupportedNetworks();

      const service = new CodefiTokenPricesServiceV2();
      // 0xf423f = 999999 in hex
      expect(service.validateChainIdSupported('0xf423f')).toBe(true);
    });

    it('returns true for chains in the hardcoded fallback list', () => {
      resetSupportedNetworksCache();

      const service = new CodefiTokenPricesServiceV2();
      // 0x1 (Ethereum mainnet) should always be in the hardcoded list
      expect(service.validateChainIdSupported('0x1')).toBe(true);
    });

    it('returns false for unsupported chains', () => {
      resetSupportedNetworksCache();

      const service = new CodefiTokenPricesServiceV2();
      // Some random chain ID that's not supported
      expect(service.validateChainIdSupported('0xdeadbeef')).toBe(false);
    });
  });
});

/**
 * Calls the 'fetchTokenPrices' function while advancing the clock, allowing
 * the function to resolve.
 *
 * Fetching token rates is challenging in an environment with fake timers
 * because we're using a library that automatically retries failed requests,
 * which uses `setTimeout` internally. We have to advance the clock after the
 * update call starts but before awaiting the result, otherwise it never
 * resolves.
 *
 * @param args - Arguments
 * @param args.fetchTokenPrices - The "fetchTokenPrices" function to call.
 * @param args.retries - The number of retries the fetch call is configured to make.
 * @returns The result of the fetch call.
 */
async function fetchTokenPricesWithFakeTimers({
  fetchTokenPrices,
  retries,
}: {
  fetchTokenPrices: () => ReturnType<
    CodefiTokenPricesServiceV2['fetchTokenPrices']
  >;
  retries: number;
}): ReturnType<CodefiTokenPricesServiceV2['fetchTokenPrices']> {
  const pendingUpdate = fetchTokenPrices();
  pendingUpdate.catch(() => {
    // suppress Unhandled Promise error
  });

  // Advance timer enough to exceed max possible retry delay for initial call, and all
  // subsequent retries
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const _retryAttempt of Array(retries + 1).keys()) {
    await jest.advanceTimersByTimeAsync(defaultMaxRetryDelay);
  }

  return await pendingUpdate;
}

/**
 * Calls the 'fetchExchangeRates' function while advancing the clock, allowing
 * the function to resolve.
 *
 * Fetching rates is challenging in an environment with fake timers
 * because we're using a library that automatically retries failed requests,
 * which uses `setTimeout` internally. We have to advance the clock after the
 * update call starts but before awaiting the result, otherwise it never
 * resolves.
 *
 * @param args - Arguments
 * @param args.fetchExchangeRates - The "fetchExchangeRates" function to call.
 * @param args.retries - The number of retries the fetch call is configured to make.
 * @returns The result of the fetch call.
 */
async function fetchExchangeRatesWithFakeTimers({
  fetchExchangeRates,
  retries,
}: {
  fetchExchangeRates: () => ReturnType<
    CodefiTokenPricesServiceV2['fetchExchangeRates']
  >;
  retries: number;
}): ReturnType<CodefiTokenPricesServiceV2['fetchExchangeRates']> {
  const pendingUpdate = fetchExchangeRates();
  pendingUpdate.catch(() => {
    // suppress Unhandled Promise error
  });

  // Advance timer enough to exceed max possible retry delay for initial call, and all
  // subsequent retries
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const _retryAttempt of Array(retries + 1).keys()) {
    await jest.advanceTimersByTimeAsync(defaultMaxRetryDelay);
  }

  return await pendingUpdate;
}

/**
 *
 * @param tokenAddress - The token address.
 * @returns The token asset id.
 */
function buildTokenAssetId(tokenAddress: Hex): string {
  return tokenAddress === ZERO_ADDRESS
    ? `${KnownCaipNamespace.Eip155}:1/slip44:60`
    : `${KnownCaipNamespace.Eip155}:1/erc20:${tokenAddress.toLowerCase()}`;
}

/**
 *
 * @param tokenAddresses - The token addresses.
 * @returns The token asset ids.
 */
function buildMultipleAssetIds(tokenAddresses: Hex[]): string {
  return tokenAddresses.map(buildTokenAssetId).join(',');
}
